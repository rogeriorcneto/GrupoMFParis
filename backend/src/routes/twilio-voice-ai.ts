/**
 * Twilio Voice AI — CRM MF Paris
 *
 * Fluxo:
 *  1. Twilio recebe ligação → chama POST /api/twilio/voice-ai
 *  2. TwiML responde com <Gather> + speech recognition
 *  3. Usuário fala → Twilio posta transcrição em /api/twilio/voice-ai/gather
 *  4. Backend chama Gemini com contexto do CRM + histórico da conversa
 *  5. Gemini responde (texto + opcionalmente executa função no CRM)
 *  6. TwiML fala a resposta e abre novo <Gather> para continuar
 */

import { Router, Request, Response } from 'express'
import twilio from 'twilio'
import { log } from '../logger.js'
import { loadConfig } from '../config-store.js'
import * as db from '../database.js'
import { FUNCTION_DECLARATIONS, executeFunction } from '../ai-functions.js'

const router = Router()

// ── In-memory conversation sessions (CallSid → history) ──────────────────────
interface ConvTurn { role: 'user' | 'model'; parts: { text: string }[] }
const sessions = new Map<string, { turns: ConvTurn[]; vendedorId?: number }>()

const SESSION_TTL = 30 * 60 * 1000 // 30 min
setInterval(() => {
  // Cleanup old sessions to avoid memory leak
  const now = Date.now()
  for (const [key] of sessions) {
    const [, ts] = key.split('_')
    if (ts && now - parseInt(ts) > SESSION_TTL) sessions.delete(key)
  }
}, 5 * 60 * 1000)

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(req: Request): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001'
  return `${proto}://${host}`
}

function twimlSpeak(text: string, gatherUrl: string, callSid: string): string {
  const vr = new twilio.twiml.VoiceResponse()

  // <Gather> captures next speech input
  const gather = vr.gather({
    input: ['speech'] as any,
    language: 'pt-BR',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    enhanced: true,
    action: `${gatherUrl}?callSid=${encodeURIComponent(callSid)}`,
    method: 'POST',
  })

  gather.say(
    { voice: 'Polly.Camila-Neural', language: 'pt-BR' },
    sanitizeForTTS(text),
  )

  // Fallback if user says nothing after 10s
  vr.say(
    { voice: 'Polly.Camila-Neural', language: 'pt-BR' },
    'Não ouvi nada. Encerrando. Ligue novamente quando quiser.',
  )
  vr.hangup()

  return vr.toString()
}

function twimlEnd(text: string): string {
  const vr = new twilio.twiml.VoiceResponse()
  vr.say({ voice: 'Polly.Camila-Neural', language: 'pt-BR' }, sanitizeForTTS(text))
  vr.hangup()
  return vr.toString()
}

/** Remove markdown e caracteres que o TTS não lida bem */
function sanitizeForTTS(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#+\s/g, '')
    .replace(/[_~]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 800) // Twilio TTS limit per <Say>
}

async function callGeminiVoice(
  turns: ConvTurn[],
  vendedor: db.Vendedor,
  apiKey: string,
): Promise<{ text: string; functionResults: string[] }> {

  // Build Gemini contents from conversation history
  const contents = turns.map(t => ({ role: t.role, parts: t.parts }))

  const systemInstruction = `Você é a assistente de voz do CRM Grupo MF Paris.
Está atendendo ${vendedor.nome} (${vendedor.cargo}) por telefone.
Data/hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.

REGRAS IMPORTANTES:
- Responda SEMPRE em português, de forma curta e direta (máximo 2 frases por resposta).
- Este é um canal de VOZ — sem listas, emojis, markdown ou formatação.
- Quando executar uma ação no CRM, confirme brevemente o que fez.
- Se não entender algo, peça para repetir com "Pode repetir?"
- Para encerrar, quando o usuário disser "encerrar", "tchau" ou "desligar", responda com uma despedida curta.
- Você pode buscar clientes, criar tarefas, consultar pedidos, registrar interações e muito mais.`

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
    tool_config: { function_calling_config: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.6, maxOutputTokens: 512 },
  }

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash']
  let lastErr: Error | null = null

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      lastErr = new Error(`Gemini ${model}: ${err}`)
      continue
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    if (!candidate) { lastErr = new Error('Sem resposta do Gemini'); continue }

    const functionResults: string[] = []
    let finalText = ''

    // Process function calls if any
    for (const part of candidate.content?.parts ?? []) {
      if (part.functionCall) {
        try {
          const result = await executeFunction(
            { name: part.functionCall.name, args: part.functionCall.args ?? {} },
            vendedor,
          )
          functionResults.push(result.message)
          log.info({ fn: part.functionCall.name, result: result.message }, '📞 Voice AI function call')
        } catch (e: any) {
          functionResults.push(`Erro ao executar ${part.functionCall.name}: ${e.message}`)
        }
      }
      if (part.text) {
        finalText += part.text
      }
    }

    // If only function calls, use their messages as the spoken response
    if (!finalText && functionResults.length > 0) {
      finalText = functionResults.join('. ')
    }

    return { text: finalText || 'Entendido.', functionResults }
  }

  throw lastErr ?? new Error('Gemini falhou')
}

