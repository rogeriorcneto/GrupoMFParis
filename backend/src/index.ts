import express from 'express'
import cors from 'cors'
import { CONFIG } from './config.js'
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus, getQRDataUrl, sendWhatsAppMessage } from './whatsapp.js'
import { initEmail, reloadEmail, getEmailStatus, sendEmail, sendTemplateEmail, testEmailConnection } from './email.js'
import { getActiveSessions } from './session.js'
import { loadConfig, saveConfig } from './config-store.js'
import { requireAuth, requireGerente } from './middleware/auth.js'
import { processarJobsPendentes } from './cron.js'

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

app.post('/api/whatsapp/connect', requireAuth, requireGerente, async (_req, res) => {
  try {
    await connectWhatsApp()
    res.json({ success: true, message: 'Conexão iniciada. Aguarde o QR code.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao conectar' })
  }
})

app.post('/api/whatsapp/disconnect', requireAuth, requireGerente, async (_req, res) => {
  try {
    await disconnectWhatsApp()
    res.json({ success: true, message: 'WhatsApp desconectado.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao desconectar' })
  }
})

app.post('/api/whatsapp/send', requireAuth, async (req, res) => {
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
      console.error('Erro ao registrar interação WhatsApp:', err)
    }
  }

  res.json(result)
})

// ─── Config Routes (somente gerente) ───

app.get('/api/config', requireAuth, requireGerente, (_req, res) => {
  const cfg = loadConfig()
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

app.post('/api/config', requireAuth, requireGerente, (req, res) => {
  const { emailHost, emailPort, emailUser, emailPass, emailFrom } = req.body

  try {
    const updates: any = {}
    if (emailHost !== undefined) updates.emailHost = emailHost
    if (emailPort !== undefined) updates.emailPort = parseInt(emailPort, 10) || 587
    if (emailUser !== undefined) updates.emailUser = emailUser
    // Só atualiza a senha se não for o placeholder
    if (emailPass !== undefined && emailPass !== '••••••••') updates.emailPass = emailPass
    if (emailFrom !== undefined) updates.emailFrom = emailFrom

    const saved = saveConfig(updates)

    // Recarregar transporter de email com novas configs
    const emailOk = reloadEmail()

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

app.post('/api/email/test', requireAuth, requireGerente, async (_req, res) => {
  const result = await testEmailConnection()
  res.json(result)
})

app.post('/api/email/send', requireAuth, async (req, res) => {
  const { to, subject, body, clienteId, vendedorNome } = req.body

  if (!to || !subject || !body) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: to, subject, body' })
    return
  }

  const result = await sendEmail({ to, subject, body, clienteId, vendedorNome })
  res.json(result)
})

app.post('/api/email/send-template', requireAuth, async (req, res) => {
  const { templateId, to, clienteId, vendedorNome } = req.body

  if (!templateId || !to || !clienteId || !vendedorNome) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: templateId, to, clienteId, vendedorNome' })
    return
  }

  const result = await sendTemplateEmail({ templateId, to, clienteId, vendedorNome })
  res.json(result)
})

// ─── Start server ───

async function start() {
  console.log('🚀 Iniciando CRM MF Paris Bot...')
  console.log(`📡 Servidor na porta ${CONFIG.port}`)

  // Init email
  initEmail()

  // Start Express
  app.listen(CONFIG.port, () => {
    console.log(`✅ API disponível em http://localhost:${CONFIG.port}`)
    console.log('')
    console.log('Endpoints:')
    console.log(`  GET  /api/health`)
    console.log(`  GET  /api/whatsapp/status`)
    console.log(`  GET  /api/whatsapp/qr`)
    console.log(`  POST /api/whatsapp/connect`)
    console.log(`  POST /api/whatsapp/disconnect`)
    console.log(`  POST /api/whatsapp/send`)
    console.log(`  GET  /api/email/status`)
    console.log(`  POST /api/email/test`)
    console.log(`  POST /api/email/send`)
    console.log(`  POST /api/email/send-template`)
    console.log(`  GET  /api/config`)
    console.log(`  POST /api/config`)
    console.log('')
  })

  // Auto-connect WhatsApp (se já tiver sessão salva)
  try {
    await connectWhatsApp()
  } catch (err) {
    console.error('Erro ao auto-conectar WhatsApp:', err)
    console.log('Use POST /api/whatsapp/connect ou a interface do CRM para conectar.')
  }

  // Cron: processar jobs de automação a cada 5 minutos
  setInterval(() => {
    processarJobsPendentes()
  }, 5 * 60 * 1000)
  console.log('⏰ Scheduler de jobs: a cada 5 minutos')
}

start().catch(console.error)
