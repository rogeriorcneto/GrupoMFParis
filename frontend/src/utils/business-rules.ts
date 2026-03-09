import type { Cliente } from '../types'

/** Score calculation: pure function for testability */
export function calcScore(
  etapa: string,
  valorEstimado: number | undefined,
  interacaoCount: number,
  diasInativo: number | undefined
): number {
  const baseEtapa: Record<string, number> = {
    'lead': 5, 'prospecção': 10, 'amostra': 25, 'amostra_perdida': 15, 'proposta': 40,
    'negociacao': 60, 'follow_up': 80, 'inativo': 50, 'perdido': 5
  }
  const base = baseEtapa[etapa] || 10
  const bonusValor = Math.min((valorEstimado || 0) / 10000, 15)
  const bonusInteracoes = Math.min(interacaoCount * 3, 15)
  const penalidade = Math.min((diasInativo || 0) * 0.5, 20)
  return Math.max(0, Math.min(100, Math.round(base + bonusValor + bonusInteracoes - penalidade)))
}

/** Deadline thresholds per stage (days) — auto-move to perdido */
export const autoMovePrazos: Record<string, number> = {
  'amostra': 45,
  'proposta': 30,
  'negociacao': 45,
  'follow_up': 60,
}

/** Returns clients that should be auto-moved to "perdido" due to expired deadlines */
export function getClientsToAutoMove(
  clientes: Cliente[],
  alreadyMovedIds: Set<number>
): { id: number; dias: number; etapa: string; destino: string }[] {
  const now = Date.now()
  const result: { id: number; dias: number; etapa: string; destino: string }[] = []
  for (const c of clientes) {
    if (!c.dataEntradaEtapa || alreadyMovedIds.has(c.id)) continue
    if (c.etapa === 'perdido' || c.etapa === 'inativo' || c.etapa === 'lead') continue
    const prazo = autoMovePrazos[c.etapa]
    if (prazo) {
      const dias = Math.floor((now - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
      if (dias > prazo) {
        result.push({ id: c.id, dias, etapa: c.etapa, destino: 'perdido' })
      }
    }
  }
  return result
}

/** Returns clients that should be auto-moved to "inativo" due to 90d without any activity */
export function getClientsToAutoInativo(
  clientes: Cliente[],
  alreadyMovedIds: Set<number>
): { id: number; dias: number; etapa: string }[] {
  const result: { id: number; dias: number; etapa: string }[] = []
  for (const c of clientes) {
    if (alreadyMovedIds.has(c.id)) continue
    if (c.etapa === 'perdido' || c.etapa === 'inativo' || c.etapa === 'lead') continue
    const dias = c.diasInativo || 0
    if (dias >= 90) {
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
