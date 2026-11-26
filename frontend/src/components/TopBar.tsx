import React from 'react'
import { BellIcon, MagnifyingGlassIcon, WifiIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import type { ViewType, Notificacao } from '../types'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

const viewTitles: Record<ViewType, string> = {
  dashboard: 'Dashboard',
  aprovacao: 'Aprovação de Pedidos',
  funil: 'Funil Comercial',
  clientes: 'Clientes',
  automacoes: 'Automações',
  mapa: 'Mapa',
  prospeccao: 'Prospecção',
  tarefas: 'Tarefas',
  missao: 'Missões',
  social: 'Busca Social',
  integracoes: 'Integrações',
  equipe: 'Equipe',
  relatorios: 'Relatórios',
  templates: 'Templates',
  produtos: 'Produtos',
  ia: 'Assistente IA',
  'ia-contexto': 'Contexto IA',
  'criar-automacao': 'Criar Automação',
  omie: 'Omie ERP',
  trafico: 'Tráfego Pago',
  baseleads: 'Base de Leads RF',
  licitacoes: 'Licitações',
  treinamento: 'Academia de Vendas',
  'configuracao-tarefas': 'Automação Tarefas',
  'configuracao-mensagens': 'Mensagens Auto',
  protocolos: 'Protocolos',
  sac: 'SAC',
  'tabela-precos': 'Tabela de Preços',
  parametros: 'Parâmetros',
}

interface TopBarProps {
  activeView: ViewType
  setSidebarOpen: (v: boolean) => void
  notificacoes: Notificacao[]
  showNotifications: boolean
  setShowNotifications: (v: boolean) => void
  markAllRead: () => void
  markRead: (id: number) => void
  onClickNotificacao?: (n: Notificacao) => void
  onOpenSearch?: () => void
  dark?: boolean
  onToggleDark?: () => void
}

export default function TopBar({
  activeView, setSidebarOpen, notificacoes,
  showNotifications, setShowNotifications, markAllRead, markRead, onClickNotificacao, onOpenSearch,
  dark, onToggleDark
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
    <div className="h-14 bg-white/80 dark:bg-[#1C1C1E]/85 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-lg transition-colors"
          title="Abrir menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
        </button>
        <h2 className="text-[15px] sm:text-base font-semibold tracking-tight truncate text-gray-900 dark:text-gray-100">
          {viewTitles[activeView] || 'Visão Geral'}
        </h2>
      </div>
      
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {onToggleDark && (
          <button
            onClick={onToggleDark}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#EFEFF4] dark:bg-[#2C2C30] hover:bg-black/[0.08] dark:hover:bg-white/[0.14] text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors"
            title={dark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
          >
            {dark ? (
              <>
                <SunIcon className="h-4 w-4 text-amber-400" />
                <span className="hidden sm:inline">Escuro</span>
              </>
            ) : (
              <>
                <MoonIcon className="h-4 w-4 text-gray-600" />
                <span className="hidden sm:inline">Claro</span>
              </>
            )}
          </button>
        )}
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 bg-[#EFEFF4] dark:bg-[#2C2C30] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] rounded-full transition-colors"
            title="Busca global (Ctrl+K)"
          >
            <MagnifyingGlassIcon className="h-3.5 w-3.5" />
            <span className="text-xs">Buscar</span>
            <kbd className="hidden md:inline text-[10px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] rounded px-1.5 py-0.5 text-gray-500 dark:text-gray-400">⌘K</kbd>
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
                  <div key={n.id} className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!n.lida ? 'bg-blue-50' : ''}`} onClick={() => { markRead(n.id); if (onClickNotificacao) { onClickNotificacao(n); setShowNotifications(false) } }}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.tipo === 'warning' ? 'bg-yellow-500' : n.tipo === 'error' ? 'bg-red-500' : n.tipo === 'success' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{n.titulo}</p>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.mensagem}</p>
                        {(n.acao || n.clienteId) && <p className="text-[10px] text-primary-500 mt-1 font-medium">Clique para ver →</p>}
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
