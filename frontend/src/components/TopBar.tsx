import React from 'react'
import { BellIcon, MagnifyingGlassIcon, WifiIcon } from '@heroicons/react/24/outline'
import type { ViewType, Notificacao } from '../types'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

const viewTitles: Record<ViewType, string> = {
  dashboard: 'Visão Geral',
  aprovacao: 'Aprovação de Pedidos',
  amostras: 'Painel de Amostras',
  funil: 'Funil de Vendas',
  clientes: 'Clientes',
  automacoes: 'Automações de Vendas',
  mapa: 'Mapa de Leads',
  prospeccao: 'Prospecção',
  tarefas: 'Tarefas e Agenda',
  social: 'Busca por Redes Sociais',
  integracoes: 'Integrações',
  equipe: 'Equipe de Vendas',
  relatorios: 'Relatórios e Gráficos',
  templates: 'Templates de Mensagens',
  produtos: 'Catálogo de Produtos',
  pedidos: 'Lançamento de Pedidos',
  ia: 'Assistente IA',
}

interface TopBarProps {
  activeView: ViewType
  setSidebarOpen: (v: boolean) => void
  notificacoes: Notificacao[]
  showNotifications: boolean
  setShowNotifications: (v: boolean) => void
  markAllRead: () => void
  markRead: (id: number) => void
  onOpenSearch?: () => void
}

export default function TopBar({
  activeView, setSidebarOpen, notificacoes,
  showNotifications, setShowNotifications, markAllRead, markRead, onOpenSearch
}: TopBarProps) {
  const unreadCount = notificacoes.filter(n => !n.lida).length
  const isOnline = useNetworkStatus()

  return (
    <div className="flex flex-col">
    {!isOnline && (
      <div className="bg-yellow-500 text-white text-xs font-medium px-4 py-1.5 flex items-center gap-2 justify-center">
        <WifiIcon className="h-3.5 w-3.5 flex-shrink-0" />
        Sem conexão — dados podem estar desatualizados. Verifique sua internet.
      </div>
    )}
    <div className="h-14 sm:h-16 bg-white border-gray-200 border-b flex items-center justify-between px-3 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-apple transition-colors"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
        </button>
        <h2 className="text-base sm:text-lg font-semibold truncate text-gray-900">
          {viewTitles[activeView] || 'Visão Geral'}
        </h2>
      </div>
      
      <div className="flex items-center space-x-1 sm:space-x-3">
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 hover:bg-gray-200 rounded-apple transition-colors"
            title="Busca global (Ctrl+K)"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
            <span className="text-xs">Buscar...</span>
            <kbd className="hidden md:inline text-[10px] bg-white border border-gray-300 rounded px-1 py-0.5 text-gray-500">Ctrl K</kbd>
          </button>
        )}
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="sm:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-apple transition-colors"
            title="Busca global"
          >
            <MagnifyingGlassIcon className="h-5 w-5" />
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-apple hover:bg-gray-100 relative"
          >
            <BellIcon className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-12 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-white rounded-apple shadow-apple border border-gray-200 z-50 max-h-[70vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Notificações</h3>
                <button onClick={() => markAllRead()} className="text-xs text-primary-600 hover:text-primary-800">Marcar todas como lidas</button>
              </div>
              {notificacoes.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">Nenhuma notificação</div>
              ) : (
                notificacoes.map(n => (
                  <div key={n.id} className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!n.lida ? 'bg-blue-50' : ''}`} onClick={() => markRead(n.id)}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.tipo === 'warning' ? 'bg-yellow-500' : n.tipo === 'error' ? 'bg-red-500' : n.tipo === 'success' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{n.titulo}</p>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.mensagem}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}
