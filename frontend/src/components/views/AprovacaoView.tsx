import React, { useMemo, useState } from 'react'
import { CheckCircleIcon, XCircleIcon, ClockIcon, ShoppingCartIcon } from '@heroicons/react/24/outline'
import type { Pedido, Cliente, Vendedor } from '../../types'

interface AprovacaoViewProps {
  pedidos: Pedido[]
  clientes: Cliente[]
  vendedores: Vendedor[]
  loggedUser: Vendedor
  onAprovar: (pedido: Pedido) => Promise<void>
  onRecusar: (pedido: Pedido, motivo: string) => Promise<void>
  showToast: (tipo: 'success' | 'error', texto: string) => void
}

const catLabel: Record<string, string> = {
  sacaria: 'Sacaria 25kg',
  okey_lac: 'Okey Lac 25kg',
  varejo_lacteo: 'Varejo Lácteo',
  cafe: 'Café',
  outros: 'Outros',
}

export default function AprovacaoView({
  pedidos, clientes, vendedores, loggedUser, onAprovar, onRecusar, showToast,
}: AprovacaoViewProps) {
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [recusandoId, setRecusandoId] = useState<number | null>(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [filtroVendedor, setFiltroVendedor] = useState<number | ''>('')
  const [historico, setHistorico] = useState(false)

  const vendedorMap = useMemo(() => {
    const m = new Map<number, Vendedor>()
    vendedores.forEach(v => m.set(v.id, v))
    return m
  }, [vendedores])

  const clienteMap = useMemo(() => {
    const m = new Map<number, Cliente>()
    clientes.forEach(c => m.set(c.id, c))
    return m
  }, [clientes])

  const pendentes = useMemo(() =>
    pedidos
      .filter(p =>
        p.status === 'enviado' &&
        (filtroVendedor === '' || p.vendedorId === filtroVendedor)
      )
      .sort((a, b) => new Date(a.dataCriacao).getTime() - new Date(b.dataCriacao).getTime())
  , [pedidos, filtroVendedor])

  const historicoList = useMemo(() =>
    pedidos
      .filter(p =>
        (p.status === 'confirmado' || p.status === 'cancelado') &&
        (filtroVendedor === '' || p.vendedorId === filtroVendedor)
      )
      .sort((a, b) => new Date(b.dataAprovacao || b.dataCriacao).getTime() - new Date(a.dataAprovacao || a.dataCriacao).getTime())
      .slice(0, 50)
  , [pedidos, filtroVendedor])

  // Metrics
  const { totalPendente, valorPendente, aprovadosMes, recusadosMes } = useMemo(() => {
    const agora = new Date()
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
    return {
      totalPendente: pendentes.length,
      valorPendente: pendentes.reduce((s, p) => s + p.totalValor, 0),
      aprovadosMes: pedidos.filter(p => p.status === 'confirmado' && p.dataAprovacao && new Date(p.dataAprovacao) >= inicioMes).length,
      recusadosMes: pedidos.filter(p => p.status === 'cancelado' && new Date(p.dataCriacao) >= inicioMes).length,
    }
  }, [pedidos, pendentes])

  const handleAprovar = async (pedido: Pedido) => {
    setLoadingId(pedido.id)
    try {
      await onAprovar(pedido)
      showToast('success', `Pedido ${pedido.numero} aprovado com sucesso!`)
    } catch {
      showToast('error', 'Erro ao aprovar pedido. Tente novamente.')
    } finally {
      setLoadingId(null)
    }
  }

  const handleRecusar = async (pedido: Pedido) => {
    if (!motivoRecusa.trim()) {
      showToast('error', 'Informe o motivo da recusa.')
      return
    }
    setLoadingId(pedido.id)
    try {
      await onRecusar(pedido, motivoRecusa.trim())
      showToast('success', `Pedido ${pedido.numero} recusado.`)
      setRecusandoId(null)
      setMotivoRecusa('')
    } catch {
      showToast('error', 'Erro ao recusar pedido. Tente novamente.')
    } finally {
      setLoadingId(null)
    }
  }

  const renderPedidoCard = (pedido: Pedido, showActions: boolean) => {
    const cliente = clienteMap.get(pedido.clienteId)
    const vendedor = vendedorMap.get(pedido.vendedorId)
    const isExpanded = expandedId === pedido.id
    const isLoading = loadingId === pedido.id
    const isRecusando = recusandoId === pedido.id
    const diasEspera = Math.floor((Date.now() - new Date(pedido.dataEnvio || pedido.dataCriacao).getTime()) / 86400000)

    return (
      <div key={pedido.id} className={`bg-white rounded-apple shadow-apple-sm border-2 transition-all ${showActions && diasEspera >= 2 ? 'border-amber-300' : showActions ? 'border-gray-200' : pedido.status === 'confirmado' ? 'border-green-200' : 'border-red-200'}`}>
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-gray-900">{pedido.numero}</span>
                {showActions && diasEspera >= 2 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-200 animate-pulse">
                    ⏰ Aguardando {diasEspera}d
                  </span>
                )}
                {!showActions && (
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${pedido.status === 'confirmado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                    {pedido.status === 'confirmado' ? '✅ Aprovado' : '❌ Recusado'}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                <p className="text-sm font-medium text-gray-800">{cliente?.razaoSocial || '—'}</p>
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                  {vendedor && <span>👤 {vendedor.nome}</span>}
                  <span>·</span>
                  <span>📅 {new Date(pedido.dataCriacao).toLocaleDateString('pt-BR')}</span>
                  {pedido.dataEnvio && <><span>·</span><span>📤 Enviado: {new Date(pedido.dataEnvio).toLocaleDateString('pt-BR')}</span></>}
                  {pedido.dataAprovacao && <><span>·</span><span>{pedido.status === 'confirmado' ? '✅' : '❌'} {new Date(pedido.dataAprovacao).toLocaleDateString('pt-BR')}</span></>}
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <p className="text-xl font-bold text-primary-600">R$ {pedido.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-gray-400">{pedido.itens.length} produto(s)</p>
            </div>
          </div>

          {/* Itens resumo */}
          <div className="border-t border-gray-100 pt-3 space-y-1">
            {(isExpanded ? pedido.itens : pedido.itens.slice(0, 3)).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 truncate mr-2">
                  <span className="font-semibold">{item.quantidade}×</span> {item.nomeProduto}
                  {item.sku && <span className="text-gray-400 text-xs ml-1">({item.sku})</span>}
                </span>
                <span className="text-gray-900 font-medium flex-shrink-0">R$ {(item.preco * item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            {!isExpanded && pedido.itens.length > 3 && (
              <button onClick={() => setExpandedId(pedido.id)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                + {pedido.itens.length - 3} produto(s) a mais...
              </button>
            )}
            {isExpanded && (
              <button onClick={() => setExpandedId(null)} className="text-xs text-gray-400 hover:text-gray-600 font-medium">
                Mostrar menos
              </button>
            )}
            {pedido.observacoes && (
              <p className="text-xs text-gray-500 italic mt-1 pt-1 border-t border-gray-100">
                📝 {pedido.observacoes}
              </p>
            )}
            {pedido.motivoRecusa && (
              <div className="mt-2 p-2 bg-red-50 rounded-apple border border-red-200">
                <p className="text-xs font-semibold text-red-700">Motivo da recusa:</p>
                <p className="text-xs text-red-600">{pedido.motivoRecusa}</p>
              </div>
            )}
          </div>

          {/* Info do cliente */}
          {showActions && cliente && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3 text-xs text-gray-500">
              {cliente.contatoTelefone && <span>📞 {cliente.contatoTelefone}</span>}
              {cliente.contatoEmail && <span>📧 {cliente.contatoEmail}</span>}
              <span className="capitalize">📍 Etapa: {cliente.etapa}</span>
            </div>
          )}

          {/* Action buttons */}
          {showActions && !isRecusando && (
            <div className="flex gap-3 mt-4 pt-3 border-t border-gray-100">
              <button
                onClick={() => handleAprovar(pedido)}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-apple transition-colors"
              >
                {isLoading ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <CheckCircleIcon className="h-4 w-4" />}
                Aprovar Pedido
              </button>
              <button
                onClick={() => { setRecusandoId(pedido.id); setMotivoRecusa('') }}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 border border-red-200 text-sm font-semibold rounded-apple transition-colors"
              >
                <XCircleIcon className="h-4 w-4" />
                Recusar
              </button>
            </div>
          )}

          {/* Formulário recusa */}
          {showActions && isRecusando && (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Motivo da recusa <span className="text-red-500">*</span>
              </label>
              <textarea
                value={motivoRecusa}
                onChange={e => setMotivoRecusa(e.target.value)}
                rows={2}
                placeholder="Ex: Preço fora da tabela, produto sem estoque, cliente em débito..."
                autoFocus
                className="w-full px-3 py-2 border border-red-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-red-400 text-sm resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleRecusar(pedido)}
                  disabled={isLoading || !motivoRecusa.trim()}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-apple transition-colors"
                >
                  {isLoading ? 'Recusando...' : '❌ Confirmar Recusa'}
                </button>
                <button
                  onClick={() => { setRecusandoId(null); setMotivoRecusa('') }}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-sm rounded-apple transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header com métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`bg-white rounded-apple shadow-apple-sm border-2 p-4 ${totalPendente > 0 ? 'border-amber-300' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <ClockIcon className="h-5 w-5 text-amber-500" />
            <p className="text-xs text-gray-500 font-semibold uppercase">Aguardando</p>
          </div>
          <p className={`text-2xl font-bold ${totalPendente > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{totalPendente}</p>
          <p className="text-xs text-gray-500 mt-0.5">R$ {valorPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            <p className="text-xs text-gray-500 font-semibold uppercase">Aprovados (mês)</p>
          </div>
          <p className="text-2xl font-bold text-green-600">{aprovadosMes}</p>
          <p className="text-xs text-gray-500 mt-0.5">este mês</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircleIcon className="h-5 w-5 text-red-400" />
            <p className="text-xs text-gray-500 font-semibold uppercase">Recusados (mês)</p>
          </div>
          <p className="text-2xl font-bold text-red-500">{recusadosMes}</p>
          <p className="text-xs text-gray-500 mt-0.5">este mês</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCartIcon className="h-5 w-5 text-primary-500" />
            <p className="text-xs text-gray-500 font-semibold uppercase">Total pedidos</p>
          </div>
          <p className="text-2xl font-bold text-primary-600">{pedidos.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">no sistema</p>
        </div>
      </div>

      {/* Filtros + tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setHistorico(false)}
            className={`px-4 py-2 rounded-apple text-sm font-medium transition-colors ${!historico ? 'bg-amber-500 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            ⏳ Aguardando Aprovação {totalPendente > 0 && <span className="ml-1.5 bg-white text-amber-600 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{totalPendente}</span>}
          </button>
          <button
            onClick={() => setHistorico(true)}
            className={`px-4 py-2 rounded-apple text-sm font-medium transition-colors ${historico ? 'bg-primary-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            📋 Histórico
          </button>
        </div>
        <select
          value={filtroVendedor}
          onChange={e => setFiltroVendedor(e.target.value ? Number(e.target.value) : '')}
          className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">👥 Todos os vendedores</option>
          {vendedores.filter(v => v.ativo && v.cargo !== 'gerente').map(v => (
            <option key={v.id} value={v.id}>{v.nome}</option>
          ))}
        </select>
      </div>

      {/* Lista pedidos pendentes */}
      {!historico && (
        <>
          {pendentes.length === 0 ? (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-16 text-center">
              <CheckCircleIcon className="h-16 w-16 text-green-300 mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-700">Nenhum pedido aguardando aprovação</p>
              <p className="text-sm text-gray-400 mt-1">Todos os pedidos foram processados ✅</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">{pendentes.length} pedido(s) aguardando sua aprovação</p>
              {pendentes.map(p => renderPedidoCard(p, true))}
            </div>
          )}
        </>
      )}

      {/* Histórico */}
      {historico && (
        <>
          {historicoList.length === 0 ? (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-16 text-center">
              <ShoppingCartIcon className="h-16 w-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Nenhum pedido processado ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">{historicoList.length} pedido(s) processados (últimos 50)</p>
              {historicoList.map(p => renderPedidoCard(p, false))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
