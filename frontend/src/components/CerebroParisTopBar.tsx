import React, { useState } from 'react'
import {
  Bars3Icon,
  BellIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  SparklesIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  TruckIcon,
  UserGroupIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import type { UsuarioERP, ModuloERP } from '../types/cerebro-paris'

interface CerebroParisTopBarProps {
  title: string
  usuario: UsuarioERP
  onSignOut: () => void
  onMenuClick: () => void
}

interface AlertaRapido {
  id: string
  titulo: string
  severidade: 'baixa' | 'media' | 'alta' | 'critica'
  modulo: ModuloERP
}

interface KPIRapido {
  id: string
  nome: string
  valor: string | number
  variacao: number
  status: 'positivo' | 'atencao' | 'critico'
}

// Mock de dados rápidos
const alertasRapidos: AlertaRapido[] = [
  {
    id: '1',
    titulo: 'Estoque crítico MP-004',
    severidade: 'critica',
    modulo: 'logistica'
  },
  {
    id: '2',
    titulo: 'Pagamento em atraso',
    severidade: 'alta',
    modulo: 'financeiro'
  },
  {
    id: '3',
    titulo: 'OEE Linha 2 abaixo',
    severidade: 'media',
    modulo: 'producao'
  }
]

const kpisRapidos: KPIRapido[] = [
  {
    id: '1',
    nome: 'Faturamento',
    valor: 'R$ 2.4M',
    variacao: 12.5,
    status: 'positivo'
  },
  {
    id: '2',
    nome: 'Margem',
    valor: '18.5%',
    variacao: -2.3,
    status: 'atencao'
  },
  {
    id: '3',
    nome: 'Pedidos',
    valor: 342,
    variacao: 8.7,
    status: 'positivo'
  }
]

export default function CerebroParisTopBar({
  title,
  usuario,
  onSignOut,
  onMenuClick
}: CerebroParisTopBarProps) {
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showQuickStats, setShowQuickStats] = useState(false)

  const getCorSeveridade = (severidade: string) => {
    switch (severidade) {
      case 'critica': return 'bg-red-100 text-red-800 border-red-200'
      case 'alta': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'media': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getCorStatus = (status: string) => {
    switch (status) {
      case 'positivo': return 'text-green-600'
      case 'atencao': return 'text-yellow-600'
      case 'critico': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getIconeModulo = (modulo: string) => {
    switch (modulo) {
      case 'financeiro': return CurrencyDollarIcon
      case 'logistica': return TruckIcon
      case 'producao': return Cog6ToothIcon
      case 'crm': return UserGroupIcon
      default: return ChartBarIcon
    }
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side */}
          <div className="flex items-center gap-4">
            {/* Menu button */}
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            {/* Title */}
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-500">Cérebro Paris ERP</p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Quick Stats Toggle */}
            <button
              onClick={() => setShowQuickStats(!showQuickStats)}
              className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChartBarIcon className="h-4 w-4" />
              <span className="hidden md:inline">Estatísticas</span>
            </button>

            {/* Search */}
            <div className="relative">
              {showSearch ? (
                <div className="flex items-center bg-gray-100 rounded-lg">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 ml-3" />
                  <input
                    type="text"
                    placeholder="Buscar no sistema..."
                    className="bg-transparent px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none w-64"
                    autoFocus
                    onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                  />
                  <button
                    onClick={() => setShowSearch(false)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSearch(true)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <BellIcon className="h-5 w-5" />
                {alertasRapidos.length > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900">Alertas Recentes</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {alertasRapidos.map((alerta) => {
                      const IconeModulo = getIconeModulo(alerta.modulo)
                      return (
                        <div key={alerta.id} className="p-3 hover:bg-gray-50 border-b border-gray-100">
                          <div className="flex items-start gap-3">
                            <IconeModulo className="h-4 w-4 text-gray-400 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{alerta.titulo}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getCorSeveridade(alerta.severidade)}`}>
                                  {alerta.severidade}
                                </span>
                                <span className="text-xs text-gray-500 capitalize">{alerta.modulo}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="p-3 border-t border-gray-200">
                    <button className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                      Ver todos os alertas
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* AI Assistant */}
            <button className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-colors">
              <SparklesIcon className="h-4 w-4" />
              <span className="hidden sm:inline">IA</span>
            </button>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-indigo-600">
                    {usuario.nome.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </span>
                </div>
                <span className="hidden md:block text-sm font-medium text-gray-700">
                  {usuario.nome.split(' ')[0]}
                </span>
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-3 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">{usuario.nome}</p>
                    <p className="text-xs text-gray-500 capitalize">{usuario.cargo}</p>
                  </div>
                  <div className="py-1">
                    <button className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <UserCircleIcon className="h-4 w-4" />
                      Meu Perfil
                    </button>
                    <button className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <Cog6ToothIcon className="h-4 w-4" />
                      Configurações
                    </button>
                    <button
                      onClick={onSignOut}
                      className="flex items-center gap-3 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <ArrowRightOnRectangleIcon className="h-4 w-4" />
                      Sair
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        {showQuickStats && (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">
                  {alertasRapidos.length} alerta{alertasRapidos.length !== 1 ? 's' : ''} ativo{alertasRapidos.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              <div className="flex items-center gap-6">
                {kpisRapidos.map((kpi) => (
                  <div key={kpi.id} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">{kpi.nome}:</span>
                    <span className="text-sm font-medium text-gray-900">{kpi.valor}</span>
                    <span className={`text-xs font-medium ${getCorStatus(kpi.status)}`}>
                      {kpi.variacao > 0 ? '+' : ''}{kpi.variacao}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Close dropdowns when clicking outside */}
      {(showNotifications || showUserMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowNotifications(false)
            setShowUserMenu(false)
          }}
        />
      )}
    </header>
  )
}
