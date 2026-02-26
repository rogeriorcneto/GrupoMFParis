import express from 'express'
import cors from 'cors'
import { CONFIG } from './config.js'
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus, getQRDataUrl } from './whatsapp.js'
import { initEmail, reloadEmail, getEmailStatus, sendEmail, sendTemplateEmail, testEmailConnection } from './email.js'
import { getActiveSessions } from './session.js'
import { loadConfig, saveConfig } from './config-store.js'

const app = express()

// ─── Middleware ───
app.use(cors({ origin: CONFIG.corsOrigins }))
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

// ─── WhatsApp Routes ───

app.get('/api/whatsapp/status', (_req, res) => {
  res.json(getWhatsAppStatus())
})

app.get('/api/whatsapp/qr', (_req, res) => {
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

app.post('/api/whatsapp/connect', async (_req, res) => {
  try {
    await connectWhatsApp()
    res.json({ success: true, message: 'Conexão iniciada. Aguarde o QR code.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao conectar' })
  }
})

app.post('/api/whatsapp/disconnect', async (_req, res) => {
  try {
    await disconnectWhatsApp()
    res.json({ success: true, message: 'WhatsApp desconectado.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao desconectar' })
  }
})

// ─── Config Routes (gerente configura email pelo CRM) ───

app.get('/api/config', (_req, res) => {
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

app.post('/api/config', (req, res) => {
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

// ─── Email Routes ───

app.get('/api/email/status', (_req, res) => {
  res.json(getEmailStatus())
})

app.post('/api/email/test', async (_req, res) => {
  const result = await testEmailConnection()
  res.json(result)
})

app.post('/api/email/send', async (req, res) => {
  const { to, subject, body, clienteId, vendedorNome } = req.body

  if (!to || !subject || !body) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: to, subject, body' })
    return
  }

  const result = await sendEmail({ to, subject, body, clienteId, vendedorNome })
  res.json(result)
})

app.post('/api/email/send-template', async (req, res) => {
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
}

start().catch(console.error)
