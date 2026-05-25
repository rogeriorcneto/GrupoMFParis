import React from 'react'
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  TruckIcon,
  CogIcon,
  UserGroupIcon,
  ChartPieIcon,
  SparklesIcon,
  Cog6ToothIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
  XMarkIcon,
  Bars3Icon
} from '@heroicons/react/24/outline'
import type { ModuloERP, UsuarioERP } from '../types/cerebro-paris'

interface CerebroParisSidebarProps {
  activeModule: ModuloERP
  onModuleChange: (module: ModuloERP) => void
  usuario: UsuarioERP
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

interface ModuloInfo {
  id: ModuloERP
  nome: string
  descricao: string
  icone: React.ElementType
  categoria: 'executivo' | 'operacional' | 'estrategico' | 'suporte'
}

const modulosDisponiveis: ModuloInfo[] = [
  // Módulo Executivo Principal
  {
    id: 'dashboard-executivo',
    nome: 'Dashboard Executivo',
    descricao: 'Visão 360° da empresa',
    icone: HomeIcon,
    categoria: 'executivo'
  },
  
  // Módulos Operacionais Principais
  {
    id: 'crm',
    nome: 'CRM',
    descricao: 'Gestão de clientes e vendas',
    icone: UserGroupIcon,
    categoria: 'operacional'
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Contas, fluxo e DRE',
    icone: CurrencyDollarIcon,
    categoria: 'operacional'
  },
  {
    id: 'logistica',
    nome: 'Logística',
    descricao: 'Estoque, frota e supply chain',
    icone: TruckIcon,
    categoria: 'operacional'
  },
  {
    id: 'producao',
    nome: 'Produção',
    descricao: 'MRP, qualidade e OEE',
    icone: CogIcon,
    categoria: 'operacional'
  },
  {
    id: 'rh',
    nome: 'Recursos Humanos',
    descricao: 'Folha, benefícios e performance',
    icone: AcademicCapIcon,
    categoria: 'operacional'
  },
  
  // Módulos Estratégicos
  {
    id: 'bi',
    nome: 'Business Intelligence',
    descricao: 'Análises e dashboards',
    icone: ChartPieIcon,
    categoria: 'estrategico'
  },
  {
    id: 'ia-contextual',
    nome: 'IA Contextual',
    descricao: 'Assistente empresarial',
    icone: SparklesIcon,
    categoria: 'estrategico'
  },
  {
    id: 'automacoes',
    nome: 'Automações',
    descricao: 'Fluxos e integrações',
    icone: Cog6ToothIcon,
    categoria: 'estrategico'
  },
  
  // Módulo de Suporte
  {
    id: 'configuracoes',
    nome: 'Configurações',
    descricao: 'Sistema e integrações',
    icone: BuildingOfficeIcon,
    categoria: 'suporte'
  }
]

export default function CerebroParisSidebar({
  activeModule,
  onModuleChange,
  usuario,
  sidebarOpen,
  setSidebarOpen
}: CerebroParisSidebarProps) {
  
  // Filtrar módulos baseado nas permissões do usuário
  const modulosPermitidos = modulosDisponiveis.filter(modulo => 
    usuario.modulosPermitidos.includes(modulo.id)
  )

  // Agrupar módulos por categoria
  const modulosPorCategoria = modulosPermitidos.reduce((acc, modulo) => {
    if (!acc[modulo.categoria]) {
      acc[modulo.categoria] = []
    }
    acc[modulo.categoria].push(modulo)
    return acc
  }, {} as Record<string, ModuloInfo[]>)

  const getCorCategoria = (categoria: string) => {
    switch (categoria) {
      case 'executivo': return 'text-purple-600 bg-purple-100'
      case 'operacional': return 'text-blue-600 bg-blue-100'
      case 'estrategico': return 'text-green-600 bg-green-100'
      case 'suporte': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getNomeCategoria = (categoria: string) => {
    switch (categoria) {
      case 'executivo': return 'Executivo'
      case 'operacional': return 'Operacional'
      case 'estrategico': return 'Estratégico'
      case 'suporte': return 'Suporte'
      default: return 'Outros'
    }
  }

  return (
    <>
      {/* Overlay para mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg">
                <BuildingOfficeIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Cérebro Paris</h1>
                <p className="text-xs text-indigo-100">ERP Inteligente</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-white hover:bg-white hover:bg-opacity-20 rounded"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Info do Usuário */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-indigo-600">
                  {usuario.nome.split(' ').map(n => n[0]).join('').toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{usuario.nome}</p>
                <p className="text-xs text-gray-500 capitalize">{usuario.cargo}</p>
              </div>
            </div>
          </div>

          {/* Navegação */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {Object.entries(modulosPorCategoria).map(([categoria, modulos]) => (
              <div key={categoria}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {getNomeCategoria(categoria)}
                </h3>
                <nav className="space-y-1">
                  {modulos.map((modulo) => {
                    const IconeModulo = modulo.icone
                    const isActive = activeModule === modulo.id
                    const corCategoria = getCorCategoria(modulo.categoria)
                    
                    return (
                      <button
                        key={modulo.id}
                        onClick={() => {
                          onModuleChange(modulo.id)
                          setSidebarOpen(false) // Fechar no mobile
                        }}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                          ${isActive 
                            ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600' 
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                          }
                        `}
                      >
                        <div className={`p-1 rounded ${isActive ? 'bg-indigo-100' : corCategoria}`}>
                          <IconeModulo className="h-4 w-4" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium">{modulo.nome}</div>
                          <div className="text-xs text-gray-500">{modulo.descricao}</div>
                        </div>
                      </button>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ClipboardDocumentListIcon className="h-4 w-4" />
              <span>v1.0.0</span>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              © 2026 Grupo MF Paris
            </div>
          </div>
        </div>
      </div>

      {/* Botão Menu Mobile */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-50 p-3 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700"
      >
        <Bars3Icon className="h-6 w-6" />
      </button>
    </>
  )
}
