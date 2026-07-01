import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} from 'baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import * as QRCode from 'qrcode'
import { log } from './logger.js'
import { useSupabaseAuthState } from './whatsapp-session-store.js'

const baileysLogger = pino({ level: 'warn' })

// ============================================
// Per-user WhatsApp session
// ============================================

export interface WAContact {
  jid: string
  name: string
  number: string
  notify?: string
  imgUrl?: string
}

export interface CachedMessage {
  id: string
  fromMe: boolean
  text: string
  timestamp: number
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'other'
  mediaUrl?: string
  mimetype?: string
  fileName?: string
}

export interface UserWhatsAppSession {
  sock: ReturnType<typeof makeWASocket> | null
  qrDataUrl: string | null
  connectedNumber: string | null
  status: 'disconnected' | 'connecting' | 'qr' | 'connected'
  startTime: number | null
  reconnectAttempts: number
  vendedorId: number
  contacts: WAContact[]
  chats: { jid: string; lastMsgTimestamp?: number; unreadCount?: number }[]
  messageStore: Map<string, CachedMessage[]>
  /** Raw proto messages keyed by message id — used by getMessage for decryption retries */
  rawMessages: Map<string, any>
  /** Maps @lid JIDs to @s.whatsapp.net JIDs */
  lidMap: Map<string, string>
}

export interface UserWhatsAppStatus {
  connected: boolean
  status: 'disconnected' | 'connecting' | 'qr' | 'connected'
  number: string | null
  uptime: number
  vendedorId: number
}

// ============================================
// Session Manager — manages N independent sessions
// ============================================

const MAX_RECONNECT = 3
const MAX_SESSIONS = 20
const INACTIVE_TIMEOUT = 24 * 60 * 60 * 1000 // 24h

const sessions = new Map<number, UserWhatsAppSession>()

// Cleanup inactive sessions every hour
let cleanupInterval: ReturnType<typeof setInterval> | null = null

/** Verifica se a tabela whatsapp_session existe no Supabase */
export async function checkWhatsAppSessionTable(): Promise<boolean> {
  try {
    const { supabase } = await import('./supabase.js')
    const { error } = await supabase.from('whatsapp_session').select('key').limit(1)
    if (error) {
      log.error({ error }, '❌ Tabela whatsapp_session NÃO existe no Supabase! Execute a migration 20250312000001_whatsapp_session.sql')
      return false
    }
    log.info('✅ Tabela whatsapp_session verificada')
    return true
  } catch (err) {
    log.error({ err }, '❌ Erro ao verificar tabela whatsapp_session')
    return false
  }
}

/** fetchLatestBaileysVersion com timeout de 10s */
async function fetchVersionSafe(): Promise<{ version: [number, number, number] }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const result = await fetchLatestBaileysVersion()
    return result
  } catch (err) {
    log.warn({ err }, 'Falha ao buscar versão Baileys, usando default')
    return { version: [2, 3000, 1015901307] as [number, number, number] }
  } finally {
    clearTimeout(timeout)
  }
}

export function startSessionCleanup(): void {
  if (cleanupInterval) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [vendedorId, session] of sessions) {
      if (session.status === 'connected' && session.startTime) {
        if (now - session.startTime > INACTIVE_TIMEOUT) {
          log.info(`⏰ Sessão WhatsApp do vendedor ${vendedorId} expirou (24h). Desconectando.`)
          disconnectUserWhatsApp(vendedorId).catch(() => {})
        }
      }
    }
  }, 60 * 60 * 1000) // every hour
}

export function stopSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}

function createEmptySession(vendedorId: number): UserWhatsAppSession {
  return {
    sock: null,
    qrDataUrl: null,
    connectedNumber: null,
    status: 'disconnected',
    startTime: null,
    reconnectAttempts: 0,
    vendedorId,
    contacts: [],
    chats: [],
    messageStore: new Map(),
    rawMessages: new Map(),
    lidMap: new Map(),
  }
}

export function getUserWhatsAppStatus(vendedorId: number): UserWhatsAppStatus {
  const session = sessions.get(vendedorId)
  if (!session) {
    return { connected: false, status: 'disconnected', number: null, uptime: 0, vendedorId }
  }
  return {
    connected: session.status === 'connected',
    status: session.status,
    number: session.connectedNumber,
    uptime: session.startTime ? Math.floor((Date.now() - session.startTime) / 1000) : 0,
    vendedorId,
  }
}

export function getUserQRDataUrl(vendedorId: number): string | null {
  return sessions.get(vendedorId)?.qrDataUrl ?? null
}

export function getAllUserSessions(): UserWhatsAppStatus[] {
  return Array.from(sessions.values()).map(s => ({
    connected: s.status === 'connected',
    status: s.status,
    number: s.connectedNumber,
    uptime: s.startTime ? Math.floor((Date.now() - s.startTime) / 1000) : 0,
    vendedorId: s.vendedorId,
  }))
}

export function getActiveSessionCount(): number {
  let count = 0
  for (const s of sessions.values()) {
    if (s.status === 'connected' || s.status === 'connecting' || s.status === 'qr') count++
  }
  return count
}

