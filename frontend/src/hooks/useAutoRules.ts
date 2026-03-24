import { useCallback, useEffect, useRef } from 'react'
import type { Cliente, Interacao, Atividade, Vendedor, HistoricoEtapa, Pedido } from '../types'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { calcScore, getClientsToAutoMove, getClientsToAutoInativo, calcDiasInativo, getProspeccaoToReturn, getLeadsNeedingAssignment, getPedidosPendingApproval } from '../utils/business-rules'

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

  // Auto-atribuir clientes órfãos ao gerente (usuário master)
  // O gerente de vendas é o dono padrão de todos os clientes até reatribuir manualmente
  const orphanFixRef = useRef(false)
  useEffect(() => {
    if (orphanFixRef.current || !loggedUser || clientes.length === 0 || vendedores.length === 0) return
    // Encontrar o gerente (master) — é o dono padrão de todos os clientes sem vendedor
    const gerente = vendedores.find(v => v.cargo === 'gerente' && v.ativo) || loggedUser
    const orfaos = clientes.filter(c => !c.vendedorId)
    if (orfaos.length === 0) { orphanFixRef.current = true; return }
    orphanFixRef.current = true
    // Atribuir em batch ao gerente e persistir
    setClientes(prev => prev.map(c => !c.vendedorId ? { ...c, vendedorId: gerente.id } : c))
    const persistOrphan = async () => {
      try {
        await db.updateClientesBatch(orfaos.map(c => ({ id: c.id, changes: { vendedorId: gerente.id } })))
        logger.log(`✅ ${orfaos.length} cliente(s) sem vendedor atribuído(s) a ${gerente.nome} (gerente)`)
      } catch (err) { logger.error('Erro ao atribuir clientes órfãos batch:', err) }
    }
    persistOrphan()
  }, [clientes, vendedores, loggedUser, setClientes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Item 2: Movimentação automática pelo sistema (prazos vencidos)
  const autoMovedIds = useRef<Set<number>>(new Set())
  const autoMoveRunRef = useRef(false)
  useEffect(() => {
    // Only run once per data load cycle, not on every clientes change (score, diasInativo, etc.)
    if (autoMoveRunRef.current || clientes.length === 0) return
    autoMoveRunRef.current = true
    // Reset after 60s to allow re-check (e.g. if user stays on page for hours)
    setTimeout(() => { autoMoveRunRef.current = false }, 60000)

    const clientesParaMover = getClientsToAutoMove(clientes, autoMovedIds.current)
    if (clientesParaMover.length > 0) {
      clientesParaMover.forEach(m => autoMovedIds.current.add(m.id))
      const nowStr = new Date().toISOString()
      // Update local state immediately
      setClientes(prev => prev.map(c => {
        const match = clientesParaMover.find(m => m.id === c.id)
        if (!match) return c
        const dest = match.destino
        const hist: HistoricoEtapa = { etapa: dest, data: nowStr, de: c.etapa }
        const extras: Partial<Cliente> = {
          etapa: dest, etapaAnterior: c.etapa, dataEntradaEtapa: nowStr,
          historicoEtapas: [...(c.historicoEtapas || []), hist],
        }
        if (dest === 'perdido') {
          extras.categoriaPerda = 'sem_resposta' as const
          extras.dataPerda = nowStr.split('T')[0]
          extras.motivoPerda = `[Sistema] Prazo de ${match.dias}d na etapa "${match.etapa}" vencido — movido automaticamente`
        }
        return { ...c, ...extras }
      }))
      const moveInfo = clientesParaMover.map(m => {
        const cl = clientes.find(c => c.id === m.id)
        return { ...m, razaoSocial: cl?.razaoSocial || 'Cliente', fromStage: m.etapa }
      })
      const persistAutoMoves = async () => {
        for (const m of moveInfo) {
          const dest = m.destino
          const updates: Record<string, any> = { etapa: dest, etapaAnterior: m.fromStage, dataEntradaEtapa: nowStr }
          if (dest === 'perdido') {
            updates.categoriaPerda = 'sem_resposta'
            updates.dataPerda = nowStr.split('T')[0]
            updates.motivoPerda = `[Sistema] Prazo de ${m.dias}d na etapa "${m.etapa}" vencido — movido automaticamente`
          }
          try {
            await db.updateCliente(m.id, updates)
            await db.insertHistoricoEtapa(m.id, { etapa: dest, data: nowStr, de: m.fromStage })
            const destLabel = dest === 'inativo' ? 'Inativos' : 'Perdido'
            const savedAtiv = await db.insertAtividade({
              tipo: 'moveu',
              descricao: `${m.razaoSocial} movido para ${destLabel} automaticamente (prazo ${m.dias}d vencido)`,
              vendedorNome: 'Sistema', timestamp: nowStr
            })
            setAtividades(prev => [savedAtiv, ...prev])
          } catch (err) { logger.error('Erro auto-move Supabase:', err) }
          const destLabel = dest === 'inativo' ? 'Inativos' : 'Perdido'
          addNotificacao('error', 'Movido automaticamente', `${m.razaoSocial} → ${destLabel} (prazo ${m.dias}d vencido)`, m.id)
        }
      }
      persistAutoMoves()
    }
  }, [clientes, addNotificacao, setClientes, setAtividades])

  // Auto-move para "inativo" — clientes com 90+ dias sem atividade (exceto follow_up/negociacao)
  const autoInativoIds = useRef<Set<number>>(new Set())
  const autoInativoRunRef = useRef(false)
  useEffect(() => {
    if (autoInativoRunRef.current || clientes.length === 0) return
    autoInativoRunRef.current = true
    setTimeout(() => { autoInativoRunRef.current = false }, 60000)

    const clientesParaInativar = getClientsToAutoInativo(clientes, autoInativoIds.current)
    if (clientesParaInativar.length > 0) {
      clientesParaInativar.forEach(m => autoInativoIds.current.add(m.id))
      const nowStr = new Date().toISOString()
      setClientes(prev => prev.map(c => {
        const match = clientesParaInativar.find(m => m.id === c.id)
        if (!match) return c
        const hist: HistoricoEtapa = { etapa: 'inativo', data: nowStr, de: c.etapa }
        return {
          ...c, etapa: 'inativo', etapaAnterior: c.etapa, dataEntradaEtapa: nowStr,
          historicoEtapas: [...(c.historicoEtapas || []), hist],
        }
      }))
      const moveInfo = clientesParaInativar.map(m => {
        const cl = clientes.find(c => c.id === m.id)
        return { ...m, razaoSocial: cl?.razaoSocial || 'Cliente' }
      })
      const persistAutoInativo = async () => {
        for (const m of moveInfo) {
          try {
            await db.updateCliente(m.id, {
              etapa: 'inativo', etapaAnterior: m.etapa, dataEntradaEtapa: nowStr,
            })
            await db.insertHistoricoEtapa(m.id, { etapa: 'inativo', data: nowStr, de: m.etapa })
            const savedAtiv = await db.insertAtividade({
              tipo: 'moveu',
              descricao: `${m.razaoSocial} movido para Inativos automaticamente (${m.dias}d sem atividade)`,
              vendedorNome: 'Sistema', timestamp: nowStr
            })
            setAtividades(prev => [savedAtiv, ...prev])
          } catch (err) { logger.error('Erro auto-inativo Supabase:', err) }
          addNotificacao('warning', 'Cliente inativado', `${m.razaoSocial} → Inativos (${m.dias}d sem atividade)`, m.id)
        }
      }
      persistAutoInativo()
    }
  }, [clientes, addNotificacao, setClientes, setAtividades])

  // Item 4: Score dinâmico — recalcula automaticamente e persiste (debounced, threshold 5pts)
  // Deps: apenas interacoes. clientes é lido via setClientes funcional para evitar o ciclo
  // render→effect→setClientes→render→effect.
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // Pre-build interaction count map O(n) instead of O(n²)
    const interCountMap = new Map<number, number>()
    interacoes.forEach(i => { interCountMap.set(i.clienteId, (interCountMap.get(i.clienteId) || 0) + 1) })

    setClientes(prev => {
      const changedIds: { id: number; score: number; oldScore: number }[] = []
      const updated = prev.map(c => {
        const newScore = calcScore(c.etapa, c.valorEstimado, interCountMap.get(c.id) || 0, c.diasInativo)
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

  // ─── Prospecção: devolver lead ao gerente (5d sem contato ou 60d sem amostra) ───
  const returnedIds = useRef<Set<number>>(new Set())
  const returnRunRef = useRef(false)
  useEffect(() => {
    if (returnRunRef.current || clientes.length === 0 || vendedores.length === 0) return
    returnRunRef.current = true
    setTimeout(() => { returnRunRef.current = false }, 60000)

    const gerente = vendedores.find(v => v.cargo === 'gerente' && v.ativo)
    if (!gerente) return

    const toReturn = getProspeccaoToReturn(clientes, gerente.id, returnedIds.current)
    if (toReturn.length === 0) return
    toReturn.forEach(m => returnedIds.current.add(m.id))

    const nowStr = new Date().toISOString()
    setClientes(prev => prev.map(c => {
      const match = toReturn.find(m => m.id === c.id)
      if (!match) return c
      return { ...c, vendedorId: gerente.id }
    }))

    const returnInfo = toReturn.map(m => {
      const cl = clientes.find(c => c.id === m.id)
      return { ...m, razaoSocial: cl?.razaoSocial || 'Cliente', vendedorAnterior: cl?.vendedorId }
    })
    const persistReturns = async () => {
      for (const m of returnInfo) {
        const motivoLabel = m.motivo === 'sem_contato_5d' ? 'sem contato em 5 dias' : 'sem envio de amostra em 60 dias'
        try {
          await db.updateCliente(m.id, { vendedorId: gerente.id })
          const savedAtiv = await db.insertAtividade({
            tipo: 'moveu',
            descricao: `${m.razaoSocial} devolvido ao gerente (${motivoLabel})`,
            vendedorNome: 'Sistema', timestamp: nowStr
          })
          setAtividades(prev => [savedAtiv, ...prev])
        } catch (err) { logger.error('Erro ao devolver lead:', err) }
        addNotificacao('warning', 'Lead devolvido', `${m.razaoSocial} devolvido ao gerente (${motivoLabel})`, m.id)
      }
    }
    persistReturns()
  }, [clientes, vendedores, addNotificacao, setClientes, setAtividades])

  // ─── Lead: notificar gerente se lead sem vendedor há 3+ dias ───
  const leadNotifRef = useRef(false)
  useEffect(() => {
    if (leadNotifRef.current || !loggedUser || loggedUser.cargo !== 'gerente') return
    if (clientes.length === 0 || vendedores.length === 0) return
    leadNotifRef.current = true
    setTimeout(() => { leadNotifRef.current = false }, 3600000) // re-check hourly

    const gerente = vendedores.find(v => v.cargo === 'gerente' && v.ativo)
    if (!gerente) return
    const staleLeads = getLeadsNeedingAssignment(clientes, gerente.id)
    for (const lead of staleLeads) {
      addNotificacao('warning', 'Lead sem vendedor', `${lead.razaoSocial} está há ${lead.dias}d sem vendedor atribuído!`, lead.id)
    }
  }, [clientes, vendedores, loggedUser, addNotificacao])

  // ─── Gerente: notificar pedidos pendentes de aprovação há 2+ dias ───
  const pedidoNotifRef = useRef(false)
  useEffect(() => {
    if (pedidoNotifRef.current || !loggedUser || loggedUser.cargo !== 'gerente') return
    if (pedidos.length === 0) return
    pedidoNotifRef.current = true
    setTimeout(() => { pedidoNotifRef.current = false }, 3600000)

    const stale = getPedidosPendingApproval(pedidos)
    for (const p of stale) {
      const cl = clientes.find(c => c.id === p.clienteId)
      addNotificacao('error', 'Pedido aguardando aprovação', `Pedido ${p.numero}${cl ? ` (${cl.razaoSocial})` : ''} está há ${p.dias}d pendente!`, p.clienteId)
    }
  }, [pedidos, clientes, loggedUser, addNotificacao])
}
