import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from './middleware/rate-limit.js'
import { CONFIG } from './config.js'
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus, getQRDataUrl, sendWhatsAppMessage } from './whatsapp.js'
import {
  connectUserWhatsApp, disconnectUserWhatsApp, getUserWhatsAppStatus,
  getUserQRDataUrl, sendUserWhatsAppMessage, getAllUserSessions,
  startSessionCleanup, checkWhatsAppSessionTable, formatBrazilianPhone,
  getUserWhatsAppContacts, getUserWhatsAppChats,
  sendUserWhatsAppAudio, sendUserWhatsAppImage, checkNumberOnWhatsApp,
} from './whatsapp-multi.js'
import { initEmail, reloadEmail, getEmailStatus, sendEmail, sendTemplateEmail, testEmailConnection } from './email.js'
import { getActiveSessions } from './session.js'
import { loadConfig, saveConfig } from './config-store.js'
import { supabase } from './supabase.js'
import { requireAuth, requireGerente } from './middleware/auth.js'
import { processarJobsPendentes } from './cron.js'
import { startBulkDispatch, getBatchStatus, getAllBatches, cancelBatch } from './bulk-dispatch.js'
import { omieRouter } from './routes/omie.js'
import { onPedidoAprovado, criarPedidoOmie, consultarPedidoOmie } from './omie/pedidos.js'
import { syncOmieLogistics } from './omie/sync-logistics.js'
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
        numero: formatBrazilianPhone(number),
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
          numero: formatBrazilianPhone(number),
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

// Contatos do WhatsApp do vendedor
app.get('/api/whatsapp/user/contacts', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }
    const contacts = getUserWhatsAppContacts(vendedor.id)
    const chats = getUserWhatsAppChats(vendedor.id)
    // Merge: enrich contacts with chat data (last message time, unread count)
    const merged = contacts
      .filter(c => !c.jid.endsWith('@g.us') && !c.jid.endsWith('@broadcast'))
      .map(c => {
        const chat = chats.find(ch => ch.jid === c.jid)
        return {
          ...c,
          lastMsgTimestamp: chat?.lastMsgTimestamp || 0,
          unreadCount: chat?.unreadCount || 0,
        }
      })
      .sort((a, b) => (b.lastMsgTimestamp || 0) - (a.lastMsgTimestamp || 0))
    res.json(merged)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro interno' })
  }
})

// Verificar se número existe no WhatsApp
app.post('/api/whatsapp/user/check-number', requireAuth, rateLimit(20, 60_000), async (req, res) => {
  const userId = (req as any).userId
  const { number } = req.body
  if (!number) {
    res.status(400).json({ exists: false, error: 'Campo obrigatório: number' })
    return
  }
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ exists: false, error: 'Vendedor não encontrado' }); return }
    const result = await checkNumberOnWhatsApp(vendedor.id, number)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ exists: false, error: err?.message || 'Erro interno' })
  }
})

// Enviar áudio via WhatsApp do vendedor
app.post('/api/whatsapp/user/send-audio', requireAuth, rateLimit(10, 60_000), async (req, res) => {
  const userId = (req as any).userId
  const { number, audioBase64, mimetype, clienteId } = req.body
  if (!number || !audioBase64) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: number, audioBase64' })
    return
  }
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ success: false, error: 'Vendedor não encontrado' }); return }
    const result = await sendUserWhatsAppAudio(vendedor.id, number, audioBase64, mimetype || 'audio/ogg; codecs=opus')
    if (result.success) {
      try {
        await db.insertWhatsAppMessage({
          numero: formatBrazilianPhone(number),
          clienteId: clienteId || undefined,
          vendedorId: vendedor.id,
          direcao: 'enviada',
          mensagem: '🎙️ [Áudio]',
        })
      } catch { /* non-critical */ }
    }
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro interno' })
  }
})

// Enviar imagem via WhatsApp do vendedor
app.post('/api/whatsapp/user/send-image', requireAuth, rateLimit(10, 60_000), async (req, res) => {
  const userId = (req as any).userId
  const { number, imageBase64, mimetype, caption, clienteId } = req.body
  if (!number || !imageBase64) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: number, imageBase64' })
    return
  }
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ success: false, error: 'Vendedor não encontrado' }); return }
    const result = await sendUserWhatsAppImage(vendedor.id, number, imageBase64, mimetype || 'image/jpeg', caption)
    if (result.success) {
      try {
        await db.insertWhatsAppMessage({
          numero: formatBrazilianPhone(number),
          clienteId: clienteId || undefined,
          vendedorId: vendedor.id,
          direcao: 'enviada',
          mensagem: caption ? `📷 [Imagem] ${caption}` : '📷 [Imagem]',
        })
      } catch { /* non-critical */ }
    }
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro interno' })
  }
})

