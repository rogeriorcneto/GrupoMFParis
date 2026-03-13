import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
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
    log.info(`📞 formatBrazilianPhone: "${phone}" → "${d}" (já com +55)`)
    return d
  }
  // DDD + número (10=fixo, 11=celular) → adicionar 55
  if (d.length >= 10 && d.length <= 11) {
    const result = `55${d}`
    log.info(`📞 formatBrazilianPhone: "${phone}" → "${result}" (adicionou 55)`)
    return result
  }
  // Número curto sem DDD — fallback
  if (d.length >= 8 && d.length <= 9) {
    const result = `55${d}`
    log.warn(`⚠️ formatBrazilianPhone: "${phone}" → "${result}" (sem DDD, pode estar errado)`)
    return result
  }
  log.warn(`⚠️ formatBrazilianPhone: "${phone}" → "${d}" (formato não reconhecido, ${d.length} dígitos)`)
  return d
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
    const jid = formatBrazilianPhone(number) + '@s.whatsapp.net'
    await session.sock.sendMessage(jid, { text })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao enviar mensagem' }
  }
}

/** Busca contatos do WhatsApp do vendedor (populados via eventos Baileys) */
export function getUserWhatsAppContacts(vendedorId: number): WAContact[] {
  const session = sessions.get(vendedorId)
  if (!session || session.status !== 'connected') return []
  return session.contacts
}

/** Busca chats recentes do vendedor */
export function getUserWhatsAppChats(vendedorId: number): { jid: string; lastMsgTimestamp?: number; unreadCount?: number }[] {
  const session = sessions.get(vendedorId)
  if (!session || session.status !== 'connected') return []
  return session.chats
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
    const jid = formatBrazilianPhone(number) + '@s.whatsapp.net'
    const buffer = Buffer.from(audioBase64, 'base64')
    await session.sock.sendMessage(jid, {
      audio: buffer,
      mimetype,
      ptt: true, // push-to-talk (aparece como mensagem de voz)
    })
    return { success: true }
  } catch (err: any) {
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
    const jid = formatBrazilianPhone(number) + '@s.whatsapp.net'
    const buffer = Buffer.from(imageBase64, 'base64')
    await session.sock.sendMessage(jid, {
      image: buffer,
      mimetype,
      caption: caption || undefined,
    })
    return { success: true }
  } catch (err: any) {
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
      }
    })

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds)

    // ── Contacts & Chats sync ──
    const upsertContacts = (contactsRaw: any[]) => {
      for (const c of contactsRaw) {
        if (!c.id || c.id.endsWith('@g.us') || c.id.endsWith('@broadcast')) continue
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
        if (!chat.id || chat.id.endsWith('@g.us') || chat.id.endsWith('@broadcast')) continue
        const existing = session.chats.find(x => x.jid === chat.id)
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
            jid: chat.id,
            lastMsgTimestamp: ts,
            unreadCount: chat.unreadCount ?? 0,
          })
        }
        // Also ensure this chat has a contact entry
        const num = chat.id.replace('@s.whatsapp.net', '')
        if (!session.contacts.find(x => x.jid === chat.id)) {
          session.contacts.push({ jid: chat.id, name: (chat as any).name || num, number: num })
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
    sock.ev.on('messaging-history.set', ({ contacts: syncContacts, chats: syncChats }) => {
      if (syncContacts) {
        log.info(`📇 Vendedor ${vendedorId}: history sync — ${syncContacts.length} contatos`)
        upsertContacts(syncContacts)
      }
      if (syncChats) {
        for (const chat of syncChats) {
          if (!chat.id || chat.id.endsWith('@g.us') || chat.id.endsWith('@broadcast')) continue
          const ts = typeof chat.conversationTimestamp === 'number'
            ? chat.conversationTimestamp
            : typeof chat.conversationTimestamp === 'object' && (chat.conversationTimestamp as any)?.low
              ? (chat.conversationTimestamp as any).low
              : undefined
          if (!session.chats.find(x => x.jid === chat.id)) {
            session.chats.push({ jid: chat.id, lastMsgTimestamp: ts, unreadCount: chat.unreadCount ?? 0 })
          }
          const num = chat.id.replace('@s.whatsapp.net', '')
          if (!session.contacts.find(x => x.jid === chat.id)) {
            session.contacts.push({ jid: chat.id, name: (chat as any).name || num, number: num })
          }
        }
        log.info(`💬 Vendedor ${vendedorId}: history sync — ${syncChats.length} chats (total: ${session.chats.length})`)
      }
    })

    // Handle incoming messages — save to DB linked to this vendedor
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return

      for (const msg of msgs) {
        if (!msg.message || msg.key.fromMe) continue
        const from = msg.key.remoteJid
        if (!from || from.endsWith('@g.us')) continue

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          ''
        if (!text.trim()) continue

        const senderNumber = from.replace('@s.whatsapp.net', '')

        try {
          const { insertWhatsAppMessage, findClienteByPhone } = await import('./database.js')
          const cliente = await findClienteByPhone(senderNumber)
          await insertWhatsAppMessage({
            numero: senderNumber,
            clienteId: cliente?.id,
            vendedorId: vendedorId,
            direcao: 'recebida',
            mensagem: text.trim(),
          })
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
