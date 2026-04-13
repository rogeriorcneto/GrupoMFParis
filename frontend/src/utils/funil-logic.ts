import type { Cliente } from '../types'

export const prazosEtapa: Record<string, number> = { amostra: 45, proposta: 60, negociacao: 45, follow_up: 60 }

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
      if (diasInativo >= 5) return { text: '🚨 URGENTE: sem contato há ' + diasInativo + 'd — lead será devolvido!', color: 'text-red-600' }
      if (diasInativo >= 3) return { text: '📞 Ligar agora — inativo há ' + diasInativo + 'd (prazo: 5d)', color: 'text-orange-600' }
      if (diasInativo > 1) return { text: '💬 Enviar WhatsApp de contato', color: 'text-blue-600' }
      return { text: '📧 Enviar apresentação', color: 'text-green-600' }
    case 'amostra': {
      const sub = cliente.statusAmostra
      if (sub === 'solicitada') return { text: '⏳ Aguardando aprovação gerente', color: 'text-yellow-600' }
      if (sub === 'aguardando_gerente') return { text: '👤 Gerente precisa aprovar', color: 'text-orange-600' }
      if (sub === 'liberada') return { text: '� Aguardando faturamento', color: 'text-blue-600' }
      if (sub === 'coletada') return { text: '🚚 Amostra em trânsito', color: 'text-blue-600' }
      if (sub === 'entregue') return { text: '🔬 Aguardar teste do cliente', color: 'text-gray-500' }
      if (sub === 'em_teste') {
        if (diasEtapa >= 40) return { text: '🚨 Cobrar resultado URGENTE (45d)', color: 'text-red-600' }
        if (diasEtapa >= 25) return { text: '📞 Follow-up resultado amostra', color: 'text-orange-600' }
        return { text: '⏳ Em teste — aguardar resultado', color: 'text-gray-500' }
      }
      if (diasEtapa >= 40) return { text: '🚨 Cobrar retorno URGENTE', color: 'text-red-600' }
      if (diasEtapa >= 20) return { text: '📞 Follow-up da amostra', color: 'text-orange-600' }
      return { text: '⏳ Aguardar avaliação', color: 'text-gray-500' }
    }
    case 'proposta':
      if (diasEtapa >= 50) return { text: '🚨 Enviar proposta URGENTE (' + (60 - diasEtapa) + 'd restantes!)', color: 'text-red-600' }
      if (diasEtapa >= 30) return { text: '📞 Follow-up da proposta — ' + (60 - diasEtapa) + 'd restantes', color: 'text-orange-600' }
      return { text: '📝 Preparar proposta comercial', color: 'text-blue-600' }
    case 'negociacao':
      if (diasEtapa >= 35) return { text: '🚨 Cobrar resposta proposta', color: 'text-red-600' }
      if (diasEtapa >= 14) return { text: '📞 Follow-up negociação', color: 'text-orange-600' }
      return { text: '💬 Aguardar decisão', color: 'text-gray-500' }
    case 'follow_up': {
      const sub = cliente.statusFollowUp
      if (sub === 'aguardando_aprovacao_gerente') return { text: '⏳ Aguardando aprovação da gerência', color: 'text-amber-600' }
      if (sub === 'pedido_aprovado') return { text: '🏭 Aguardando produção', color: 'text-blue-600' }
      if (sub === 'em_producao') return { text: '🏭 Em produção', color: 'text-blue-600' }
      if (sub === 'faturado') return { text: '📄 Faturado — aguardar expedição', color: 'text-blue-600' }
      if (sub === 'expedido') return { text: '� Expedido — em trânsito', color: 'text-blue-600' }
      if (sub === 'entregue') return { text: '📋 Entregue — avaliar satisfação', color: 'text-green-600' }
      if (sub === 'satisfacao_pendente') return { text: '⭐ Coletar feedback do cliente', color: 'text-purple-600' }
      if (sub === 'concluido') return { text: '✅ Ciclo concluído — acompanhar recompra', color: 'text-green-600' }
      if (diasEtapa >= 50) return { text: '📦 Follow-up parado há ' + diasEtapa + 'd', color: 'text-red-600' }
      return { text: '📦 Acompanhar logística', color: 'text-blue-600' }
    }
    case 'lead': {
      const diasLead = diasDesde(cliente.dataEntradaEtapa)
      if (diasLead >= 3) return { text: '🚨 Lead há ' + diasLead + 'd sem vendedor! Atribuir agora.', color: 'text-red-600' }
      if (diasLead >= 2) return { text: '⚠️ Lead há ' + diasLead + 'd — atribuir vendedor (prazo: 3d)', color: 'text-orange-600' }
      return { text: '📋 Avaliar e encaminhar para prospecção', color: 'text-blue-600' }
    }
    case 'amostra_perdida': {
      const tentativa = cliente.tentativaAmostra || 0
      if (tentativa >= 2) return { text: '❌ Sem mais tentativas — mover para Perdido', color: 'text-red-600' }
      return { text: '🔄 2ª tentativa disponível — reenviar amostra', color: 'text-amber-600' }
    }
    case 'inativo': {
      const diasIn = cliente.diasInativo || 0
      if (diasIn >= 180) return { text: '� Inativo há ' + diasIn + 'd — avaliar descarte', color: 'text-red-600' }
      if (diasIn >= 120) return { text: '📞 Tentar reativação urgente', color: 'text-orange-600' }
      return { text: '📋 Avaliar reativação — inativo há ' + diasIn + 'd', color: 'text-blue-600' }
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
  if (e.includes('proposta')) return 'proposta'
  if (e.includes('negocia')) return 'negociacao'
  if (e.includes('envio') || e.includes('pedido')) return 'negociacao'
  if (e.includes('follow') || e.includes('pós') || e.includes('pos')) return 'follow_up'
  if (e.includes('amostra')) return 'amostra'
  if (e.includes('homolog')) return 'proposta'
  if (e.includes('ativo') || e.includes('carteira')) return 'follow_up'
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
