import React, { useState, useEffect } from 'react'
import type { ModuloERP, UsuarioERP } from '../types/cerebro-paris'
import type { Vendedor } from '../types'
import CerebroParisView from './views/CriarAutomacaoView'
import CerebroParisSidebar from './CerebroParisSidebar'
import CerebroParisTopBar from './CerebroParisTopBar'

// Import das views do CRM existente
import DashboardView from './views/DashboardView'
import ClientesView from './views/ClientesView'
import FunilView from './views/FunilView'
import PedidosView from './views/PedidosView'
import TarefasView from './views/TarefasView'
import AutomacoesView from './views/AutomacoesView'
import AssistenteIAView from './views/AssistenteIAView'
import IntegracoesView from './views/IntegracoesView'
import RelatoriosView from './views/RelatoriosView'
import VendedoresView from './views/VendedoresView'
import ProdutosView from './views/ProdutosView'

// Import das novas views do Cérebro Paris
import CerebroParisDashboard from './views/CerebroParisView'

// Views placeholder para novos módulos (serão implementados)
const FinanceiroView = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 mb-4">Módulo Financeiro</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo Financeiro em desenvolvimento...</p>
    </div>
  </div>
)

const LogisticaView = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 mb-4">Módulo Logística</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo Logística em desenvolvimento...</p>
    </div>
  </div>
)

const ProducaoView = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 mb-4">Módulo Produção</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo Produção em desenvolvimento...</p>
    </div>
  </div>
)

const RHView = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 mb-4">Módulo Recursos Humanos</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo RH em desenvolvimento...</p>
    </div>
  </div>
)

const BIView = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 mb-4">Business Intelligence</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo BI em desenvolvimento...</p>
    </div>
  </div>
)

const IAContextualView = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 mb-4">IA Contextual</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo IA Contextual em desenvolvimento...</p>
    </div>
  </div>
)

const AutomacoesEmpresariaisView = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 mb-4">Automações Empresariais</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo Automações em desenvolvimento...</p>
    </div>
  </div>
)

const ConfiguracoesView = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 mb-4">Configurações</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo Configurações em desenvolvimento...</p>
    </div>
  </div>
)

interface CerebroParisRouterProps {
  usuario: UsuarioERP
  onSignOut: () => void
}

// Função para converter UsuarioERP para Vendedor (compatibilidade)
function converterParaVendedor(usuario: UsuarioERP): Vendedor {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    cargo: usuario.cargo === 'gerente' ? 'gerente' : 
           usuario.cargo === 'analista' ? 'vendedor' : 
           usuario.cargo === 'operacional' ? 'sdr' : 'vendedor',
    telefone: usuario.telefone,
    avatar: usuario.avatar,
    usuario: usuario.usuario,
    metaVendas: usuario.metaVendas,
    metaLeads: usuario.metaLeads,
    metaConversao: usuario.metaConversao,
    ativo: usuario.ativo
  }
}

export default function CerebroParisRouter({ usuario, onSignOut }: CerebroParisRouterProps) {
  const [activeModule, setActiveModule] = useState<ModuloERP>('dashboard-executivo')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simular carregamento inicial
    setTimeout(() => setLoading(false), 1000)
  }, [])

  const renderModule = () => {
    switch (activeModule) {
      // Dashboard Executivo Principal
      case 'dashboard-executivo':
        return <CerebroParisDashboard usuario={usuario} onModuloChange={setActiveModule} />
      
      // Módulos do CRM existente (versões simplificadas para teste)
      case 'crm':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Módulo CRM</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de Clientes e Vendas em desenvolvimento...</p>
              <p className="text-sm text-gray-500 mt-2">Usuário: {usuario.nome} ({usuario.cargo})</p>
            </div>
          </div>
        )
      case 'dashboard':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Dashboard CRM</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Dashboard do CRM em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'funil':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Funil de Vendas</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Funil de Vendas em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'pedidos':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Pedidos</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de Pedidos em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'tarefas':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Tarefas</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de Tarefas em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'automacoes':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Automações</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de Automações em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'ia':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Assistente IA</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Assistente IA em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'integracoes':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Integrações</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de Integrações em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'relatorios':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Relatórios</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de Relatórios em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'equipe':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Equipe</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de Equipe em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'produtos':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Produtos</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de Produtos em desenvolvimento...</p>
            </div>
          </div>
        )
      case 'criar-automacao':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Criar Automação</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Criador de Automações em desenvolvimento...</p>
            </div>
          </div>
        )
      
      // Novos módulos do Cérebro Paris
      case 'financeiro':
        return <FinanceiroView />
      case 'logistica':
        return <LogisticaView />
      case 'producao':
        return <ProducaoView />
      case 'rh':
        return <RHView />
      case 'bi':
        return <BIView />
      case 'ia-contextual':
        return <IAContextualView />
      case 'automacoes-empresariais':
        return <AutomacoesEmpresariaisView />
      case 'configuracoes':
        return <ConfiguracoesView />
      
      default:
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Módulo não encontrado</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">O módulo "{activeModule}" não está disponível.</p>
            </div>
          </div>
        )
    }
  }

  const getModuleTitle = () => {
    const titles: Record<ModuloERP, string> = {
      'dashboard-executivo': 'Dashboard Executivo',
      'crm': 'CRM',
      'financeiro': 'Financeiro',
      'logistica': 'Logística',
      'producao': 'Produção',
      'rh': 'Recursos Humanos',
      'bi': 'Business Intelligence',
      'automacoes': 'Automações Empresariais',
      'ia-contextual': 'IA Contextual',
      'configuracoes': 'Configurações',
      'dashboard': 'Dashboard',
      'funil': 'Funil de Vendas',
      'clientes': 'Clientes',
      'pedidos': 'Pedidos',
      'tarefas': 'Tarefas',
      'ia': 'Assistente IA',
      'integracoes': 'Integrações',
      'relatorios': 'Relatórios',
      'equipe': 'Equipe',
      'produtos': 'Produtos',
      'criar-automacao': 'Criar Automação',
      'automacoes-empresariais': 'Automações Empresariais',
      'templates': 'Templates',
      'treinamento': 'Treinamento',
      'prospeccao': 'Prospecção',
      'baseleads': 'Base de Leads'
    }
    return titles[activeModule] || 'Cérebro Paris'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Cérebro Paris</h2>
          <p className="text-gray-600">Carregando sistema...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar */}
      <CerebroParisSidebar
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        usuario={usuario}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <CerebroParisTopBar
          title={getModuleTitle()}
          usuario={usuario}
          onSignOut={onSignOut}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Module Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {renderModule()}
        </main>
      </div>
    </div>
  )
}
