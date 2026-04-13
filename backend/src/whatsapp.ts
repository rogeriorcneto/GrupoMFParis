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
import { formatBrazilianPhone, resolveWhatsAppJid } from './whatsapp-multi.js'

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
let connectingStartTime: number | null = null
const CONNECTING_TIMEOUT_MS = 60_000 // 60s sem QR → reset automático

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
    // Validar número via WhatsApp antes de enviar
    const resolved = await resolveWhatsAppJid(sock, number)
    if (!resolved) {
      // Fallback: tentar enviar direto com formato básico (pode falhar silenciosamente)
      const jid = formatBrazilianPhone(number) + '@s.whatsapp.net'
      await sock.sendMessage(jid, { text })
      return { success: true }
    }
    await sock.sendMessage(resolved.jid, { text })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao enviar mensagem' }
  }
}

export async function forceResetWhatsApp(): Promise<void> {
  log.info('🔄 Forçando reset da conexão WhatsApp...')
  if (sock) {
    try { sock.end(undefined) } catch { /* ignore */ }
    sock = null
  }
  qrDataUrl = null
  connectedNumber = null
  connectionStatus = 'disconnected'
  startTime = null
  connectingStartTime = null
  reconnectAttempts = 0
}

export async function connectWhatsApp(): Promise<void> {
  // Se preso em 'connecting' por mais de 60s, força reset
  if (connectionStatus === 'connecting' && connectingStartTime && Date.now() - connectingStartTime > CONNECTING_TIMEOUT_MS) {
    log.warn('⚠️ WhatsApp preso em connecting há mais de 60s. Forçando reset...')
    await forceResetWhatsApp()
  }

  if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
    log.warn('WhatsApp já está conectado ou conectando')
    return
  }

  connectionStatus = 'connecting'
  connectingStartTime = Date.now()
  log.info('📱 Iniciando conexão WhatsApp...')

  try {
    const { state, saveCreds } = await useSupabaseAuthState()

    // fetchLatestBaileysVersion faz request externo — usa fallback se falhar
    let version: [number, number, number] = [2, 3000, 1019227548]
    try {
      const fetched = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
      ]) as { version: [number, number, number] }
      version = fetched.version
      log.info({ version }, 'Versão WA obtida da API')
    } catch (vErr) {
      log.warn({ vErr }, 'Falha ao buscar versão WA — usando fallback 2.3000.x')
    }

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      logger: baileysLogger,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      browser: ['Chrome (Linux)', 'Chrome', '124.0.0.0'],
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 30_000,
      keepAliveIntervalMs: 25_000,
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
        log.warn({ reason, lastDisconnect: lastDisconnect?.error?.message }, '🔌 WA connection closed')

        if (reason === DisconnectReason.loggedOut) {
          log.info('🔴 WhatsApp deslogado — limpando sessão do Supabase para forçar novo QR')
          connectionStatus = 'disconnected'
          connectedNumber = null
          startTime = null
          reconnectAttempts = 0
          // Limpa sessão corrompida para que próxima conexão gere novo QR
          try {
            const { clearSession } = await useSupabaseAuthState()
            await clearSession()
            log.info('🗑️ Sessão WA limpa do Supabase')
          } catch (clearErr) {
            log.error({ clearErr }, 'Erro ao limpar sessão WA')
          }
          return // Não reconecta automaticamente — aguarda clique manual
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

        let text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          ''

        // Transcrever áudio via Gemini se não houver texto
        if (!text.trim() && msg.message.audioMessage) {
          try {
            const audioMsg = msg.message.audioMessage
            const stream = await (sock as any).downloadMediaMessage(msg, 'buffer')
            if (stream && stream.length > 0) {
              const base64Audio = (stream as Buffer).toString('base64')
              const mimeType = audioMsg.mimetype || 'audio/ogg; codecs=opus'
              const apiKey = process.env.GEMINI_API_KEY
              if (apiKey) {
                const geminiRes = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [{
                        parts: [
                          { inline_data: { mime_type: mimeType, data: base64Audio } },
                          { text: 'Transcreva exatamente o que foi dito neste áudio em português do Brasil. Retorne apenas a transcrição, sem comentários.' },
                        ],
                      }],
                      generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
                    }),
                  }
                )
                if (geminiRes.ok) {
                  const geminiData = await geminiRes.json() as any
                  const transcribed = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
                  if (transcribed) {
                    text = transcribed
                    log.info({ senderNumber: from.replace('@s.whatsapp.net', ''), transcribed }, '🎤 Áudio transcrito')
                  }
                }
              }
            }
          } catch (audioErr) {
            log.error({ err: audioErr }, 'Erro ao transcrever áudio WhatsApp')
          }
        }

        if (!text.trim()) continue

        const senderNumber = from.replace('@s.whatsapp.net', '')

        // Salvar mensagem recebida no histórico
        try {
          const { insertWhatsAppMessage, findClienteByPhone } = await import('./database.js')
          const cliente = await findClienteByPhone(senderNumber)
          await insertWhatsAppMessage({
            numero: senderNumber,
            clienteId: cliente?.id,
            direcao: 'recebida',
            mensagem: text.trim(),
          })
        } catch (dbErr) {
          log.error({ err: dbErr }, 'Erro ao salvar mensagem recebida no DB')
        }

        try {
          const reply = await handleMessage(senderNumber, text.trim())
          if (reply && sock) {
            await sock.sendMessage(from, { text: reply })
            // Salvar resposta do bot no histórico
            try {
              const { insertWhatsAppMessage, findClienteByPhone } = await import('./database.js')
              const cliente = await findClienteByPhone(senderNumber)
              await insertWhatsAppMessage({
                numero: senderNumber,
                clienteId: cliente?.id,
                direcao: 'enviada',
                mensagem: reply,
              })
            } catch (dbErr) {
              log.error({ err: dbErr }, 'Erro ao salvar resposta bot no DB')
            }
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
