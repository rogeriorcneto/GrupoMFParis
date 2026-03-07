import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from './middleware/rate-limit.js'
import { CONFIG } from './config.js'
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus, getQRDataUrl, sendWhatsAppMessage } from './whatsapp.js'
import {
  connectUserWhatsApp, disconnectUserWhatsApp, getUserWhatsAppStatus,
  getUserQRDataUrl, sendUserWhatsAppMessage, getAllUserSessions,
  startSessionCleanup,
} from './whatsapp-multi.js'
import { initEmail, reloadEmail, getEmailStatus, sendEmail, sendTemplateEmail, testEmailConnection } from './email.js'
import { getActiveSessions } from './session.js'
import { loadConfig, saveConfig } from './config-store.js'
import { requireAuth, requireGerente } from './middleware/auth.js'
import { processarJobsPendentes } from './cron.js'
import { omieRouter } from './routes/omie.js'
import { geminiHandler } from './gemini.js'
import { log } from './logger.js'

const app = express()

// ─── Middleware ───
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true)
    // Allow any localhost or 127.0.0.1 origin (dev)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true)
    // Allow Netlify production domain
    if (origin.endsWith('.netlify.app')) return callback(null, true)
    // Allow configured origins (production)
    if (CONFIG.corsOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
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

// ─── Gemini AI Route (protegido por auth) ───
app.post('/api/gemini', requireAuth, geminiHandler)

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
  const { number, text, clienteId, vendedorNome, vendedorId } = req.body

  if (!number || !text) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: number, text' })
    return
  }

  const result = await sendWhatsAppMessage(number, text)

  if (result.success) {
    try {
      const db = await import('./database.js')
      // Salvar mensagem no histórico
      await db.insertWhatsAppMessage({
        numero: number.replace(/\D/g, ''),
        clienteId: clienteId || undefined,
        vendedorId: vendedorId || undefined,
        direcao: 'enviada',
        mensagem: text,
      })
      // Registrar interação se tiver clienteId
      if (clienteId) {
        await db.insertInteracao({
          clienteId, tipo: 'whatsapp', data: new Date().toISOString(),
          assunto: 'Mensagem WhatsApp', descricao: text.substring(0, 200),
          automatico: false
        })
        await db.updateCliente(clienteId, { ultimaInteracao: new Date().toISOString().split('T')[0] })
      }
      // Registrar atividade
      if (vendedorNome) {
        await db.insertAtividade({
          tipo: 'whatsapp',
          descricao: `WhatsApp para ${number}: ${text.substring(0, 80)}`,
          vendedorNome,
        })
      }
    } catch (err) {
      log.error({ err }, 'Erro ao registrar mensagem/interação WhatsApp')
    }
  }

  res.json(result)
})

app.get('/api/whatsapp/messages', requireAuth, async (req, res) => {
  const { numero, clienteId, limit } = req.query
  try {
    const db = await import('./database.js')
    let messages
    if (clienteId) {
      messages = await db.fetchWhatsAppMessagesByCliente(Number(clienteId), Number(limit) || 100)
    } else if (numero) {
      messages = await db.fetchWhatsAppMessages(String(numero), Number(limit) || 100)
    } else {
      res.status(400).json({ error: 'Informe numero ou clienteId' })
      return
    }
    res.json(messages)
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar mensagens WhatsApp')
    res.status(500).json({ error: err?.message || 'Erro interno' })
  }
})

// ─── Per-User WhatsApp Routes (cada vendedor conecta seu próprio WA) ───

app.get('/api/whatsapp/user/status', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }
    res.json(getUserWhatsAppStatus(vendedor.id))
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro interno' })
  }
})

app.get('/api/whatsapp/user/qr', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }
    const status = getUserWhatsAppStatus(vendedor.id)
    if (status.connected) {
      res.json({ qr: null, status: 'connected', number: status.number })
      return
    }
    const qr = getUserQRDataUrl(vendedor.id)
    if (qr) {
      res.json({ qr, status: 'qr' })
      return
    }
    res.json({ qr: null, status: status.status })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro interno' })
  }
})