export async function disconnectUserWhatsApp(vendedorId: number): Promise<void> {
  const session = sessions.get(vendedorId)
  if (!session) return

  if (session.sock) {
    try {
      await session.sock.logout()
    } catch {
      // Ignore logout errors
    }
    session.sock.end(undefined)
    session.sock = null
  }

  session.qrDataUrl = null
  session.connectedNumber = null
  session.status = 'disconnected'
  session.startTime = null
  session.reconnectAttempts = 0

  // Clear session from Supabase
  try {
    const { clearSession } = await useSupabaseAuthState(`user_${vendedorId}`)
    await clearSession()
  } catch {
    // Ignore
  }

  sessions.delete(vendedorId)
  log.info(`🔴 WhatsApp do vendedor ${vendedorId} desconectado`)
}

export async function disconnectAllSessions(): Promise<void> {
  const ids = Array.from(sessions.keys())
  for (const id of ids) {
    await disconnectUserWhatsApp(id).catch(() => {})
  }
}

/** Normaliza telefone para formato WhatsApp brasileiro: 55 + DDD + número */
export function formatBrazilianPhone(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (!d) return ''
  // Remove prefixo de tronco (0XX)
  if (d.startsWith('0') && !d.startsWith('00')) d = d.slice(1)
  // Já tem código de país 55 e tamanho correto (12=fixo, 13=celular)
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) {
    return d
  }
  // DDD + número (10=fixo, 11=celular) → adicionar 55
  if (d.length >= 10 && d.length <= 11) {
    return `55${d}`
  }
  // Número curto sem DDD — fallback
  if (d.length >= 8 && d.length <= 9) {
    return `55${d}`
  }
  return d
}

/**
 * Gera variações de um número brasileiro para tentar encontrar no WhatsApp.
 * Lida com o problema do 9º dígito: celulares brasileiros podem estar
 * cadastrados COM ou SEM o 9 extra dependendo de quando a conta foi criada.
 */
export function generateBrazilianPhoneVariations(formatted: string): string[] {
  const variations = [formatted]
  // Precisa começar com 55 e ter DDD (2 dígitos após 55)
  if (!formatted.startsWith('55') || formatted.length < 12) return variations

  const ddd = formatted.slice(2, 4)
  const localNumber = formatted.slice(4)

  if (localNumber.length === 9 && localNumber.startsWith('9')) {
    // Tem 9º dígito → tentar SEM (remover o 9 extra)
    const semNono = `55${ddd}${localNumber.slice(1)}`
    variations.push(semNono)
  } else if (localNumber.length === 8 && /^[6-9]/.test(localNumber)) {
    // Celular antigo sem 9º dígito (começa com 6-9) → tentar COM 9
    // Fixos começam com 2-5, não devem receber o 9
    const comNono = `55${ddd}9${localNumber}`
    variations.push(comNono)
  }

  return variations
}

/**
 * Resolve o JID correto de um número usando Baileys onWhatsApp().
 * Tenta o número formatado e variações com/sem 9º dígito.
 * Retorna o JID validado ou null se não encontrar.
 */
export async function resolveWhatsAppJid(
  sock: ReturnType<typeof import('baileys').default>,
  rawNumber: string
): Promise<{ jid: string; exists: boolean; number: string; lid?: string } | null> {
  const formatted = formatBrazilianPhone(rawNumber)
  if (!formatted) return null

  const variations = generateBrazilianPhoneVariations(formatted)

  for (const num of variations) {
    try {
      const results = await sock.onWhatsApp(num)
      const result = results?.[0]
      if (result?.exists) {
        const phoneJid = `${num}@s.whatsapp.net`
        let lid: string | undefined
        // Baileys 7 pode retornar JID @lid — sempre enviar para @s.whatsapp.net
        if (result.jid && result.jid.endsWith('@lid')) {
          lid = result.jid
          log.info(`🔗 onWhatsApp retornou LID ${lid} para ${num}, usando ${phoneJid}`)
        }
        log.info(`✅ Número ${rawNumber} → validado como ${phoneJid}`)
        return {
          jid: phoneJid,
          exists: true,
          number: num,
          lid,
        }
      }
    } catch (err) {
      log.warn({ err, num }, `⚠️ Erro ao verificar ${num} no WhatsApp`)
    }
  }

  log.warn(`❌ Número ${rawNumber} (variações: ${variations.join(', ')}) não encontrado no WhatsApp`)
  return null
}

/** Verifica se um número existe no WhatsApp (endpoint público) */
export async function checkNumberOnWhatsApp(
  vendedorId: number,
  rawNumber: string
): Promise<{ exists: boolean; jid?: string; number?: string; error?: string }> {
  const session = sessions.get(vendedorId)
  if (!session || !session.sock || session.status !== 'connected') {
    return { exists: false, error: 'WhatsApp não está conectado' }
  }
  const result = await resolveWhatsAppJid(session.sock, rawNumber)
  if (result) {
    return { exists: true, jid: result.jid, number: result.number }
  }
  return { exists: false, error: `Número ${rawNumber} não está cadastrado no WhatsApp` }
}

