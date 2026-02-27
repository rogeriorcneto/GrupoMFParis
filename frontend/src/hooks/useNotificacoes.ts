import { useState, useEffect, useRef, useCallback } from 'react'
import type { Notificacao, Cliente, Tarefa, Vendedor } from '../types'
import * as db from '../lib/database'
import { logger } from '../utils/logger'

export function useNotificacoes(
  clientes: Cliente[],
  tarefas: Tarefa[],
  vendedores: Vendedor[],
  initialNotificacoes?: Notificacao[]
) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>(initialNotificacoes || [])
  const notifGenRef = useRef<string>('')

  // Sync initial data when it arrives from loadAllData
  const initialLoadedRef = useRef(false)
  useEffect(() => {
    if (initialNotificacoes && initialNotificacoes.length > 0 && !initialLoadedRef.current) {
      initialLoadedRef.current = true
      setNotificacoes(prev => {
        // Merge: keep DB notifications, avoid duplicates
        const dbIds = new Set(initialNotificacoes.map(n => n.id))
        const localOnly = prev.filter(n => !dbIds.has(n.id))
        return [...initialNotificacoes, ...localOnly].slice(0, 50)
      })
    }
  }, [initialNotificacoes])

  // Generate auto-notifications from data (computed, not persisted)
  useEffect(() => {
    // Hash numérico O(n) simples — evita alocar string gigante a cada render
    let hash = tarefas.length * 31 + vendedores.length
    for (const c of clientes) {
      hash = (hash * 31 + c.id + c.etapa.length + (c.diasInativo || 0)) | 0
    }
    const key = String(hash)
    if (notifGenRef.current === key) return
    notifGenRef.current = key

    const novas: Notificacao[] = []
    let nId = -1 // Negative IDs for auto-generated (distinguish from DB)

    clientes.forEach(c => {
      if (c.etapa === 'amostra' && c.dataEntradaEtapa) {
        const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
        if (dias >= 30) {
          novas.push({ id: nId--, tipo: 'error', titulo: '🔴 Prazo vencido (Amostra)', mensagem: `${c.razaoSocial} está há ${dias} dias na Amostra (prazo: 30d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        } else if (dias >= 25) {
          novas.push({ id: nId--, tipo: 'warning', titulo: '⚠️ Prazo vencendo (Amostra)', mensagem: `${c.razaoSocial} está há ${dias} dias na Amostra (prazo: 30d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        }
      }
      if (c.etapa === 'homologado' && c.dataEntradaEtapa) {
        const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
        if (dias >= 75) {
          novas.push({ id: nId--, tipo: 'error', titulo: '🔴 Prazo vencido (Homologado)', mensagem: `${c.razaoSocial} está há ${dias} dias em Homologado (prazo: 75d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        } else if (dias >= 60) {
          novas.push({ id: nId--, tipo: 'warning', titulo: '⚠️ Prazo vencendo (Homologado)', mensagem: `${c.razaoSocial} está há ${dias} dias em Homologado (prazo: 75d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        }
      }
    })

    vendedores.forEach(v => {
      const clientesV = clientes.filter(c => c.vendedorId === v.id)
      const valorPipeline = clientesV.reduce((s, c) => s + (c.valorEstimado || 0), 0)
      if (valorPipeline < v.metaVendas * 0.5 && v.ativo) {
        novas.push({ id: nId--, tipo: 'error', titulo: 'Meta em risco', mensagem: `${v.nome} está abaixo de 50% da meta de vendas`, timestamp: new Date().toISOString(), lida: false })
      }
    })

    clientes.filter(c => (c.diasInativo || 0) > 10).sort((a, b) => (b.diasInativo || 0) - (a.diasInativo || 0)).slice(0, 10).forEach(c => {
      novas.push({ id: nId--, tipo: 'warning', titulo: 'Cliente inativo', mensagem: `${c.razaoSocial} está inativo há ${c.diasInativo} dias`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
    })

    setNotificacoes(prev => {
      // Keep persisted (positive IDs) + merge new auto-generated (negative IDs)
      const persisted = prev.filter(n => n.id > 0)
      // Preserve lida state for auto-generated
      const lidaMap = new Map<string, boolean>()
      prev.filter(n => n.id < 0 && n.lida).forEach(n => lidaMap.set(`${n.titulo}|${n.mensagem}`, true))
      const autoWithLida = novas.map(n => ({ ...n, lida: lidaMap.get(`${n.titulo}|${n.mensagem}`) || false }))
      return [...autoWithLida, ...persisted].slice(0, 50)
    })
  }, [clientes, tarefas, vendedores])

  const addNotificacao = useCallback(async (tipo: Notificacao['tipo'], titulo: string, mensagem: string, clienteId?: number) => {
    // Optimistic local update
    const tempId = Date.now()
    const novaNotificacao: Notificacao = {
      id: tempId,
      tipo,
      titulo,
      mensagem,
      timestamp: new Date().toISOString(),
      lida: false,
      clienteId
    }
    setNotificacoes(prev => [novaNotificacao, ...prev].slice(0, 50))

    // Persist to Supabase (fire-and-forget)
    try {
      const saved = await db.insertNotificacao({ tipo, titulo, mensagem, clienteId })
      // Replace temp with real DB record
      setNotificacoes(prev => prev.map(n => n.id === tempId ? saved : n))
    } catch (err) {
      logger.error('Erro ao persistir notificação:', err)
    }

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setNotificacoes(prev => prev.map(n =>
        n.id === tempId || (n.titulo === titulo && n.mensagem === mensagem && !n.lida)
          ? { ...n, lida: true }
          : n
      ))
    }, 5000)
  }, [])

  const markAllRead = useCallback(async () => {
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
    try { await db.markAllNotificacoesLidas() } catch (err) { logger.error('Erro ao marcar todas lidas:', err) }
  }, [])

  const markRead = useCallback(async (id: number) => {
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
    if (id > 0) {
      try { await db.markNotificacaoLida(id) } catch (err) { logger.error('Erro ao marcar lida:', err) }
    }
  }, [])

  return {
    notificacoes,
    setNotificacoes,
    addNotificacao,
    markAllRead,
    markRead,
  }
}
