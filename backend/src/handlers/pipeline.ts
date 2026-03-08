import * as db from '../database.js'
import type { UserSession } from '../session.js'
import { getMenuText } from './auth.js'
import { STAGE_LABELS } from '../constants.js'

const STAGE_ICONS: Record<string, string> = {
  'prospecção': '🔵', 'amostra': '🟡', 'proposta': '🟢',
  'negociacao': '🟠', 'follow_up': '📦', 'cliente_ativo': '✅', 'perdido': '🔴',
}


function formatCurrency(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export async function handlePipeline(session: UserSession): Promise<string> {
  const isGerente = session.vendedor.cargo === 'gerente'
  const clientes = isGerente
    ? await db.fetchClientes()
    : await db.fetchClientesByVendedor(session.vendedor.id)

  if (clientes.length === 0) {
    return '📊 Nenhum cliente no pipeline.\n\n' + getMenuText()
  }

  // Agrupar por etapa
  const stages = ['prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up', 'cliente_ativo', 'perdido']
  const groups = new Map<string, { count: number; valor: number }>()
  for (const stage of stages) {
    groups.set(stage, { count: 0, valor: 0 })
  }

  let totalValor = 0
  let totalClientes = 0
  let clienteAtivoCount = 0

  for (const c of clientes) {
    const g = groups.get(c.etapa) || { count: 0, valor: 0 }
    g.count++
    g.valor += c.valorEstimado || 0
    groups.set(c.etapa, g)
    totalValor += c.valorEstimado || 0
    totalClientes++
    if (c.etapa === 'cliente_ativo') clienteAtivoCount++
  }

  const taxaConversao = totalClientes > 0 ? ((clienteAtivoCount / totalClientes) * 100).toFixed(1) : '0'

  let msg = `📊 *${isGerente ? 'Pipeline Geral' : 'Seu Pipeline'}*\n\n`

  for (const stage of stages) {
    const g = groups.get(stage)!
    if (g.count === 0) continue
    const icon = STAGE_ICONS[stage] || '⚪'
    const label = STAGE_LABELS[stage] || stage
    msg += `${icon} ${label}: *${g.count}* clientes — ${formatCurrency(g.valor)}\n`
  }

  msg += `\n💰 *Total pipeline:* ${formatCurrency(totalValor)}\n`
  msg += `📈 *Taxa conversão:* ${taxaConversao}%\n`

  // Meta do vendedor
  if (session.vendedor.metaVendas > 0) {
    const clienteAtivoValor = groups.get('cliente_ativo')?.valor || 0
    const pctMeta = ((clienteAtivoValor / session.vendedor.metaVendas) * 100).toFixed(0)
    msg += `🎯 *Meta vendas:* ${formatCurrency(session.vendedor.metaVendas)} (progresso: ${pctMeta}%)\n`
  }

  msg += `\n🔙 Envie *menu* para voltar`

  return msg
}
