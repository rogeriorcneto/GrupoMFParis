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

const baileysLogger = pino({ level: 'silent' })

// ============================================
// Per-user WhatsApp session
// ============================================

export interface UserWhatsAppSession {
  sock: ReturnType<typeof makeWASocket> | null
  qrDataUrl: string | null
  connectedNumber: string | null
  status: 'disconnected' | 'connecting' | 'qr' | 'connected'
  startTime: number | null
  reconnectAttempts: number
  vendedorId: number
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
    const jid = number.replace(/\D/g, '') + '@s.whatsapp.net'
    await session.sock.sendMessage(jid, { text })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao enviar mensagem' }
  }
}

export async function connectUserWhatsApp(vendedorId: number): Promise<void> {
  const existing = sessions.get(vendedorId)
  if (existing && (existing.status === 'connected' || existing.status === 'connecting')) {
    log.warn(`WhatsApp do vendedor ${vendedorId} já está conectado ou conectando`)
    return
  }

  // Check max sessions limit
  if (getActiveSessionCount() >= MAX_SESSIONS) {
    throw new Error(`Limite de ${MAX_SESSIONS} sessões WhatsApp atingido. Desconecte uma sessão primeiro.`)
  }

  const session = existing || createEmptySession(vendedorId)
  session.status = 'connecting'
  sessions.set(vendedorId, session)

  log.info(`📱 Iniciando conexão WhatsApp para vendedor ${vendedorId}...`)

  try {
    const { state, saveCreds } = await useSupabaseAuthState(`user_${vendedorId}`)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      logger: baileysLogger,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
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

        if (reason === DisconnectReason.loggedOut) {
          log.info(`🔴 WhatsApp do vendedor ${vendedorId} deslogado pelo usuário`)
          session.status = 'disconnected'
          session.connectedNumber = null
          session.startTime = null
          session.reconnectAttempts = 0
          sessions.delete(vendedorId)
        } else if (session.reconnectAttempts < MAX_RECONNECT) {
          session.reconnectAttempts++
          log.info(`🔄 Reconectando vendedor ${vendedorId}... (tentativa ${session.reconnectAttempts}/${MAX_RECONNECT})`)
          session.status = 'disconnected'
          setTimeout(() => connectUserWhatsApp(vendedorId), 3000 * session.reconnectAttempts)
        } else {
          log.error(`❌ Máximo de tentativas de reconexão atingido para vendedor ${vendedorId}`)
          session.status = 'disconnected'
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
