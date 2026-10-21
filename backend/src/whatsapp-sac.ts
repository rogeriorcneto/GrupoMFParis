import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from 'baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import * as QRCode from 'qrcode'
import { log } from './logger.js'
import { useSupabaseAuthState } from './whatsapp-session-store.js'
import { formatBrazilianPhone } from './whatsapp-multi.js'

const baileysLogger = pino({ level: 'warn' })
const MAX_RECONNECT = 5

/**
 * Sessão WhatsApp dedicada ao SAC — número separado que dispara a
 * pesquisa de satisfação quando um pedido vira "entregue" e recebe
 * a nota de volta. Mesma infra do whatsapp-multi (auth no Supabase,
 * prefixo 'sac'), mas enxuta: não mantém contatos/messageStore.
 */

export interface SacSession {
  sock: ReturnType<typeof makeWASocket> | null
  qrDataUrl: string | null
  connectedNumber: string | null
  status: 'disconnected' | 'connecting' | 'qr' | 'connected'
  startTime: number | null
  reconnectAttempts: number
}

let sacSession: SacSession | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

export function getSacStatus() {
  return {
    connected: sacSession?.status === 'connected',
    status: sacSession?.status ?? 'disconnected',
    number: sacSession?.connectedNumber ?? null,
    uptime: sacSession?.startTime ? Date.now() - sacSession.startTime : 0,
  }
}

export function getSacQr(): string | null {
  return sacSession?.status === 'qr' ? sacSession.qrDataUrl : null
}

/** Normaliza remoteJid (s.whatsapp.net ou lid) para número com 55 */
function jidToPhone(jid: string): string | null {
  if (!jid) return null
  const raw = jid.split('@')[0].split(':')[0]
  if (!/^\d{10,14}$/.test(raw)) return null
  return formatBrazilianPhone(raw)
}

export async function connectSacWhatsApp(): Promise<void> {
  if (sacSession && ['connected', 'connecting', 'qr'].includes(sacSession.status)) {
    log.warn('WhatsApp SAC já conectado/conectando')
    return
  }

  const session: SacSession = {
    sock: null, qrDataUrl: null, connectedNumber: null,
    status: 'connecting', startTime: null, reconnectAttempts: 0,
  }
  sacSession = session

  const { state, saveCreds, clearSession } = await useSupabaseAuthState('sac')
  const hasSavedCreds = !!state.creds.registered
  log.info(`🔑 SAC: sessão salva=${hasSavedCreds}`)

  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
    logger: baileysLogger,
    browser: ['CRM MF Paris SAC', 'Chrome', '127.0.0.1'],
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 30_000,
    retryRequestDelayMs: 250,
    syncFullHistory: false, // SAC não precisa de histórico — só respostas novas
  })

  session.sock = sock

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (sacSession !== session || session.sock !== sock) return

    if (qr) {
      session.status = 'qr'
      session.qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 })
      log.info('📷 QR Code SAC gerado')
    }

    if (connection === 'close') {
      session.qrDataUrl = null
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode
      log.info(`🔴 SAC desconectou (reason: ${reason})`)

      if (reason === DisconnectReason.loggedOut) {
        try { await clearSession() } catch { /* ignore */ }
        session.status = 'disconnected'
        session.connectedNumber = null
        session.sock = null
        sacSession = null
      } else if (session.reconnectAttempts < MAX_RECONNECT) {
        session.reconnectAttempts++
        session.status = 'disconnected'
        session.sock = null
        if (!reconnectTimer) {
          const delay = Math.min(2_000 * session.reconnectAttempts, 15_000)
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            if (sacSession === session && session.status === 'disconnected') {
              connectSacWhatsApp().catch(err => log.error({ err }, 'Falha ao reconectar SAC'))
            }
          }, delay)
        }
      } else {
        session.status = 'disconnected'
        session.sock = null
        sacSession = null
      }
    }

    if (connection === 'open') {
      session.status = 'connected'
      session.qrDataUrl = null
      session.reconnectAttempts = 0
      session.startTime = Date.now()
      session.connectedNumber = sock.user?.id.split(':')[0].split('@')[0] ?? null
      log.info(`✅ WhatsApp SAC conectado! Número: ${session.connectedNumber}`)
      try { await saveCreds() } catch { /* non-critical */ }
    }
  })

  sock.ev.on('creds.update', async () => {
    if (sacSession === session && session.sock === sock) {
      try { await saveCreds() } catch { /* ignore */ }
    }
  })

  // Respostas da pesquisa de satisfação — nota 1-5 vira ocorrência no pedido
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify' || sacSession !== session) return
    for (const msg of msgs) {
      if (!msg.message || msg.key?.fromMe) continue
      const jid = msg.key?.remoteJid
      if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim()
      if (!text) continue
      const phone = jidToPhone(jid)
      if (!phone) continue
      // import dinâmico evita ciclo sac.ts ↔ whatsapp-sac.ts
      import('./sac.js').then(({ registrarNotaSac }) =>
        registrarNotaSac(phone, text, (to, t) => sendSacText(to, t))
      ).catch(err => log.warn({ err, phone }, 'Falha ao processar resposta SAC'))
    }
  })
}

export async function disconnectSacWhatsApp(): Promise<void> {
  const s = sacSession
  sacSession = null
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (s?.sock) {
    try { await s.sock.logout() } catch { /* ignore */ }
    try { s.sock.end(undefined) } catch { /* ignore */ }
    s.sock = null
  }
  const { clearSession } = await useSupabaseAuthState('sac')
  await clearSession().catch(() => {})
  log.info('🗑️ WhatsApp SAC desconectado e sessão limpa')
}

/**
 * Envia texto pelo número do SAC. Aceita JID ou número cru.
 * Retorna false se a sessão não estiver conectada (caller decide se loga/tenta depois).
 */
export async function sendSacText(to: string, text: string): Promise<boolean> {
  const s = sacSession
  if (!s || s.status !== 'connected' || !s.sock) return false
  const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`
  try {
    await s.sock.sendMessage(jid, { text })
    return true
  } catch (err) {
    log.warn({ err, to: jid }, 'Falha ao enviar mensagem SAC')
    return false
  }
}

/** Restaura a sessão SAC no boot — se houver creds salvas, reconecta sem QR. */
export async function restoreSacSession(): Promise<boolean> {
  try {
    const { state } = await useSupabaseAuthState('sac')
    if (!state.creds.registered) return false
    await connectSacWhatsApp()
    return true
  } catch (err) {
    log.warn({ err }, 'Falha ao restaurar sessão SAC')
    return false
  }
}
