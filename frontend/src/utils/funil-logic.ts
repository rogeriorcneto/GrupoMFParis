import type { Cliente } from '../types'

export const prazosEtapa: Record<string, number> = { amostra: 30, homologado: 75, negociacao: 45, cotacao: 30 }

export function diasDesde(dateStr?: string): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export function getCardUrgencia(cliente: Cliente): 'normal' | 'atencao' | 'critico' {
  const dias = diasDesde(cliente.dataEntradaEtapa)
  const prazo = prazosEtapa[cliente.etapa]
  if (prazo) {
    if (dias >= prazo) return 'critico'
    if (dias >= prazo * 0.83) return 'atencao'
  }
  if ((cliente.diasInativo || 0) > 14) return 'atencao'
  return 'normal'
}

export function getNextAction(cliente: Cliente): { text: string; color: string } | null {
  const diasInativo = cliente.diasInativo || 0
  const diasEtapa = diasDesde(cliente.dataEntradaEtapa)
  switch (cliente.etapa) {
    case 'prospecção':
      if (diasInativo > 7) return { text: '📞 Ligar agora — inativo há ' + diasInativo + 'd', color: 'text-orange-600' }
      if (diasInativo > 3) return { text: '💬 Enviar WhatsApp de contato', color: 'text-blue-600' }
      return { text: '📧 Enviar apresentação', color: 'text-green-600' }
    case 'amostra':
      if (diasEtapa >= 25) return { text: '🚨 Cobrar retorno URGENTE', color: 'text-red-600' }
      if (diasEtapa >= 15) return { text: '📞 Follow-up da amostra', color: 'text-orange-600' }
      return { text: '⏳ Aguardar avaliação', color: 'text-gray-500' }
    case 'homologado':
      if (diasEtapa >= 60) return { text: '🚨 Agendar reunião URGENTE', color: 'text-red-600' }
      if (diasEtapa >= 30) return { text: '📞 Cobrar 1º pedido', color: 'text-orange-600' }
      return { text: '🤝 Preparar proposta', color: 'text-green-600' }
    case 'cotacao':
      if (diasEtapa >= 25) return { text: '🚨 Enviar cotação URGENTE', color: 'text-red-600' }
      if (diasEtapa >= 10) return { text: '📞 Follow-up de cotação', color: 'text-orange-600' }
      return { text: '📝 Preparar cotação', color: 'text-blue-600' }
    case 'negociacao':
      if (diasEtapa >= 35) return { text: '🚨 Cobrar resposta proposta', color: 'text-red-600' }
      if (diasEtapa >= 14) return { text: '📞 Follow-up proposta', color: 'text-orange-600' }
      return { text: '💬 Aguardar decisão', color: 'text-gray-500' }
    case 'pos_venda': {
      const diasPedido = diasDesde(cliente.dataUltimoPedido)
      if (!cliente.dataEntregaRealizada && !cliente.dataEntregaPrevista && cliente.statusEntrega !== 'entregue') return { text: '📅 Definir previsão de entrega', color: 'text-orange-600' }
      if (!cliente.dataEntregaRealizada && cliente.statusEntrega !== 'entregue') return { text: '🚚 Confirmar entrega realizada', color: 'text-blue-600' }
      if (cliente.statusFaturamento !== 'faturado') return { text: '💰 Faturar pedido', color: 'text-orange-600' }
      if (diasPedido >= 30) return { text: '🛒 Sugerir recompra — ' + diasPedido + 'd', color: 'text-purple-600' }
      if (diasPedido >= 20) return { text: '📞 Pós-venda — satisfação', color: 'text-blue-600' }
      return { text: '✅ Entregue e faturado', color: 'text-green-600' }
    }
    case 'perdido': {
      const diasPerdido = diasDesde(cliente.dataPerda)
      if (diasPerdido >= 60) return { text: '🔄 Pronto para reconquista!', color: 'text-green-600' }
      if (diasPerdido >= 45) return { text: '⏳ Reconquista em ' + (60 - diasPerdido) + 'd', color: 'text-blue-600' }
      return null
    }
    default: return null
  }
}

export function mapEtapaAgendor(etapa: string, status: string): string {
  const s = status.toLowerCase().trim()
  if (s === 'perdido' || s === 'lost') return 'perdido'
  const e = etapa.toLowerCase().trim()
  if (e.includes('contato') || e.includes('prospec')) return 'prospecção'
  if (e.includes('proposta') || e.includes('negocia')) return 'negociacao'
  if (e.includes('envio') || e.includes('pedido')) return 'homologado'
  if (e.includes('follow') || e.includes('pós') || e.includes('pos')) return 'pos_venda'
  if (e.includes('amostra')) return 'amostra'
  if (e.includes('homolog')) return 'homologado'
  return 'prospecção'
}

export function mapCategoriaPerdaAgendor(motivo: string): Cliente['categoriaPerda'] {
  const m = motivo.toLowerCase()
  if (m.includes('preço') || m.includes('preco') || m.includes('valor') || m.includes('caro')) return 'preco'
  if (m.includes('prazo') || m.includes('demor') || m.includes('tempo')) return 'prazo'
  if (m.includes('qualidade') || m.includes('produto')) return 'qualidade'
  if (m.includes('concorr')) return 'concorrencia'
  if (m.includes('resposta') || m.includes('retorno') || m.includes('contato')) return 'sem_resposta'
  return 'outro'
}

export function sortCards(
  cards: Cliente[],
  sortBy: 'urgencia' | 'score' | 'valor' | 'antigo' | 'recente',
): Cliente[] {
  return [...cards].sort((a, b) => {
    if (sortBy === 'urgencia') {
      const urgOrder = { critico: 0, atencao: 1, normal: 2 }
      const diff = urgOrder[getCardUrgencia(a)] - urgOrder[getCardUrgencia(b)]
      if (diff !== 0) return diff
      return (b.score || 0) - (a.score || 0)
    }
    if (sortBy === 'score') return (b.score || 0) - (a.score || 0)
    if (sortBy === 'antigo') {
      const da = a.dataEntradaEtapa ? new Date(a.dataEntradaEtapa).getTime() : 0
      const db2 = b.dataEntradaEtapa ? new Date(b.dataEntradaEtapa).getTime() : 0
      return da - db2
    }
    if (sortBy === 'recente') {
      const da = a.dataEntradaEtapa ? new Date(a.dataEntradaEtapa).getTime() : 0
      const db2 = b.dataEntradaEtapa ? new Date(b.dataEntradaEtapa).getTime() : 0
      return db2 - da
    }
    return (b.valorEstimado || 0) - (a.valorEstimado || 0)
  })
}
