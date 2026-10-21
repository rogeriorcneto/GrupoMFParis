import { supabase } from '../supabase.js'
import { fetchVendedorById } from '../database.js'
import type { SacSession } from '../session.js'
import { deleteSacSession } from '../session.js'

/**
 * SAC por bot (Anexo I, item 7.2).
 *
 * Atendimento automático para CLIENTES que mandam mensagem pro número do bot.
 * Escopo propositalmente restrito (leitura): consultar pedidos do próprio
 * cadastro, status do último pedido e contato do vendedor responsável.
 * Nenhuma função de escrita do CRM é exposta.
 */

const SAC_MENU = `*Como posso ajudar?*
1️⃣ Meus pedidos
2️⃣ Status do último pedido
3️⃣ Falar com meu vendedor
0️⃣ Encerrar atendimento`

export function sacWelcome(nomeFantasiaOuRazao: string): string {
  return `👋 Olá, *${nomeFantasiaOuRazao}*! Aqui é o atendimento automático do Grupo MF Paris.\n\n${SAC_MENU}`
}

interface PedidoRow {
  id: number
  numero: string
  status: string
  omie_status?: string | null
  total_valor: number
  data_criacao: string
  tipo?: string
}

async function fetchPedidosCliente(clienteId: number, limit = 5): Promise<PedidoRow[]> {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, numero, status, omie_status, total_valor, data_criacao, tipo')
    .eq('cliente_id', clienteId)
    .order('data_criacao', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Em elaboração',
  enviado: 'Aguardando aprovação interna',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  cancelamento_solicitado: 'Cancelamento em análise',
  faturado: 'Faturado',
  expedido: 'Expedido / a caminho',
  entregue: 'Entregue',
}

function statusAmigavel(p: PedidoRow): string {
  const omie = (p.omie_status || '').toLowerCase()
  if (omie && STATUS_LABEL[omie]) return STATUS_LABEL[omie]
  return STATUS_LABEL[p.status] || p.status
}

function formatPedido(p: PedidoRow): string {
  const valor = p.tipo === 'bonificacao' ? 'amostra/bonificação' : `R$ ${Number(p.total_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  const data = p.data_criacao ? new Date(p.data_criacao).toLocaleDateString('pt-BR') : '-'
  return `• ${p.numero} — ${statusAmigavel(p)} — ${valor} (${data})`
}

export async function handleSACMessage(senderNumber: string, session: SacSession, text: string): Promise<string> {
  const lower = text.toLowerCase().trim()

  if (lower === '0' || lower === 'sair' || lower === 'tchau' || lower === 'encerrar') {
    deleteSacSession(senderNumber)
    return '👋 Atendimento encerrado. Quando precisar, é só mandar mensagem por aqui!'
  }

  // 1 — Meus pedidos
  if (lower === '1' || /pedidos?\b/.test(lower)) {
    const pedidos = await fetchPedidosCliente(session.clienteId, 5).catch(() => null)
    if (!pedidos) return '⚠️ Não consegui consultar seus pedidos agora. Tente novamente em instantes.'
    if (pedidos.length === 0) return `Você ainda não tem pedidos registrados.\n\n${SAC_MENU}`
    return `🧾 *Seus últimos pedidos:*\n\n${pedidos.map(formatPedido).join('\n')}\n\n${SAC_MENU}`
  }

  // 2 — Status do último pedido / entrega
  if (lower === '2' || /status|entrega|pedido.*status|status.*pedido|onde.*(tá|esta|está)/.test(lower)) {
    const pedidos = await fetchPedidosCliente(session.clienteId, 1).catch(() => null)
    if (!pedidos) return '⚠️ Não consegui consultar agora. Tente novamente em instantes.'
    if (pedidos.length === 0) return `Você ainda não tem pedidos registrados.\n\n${SAC_MENU}`
    const p = pedidos[0]
    return `📦 *Último pedido ${p.numero}*\n\nStatus: *${statusAmigavel(p)}*\nData: ${new Date(p.data_criacao).toLocaleDateString('pt-BR')}\n\n${SAC_MENU}`
  }

  // 3 — Falar com vendedor
  if (lower === '3' || /vendedor|atendente|humano|pessoa|falar com|contato/.test(lower)) {
    const { data: cli } = await supabase.from('clientes').select('vendedor_id').eq('id', session.clienteId).maybeSingle()
    if (!cli?.vendedor_id) {
      return `📞 Para falar com nossa equipe, ligue para a matriz ou responda esta conversa que encaminhamos seu contato.\n\n${SAC_MENU}`
    }
    const vend = await fetchVendedorById(cli.vendedor_id).catch(() => null)
    if (!vend) {
      return `📞 Não localizei seu vendedor agora. Tente novamente em instantes.\n\n${SAC_MENU}`
    }
    const fone = vend.telefone ? `\n📱 ${vend.telefone}` : ''
    return `👤 *Seu vendedor:* ${vend.nome}${fone}\n\nEle já tem acesso a esta conversa pelo CRM.\n\n${SAC_MENU}`
  }

  return `Não entendi sua mensagem. ${SAC_MENU}`
}
