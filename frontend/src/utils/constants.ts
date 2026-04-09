export const stageLabels: Record<string, string> = {
  'lead': 'Leads',
  'prospecção': 'Prospecção',
  'amostra': 'Amostra',
  'amostra_perdida': 'Amostra Perdida',
  'proposta': 'Proposta',
  'negociacao': 'Negociação',
  'follow_up': 'Follow-up',
  'inativo': 'Clientes Inativos',
  'perdido': 'Perdido'
}

export const transicoesPermitidas: Record<string, string[]> = {
  'lead': ['prospecção'],
  'prospecção': ['lead', 'amostra', 'perdido'],
  'amostra': ['proposta', 'amostra_perdida'],
  'amostra_perdida': ['amostra', 'perdido'],
  'proposta': ['negociacao', 'inativo', 'perdido'],
  'negociacao': ['follow_up', 'proposta', 'perdido'],
  'follow_up': ['proposta', 'negociacao', 'perdido'],
  'inativo': ['prospecção', 'proposta', 'perdido'],
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
