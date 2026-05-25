import React, { useState, useEffect } from 'react'
import { 
  BuildingOfficeIcon,
  ChartBarIcon,
  UsersIcon,
  CurrencyDollarIcon,
  TruckIcon,
  CogIcon,
  AcademicCapIcon,
  LightBulbIcon,
  CubeIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  UserCircleIcon,
  BellIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import { supabase } from '../lib/supabase'
import type { Vendedor } from '../types'

interface Sistema {
  id: string
  nome: string
  descricao: string
  icone: React.ComponentType<any>
  cor: string
  status: 'ativo' | 'manutencao' | 'em_desenvolvimento'
  url?: string
  categoria: 'gestao' | 'operacional' | 'financeiro' | 'rh' | 'inovacao'
  acesso: string
  ultimoAcesso?: string
}

const sistemas: Sistema[] = [
  {
    id: 'cerebro-paris',
    nome: 'Cérebro Paris',
    descricao: 'Sistema ERP integrado com IA para gestão empresarial completa',
    icone: LightBulbIcon,
    cor: 'bg-purple-600',
    status: 'ativo',
    categoria: 'gestao',
    acesso: 'gerente,vendedor,sdr'
  },
  {
    id: 'crm-mfparis',
    nome: 'CRM MF Paris',
    descricao: 'Gestão de relacionamento com clientes e funil de vendas',
    icone: UsersIcon,
    cor: 'bg-blue-600',
    status: 'ativo',
    categoria: 'gestao',
    acesso: 'gerente,vendedor,sdr'
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Controle financeiro, contas a pagar/receber e fluxo de caixa',
    icone: CurrencyDollarIcon,
    cor: 'bg-green-600',
    status: 'em_desenvolvimento',
    categoria: 'financeiro',
    acesso: 'gerente,financeiro'
  },
  {
    id: 'logistica',
    nome: 'Logística',
    descricao: 'Gestão de estoque, entregas e cadeia de suprimentos',
    icone: TruckIcon,
    cor: 'bg-orange-600',
    status: 'em_desenvolvimento',
    categoria: 'operacional',
    acesso: 'gerente,logistica'
  },
  {
    id: 'producao',
    nome: 'Produção',
    descricao: 'Controle de produção, ordens e qualidade',
    icone: CogIcon,
    cor: 'bg-gray-600',
    status: 'em_desenvolvimento',
    categoria: 'operacional',
    acesso: 'gerente,producao'
  },
  {
    id: 'rh',
    nome: 'Recursos Humanos',
    descricao: 'Gestão de equipe, ponto e folha de pagamento',
    icone: AcademicCapIcon,
    cor: 'bg-indigo-600',
    status: 'em_desenvolvimento',
    categoria: 'rh',
    acesso: 'gerente,rh'
  },
  {
    id: 'bi',
    nome: 'Business Intelligence',
    descricao: 'Análise de dados e relatórios gerenciais',
    icone: ChartBarIcon,
    cor: 'bg-pink-600',
    status: 'em_desenvolvimento',
    categoria: 'gestao',
    acesso: 'gerente,diretor'
  },
  {
    id: 'automacoes',
    nome: 'Automações',
    descricao: 'Fluxos de trabalho e automação empresarial',
    icone: CubeIcon,
    cor: 'bg-teal-600',
    status: 'em_desenvolvimento',
    categoria: 'inovacao',
    acesso: 'gerente'
  },
  {
    id: 'documentos',
    nome: 'Gestão Documental',
    descricao: 'Arquivamento digital e controle de documentos',
    icone: DocumentTextIcon,
    cor: 'bg-red-600',
    status: 'em_desenvolvimento',
    categoria: 'operacional',
    acesso: 'gerente,vendedor,sdr'
  }
]

const categorias = {
  gestao: { nome: 'Gestão', cor: 'bg-blue-100 text-blue-800' },
  operacional: { nome: 'Operacional', cor: 'bg-orange-100 text-orange-800' },
  financeiro: { nome: 'Financeiro', cor: 'bg-green-100 text-green-800' },
  rh: { nome: 'RH', cor: 'bg-indigo-100 text-indigo-800' },
  inovacao: { nome: 'Inovação', cor: 'bg-purple-100 text-purple-800' }
}

const statusConfig = {
  ativo: { cor: 'bg-green-100 text-green-800', texto: 'Ativo' },
  manutencao: { cor: 'bg-yellow-100 text-yellow-800', texto: 'Manutenção' },
  em_desenvolvimento: { cor: 'bg-gray-100 text-gray-800', texto: 'Em Desenvolvimento' }
}

interface GrupoParisPortalProps {
  loggedUser: Vendedor
  onSistemaSelect: (sistemaId: string) => void
}

export default function GrupoParisPortal({ loggedUser, onSistemaSelect }: GrupoParisPortalProps) {
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos')
  const [sistemasFiltrados, setSistemasFiltrados] = useState<Sistema[]>(sistemas)

  useEffect(() => {
    const filtrados = sistemas.filter(sistema => {
      const matchBusca = sistema.nome.toLowerCase().includes(busca.toLowerCase()) ||
                        sistema.descricao.toLowerCase().includes(busca.toLowerCase())
      
      const matchCategoria = categoriaFiltro === 'todos' || sistema.categoria === categoriaFiltro
      
      const matchAcesso = sistema.acesso.includes(loggedUser.cargo)
      
      return matchBusca && matchCategoria && matchAcesso
    })
    
    setSistemasFiltrados(filtrados)
  }, [busca, categoriaFiltro, loggedUser.cargo])

  const handleSistemaClick = (sistema: Sistema) => {
    if (sistema.status === 'ativo') {
      onSistemaSelect(sistema.id)
    }
  }

  const getSistemasPorCategoria = () => {
    const agrupados: Record<string, Sistema[]> = {}
    
    sistemasFiltrados.forEach(sistema => {
      if (!agrupados[sistema.categoria]) {
        agrupados[sistema.categoria] = []
      }
      agrupados[sistema.categoria].push(sistema)
    })
    
    return agrupados
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <BuildingOfficeIcon className="h-8 w-8 text-indigo-600 mr-3" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Grupo Paris</h1>
                <p className="text-sm text-gray-500">Portal de Sistemas</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar sistemas..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-64"
                />
              </div>
              
              <button className="p-2 text-gray-400 hover:text-gray-600 relative">
                <BellIcon className="h-6 w-6" />
                <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
              </button>
              
              <div className="flex items-center space-x-2">
                <UserCircleIcon className="h-8 w-8 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{loggedUser.nome}</p>
                  <p className="text-xs text-gray-500">{loggedUser.cargo}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filtros */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Sistemas Disponíveis</h2>
            <div className="flex space-x-2">
              {Object.entries(categorias).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => setCategoriaFiltro(key)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    categoriaFiltro === key 
                      ? cat.cor 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat.nome}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sistemas por Categoria */}
        <div className="space-y-8">
          {Object.entries(getSistemasPorCategoria()).map(([categoria, sistemasCat]) => (
            <div key={categoria}>
              <div className="flex items-center mb-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${categorias[categoria as keyof typeof categorias].cor}`}>
                  {categorias[categoria as keyof typeof categorias].nome}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  {sistemasCat.length} sistema{sistemasCat.length > 1 ? 's' : ''}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sistemasCat.map((sistema) => (
                  <div
                    key={sistema.id}
                    onClick={() => handleSistemaClick(sistema)}
                    className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer ${
                      sistema.status !== 'ativo' ? 'opacity-75 cursor-not-allowed' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`${sistema.cor} p-3 rounded-lg`}>
                        <sistema.icone className="h-6 w-6 text-white" />
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig[sistema.status].cor}`}>
                        {statusConfig[sistema.status].texto}
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{sistema.nome}</h3>
                    <p className="text-sm text-gray-600 mb-4">{sistema.descricao}</p>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {sistema.acesso.split(',').join(' • ')}
                      </span>
                      {sistema.status === 'ativo' && (
                        <ArrowRightIcon className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Mensagem se não encontrar sistemas */}
        {sistemasFiltrados.length === 0 && (
          <div className="text-center py-12">
            <div className="bg-gray-100 rounded-full p-4 w-16 h-16 mx-auto mb-4">
              <MagnifyingGlassIcon className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum sistema encontrado</h3>
            <p className="text-gray-500">Tente ajustar os filtros ou a busca</p>
          </div>
        )}
      </main>
    </div>
  )
}