/**
 * Valida em lote todos os números de telefone dos clientes no WhatsApp.
 * Para cada cliente que tem telefone/celular/whatsapp, verifica se o número
 * existe no WhatsApp e salva o resultado no banco (whatsapp_valido, whatsapp_jid).
 * Retorna estatísticas da validação.
 */
export async function validateContactsOnWhatsApp(
  vendedorId: number
): Promise<{ total: number; valid: number; invalid: number; errors: number; details: Array<{ clienteId: number; nome: string; number: string; valid: boolean; jid?: string }> }> {
  const session = sessions.get(vendedorId)
  if (!session || !session.sock || session.status !== 'connected') {
    throw new Error('WhatsApp não está conectado')
  }

  const { supabase } = await import('./supabase.js')

  // Buscar todos os clientes que têm algum telefone
  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, razao_social, contato_nome, whatsapp, contato_celular, contato_telefone')
    .or('whatsapp.neq.,contato_celular.neq.,contato_telefone.neq.')

  if (error) throw error
  if (!clientes || clientes.length === 0) {
    return { total: 0, valid: 0, invalid: 0, errors: 0, details: [] }
  }

  let valid = 0
  let invalid = 0
  let errors = 0
  const details: Array<{ clienteId: number; nome: string; number: string; valid: boolean; jid?: string }> = []

  for (const cliente of clientes) {
    const rawNumber = cliente.whatsapp || cliente.contato_celular || cliente.contato_telefone || ''
    if (!rawNumber || rawNumber.replace(/\D/g, '').length < 8) {
      continue // Pular números muito curtos
    }

    try {
      const result = await resolveWhatsAppJid(session.sock!, rawNumber)

      if (result) {
        valid++
        // Salvar resultado positivo no banco
        await supabase.from('clientes').update({
          whatsapp_valido: true,
          whatsapp_jid: result.jid,
          whatsapp_validado_em: new Date().toISOString(),
        }).eq('id', cliente.id)

        details.push({
          clienteId: cliente.id,
          nome: cliente.contato_nome || cliente.razao_social,
          number: rawNumber,
          valid: true,
          jid: result.jid,
        })
      } else {
        invalid++
        await supabase.from('clientes').update({
          whatsapp_valido: false,
          whatsapp_jid: null,
          whatsapp_validado_em: new Date().toISOString(),
        }).eq('id', cliente.id)

        details.push({
          clienteId: cliente.id,
          nome: cliente.contato_nome || cliente.razao_social,
          number: rawNumber,
          valid: false,
        })
      }

      // Rate limit: esperar 500ms entre verificações para não sobrecarregar WhatsApp
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (err) {
      errors++
      log.warn({ err, clienteId: cliente.id }, 'Erro ao validar número do cliente')
    }
  }

  log.info(`📋 Validação em lote: ${clientes.length} clientes, ${valid} válidos, ${invalid} inválidos, ${errors} erros`)
  return { total: clientes.length, valid, invalid, errors, details }
}

export async function sendUserWhatsAppMessage(
  vendedorId: number,
  number: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const session = sessions.get(vendedorId)
  if (!session || !session.sock || session.status !== 'connected') {
    return { success: false, error: 'WhatsApp não está conectado para este usuário' }
  }
  try {
    // Tentar resolver JID via onWhatsApp; se falhar, usar número formatado direto
    let jid: string
    try {
      const resolved = await resolveWhatsAppJid(session.sock, number)
      jid = resolved ? resolved.jid : formatBrazilianPhone(number) + '@s.whatsapp.net'
      // Store LID→phone mapping so resolveJid can resolve echoed messages
      if (resolved?.lid && resolved.jid) {
        session.lidMap.set(resolved.lid, resolved.jid)
        log.info(`🔗 Stored LID mapping: ${resolved.lid} → ${resolved.jid}`)
      }
      if (!resolved) log.warn(`⚠️ resolveWhatsAppJid falhou para ${number}, enviando direto para ${jid}`)
    } catch {
      jid = formatBrazilianPhone(number) + '@s.whatsapp.net'
      log.warn(`⚠️ Erro no resolveWhatsAppJid para ${number}, fallback para ${jid}`)
    }
    log.info(`📤 Enviando mensagem para ${jid} (número original: ${number})`)
    // Retry logic: first send to a new contact may fail with 463 (missing tctoken).
    // Baileys automatically issues the token after the failed send, so retry after 2s.
    try {
      await session.sock.sendMessage(jid, { text })
      return { success: true }
    } catch (err1: any) {
      const is463 = err1?.message?.includes('463') || err1?.data?.status === 463
      if (!is463) throw err1
      log.warn(`⚠️ Erro 463 (tctoken) no primeiro envio para ${jid}, aguardando 2s e tentando novamente...`)
      await new Promise(r => setTimeout(r, 2000))
      await session.sock.sendMessage(jid, { text })
      log.info(`✅ Segunda tentativa de envio para ${jid} bem-sucedida`)
      return { success: true }
    }
  } catch (err: any) {
    log.error({ err, number }, `❌ Falha ao enviar mensagem para ${number}`)
    return { success: false, error: err?.message || 'Erro ao enviar mensagem' }
  }
}

/** Busca contatos do WhatsApp do vendedor (Baileys + DB fallback) */
export async function getUserWhatsAppContacts(vendedorId: number): Promise<WAContact[]> {
  const session = sessions.get(vendedorId)
  if (!session || session.status !== 'connected') return []

  const baileysContacts = session.contacts

  // If Baileys has enough contacts, return them directly
  if (baileysContacts.length >= 5) return baileysContacts

  // Fallback: also include validated CRM clients from DB
  try {
    const { supabase } = await import('./supabase.js')
    const { data: dbClients } = await supabase
      .from('clientes')
      .select('razao_social, contato_nome, whatsapp_jid, contato_celular, contato_telefone, whatsapp')
      .eq('whatsapp_valido', true)
      .not('whatsapp_jid', 'is', null)
      .limit(500)

    if (dbClients && dbClients.length > 0) {
      const existingJids = new Set(baileysContacts.map(c => c.jid))
      for (const c of dbClients) {
        if (!c.whatsapp_jid || existingJids.has(c.whatsapp_jid)) continue
        const num = c.whatsapp_jid.replace('@s.whatsapp.net', '')
        baileysContacts.push({
          jid: c.whatsapp_jid,
          name: c.contato_nome || c.razao_social || num,
          number: num,
        })
        existingJids.add(c.whatsapp_jid)
      }
    }
  } catch (err) {
    log.warn({ err }, 'Falha ao buscar contatos validados do DB')
  }

  return baileysContacts
}

/** Busca chats recentes do vendedor */
export function getUserWhatsAppChats(vendedorId: number): { jid: string; lastMsgTimestamp?: number; unreadCount?: number }[] {
  const session = sessions.get(vendedorId)
  if (!session || session.status !== 'connected') return []
  return session.chats
}

/** Extrai texto de qualquer tipo de mensagem Baileys */
function extractMessageContent(msg: any): { text: string; type: CachedMessage['type']; mimetype?: string; fileName?: string } {
  if (!msg?.message) return { text: '', type: 'other' }
  const m = msg.message
  if (m.conversation) return { text: m.conversation, type: 'text' }
  if (m.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, type: 'text' }
  if (m.imageMessage) return { text: m.imageMessage.caption || '📷 Imagem', type: 'image', mimetype: m.imageMessage.mimetype }
  if (m.videoMessage) return { text: m.videoMessage.caption || '🎥 Vídeo', type: 'video', mimetype: m.videoMessage.mimetype }
  if (m.audioMessage) return { text: '🎤 Áudio', type: 'audio', mimetype: m.audioMessage.mimetype }
  if (m.documentMessage) return { text: `📎 ${m.documentMessage.fileName || 'Documento'}`, type: 'document', mimetype: m.documentMessage.mimetype, fileName: m.documentMessage.fileName }
  if (m.stickerMessage) return { text: '🏷️ Sticker', type: 'sticker', mimetype: m.stickerMessage.mimetype }
  if (m.contactMessage) return { text: `👤 ${m.contactMessage.displayName || 'Contato'}`, type: 'other' }
  if (m.locationMessage) return { text: '📍 Localização', type: 'other' }
  return { text: '', type: 'other' }
}

/** Armazena mensagem no cache in-memory da sessão */
export function cacheMessage(session: UserWhatsAppSession, jid: string, msg: any): void {
  const { text, type, mimetype, fileName } = extractMessageContent(msg)
  if (!text) return

  const ts = msg.messageTimestamp
    ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any)?.low || 0)
    : Math.floor(Date.now() / 1000)

  const cached: CachedMessage = {
    id: msg.key?.id || `${Date.now()}-${Math.random()}`,
    fromMe: !!msg.key?.fromMe,
    text,
    timestamp: ts,
    type,
    mimetype,
    fileName,
  }

  const MAX_PER_CHAT = 200
  let chatMsgs = session.messageStore.get(jid)
  if (!chatMsgs) {
    chatMsgs = []
    session.messageStore.set(jid, chatMsgs)
  }
  // Avoid duplicates by id
  if (!chatMsgs.find(m => m.id === cached.id)) {
    chatMsgs.push(cached)
    // Keep only last N messages per chat
    if (chatMsgs.length > MAX_PER_CHAT) {
      chatMsgs.splice(0, chatMsgs.length - MAX_PER_CHAT)
    }
  }

  // Download media asynchronously and attach base64 data URL
  if (type !== 'text' && type !== 'other' && msg.message) {
    downloadMediaForCache(msg, cached).catch(() => {})
  }
}

