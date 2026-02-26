import { useCallback, useEffect, useRef } from 'react'
import type { Cliente, Interacao, Atividade, Vendedor, HistoricoEtapa } from '../types'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { calcScore, getClientsToAutoMove, calcDiasInativo } from '../utils/business-rules'

interface UseAutoRulesParams {
  clientes: Cliente[]
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  interacoes: Interacao[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
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
  clientes, setClientes, interacoes, vendedores, loggedUser, setAtividades, addNotificacao
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
        // Persist outside setState via microtask to avoid side-effects in updater
        queueMicrotask(async () => {
          for (const { id, diasInativo } of changedIds) {
            try { await db.updateCliente(id, { diasInativo }) } catch (err) { logger.error('Erro ao persistir diasInativo:', err) }
          }
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
      for (const c of orfaos) {
        try { await db.updateCliente(c.id, { vendedorId: gerente.id }) } catch (err) { logger.error('Erro ao atribuir cliente órfão:', err) }
      }
      logger.log(`✅ ${orfaos.length} cliente(s) sem vendedor atribuído(s) a ${gerente.nome} (gerente)`)
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
        const hist: HistoricoEtapa = { etapa: 'perdido', data: nowStr, de: c.etapa }
        return {
          ...c, etapa: 'perdido', etapaAnterior: c.etapa, dataEntradaEtapa: nowStr,
          historicoEtapas: [...(c.historicoEtapas || []), hist],
          categoriaPerda: 'sem_resposta' as const, dataPerda: nowStr.split('T')[0],
          motivoPerda: `[Sistema] Prazo de ${match.etapa === 'amostra' ? '30' : match.etapa === 'negociacao' ? '45' : '75'} dias na etapa "${match.etapa === 'amostra' ? 'Amostra' : match.etapa === 'negociacao' ? 'Negociação' : 'Homologado'}" vencido — movido automaticamente`
        }
      }))
      // Capture client names before state update (avoid stale closure)
      const moveInfo = clientesParaMover.map(m => {
        const cl = clientes.find(c => c.id === m.id)
        return { ...m, razaoSocial: cl?.razaoSocial || 'Cliente', fromStage: m.etapa }
      })
      // Persist each auto-move to Supabase
      const persistAutoMoves = async () => {
        for (const m of moveInfo) {
          const motivo = `[Sistema] Prazo de ${m.etapa === 'amostra' ? '30' : m.etapa === 'negociacao' ? '45' : '75'} dias na etapa "${m.etapa === 'amostra' ? 'Amostra' : m.etapa === 'negociacao' ? 'Negociação' : 'Homologado'}" vencido — movido automaticamente`
          try {
            await db.updateCliente(m.id, {
              etapa: 'perdido', etapaAnterior: m.fromStage, dataEntradaEtapa: nowStr,
              categoriaPerda: 'sem_resposta', dataPerda: nowStr.split('T')[0], motivoPerda: motivo
            })
            await db.insertHistoricoEtapa(m.id, { etapa: 'perdido', data: nowStr, de: m.fromStage })
            const savedAtiv = await db.insertAtividade({
              tipo: 'moveu',
              descricao: `${m.razaoSocial} movido para Perdido automaticamente (prazo ${m.etapa === 'amostra' ? '30d' : m.etapa === 'negociacao' ? '45d' : '75d'} vencido)`,
              vendedorNome: 'Sistema', timestamp: nowStr
            })
            setAtividades(prev => [savedAtiv, ...prev])
          } catch (err) { logger.error('Erro auto-move Supabase:', err) }
          addNotificacao('error', 'Movido automaticamente', `${m.razaoSocial} → Perdido (prazo ${m.dias}d vencido)`, m.id)
        }
      }
      persistAutoMoves()
    }
  }, [clientes, addNotificacao, setClientes, setAtividades])

  // Item 4: Score dinâmico — recalcula automaticamente e persiste (debounced, threshold 5pts)
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scoreCalcRef = useRef(false)
  useEffect(() => {
    if (scoreCalcRef.current) return
    // Pre-build interaction count map O(n) instead of O(n²)
    const interCountMap = new Map<number, number>()
    interacoes.forEach(i => { interCountMap.set(i.clienteId, (interCountMap.get(i.clienteId) || 0) + 1) })
    const changedIds: { id: number; score: number; oldScore: number }[] = []
    const updated = clientes.map(c => {
      const newScore = calcScore(c.etapa, c.valorEstimado, interCountMap.get(c.id) || 0, c.diasInativo)
      if (c.score !== newScore) { changedIds.push({ id: c.id, score: newScore, oldScore: c.score || 0 }); return { ...c, score: newScore } }
      return c
    })
    if (changedIds.length > 0) {
      scoreCalcRef.current = true
      setClientes(updated)
      // Reset guard after React commits the update (next tick, not same frame)
      setTimeout(() => { scoreCalcRef.current = false }, 0)
      // Persist only scores that changed by 5+ points, debounced
      const significantChanges = changedIds.filter(({ score, oldScore }) => Math.abs(oldScore - score) >= 5)
      if (significantChanges.length > 0) {
        if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current)
        scoreTimerRef.current = setTimeout(async () => {
          for (const { id, score } of significantChanges) {
            try { await db.updateCliente(id, { score }) } catch (err) { logger.error('Erro ao persistir score:', err) }
          }
        }, 3000)
      }
    }
  }, [interacoes, clientes, setClientes]) // eslint-disable-line react-hooks/exhaustive-deps
}
