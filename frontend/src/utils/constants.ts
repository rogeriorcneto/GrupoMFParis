export const stageLabels: Record<string, string> = {
  'prospecção': 'Prospecção',
  'amostra': 'Amostra',
  'homologado': 'Homologado',
  'negociacao': 'Negociação',
  'pos_venda': 'Pós-Venda',
  'perdido': 'Perdido'
}

export const transicoesPermitidas: Record<string, string[]> = {
  'prospecção': ['amostra', 'perdido'],
  'amostra': ['homologado', 'perdido'],
  'homologado': ['negociacao', 'perdido'],
  'negociacao': ['pos_venda', 'homologado', 'perdido'],
  'pos_venda': ['negociacao'],
  'perdido': ['prospecção']
}
