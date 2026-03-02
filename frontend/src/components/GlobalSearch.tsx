import React, { useState, useEffect, useRef, useMemo } from 'react'
import { MagnifyingGlassIcon, XMarkIcon, BuildingOfficeIcon, ClipboardDocumentListIcon, ShoppingCartIcon } from '@heroicons/react/24/outline'
import type { Cliente, Tarefa, Pedido, ViewType } from '../types'

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
  clientes: Cliente[]
  tarefas: Tarefa[]
  pedidos: Pedido[]
  onSelectCliente: (cliente: Cliente) => void
  onNavigate: (view: ViewType) => void
}

const etapaLabels: Record<string, string> = {
  'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado',
  'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido',
}
const etapaCores: Record<string, string> = {
  'prospecção': 'text-blue-600', 'amostra': 'text-yellow-600', 'homologado': 'text-green-600',
  'negociacao': 'text-purple-600', 'pos_venda': 'text-pink-600', 'perdido': 'text-red-500',
}
const prioridadeCores: Record<string, string> = {
  alta: 'text-red-500', media: 'text-yellow-500', baixa: 'text-gray-400',
}

export default function GlobalSearch({ isOpen, onClose, clientes, tarefas, pedidos, onSelectCliente, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const items: Array<{ type: 'cliente' | 'tarefa' | 'pedido'; id: number; title: string; subtitle: string; meta?: string; data: any }> = []

    clientes.forEach(c => {
      if (
        c.razaoSocial.toLowerCase().includes(q) ||
        (c.nomeFantasia || '').toLowerCase().includes(q) ||
        c.cnpj.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
        c.contatoNome.toLowerCase().includes(q) ||
        (c.enderecoCidade || '').toLowerCase().includes(q)
      ) {
        const etapa = etapaLabels[c.etapa] || c.etapa
        const valor = c.valorEstimado ? ` · R$ ${c.valorEstimado.toLocaleString('pt-BR')}` : ''
        items.push({
          type: 'cliente', id: c.id,
          title: c.razaoSocial,
          subtitle: c.contatoNome ? `${c.contatoNome} · ${etapa}${valor}` : `${etapa}${valor}`,
          meta: c.etapa,
          data: c,
        })
      }
    })

    tarefas.forEach(t => {
      if (t.titulo.toLowerCase().includes(q) || (t.descricao || '').toLowerCase().includes(q)) {
        const status = t.status === 'concluida' ? '✓ Concluída' : t.status === 'pendente' ? 'Pendente' : 'Em andamento'
        items.push({
          type: 'tarefa', id: t.id,
          title: t.titulo,
          subtitle: `${t.data}${t.hora ? ' ' + t.hora : ''} · ${status}`,
          meta: t.prioridade,
          data: t,
        })
      }
    })

    pedidos.forEach(p => {
      if (p.numero.toLowerCase().includes(q)) {
        const cliente = clientes.find(c => c.id === p.clienteId)
        items.push({
          type: 'pedido', id: p.id,
          title: `Pedido ${p.numero}`,
          subtitle: `${cliente?.razaoSocial || '—'} · R$ ${(p.totalValor || 0).toLocaleString('pt-BR')} · ${p.status}`,
          data: p,
        })
      }
    })

    return items.slice(0, 12)
  }, [query, clientes, tarefas, pedidos])

  useEffect(() => { setSelectedIndex(0) }, [results])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleSelect = (item: typeof results[number]) => {
    if (item.type === 'cliente') {
      onSelectCliente(item.data as Cliente)
    } else if (item.type === 'tarefa') {
      onNavigate('tarefas')
    } else if (item.type === 'pedido') {
      onNavigate('pedidos')
    }
    onClose()
  }

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white rounded-apple shadow-apple-lg border border-gray-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, tarefas, pedidos..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500">
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
          <kbd className="text-[10px] bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-400 flex-shrink-0">ESC</kbd>
        </div>

        {/* Results */}
        {query.trim() && (
          <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
            {results.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                Nenhum resultado para <span className="font-medium text-gray-600">"{query}"</span>
              </div>
            ) : (
              results.map((item, idx) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${idx === selectedIndex ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    item.type === 'cliente' ? 'bg-blue-100' :
                    item.type === 'tarefa' ? 'bg-green-100' : 'bg-purple-100'
                  }`}>
                    {item.type === 'cliente' && <BuildingOfficeIcon className="h-3.5 w-3.5 text-blue-600" />}
                    {item.type === 'tarefa' && <ClipboardDocumentListIcon className="h-3.5 w-3.5 text-green-600" />}
                    {item.type === 'pedido' && <ShoppingCartIcon className="h-3.5 w-3.5 text-purple-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{item.subtitle}</p>
                  </div>
                  {item.type === 'cliente' && item.meta && (
                    <span className={`text-[10px] font-semibold flex-shrink-0 ${etapaCores[item.meta] || 'text-gray-400'}`}>
                      {etapaLabels[item.meta] || item.meta}
                    </span>
                  )}
                  {item.type === 'tarefa' && item.meta && (
                    <span className={`text-[10px] font-semibold flex-shrink-0 uppercase ${prioridadeCores[item.meta] || 'text-gray-400'}`}>
                      {item.meta}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* Empty state / hints */}
        {!query.trim() && (
          <div className="py-6 px-4 text-center text-sm text-gray-400">
            <p>Digite para buscar clientes, tarefas ou pedidos</p>
            <p className="text-xs mt-2 text-gray-300">Use ↑↓ para navegar · Enter para selecionar · ESC para fechar</p>
          </div>
        )}
      </div>
    </div>
  )
}
