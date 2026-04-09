export interface PaymentTermGroup {
  label: string
  options: string[]
}

export const DEFAULT_PAYMENT_TERM = 'À vista'

export const PAYMENT_TERM_GROUPS: PaymentTermGroup[] = [
  {
    label: 'Pagamento Direto (Único)',
    options: ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '35 dias'],
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
    options: ['14/21', '14/21/28', '14/28', '14/28/42', '14/21/28/35', '14/21/28/35/42', '14/21/28/35/42/49', '14/21/28/35/42/49/56'],
  },
  {
    label: 'Série começando em 28',
    options: ['28/35', '28/35/42', '28/42/56', '28/35/42/49', '28/35/42/49/56'],
  },
]