/** Downloads media from a Baileys message and attaches base64 data URL to cached message */
async function downloadMediaForCache(msg: any, cached: CachedMessage): Promise<void> {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {})
    if (buffer && buffer.length > 0 && buffer.length < 10_000_000) {
      const mime = cached.mimetype || 'application/octet-stream'
      cached.mediaUrl = `data:${mime};base64,${(buffer as Buffer).toString('base64')}`
    }
  } catch (err) {
    // Media download can fail for old/expired messages — not critical
  }
}

/** Retorna sessão WhatsApp de um vendedor (para cache externo) */
export function getUserWhatsAppSession(vendedorId: number): UserWhatsAppSession | undefined {
  return sessions.get(vendedorId)
}

/** Busca mensagens de um chat específico do cache in-memory */
export function getUserWhatsAppChatMessages(vendedorId: number, jid: string, limit = 100): CachedMessage[] {
  const session = sessions.get(vendedorId)
  if (!session) return []
  const msgs = session.messageStore.get(jid) || []
  // Sort by timestamp ascending
  const sorted = [...msgs].sort((a, b) => a.timestamp - b.timestamp)
  return sorted.slice(-limit)
}

/** Envia áudio via WhatsApp do vendedor (aceita Buffer base64) */
export async function sendUserWhatsAppAudio(
  vendedorId: number,
  number: string,
  audioBase64: string,
  mimetype: string = 'audio/ogg; codecs=opus'
): Promise<{ success: boolean; error?: string }> {
  const session = sessions.get(vendedorId)
  if (!session || !session.sock || session.status !== 'connected') {
    return { success: false, error: 'WhatsApp não está conectado para este usuário' }
  }
  try {
    let jid: string
    try {
      const resolved = await resolveWhatsAppJid(session.sock, number)
      jid = resolved ? resolved.jid : formatBrazilianPhone(number) + '@s.whatsapp.net'
      if (resolved?.lid && resolved.jid) {
        session.lidMap.set(resolved.lid, resolved.jid)
      }
    } catch {
      jid = formatBrazilianPhone(number) + '@s.whatsapp.net'
    }
    const buffer = Buffer.from(audioBase64, 'base64')
    try {
      await session.sock.sendMessage(jid, {
        audio: buffer,
        mimetype,
        ptt: true,
      })
      return { success: true }
    } catch (err1: any) {
      const is463 = err1?.message?.includes('463') || err1?.data?.status === 463
      if (!is463) throw err1
      log.warn(`⚠️ Erro 463 (tctoken) no primeiro envio de áudio para ${jid}, retry em 2s...`)
      await new Promise(r => setTimeout(r, 2000))
      await session.sock.sendMessage(jid, {
        audio: buffer,
        mimetype,
        ptt: true,
      })
      return { success: true }
    }
  } catch (err: any) {
    log.error({ err, number }, `❌ Falha ao enviar áudio para ${number}`)
    return { success: false, error: err?.message || 'Erro ao enviar áudio' }
  }
}

