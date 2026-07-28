import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from './middleware/rate-limit.js'
import { CONFIG } from './config.js'
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus, getQRDataUrl, sendWhatsAppMessage, forceResetWhatsApp } from './whatsapp.js'
import {
  connectUserWhatsApp, disconnectUserWhatsApp, getUserWhatsAppStatus,
  getUserQRDataUrl, sendUserWhatsAppMessage, getAllUserSessions,
  startSessionCleanup, checkWhatsAppSessionTable, formatBrazilianPhone,
  getUserWhatsAppContacts, getUserWhatsAppChats, getUserWhatsAppChatMessages,
  sendUserWhatsAppAudio, sendUserWhatsAppImage, checkNumberOnWhatsApp,
  validateContactsOnWhatsApp, cacheMessage, getUserWhatsAppSession,
} from './whatsapp-multi.js'
import { initEmail, reloadEmail, getEmailStatus, sendEmail, sendTemplateEmail, testEmailConnection, fetchInboxEmails } from './email.js'
import { getActiveSessions } from './session.js'
import { loadConfig, saveConfig } from './config-store.js'
import { supabase } from './supabase.js'
import { requireAuth, requireGerente } from './middleware/auth.js'
import { processarJobsPendentes } from './cron.js'
import { startBulkDispatch, getBatchStatus, getAllBatches, cancelBatch } from './bulk-dispatch.js'
import { omieRouter } from './routes/omie.js'
import { placesRouter } from './routes/places.js'
import { traficoRouter } from './routes/trafico.js'
import { leadsRfRouter } from './routes/leads-rf.js'
import { vendedoresRouter } from './routes/vendedores.js'
import { missoesRouter } from './routes/missoes.js'
import { mapsRouter } from './routes/maps.js'
import twilioRouter from './routes/twilio.js'
import twilioVoiceAiRouter from './routes/twilio-voice-ai.js'
import ttsRouter from './routes/tts.js'
import ttsOptimizedRouter from './routes/tts-optimized.js'
import geminiStreamRouter from './routes/gemini-stream.js'
import ttsWebSocketRouter from './routes/tts-websocket.js'
import { onPedidoAprovado, criarPedidoOmie, consultarPedidoOmie, cancelarPedidoOmie } from './omie/pedidos.js'
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
  try {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ status: 'error', error: errorMessage })
  }
})

// ─── Gemini AI Route (protegido por auth) ───
app.post('/api/gemini', requireAuth, geminiHandler)

// ─── AI Context Data (WhatsApp msgs + calls + products + tasks) ───
app.get('/api/ai/data', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }

    // WhatsApp messages — last 200 across all contacts for this vendedor
    const { data: waMsgs } = await supabase
      .from('whatsapp_messages')
      .select('numero, mensagem, direcao, created_at')
      .eq('vendedor_id', vendedor.id)
      .order('created_at', { ascending: false })
      .limit(200)

    // Call recordings — all for this vendedor
    const { data: calls } = await supabase
      .from('gravacoes_chamada')
      .select('id, cliente_id, numero_telefone, duracao_segundos, notas, tipo_chamada, transcricao, created_at')
      .eq('vendedor_id', vendedor.id)
      .order('created_at', { ascending: false })
      .limit(50)

    // Products
    const { data: produtos } = await supabase
      .from('produtos')
      .select('nome, sku, categoria, preco, unidade, estoque, ativo, omie_codigo')
      .eq('ativo', true)

    // Tasks — pending/in-progress for this vendedor
    const { data: tarefas } = await supabase
      .from('tarefas')
      .select('titulo, descricao, prioridade, status, data_vencimento, created_at')
      .eq('vendedor_id', vendedor.id)
      .in('status', ['pendente', 'em_andamento'])
      .order('data_vencimento', { ascending: true })
      .limit(30)

    res.json({
      whatsappMessages: waMsgs || [],
      callRecordings: calls || [],
      produtos: produtos || [],
      tarefas: tarefas || [],
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro interno' })
  }
})

