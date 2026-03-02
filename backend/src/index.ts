import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from './middleware/rate-limit.js'
import { CONFIG } from './config.js'
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus, getQRDataUrl, sendWhatsAppMessage } from './whatsapp.js'
import { initEmail, reloadEmail, getEmailStatus, sendEmail, sendTemplateEmail, testEmailConnection } from './email.js'
import { getActiveSessions } from './session.js'
import { loadConfig, saveConfig } from './config-store.js'
import { requireAuth, requireGerente } from './middleware/auth.js'
import { processarJobsPendentes } from './cron.js'
import { omieRouter } from './routes/omie.js'
import { log } from './logger.js'

const app = express()

// ─── Middleware ───
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true)
    // Allow any localhost or 127.0.0.1 origin (dev)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true)
    // Allow configured origins (production)
    if (CONFIG.corsOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))
app.use(express.json())
app.use(helmet())

// ─── Health check ───
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    whatsapp: getWhatsAppStatus(),
    email: getEmailStatus(),
    activeSessions: getActiveSessions(),
    uptime: process.uptime(),
  })
})

// ─── WhatsApp Routes (protegidos por auth) ───

app.get('/api/whatsapp/status', requireAuth, (_req, res) => {
  res.json(getWhatsAppStatus())
})

app.get('/api/whatsapp/qr', requireAuth, (_req, res) => {
  const qr = getQRDataUrl()
  const status = getWhatsAppStatus()

  if (status.connected) {
    res.json({ qr: null, status: 'connected', number: status.number })
    return
  }

  if (qr) {
    res.json({ qr, status: 'qr' })
    return
  }

  res.json({ qr: null, status: status.status })
})

app.post('/api/whatsapp/connect', requireAuth, requireGerente, rateLimit(5, 60_000), async (_req, res) => {
  try {
    await connectWhatsApp()
    res.json({ success: true, message: 'Conexão iniciada. Aguarde o QR code.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao conectar' })
  }
})

app.post('/api/whatsapp/disconnect', requireAuth, requireGerente, rateLimit(5, 60_000), async (_req, res) => {
  try {
    await disconnectWhatsApp()
    res.json({ success: true, message: 'WhatsApp desconectado.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao desconectar' })
  }
})

app.post('/api/whatsapp/send', requireAuth, rateLimit(20, 60_000), async (req, res) => {
  const { number, text, clienteId, vendedorNome } = req.body

  if (!number || !text) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: number, text' })
    return
  }

  const result = await sendWhatsAppMessage(number, text)

  if (result.success && clienteId) {
    // Register interaction in Supabase
    try {
      const { insertInteracao, updateCliente } = await import('./database.js')
      await insertInteracao({
        clienteId, tipo: 'whatsapp', data: new Date().toISOString(),
        assunto: 'Mensagem WhatsApp', descricao: text.substring(0, 200),
        automatico: false
      })
      await updateCliente(clienteId, { ultimaInteracao: new Date().toISOString().split('T')[0] })
    } catch (err) {
      log.error({ err }, 'Erro ao registrar interação WhatsApp')
    }
  }

  res.json(result)
})

// ─── Config Routes (somente gerente) ───

app.get('/api/config', requireAuth, requireGerente, async (_req, res) => {
  const cfg = await loadConfig()
  // Nunca retornar a senha completa para o frontend
  const waStatus = getWhatsAppStatus()
  res.json({
    emailHost: cfg.emailHost,
    emailPort: cfg.emailPort,
    emailUser: cfg.emailUser,
    emailPass: cfg.emailPass ? '••••••••' : '',
    emailFrom: cfg.emailFrom,
    whatsappNumero: waStatus.connected ? waStatus.number : (cfg.whatsappNumero || ''),
    whatsappConnected: waStatus.connected,
  })
})

app.post('/api/config', requireAuth, requireGerente, rateLimit(10, 60_000), async (req, res) => {
  const { emailHost, emailPort, emailUser, emailPass, emailFrom } = req.body

  try {
    const updates: any = {}
    if (emailHost !== undefined) updates.emailHost = emailHost
    if (emailPort !== undefined) updates.emailPort = parseInt(emailPort, 10) || 587
    if (emailUser !== undefined) updates.emailUser = emailUser
    // Só atualiza a senha se não for o placeholder
    if (emailPass !== undefined && emailPass !== '••••••••') updates.emailPass = emailPass
    if (emailFrom !== undefined) updates.emailFrom = emailFrom

    const saved = await saveConfig(updates)

    // Recarregar transporter de email com novas configs
    const emailOk = await reloadEmail()

    res.json({
      success: true,
      emailConfigured: emailOk,
      config: {
        emailHost: saved.emailHost,
        emailPort: saved.emailPort,
        emailUser: saved.emailUser,
        emailPass: saved.emailPass ? '••••••••' : '',
        emailFrom: saved.emailFrom,
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao salvar configurações' })
  }
})

// ─── Email Routes (protegidos por auth) ───

app.get('/api/email/status', requireAuth, (_req, res) => {
  res.json(getEmailStatus())
})

app.post('/api/email/test', requireAuth, requireGerente, rateLimit(5, 60_000), async (_req, res) => {
  const result = await testEmailConnection()
  res.json(result)
})

app.post('/api/email/send', requireAuth, rateLimit(15, 60_000), async (req, res) => {
  const { to, subject, body, clienteId, vendedorNome } = req.body

  if (!to || !subject || !body) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: to, subject, body' })
    return
  }

  const result = await sendEmail({ to, subject, body, clienteId, vendedorNome })
  res.json(result)
})

app.post('/api/email/send-template', requireAuth, rateLimit(15, 60_000), async (req, res) => {
  const { templateId, to, clienteId, vendedorNome } = req.body

  if (!templateId || !to || !clienteId || !vendedorNome) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: templateId, to, clienteId, vendedorNome' })
    return
  }

  const result = await sendTemplateEmail({ templateId, to, clienteId, vendedorNome })
  res.json(result)
})

// ─── Omie ERP Routes (protegidos por auth + gerente) ───
app.use('/api/omie', requireAuth, requireGerente, omieRouter)

// ─── Start server ───

async function start() {
  log.info('🚀 Iniciando CRM MF Paris Bot...')
  log.info(`📡 Servidor na porta ${CONFIG.port}`)

  // Init email (loads config from Supabase)
  await initEmail()

  // Start Express
  app.listen(CONFIG.port, () => {
    log.info(`✅ API disponível em http://localhost:${CONFIG.port}`)
    log.info('Endpoints: GET /api/health, /api/whatsapp/status, /api/whatsapp/qr | POST /api/whatsapp/connect, /api/whatsapp/disconnect, /api/whatsapp/send | GET /api/email/status | POST /api/email/test, /api/email/send, /api/email/send-template | GET /api/config | POST /api/config')
  })

  // Auto-connect WhatsApp (se já tiver sessão salva)
  try {
    await connectWhatsApp()
  } catch (err) {
    log.error({ err }, 'Erro ao auto-conectar WhatsApp')
    log.info('Use POST /api/whatsapp/connect ou a interface do CRM para conectar.')
  }

  // Cron: processar jobs de automação a cada 5 minutos (com guard anti-overlap)
  let cronRunning = false
  setInterval(async () => {
    if (cronRunning) return
    cronRunning = true
    try { await processarJobsPendentes() } finally { cronRunning = false }
  }, 5 * 60 * 1000)
  log.info('⏰ Scheduler de jobs: a cada 5 minutos')
}

start().catch(err => log.fatal({ err }, 'Falha ao iniciar servidor'))
