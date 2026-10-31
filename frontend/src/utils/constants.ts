export const stageLabels: Record<string, string> = {
  'lead': 'Leads',
  'prospecção': 'Prospecção',
  'amostra': 'Amostra',
  'amostra_perdida': 'Amostra Finalizada',
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
  'proposta': ['negociacao', 'amostra', 'inativo', 'perdido'],
  'negociacao': ['follow_up', 'perdido'],
  'follow_up': ['proposta', 'negociacao', 'perdido'],
  'inativo': ['prospecção', 'proposta', 'perdido'],
  'perdido': ['prospecção', 'proposta']
}

export const subStatusAmostra = [
  'solicitada', 'aguardando_gerente', 'liberada', 'coletada', 'entregue', 'em_teste', 'aprovada', 'reprovada', 'cancelamento_pendente'
] as const

export const subStatusFollowUp = [
  'aguardando_aprovacao_gerente', 'pedido_aprovado', 'em_producao', 'faturado', 'expedido', 'entregue', 'satisfacao_pendente', 'concluido', 'cancelado'
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
  'cancelamento_pendente': 'Cancelamento Pendente',
}

export const subStatusFollowUpLabels: Record<string, string> = {
  'aguardando_aprovacao_gerente': 'Aguardando Aprov. Gerência',
  'pedido_aprovado': 'Aguardando Faturamento',
  'em_producao': 'Em Produção',
  'faturado': 'Faturado',
  'expedido': 'Expedido',
  'entregue': 'Entregue',
  'satisfacao_pendente': 'Satisfação Pendente',
  'concluido': 'Concluído',
  'novo_ciclo_iniciado': 'Novo Ciclo Iniciado',
  'cancelado': 'Cancelado (Omie)',
}

/** Status do kanban de pedidos no Omie: etapa crua (10-80) ou canônica → label */
export const omieEtapaLabels: Record<string, string> = {
  '10': 'Análise Financeiro',
  '20': 'Faturar',
  '30': 'Separado no Estoque',
  '40': 'Faturado',
  '50': 'Coletado',
  '60': 'Entregue',
  '70': 'Entregue',
  '80': 'Entregue',
  analise_financeiro: 'Análise Financeiro',
  faturar: 'Faturar',
  separado_no_estoque: 'Separado no Estoque',
  faturado: 'Faturado',
  coletado: 'Coletado',
  entregue: 'Entregue',
}
export const labelOmieEtapa = (s?: string | null) => (s ? omieEtapaLabels[s] || s : s)
