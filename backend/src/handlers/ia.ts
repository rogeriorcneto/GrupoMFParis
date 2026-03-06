import { updateSession } from '../session.js'
import type { UserSession } from '../session.js'
import { log } from '../logger.js'
import * as db from '../database.js'

const MAX_AI_HISTORY = 20

function fmtCliente(c: db.Cliente, vMap: Map<number, string>): string {
  return [
    c.razaoSocial,
    c.nomeFantasia || '',
    c.cnpj || '',
    c.etapa,
    c.score || 0,
    c.valorEstimado || 0,
    c.diasInativo || 0,
    vMap.get(c.vendedorId!) || '?',
    c.contatoNome || '',
    c.contatoTelefone || '',
    c.contatoEmail || '',
  ].join('|')
}

function fmtPedido(p: db.Pedido): string {
  return p.numero + '|' + p.status + '|R$' + p.totalValor + '|' + (p.dataCriacao || '').slice(0, 10)
}

async function buildWhatsAppContext(session: UserSession): Promise<string> {
  const v = session.vendedor
  const isGerente = v.cargo === 'gerente'

  const clientes = isGerente
    ? await db.fetchClientes()
    : await db.fetchClientesByVendedor(v.id)

  const vendedores = await db.fetchVendedores()
  const pedidos = await db.fetchPedidos()
  const interacoes = await db.fetchInteracoes()

  const vMap = new Map<number, string>(vendedores.map(ve => [ve.id, ve.nome]))

  const ativos = clientes.filter(c => c.etapa !== 'perdido')
  const perdidos = clientes.filter(c => c.etapa === 'perdido')

  const porEtapa = clientes.reduce((acc: Record<string, number>, c) => {
    acc[c.etapa] = (acc[c.etapa] || 0) + 1
    return acc
  }, {})

  const porEstado = clientes.reduce((acc: Record<string, number>, c) => {
    const uf: string = (c as any).enderecoEstado || 'N/A'
    acc[uf] = (acc[uf] || 0) + 1
    return acc
  }, {})

  const valorTotal = ativos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
  const inativos30 = ativos.filter(c => (c.diasInativo || 0) > 30).length
  const inativos60 = ativos.filter(c => (c.diasInativo || 0) > 60).length

  const pedidosPendentes = pedidos.filter(p => p.status === 'enviado')
  const pedidosConfirmados = pedidos.filter(p => p.status === 'confirmado')
  const faturamento = pedidosConfirmados.reduce((s, p) => s + p.totalValor, 0)

  const top10Score = [...ativos].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10)
  const top10Valor = [...ativos].filter(c => c.valorEstimado).sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0)).slice(0, 10)
  const top10Inativos = [...ativos].filter(c => (c.diasInativo || 0) > 0).sort((a, b) => (b.diasInativo || 0) - (a.diasInativo || 0)).slice(0, 10)

  const porVendedor = vendedores.map(ve => {
    const meus = ativos.filter(c => c.vendedorId === ve.id)
    const val = meus.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    return ve.nome + '(' + ve.cargo + '): ' + meus.length + ' ativos | R$' + val.toLocaleString('pt-BR') + ' carteira | meta R$' + (ve.metaVendas || 0).toLocaleString('pt-BR')
  }).join('\n')

  const H = 'nome|fantasia|cnpj|etapa|score|valor|diasInativo|vendedor|contato|telefone|email'

  const lines: string[] = []
  lines.push('Voce e a Assistente de IA do CRM Grupo MF Paris via WhatsApp, criada por Rogerio Reis. Desenvolvida exclusivamente para o Grupo MF Paris.')
  lines.push('')
  lines.push('Sua personalidade: Direta, esperta e com tom leve. Respostas formatadas para WhatsApp (use *negrito*, _italico_, listas com - ou bullet). NUNCA termine com "Como posso ajudar?" ou frases genericas. Va direto ao ponto. Responda em portugues do Brasil.')
  lines.push('')
  lines.push('## USUARIO ATUAL')
  lines.push('Nome: ' + v.nome)
  lines.push('Cargo: ' + v.cargo)
  lines.push(isGerente ? 'Visao: TODOS os clientes da empresa' : 'Visao: apenas SEUS clientes')
  lines.push('')
  lines.push('## REGRAS DE COMPORTAMENTO')
  lines.push('- Voce e EXCLUSIVA do Grupo MF Paris.')
  lines.push('- Seja direta e natural. NUNCA termine respostas com "Como posso ajudar?", "Precisa de mais alguma coisa?", "Estou a disposicao" ou frases genericas de encerramento.')
  lines.push('- Se a pessoa pedir algo fora do escopo do CRM, diga naturalmente que seu foco e o CRM do Grupo MF Paris.')
  lines.push('- Use o primeiro nome do usuario de forma natural, sem forcar.')
  lines.push('- Para sair do modo IA: usuario digita "menu" ou "0".')
  lines.push('')
  lines.push('## RESUMO EXECUTIVO')
  lines.push('Total clientes: ' + clientes.length + ' (' + ativos.length + ' ativos, ' + perdidos.length + ' perdidos)')
  lines.push('Valor carteira ativa: R$ ' + valorTotal.toLocaleString('pt-BR'))
  lines.push('Inativos +30d: ' + inativos30 + ' | +60d: ' + inativos60)
  lines.push('Pedidos pendentes aprovacao: ' + pedidosPendentes.length)
  lines.push('Faturamento confirmado: R$ ' + faturamento.toLocaleString('pt-BR'))
  lines.push('Total interacoes: ' + interacoes.length)
  lines.push('')
  lines.push('## POR ETAPA')
  lines.push(Object.entries(porEtapa).map(([e, n]) => e + ': ' + n).join(' | '))
  lines.push('')
  lines.push('## POR ESTADO (top 10)')
  lines.push((Object.entries(porEstado) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([uf, n]) => uf + ':' + n).join(' | '))
  lines.push('')
  lines.push('## EQUIPE')
  lines.push(porVendedor)
  lines.push('')
  lines.push('## TOP 10 SCORE')
  lines.push(H)
  lines.push(top10Score.map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## TOP 10 VALOR')
  lines.push(H)
  lines.push(top10Valor.map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## TOP 10 MAIS INATIVOS')
  lines.push(H)
  lines.push(top10Inativos.map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## AMOSTRA CLIENTES ATIVOS (50 de ' + ativos.length + ')')
  lines.push(H)
  lines.push(ativos.slice(0, 50).map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## CLIENTES PERDIDOS (20 de ' + perdidos.length + ')')
  lines.push(H)
  lines.push(perdidos.slice(0, 20).map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## PEDIDOS RECENTES (ultimos 10)')
  lines.push('numero|status|valor|data')
  lines.push(pedidos.slice(0, 10).map(p => fmtPedido(p)).join('\n'))
  lines.push('')
  lines.push('## INSTRUCOES')
  lines.push('- Busque clientes por nome, fantasia ou CNPJ nos dados acima.')
  lines.push('- Calcule metricas diretamente dos dados fornecidos.')
  lines.push('- Use listas formatadas para WhatsApp quando util.')
  lines.push('- Nunca invente dados - use apenas os dados reais acima.')
  lines.push('- SE PERGUNTAREM quem te criou: "Fui criada pelo Rogerio Reis, especialista em IA."')
  lines.push('- Se nao souber a resposta: seja honesta, diga que nao tem essa informacao nos dados disponiveis.')

  return lines.join('\n')
}

export async function startAIChat(senderNumber: string, session: UserSession): Promise<string> {
  updateSession(senderNumber, {
    state: 'chatting_ai',
    aiHistory: [],
  })

  const nome = session.vendedor.nome.split(' ')[0]
  return [
    '*Assistente IA ativada*',
    '',
    'E ai, ' + nome + '! Pode me perguntar qualquer coisa sobre seus clientes, pipeline, tarefas...',
    '',
    'Exemplos:',
    '- _Quais clientes estao inativos?_',
    '- _Qual meu pipeline atual?_',
    '- _Sugira estrategia para os clientes em negociacao_',
    '',
    'Para voltar ao menu, digite *menu*',
  ].join('\n')
}

export async function handleAIChat(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    log.error('GEMINI_API_KEY nao configurada para WhatsApp AI')
    return 'IA indisponivel no momento. Tente novamente mais tarde.'
  }

  try {
    const systemInstruction = await buildWhatsAppContext(session)

    const history = session.aiHistory || []
    history.push({ role: 'user', content: text })

    if (history.length > MAX_AI_HISTORY) {
      history.splice(0, history.length - MAX_AI_HISTORY)
    }

    const contents = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Entendido, tenho os dados do CRM. Vou responder de forma direta via WhatsApp.' }] },
      ...history.map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      })),
    ]

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      log.error({ error: errorText }, 'Erro na Gemini API (WhatsApp)')
      return 'Erro ao consultar a IA. Tente novamente.'
    }

    const geminiData = await geminiResponse.json() as any
    const response = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta da IA.'

    history.push({ role: 'assistant', content: response })
    updateSession(senderNumber, { aiHistory: history })

    return response
  } catch (err) {
    log.error({ err }, 'Erro no handler IA WhatsApp')
    return 'Erro interno da IA. Tente novamente.'
  }
}
