export interface PaymentTermGroup {
  label: string
  options: string[]
}

export const DEFAULT_PAYMENT_TERM = 'À vista'

export const PAYMENT_TERM_GROUPS: PaymentTermGroup[] = [
  {
    label: 'Pagamento Direto (Único)',
    options: ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '30 dias', '45 dias', '60 dias', '90 dias'],
  },
  {
    label: 'Intervalos Progressivos (7 em 7 dias)',
    options: [
      '7/14',
      '7/14/21',
      '7/14/21/28',
      '7/14/21/28/35',
      '7/14/21/28/35/42',
      '7/14/21/28/35/42/49',
      '7/14/21/28/35/42/49/56',
      '7/14/21/28/35/42/49/56/63',
      '7/14/21/28/35/42/49/56/63/70',
    ],
  },
  {
    label: 'Série começando em 14',
    options: ['14/21', '14/21/28', '14/21/28/35', '14/21/28/35/42', '14/21/28/35/42/49', '14/21/28/35/42/49/56'],
  },
  {
    label: 'Série começando em 28',
    options: ['28/35', '28/35/42', '28/42/56', '28/35/42/49', '28/35/42/49/56'],
  },
  {
    label: 'Dias Únicos (C)',
    options: ['2 dias (C)', '5 dias', '12 dias (C)', '30 dias (C)'],
  },
  {
    label: 'Com Entrada',
    options: ['À vista/30', 'À vista/30/60/90', 'À vista/30/60/90/120', 'À vista/30/60/90/120/150'],
  },
  {
    label: 'Mensais',
    options: ['30/60/90', '30/60/90/120', '30/60/90/120/150', '30/60/90/120/150/180'],
  },
  {
    label: 'Parcelas',
    options: ['4 parcelas', '5 parcelas', '6 parcelas', '8 parcelas', '36 parcelas', '48 parcelas'],
  },
]