// ─── AI: Sugestão de texto comercial para envio (email/whatsapp) ───
app.post('/api/ai/suggest-message', requireAuth, rateLimit(30, 60_000), async (req, res) => {
  const { canal, text, instruction, clienteNome, empresaNome, vendedorNome } = req.body || {}

  if (!canal) {
    res.status(400).json({ success: false, error: 'Campo obrigatório: canal' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ success: false, error: 'GEMINI_API_KEY não configurada no servidor' })
    return
  }

  try {
    const baseText = String(text || '').trim()
    const userInstruction = String(instruction || '').trim()
    const canalLabel = String(canal || 'texto').toLowerCase()

    const prompt = [
      'Você é especialista em comunicação comercial B2B para vendas no Brasil.',
      'Tarefa: sugerir um texto executivo, objetivo e persuasivo para comunicação com cliente.',
      'Regras obrigatórias:',
      '- Escreva em português brasileiro.',
      '- Tom profissional, claro e confiante.',
      '- Use linguagem comercial de alto nível, sem exageros.',
      '- Evite gírias, emojis e promessas não verificáveis.',
      '- Não use markdown, não use aspas extras, não explique; retorne apenas o texto final.',
      '- Mantenha o texto pronto para copiar e enviar.',
      `Canal: ${canalLabel}.`,
      clienteNome ? `Cliente: ${clienteNome}.` : '',
      empresaNome ? `Empresa: ${empresaNome}.` : '',
      vendedorNome ? `Vendedor responsável: ${vendedorNome}.` : '',
      userInstruction ? `Objetivo adicional: ${userInstruction}` : '',
      baseText
        ? `Texto base para melhorar:\n${baseText}`
        : 'Não há texto base. Gere uma sugestão inicial adequada ao canal e contexto.',
    ].filter(Boolean).join('\n')

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 900 },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      log.error({ error: errText }, 'Erro na Gemini API (suggest-message)')
      res.status(500).json({ success: false, error: 'Erro ao gerar sugestão da IA' })
      return
    }

    const geminiData = await geminiRes.json() as any
    const suggestion = String(geminiData?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '').trim()
    if (!suggestion) {
      res.status(500).json({ success: false, error: 'IA não retornou sugestão.' })
      return
    }

    res.json({ success: true, suggestion })
  } catch (err: any) {
    log.error({ err }, 'Erro ao gerar sugestão de mensagem IA')
    res.status(500).json({ success: false, error: err?.message || 'Erro interno' })
  }
})

// ─── AI: Transcrever áudio de ligação via Gemini ───
app.post('/api/ai/transcribe/:id', requireAuth, rateLimit(10, 60_000), async (req, res) => {
  const userId = (req as any).userId
  const callId = Number(req.params.id)
  if (!callId) { res.status(400).json({ error: 'ID inválido' }); return }

  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }

    // Fetch call record
    const { data: call, error: callErr } = await supabase
      .from('gravacoes_chamada')
      .select('*')
      .eq('id', callId)
      .single()
    if (callErr || !call) { res.status(404).json({ error: 'Gravação não encontrada' }); return }

    // If already transcribed, return it
    if (call.transcricao) {
      res.json({ success: true, transcription: call.transcricao })
      return
    }

    // Need audio file to transcribe
    if (!call.arquivo_path) {
      res.status(400).json({ error: 'Gravação sem arquivo de áudio associado' })
      return
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) { res.status(500).json({ error: 'GEMINI_API_KEY não configurada' }); return }

    // Download audio from Supabase Storage
    const { data: audioData, error: dlErr } = await supabase.storage
      .from('call-recordings')
      .download(call.arquivo_path)
    if (dlErr || !audioData) {
      res.status(500).json({ error: 'Erro ao baixar arquivo de áudio' })
      return
    }

    // Convert to base64
    const arrayBuffer = await audioData.arrayBuffer()
    const base64Audio = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = call.arquivo_path.endsWith('.webm') ? 'audio/webm' : 'audio/mp4'

    // Call Gemini with audio
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Audio } },
            { text: 'Transcreva este áudio de uma ligação comercial/profissional em português do Brasil. Forneça a transcrição completa e fiel, identificando os interlocutores como "Vendedor" e "Cliente" quando possível. Se o áudio não for claro, indique [inaudível]. Ao final, adicione um breve resumo da conversa em 2-3 frases.' }
          ]
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      log.error({ error: errText }, 'Erro na transcrição Gemini')
      res.status(500).json({ error: 'Erro ao transcrever áudio via IA' })
      return
    }

    const geminiData = await geminiRes.json() as any
    const transcription = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Não foi possível transcrever.'

    // Save transcription to DB
    await supabase
      .from('gravacoes_chamada')
      .update({ transcricao: transcription })
      .eq('id', callId)

    res.json({ success: true, transcription })
  } catch (err: any) {
    log.error({ err }, 'Erro na transcrição de áudio')
    res.status(500).json({ error: err?.message || 'Erro interno' })
  }
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