app.post('/api/whatsapp/user/connect', requireAuth, rateLimit(5, 60_000), async (req, res) => {
  const userId = (req as any).userId
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ success: false, error: 'Vendedor não encontrado' }); return }
    await connectUserWhatsApp(vendedor.id)
    res.json({ success: true, message: 'Conexão iniciada. Aguarde o QR code.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao conectar' })
  }
})

app.post('/api/whatsapp/user/disconnect', requireAuth, rateLimit(5, 60_000), async (req, res) => {
  const userId = (req as any).userId
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ success: false, error: 'Vendedor não encontrado' }); return }
    await disconnectUserWhatsApp(vendedor.id)
    res.json({ success: true, message: 'WhatsApp desconectado.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao desconectar' })
  }
})

app.post('/api/whatsapp/user/send', requireAuth, rateLimit(20, 60_000), async (req, res) => {
  const userId = (req as any).userId
  const { number, text, clienteId } = req.body
  if (!number || !text) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: number, text' })
    return
  }
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ success: false, error: 'Vendedor não encontrado' }); return }
    const result = await sendUserWhatsAppMessage(vendedor.id, number, text)
    if (result.success) {
      try {
        await db.insertWhatsAppMessage({
          numero: number.replace(/\D/g, ''),
          clienteId: clienteId || undefined,
          vendedorId: vendedor.id,
          direcao: 'enviada',
          mensagem: text,
        })
        if (clienteId) {
          await db.insertInteracao({
            clienteId, tipo: 'whatsapp', data: new Date().toISOString(),
            assunto: 'Mensagem WhatsApp', descricao: text.substring(0, 200),
            automatico: false
          })
          await db.updateCliente(clienteId, { ultimaInteracao: new Date().toISOString().split('T')[0] })
        }
        await db.insertAtividade({
          tipo: 'whatsapp',
          descricao: `WhatsApp para ${number}: ${text.substring(0, 80)}`,
          vendedorNome: vendedor.nome,
        })
      } catch (err) {
        log.error({ err }, 'Erro ao registrar mensagem/interação WhatsApp (user)')
      }
    }
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro interno' })
  }
})

// Gerente: ver todas as sessões de usuários
app.get('/api/whatsapp/user/sessions', requireAuth, requireGerente, (_req, res) => {
  res.json(getAllUserSessions())
})

// ─── Vendedor Histórico (gerente only) ───

app.get('/api/vendedor/:id/historico', requireAuth, requireGerente, async (req, res) => {
  try {
    const vendedorId = parseInt(req.params.id, 10)
    if (isNaN(vendedorId)) { res.status(400).json({ error: 'ID inválido' }); return }

    // Find vendedor name by ID
    const vendedores = await import('./database.js').then(m => m.fetchVendedores())
    const vendedor = vendedores.find((v: any) => v.id === vendedorId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }

    const { fetchAtividadesByVendedor } = await import('./database.js')
    const limit = parseInt(req.query.limit as string, 10) || 200
    const atividades = await fetchAtividadesByVendedor(vendedor.nome, limit)
    res.json({ vendedor: { id: vendedor.id, nome: vendedor.nome }, atividades })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar histórico vendedor')
    res.status(500).json({ error: err?.message || 'Erro ao buscar histórico' })
  }
})

app.get('/api/vendedores/historico', requireAuth, requireGerente, async (req, res) => {
  try {
    const { fetchAllAtividades } = await import('./database.js')
    const limit = parseInt(req.query.limit as string, 10) || 500
    const atividades = await fetchAllAtividades(limit)
    res.json({ atividades })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar histórico geral')
    res.status(500).json({ error: err?.message || 'Erro ao buscar histórico' })
  }
})

// ─── Config Routes (somente gerente) ───

app.get('/api/config', requireAuth, requireGerente, async (req, res) => {
  try {
    const cfg = await loadConfig()
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
  } catch (err: any) {
    log.error({ err }, 'Erro ao carregar config')
    res.status(500).json({ success: false, error: err?.message || 'Erro ao carregar configuração' })
  }
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

  // Start per-user WhatsApp session cleanup (removes inactive sessions after 24h)
  startSessionCleanup()

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
