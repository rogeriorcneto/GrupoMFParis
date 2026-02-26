import type { Cliente } from '../types'

/** Score calculation: pure function for testability */
export function calcScore(
  etapa: string,
  valorEstimado: number | undefined,
  interacaoCount: number,
  diasInativo: number | undefined
): number {
  const baseEtapa: Record<string, number> = {
    'prospecção': 10, 'amostra': 25, 'homologado': 50,
    'negociacao': 70, 'pos_venda': 90, 'perdido': 5
  }
  const base = baseEtapa[etapa] || 10
  const bonusValor = Math.min((valorEstimado || 0) / 10000, 15)
  const bonusInteracoes = Math.min(interacaoCount * 3, 15)
  const penalidade = Math.min((diasInativo || 0) * 0.5, 20)
  return Math.max(0, Math.min(100, Math.round(base + bonusValor + bonusInteracoes - penalidade)))
}

/** Deadline thresholds per stage (days) */
export const autoMovePrazos: Record<string, number> = {
  'amostra': 30,
  'homologado': 75,
  'negociacao': 45,
}

/** Returns clients that should be auto-moved to "perdido" due to expired deadlines */
export function getClientsToAutoMove(
  clientes: Cliente[],
  alreadyMovedIds: Set<number>
): { id: number; dias: number; etapa: string }[] {
  const now = Date.now()
  const result: { id: number; dias: number; etapa: string }[] = []
  for (const c of clientes) {
    if (!c.dataEntradaEtapa || alreadyMovedIds.has(c.id)) continue
    if (c.etapa === 'perdido') continue
    const prazo = autoMovePrazos[c.etapa]
    if (!prazo) continue
    const dias = Math.floor((now - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
    if (dias > prazo) {
      result.push({ id: c.id, dias, etapa: c.etapa })
    }
  }
  return result
}

/** Calculate diasInativo from ultimaInteracao date */
export function calcDiasInativo(ultimaInteracao: string | undefined): number | null {
  if (!ultimaInteracao) return null
  return Math.floor((Date.now() - new Date(ultimaInteracao).getTime()) / 86400000)
}