// IA no WhatsApp pessoal do vendedor
app.post('/api/whatsapp/user/ai', requireAuth, rateLimit(30, 60_000), async (req, res) => {
  const userId = (req as any).userId
  const { message, history } = req.body
  if (!message) {
    res.status(400).json({ success: false, error: 'Campo obrigatório: message' })
    return
  }
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ success: false, error: 'Vendedor não encontrado' }); return }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      res.status(500).json({ success: false, error: 'GEMINI_API_KEY não configurada no servidor' })
      return
    }

    // Build CRM context (same as WhatsApp bot IA)
    const isGerente = vendedor.cargo === 'gerente'
    const clientes = isGerente ? await db.fetchClientes() : await db.fetchClientesByVendedor(vendedor.id)
    const vendedores = await db.fetchVendedores()
    const pedidos = await db.fetchPedidos()
    const interacoes = await db.fetchInteracoes()

    const vMap = new Map<number, string>(vendedores.map((v: any) => [v.id, v.nome]))
    const ativos = clientes.filter((c: any) => c.etapa !== 'perdido')
    const perdidos = clientes.filter((c: any) => c.etapa === 'perdido')
    const valorTotal = ativos.reduce((s: number, c: any) => s + (c.valorEstimado || 0), 0)
    const inativos30 = ativos.filter((c: any) => (c.diasInativo || 0) > 30).length

    const fmtC = (c: any) => [c.razaoSocial, c.nomeFantasia || '', c.cnpj || '', c.etapa, c.score || 0, c.valorEstimado || 0, c.diasInativo || 0, vMap.get(c.vendedorId) || '?', c.contatoNome || '', c.contatoTelefone || '', c.contatoEmail || ''].join('|')

    const top10 = [...ativos].sort((a: any, b: any) => (b.score || 0) - (a.score || 0)).slice(0, 10)

    const ctx = [
      'Voce e a Assistente de IA do CRM Grupo MF Paris. Responda de forma direta e util.',
      `Usuario: ${vendedor.nome} (${vendedor.cargo}). ${isGerente ? 'Visao: TODOS os clientes' : 'Visao: apenas SEUS clientes'}`,
      `Total clientes: ${clientes.length} (${ativos.length} ativos, ${perdidos.length} perdidos). Carteira: R$ ${valorTotal.toLocaleString('pt-BR')}. Inativos +30d: ${inativos30}`,
      `Pedidos: ${pedidos.length} total. Interacoes: ${interacoes.length}`,
      'TOP 10 Score: nome|fantasia|cnpj|etapa|score|valor|diasInativo|vendedor|contato|tel|email',
      ...top10.map((c: any) => fmtC(c)),
      'Amostra clientes (50):',
      ...ativos.slice(0, 50).map((c: any) => fmtC(c)),
      'Responda em portugues do Brasil. Seja direta, sem frases genericas de encerramento. Use dados reais acima.',
    ].join('\n')

    // Build Gemini request with conversation history
    const chatHistory = (history || []).slice(-20)
    const contents = [
      { role: 'user', parts: [{ text: ctx }] },
      { role: 'model', parts: [{ text: 'Entendido, tenho os dados do CRM. Vou responder de forma direta.' }] },
      ...chatHistory.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ]

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      log.error({ error: errText }, 'Erro na Gemini API (WhatsApp user AI)')
      res.status(500).json({ success: false, error: 'Erro ao consultar a IA' })
      return
    }

    const geminiData = await geminiRes.json() as any
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta da IA.'

    // Log activity
    await db.insertAtividade({
      tipo: 'ia',
      descricao: `IA WhatsApp: ${message.substring(0, 80)}`,
      vendedorNome: vendedor.nome,
    })

    res.json({ success: true, reply })
  } catch (err: any) {
    log.error({ err }, 'Erro no handler IA WhatsApp user')
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
  // Force reload config from DB before testing
  await reloadEmail()
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

// ─── Bulk Dispatch Routes (disparo em massa) ───

app.post('/api/bulk/send', requireAuth, rateLimit(5, 60_000), async (req, res) => {
  const { canal, subject, body, templateId, targets, vendedorNome, delayMs } = req.body

  if (!canal || !targets || !Array.isArray(targets) || targets.length === 0) {
    res.status(400).json({ success: false, error: 'Campos obrigatórios: canal, targets[]' })
    return
  }
  if (!['email', 'whatsapp'].includes(canal)) {
    res.status(400).json({ success: false, error: 'Canal deve ser "email" ou "whatsapp"' })
    return
  }
  if (!body && !templateId) {
    res.status(400).json({ success: false, error: 'Informe body ou templateId' })
    return
  }
  if (targets.length > 500) {
    res.status(400).json({ success: false, error: 'Máximo 500 destinatários por lote' })
    return
  }

  const batchId = startBulkDispatch({
    canal, subject, body: body || '', templateId, targets,
    vendedorNome: vendedorNome || 'Sistema', delayMs,
  })

  res.json({ success: true, batchId })
})

app.get('/api/bulk/status/:batchId', requireAuth, (req, res) => {
  const batch = getBatchStatus(req.params.batchId)
  if (!batch) { res.status(404).json({ error: 'Batch não encontrado' }); return }
  res.json(batch)
})

app.get('/api/bulk/batches', requireAuth, (_req, res) => {
  res.json(getAllBatches())
})

app.post('/api/bulk/cancel/:batchId', requireAuth, (req, res) => {
  const ok = cancelBatch(req.params.batchId)
  res.json({ success: ok })
})

// ─── Omie ERP Routes (protegidos por auth + gerente) ───
app.use('/api/omie', requireAuth, requireGerente, omieRouter)

// ─── Pedido → Omie (automático ao aprovar) ───

app.post('/api/pedidos/:id/aprovar', requireAuth, requireGerente, async (req, res) => {
  const pedidoId = parseInt(req.params.id, 10)
  if (isNaN(pedidoId)) { res.status(400).json({ success: false, error: 'ID inválido' }); return }

  try {
    // 1. Aprovar pedido no CRM
    const { data: pedido, error: fetchErr } = await supabase
      .from('pedidos')
      .select('status')
      .eq('id', pedidoId)
      .single()

    if (fetchErr || !pedido) {
      res.status(404).json({ success: false, error: 'Pedido não encontrado' })
      return
    }

    const authUid = (req as any).userId
    // Converter auth UUID para vendedor.id numérico
    const { data: vendedorData } = await supabase
      .from('vendedores')
      .select('id')
      .eq('auth_id', authUid)
      .single()
    const aprovadoPorId = vendedorData?.id || null

    const { error: updateErr } = await supabase
      .from('pedidos')
      .update({
        status: 'confirmado',
        aprovado_por: aprovadoPorId,
        data_aprovacao: new Date().toISOString(),
      })
      .eq('id', pedidoId)

    if (updateErr) {
      res.status(500).json({ success: false, error: updateErr.message })
      return
    }

    // 2. Enviar automaticamente ao Omie
    const omieResult = await onPedidoAprovado(pedidoId)

    // 3. Salvar resultado do Omie no pedido (erro ou sucesso)
    try {
      if (omieResult.success) {
        await supabase.from('pedidos').update({ omie_erro: null }).eq('id', pedidoId)
      } else {
        await supabase.from('pedidos').update({
          omie_erro: omieResult.error || 'Erro desconhecido ao enviar para o Omie',
        }).eq('id', pedidoId)
      }
    } catch { /* coluna omie_erro pode não existir ainda */ }

    res.json({
      success: true,
      pedido_aprovado: true,
      omie: omieResult,
    })
  } catch (err: any) {
    log.error({ err, pedidoId }, 'Erro ao aprovar pedido')
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/pedidos/:id/enviar-omie', requireAuth, requireGerente, async (req, res) => {
  const pedidoId = parseInt(req.params.id, 10)
  if (isNaN(pedidoId)) { res.status(400).json({ success: false, error: 'ID inválido' }); return }

  try {
    const response = await criarPedidoOmie(pedidoId)
    try { await supabase.from('pedidos').update({ omie_erro: null }).eq('id', pedidoId) } catch { /* */ }
    res.json({ success: true, omie: response })
  } catch (err: any) {
    log.error({ err, pedidoId }, 'Erro ao enviar pedido para Omie')
    try { await supabase.from('pedidos').update({ omie_erro: err.message || 'Erro ao enviar para Omie' }).eq('id', pedidoId) } catch { /* */ }
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/pedidos/:id/status-omie', requireAuth, async (req, res) => {
  const pedidoId = parseInt(req.params.id, 10)
  if (isNaN(pedidoId)) { res.status(400).json({ success: false, error: 'ID inválido' }); return }

  try {
    const status = await consultarPedidoOmie(pedidoId)
    res.json({ success: true, status })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

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

  // Verify whatsapp_session table exists
  checkWhatsAppSessionTable().catch(() => {})

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

  // Cron: sync Omie logistics a cada 15 minutos (com guard anti-overlap)
  let logisticsRunning = false
  setInterval(async () => {
    if (logisticsRunning) return
    logisticsRunning = true
    try { await syncOmieLogistics() } catch (err) { log.error({ err }, 'Erro no sync logístico Omie') } finally { logisticsRunning = false }
  }, 15 * 60 * 1000)
  log.info('🚚 Sync logístico Omie: a cada 15 minutos')
}

start().catch(err => log.fatal({ err }, 'Falha ao iniciar servidor'))
