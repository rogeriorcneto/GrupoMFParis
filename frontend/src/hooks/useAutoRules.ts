import { useCallback, useEffect, useRef } from 'react'
import type { Cliente, Interacao, Atividade, Vendedor, Pedido } from '../types'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { calcScore, calcDiasInativo, getLeadsNeedingAssignment, getPedidosPendingApproval, getNegociacaoStaleAlert } from '../utils/business-rules'
import { chaveClienteFunil } from '../utils/funil-logic'

interface UseAutoRulesParams {
  clientes: Cliente[]
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  interacoes: Interacao[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  pedidos: Pedido[]
  setAtividades: React.Dispatch<React.SetStateAction<Atividade[]>>
  addNotificacao: (tipo: 'info' | 'warning' | 'error' | 'success', titulo: string, mensagem: string, clienteId?: number) => void
}

/**
 * Encapsulates all automatic business rules:
 * - Recalculate diasInativo every hour
 * - Auto-assign orphan clients to gerente
 * - Auto-move clients to "perdido" when stage deadlines expire
 * - Dynamic score recalculation with debounced persistence
 */
export function useAutoRules({
  clientes, setClientes, interacoes, vendedores, loggedUser, pedidos, setAtividades, addNotificacao
}: UseAutoRulesParams) {
  // Refs para ler valores atuais sem ser dependência reativa — evita re-render em loop
  const clientesRef = useRef(clientes)
  clientesRef.current = clientes
  const vendedoresRef = useRef(vendedores)
  vendedoresRef.current = vendedores
  const pedidosRef = useRef(pedidos)
  pedidosRef.current = pedidos
  const loggedUserRef = useRef(loggedUser)
  loggedUserRef.current = loggedUser

  // Recalculate diasInativo based on ultimaInteracao and persist (runs on mount + every hour)
  const recalcDiasInativo = useCallback(() => {
    setClientes(prev => {
      const changedIds: { id: number; diasInativo: number }[] = []
      const updated = prev.map(c => {
        const dias = calcDiasInativo(c.ultimaInteracao)
        if (dias === null || dias === (c.diasInativo || 0)) return c
        changedIds.push({ id: c.id, diasInativo: dias })
        return { ...c, diasInativo: dias }
      })
      if (changedIds.length > 0) {
        // Persist outside setState via microtask — batch update instead of N×1
        queueMicrotask(async () => {
          try {
            await db.updateClientesBatch(changedIds.map(({ id, diasInativo }) => ({ id, changes: { diasInativo } })))
          } catch (err) { logger.error('Erro ao persistir diasInativo batch:', err) }
        })
        return updated
      }
      return prev
    })
  }, [setClientes])

  useEffect(() => {
    recalcDiasInativo()
    const interval = setInterval(recalcDiasInativo, 3600000) // recalcula a cada 1 hora
    return () => clearInterval(interval)
  }, [recalcDiasInativo])

  // IMPORTANTE (Fase 2 — Item 10):
  // As antigas regras automáticas de navegador que:
  //   1) atribuíam clientes sem vendedor (vendedorId = null) ao primeiro gerente ativo (Rafael),
  //   2) devolviam cards de Prospecção (>5d / >60d) para o primeiro gerente ativo (Rafael), e
  //   3) moviam cards sozinhos de etapa para 'inativo'/'perdido' ao abrir o navegador
  // foram DESATIVADAS permanentemente porque:
  //   - Clientes sem vendedor pertencem ao Banco de Clientes / Banco de Prospectos (vendedor_id = null);
  //   - A cadência de 15 dias e a situação de compra são controladas pelos indicadores/selos sem roubar carteira nem mover etapas silenciosamente no navegador.

  // Item 4: Score dinâmico — recalcula automaticamente e persiste (debounced, threshold 5pts)
  // Deps: apenas interacoes. clientes é lido via setClientes funcional para evitar o ciclo
  // render→effect→setClientes→render→effect.
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // Pre-build interaction count map O(n) instead of O(n²)
    const interCountMap = new Map<number, number>()
    interacoes.forEach(i => { interCountMap.set(i.clienteId, (interCountMap.get(i.clienteId) || 0) + 1) })

    setClientes(prev => {
      // Unifica interações e score por empresa para que todos os ciclos da mesma empresa exibam exatamente o mesmo Score
      const interPorEmpresa = new Map<string, number>()
      for (const c of prev) {
        if (c.arquivadoDuplicata) continue
        const k = chaveClienteFunil(c)
        interPorEmpresa.set(k, (interPorEmpresa.get(k) || 0) + (interCountMap.get(c.id) || 0))
      }
      const maxScorePorEmpresa = new Map<string, number>()
      for (const c of prev) {
        if (c.arquivadoDuplicata) continue
        const k = chaveClienteFunil(c)
        const s = calcScore(c.etapa, c.valorEstimado || c.valorProposta, interPorEmpresa.get(k) || 0, c.diasInativo)
        const atual = maxScorePorEmpresa.get(k) ?? 0
        if (s > atual) maxScorePorEmpresa.set(k, s)
      }

      const changedIds: { id: number; score: number; oldScore: number }[] = []
      const updated = prev.map(c => {
        if (c.arquivadoDuplicata) return c
        const newScore = maxScorePorEmpresa.get(chaveClienteFunil(c)) ?? calcScore(c.etapa, c.valorEstimado, interCountMap.get(c.id) || 0, c.diasInativo)
        if (c.score !== newScore) { changedIds.push({ id: c.id, score: newScore, oldScore: c.score || 0 }); return { ...c, score: newScore } }
        return c
      })
      if (changedIds.length === 0) return prev

      // Persist only scores that changed by 5+ points, debounced — batch update
      const significantChanges = changedIds.filter(({ score, oldScore }) => Math.abs(oldScore - score) >= 5)
      if (significantChanges.length > 0) {
        if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current)
        scoreTimerRef.current = setTimeout(async () => {
          try {
            await db.updateClientesBatch(significantChanges.map(({ id, score }) => ({ id, changes: { score } })))
          } catch (err) { logger.error('Erro ao persistir scores batch:', err) }
        }, 3000)
      }
      return updated
    })
  }, [interacoes, setClientes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Regra legada de devolver Prospecção (>5d / >60d) ao primeiro gerente ativo (Rafael)
  // desativada permanentemente — ver comentário acima.

  // ─── Lead: notificar gerente se lead sem vendedor há 3+ dias ───
  const leadNotifRef = useRef(false)
  useEffect(() => {
    if (leadNotifRef.current) return
    const loggedUser = loggedUserRef.current
    const clientes = clientesRef.current
    const vendedores = vendedoresRef.current
    if (!loggedUser || loggedUser.cargo !== 'gerente') return
    if (clientes.length === 0 || vendedores.length === 0) return
    leadNotifRef.current = true
    setTimeout(() => { leadNotifRef.current = false }, 3600000)

    const gerente = vendedores.find(v => v.cargo === 'gerente' && v.ativo)
    if (!gerente) return
    const staleLeads = getLeadsNeedingAssignment(clientes, gerente.id)
    for (const lead of staleLeads) {
      addNotificacao('warning', 'Lead sem vendedor', `${lead.razaoSocial} está há ${lead.dias}d sem vendedor atribuído!`, lead.id)
    }
  }, [addNotificacao]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Gerente: notificar pedidos pendentes de aprovação há 2+ dias ───
  const pedidoNotifRef = useRef(false)
  useEffect(() => {
    if (pedidoNotifRef.current) return
    const loggedUser = loggedUserRef.current
    const pedidos = pedidosRef.current
    if (!loggedUser || loggedUser.cargo !== 'gerente') return
    if (pedidos.length === 0) return
    pedidoNotifRef.current = true
    setTimeout(() => { pedidoNotifRef.current = false }, 3600000)

    const stale = getPedidosPendingApproval(pedidos)
    for (const p of stale) {
      const cl = clientesRef.current.find(c => c.id === p.clienteId)
      addNotificacao('error', 'Pedido aguardando aprovação', `Pedido ${p.numero}${cl ? ` (${cl.razaoSocial})` : ''} está há ${p.dias}d pendente!`, p.clienteId)
    }
  }, [addNotificacao]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Item 6: Vendedor — alertar quando card passar de 3 dias em Negociação ───
  const negAlertedIdsRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    const loggedUser = loggedUserRef.current
    const lista = clientesRef.current
    if (!loggedUser || lista.length === 0) return
    const vencidos = getNegociacaoStaleAlert(lista, loggedUser.id)
    for (const item of vencidos) {
      if (negAlertedIdsRef.current.has(item.id)) continue
      negAlertedIdsRef.current.add(item.id)
      addNotificacao(
        'warning',
        '⚠️ Encerrar Negociação (> 3 dias)',
        `${item.razaoSocial} está há ${item.dias} dias em Negociação. Encerre como Ganho ou Perdido registrando o motivo real.`,
        item.id
      )
    }
  }, [addNotificacao, clientes.length, loggedUser?.id])
}
