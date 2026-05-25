import React, { useState, useEffect } from 'react'
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  TruckIcon,
  CogIcon,
  UserGroupIcon,
  ChartPieIcon,
  SparklesIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  BellIcon,
  EyeIcon,
  LightBulbIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  CubeIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline'
import type { 
  DashboardExecutivo, 
  KPIPrincipal, 
  AlertaInteligente, 
  Previsao, 
  RecomendacaoIA,
  ResumoModulo,
  ModuloERP,
  UsuarioERP 
} from '../../types/cerebro-paris'

interface CerebroParisViewProps {
  usuario: UsuarioERP
  onModuloChange: (modulo: ModuloERP) => void
}

// Mock de dados - será substituído por dados reais do Supabase
const mockDashboard: DashboardExecutivo = {
  kpisPrincipais: [
    {
      id: '1',
      nome: 'Faturamento Mensal',
      valor: 'R$ 2.4M',
      meta: 2500000,
      variacaoPercentual: 12.5,
      tendencia: 'alta',
      status: 'positivo',
      moduloOrigem: 'financeiro',
      dataAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      id: '2',
      nome: 'Margem de Lucro',
      valor: '18.5%',
      meta: 20,
      variacaoPercentual: -2.3,
      tendencia: 'baixa',
      status: 'atencao',
      moduloOrigem: 'financeiro',
      dataAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      id: '3',
      nome: 'Pedidos no Mês',
      valor: 342,
      meta: 350,
      variacaoPercentual: 8.7,
      tendencia: 'alta',
      status: 'positivo',
      moduloOrigem: 'crm',
      dataAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      id: '4',
      nome: 'Taxa de Entrega',
      valor: '94.2%',
      meta: 95,
      variacaoPercentual: 1.8,
      tendencia: 'alta',
      status: 'positivo',
      moduloOrigem: 'logistica',
      dataAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      id: '5',
      nome: 'Eficiência Produção',
      valor: '87.3%',
      meta: 85,
      variacaoPercentual: 3.2,
      tendencia: 'alta',
      status: 'positivo',
      moduloOrigem: 'producao',
      dataAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      id: '6',
      nome: 'Satisfação Equipe',
      valor: '8.2/10',
      meta: 8.5,
      variacaoPercentual: -0.5,
      tendencia: 'baixa',
      status: 'atencao',
      moduloOrigem: 'rh',
      dataAtualizacao: '2026-05-25T16:00:00Z'
    }
  ],
  alertasInteligentes: [
    {
      id: '1',
      titulo: 'Estoque Crítico - MP-004',
      descricao: 'Matéria-prima MP-004 com estoque abaixo do mínimo. Risco de parada produção em 3 dias.',
      severidade: 'critica',
      modulo: 'logistica',
      dadosRelacionados: { produto: 'MP-004', estoqueAtual: 150, estoqueMinimo: 500 },
      acoesSugeridas: ['Solicitar compra urgente', 'Verificar fornecedores alternativos'],
      criadoEm: '2026-05-25T14:30:00Z',
      lido: false
    },
    {
      id: '2',
      titulo: 'Atraso Pagamento Cliente X',
      descricao: 'Cliente X com fatura vencida há 15 dias. Valor: R$ 45.000',
      severidade: 'alta',
      modulo: 'financeiro',
      dadosRelacionados: { cliente: 'Cliente X', valor: 45000, diasAtraso: 15 },
      acoesSugeridas: ['Enviar notificação', 'Acionar equipe de cobrança'],
      criadoEm: '2026-05-25T13:15:00Z',
      lido: false
    },
    {
      id: '3',
      titulo: 'OEE Linha 2 Abaixo',
      descricao: 'Eficiência da linha 2 caiu 15% nas últimas 24h',
      severidade: 'media',
      modulo: 'producao',
      dadosRelacionados: { linha: 'Linha 2', oeeAtual: 72, oeeHistorico: 85 },
      acoesSugeridas: ['Verificar manutenção', 'Analisar qualidade'],
      criadoEm: '2026-05-25T12:00:00Z',
      lido: true
    }
  ],
  previsoes: [
    {
      id: '1',
      titulo: 'Demanda Próximo Trimestre',
      periodo: '2026 Q3',
      valorPrevisto: 8500000,
      confianca: 87,
      cenario: 'realista',
      modulo: 'crm',
      dados: []
    },
    {
      id: '2',
      titulo: 'Fluxo Caixa 90 dias',
      periodo: '2026-08',
      valorPrevisto: 1200000,
      confianca: 92,
      cenario: 'realista',
      modulo: 'financeiro',
      dados: []
    }
  ],
  recomendacoesIA: [
    {
      id: '1',
      titulo: 'Oportunidade Cross-selling',
      descricao: 'IA identificou 23 clientes com alto potencial para compra de produtos complementares',
      impacto: 'alto',
      esforco: 'medio',
      modulo: 'crm',
      contexto: 'Baseado em histórico de compras e comportamento similar',
      acoes: [
        { id: '1', descricao: 'Criar campanha direcionada', tipo: 'automacao', prioridade: 1 },
        { id: '2', descricao: 'Treinar equipe de vendas', tipo: 'manual', prioridade: 2 }
      ]
    },
    {
      id: '2',
      titulo: 'Otimização Rota Entrega',
      descricao: 'Nova rota pode reduzir custos de frete em 12% e tempo em 18%',
      impacto: 'transformador',
      esforco: 'alto',
      modulo: 'logistica',
      contexto: 'Análise de padrões de entrega e tráfego',
      acoes: [
        { id: '1', descricao: 'Simular nova rota', tipo: 'analise', prioridade: 1 },
        { id: '2', descricao: 'Implementar mudança', tipo: 'automacao', prioridade: 2 }
      ]
    }
  ],
  resumoModulos: [
    {
      modulo: 'financeiro',
      status: 'atencao',
      kpisChave: [
        { nome: 'Faturamento', valor: 'R$ 2.4M' },
        { nome: 'Margem', valor: '18.5%' }
      ],
      tarefasPendentes: 8,
      alertasAtivos: 2,
      ultimaAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      modulo: 'crm',
      status: 'normal',
      kpisChave: [
        { nome: 'Pedidos', valor: 342 },
        { nome: 'Conversão', valor: '23.5%' }
      ],
      tarefasPendentes: 15,
      alertasAtivos: 0,
      ultimaAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      modulo: 'logistica',
      status: 'critico',
      kpisChave: [
        { nome: 'Entregas', valor: '94.2%' },
        { nome: 'Estoque', valor: '87.3%' }
      ],
      tarefasPendentes: 12,
      alertasAtivos: 3,
      ultimaAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      modulo: 'producao',
      status: 'normal',
      kpisChave: [
        { nome: 'Eficiência', valor: '87.3%' },
        { nome: 'Qualidade', valor: '98.1%' }
      ],
      tarefasPendentes: 6,
      alertasAtivos: 1,
      ultimaAtualizacao: '2026-05-25T16:00:00Z'
    },
    {
      modulo: 'rh',
      status: 'atencao',
      kpisChave: [
        { nome: 'Funcionários', valor: 142 },
        { nome: 'Satisfação', valor: '8.2/10' }
      ],
      tarefasPendentes: 4,
      alertasAtivos: 1,
      ultimaAtualizacao: '2026-05-25T16:00:00Z'
    }
  ]
}

