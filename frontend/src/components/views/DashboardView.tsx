import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import type { Cliente, Vendedor, Interacao, DashboardMetrics, Atividade, Produto, Tarefa } from '../../types'
import { stageLabels } from '../../utils/constants'

interface DashboardViewFullProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  metrics: DashboardMetrics
  atividades: Atividade[]
  produtos: Produto[]
  tarefas: Tarefa[]
  loggedUser: Vendedor | null
}

const DashboardView: React.FC<DashboardViewFullProps> = ({ clientes, metrics, vendedores, atividades, interacoes, produtos, tarefas, loggedUser }) => {
  const stages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda', 'perdido']
  const pipelineData = stages.map(s => ({
    name: stageLabels[s] || s,
    valor: clientes.filter(c => c.etapa === s).reduce((sum, c) => sum + (c.valorEstimado || 0), 0),
    qtd: clientes.filter(c => c.etapa === s).length
  }))
  const COLORS = ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899', '#EF4444']

  const vendedorData = vendedores.filter(v => v.ativo).map(v => ({
    name: v.nome.split(' ')[0],
    pipeline: clientes.filter(c => c.vendedorId === v.id).reduce((s, c) => s + (c.valorEstimado || 0), 0),
    leads: clientes.filter(c => c.vendedorId === v.id).length
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Visão geral das suas vendas e métricas em tempo real</p>
      </div>

      {/* Item 6: Painel Ações do Dia */}
      {(() => {
        const hoje = new Date().toISOString().split('T')[0]
        const isVendedor = loggedUser?.cargo === 'vendedor' || loggedUser?.cargo === 'sdr'
        const meusClientes = isVendedor ? clientes.filter(c => c.vendedorId === loggedUser?.id) : clientes
        const meusClienteIds = new Set(meusClientes.map(c => c.id))

        const acoes: { id: string; prioridade: number; icon: string; titulo: string; subtitulo: string; tipo: 'vencida' | 'hoje' | 'prazo' | 'proposta' }[] = []

        tarefas.filter(t => t.status === 'pendente' && t.data < hoje && (!isVendedor || (t.clienteId && meusClienteIds.has(t.clienteId)))).forEach(t => {
          const cl = clientes.find(c => c.id === t.clienteId)
          acoes.push({ id: `tv-${t.id}`, prioridade: 0, icon: '🔴', titulo: t.titulo, subtitulo: `Vencida em ${new Date(t.data).toLocaleDateString('pt-BR')}${cl ? ` • ${cl.razaoSocial}` : ''}`, tipo: 'vencida' })
        })
        tarefas.filter(t => t.status === 'pendente' && t.data === hoje && (!isVendedor || (t.clienteId && meusClienteIds.has(t.clienteId)))).forEach(t => {
          const cl = clientes.find(c => c.id === t.clienteId)
          acoes.push({ id: `th-${t.id}`, prioridade: 1, icon: '🟡', titulo: t.titulo, subtitulo: `Hoje${t.hora ? ` às ${t.hora}` : ''}${cl ? ` • ${cl.razaoSocial}` : ''}`, tipo: 'hoje' })
        })
        meusClientes.filter(c => c.etapa === 'amostra' && c.dataEntradaEtapa).forEach(c => {
          const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa!).getTime()) / 86400000)
          if (dias >= 25 && dias <= 30) acoes.push({ id: `pa-${c.id}`, prioridade: 2, icon: '⚠️', titulo: `Prazo amostra vencendo — ${c.razaoSocial}`, subtitulo: `${dias}/30 dias — ${30 - dias} dias restantes`, tipo: 'prazo' })
        })
        meusClientes.filter(c => c.etapa === 'homologado' && c.dataEntradaEtapa).forEach(c => {
          const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa!).getTime()) / 86400000)
          if (dias >= 60 && dias <= 75) acoes.push({ id: `ph-${c.id}`, prioridade: 2, icon: '⚠️', titulo: `Prazo homologação vencendo — ${c.razaoSocial}`, subtitulo: `${dias}/75 dias — ${75 - dias} dias restantes`, tipo: 'prazo' })
        })
        meusClientes.filter(c => c.etapa === 'negociacao' && c.dataProposta).forEach(c => {
          const dias = Math.floor((Date.now() - new Date(c.dataProposta!).getTime()) / 86400000)
          if (dias > 7) acoes.push({ id: `pr-${c.id}`, prioridade: 3, icon: '💰', titulo: `Proposta sem resposta — ${c.razaoSocial}`, subtitulo: `Enviada há ${dias} dias • R$ ${(c.valorProposta || c.valorEstimado || 0).toLocaleString('pt-BR')}`, tipo: 'proposta' })
        })

        acoes.sort((a, b) => a.prioridade - b.prioridade)
        const acoesVisiveis = acoes.slice(0, 8)

        if (acoesVisiveis.length === 0) return null
        return (
          <div className="bg-white rounded-apple shadow-apple-sm border-2 border-primary-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Ações do Dia</h3>
                  <p className="text-xs text-gray-500">{acoesVisiveis.length} ação{acoesVisiveis.length !== 1 ? 'ões' : ''} pendente{acoesVisiveis.length !== 1 ? 's' : ''}{isVendedor ? ' (seus clientes)' : ''}</p>
                </div>
              </div>
              {acoes.length > 8 && <span className="text-xs text-gray-400">+{acoes.length - 8} mais</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {acoesVisiveis.map(a => (
                <div key={a.id} className={`flex items-start gap-2.5 p-3 rounded-apple border ${a.tipo === 'vencida' ? 'border-red-200 bg-red-50' : a.tipo === 'hoje' ? 'border-yellow-200 bg-yellow-50' : a.tipo === 'prazo' ? 'border-orange-200 bg-orange-50' : 'border-purple-200 bg-purple-50'}`}>
                  <span className="text-sm flex-shrink-0 mt-0.5">{a.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.titulo}</p>
                    <p className="text-xs text-gray-600">{a.subtitulo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total Leads', value: metrics.totalLeads, icon: '📊', color: 'blue' },
          { label: 'Leads Ativos', value: metrics.leadsAtivos, icon: '✓', color: 'green' },
          { label: 'Conversão', value: `${metrics.taxaConversao.toFixed(1)}%`, icon: '📈', color: 'purple' },
          { label: 'Valor Total', value: `R$ ${metrics.valorTotal.toLocaleString('pt-BR')}`, icon: '💰', color: 'gray' },
          { label: 'Ticket Médio', value: `R$ ${metrics.ticketMedio.toLocaleString('pt-BR')}`, icon: '🎯', color: 'orange' },
          { label: 'Novos Hoje', value: metrics.leadsNovosHoje, icon: '🆕', color: 'blue' },
          { label: 'Interações', value: metrics.interacoesHoje, icon: '💬', color: 'indigo' },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500">{m.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Metas de Vendas */}
      {(() => {
        const vendedoresAtivos = vendedores.filter(v => v.ativo)
        const metaVendasMensal = vendedoresAtivos.reduce((s, v) => s + v.metaVendas, 0) || 500000
        const metaLeadsMensal = vendedoresAtivos.reduce((s, v) => s + v.metaLeads, 0) || 20
        const metaConversaoMensal = vendedoresAtivos.length > 0 ? Math.round(vendedoresAtivos.reduce((s, v) => s + v.metaConversao, 0) / vendedoresAtivos.length) : 15
        const metaTicketMedio = metaLeadsMensal > 0 ? Math.round(metaVendasMensal / metaLeadsMensal) : 80000

        const progressoVendas = Math.min((metrics.valorTotal / metaVendasMensal) * 100, 100)
        const progressoLeads = Math.min((metrics.totalLeads / metaLeadsMensal) * 100, 100)
        const progressoConversao = Math.min((metrics.taxaConversao / metaConversaoMensal) * 100, 100)
        const progressoTicket = Math.min((metrics.ticketMedio / metaTicketMedio) * 100, 100)

        const faltaVendas = Math.max(metaVendasMensal - metrics.valorTotal, 0)
        const diasRestantesMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()

        const getBarColor = (pct: number) => {
          if (pct >= 100) return 'bg-green-500'; if (pct >= 75) return 'bg-blue-500'; if (pct >= 50) return 'bg-yellow-500'; return 'bg-red-500'
        }
        const getStatusLabel = (pct: number) => {
          if (pct >= 100) return { text: '✅ Meta atingida!', color: 'text-green-700 bg-green-50 border-green-200' }
          if (pct >= 75) return { text: '🔥 Quase lá!', color: 'text-blue-700 bg-blue-50 border-blue-200' }
          if (pct >= 50) return { text: '⚡ No caminho', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
          return { text: '⚠️ Atenção', color: 'text-red-700 bg-red-50 border-red-200' }
        }
        const statusVendas = getStatusLabel(progressoVendas)

        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div><h3 className="text-lg font-semibold text-gray-900">🎯 Metas do Mês</h3><p className="text-sm text-gray-500 mt-1">{diasRestantesMes} dias restantes no mês</p></div>
              <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${statusVendas.color}`}>{statusVendas.text}</span>
            </div>
            <div className="mb-6 p-4 bg-gray-50 rounded-apple border border-gray-200">
              <div className="flex items-end justify-between mb-3">
                <div><p className="text-sm font-medium text-gray-600">Meta de Vendas Mensal</p><p className="text-3xl font-bold text-gray-900">R$ {metrics.valorTotal.toLocaleString('pt-BR')}</p></div>
                <div className="text-right"><p className="text-sm text-gray-500">de R$ {metaVendasMensal.toLocaleString('pt-BR')}</p><p className="text-2xl font-bold text-primary-600">{progressoVendas.toFixed(1)}%</p></div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden"><div className={`h-4 rounded-full transition-all duration-500 ${getBarColor(progressoVendas)}`} style={{ width: `${progressoVendas}%` }}></div></div>
              {faltaVendas > 0 && <p className="text-xs text-gray-500 mt-2">Faltam <span className="font-semibold text-gray-700">R$ {faltaVendas.toLocaleString('pt-BR')}</span> para bater a meta{diasRestantesMes > 0 && <> — média de <span className="font-semibold text-gray-700">R$ {Math.ceil(faltaVendas / diasRestantesMes).toLocaleString('pt-BR')}</span>/dia</>}</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-600">📋 Leads</p><p className="text-sm font-bold text-gray-900">{metrics.totalLeads}/{metaLeadsMensal}</p></div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden"><div className={`h-2.5 rounded-full transition-all duration-500 ${getBarColor(progressoLeads)}`} style={{ width: `${progressoLeads}%` }}></div></div>
                <p className="text-xs text-gray-500 mt-1">{progressoLeads.toFixed(0)}% da meta</p>
              </div>
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-600">🔄 Conversão</p><p className="text-sm font-bold text-gray-900">{metrics.taxaConversao.toFixed(1)}%/{metaConversaoMensal}%</p></div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden"><div className={`h-2.5 rounded-full transition-all duration-500 ${getBarColor(progressoConversao)}`} style={{ width: `${progressoConversao}%` }}></div></div>
                <p className="text-xs text-gray-500 mt-1">{progressoConversao.toFixed(0)}% da meta</p>
              </div>
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-600">💰 Ticket Médio</p><p className="text-sm font-bold text-gray-900">R$ {metrics.ticketMedio.toLocaleString('pt-BR')}</p></div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden"><div className={`h-2.5 rounded-full transition-all duration-500 ${getBarColor(progressoTicket)}`} style={{ width: `${progressoTicket}%` }}></div></div>
                <p className="text-xs text-gray-500 mt-1">{progressoTicket.toFixed(0)}% da meta (R$ {metaTicketMedio.toLocaleString('pt-BR')})</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Projeção de Receita Futura */}
      {(() => {
        const probEtapa: Record<string, number> = { 'prospecção': 0.10, 'amostra': 0.25, 'homologado': 0.50, 'negociacao': 0.75, 'pos_venda': 0.95 }
        const etapasAtivas = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda']
        const etapaLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda' }
        const projColors: Record<string, string> = { 'prospecção': '#93C5FD', 'amostra': '#FDE68A', 'homologado': '#86EFAC', 'negociacao': '#C4B5FD', 'pos_venda': '#FBCFE8' }

        const projecaoPorEtapa = etapasAtivas.map(etapa => {
          const clientesEtapa = clientes.filter(c => c.etapa === etapa)
          const valor = clientesEtapa.reduce((s, c) => s + (c.valorEstimado || 0), 0)
          const projetado = valor * (probEtapa[etapa] || 0)
          return { etapa, label: etapaLabels[etapa], valor, prob: (probEtapa[etapa] || 0) * 100, projetado, qtd: clientesEtapa.length }
        })

        const totalProjetado = projecaoPorEtapa.reduce((s, p) => s + p.projetado, 0)
        const totalPipeline = projecaoPorEtapa.reduce((s, p) => s + p.valor, 0)
        const chartData = projecaoPorEtapa.filter(p => p.valor > 0).map(p => ({ name: p.label, pipeline: p.valor, projetado: p.projetado }))

        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <div><h3 className="text-lg font-semibold text-gray-900">🔮 Projeção de Receita</h3><p className="text-sm text-gray-500">Baseada na probabilidade de conversão por etapa do funil</p></div>
              <div className="sm:text-right"><p className="text-sm text-gray-500">Receita projetada</p><p className="text-2xl font-bold text-green-600">R$ {totalProjetado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
              {projecaoPorEtapa.map(p => (
                <div key={p.etapa} className="p-3 rounded-apple border border-gray-200 text-center">
                  <p className="text-[10px] text-gray-500 font-medium">{p.label}</p>
                  <p className="text-xs font-bold text-gray-900 mt-0.5">{p.qtd} lead{p.qtd !== 1 ? 's' : ''}</p>
                  <p className="text-[10px] text-gray-400">{p.prob}% prob.</p>
                  <p className="text-xs font-bold mt-1" style={{ color: projColors[p.etapa] ? '#059669' : '#6B7280' }}>R$ {p.projetado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number, name: string) => [`R$ ${value.toLocaleString('pt-BR')}`, name === 'pipeline' ? 'Pipeline Total' : 'Projetado']} />
                <Bar dataKey="pipeline" fill="#E5E7EB" name="Pipeline Total" radius={[4, 4, 0, 0]} />
                <Bar dataKey="projetado" fill="#10B981" name="Projetado" radius={[4, 4, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-apple flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📈</span>
                <div><p className="text-sm font-medium text-green-800">Pipeline total: R$ {totalPipeline.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p><p className="text-xs text-green-600">Taxa de conversão ponderada: {totalPipeline > 0 ? ((totalProjetado / totalPipeline) * 100).toFixed(1) : 0}%</p></div>
              </div>
              <p className="text-lg font-bold text-green-700">→ R$ {totalProjetado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        )
      })()}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Pipeline por Etapa (R$)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={pipelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Valor']} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {pipelineData.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">👥 Pipeline por Vendedor (R$)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={vendedorData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={70} />
              <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Pipeline']} />
              <Bar dataKey="pipeline" fill="#6366F1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Produtos Ranking + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📦 Produtos Mais Procurados</h3>
          <div className="space-y-3">
            {(() => {
              const prodCount: Record<string, number> = {}
              clientes.forEach(c => (c.produtosInteresse || []).forEach(p => { prodCount[p] = (prodCount[p] || 0) + 1 }))
              const ranked = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
              const maxCount = ranked.length > 0 ? ranked[0][1] : 1
              if (ranked.length === 0) return <p className="text-sm text-gray-500">Nenhum produto vinculado a leads ainda</p>
              return ranked.map(([name, count], i) => {
                const prod = produtos.find(p => p.nome === name)
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-400 w-5">{i + 1}.</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1"><p className="text-sm font-medium text-gray-900">{name}</p><span className="text-xs text-gray-500">{count} leads</span></div>
                      <div className="w-full bg-gray-100 rounded-full h-2"><div className="h-2 rounded-full bg-primary-500 transition-all" style={{ width: `${(count / maxCount) * 100}%` }}></div></div>
                      {prod && <p className="text-xs text-gray-400 mt-0.5">R$ {prod.preco.toFixed(2).replace('.', ',')} / {prod.unidade}</p>}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200"><h3 className="text-lg font-semibold text-gray-900">⚡ Atividades Recentes</h3></div>
          <div className="divide-y divide-gray-100">
            {atividades.slice(0, 8).map((a) => (
              <div key={a.id} className="px-6 py-3 flex items-center gap-3 hover:bg-gray-50">
                <span className="text-lg flex-shrink-0">
                  {a.tipo === 'moveu' && '🔄'}{a.tipo === 'adicionou' && '➕'}{a.tipo === 'editou' && '✏️'}{a.tipo === 'interacao' && '💬'}{a.tipo === 'tarefa' && '✅'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{a.descricao}</p>
                  <p className="text-xs text-gray-500">{a.vendedorNome} — {new Date(a.timestamp).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</p>
                </div>
              </div>
            ))}
            {atividades.length === 0 && <div className="p-6 text-center text-gray-500 text-sm">Nenhuma atividade registrada</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardView
