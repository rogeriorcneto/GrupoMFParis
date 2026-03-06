import { updateSession } from '../session.js'
import type { UserSession } from '../session.js'
import { log } from '../logger.js'
import * as db from '../database.js'

const MAX_AI_HISTORY = 20

/**
 * Build CRM context for a specific vendedor (WhatsApp version - more compact)
 */
async function buildWhatsAppContext(session: UserSession): Promise<string> {
  const v = session.vendedor
  const isGerente = v.cargo === 'gerente'

  const clientes = isGerente
    ? await db.fetchClientes()
    : await db.fetchClientesByVendedor(v.id)

  const vendedores = await db.fetchVendedores()

  const ativos = clientes.filter(c => c.etapa !== 'perdido')
  const perdidos = clientes.filter(c => c.etapa === 'perdido')

  const porEtapa = clientes.reduce((acc: Record<string, number>, c) => {
    acc[c.etapa] = (acc[c.etapa] || 0) + 1
    return acc
  }, {})

  const valorTotal = ativos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
  const inativos30 = ativos.filter(c => (c.diasInativo || 0) > 30).length

  const top10Score = [...ativos].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10)
  const top10Inativos = [...ativos].filter(c => (c.diasInativo || 0) > 0)
    .sort((a, b) => (b.diasInativo || 0) - (a.diasInativo || 0)).slice(0, 10)

  const fmt = (c: db.Cliente) =>
    `${c.razaoSocial}|${c.nomeFantasia || ''}|${c.etapa}|score:${c.score || 0}|R$${c.valorEstimado || 0}|${c.diasInativo || 0}d inativo`

  return `Você é a Assistente IA do CRM Grupo MF Paris via WhatsApp. Criada por Rogério Reis.

Personalidade: Direta, objetiva e útil. Respostas curtas e formatadas para WhatsApp (use *negrito*, _itálico_, listas com - ou •). NUNCA termine com "Como posso ajudar?" ou frases genéricas. Vá direto ao ponto. Responda em português do Brasil.

USUÁRIO: ${v.nome} (${v.cargo})
${isGerente ? 'Visão: TODOS os clientes da empresa' : 'Visão: apenas SEUS clientes'}

RESUMO:
- ${clientes.length} clientes (${ativos.length} ativos, ${perdidos.length} perdidos)
- Valor carteira: R$ ${valorTotal.toLocaleString('pt-BR')}
- Inativos +30d: ${inativos30}

POR ETAPA: ${Object.entries(porEtapa).map(([e, n]) => `${e}: ${n}`).join(' | ')}

EQUIPE: ${vendedores.map(ve => `${ve.nome}(${ve.cargo})`).join(', ')}

TOP 10 SCORE:
${top10Score.map(c => fmt(c)).join('\n')}

TOP 10 INATIVOS:
${top10Inativos.map(c => fmt(c)).join('\n')}

REGRAS:
- Se perguntarem quem te criou: "Fui criada pelo Rogério Reis, especialista em IA."
- Foco exclusivo no CRM Grupo MF Paris.
- Nunca invente dados. Use apenas os dados reais acima.
- Respostas formatadas para WhatsApp (curtas, com emojis moderados).
- Para sair do modo IA: usuário digita "menu" ou "0".`
}

/**
 * Start AI chat mode
 */
export async function startAIChat(senderNumber: string, session: UserSession): Promise<string> {
  updateSession(senderNumber, {
    state: 'chatting_ai',
    aiHistory: [],
  })

  const nome = session.vendedor.nome.split(' ')[0]
  return `🤖 *Assistente IA ativada*

E aí, ${nome}! Pode me perguntar qualquer coisa sobre seus clientes, pipeline, tarefas...

Exemplos:
- _Quais clientes estão inativos?_
- _Qual meu pipeline atual?_
- _Sugira estratégia para os clientes em negociação_

Para voltar ao menu, digite *menu*`
}

/**
 * Handle AI chat messages
 */
export async function handleAIChat(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    log.error('GEMINI_API_KEY não configurada para WhatsApp AI')
    return '❌ IA indisponível no momento. Tente novamente mais tarde.'
  }

  try {
    // Build context
    const systemInstruction = await buildWhatsAppContext(session)

    // Get/init history
    const history = session.aiHistory || []
    history.push({ role: 'user', content: text })

    // Trim history to avoid token overflow
    if (history.length > MAX_AI_HISTORY) {
      history.splice(0, history.length - MAX_AI_HISTORY)
    }

    // Build Gemini payload
    const contents = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Entendido, tenho os dados do CRM. Vou responder de forma direta via WhatsApp.' }] },
      ...history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ]

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      log.error({ error: errorText }, 'Erro na Gemini API (WhatsApp)')
      return '❌ Erro ao consultar a IA. Tente novamente.'
    }

    const geminiData = await geminiResponse.json() as any
    const response = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta da IA.'

    // Save to history
    history.push({ role: 'assistant', content: response })
    updateSession(senderNumber, { aiHistory: history })

    return response
  } catch (err) {
    log.error({ err }, 'Erro no handler IA WhatsApp')
    return '❌ Erro interno da IA. Tente novamente.'
  }
}