app.post('/api/whatsapp/reset', requireAuth, requireGerente, rateLimit(5, 60_000), async (_req, res) => {
  try {
    await forceResetWhatsApp()
    res.json({ success: true, message: 'WhatsApp resetado. Clique em Conectar para gerar novo QR.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
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
        // Cache sent message in session so it shows up in polling
        const normalizedNum = formatBrazilianPhone(number)
        const sentJid = `${normalizedNum}@s.whatsapp.net`
        const session = getUserWhatsAppSession(vendedor.id)
        if (session) {
          cacheMessage(session, sentJid, {
            key: { id: `sent-${Date.now()}-${Math.random().toString(36).slice(2)}`, fromMe: true, remoteJid: sentJid },
            message: { conversation: text },
            messageTimestamp: Math.floor(Date.now() / 1000),
          })
        }

        await db.insertWhatsAppMessage({
          numero: normalizedNum,
          clienteId: clienteId || undefined,
          vendedorId: vendedor.id,
          direcao: 'enviada',
          mensagem: text,
          tipo: 'text',
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
    const contacts = await getUserWhatsAppContacts(vendedor.id)
    const chats = getUserWhatsAppChats(vendedor.id)
    // Merge: enrich contacts with chat data (last message time, unread count)
    const merged = contacts
      .filter(c => c.jid.endsWith('@s.whatsapp.net') && !c.jid.endsWith('@g.us') && !c.jid.endsWith('@broadcast') && !c.jid.endsWith('@lid'))
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

// Buscar mensagens de um chat específico (cache in-memory do Baileys)
app.get('/api/whatsapp/user/chat-messages', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const { jid, numero, limit } = req.query
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }
    // Accept either jid or numero — normalize with formatBrazilianPhone to ensure 55 prefix
    let chatJid = jid ? String(jid) : ''
    if (!chatJid && numero) {
      const normalized = formatBrazilianPhone(String(numero))
      chatJid = `${normalized}@s.whatsapp.net`
    }
    if (!chatJid) { res.status(400).json({ error: 'Informe jid ou numero' }); return }
    const lim = Number(limit) || 100

    const session = getUserWhatsAppSession(vendedor.id)
    if (!session) { res.json([]); return }

    // Build list of all JID variations to look up
    const jidsToCheck = new Set<string>()
    jidsToCheck.add(chatJid)
    if (numero) {
      const raw = String(numero).replace(/\D/g, '')
      jidsToCheck.add(`${raw}@s.whatsapp.net`)
      jidsToCheck.add(`55${raw}@s.whatsapp.net`)
      if (raw.startsWith('55')) jidsToCheck.add(`${raw.slice(2)}@s.whatsapp.net`)
      // Brazilian mobile: add variation with/without the 9 digit
      // e.g. 5531973248705 ↔ 553173248705
      const with55 = raw.startsWith('55') ? raw : `55${raw}`
      const without55 = raw.startsWith('55') ? raw.slice(2) : raw
      if (with55.length === 13 && with55[4] === '9') {
        jidsToCheck.add(`${with55.slice(0, 4)}${with55.slice(5)}@s.whatsapp.net`)
      }
      if (without55.length === 11 && without55[2] === '9') {
        jidsToCheck.add(`${without55.slice(0, 2)}${without55.slice(3)}@s.whatsapp.net`)
      }
      if (with55.length === 12 && with55[4] !== '9') {
        jidsToCheck.add(`${with55.slice(0, 4)}9${with55.slice(4)}@s.whatsapp.net`)
      }
      if (without55.length === 10 && without55[2] !== '9') {
        jidsToCheck.add(`${without55.slice(0, 2)}9${without55.slice(2)}@s.whatsapp.net`)
      }
    }

    // Find @lid JIDs that map to this phone number via session.lidMap
    for (const [lid, phoneJid] of session.lidMap.entries()) {
      if (jidsToCheck.has(phoneJid)) {
        jidsToCheck.add(lid)
      }
    }
    // Include @lid JIDs only when explicitly mapped to this phone number.
    // Unmapped @lid JIDs are excluded — they could belong to any contact.
    const allStoreKeys = Array.from(session.messageStore.keys())
    for (const key of allStoreKeys) {
      if (key.endsWith('@lid') && !jidsToCheck.has(key)) {
        const mapped = session.lidMap.get(key)
        if (mapped && jidsToCheck.has(mapped)) {
          jidsToCheck.add(key)
        }
      }
    }

    // Merge messages from all matching JIDs, dedup by message id
    const seenIds = new Set<string>()
    const merged: any[] = []
    for (const j of jidsToCheck) {
      const msgs = session.messageStore.get(j) || []
      for (const m of msgs) {
        if (!seenIds.has(m.id)) {
          seenIds.add(m.id)
          merged.push(m)
        }
      }
    }

    // Sort by timestamp ascending and take last N
    merged.sort((a, b) => a.timestamp - b.timestamp)
    let messages = merged.slice(-lim)

    // Fallback: se cache vazio, buscar do DB
    if (messages.length === 0 && numero) {
      try {
        const normalized = formatBrazilianPhone(String(numero))
        const dbMsgs = await db.fetchWhatsAppMessages(normalized, lim)
        if (dbMsgs.length > 0) {
          messages = dbMsgs.map(m => ({
            id: String(m.id),
            fromMe: m.direcao === 'enviada',
            text: m.mensagem,
            timestamp: Math.floor(new Date(m.createdAt || Date.now()).getTime() / 1000),
            type: m.tipo || 'text',
          }))
        }
      } catch (e) {
        // ignore DB errors, return empty
      }
    }

    log.info(`🔍 [chat-messages] vendedor=${vendedor.id} chatJid=${chatJid} jidsChecked=${Array.from(jidsToCheck).join(',')} merged=${merged.length} returned=${messages.length} lidMapSize=${session.lidMap.size}${messages.length > 0 && merged.length === 0 ? ' (from DB)' : ''}`)
    res.json(messages)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro interno' })
  }
})

// Diagnóstico da sessão WhatsApp (debug)
app.get('/api/whatsapp/user/debug-session', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }
    const session = getUserWhatsAppSession(vendedor.id)
    if (!session) { res.json({ connected: false, message: 'No session' }); return }
    const storeKeys = Array.from(session.messageStore.keys())
    const storeDetails = storeKeys.map(k => ({
      jid: k,
      messageCount: session.messageStore.get(k)?.length || 0,
      lastMsg: (() => {
        const msgs = session.messageStore.get(k) || []
        const last = msgs[msgs.length - 1]
        return last ? { id: last.id, text: last.text?.substring(0, 50), fromMe: last.fromMe, type: last.type, ts: last.timestamp } : null
      })(),
    }))
    res.json({
      connected: session.status === 'connected',
      status: session.status,
      connectedNumber: session.connectedNumber,
      vendedorId: session.vendedorId,
      contactsCount: session.contacts.length,
      chatsCount: session.chats.length,
      storeKeysCount: storeKeys.length,
      storeDetails,
    })
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

// Validar todos os contatos no WhatsApp (em lote)
app.post('/api/whatsapp/user/validate-contacts', requireAuth, rateLimit(5, 300_000), async (req, res) => {
  const userId = (req as any).userId
  try {
    const db = await import('./database.js')
    const vendedor = await db.getVendedorByAuthId(userId)
    if (!vendedor) { res.status(404).json({ error: 'Vendedor não encontrado' }); return }
    const result = await validateContactsOnWhatsApp(vendedor.id)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro interno' })
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

// Gerente atualiza login (email) e/ou senha de um vendedor
app.post('/api/vendedores/:id/credentials', requireAuth, requireGerente, rateLimit(10, 60_000), async (req, res) => {
  const vendedorId = Number(req.params.id)
  const { email, senha } = req.body || {}
  if (!vendedorId) { res.status(400).json({ success: false, error: 'ID inválido' }); return }
  if (!email && !senha) { res.status(400).json({ success: false, error: 'Informe email e/ou senha para atualizar' }); return }
  try {
    const db = await import('./database.js')
    await db.updateVendedorCredentials(vendedorId, { email, senha })
    res.json({ success: true })
  } catch (err: any) {
    log.error({ err }, 'Erro ao atualizar credenciais do vendedor')
    res.status(400).json({ success: false, error: err?.message || 'Erro ao atualizar credenciais' })
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

// ─── Tempo de Tela ───

app.post('/api/tempo-tela/beat', requireAuth, rateLimit(120, 60_000), async (req, res) => {
  try {
    const userId = (req as any).userId
    const { vendedorId, inicio, fim, duracaoSegundos } = req.body || {}
    if (!vendedorId || !inicio || !fim || !Number.isFinite(duracaoSegundos) || duracaoSegundos <= 0) {
      res.status(400).json({ error: 'Dados de batimento inválidos' })
      return
    }
    const { insertTempoTelaBeat } = await import('./database.js')
    const row = await insertTempoTelaBeat(Number(vendedorId), String(inicio), String(fim), Number(duracaoSegundos))
    res.json({ success: true, data: row })
  } catch (err: any) {
    log.error({ err }, 'Erro ao salvar batimento de tempo de tela')
    res.status(500).json({ error: err?.message || 'Erro ao salvar batimento' })
  }
})

app.get('/api/tempo-tela/relatorio', requireAuth, requireGerente, async (req, res) => {
  try {
    const { fetchTempoTelaPorPeriodo, fetchVendedores } = await import('./database.js')
    const hoje = new Date().toISOString().slice(0, 10)
    const dataInicio = String(req.query.dataInicio || hoje)
    const dataFim = String(req.query.dataFim || hoje)
    const [vendedores, batidas] = await Promise.all([
      fetchVendedores(),
      fetchTempoTelaPorPeriodo(dataInicio, dataFim),
    ])
    const map = new Map<number, number>()
    for (const b of batidas) {
      const total = map.get(b.vendedor_id) || 0
      map.set(b.vendedor_id, total + b.duracao_segundos)
    }
    const relatorio = vendedores.map(v => ({
      vendedorId: v.id,
      nome: v.nome,
      totalSegundos: map.get(v.id) || 0,
    })).sort((a, b) => b.totalSegundos - a.totalSegundos)
    res.json({ periodo: { dataInicio, dataFim }, relatorio })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar relatório de tempo de tela')
    res.status(500).json({ error: err?.message || 'Erro ao buscar relatório' })
  }
})

// ─── Roleplay ───

app.post('/api/roleplay/sessao', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId
    const { vendedorId, modulo, perfilId, perfilNome, mensagens, duracaoSegundos, nota, feedback } = req.body || {}
    if (!vendedorId || !mensagens) {
      res.status(400).json({ error: 'Dados da sessão inválidos' })
      return
    }
    const { insertRoleplaySession } = await import('./database.js')
    const row = await insertRoleplaySession(Number(vendedorId), {
      modulo: String(modulo || ''),
      perfilId: String(perfilId || ''),
      perfilNome: String(perfilNome || ''),
      mensagens: Array.isArray(mensagens) ? mensagens : [],
      duracaoSegundos: Number(duracaoSegundos || 0),
      nota: Number(nota || 0),
      feedback,
    })
    res.json({ success: true, data: row })
  } catch (err: any) {
    log.error({ err }, 'Erro ao salvar sessão de roleplay')
    res.status(500).json({ error: err?.message || 'Erro ao salvar sessão' })
  }
})

app.get('/api/roleplay/historico', requireAuth, async (req, res) => {
  try {
    const vendedorId = parseInt(req.query.vendedorId as string, 10)
    if (isNaN(vendedorId)) { res.status(400).json({ error: 'ID inválido' }); return }
    const { fetchRoleplaySessionsByVendedor } = await import('./database.js')
    const sessoes = await fetchRoleplaySessionsByVendedor(vendedorId)
    res.json({ sessoes })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar histórico de roleplay')
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
      emailImapHost: cfg.emailImapHost,
      emailImapPort: cfg.emailImapPort,
      emailImapUser: cfg.emailImapUser,
      emailImapPass: cfg.emailImapPass ? '••••••••' : '',
      emailImapSecure: cfg.emailImapSecure,
      whatsappNumero: waStatus.connected ? waStatus.number : (cfg.whatsappNumero || ''),
      whatsappConnected: waStatus.connected,
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao carregar config')
    res.status(500).json({ success: false, error: err?.message || 'Erro ao carregar configuração' })
  }
})

app.post('/api/config', requireAuth, requireGerente, rateLimit(10, 60_000), async (req, res) => {
  const {
    emailHost,
    emailPort,
    emailUser,
    emailPass,
    emailFrom,
    emailImapHost,
    emailImapPort,
    emailImapUser,
    emailImapPass,
    emailImapSecure,
  } = req.body

  try {
    const updates: any = {}
    if (emailHost !== undefined) updates.emailHost = emailHost
    if (emailPort !== undefined) updates.emailPort = parseInt(emailPort, 10) || 587
    if (emailUser !== undefined) updates.emailUser = emailUser
    // Só atualiza a senha se não for o placeholder
    if (emailPass !== undefined && emailPass !== '••••••••') updates.emailPass = emailPass
    if (emailFrom !== undefined) updates.emailFrom = emailFrom
    if (emailImapHost !== undefined) updates.emailImapHost = emailImapHost
    if (emailImapPort !== undefined) updates.emailImapPort = parseInt(emailImapPort, 10) || 993
    if (emailImapUser !== undefined) updates.emailImapUser = emailImapUser
    if (emailImapPass !== undefined && emailImapPass !== '••••••••') updates.emailImapPass = emailImapPass
    if (emailImapSecure !== undefined) updates.emailImapSecure = !!emailImapSecure

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
        emailImapHost: saved.emailImapHost,
        emailImapPort: saved.emailImapPort,
        emailImapUser: saved.emailImapUser,
        emailImapPass: saved.emailImapPass ? '••••••••' : '',
        emailImapSecure: saved.emailImapSecure,
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

app.get('/api/email/inbox', requireAuth, rateLimit(30, 60_000), async (req, res) => {
  const clienteEmail = String(req.query.clienteEmail || '').trim()
  const limit = Number(req.query.limit || 30)
  if (!clienteEmail) {
    res.status(400).json({ success: false, error: 'Parâmetro obrigatório: clienteEmail' })
    return
  }
  const result = await fetchInboxEmails({ clienteEmail, limit })
  res.json(result)
})

// ─── Bulk Dispatch Routes (disparo em massa) ───

app.post('/api/bulk/send', requireAuth, rateLimit(5, 60_000), async (req, res) => {
  const { canal, subject, body, templateId, targets, vendedorNome, delayMs } = req.body
  const userId = (req as any).userId

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

  const db = await import('./database.js')
  const vendedor = await db.getVendedorByAuthId(userId)
  if (!vendedor) {
    res.status(404).json({ success: false, error: 'Vendedor não encontrado' })
    return
  }

  const batchId = startBulkDispatch({
    canal, subject, body: body || '', templateId, targets,
    vendedorId: vendedor.id,
    vendedorNome: vendedorNome || vendedor.nome || 'Sistema',
    delayMs,
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

// ─── Twilio VOIP Routes ───
// Config routes require gerente auth; token requires any auth; voice/callbacks are public (Twilio calls them)
app.get('/api/twilio/config', requireAuth, requireGerente, (req, res, next) => twilioRouter(req, res, next))
app.post('/api/twilio/config', requireAuth, requireGerente, (req, res, next) => twilioRouter(req, res, next))
app.post('/api/twilio/auto-setup', requireAuth, requireGerente, (req, res, next) => twilioRouter(req, res, next))
app.post('/api/twilio/token', requireAuth, (req, res, next) => twilioRouter(req, res, next))
app.get('/api/twilio/recording/:callSid', requireAuth, (req, res, next) => twilioRouter(req, res, next))
// Public endpoints (Twilio webhooks)
app.post('/api/twilio/voice', (req, res, next) => twilioRouter(req, res, next))
app.post('/api/twilio/recording-callback', (req, res, next) => twilioRouter(req, res, next))
app.post('/api/twilio/status-callback', (req, res, next) => twilioRouter(req, res, next))
// Voice AI — Twilio posts here when someone calls the number
app.use('/api/twilio/voice-ai', twilioVoiceAiRouter)

// ─── TTS (Text-to-Speech neural) ───
// GET /api/tts/status é público; POST /api/tts requer auth (verificado internamente)
app.use('/api/tts', ttsRouter)

// ─── TTS Otimizado (Fase 1) ───
// Cache de áudios comuns e otimizações para reduzir delay
app.use('/api/tts-optimized', requireAuth, ttsOptimizedRouter)

// ─── Gemini Streaming (Fase 2) ───
// Streaming de respostas para reduzir delay ainda mais
app.use('/api/gemini-stream', requireAuth, geminiStreamRouter)

// ─── TTS WebSocket (Fase 2) ───
// Streaming de áudio via WebSocket para delay mínimo
app.use('/api/tts-websocket', requireAuth, ttsWebSocketRouter)

// ─── Omie ERP Routes (protegidos por auth + gerente) ───
app.use('/api/omie', requireAuth, requireGerente, omieRouter)
app.use('/api/places', requireAuth, placesRouter)
app.use('/api/trafico', requireAuth, requireGerente, traficoRouter)
app.use('/api/leads-rf', requireAuth, leadsRfRouter)
app.use('/api/vendedores', requireAuth, requireGerente, vendedoresRouter)
app.use('/api/missoes', missoesRouter)
app.use('/api/maps', requireAuth, mapsRouter)

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

    // 2. Responder IMEDIATAMENTE ao frontend (não bloquear pelo Omie)
    res.json({ success: true, pedido_aprovado: true, omie: { pending: true } })

    // 3. Enviar ao Omie em background (fire-and-forget)
    onPedidoAprovado(pedidoId).then(async (omieResult) => {
      try {
        if (omieResult.success) {
          await supabase.from('pedidos').update({ omie_erro: null, omie_codigo: omieResult.omie_codigo || null }).eq('id', pedidoId)
        } else {
          await supabase.from('pedidos').update({
            omie_erro: omieResult.error || 'Erro desconhecido ao enviar para o Omie',
          }).eq('id', pedidoId)
        }
      } catch { /* non-critical */ }
    }).catch((err) => {
      log.error({ err, pedidoId }, 'Erro background Omie após aprovação')
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

// ─── Cancelar pedido no CRM e no Omie ───

app.post('/api/pedidos/:id/cancelar', requireAuth, requireGerente, async (req, res) => {
  const pedidoId = parseInt(req.params.id, 10)
  if (isNaN(pedidoId)) { res.status(400).json({ success: false, error: 'ID inválido' }); return }

  const motivo = req.body?.motivo || 'Cancelado pelo usuário'

  try {
    const result = await cancelarPedidoOmie(pedidoId, motivo)
    res.json(result)
  } catch (err: any) {
    log.error({ err, pedidoId }, 'Erro ao cancelar pedido')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Google Maps API - Prospecção ───

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY

app.get('/api/maps/buscar', requireAuth, async (req, res) => {
  if (!GOOGLE_MAPS_API_KEY) {
    res.status(503).json({ success: false, error: 'GOOGLE_MAPS_API_KEY não configurada' })
    return
  }

  const { query, location, radius, type, pageToken } = req.query
  if (!query && !pageToken) {
    res.status(400).json({ success: false, error: 'Query ou pageToken é obrigatório' })
    return
  }

  try {
    let url: string
    if (pageToken) {
      // Paginação - usa textsearch com pagetoken
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${encodeURIComponent(String(pageToken))}&key=${GOOGLE_MAPS_API_KEY}`
    } else {
      // Busca nova
      const params = new URLSearchParams()
      params.set('query', String(query))
      params.set('key', GOOGLE_MAPS_API_KEY)
      if (location) params.set('location', String(location))
      if (radius) params.set('radius', String(radius))
      if (type) params.set('type', String(type))
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`
    }

    const googleRes = await fetch(url)
    const data = await googleRes.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      log.error({ status: data.status, error: data.error_message }, 'Erro na API do Google Maps')
      res.status(502).json({ success: false, error: data.error_message || data.status })
      return
    }

    res.json({
      success: true,
      results: data.results || [],
      next_page_token: data.next_page_token,
      status: data.status,
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar no Google Maps')
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/maps/detalhes', requireAuth, async (req, res) => {
  if (!GOOGLE_MAPS_API_KEY) {
    res.status(503).json({ success: false, error: 'GOOGLE_MAPS_API_KEY não configurada' })
    return
  }

  const { placeId } = req.query
  if (!placeId) {
    res.status(400).json({ success: false, error: 'placeId é obrigatório' })
    return
  }

  try {
    const fields = 'name,formatted_address,geometry,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,business_status,place_id'
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(String(placeId))}&fields=${fields}&key=${GOOGLE_MAPS_API_KEY}`

    const googleRes = await fetch(url)
    const data = await googleRes.json()

    if (data.status !== 'OK') {
      res.status(502).json({ success: false, error: data.error_message || data.status })
      return
    }

    res.json({ success: true, ...data.result })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar detalhes no Google Maps')
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/maps/importar', requireAuth, async (req, res) => {
  const vendedor = (req as any).vendedor
  const { place, vendedorId } = req.body

  if (!vendedor && !vendedorId) {
    res.status(401).json({ success: false, error: 'Vendedor não autenticado' })
    return
  }

  if (!place || !place.place_id) {
    res.status(400).json({ success: false, error: 'Dados do lugar são obrigatórios' })
    return
  }

  try {
    // Verificar se já existe cliente com mesmo place_id ou nome similar
    const { data: existente } = await supabase
      .from('clientes')
      .select('id')
      .or(`razao_social.ilike.${place.name.replace(/[%_\\]/g, '\\$&')},google_place_id.eq.${place.place_id}`)
      .maybeSingle()

    if (existente) {
      res.status(409).json({ success: false, error: 'Lead já existe no CRM', clienteId: existente.id })
      return
    }

    // Extrair dados do endereço
    const endereco = place.formatted_address || place.vicinity || ''
    const parts = endereco.split(',').map((p: string) => p.trim())
    const cidade = parts.length > 1 ? parts[parts.length - 2] : ''
    const estado = parts.length > 0 ? parts[parts.length - 1].split(' ')[0] : ''

    // Criar cliente
    const { data: novoCliente, error } = await supabase
      .from('clientes')
      .insert({
        razao_social: place.name,
        nome_fantasia: place.name,
        cnpj: '', // Place não tem CNPJ
        contato_nome: '',
        contato_telefone: place.formatted_phone_number || '',
        contato_celular: place.international_phone_number || place.formatted_phone_number || '',
        contato_email: '',
        endereco: endereco,
        endereco_cidade: cidade,
        endereco_estado: estado,
        etapa: 'prospecção',
        vendedor_id: vendedorId || vendedor?.id,
        origem_lead: 'google_maps',
        google_place_id: place.place_id,
        google_rating: place.rating ?? null,
        google_reviews: place.user_ratings_total ?? null,
        website: place.website || '',
        latitude: place.geometry?.location?.lat ?? null,
        longitude: place.geometry?.location?.lng ?? null,
        data_entrada_etapa: new Date().toISOString().split('T')[0],
        score: 50,
      })
      .select('id')
      .single()

    if (error) {
      res.status(500).json({ success: false, error: error.message })
      return
    }

    // Registrar atividade
    await supabase.from('atividades').insert({
      vendedor_id: vendedor?.id,
      tipo: 'criacao',
      descricao: `[Prospecção Google Maps] Lead importado: ${place.name}`,
      cliente_id: novoCliente.id,
    })

    res.json({ success: true, clienteId: novoCliente.id })
  } catch (err: any) {
    log.error({ err }, 'Erro ao importar lugar como lead')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── CNPJ Proxy (evita CORS das APIs públicas) ───
app.get('/api/cnpj/:cnpj', requireAuth, rateLimit(30, 60_000), async (req, res) => {
  const digits = req.params.cnpj.replace(/\D/g, '')
  if (digits.length !== 14) { res.status(400).json({ error: 'CNPJ inválido' }); return }
  try {
    let data: any = null
    // Tenta BrasilAPI
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
        headers: { 'User-Agent': 'CRM-MFParis/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) data = await r.json()
    } catch { /* fallback */ }
    // Fallback: ReceitaWS
    if (!data) {
      try {
        const r2 = await fetch(`https://receitaws.com.br/v1/cnpj/${digits}`, {
          headers: { 'User-Agent': 'CRM-MFParis/1.0' },
          signal: AbortSignal.timeout(8000),
        })
        if (r2.ok) {
          const raw = await r2.json()
          if (raw.status === 'OK') {
            data = {
              razao_social: raw.nome,
              nome_fantasia: raw.fantasia,
              logradouro: raw.logradouro,
              numero: raw.numero,
              complemento: raw.complemento,
              bairro: raw.bairro,
              municipio: raw.municipio,
              uf: raw.uf,
              cep: raw.cep,
              cnae_fiscal: raw.atividade_principal?.[0]?.code?.replace(/[^0-9]/g, ''),
              cnae_fiscal_descricao: raw.atividade_principal?.[0]?.text,
              cnaes_secundarios: (raw.atividades_secundarias || []).map((a: any) => ({ codigo: a.code?.replace(/[^0-9]/g, ''), descricao: a.text })),
            }
          }
        }
      } catch { /* sem fallback */ }
    }
    if (!data) { res.status(404).json({ error: 'CNPJ não encontrado' }); return }
    res.json(data)
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar CNPJ')
    res.status(500).json({ error: 'Erro ao consultar CNPJ' })
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

  // Cron: sync Omie logistics a cada 3 minutos (com guard anti-overlap)
  let logisticsRunning = false
  setInterval(async () => {
    if (logisticsRunning) return
    logisticsRunning = true
    try { await syncOmieLogistics() } catch (err) { log.error({ err }, 'Erro no sync logístico Omie') } finally { logisticsRunning = false }
  }, 3 * 60 * 1000)
  log.info('🚚 Sync logístico Omie: a cada 3 minutos')
}

start().catch(err => log.fatal({ err }, 'Falha ao iniciar servidor'))
