export const stageLabels: Record<string, string> = {
  'prospecção': 'Prospecção',
  'amostra': 'Amostra',
  'homologado': 'Homologado',
  'cotacao': 'Cotação',
  'negociacao': 'Negociação',
  'pos_venda': 'Pós-Venda',
  'perdido': 'Perdido'
}

export const transicoesPermitidas: Record<string, string[]> = {
  'prospecção': ['amostra', 'perdido'],
  'amostra': ['homologado', 'perdido'],
  'homologado': ['cotacao', 'negociacao', 'perdido'],
  'cotacao': ['negociacao', 'homologado', 'perdido'],
  'negociacao': ['pos_venda', 'cotacao', 'homologado', 'perdido'],
  'pos_venda': ['negociacao'],
  'perdido': ['prospecção']
}