/** Envia imagem via WhatsApp do vendedor (aceita Buffer base64) */
export async function sendUserWhatsAppImage(
  vendedorId: number,
  number: string,
  imageBase64: string,
  mimetype: string = 'image/jpeg',
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  const session = sessions.get(vendedorId)
  if (!session || !session.sock || session.status !== 'connected') {
    return { success: false, error: 'WhatsApp não está conectado para este usuário' }
  }
  try {
    let jid: string
    try {
      const resolved = await resolveWhatsAppJid(session.sock, number)
      jid = resolved ? resolved.jid : formatBrazilianPhone(number) + '@s.whatsapp.net'
      if (resolved?.lid && resolved.jid) {
        session.lidMap.set(resolved.lid, resolved.jid)
      }
    } catch {
      jid = formatBrazilianPhone(number) + '@s.whatsapp.net'
    }
    const buffer = Buffer.from(imageBase64, 'base64')
    try {
      await session.sock.sendMessage(jid, {
        image: buffer,
        mimetype,
        caption: caption || undefined,
      })
      return { success: true }
    } catch (err1: any) {
      const is463 = err1?.message?.includes('463') || err1?.data?.status === 463
      if (!is463) throw err1
      log.warn(`⚠️ Erro 463 (tctoken) no primeiro envio de imagem para ${jid}, retry em 2s...`)
      await new Promise(r => setTimeout(r, 2000))
      await session.sock.sendMessage(jid, {
        image: buffer,
        mimetype,
        caption: caption || undefined,
      })
      return { success: true }
    }
  } catch (err: any) {
    log.error({ err, number }, `❌ Falha ao enviar imagem para ${number}`)
    return { success: false, error: err?.message || 'Erro ao enviar imagem' }
  }
}

