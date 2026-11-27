export type OmieStatusTone = 'amber' | 'yellow' | 'blue' | 'green-light' | 'green' | 'neutral'

export interface OmieStatusDisplay {
  key: string
  label: string
  classes: string
  tone: OmieStatusTone
  recognized: boolean
  raw: string
}

const amber = 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
const yellow = 'bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30'
const blue = 'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30'
const greenLight = 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25'
const green = 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-500/35'
const neutral = 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:border-white/[0.10]'

const STATUS_DISPLAY: Record<string, Omit<OmieStatusDisplay, 'recognized' | 'raw'>> = {
  analise_financeiro: { key: 'analise_financeiro', label: 'Análise Financeira', classes: amber, tone: 'amber' },
  faturar: { key: 'faturar', label: 'Faturar', classes: yellow, tone: 'yellow' },
  separado_no_estoque: { key: 'separado_no_estoque', label: 'Separado no Estoque', classes: yellow, tone: 'yellow' },
  faturado: { key: 'faturado', label: 'Faturado', classes: blue, tone: 'blue' },
  coletado: { key: 'coletado', label: 'Coletado', classes: greenLight, tone: 'green-light' },
  entregue: { key: 'entregue', label: 'Entregue', classes: green, tone: 'green' },
  cancelado: { key: 'cancelado', label: 'Cancelado', classes: neutral, tone: 'neutral' },
  estornado: { key: 'estornado', label: 'Estornado', classes: neutral, tone: 'neutral' },
  desconhecido: { key: 'desconhecido', label: 'Desconhecido', classes: neutral, tone: 'neutral' },
}

/**
 * Etapas brutas do kanban de faturamento do Omie observadas nesta instalação.
 * Os códigos 10–50 são colunas configuráveis no Omie; esta tabela reflete o
 * mapeamento usado pelos scripts de verificação do backend deste repositório.
 */
export const OMIE_NUMERIC_ETAPA_TO_STATUS: Record<string, string> = {
  '10': 'analise_financeiro',
  '20': 'faturar',
  '30': 'separado_no_estoque',
  '40': 'faturado',
  '50': 'coletado',
  '60': 'entregue',
  '70': 'entregue',
  '80': 'entregue',
  '00': 'cancelado',
  '90': 'cancelado',
  '99': 'cancelado',
}

/** Valores canônicos/legados que o CRM já persistiu em pedidos.omie_status. */
export const OMIE_LEGACY_STATUS_TO_STATUS: Record<string, string> = {
  enviado: 'analise_financeiro',
  pedido_aprovado: 'analise_financeiro',
  analise_financeiro: 'analise_financeiro',
  analise_financeira: 'analise_financeiro',
  em_producao: 'faturar',
  a_faturar: 'faturar',
  faturar: 'faturar',
  separado_no_estoque: 'separado_no_estoque',
  faturado: 'faturado',
  expedido: 'coletado',
  em_transito: 'coletado',
  coletado: 'coletado',
  entregue: 'entregue',
  cancelado: 'cancelado',
  estornado: 'estornado',
  nao_encontrado: 'desconhecido',
  pendente: 'desconhecido',
  desconhecido: 'desconhecido',
}

function normalizeStatus(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-/.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Resolve qualquer forma já vista no banco (etapa numérica bruta, status
 * canônico legado ou texto normalizado) para o único selo visual do Omie.
 * Valores ausentes ou não reconhecidos viram o selo neutro "Desconhecido".
 */
export function getOmieStatusDisplay(rawStatus?: string | null): OmieStatusDisplay {
  const raw = String(rawStatus ?? '').trim()
  const numericKey = OMIE_NUMERIC_ETAPA_TO_STATUS[raw]
  const normalized = normalizeStatus(raw)
  const key = numericKey || OMIE_LEGACY_STATUS_TO_STATUS[normalized] || STATUS_DISPLAY[normalized]?.key || 'desconhecido'
  const display = STATUS_DISPLAY[key] || STATUS_DISPLAY.desconhecido

  return {
    ...display,
    recognized: key !== 'desconhecido',
    raw,
  }
}
