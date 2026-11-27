import type { Cliente, Pedido } from '../types'

// ============================================================================
// Indicadores de negociação e alertas de carteira (Itens 17, 18 e 21)
// Funções puras e determinísticas — a MESMA função alimenta Dashboard,
// Relatórios e "Minha carteira hoje". Nenhum número pode divergir entre telas.
//
// Fonte da "última vez em negociação": historico_etapas do CRM
// (carregado em cliente.historicoEtapas com entradas { etapa, data }),
// complementado por dataEntradaEtapa quando o card está em negociação agora.
// Limitação conhecida: cards antigos migrados sem histórico não têm registro
// de passagens anteriores por negociação — nesses casos a data pode ser
// "nunca" mesmo havendo negociação antiga não registrada.
// ============================================================================

const dia10 = (v?: string | null): string | null => {
  const d = (v || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

const MS_DIA = 86400000

export function diffDiasISO(ate: string, de: string): number {
  return Math.floor((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / MS_DIA)
}

type CardNegociacao = Pick<Cliente, 'id' | 'etapa' | 'dataEntradaEtapa' | 'historicoEtapas'>

/** Todas as datas (YYYY-MM-DD) em que algum card entrou na etapa Negociação */
export function datasEmNegociacao(cards: readonly CardNegociacao[]): string[] {
  const datas: string[] = []
  for (const c of cards) {
    for (const h of c.historicoEtapas || []) {
      if (h.etapa !== 'negociacao') continue
      const d = dia10(h.data)
      if (d) datas.push(d)
    }
    if (c.etapa === 'negociacao') {
      const d = dia10(c.dataEntradaEtapa)
      if (d) datas.push(d)
    }
  }
  return datas
}

/** Data mais recente em que algum card da empresa esteve em Negociação (ou null = nunca) */
export function ultimaDataEmNegociacao(cards: readonly CardNegociacao[]): string | null {
  const datas = datasEmNegociacao(cards)
  if (datas.length === 0) return null
  return datas.sort()[datas.length - 1]
}

// ─── Item 17 — Negociações por vendedor ─────────────────────────────────────

export interface MotivoPerdaNegociacao {
  key: string
  label: string
  cards: Cliente[]
}

export interface ResumoNegociacoesVendedor {
  /** Cards em Negociação hoje, sem desfecho (situação de hoje — não depende do período) */
  abertas: Cliente[]
  /** Pedidos confirmados no período (mesma regra de negociacoesGanhasPeriodo dos indicadores unificados) */
  ganhas: Pedido[]
  /** Cards marcados como perdido com data da perda dentro do período */
  perdidas: Cliente[]
  /** Motivos de perda com a quantidade de cada um (ordem decrescente) */
  motivosPerda: MotivoPerdaNegociacao[]
}

export const MOTIVO_PERDA_LABELS: Record<string, string> = {
  preco: 'Preço',
  prazo: 'Prazo',
  qualidade: 'Qualidade',
  concorrencia: 'Concorrência',
  sem_resposta: 'Sem resposta',
  outro: 'Outro',
}

/**
 * Item 17 — negociações de um vendedor (ou de toda a equipe quando vendedorId é omitido).
 * Regras idênticas às dos indicadores unificados (relatoriosFase2):
 * - ganha = pedido confirmado (tipo venda) com data de aprovação/envio Omie/criação no período;
 * - perdida = card na etapa perdido com dataPerda (ou entrada na etapa) dentro do período.
 */
export function calcularNegociacoesVendedor(
  clientes: readonly Cliente[],
  pedidos: readonly Pedido[],
  periodo: { inicio: string; fim: string },
  vendedorId?: number,
): ResumoNegociacoesVendedor {
  const cards = clientes.filter(c =>
    !c.arquivadoDuplicata && (vendedorId === undefined || c.vendedorId === vendedorId)
  )
  const peds = pedidos.filter(p =>
    vendedorId === undefined || p.vendedorId === vendedorId
  )

  const abertas = cards.filter(c => c.etapa === 'negociacao')

  const ganhas = peds.filter(p => {
    if (p.status !== 'confirmado' || (p.tipo || 'venda') === 'bonificacao') return false
    const dt = dia10(p.dataAprovacao || p.dataEnvioOmie || p.dataCriacao)
    return !!dt && dt >= periodo.inicio && dt <= periodo.fim
  })

  const perdidas = cards.filter(c => {
    if (c.etapa !== 'perdido') return false
    const dt = dia10(c.dataPerda || c.dataEntradaEtapa)
    return !!dt && dt >= periodo.inicio && dt <= periodo.fim
  })

  const porMotivo = new Map<string, Cliente[]>()
  for (const c of perdidas) {
    const k = c.categoriaPerda || 'outro'
    const arr = porMotivo.get(k) || []
    arr.push(c)
    porMotivo.set(k, arr)
  }
  const motivosPerda: MotivoPerdaNegociacao[] = [...porMotivo.entries()]
    .map(([key, cs]) => ({ key, label: MOTIVO_PERDA_LABELS[key] || key, cards: cs }))
    .sort((a, b) => b.cards.length - a.cards.length || a.label.localeCompare(b.label))

  return { abertas, ganhas, perdidas, motivosPerda }
}

// ─── Item 18 — Clientes da carteira sem negociação há mais de 30 dias ───────

export interface EmpresaNegociacaoInput {
  chave: string
  vendedorId: number | null
  /** true quando a situação de compra conta na carteira (até 180 dias — mesma classificação unificada) */
  naCarteira: boolean
  cardPrincipalId: number
  cards: readonly CardNegociacao[]
}

export interface ClienteSemNegociacaoItem {
  chave: string
  cardPrincipalId: number
  vendedorId: number
  ultimaNegociacao: string | null
  /** null quando nunca esteve em negociação */
  diasSemNegociacao: number | null
}

/**
 * Item 18 — empresas da carteira (até 180 dias, com vendedor responsável)
 * sem nenhum card na etapa Negociação nos últimos 30 dias.
 * Ordenação determinística: "nunca" primeiro, depois mais dias sem negociação.
 */
export function calcularClientesSemNegociacao30d(
  empresas: readonly EmpresaNegociacaoInput[],
  hoje: string,
): ClienteSemNegociacaoItem[] {
  const itens: ClienteSemNegociacaoItem[] = []
  for (const e of empresas) {
    if (!e.naCarteira || e.vendedorId == null) continue
    const ultima = ultimaDataEmNegociacao(e.cards)
    if (ultima === null) {
      itens.push({ chave: e.chave, cardPrincipalId: e.cardPrincipalId, vendedorId: e.vendedorId, ultimaNegociacao: null, diasSemNegociacao: null })
      continue
    }
    const dias = diffDiasISO(hoje, ultima)
    if (dias > 30) {
      itens.push({ chave: e.chave, cardPrincipalId: e.cardPrincipalId, vendedorId: e.vendedorId, ultimaNegociacao: ultima, diasSemNegociacao: dias })
    }
  }
  return itens.sort((a, b) => {
    const da = a.diasSemNegociacao == null ? 999999 : a.diasSemNegociacao
    const db = b.diasSemNegociacao == null ? 999999 : b.diasSemNegociacao
    return db - da || a.chave.localeCompare(b.chave)
  })
}

// ─── Item 21 — Alerta de saída da carteira (150 / 180 dias) ─────────────────

export type AlertaSaidaCarteiraTipo = 'pre_alerta' | 'saiu'

/**
 * Classificação do alerta pelos dias sem compra:
 * - 150 a 180 dias: pré-alerta ("sai da carteira em X dias")
 * - mais de 180 dias: alerta máximo ("saiu da carteira")
 */
export function classificarAlertaSaidaCarteira(diasSemCompra: number | null): AlertaSaidaCarteiraTipo | null {
  if (diasSemCompra == null) return null
  if (diasSemCompra > 180) return 'saiu'
  if (diasSemCompra >= 150) return 'pre_alerta'
  return null
}

/** Dias restantes na carteira: a empresa sai ao completar 181 dias sem compra */
export function diasRestantesNaCarteira(diasSemCompra: number): number {
  return Math.max(0, 181 - diasSemCompra)
}

/** Data (YYYY-MM-DD) em que a empresa sai da carteira: última venda + 181 dias */
export function dataSaidaDaCarteira(ultimaVendaISO: string): string {
  const d = dia10(ultimaVendaISO)
  if (!d) return ''
  const ms = Date.parse(`${d}T00:00:00Z`) + 181 * MS_DIA
  return new Date(ms).toISOString().slice(0, 10)
}

export interface DecisaoSaidaCarteiraInput {
  cliente_id: number
  registrado_em: string
}

/**
 * O alerta máximo é desarmado quando existe decisão do gestor registrada
 * depois da saída da carteira (data do registro >= data da saída).
 */
export function decisaoDesarmaAlerta(
  decisoes: readonly DecisaoSaidaCarteiraInput[],
  clienteId: number,
  dataSaidaISO: string,
): boolean {
  if (!dataSaidaISO) return false
  return decisoes.some(d =>
    Number(d.cliente_id) === clienteId && dia10(d.registrado_em) !== null && dia10(d.registrado_em)! >= dataSaidaISO
  )
}