// ── Route: initial call handler ───────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const callSid = req.body.CallSid || req.body.callSid || 'unknown'
  const from = req.body.From || req.body.from || ''
  const baseUrl = getBaseUrl(req)
  const gatherUrl = `${baseUrl}/api/twilio/voice-ai/gather`

  log.info({ callSid, from }, '📞 Voice AI: nova ligação')

  // Init session
  sessions.set(callSid, { turns: [] })

  // Try to identify caller by phone number
  let nomeVendedor = ''
  try {
    const numero = from.replace(/\D/g, '').replace(/^55/, '')
    const cliente = await db.findClienteByPhone(numero)
    if (cliente) nomeVendedor = `, ${cliente.razaoSocial}`
  } catch { /* not critical */ }

  const greeting = `Olá${nomeVendedor}! Aqui é a assistente do CRM Grupo MF Paris. Como posso ajudar?`

  res.type('text/xml').send(twimlSpeak(greeting, gatherUrl, callSid))
})

// ── Route: gather (speech → Gemini → TTS) ────────────────────────────────────

router.post('/gather', async (req: Request, res: Response) => {
  const callSid = req.body.CallSid || req.query.callSid as string || 'unknown'
  const speechResult = (req.body.SpeechResult || '').trim()
  const confidence = parseFloat(req.body.Confidence || '0')
  const baseUrl = getBaseUrl(req)
  const gatherUrl = `${baseUrl}/api/twilio/voice-ai/gather`

  log.info({ callSid, speechResult, confidence }, '📞 Voice AI: fala recebida')

  // If speech not recognized
  if (!speechResult) {
    res.type('text/xml').send(
      twimlSpeak('Não entendi. Pode repetir?', gatherUrl, callSid)
    )
    return
  }

  // Check for hangup intent
  const lower = speechResult.toLowerCase()
  if (['tchau', 'encerrar', 'desligar', 'finalizar', 'até mais', 'obrigado tchau'].some(w => lower.includes(w))) {
    sessions.delete(callSid)
    res.type('text/xml').send(twimlEnd('Até mais! Qualquer coisa é só ligar novamente. Tenha um ótimo dia!'))
    return
  }

  // Get or init session
  let session = sessions.get(callSid)
  if (!session) {
    session = { turns: [] }
    sessions.set(callSid, session)
  }

  // Load config for API key and identify vendedor
  const cfg = await loadConfig().catch(() => ({} as any))
  const apiKey = process.env.GEMINI_API_KEY || cfg.geminiApiKey || ''

  if (!apiKey) {
    res.type('text/xml').send(twimlEnd('Desculpe, a IA não está configurada no momento. Tente mais tarde.'))
    return
  }

  // Find vendedor by caller number (for permissions)
  let vendedor: db.Vendedor | null = null
  if (!session.vendedorId) {
    try {
      const from = req.body.From || ''
      const numero = from.replace(/\D/g, '').replace(/^55/, '')
      vendedor = await db.findVendedorByPhone(numero).catch(() => null)
      if (vendedor) session.vendedorId = vendedor.id
    } catch { /* not critical */ }
  } else {
    vendedor = await db.fetchVendedorById(session.vendedorId).catch(() => null)
  }

  // Fallback: use a generic "voice caller" context if vendedor not identified
  if (!vendedor) {
    vendedor = {
      id: 0, nome: 'Visitante', email: '', cargo: 'vendedor',
      telefone: '', ativo: true, createdAt: '',
      avatar: null, metaVendas: 0, metaLeads: 0, metaConversao: 0,
    } as unknown as db.Vendedor
  }

  // Add user turn
  session.turns.push({ role: 'user', parts: [{ text: speechResult }] })

  // Keep last 10 turns to avoid token overflow
  if (session.turns.length > 20) {
    session.turns = session.turns.slice(-20)
  }

  try {
    const { text, functionResults } = await callGeminiVoice(session.turns, vendedor, apiKey)

    // Add model turn
    session.turns.push({ role: 'model', parts: [{ text }] })

    log.info({ callSid, response: text.slice(0, 100) }, '📞 Voice AI: resposta Gemini')

    res.type('text/xml').send(twimlSpeak(text, gatherUrl, callSid))
  } catch (err: any) {
    log.error({ err, callSid }, '📞 Voice AI: erro Gemini')
    res.type('text/xml').send(
      twimlSpeak('Ocorreu um erro interno. Pode repetir o que disse?', gatherUrl, callSid)
    )
  }
})

export default router
