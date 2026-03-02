const GEMINI_API_KEY = 'AIzaSyCdF4ilAcd_vcn4h5P-5ih0RayRi4NzwAQ'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function callAI(
  messages: AIMessage[],
  systemInstruction: string
): Promise<string> {
  const contents = [
    { role: 'user', parts: [{ text: systemInstruction }] },
    { role: 'model', parts: [{ text: 'Entendido. Sou o Assistente IA do CRM Grupo MF Paris. Tenho acesso a todos os dados. Como posso ajudar?' }] },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  ]

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Sem resposta da IA.'
}

function fmt(c: any, vMap: Map<number, string>): string {
  return [
    c.razaoSocial,
    c.nomeFantasia || '',
    c.cnpj || '',
    c.etapa,
    c.score || 0,
    c.valorEstimado || 0,
    c.diasInativo || 0,
    vMap.get(c.vendedorId) || '?',
    `${c.enderecoMunicipio || ''}/${c.enderecoEstado || ''}`,
    c.contatoNome || '',
    c.contatoTelefone || '',
    c.contatoEmail || '',
  ].join('|')
}

export function buildCRMContext(ctx: {
  clientes: any[]
  pedidos: any[]
  vendedores: any[]
  interacoes: any[]
}): string {
  const { clientes, pedidos, vendedores, interacoes } = ctx

  const vMap = new Map<number, string>(vendedores.map((v: any) => [v.id, v.nome]))

  const ativos = clientes.filter(c => c.etapa !== 'perdido')
  const perdidos = clientes.filter(c => c.etapa === 'perdido')

  const porEtapa = clientes.reduce((acc: Record<string, number>, c) => {
    acc[c.etapa] = (acc[c.etapa] || 0) + 1
    return acc
  }, {})

  const porEstado = clientes.reduce((acc: Record<string, number>, c) => {
    const uf: string = c.enderecoEstado || 'N/A'
    acc[uf] = (acc[uf] || 0) + 1
    return acc
  }, {})

  const valorTotal = ativos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
  const inativos30 = ativos.filter(c => (c.diasInativo || 0) > 30).length
  const inativos60 = ativos.filter(c => (c.diasInativo || 0) > 60).length

  const pedidosPendentes = pedidos.filter(p => p.status === 'enviado')
  const pedidosConfirmados = pedidos.filter(p => p.status === 'confirmado')
  const faturamento = pedidosConfirmados.reduce((s, p) => s + p.totalValor, 0)

  const top20Score = [...ativos].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20)
  const top20Valor = [...ativos].filter(c => c.valorEstimado).sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0)).slice(0, 20)
  const top20Inativos = [...ativos].filter(c => (c.diasInativo || 0) > 0).sort((a, b) => (b.diasInativo || 0) - (a.diasInativo || 0)).slice(0, 20)

  const porVendedor = vendedores.map((v: any) => {
    const meus = ativos.filter(c => c.vendedorId === v.id)
    const val = meus.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    return `${v.nome}(${v.cargo}): ${meus.length} ativos | R$${val.toLocaleString('pt-BR')} carteira | meta R$${(v.metaVendas||0).toLocaleString('pt-BR')}`
  }).join('\n')

  const CSV_HEADER = 'nome|fantasia|cnpj|etapa|score|valor|diasInativo|vendedor|cidade/UF|contato|telefone|email'
  const top100Ativos = [...ativos].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 100)
  const listaAtivos = top100Ativos.map(c => fmt(c, vMap)).join('\n')
  const listaPerdidos = perdidos.slice(0, 30).map(c => fmt(c, vMap)).join('\n')

  return `Você é o Assistente de IA do CRM Grupo MF Paris. Responda SEMPRE em português do Brasil de forma objetiva.

## RESUMO EXECUTIVO
Total clientes: ${clientes.length} (${ativos.length} ativos, ${perdidos.length} perdidos)
Valor carteira ativa: R$ ${valorTotal.toLocaleString('pt-BR')}
Inativos +30d: ${inativos30} | +60d: ${inativos60}
Pedidos pendentes aprovação: ${pedidosPendentes.length}
Faturamento confirmado: R$ ${faturamento.toLocaleString('pt-BR')}
Total interações: ${interacoes.length}

## POR ETAPA
${Object.entries(porEtapa).map(([e, n]) => `${e}: ${n}`).join(' | ')}

## POR ESTADO (top 10)
${(Object.entries(porEstado) as [string, number][]).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([uf,n])=>`${uf}:${n}`).join(' | ')}

## EQUIPE
${porVendedor}

## TOP 20 SCORE
${CSV_HEADER}
${top20Score.map(c => fmt(c, vMap)).join('\n')}

## TOP 20 VALOR
${CSV_HEADER}
${top20Valor.map(c => fmt(c, vMap)).join('\n')}

## TOP 20 MAIS INATIVOS
${CSV_HEADER}
${top20Inativos.map(c => fmt(c, vMap)).join('\n')}

## TOP 100 CLIENTES ATIVOS POR SCORE (de ${ativos.length} total)
${CSV_HEADER}
${listaAtivos}

## CLIENTES PERDIDOS (${Math.min(perdidos.length, 150)} de ${perdidos.length})
${CSV_HEADER}
${listaPerdidos}

## PEDIDOS RECENTES (últimos 30)
numero|status|valor|data
${pedidos.slice(-30).map(p => `${p.numero}|${p.status}|R$${p.totalValor}|${(p.dataCriacao||'').slice(0,10)}`).join('\n')}

## INSTRUÇÕES
- Busque clientes por nome, fantasia ou CNPJ nos dados acima.
- Calcule métricas diretamente dos dados fornecidos.
- Use tabelas e listas quando útil.
- Nunca invente dados — use apenas os dados reais acima.`
}