export default function CerebroParisView({ usuario, onModuloChange }: CerebroParisViewProps) {
  const [dashboard, setDashboard] = useState<DashboardExecutivo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [alertasNaoLidos, setAlertasNaoLidos] = useState(0)

  useEffect(() => {
    // Simular carregamento de dados
    setTimeout(() => {
      setDashboard(mockDashboard)
      setAlertasNaoLidos(mockDashboard.alertasInteligentes.filter(a => !a.lido).length)
      setCarregando(false)
    }, 1000)
  }, [])

  const getIconeModulo = (modulo: ModuloERP) => {
    const icones = {
      'dashboard-executivo': ChartBarIcon,
      'crm': UserGroupIcon,
      'financeiro': CurrencyDollarIcon,
      'logistica': TruckIcon,
      'producao': CogIcon,
      'rh': AcademicCapIcon,
      'bi': ChartPieIcon,
      'automacoes': Cog6ToothIcon,
      'ia-contextual': SparklesIcon,
      'configuracoes': BuildingOfficeIcon
    }
    return icones[modulo] || ChartBarIcon
  }

  const getCorStatus = (status: string) => {
    switch (status) {
      case 'positivo': return 'text-green-600 bg-green-100'
      case 'atencao': return 'text-yellow-600 bg-yellow-100'
      case 'critico': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getCorSeveridade = (severidade: string) => {
    switch (severidade) {
      case 'critica': return 'border-red-500 bg-red-50'
      case 'alta': return 'border-orange-500 bg-orange-50'
      case 'media': return 'border-yellow-500 bg-yellow-50'
      default: return 'border-gray-300 bg-gray-50'
    }
  }

  const getIconeTendencia = (tendencia: string) => {
    switch (tendencia) {
      case 'alta': return <ArrowTrendingUpIcon className="h-4 w-4 text-green-600" />
      case 'baixa': return <ArrowTrendingDownIcon className="h-4 w-4 text-red-600" />
      default: return <MinusIcon className="h-4 w-4 text-gray-600" />
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Erro ao carregar dashboard executivo</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cérebro Paris</h1>
          <p className="text-gray-600 mt-1">Visão 360° da Empresa - {usuario.nome}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <BellIcon className="h-6 w-6 text-gray-600 cursor-pointer hover:text-gray-900" />
            {alertasNaoLidos > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {alertasNaoLidos}
              </span>
            )}
          </div>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
            <SparklesIcon className="h-4 w-4" />
            Perguntar à IA
          </button>
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {dashboard.kpisPrincipais.map((kpi) => (
          <div key={kpi.id} className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">{kpi.nome}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCorStatus(kpi.status)}`}>
                {kpi.status}
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{kpi.valor}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {getIconeTendencia(kpi.tendencia)}
                <span className={`text-sm font-medium ${
                  kpi.variacaoPercentual > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {kpi.variacaoPercentual > 0 ? '+' : ''}{kpi.variacaoPercentual}%
                </span>
              </div>
              <span className="text-xs text-gray-500">{kpi.moduloOrigem}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alertas Inteligentes */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />
                Alertas Inteligentes
              </h2>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {dashboard.alertasInteligentes.map((alerta) => (
                <div key={alerta.id} className={`p-3 rounded-lg border ${getCorSeveridade(alerta.severidade)} ${!alerta.lido ? 'border-l-4' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 text-sm">{alerta.titulo}</h3>
                      <p className="text-xs text-gray-600 mt-1">{alerta.descricao}</p>
                      <div className="mt-2">
                        <span className="text-xs text-gray-500">{alerta.modulo}</span>
                      </div>
                    </div>
                    {!alerta.lido && (
                      <div className="w-2 h-2 bg-blue-600 rounded-full mt-1"></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recomendações da IA */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <LightBulbIcon className="h-5 w-5 text-yellow-600" />
                Recomendações IA
              </h2>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {dashboard.recomendacoesIA.map((rec) => (
                <div key={rec.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900 text-sm">{rec.titulo}</h3>
                    <div className="flex items-center gap-1">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        rec.impacto === 'transformador' ? 'bg-purple-100 text-purple-800' :
                        rec.impacto === 'alto' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {rec.impacto}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{rec.descricao}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{rec.modulo}</span>
                    <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Ver detalhes
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Previsões */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ChartBarIcon className="h-5 w-5 text-green-600" />
                Previsões
              </h2>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {dashboard.previsoes.map((previsao) => (
                <div key={previsao.id} className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="font-medium text-gray-900 text-sm mb-1">{previsao.titulo}</h3>
                  <div className="text-lg font-bold text-gray-900 mb-1">
                    R$ {(previsao.valorPrevisto / 1000000).toFixed(1)}M
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${previsao.confianca}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-gray-600">{previsao.confianca}%</span>
                    </div>
                    <span className="text-xs text-gray-500">{previsao.periodo}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Resumo dos Módulos */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Visão Geral dos Módulos</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {dashboard.resumoModulos.map((modulo) => {
              const IconeModulo = getIconeModulo(modulo.modulo)
              return (
                <div 
                  key={modulo.modulo} 
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onModuloChange(modulo.modulo)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <IconeModulo className="h-6 w-6 text-gray-600" />
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      modulo.status === 'normal' ? 'bg-green-100 text-green-800' :
                      modulo.status === 'atencao' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {modulo.status}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 mb-2 capitalize">
                    {modulo.modulo.replace('-', ' ')}
                  </h3>
                  <div className="space-y-1">
                    {modulo.kpisChave.map((kpi, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-gray-600">{kpi.nome}:</span>
                        <span className="font-medium text-gray-900">{kpi.valor}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-xs text-gray-500">
                    <span>{modulo.tarefasPendentes} tarefas</span>
                    <span>{modulo.alertasAtivos} alertas</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Ações Rápidas */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Ações Rápidas</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <button 
              onClick={() => onModuloChange('financeiro')}
              className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <CurrencyDollarIcon className="h-8 w-8 text-gray-600 mb-2" />
              <span className="text-sm font-medium text-gray-900">Financeiro</span>
            </button>
            <button 
              onClick={() => onModuloChange('crm')}
              className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <UserGroupIcon className="h-8 w-8 text-gray-600 mb-2" />
              <span className="text-sm font-medium text-gray-900">CRM</span>
            </button>
            <button 
              onClick={() => onModuloChange('logistica')}
              className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <TruckIcon className="h-8 w-8 text-gray-600 mb-2" />
              <span className="text-sm font-medium text-gray-900">Logística</span>
            </button>
            <button 
              onClick={() => onModuloChange('producao')}
              className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <CogIcon className="h-8 w-8 text-gray-600 mb-2" />
              <span className="text-sm font-medium text-gray-900">Produção</span>
            </button>
            <button 
              onClick={() => onModuloChange('rh')}
              className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <AcademicCapIcon className="h-8 w-8 text-gray-600 mb-2" />
              <span className="text-sm font-medium text-gray-900">RH</span>
            </button>
            <button 
              onClick={() => onModuloChange('automacoes')}
              className="flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Cog6ToothIcon className="h-8 w-8 text-gray-600 mb-2" />
              <span className="text-sm font-medium text-gray-900">Automações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
