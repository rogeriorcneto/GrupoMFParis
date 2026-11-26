import React from 'react'
import {
  HomeIcon,
  FunnelIcon,
  UserGroupIcon,
  ChartBarIcon,
  PaperAirplaneIcon,
  MapIcon,
  FlagIcon,
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
  EnvelopeIcon,
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
  onVoltarPortal?: () => void
  pendingAprovacoes?: number
  emailUnreadCount?: number
}

const viewsPermitidas: Record<Vendedor['cargo'], ViewType[]> = {
  gerente: ['dashboard', 'aprovacao', 'email', 'funil', 'clientes', 'automacoes', 'mapa', 'prospeccao', 'baseleads', 'tarefas', 'missao', 'social', 'integracoes', 'equipe', 'relatorios', 'omie', 'trafico', 'licitacoes', 'templates', 'treinamento', 'produtos', 'ia', 'ia-contexto', 'criar-automacao', 'configuracao-tarefas', 'configuracao-mensagens', 'protocolos', 'sac', 'tabela-precos', 'parametros'],
  vendedor: ['dashboard', 'ia', 'email', 'funil', 'clientes', 'relatorios', 'tarefas', 'missao', 'mapa', 'templates', 'treinamento', 'protocolos', 'tabela-precos'],
  sdr: ['ia', 'email', 'funil', 'clientes', 'mapa', 'prospeccao', 'baseleads', 'tarefas', 'templates', 'treinamento', 'protocolos', 'tabela-precos'],
}

// Item 8.2 e 8.3 (Rodada 3): sem emojis nos nomes (ícones SVG mantidos) e na ordem oficial 1 a 29
const navItems: { id: ViewType; icon: React.ElementType; label: string }[] = [
  { id: 'dashboard', icon: HomeIcon, label: 'Dashboard' },
  { id: 'aprovacao', icon: ClipboardDocumentCheckIcon, label: 'Aprovação de Pedidos' },
  { id: 'email', icon: EnvelopeIcon, label: 'Caixa de E-mail' },
  { id: 'funil', icon: FunnelIcon, label: 'Funil Comercial' },
  { id: 'tarefas', icon: ChartBarIcon, label: 'Tarefas' },
  { id: 'clientes', icon: UserGroupIcon, label: 'Clientes' },
  { id: 'relatorios', icon: ChartBarIcon, label: 'Relatórios' },
  { id: 'treinamento', icon: AcademicCapIcon, label: 'Academia de Vendas' },
  { id: 'mapa', icon: MapIcon, label: 'Mapa' },
  { id: 'missao', icon: FlagIcon, label: 'Missões' },
  { id: 'prospeccao', icon: MagnifyingGlassIcon, label: 'Prospecção' },
  { id: 'baseleads', icon: BeakerIcon, label: 'Base de Leads RF' },
  { id: 'tabela-precos', icon: ChartBarIcon, label: 'Tabela de Preços' },
  { id: 'produtos', icon: CubeIcon, label: 'Produtos' },
  { id: 'equipe', icon: UserGroupIcon, label: 'Equipe' },
  { id: 'ia', icon: SparklesIcon, label: 'Assistente IA' },
  { id: 'sac', icon: ChatBubbleLeftIcon, label: 'SAC' },
  { id: 'templates', icon: DocumentTextIcon, label: 'Templates' },
  { id: 'configuracao-mensagens', icon: ChatBubbleLeftIcon, label: 'Mensagens Auto' },
  { id: 'social', icon: MagnifyingGlassIcon, label: 'Busca Social' },
  { id: 'licitacoes', icon: BuildingLibraryIcon, label: 'Licitações' },
  { id: 'trafico', icon: ChartBarIcon, label: 'Tráfego Pago' },
  { id: 'protocolos', icon: DocumentTextIcon, label: 'Protocolos' },
  { id: 'omie', icon: CloudArrowUpIcon, label: 'Omie ERP' },
  { id: 'integracoes', icon: SparklesIcon, label: 'Integrações' },
  { id: 'automacoes', icon: PaperAirplaneIcon, label: 'Automações' },
  { id: 'configuracao-tarefas', icon: Cog6ToothIcon, label: 'Automação Tarefas' },
  { id: 'criar-automacao', icon: CogIcon, label: 'Criar Automação' },
  { id: 'ia-contexto', icon: DocumentTextIcon, label: 'Contexto IA' },
  { id: 'parametros', icon: Cog6ToothIcon, label: 'Parâmetros' },
]

export { viewsPermitidas }

export default function Sidebar({
  activeView, setActiveView, loggedUser, sidebarOpen, setSidebarOpen, onOpenAI, onSignOut, onVoltarPortal, pendingAprovacoes = 0, emailUnreadCount = 0
}: SidebarProps) {
  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border-black/[0.07] dark:border-white/[0.08] border-r flex flex-col shadow-2xl`}>
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <img src="/Logo_MFParis.png" alt="GMF Paris" className="h-8 w-8 rounded-lg object-cover ring-1 ring-black/[0.06]" />
          <h1 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">Grupo MF Paris</h1>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg" title="Fechar menu">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems
          .filter(item => viewsPermitidas[loggedUser.cargo].includes(item.id))
          .map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveView(item.id); setSidebarOpen(false) }}
              className={`
                w-full flex items-center px-3 py-2 text-[13px] font-medium rounded-xl transition-all duration-150
                ${activeView === item.id
                  ? 'bg-[#E8ECF4] dark:bg-white/[0.11] text-primary-700 dark:text-white font-semibold'
                  : item.id === 'aprovacao' && pendingAprovacoes > 0
                  ? 'text-amber-700 bg-amber-50/80 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-500/10'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-gray-100'
                }
              `}
            >
              <item.icon className="mr-2.5 h-4 w-4 flex-shrink-0 stroke-[1.75]" />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.id === 'aprovacao' && pendingAprovacoes > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {pendingAprovacoes}
                </span>
              )}
              {item.id === 'email' && emailUnreadCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {emailUnreadCount > 99 ? '99+' : emailUnreadCount}
                </span>
              )}
            </button>
          ))}

      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        {onVoltarPortal && (
          <button
            onClick={() => { setSidebarOpen(false); onVoltarPortal() }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-apple text-xs font-semibold transition-colors"
          >
            ← Portal Grupo Paris
          </button>
        )}
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
