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
  ClipboardDocumentCheckIcon,
  CloudArrowUpIcon,
  BuildingLibraryIcon,
  AcademicCapIcon,
  Cog6ToothIcon,
  CogIcon,
  ChatBubbleLeftIcon,
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
  pendingAprovacoes?: number
}

const viewsPermitidas: Record<Vendedor['cargo'], ViewType[]> = {
  gerente: ['dashboard', 'aprovacao', 'funil', 'clientes', 'automacoes', 'mapa', 'prospeccao', 'baseleads', 'tarefas', 'social', 'integracoes', 'equipe', 'relatorios', 'omie', 'trafico', 'licitacoes', 'templates', 'treinamento', 'produtos', 'pedidos', 'ia', 'ia-contexto', 'criar-automacao', 'configuracao-tarefas', 'configuracao-mensagens'],
  vendedor: ['ia', 'funil', 'clientes', 'mapa', 'tarefas', 'produtos', 'templates', 'treinamento', 'pedidos'],
  sdr: ['ia', 'funil', 'clientes', 'mapa', 'prospeccao', 'baseleads', 'tarefas', 'templates', 'treinamento', 'pedidos'],
}

const navItems: { id: ViewType; icon: React.ElementType; label: string }[] = [
  { id: 'dashboard', icon: HomeIcon, label: 'Visão Geral' },
  { id: 'ia', icon: SparklesIcon, label: '🤖 Assistente IA' },
  { id: 'ia-contexto', icon: DocumentTextIcon, label: '📚 Contexto IA' },
  { id: 'criar-automacao', icon: CogIcon, label: '⚙️ Criar Automação' },
  { id: 'aprovacao', icon: ClipboardDocumentCheckIcon, label: 'Aprovação de Pedidos' },
  { id: 'funil', icon: FunnelIcon, label: 'Funil Comercial' },
  { id: 'clientes', icon: UserGroupIcon, label: 'Clientes' },
  { id: 'pedidos', icon: ShoppingCartIcon, label: 'Pedidos' },
  { id: 'tarefas', icon: ChartBarIcon, label: 'Tarefas' },
  { id: 'mapa', icon: MapIcon, label: 'Mapa' },
  { id: 'configuracao-tarefas', icon: Cog6ToothIcon, label: '⚙️ Automação Tarefas' },
  { id: 'configuracao-mensagens', icon: ChatBubbleLeftIcon, label: '💬 Mensagens Auto' },
  { id: 'produtos', icon: CubeIcon, label: 'Produtos' },
  { id: 'templates', icon: DocumentTextIcon, label: 'Templates' },
  { id: 'treinamento', icon: AcademicCapIcon, label: '🎓 Academia de Vendas' },
  { id: 'automacoes', icon: PaperAirplaneIcon, label: 'Automações' },
  { id: 'prospeccao', icon: MagnifyingGlassIcon, label: 'Prospecção' },
  { id: 'baseleads', icon: BeakerIcon, label: '🍦 Base de Leads RF' },
  { id: 'social', icon: MagnifyingGlassIcon, label: 'Busca Social' },
  { id: 'integracoes', icon: SparklesIcon, label: 'Integrações' },
  { id: 'equipe', icon: UserGroupIcon, label: 'Equipe' },
  { id: 'relatorios', icon: ChartBarIcon, label: 'Relatórios' },
  { id: 'omie', icon: CloudArrowUpIcon, label: 'Omie ERP' },
  { id: 'trafico', icon: ChartBarIcon, label: '📊 Tráfego Pago' },
  { id: 'licitacoes', icon: BuildingLibraryIcon, label: '🏛️ Licitações' },
]

export { viewsPermitidas }

export default function Sidebar({
  activeView, setActiveView, loggedUser, sidebarOpen, setSidebarOpen, onOpenAI, onSignOut, pendingAprovacoes = 0
}: SidebarProps) {
  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 border-r flex flex-col shadow-xl`}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <img src="/Logo_MFParis.jpg" alt="GMF Paris" className="h-10 w-10 rounded-full object-cover" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Grupo MF Paris</h1>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-apple" title="Fechar menu">
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
                  ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                  : item.id === 'aprovacao' && pendingAprovacoes > 0
                  ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }
              `}
            >
              <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'aprovacao' && pendingAprovacoes > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                  {pendingAprovacoes}
                </span>
              )}
            </button>
          ))}


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
