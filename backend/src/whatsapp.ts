import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import * as QRCode from 'qrcode'
import { handleMessage } from './bot.js'
import { log } from './logger.js'
import { useSupabaseAuthState } from './whatsapp-session-store.js'

const baileysLogger = pino({ level: 'silent' })

// ============================================
// Estado global da conexão WhatsApp
// ============================================

let sock: ReturnType<typeof makeWASocket> | null = null
let qrDataUrl: string | null = null
let connectedNumber: string | null = null
let connectionStatus: 'disconnected' | 'connecting' | 'qr' | 'connected' = 'disconnected'
let startTime: number | null = null
let reconnectAttempts = 0
const MAX_RECONNECT = 5

export function getWhatsAppStatus() {
  return {
    connected: connectionStatus === 'connected',
    status: connectionStatus,
    number: connectedNumber,
    uptime: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
  }
}

export function getQRDataUrl(): string | null {
  return qrDataUrl
}

export async function disconnectWhatsApp(): Promise<void> {
  if (sock) {
    try {
      await sock.logout()
    } catch {
      // Ignore logout errors
    }
    sock.end(undefined)
    sock = null
  }
  qrDataUrl = null
  connectedNumber = null
  connectionStatus = 'disconnected'
  startTime = null
  reconnectAttempts = 0

  // Limpa a sessão do Supabase para forçar novo QR no próximo connect
  try {
    const { clearSession } = await useSupabaseAuthState()
    await clearSession()
  } catch {
    // Ignore
  }
}

export async function sendWhatsAppMessage(number: string, text: string): Promise<{ success: boolean; error?: string }> {
  if (!sock || connectionStatus !== 'connected') {
    return { success: false, error: 'WhatsApp não está conectado' }
  }
  try {
    const jid = number.replace(/\D/g, '') + '@s.whatsapp.net'
    await sock.sendMessage(jid, { text })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao enviar mensagem' }
  }
}

export async function connectWhatsApp(): Promise<void> {
  if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
    log.warn('WhatsApp já está conectado ou conectando')
    return
  }

  connectionStatus = 'connecting'
  log.info('📱 Iniciando conexão WhatsApp...')

  try {
    const { state, saveCreds } = await useSupabaseAuthState()
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      logger: baileysLogger,
      printQRInTerminal: true,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
    })

    // QR Code event
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        connectionStatus = 'qr'
        qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 })
        log.info('📷 QR Code gerado. Escaneie com o WhatsApp.')
      }

      if (connection === 'close') {
        qrDataUrl = null
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode

        if (reason === DisconnectReason.loggedOut) {
          log.info('🔴 WhatsApp deslogado pelo usuário')
          connectionStatus = 'disconnected'
          connectedNumber = null
          startTime = null
          reconnectAttempts = 0
        } else if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++
          log.info(`🔄 Reconectando... (tentativa ${reconnectAttempts}/${MAX_RECONNECT})`)
          connectionStatus = 'disconnected'
          setTimeout(() => connectWhatsApp(), 3000 * reconnectAttempts)
        } else {
          log.error('❌ Máximo de tentativas de reconexão atingido')
          connectionStatus = 'disconnected'
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected'
        qrDataUrl = null
        reconnectAttempts = 0
        startTime = Date.now()

        // Extract connected number
        const me = sock?.user
        if (me) {
          connectedNumber = me.id.split(':')[0].split('@')[0]
          log.info(`✅ WhatsApp conectado! Número: ${connectedNumber}`)
        }
      }
    })

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds)

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue

        const from = msg.key.remoteJid
        if (!from || from.endsWith('@g.us')) continue // Ignore group messages

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          ''

        if (!text.trim()) continue

        const senderNumber = from.replace('@s.whatsapp.net', '')

        try {
          const reply = await handleMessage(senderNumber, text.trim())
          if (reply && sock) {
            await sock.sendMessage(from, { text: reply })
          }
        } catch (err) {
          log.error({ err, senderNumber }, 'Erro ao processar mensagem')
          if (sock) {
            await sock.sendMessage(from, { text: '❌ Ocorreu um erro interno. Tente novamente.' })
          }
        }
      }
    })
  } catch (err) {
    log.error({ err }, 'Erro ao conectar WhatsApp')
    connectionStatus = 'disconnected'
  }
}
