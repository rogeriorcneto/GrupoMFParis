import type { Cliente, Pedido } from '../types'

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

/** Deadline thresholds per stage (days) — auto-move */
export const autoMovePrazos: Record<string, { dias: number; destino: string }> = {
  'amostra': { dias: 45, destino: 'perdido' },
  'proposta': { dias: 60, destino: 'inativo' },
  'negociacao': { dias: 45, destino: 'perdido' },
  'follow_up': { dias: 60, destino: 'perdido' },
}

/** Returns clients that should be auto-moved due to expired deadlines */
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
      if (dias > prazo.dias) {
        result.push({ id: c.id, dias, etapa: c.etapa, destino: prazo.destino })
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
  const skipEtapas = new Set(['perdido', 'inativo', 'lead', 'follow_up', 'negociacao'])
  for (const c of clientes) {
    if (alreadyMovedIds.has(c.id)) continue
    if (skipEtapas.has(c.etapa)) continue
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

// ─── Prospecção: vendedor perde lead se não agir ───

/** Prospecção clients that should be returned to gerente (5d no contact OR 60d no amostra) */
export function getProspeccaoToReturn(
  clientes: Cliente[],
  gerenteId: number,
  alreadyReturnedIds: Set<number>
): { id: number; motivo: 'sem_contato_5d' | 'sem_amostra_60d'; dias: number }[] {
  const now = Date.now()
  const result: { id: number; motivo: 'sem_contato_5d' | 'sem_amostra_60d'; dias: number }[] = []
  for (const c of clientes) {
    if (c.etapa !== 'prospecção' || alreadyReturnedIds.has(c.id)) continue
    // Skip if already assigned to gerente (already returned)
    if (c.vendedorId === gerenteId) continue
    // 5 days without any contact
    const diasInativo = c.diasInativo || 0
    if (diasInativo >= 5) {
      result.push({ id: c.id, motivo: 'sem_contato_5d', dias: diasInativo })
      continue
    }
    // 60 days in prospecção without moving to amostra
    if (c.dataEntradaEtapa) {
      const diasEtapa = Math.floor((now - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
      if (diasEtapa >= 60) {
        result.push({ id: c.id, motivo: 'sem_amostra_60d', dias: diasEtapa })
      }
    }
  }
  return result
}

// ─── Lead: gerente tem 3 dias para atribuir ───

/** Leads assigned to gerente for 3+ days that need reassignment */
export function getLeadsNeedingAssignment(
  clientes: Cliente[],
  gerenteId: number
): { id: number; dias: number; razaoSocial: string }[] {
  const now = Date.now()
  const result: { id: number; dias: number; razaoSocial: string }[] = []
  for (const c of clientes) {
    if (c.etapa !== 'lead') continue
    if (c.vendedorId !== gerenteId) continue
    if (!c.dataEntradaEtapa) continue
    const dias = Math.floor((now - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
    if (dias >= 3) {
      result.push({ id: c.id, dias, razaoSocial: c.razaoSocial })
    }
  }
  return result
}

// ─── Gerente: pedidos pendentes há 2+ dias ───

/** Pedidos awaiting gerente approval for 2+ days */
export function getPedidosPendingApproval(
  pedidos: Pedido[]
): { id: number; dias: number; numero: string; clienteId: number }[] {
  const now = Date.now()
  const result: { id: number; dias: number; numero: string; clienteId: number }[] = []
  for (const p of pedidos) {
    if (p.status !== 'enviado') continue
    const created = p.dataEnvio || p.dataCriacao
    if (!created) continue
    const dias = Math.floor((now - new Date(created).getTime()) / 86400000)
    if (dias >= 2) {
      result.push({ id: p.id, dias, numero: p.numero, clienteId: p.clienteId })
    }
  }
  return result
}

// ─── Amostra: 45 dias → bloquear vendedor ───

/** Clientes em amostra que devem ser bloqueados (45+ dias sem resultado) */
export function getAmostraLocked(
  clientes: Cliente[],
  loggedUserId: number
): Cliente[] {
  const now = Date.now()
  return clientes.filter(c => {
    if (c.etapa !== 'amostra') return false
    if (c.vendedorId !== loggedUserId) return false
    if (c.resultadoAmostra) return false // already marked
    if (!c.dataEntradaEtapa) return false
    const dias = Math.floor((now - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
    return dias >= 45
  })
}

// ─── Follow-up: 45 dias após entrega sem update → bloquear ───

/** Clientes em follow_up entregues há 45+ dias sem atualização */
export function getFollowUpLocked(
  clientes: Cliente[],
  loggedUserId: number
): Cliente[] {
  const now = Date.now()
  return clientes.filter(c => {
    if (c.etapa !== 'follow_up') return false
    if (c.vendedorId !== loggedUserId) return false
    if (c.statusFollowUp !== 'entregue') return false
    // Check days since last update (use ultimaInteracao or dataEntradaEtapa)
    const lastUpdate = c.ultimaInteracao || c.dataEntradaEtapa
    if (!lastUpdate) return false
    const dias = Math.floor((now - new Date(lastUpdate).getTime()) / 86400000)
    return dias >= 45
  })
}
