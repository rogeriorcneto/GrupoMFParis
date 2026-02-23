import { useState, useEffect, useRef, useCallback } from 'react'
import type { Notificacao, Cliente, Tarefa, Vendedor } from '../types'

export function useNotificacoes(
  clientes: Cliente[],
  tarefas: Tarefa[],
  vendedores: Vendedor[]
) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const notifGenRef = useRef<string>('')

  // Generate notifications from data — preserves lida state
  useEffect(() => {
    const etapasKey = clientes.map(c => `${c.id}:${c.etapa}:${c.diasInativo || 0}`).join(',')
    const key = `${etapasKey}-${tarefas.length}-${vendedores.length}`
    if (notifGenRef.current === key) return
    notifGenRef.current = key

    const novas: Notificacao[] = []
    let nId = 1

    clientes.forEach(c => {
      if (c.etapa === 'amostra' && c.dataEntradaEtapa) {
        const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
        if (dias >= 30) {
          novas.push({ id: nId++, tipo: 'error', titulo: '🔴 Prazo vencido (Amostra)', mensagem: `${c.razaoSocial} está há ${dias} dias na Amostra (prazo: 30d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        } else if (dias >= 25) {
          novas.push({ id: nId++, tipo: 'warning', titulo: '⚠️ Prazo vencendo (Amostra)', mensagem: `${c.razaoSocial} está há ${dias} dias na Amostra (prazo: 30d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        }
      }
      if (c.etapa === 'homologado' && c.dataEntradaEtapa) {
        const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
        if (dias >= 75) {
          novas.push({ id: nId++, tipo: 'error', titulo: '🔴 Prazo vencido (Homologado)', mensagem: `${c.razaoSocial} está há ${dias} dias em Homologado (prazo: 75d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        } else if (dias >= 60) {
          novas.push({ id: nId++, tipo: 'warning', titulo: '⚠️ Prazo vencendo (Homologado)', mensagem: `${c.razaoSocial} está há ${dias} dias em Homologado (prazo: 75d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        }
      }
    })

    vendedores.forEach(v => {
      const clientesV = clientes.filter(c => c.vendedorId === v.id)
      const valorPipeline = clientesV.reduce((s, c) => s + (c.valorEstimado || 0), 0)
      if (valorPipeline < v.metaVendas * 0.5 && v.ativo) {
        novas.push({ id: nId++, tipo: 'error', titulo: 'Meta em risco', mensagem: `${v.nome} está abaixo de 50% da meta de vendas`, timestamp: new Date().toISOString(), lida: false })
      }
    })

    clientes.filter(c => (c.diasInativo || 0) > 10).sort((a, b) => (b.diasInativo || 0) - (a.diasInativo || 0)).slice(0, 10).forEach(c => {
      novas.push({ id: nId++, tipo: 'warning', titulo: 'Cliente inativo', mensagem: `${c.razaoSocial} está inativo há ${c.diasInativo} dias`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
    })

    setNotificacoes(prev => {
      const lidaMap = new Map<string, boolean>()
      prev.forEach(n => { if (n.lida) lidaMap.set(`${n.titulo}|${n.mensagem}`, true) })
      return novas.slice(0, 20).map(n => ({ ...n, lida: lidaMap.get(`${n.titulo}|${n.mensagem}`) || false }))
    })
  }, [clientes, tarefas, vendedores])

  const addNotificacao = useCallback((tipo: Notificacao['tipo'], titulo: string, mensagem: string, clienteId?: number) => {
    const novaNotificacao: Notificacao = {
      id: Date.now(),
      tipo,
      titulo,
      mensagem,
      timestamp: new Date().toLocaleString('pt-BR'),
      lida: false,
      clienteId
    }
    setNotificacoes(prev => [novaNotificacao, ...prev.slice(0, 9)])
    setTimeout(() => {
      setNotificacoes(prev => prev.map(n =>
        n.id === novaNotificacao.id ? { ...n, lida: true } : n
      ))
    }, 5000)
  }, [])

  const markAllRead = useCallback(() => {
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
  }, [])

  const markRead = useCallback((id: number) => {
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
  }, [])

  return {
    notificacoes,
    setNotificacoes,
    addNotificacao,
    markAllRead,
    markRead,
  }
}