export async function connectUserWhatsApp(vendedorId: number): Promise<void> {
  const existing = sessions.get(vendedorId)
  if (existing && existing.status === 'connected') {
    log.warn(`WhatsApp do vendedor ${vendedorId} já está conectado`)
    return
  }

  // Se já está "connecting" ou "qr", limpar antes de reconectar
  if (existing && (existing.status === 'connecting' || existing.status === 'qr')) {
    if (existing.sock) {
      try { existing.sock.end(undefined) } catch { /* ignore */ }
      existing.sock = null
    }
    sessions.delete(vendedorId)
  }

  // Check max sessions limit
  if (getActiveSessionCount() >= MAX_SESSIONS) {
    throw new Error(`Limite de ${MAX_SESSIONS} sessões WhatsApp atingido. Desconecte uma sessão primeiro.`)
  }

  const session = createEmptySession(vendedorId)
  session.status = 'connecting'
  sessions.set(vendedorId, session)

  log.info(`📱 Iniciando conexão WhatsApp para vendedor ${vendedorId}...`)

  try {
    // Tentar restaurar sessão existente; se não houver, gerar creds frescas (QR novo)
    const { state, saveCreds, clearSession } = await useSupabaseAuthState(`user_${vendedorId}`)
    const hasSavedCreds = !!state.creds.registered
    log.info(`🔑 Vendedor ${vendedorId}: sessão salva=${hasSavedCreds}`)

    const { version } = await fetchVersionSafe()
    log.info({ version }, `📡 Versão Baileys para vendedor ${vendedorId}`)

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      logger: baileysLogger,
      browser: ['CRM MF Paris', 'Chrome', '127.0.0.1'],
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 30_000,
      retryRequestDelayMs: 250,
      syncFullHistory: true,
      // Necessário para reenviar mensagens quando o destinatário pede retry
      // (sem isso o WhatsApp do destinatário fica preso em "Aguardando esta mensagem")
      getMessage: async (key) => {
        const id = key?.id
        if (id && session.rawMessages.has(id)) {
          return session.rawMessages.get(id)?.message || undefined
        }
        return undefined
      },
    })

    session.sock = sock

    // QR Code & connection events
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        session.status = 'qr'
        session.qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 })
        log.info(`📷 QR Code gerado para vendedor ${vendedorId}`)
      }

      if (connection === 'close') {
        session.qrDataUrl = null
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode
        const errorMsg = (lastDisconnect?.error as Boom)?.message || 'unknown'
        log.info(`🔴 WhatsApp do vendedor ${vendedorId} desconectou (reason: ${reason}, msg: ${errorMsg})`)

        const isLoggedOut = reason === DisconnectReason.loggedOut
        const isRestartRequired = reason === DisconnectReason.restartRequired

        if (isLoggedOut) {
          // Logout real: limpar sessão e exigir novo QR
          log.info(`🚪 Vendedor ${vendedorId} fez logout — limpando sessão`)
          try { await clearSession() } catch { /* ignore */ }
          session.status = 'disconnected'
          session.connectedNumber = null
          session.startTime = null
          session.reconnectAttempts = 0
          if (session.sock) {
            try { session.sock.end(undefined) } catch { /* ignore */ }
            session.sock = null
          }
          sessions.delete(vendedorId)
        } else if (isRestartRequired || session.reconnectAttempts < MAX_RECONNECT) {
          // Desconexão temporária: reconectar com credenciais salvas
          session.reconnectAttempts++
          log.info(`🔄 Reconectando vendedor ${vendedorId} (tentativa ${session.reconnectAttempts}/${MAX_RECONNECT})...`)
          if (session.sock) {
            try { session.sock.end(undefined) } catch { /* ignore */ }
            session.sock = null
          }
          sessions.delete(vendedorId)
          // Delay antes de reconectar
          setTimeout(() => {
            connectUserWhatsApp(vendedorId).catch(err => {
              log.error({ err }, `Falha ao reconectar vendedor ${vendedorId}`)
            })
          }, 2000)
        } else {
          // Esgotou tentativas de reconexão
          log.warn(`⚠️ Vendedor ${vendedorId}: máximo de reconexões atingido`)
          session.status = 'disconnected'
          session.connectedNumber = null
          session.startTime = null
          session.reconnectAttempts = 0
          if (session.sock) {
            try { session.sock.end(undefined) } catch { /* ignore */ }
            session.sock = null
          }
          sessions.delete(vendedorId)
        }
      }

      if (connection === 'open') {
        session.status = 'connected'
        session.qrDataUrl = null
        session.reconnectAttempts = 0
        session.startTime = Date.now()

        const me = sock?.user
        if (me) {
          session.connectedNumber = me.id.split(':')[0].split('@')[0]
          log.info(`✅ WhatsApp do vendedor ${vendedorId} conectado! Número: ${session.connectedNumber}`)
        }

        // Auto-validation removed: was too heavy (1369 clients × 500ms = 11min blocking).
        // Validation is now manual-only via the validate-contacts endpoint.
      }
    })

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds)

    // ── Contacts & Chats sync ──
    // Helper: verifica se JID é um contato individual válido (não grupo, broadcast, ou LID)
    const isValidContactJid = (jid: string): boolean => {
      if (!jid) return false
      if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@lid')) return false
      if (!jid.endsWith('@s.whatsapp.net')) return false
      return true
    }

    const upsertContacts = (contactsRaw: any[]) => {
      for (const c of contactsRaw) {
        if (!isValidContactJid(c.id)) continue
        const num = c.id.replace('@s.whatsapp.net', '')
        const name = c.name || c.notify || c.verifiedName || num
        const existing = session.contacts.find(x => x.jid === c.id)
        if (existing) {
          if (c.name) existing.name = c.name
          if (c.notify) existing.notify = c.notify
        } else {
          session.contacts.push({ jid: c.id, name, number: num, notify: c.notify })
        }
      }
    }

    sock.ev.on('contacts.upsert', (contacts) => {
      log.info(`📇 Vendedor ${vendedorId}: ${contacts.length} contatos recebidos (upsert)`)
      upsertContacts(contacts)
    })

    sock.ev.on('contacts.update', (updates) => {
      upsertContacts(updates)
    })

    sock.ev.on('chats.upsert', (chats) => {
      for (const chat of chats) {
        const chatId = chat.id
        if (!chatId || !isValidContactJid(chatId)) continue
        const existing = session.chats.find(x => x.jid === chatId)
        const ts = typeof chat.conversationTimestamp === 'number'
          ? chat.conversationTimestamp
          : typeof chat.conversationTimestamp === 'object' && chat.conversationTimestamp?.low
            ? chat.conversationTimestamp.low
            : undefined
        if (existing) {
          if (ts) existing.lastMsgTimestamp = ts
          existing.unreadCount = chat.unreadCount ?? existing.unreadCount
        } else {
          session.chats.push({
            jid: chatId,
            lastMsgTimestamp: ts,
            unreadCount: chat.unreadCount ?? 0,
          })
        }
        // Also ensure this chat has a contact entry
        const num = chatId.replace('@s.whatsapp.net', '')
        if (!session.contacts.find(x => x.jid === chatId)) {
          session.contacts.push({ jid: chatId, name: (chat as any).name || num, number: num })
        }
      }
      log.info(`💬 Vendedor ${vendedorId}: ${chats.length} chats recebidos (total: ${session.chats.length})`)
    })

    sock.ev.on('chats.update', (updates) => {
      for (const u of updates) {
        if (!u.id) continue
        const existing = session.chats.find(x => x.jid === u.id)
        if (existing) {
          if (u.unreadCount !== undefined && u.unreadCount !== null) existing.unreadCount = u.unreadCount
          const ts = typeof u.conversationTimestamp === 'number'
            ? u.conversationTimestamp
            : typeof u.conversationTimestamp === 'object' && (u.conversationTimestamp as any)?.low
              ? (u.conversationTimestamp as any).low
              : undefined
          if (ts) existing.lastMsgTimestamp = ts
        }
      }
    })

    // messaging-history.set fires when Baileys syncs history on reconnect
    sock.ev.on('messaging-history.set', ({ contacts: syncContacts, chats: syncChats, messages: syncMessages }: any) => {
      if (syncContacts) {
        log.info(`📇 Vendedor ${vendedorId}: history sync — ${syncContacts.length} contatos`)
        upsertContacts(syncContacts)
      }
      if (syncChats) {
        for (const chat of syncChats) {
          if (!isValidContactJid(chat.id)) continue
          const ts = typeof chat.conversationTimestamp === 'number'
            ? chat.conversationTimestamp
            : typeof chat.conversationTimestamp === 'object' && (chat.conversationTimestamp as any)?.low
              ? (chat.conversationTimestamp as any).low
              : undefined
          if (!session.chats.find(x => x.jid === chat.id)) {
            session.chats.push({ jid: chat.id, lastMsgTimestamp: ts, unreadCount: chat.unreadCount ?? 0 })
          }
          if (isValidContactJid(chat.id)) {
            const num = chat.id.replace('@s.whatsapp.net', '')
            if (!session.contacts.find(x => x.jid === chat.id)) {
              session.contacts.push({ jid: chat.id, name: (chat as any).name || num, number: num })
            }
          }
        }
        log.info(`💬 Vendedor ${vendedorId}: history sync — ${syncChats.length} chats (total: ${session.chats.length})`)
      }
      // Cache messages from history sync (deferred to not block contact sync)
      if (syncMessages && Array.isArray(syncMessages) && syncMessages.length > 0) {
        log.info(`📨 Vendedor ${vendedorId}: history sync — ${syncMessages.length} mensagens recebidas, cacheando em background...`)
        // Process in next tick to not block contacts/chats sync
        setImmediate(() => {
          let msgCount = 0
          for (const msg of syncMessages) {
            const rawJid = msg.key?.remoteJid
            if (!rawJid) continue
            // Accept both @s.whatsapp.net and @lid
            if (rawJid.endsWith('@g.us') || rawJid.endsWith('@broadcast')) continue
            const jid = rawJid.endsWith('@s.whatsapp.net') ? rawJid : rawJid
            cacheMessage(session, jid, msg)
            msgCount++
          }
          if (msgCount > 0) {
            log.info(`📨 Vendedor ${vendedorId}: ${msgCount} mensagens cacheadas em background`)
          }
        })
      }
    })

    // Handle ALL messages — cache in memory + save new incoming to DB
    // LID→JID resolver: WhatsApp multi-device sends @lid JIDs instead of @s.whatsapp.net
    // Strips device suffix (:N) from JIDs so messages are cached under canonical JID
    const normalizeJid = (jid: string): string => {
      // Remove :N device suffix from @s.whatsapp.net JIDs (e.g. 5531...:0@s.whatsapp.net → 5531...@s.whatsapp.net)
      return jid.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
    }

    const resolveJid = async (msg: any): Promise<string | null> => {
      const raw = msg.key?.remoteJid
      if (!raw) return null
      // Standard WhatsApp JID
      if (raw.endsWith('@s.whatsapp.net')) return normalizeJid(raw)
      // LID JID — resolve to @s.whatsapp.net
      if (raw.endsWith('@lid')) {
        // 1. Check session lidMap cache
        const mapped = session.lidMap.get(raw)
        if (mapped) return mapped
        // 2. Try Baileys 7 signalRepository LID mapping store
        try {
          const pn = await sock.signalRepository?.lidMapping?.getPNForLID(raw)
          if (pn && pn.endsWith('@s.whatsapp.net')) {
            const normalized = normalizeJid(pn)
            session.lidMap.set(raw, normalized)
            log.info(`🔗 LID mapped via signalRepository: ${raw} → ${normalized}`)
            return normalized
          }
        } catch { /* ignore */ }
        // 3. Try senderPn field (Baileys 7 provides this for @lid messages)
        const senderPn = (msg as any).senderPn || (msg as any).key?.senderPn
        if (senderPn && senderPn.endsWith('@s.whatsapp.net')) {
          const normalized = normalizeJid(senderPn)
          session.lidMap.set(raw, normalized)
          log.info(`🔗 LID mapped via senderPn: ${raw} → ${normalized}`)
          return normalized
        }
        // 4. Try participant field
        const participant = msg.key?.participant || (msg as any).participant
        if (participant && participant.endsWith('@s.whatsapp.net')) {
          const normalized = normalizeJid(participant)
          session.lidMap.set(raw, normalized)
          log.info(`🔗 LID mapped: ${raw} → ${normalized}`)
          return normalized
        }
        // 5. Try to find matching contact by LID in contacts list
        for (const c of session.contacts) {
          if ((c as any).lid === raw) {
            const phoneJid = c.jid.endsWith('@s.whatsapp.net') ? c.jid : `${c.number}@s.whatsapp.net`
            const normalized = normalizeJid(phoneJid)
            session.lidMap.set(raw, normalized)
            log.info(`🔗 LID mapped via contacts: ${raw} → ${normalized}`)
            return normalized
          }
        }
        // 6. Cannot resolve — cache under LID key (won't be included in chat queries until mapped)
        log.warn(`⚠️ Could not resolve LID: ${raw} — caching under LID key (not included in chat queries until mapped)`)
        return raw
      }
      // Groups, broadcasts — skip
      if (raw.endsWith('@g.us') || raw.endsWith('@broadcast')) return null
      return raw
    }

    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      log.info(`📩 [messages.upsert] vendedor=${vendedorId} type=${type} count=${msgs.length}`)

      // Armazena proto cru para getMessage (retries de descriptografia)
      for (const msg of msgs) {
        const id = msg.key?.id
        if (id && msg.message) {
          session.rawMessages.set(id, msg)
          if (session.rawMessages.size > 1000) {
            const firstKey = session.rawMessages.keys().next().value
            if (firstKey) session.rawMessages.delete(firstKey)
          }
        }
      }

      // History sync (append) — cache in background, don't block event loop
      if (type !== 'notify') {
        setImmediate(async () => {
          for (const msg of msgs) {
            if (!msg.message) continue
            const jid = await resolveJid(msg)
            if (!jid) continue
            cacheMessage(session, jid, msg)
          }
        })
        return
      }

      // Real-time messages (notify) — cache + save to DB
      for (const msg of msgs) {
        const rawJid = msg.key?.remoteJid
        const jid = await resolveJid(msg)
        const fromMe = !!msg.key?.fromMe
        const hasMessage = !!msg.message
        log.info(`📩 [msg] vendedor=${vendedorId} rawJid=${rawJid} resolvedJid=${jid} fromMe=${fromMe} hasMessage=${hasMessage} participant=${msg.key?.participant || 'none'} msgKeys=${msg.message ? Object.keys(msg.message).join(',') : 'none'}`)

        if (!msg.message) continue
        if (!jid) {
          log.warn(`📩 [msg] SKIPPED — could not resolve jid: ${rawJid}`)
          continue
        }

        // Cache in memory for chat display — under resolved JID only
        cacheMessage(session, jid, msg)
        log.info(`📩 [msg] CACHED in session for jid=${jid}, store size=${session.messageStore.get(jid)?.length || 0}`)

        // Save incoming messages to DB
        if (msg.key.fromMe) continue
        const { text, type: msgType } = extractMessageContent(msg)
        if (!text.trim()) continue

        const senderNumber = jid.replace('@s.whatsapp.net', '').replace('@lid', '')
        log.info(`📩 [msg] SAVING to DB: sender=${senderNumber} type=${msgType} text=${text.substring(0, 50)}`)

        try {
          const { insertWhatsAppMessage, findClienteByPhone } = await import('./database.js')
          const cliente = await findClienteByPhone(senderNumber)
          await insertWhatsAppMessage({
            numero: senderNumber,
            clienteId: cliente?.id,
            vendedorId: vendedorId,
            direcao: 'recebida',
            mensagem: text.trim(),
            tipo: msgType,
          })
          log.info(`📩 [msg] SAVED to DB OK: sender=${senderNumber} clienteId=${cliente?.id}`)
        } catch (dbErr) {
          log.error({ err: dbErr }, `Erro ao salvar mensagem recebida (vendedor ${vendedorId})`)
        }
      }
    })
  } catch (err) {
    log.error({ err }, `Erro ao conectar WhatsApp do vendedor ${vendedorId}`)
    session.status = 'disconnected'
    sessions.delete(vendedorId)
    throw err
  }
}
