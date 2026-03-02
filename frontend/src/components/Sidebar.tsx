import React from 'react'
import {
  HomeIcon,
  FunnelIcon,
  UserGroupIcon,
  ChartBarIcon,
  PaperAirplaneIcon,
  MapIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  SparklesIcon,
  DocumentTextIcon,
  CubeIcon,
  ShoppingCartIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline'
import type { ViewType, Vendedor } from '../types'

interface SidebarProps {
  activeView: ViewType
  setActiveView: (v: ViewType) => void
  loggedUser: Vendedor
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  onOpenAI: () => void
  onSignOut: () => void
}

const viewsPermitidas: Record<Vendedor['cargo'], ViewType[]> = {
  gerente: ['dashboard', 'amostras', 'funil', 'clientes', 'automacoes', 'mapa', 'prospeccao', 'tarefas', 'social', 'integracoes', 'equipe', 'relatorios', 'templates', 'produtos', 'pedidos'],
  vendedor: ['amostras', 'funil', 'clientes', 'mapa', 'tarefas', 'produtos', 'templates', 'pedidos'],
  sdr: ['amostras', 'funil', 'clientes', 'mapa', 'prospeccao', 'tarefas', 'templates', 'pedidos'],
}

const navItems: { id: ViewType; icon: React.ElementType; label: string }[] = [
  { id: 'dashboard', icon: HomeIcon, label: 'Visão Geral' },
  { id: 'amostras', icon: BeakerIcon, label: 'Amostras' },
  { id: 'funil', icon: FunnelIcon, label: 'Funil de Vendas' },
  { id: 'clientes', icon: UserGroupIcon, label: 'Clientes' },
  { id: 'pedidos', icon: ShoppingCartIcon, label: 'Pedidos' },
  { id: 'tarefas', icon: ChartBarIcon, label: 'Tarefas' },
  { id: 'mapa', icon: MapIcon, label: 'Mapa' },
  { id: 'produtos', icon: CubeIcon, label: 'Produtos' },
  { id: 'templates', icon: DocumentTextIcon, label: 'Templates' },
  { id: 'automacoes', icon: PaperAirplaneIcon, label: 'Automações' },
  { id: 'prospeccao', icon: MagnifyingGlassIcon, label: 'Prospecção' },
  { id: 'social', icon: MagnifyingGlassIcon, label: 'Busca Social' },
  { id: 'integracoes', icon: SparklesIcon, label: 'Integrações' },
  { id: 'equipe', icon: UserGroupIcon, label: 'Equipe' },
  { id: 'relatorios', icon: ChartBarIcon, label: 'Relatórios' },
]

export { viewsPermitidas }

export default function Sidebar({
  activeView, setActiveView, loggedUser, sidebarOpen, setSidebarOpen, onOpenAI, onSignOut
}: SidebarProps) {
  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} bg-white border-gray-200 border-r flex flex-col`}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <img src="/Logo_MFParis.jpg" alt="GMF Paris" className="h-10 w-10 rounded-full object-cover" />
          <h1 className="text-lg font-bold text-gray-900">Grupo MF Paris</h1>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-gray-400 hover:text-gray-600 rounded-apple">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems
          .filter(item => viewsPermitidas[loggedUser.cargo].includes(item.id))
          .map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveView(item.id); setSidebarOpen(false) }}
              className={`
                w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-apple transition-all duration-200
                ${activeView === item.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.label}
            </button>
          ))}

        {/* Separador e Assistente IA — só para gerente */}
        {loggedUser.cargo === 'gerente' && (
        <div className="border-t border-gray-200 pt-4 mt-2">
          <button
            onClick={() => { onOpenAI(); setSidebarOpen(false) }}
            className="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-apple bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-apple-sm"
          >
            <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
            </svg>
            Assistente IA
          </button>
        </div>
        )}

        {/* Placeholder invisível para manter estrutura quando não é gerente */}
        {loggedUser.cargo !== 'gerente' && (
        <div className="border-t border-gray-200 pt-4 mt-2">
          <p className="text-xs text-gray-400 text-center px-2">Logado como <span className="font-medium text-gray-600">{loggedUser.cargo === 'sdr' ? 'SDR' : 'Vendedor'}</span></p>
        </div>
        )}

      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-primary-700">{loggedUser.avatar}</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{loggedUser.nome}</p>
              <p className="text-xs text-gray-500">{loggedUser.cargo === 'gerente' ? 'Gerente' : loggedUser.cargo === 'sdr' ? 'SDR' : 'Vendedor'}</p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
            title="Sair"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}
