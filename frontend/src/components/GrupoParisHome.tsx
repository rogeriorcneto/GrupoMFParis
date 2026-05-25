import React from 'react'

interface SistemaCard {
  id: string
  nome: string
  descricao: string
  icone: string
  cor: string
  status: 'disponivel' | 'em_breve'
  categoria: string
}

const sistemas: SistemaCard[] = [
  {
    id: 'crm',
    nome: 'CRM MF Paris',
    descricao: 'Gestão de clientes, funil de vendas, pedidos e relacionamento comercial',
    icone: '🎯',
    cor: 'from-blue-500 to-blue-700',
    status: 'disponivel',
    categoria: 'Comercial'
  },
  {
    id: 'cerebro',
    nome: 'Cérebro Paris (IA)',
    descricao: 'IA contextual com visão 360° de todas operações da empresa',
    icone: '🧠',
    cor: 'from-purple-500 to-indigo-700',
    status: 'disponivel',
    categoria: 'Inteligência'
  },
  {
    id: 'logistica',
    nome: 'Logística & Frete',
    descricao: 'Transportadoras, rotas, rastreamento e gestão de entregas',
    icone: '🚚',
    cor: 'from-orange-500 to-red-600',
    status: 'disponivel',
    categoria: 'Operações'
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Contas a pagar/receber, fluxo de caixa, DRE e conciliação',
    icone: '💰',
    cor: 'from-green-500 to-emerald-600',
    status: 'disponivel',
    categoria: 'Financeiro'
  },
  {
    id: 'producao',
    nome: 'Produção',
    descricao: 'Ordens de produção, controle de qualidade e estoque industrial',
    icone: '🏭',
    cor: 'from-gray-600 to-gray-800',
    status: 'disponivel',
    categoria: 'Operações'
  },
  {
    id: 'rh',
    nome: 'Recursos Humanos',
    descricao: 'Folha de pagamento, ponto eletrônico, benefícios e gestão de pessoas',
    icone: '👥',
    cor: 'from-indigo-500 to-blue-600',
    status: 'disponivel',
    categoria: 'Pessoas'
  },
  {
    id: 'bi',
    nome: 'Business Intelligence',
    descricao: 'Dashboards executivos, análises avançadas e relatórios gerenciais',
    icone: '📊',
    cor: 'from-pink-500 to-purple-600',
    status: 'disponivel',
    categoria: 'Inteligência'
  },
  {
    id: 'documentos',
    nome: 'Gestão Documental',
    descricao: 'Arquivamento digital, contratos, NFe e documentos da empresa',
    icone: '📁',
    cor: 'from-red-500 to-rose-600',
    status: 'disponivel',
    categoria: 'Operações'
  }
]

interface Props {
  usuario: { nome: string; cargo: string; email: string } | null
  onSelectSistema: (id: any) => void
  onSignOut: () => void
}

export default function GrupoParisHome({ usuario, onSelectSistema, onSignOut }: Props) {
  const categorias = Array.from(new Set(sistemas.map(s => s.categoria)))

  const handleClick = (sistema: SistemaCard) => {
    if (sistema.status === 'disponivel') {
      onSelectSistema(sistema.id)
    } else {
      onSelectSistema(sistema.id) // mostrar placeholder
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-md bg-black/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-xl shadow-lg flex items-center justify-center p-1.5">
              <img
                src="/Logo_MFParis.jpg"
                alt="GMF Paris"
                className="w-full h-full object-contain rounded-lg"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Grupo MF Paris</h1>
              <p className="text-xs text-indigo-200">Portal Empresarial Unificado</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {usuario && (
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium text-white">{usuario.nome}</p>
                <p className="text-xs text-indigo-200 capitalize">{usuario.cargo}</p>
              </div>
            )}
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
              {usuario?.nome?.charAt(0).toUpperCase() || 'U'}
            </div>
            <button
              onClick={onSignOut}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors border border-white/20"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 pt-12 pb-8">
        <div className="text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Bem-vindo{usuario?.nome ? `, ${usuario.nome.split(' ')[0]}` : ''}! 👋
          </h2>
          <p className="text-lg text-indigo-200 max-w-2xl mx-auto">
            Acesse todos os sistemas do Grupo MF Paris em um só lugar.
            Escolha o módulo que deseja utilizar.
          </p>
        </div>
      </div>

      {/* Grid de Sistemas por Categoria */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        {categorias.map(categoria => {
          const sistemasCategoria = sistemas.filter(s => s.categoria === categoria)
          return (
            <div key={categoria} className="mb-10">
              <h3 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider mb-4 px-2">
                {categoria}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {sistemasCategoria.map(sistema => (
                  <button
                    key={sistema.id}
                    onClick={() => handleClick(sistema)}
                    className={`group relative bg-gradient-to-br ${sistema.cor} rounded-2xl p-6 text-left text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 overflow-hidden`}
                  >
                    {sistema.status === 'em_breve' && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 bg-white/20 backdrop-blur text-[10px] font-bold rounded-full uppercase tracking-wide">
                        Em Breve
                      </span>
                    )}
                    {sistema.status === 'disponivel' && (
                      <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-green-400/30 backdrop-blur text-[10px] font-bold rounded-full uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 bg-green-300 rounded-full animate-pulse"></span>
                        Ativo
                      </span>
                    )}
                    <div className="text-5xl mb-4">{sistema.icone}</div>
                    <h4 className="text-lg font-bold mb-2">{sistema.nome}</h4>
                    <p className="text-sm opacity-90 leading-relaxed">{sistema.descricao}</p>
                    <div className="mt-4 flex items-center text-sm font-medium opacity-80 group-hover:opacity-100">
                      Acessar
                      <span className="ml-1 group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center">
        <p className="text-xs text-indigo-300">
          © 2026 Grupo MF Paris — Portal Empresarial Unificado
        </p>
      </footer>
    </div>
  )
}
