import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowPathIcon,
  TruckIcon,
  CurrencyDollarIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import type { Pedido, Cliente, Vendedor } from '../../types'
import {
  omieGetPedidosAcompanhamento,
  omieConsultarEntrega,
  omieGetFinanceiroResumo,
  omieSyncLogistics,
  omieBuscarPedido,
  type PedidoAcompanhamento,
  type EntregaOmieResult,
  type FinanceiroResumo,
} from '../../lib/omieApi'
import OmieIntegration from '../omie/OmieIntegration'

type OmieTab = 'pedidos' | 'financeiro' | 'logistica' | 'config'

interface OmieViewProps {
  pedidos: Pedido[]
  clientes: Cliente[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  enviado: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Enviado' },
  em_producao: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Em Produção' },
  faturado: { bg: 'bg-green-100', text: 'text-green-800', label: 'Faturado' },
  expedido: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Expedido' },
  entregue: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Entregue' },
  cancelado: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelado' },
  pendente: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Pendente' },
}

const LOGISTICA_STEPS = [
  { key: 'enviado', label: 'Aprovado', icon: '✅' },
  { key: 'em_producao', label: 'Em Produção', icon: '🏭' },
  { key: 'faturado', label: 'Faturado', icon: '📄' },
  { key: 'expedido', label: 'Expedido', icon: '📦' },
  { key: 'entregue', label: 'Entregue', icon: '✔️' },
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.pendente
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

function LogisticaTimeline({ status }: { status: string }) {
  const currentIdx = LOGISTICA_STEPS.findIndex(s => s.key === status)
  return (
    <div className="flex items-center gap-1">
      {LOGISTICA_STEPS.map((step, idx) => {
        const done = idx <= currentIdx
        const current = idx === currentIdx
        return (
          <React.Fragment key={step.key}>
            <div className={`flex flex-col items-center ${current ? 'scale-110' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${done ? 'bg-primary-600 border-primary-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-400'}`}>
                {done ? step.icon : idx + 1}
              </div>
              <span className={`text-[9px] mt-0.5 ${done ? 'text-primary-700 font-semibold' : 'text-gray-400'}`}>{step.label}</span>
            </div>
            {idx < LOGISTICA_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 min-w-[12px] ${idx < currentIdx ? 'bg-primary-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default function OmieView({ pedidos, clientes, vendedores, loggedUser }: OmieViewProps) {
  const [activeTab, setActiveTab] = useState<OmieTab>('pedidos')

  // Pedidos state
  const [acompanhamento, setAcompanhamento] = useState<PedidoAcompanhamento[]>([])
  const [pedidosLoading, setPedidosLoading] = useState(false)
  const [pedidosError, setPedidosError] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [entregaModal, setEntregaModal] = useState<{ pedidoId: number; data?: EntregaOmieResult; loading: boolean; error?: string } | null>(null)
  const [visibleCount, setVisibleCount] = useState(20)
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [buscaResults, setBuscaResults] = useState<PedidoAcompanhamento[] | null>(null)

  // Financeiro state
  const [financeiro, setFinanceiro] = useState<FinanceiroResumo | null>(null)
  const [finLoading, setFinLoading] = useState(false)
  const [finError, setFinError] = useState('')
  const [visibleReceber, setVisibleReceber] = useState(20)
  const [visiblePagar, setVisiblePagar] = useState(20)

  // Logistica state
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<string>('')

  const loadPedidos = useCallback(async () => {
    setPedidosLoading(true)
    setPedidosError('')
    setBuscaResults(null)
    try {
      const res = await omieGetPedidosAcompanhamento()
      if (res.success && res.data) setAcompanhamento(res.data)
      else setPedidosError(res.error || 'Erro ao carregar pedidos')
    } catch (err: any) {
      setPedidosError(err.message || 'Erro de conexão')
    } finally {
      setPedidosLoading(false)
    }
  }, [])

  const handleBuscarOmie = useCallback(async () => {
    if (!busca.trim()) return
    setBuscaLoading(true)
    setPedidosError('')
    try {
      const res = await omieBuscarPedido(busca.trim())
      if (res.success && res.data) {
        setBuscaResults(res.data)
      } else {
        setPedidosError(res.error || 'Erro na busca')
      }
    } catch (err: any) {
      setPedidosError(err.message || 'Erro de conexão')
    } finally {
      setBuscaLoading(false)
    }
  }, [busca])

  const loadFinanceiro = useCallback(async () => {
    setFinLoading(true)
    setFinError('')
    try {
      const res = await omieGetFinanceiroResumo()
      if (res.success && res.data) setFinanceiro(res.data)
      else setFinError(res.error || 'Erro ao carregar financeiro')
    } catch (err: any) {
      setFinError(err.message || 'Erro de conexão')
    } finally {
      setFinLoading(false)
    }
  }, [])

  const handleConsultarEntrega = useCallback(async (pedidoId: number) => {
    setEntregaModal({ pedidoId, loading: true })
    try {
      const res = await omieConsultarEntrega(pedidoId)
      if (res.success && res.data) {
        setEntregaModal({ pedidoId, data: res.data, loading: false })
      } else {
        setEntregaModal({ pedidoId, loading: false, error: res.error || 'Erro ao consultar' })
      }
    } catch (err: any) {
      setEntregaModal({ pedidoId, loading: false, error: err.message })
    }
  }, [])

  const handleSyncLogistics = useCallback(async () => {
    setSyncLoading(true)
    setSyncResult('')
    try {
      const res = await omieSyncLogistics()
      if (res.success && res.data) {
        setSyncResult(`Sync concluído: ${res.data.atualizados} atualizados, ${res.data.semPedido} sem pedido, ${res.data.erros.length} erros`)
      } else {
        setSyncResult(`Erro: ${res.error}`)
      }
    } catch (err: any) {
      setSyncResult(`Erro: ${err.message}`)
    } finally {
      setSyncLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'pedidos' && acompanhamento.length === 0) loadPedidos()
    if (activeTab === 'financeiro' && !financeiro) loadFinanceiro()
  }, [activeTab, acompanhamento.length, financeiro, loadPedidos, loadFinanceiro])

  // Se temos resultado de busca sob demanda, usar ele; senão filtrar localmente
  const displaySource = buscaResults ?? acompanhamento
  const filteredPedidos = displaySource.filter(p => {
    if (filtroStatus && p.statusOmie !== filtroStatus) return false
    if (busca && !buscaResults) {
      const q = busca.toLowerCase()
      return p.numero.toLowerCase().includes(q) ||
        p.clienteNome.toLowerCase().includes(q) ||
        p.nf.includes(q) ||
        p.codigoRastreio.toLowerCase().includes(q) ||
        p.omieCodigo.includes(q) ||
        String(p.pedidoId).includes(q)
    }
    return true
  })

  const visiblePedidos = filteredPedidos.slice(0, visibleCount)
  const hasMore = filteredPedidos.length > visibleCount

  // Logistica: pedidos in transit
  const pedidosLogistica = acompanhamento.filter(p => ['enviado', 'em_producao', 'faturado', 'expedido'].includes(p.statusOmie))

  const tabs: { id: OmieTab; icon: React.ElementType; label: string }[] = [
    { id: 'pedidos', icon: ClipboardDocumentListIcon, label: 'Acompanhamento' },
    { id: 'financeiro', icon: CurrencyDollarIcon, label: 'Financeiro' },
    { id: 'logistica', icon: TruckIcon, label: 'Logística' },
    { id: 'config', icon: Cog6ToothIcon, label: 'Configuração' },
  ]

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Omie ERP</h1>
            <p className="text-sm text-gray-500">Acompanhamento de pedidos, financeiro e logística</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-apple p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-apple transition-all ${activeTab === tab.id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ════════ TAB: PEDIDOS ════════ */}
        {activeTab === 'pedidos' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por número, cliente, NF, rastreio, código..."
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setVisibleCount(20); setBuscaResults(null) }}
                  onKeyDown={e => { if (e.key === 'Enter' && busca.trim()) handleBuscarOmie() }}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <FunnelIcon className="h-4 w-4 text-gray-400" />
                <select
                  value={filtroStatus}
                  onChange={e => { setFiltroStatus(e.target.value); setVisibleCount(20) }}
                  className="text-sm border border-gray-300 rounded-apple px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  <option value="">Todos os status</option>
                  {Object.entries(STATUS_BADGE).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleBuscarOmie}
                disabled={buscaLoading || !busca.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold rounded-apple transition-colors"
                title="Busca direto no Omie por número ou cliente"
              >
                <MagnifyingGlassIcon className={`h-4 w-4 ${buscaLoading ? 'animate-spin' : ''}`} />
                Buscar no Omie
              </button>
              {buscaResults && (
                <button
                  onClick={() => { setBuscaResults(null); setBusca('') }}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-apple hover:bg-gray-50 transition-colors"
                >
                  ✕ Limpar busca
                </button>
              )}
              <button
                onClick={loadPedidos}
                disabled={pedidosLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold rounded-apple transition-colors"
              >
                <ArrowPathIcon className={`h-4 w-4 ${pedidosLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Total Omie', value: acompanhamento.length, color: 'text-gray-900' },
                { label: 'Enviados', value: acompanhamento.filter(p => p.statusOmie === 'enviado').length, color: 'text-blue-600' },
                { label: 'Faturados', value: acompanhamento.filter(p => p.statusOmie === 'faturado').length, color: 'text-green-600' },
                { label: 'Expedidos', value: acompanhamento.filter(p => p.statusOmie === 'expedido').length, color: 'text-orange-600' },
                { label: 'Entregues', value: acompanhamento.filter(p => p.statusOmie === 'entregue').length, color: 'text-emerald-600' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white rounded-apple border border-gray-200 p-3 text-center">
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-xs text-gray-500">{kpi.label}</p>
                </div>
              ))}
            </div>

            {pedidosError && (
              <div className="bg-red-50 border border-red-200 rounded-apple p-3 text-sm text-red-700">{pedidosError}</div>
            )}

            {buscaResults && (
              <div className="bg-amber-50 border border-amber-200 rounded-apple p-3 text-sm text-amber-800 flex items-center justify-between">
                <span>Resultado da busca no Omie: <strong>{buscaResults.length}</strong> pedido(s) encontrado(s) para "{busca}"</span>
                <button onClick={() => { setBuscaResults(null); setBusca('') }} className="text-amber-600 hover:text-amber-800 font-medium underline text-xs">Voltar para lista completa</button>
              </div>
            )}

            {(pedidosLoading || buscaLoading) && acompanhamento.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ArrowPathIcon className="h-8 w-8 mx-auto animate-spin mb-2" />
                <p>{buscaLoading ? 'Buscando no Omie...' : 'Carregando pedidos do Omie...'}</p>
              </div>
            ) : filteredPedidos.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ClipboardDocumentListIcon className="h-8 w-8 mx-auto mb-2" />
                <p>Nenhum pedido encontrado no Omie</p>
                <p className="text-xs mt-1">Aprove pedidos na tela de Aprovação para enviá-los ao Omie</p>
              </div>
            ) : (
              <div className="bg-white rounded-apple border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Pedido</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Cliente</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Vendedor</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Valor</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-600">Status CRM</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-600">Status Omie</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">NF</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Rastreio</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-600">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visiblePedidos.map(p => (
                        <tr key={p.pedidoId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-900">{p.numero}</span>
                            <br />
                            <span className="text-xs text-gray-400">{new Date(p.dataCriacao).toLocaleDateString('pt-BR')}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{p.clienteNome}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{p.vendedorNome}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">
                            R$ {p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={p.statusCrm} /></td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={p.statusOmie} /></td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{p.nf || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs font-mono">{p.codigoRastreio || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleConsultarEntrega(p.pedidoId)}
                              className="px-2 py-1 text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-apple font-medium transition-colors"
                              title="Consultar entrega"
                            >
                              🔄 Detalhar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination footer */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Mostrando {visiblePedidos.length} de {filteredPedidos.length} pedidos
                    {acompanhamento.length !== filteredPedidos.length && ` (${acompanhamento.length} total)`}
                  </span>
                  {hasMore && (
                    <button
                      onClick={() => setVisibleCount(prev => prev + 30)}
                      className="px-4 py-1.5 text-sm bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-apple font-medium transition-colors"
                    >
                      Carregar mais ({filteredPedidos.length - visibleCount} restantes)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════ TAB: FINANCEIRO ════════ */}
        {activeTab === 'financeiro' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Resumo Financeiro Omie</h2>
              <button
                onClick={loadFinanceiro}
                disabled={finLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold rounded-apple transition-colors"
              >
                <ArrowPathIcon className={`h-4 w-4 ${finLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            {finError && (
              <div className="bg-red-50 border border-red-200 rounded-apple p-3 text-sm text-red-700">{finError}</div>
            )}

            {finLoading && !financeiro ? (
              <div className="text-center py-12 text-gray-400">
                <ArrowPathIcon className="h-8 w-8 mx-auto animate-spin mb-2" />
                <p>Carregando dados financeiros...</p>
              </div>
            ) : financeiro ? (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-white rounded-apple border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">Total a Receber</p>
                    <p className="text-xl font-bold text-green-600">R$ {financeiro.totalReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white rounded-apple border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">Total a Pagar</p>
                    <p className="text-xl font-bold text-red-600">R$ {financeiro.totalPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white rounded-apple border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">Saldo</p>
                    <p className={`text-xl font-bold ${financeiro.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      R$ {financeiro.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="bg-white rounded-apple border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">Títulos Vencidos</p>
                    <p className="text-xl font-bold text-amber-600">{financeiro.titulosVencidos}</p>
                  </div>
                  <div className="bg-white rounded-apple border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">Títulos a Vencer</p>
                    <p className="text-xl font-bold text-blue-600">{financeiro.titulosAVencer}</p>
                  </div>
                </div>

                {/* Contas a Receber */}
                <div className="bg-white rounded-apple border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-green-50 border-b border-green-200">
                    <h3 className="text-sm font-bold text-green-800">Contas a Receber ({financeiro.contasReceber.length})</h3>
                  </div>
                  {financeiro.contasReceber.length > 0 ? (
                    <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left px-4 py-2 text-gray-600 font-medium">Cliente</th>
                            <th className="text-right px-4 py-2 text-gray-600 font-medium">Valor</th>
                            <th className="text-center px-4 py-2 text-gray-600 font-medium">Vencimento</th>
                            <th className="text-center px-4 py-2 text-gray-600 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {financeiro.contasReceber.slice(0, visibleReceber).map((cr: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-700 truncate max-w-[200px]">{cr.nome_cliente || cr.codigo_cliente_fornecedor || '—'}</td>
                              <td className="px-4 py-2 text-right font-medium">R$ {Number(cr.valor_documento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="px-4 py-2 text-center text-xs">{cr.data_vencimento || '—'}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cr.status_titulo === 'LIQUIDADO' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                                  {cr.status_titulo || 'ABERTO'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {financeiro.contasReceber.length > visibleReceber && (
                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                        <span className="text-xs text-gray-500">Mostrando {visibleReceber} de {financeiro.contasReceber.length}</span>
                        <button onClick={() => setVisibleReceber(prev => prev + 30)} className="px-3 py-1 text-xs bg-green-50 text-green-700 hover:bg-green-100 rounded-apple font-medium">Carregar mais</button>
                      </div>
                    )}
                    </>
                  ) : (
                    <p className="p-4 text-sm text-gray-400">Nenhuma conta a receber encontrada</p>
                  )}
                </div>

                {/* Contas a Pagar */}
                <div className="bg-white rounded-apple border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                    <h3 className="text-sm font-bold text-red-800">Contas a Pagar ({financeiro.contasPagar.length})</h3>
                  </div>
                  {financeiro.contasPagar.length > 0 ? (
                    <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left px-4 py-2 text-gray-600 font-medium">Fornecedor</th>
                            <th className="text-right px-4 py-2 text-gray-600 font-medium">Valor</th>
                            <th className="text-center px-4 py-2 text-gray-600 font-medium">Vencimento</th>
                            <th className="text-center px-4 py-2 text-gray-600 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {financeiro.contasPagar.slice(0, visiblePagar).map((cp: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-700 truncate max-w-[200px]">{cp.nome_fornecedor || cp.codigo_cliente_fornecedor || '—'}</td>
                              <td className="px-4 py-2 text-right font-medium">R$ {Number(cp.valor_documento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="px-4 py-2 text-center text-xs">{cp.data_vencimento || '—'}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cp.status_titulo === 'LIQUIDADO' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                                  {cp.status_titulo || 'ABERTO'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {financeiro.contasPagar.length > visiblePagar && (
                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                        <span className="text-xs text-gray-500">Mostrando {visiblePagar} de {financeiro.contasPagar.length}</span>
                        <button onClick={() => setVisiblePagar(prev => prev + 30)} className="px-3 py-1 text-xs bg-red-50 text-red-700 hover:bg-red-100 rounded-apple font-medium">Carregar mais</button>
                      </div>
                    )}
                    </>
                  ) : (
                    <p className="p-4 text-sm text-gray-400">Nenhuma conta a pagar encontrada</p>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <CurrencyDollarIcon className="h-8 w-8 mx-auto mb-2" />
                <p>Clique em "Atualizar" para carregar os dados financeiros</p>
              </div>
            )}
          </div>
        )}

        {/* ════════ TAB: LOGÍSTICA ════════ */}
        {activeTab === 'logistica' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Logística & Entregas</h2>
                <p className="text-sm text-gray-500">{pedidosLogistica.length} pedido(s) em trânsito</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSyncLogistics}
                  disabled={syncLoading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold rounded-apple transition-colors"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${syncLoading ? 'animate-spin' : ''}`} />
                  Sync Logístico
                </button>
                <button
                  onClick={loadPedidos}
                  disabled={pedidosLoading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-apple transition-colors"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${pedidosLoading ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
              </div>
            </div>

            {syncResult && (
              <div className={`rounded-apple p-3 text-sm ${syncResult.startsWith('Erro') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                {syncResult}
              </div>
            )}

            {pedidosLoading && pedidosLogistica.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ArrowPathIcon className="h-8 w-8 mx-auto animate-spin mb-2" />
                <p>Carregando dados logísticos...</p>
              </div>
            ) : pedidosLogistica.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <TruckIcon className="h-8 w-8 mx-auto mb-2" />
                <p>Nenhum pedido em trânsito</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pedidosLogistica.map(p => (
                  <div key={p.pedidoId} className="bg-white rounded-apple border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{p.numero}</span>
                          <StatusBadge status={p.statusOmie} />
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5">{p.clienteNome}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>👤 {p.vendedorNome}</span>
                          <span>📅 {new Date(p.dataCriacao).toLocaleDateString('pt-BR')}</span>
                          {p.nf && <span>📄 NF: {p.nf}</span>}
                          {p.codigoRastreio && <span>📦 {p.codigoRastreio}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary-600">R$ {p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <button
                          onClick={() => handleConsultarEntrega(p.pedidoId)}
                          className="mt-1 px-2 py-1 text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-apple font-medium"
                        >
                          🔄 Consultar Entrega
                        </button>
                      </div>
                    </div>
                    <LogisticaTimeline status={p.statusOmie} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════ TAB: CONFIG ════════ */}
        {activeTab === 'config' && (
          <OmieIntegration botOnline={true} />
        )}
      </div>

      {/* ════════ MODAL: Detalhe Entrega ════════ */}
      {entregaModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEntregaModal(null)}>
          <div className="bg-white rounded-apple shadow-xl w-full max-w-md p-6 m-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Detalhes da Entrega</h3>

            {entregaModal.loading ? (
              <div className="text-center py-8">
                <ArrowPathIcon className="h-6 w-6 mx-auto animate-spin text-primary-600 mb-2" />
                <p className="text-sm text-gray-500">Consultando Omie...</p>
              </div>
            ) : entregaModal.error ? (
              <div className="bg-red-50 rounded-apple p-4 text-sm text-red-700">{entregaModal.error}</div>
            ) : entregaModal.data ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Etapa</p>
                    <p className="font-semibold text-gray-900">{entregaModal.data.statusDescricao || entregaModal.data.etapa || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Previsão de Entrega</p>
                    <p className="font-semibold text-gray-900">{entregaModal.data.dataPrevisao || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Nota Fiscal</p>
                    <p className="font-semibold text-gray-900">{entregaModal.data.nf || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Data Faturamento</p>
                    <p className="font-semibold text-gray-900">{entregaModal.data.dataFaturamento || '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">Código de Rastreio</p>
                    <p className="font-semibold text-gray-900 font-mono">{entregaModal.data.codigoRastreio || '—'}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <button
              onClick={() => setEntregaModal(null)}
              className="mt-4 w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-apple transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
