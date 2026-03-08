export const stageLabels: Record<string, string> = {
  'prospecção': 'Prospecção',
  'amostra': 'Amostra',
  'proposta': 'Proposta',
  'negociacao': 'Negociação',
  'follow_up': 'Follow-up',
  'cliente_ativo': 'Cliente Ativo',
  'perdido': 'Perdido'
}

export const transicoesPermitidas: Record<string, string[]> = {
  'prospecção': ['amostra', 'perdido'],
  'amostra': ['proposta', 'perdido'],
  'proposta': ['negociacao', 'perdido'],
  'negociacao': ['follow_up', 'proposta', 'perdido'],
  'follow_up': ['cliente_ativo', 'perdido'],
  'cliente_ativo': ['negociacao', 'perdido'],
  'perdido': ['prospecção', 'proposta']
}

export const subStatusAmostra = [
  'solicitada', 'aguardando_gerente', 'liberada', 'coletada', 'entregue', 'em_teste', 'aprovada', 'reprovada'
] as const

export const subStatusFollowUp = [
  'pedido_aprovado', 'em_producao', 'faturado', 'expedido', 'entregue', 'satisfacao_pendente', 'concluido'
] as const

export const subStatusAmostraLabels: Record<string, string> = {
  'solicitada': 'Solicitada',
  'aguardando_gerente': 'Aguardando Gerente',
  'liberada': 'Liberada',
  'coletada': 'Coletada',
  'entregue': 'Entregue',
  'em_teste': 'Em Teste',
  'aprovada': 'Aprovada',
  'reprovada': 'Reprovada',
}

export const subStatusFollowUpLabels: Record<string, string> = {
  'pedido_aprovado': 'Pedido Aprovado',
  'em_producao': 'Em Produção',
  'faturado': 'Faturado',
  'expedido': 'Expedido',
  'entregue': 'Entregue',
  'satisfacao_pendente': 'Satisfação Pendente',
  'concluido': 'Concluído',
}
