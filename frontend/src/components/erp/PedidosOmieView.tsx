import React, { useEffect, useState } from 'react'
import {
  EmpresaOmie, PedidoOmie, ListarPedidosFiltro,
  fetchEmpresasOmie, listarPedidosOmie, atualizarRastreioOmie, lancarRastreioPorNF,
  formatMoney
} from '../../lib/omieMulti'

export default function PedidosOmieView() {
  const [empresas, setEmpresas] = useState<EmpresaOmie[]>([])
  const [empresaId, setEmpresaId] = useState<string>('')
  const [pedidos, setPedidos] = useState<PedidoOmie[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [filtroNF, setFiltroNF] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroDataDe, setFiltroDataDe] = useState('')
  const [filtroDataAte, setFiltroDataAte] = useState('')
  const [pagina, setPagina] = useState(1)
  const [registrosPorPagina] = useState(50)

  const [showRastreioModal, setShowRastreioModal] = useState<{
    pedido: PedidoOmie
  } | null>(null)
  const [showLancarPorNFModal, setShowLancarPorNFModal] = useState(false)

  useEffect(() => {
    fetchEmpresasOmie()
      .then(emps => {
        setEmpresas(emps)
        if (emps[0]) setEmpresaId(emps[0].id)
      })
      .catch(err => setError(err.message))
  }, [])

  const carregar = async () => {
    if (!empresaId) return
    setLoading(true)
    setError(null)
    try {
      const filtro: ListarPedidosFiltro = {
        pagina,
        registros_por_pagina: registrosPorPagina,
      }
      if (filtroNF.trim()) filtro.filtrar_por_numero_of = filtroNF.trim()
      if (filtroEtapa.trim()) filtro.filtrar_por_etapa = filtroEtapa.trim()
      if (filtroDataDe) filtro.filtrar_por_data_de = formatToOmieDate(filtroDataDe)
      if (filtroDataAte) filtro.filtrar_por_data_ate = formatToOmieDate(filtroDataAte)

      const data = await listarPedidosOmie(empresaId, filtro)
      setPedidos(data)
    } catch (err: any) {
      setError(err.message)
      setPedidos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (empresaId) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, pagina])

  const onLimparFiltros = () => {
    setFiltroNF(''); setFiltroEtapa(''); setFiltroDataDe(''); setFiltroDataAte('')
    setPagina(1)
    setTimeout(carregar, 0)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pedidos & NFe (Omie)</h2>
          <p className="text-sm text-gray-500 mt-1">Listagem direta do Omie + lançamento de código de rastreio</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLancarPorNFModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm"
          >
            🚀 Lançar Rastreio por NF
          </button>
          <button
            onClick={carregar}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-sm"
            disabled={loading}
          >
            {loading ? 'Carregando…' : '🔄 Atualizar'}
          </button>
        </div>
      </div>

      {/* Seletor de empresa + filtros */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
            <select
              value={empresaId}
              onChange={e => { setEmpresaId(e.target.value); setPagina(1) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {empresas.map(e => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº NF</label>
            <input
              type="text"
              value={filtroNF}
              onChange={e => setFiltroNF(e.target.value)}
              placeholder="Ex: 12345"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Etapa</label>
            <input
              type="text"
              value={filtroEtapa}
              onChange={e => setFiltroEtapa(e.target.value)}
              placeholder="10, 20, 50, 60..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Data de</label>
            <input
              type="date"
              value={filtroDataDe}
              onChange={e => setFiltroDataDe(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Data até</label>
            <input
              type="date"
              value={filtroDataAte}
              onChange={e => setFiltroDataAte(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => { setPagina(1); carregar() }} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
            Aplicar
          </button>
          <button onClick={onLimparFiltros} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">
            Limpar
          </button>
          <span className="ml-auto text-xs text-gray-500 self-center">
            Etapas comuns: 10=Em proposta · 20=A faturar · 50=Faturado · 60=Encerrado
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
          ❌ {error}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <Th>Pedido</Th>
                <Th>NF</Th>
                <Th>Cliente</Th>
                <Th>Vendedor</Th>
                <Th>Etapa</Th>
                <Th>Operação</Th>
                <Th>Valor</Th>
                <Th>Peso</Th>
                <Th>Modal. Frete</Th>
                <Th>Transportadora</Th>
                <Th>Cód. Rastreio</Th>
                <Th>Inclusão</Th>
                <Th>Previsão</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr><td colSpan={14} className="text-center py-8 text-gray-500">Carregando pedidos do Omie…</td></tr>
              )}
              {!loading && pedidos.length === 0 && (
                <tr><td colSpan={14} className="text-center py-8 text-gray-500">Nenhum pedido encontrado</td></tr>
              )}
              {pedidos.map((p, idx) => {
                const cab = p.cabecalho || {}
                const tot = p.total_pedido || {}
                const frete = p.frete || {}
                const info = p.informacoes_adicionais || {}
                const cad = p.infoCadastro || {}
                const det = p.det && p.det[0]?.produto
                return (
                  <tr key={`${cab.numero_pedido}-${idx}`} className="hover:bg-gray-50">
                    <Td className="font-mono">{cab.numero_pedido || '—'}</Td>
                    <Td className="font-mono">{(cab as any).nf || (info as any).numero_pedido_cliente || '—'}</Td>
                    <Td className="text-xs">Cód {cab.codigo_cliente || '—'}</Td>
                    <Td className="text-xs">{info.nome_vendedor || cab && (info.codigo_vendedor || '—')}</Td>
                    <Td><Etapa codigo={cab.etapa} /></Td>
                    <Td className="text-xs">{info.operacao || '—'}</Td>
                    <Td className="font-medium">{formatMoney(tot.valor_total_pedido)}</Td>
                    <Td className="text-xs">{frete.peso_bruto ? `${frete.peso_bruto} kg` : '—'}</Td>
                    <Td className="text-xs">{frete.modalidade || '—'}</Td>
                    <Td className="text-xs truncate max-w-[140px]" title={frete.nome_transportadora || ''}>{frete.nome_transportadora || '—'}</Td>
                    <Td className="font-mono text-xs">{frete.codigo_rastreio || '—'}</Td>
                    <Td className="text-xs">{cad.dInc || '—'}</Td>
                    <Td className="text-xs">{cab.data_previsao || '—'}</Td>
                    <Td>
                      <button
                        onClick={() => setShowRastreioModal({ pedido: p })}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-medium"
                      >
                        Lançar rastreio
                      </button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-between p-3 border-t bg-gray-50">
          <span className="text-xs text-gray-500">{pedidos.length} pedido(s) na página {pagina}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPagina(p => Math.max(1, p - 1))}
              disabled={pagina === 1 || loading}
              className="px-3 py-1 text-sm bg-white hover:bg-gray-100 rounded border border-gray-300 disabled:opacity-50"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPagina(p => p + 1)}
              disabled={pedidos.length < registrosPorPagina || loading}
              className="px-3 py-1 text-sm bg-white hover:bg-gray-100 rounded border border-gray-300 disabled:opacity-50"
            >
              Próxima →
            </button>
          </div>
        </div>
      </div>

      {showRastreioModal && (
        <RastreioModal
          empresaId={empresaId}
          pedido={showRastreioModal.pedido}
          onClose={() => setShowRastreioModal(null)}
          onSaved={() => { setShowRastreioModal(null); carregar() }}
        />
      )}

      {showLancarPorNFModal && (
        <LancarPorNFModal
          empresas={empresas}
          empresaIdInicial={empresaId}
          onClose={() => setShowLancarPorNFModal(false)}
          onSaved={() => { setShowLancarPorNFModal(false); carregar() }}
        />
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{children}</th>
}
function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td title={title} className={`px-3 py-2 text-gray-900 whitespace-nowrap ${className}`}>{children}</td>
}

const ETAPAS: Record<string, { label: string; cor: string }> = {
  '10': { label: 'Em proposta',  cor: 'bg-gray-100 text-gray-700' },
  '20': { label: 'A faturar',    cor: 'bg-blue-100 text-blue-700' },
  '50': { label: 'Faturado',     cor: 'bg-green-100 text-green-700' },
  '60': { label: 'Encerrado',    cor: 'bg-purple-100 text-purple-700' },
  '70': { label: 'Cancelado',    cor: 'bg-red-100 text-red-700' },
  '80': { label: 'Pré-venda',    cor: 'bg-yellow-100 text-yellow-700' },
}
function Etapa({ codigo }: { codigo?: string }) {
  if (!codigo) return <span className="text-xs text-gray-400">—</span>
  const info = ETAPAS[codigo] || { label: codigo, cor: 'bg-gray-100 text-gray-700' }
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${info.cor}`}>{info.label}</span>
}

function RastreioModal({ empresaId, pedido, onClose, onSaved }: {
  empresaId: string
  pedido: PedidoOmie
  onClose: () => void
  onSaved: () => void
}) {
  const numeroPedido = pedido.cabecalho?.numero_pedido || 0
  const [codigo, setCodigo] = useState(pedido.frete?.codigo_rastreio || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigo.trim()) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await atualizarRastreioOmie(empresaId, numeroPedido, codigo.trim())
      setSuccess(`✅ Atualizado via ${res.metodo}`)
      setTimeout(onSaved, 800)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h3 className="text-lg font-bold">Lançar Código de Rastreio</h3>
          <p className="text-xs text-gray-500 mt-1">Pedido #{numeroPedido} · Será atualizado direto no Omie</p>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código de Rastreio</label>
            <input
              type="text"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              autoFocus
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: BR123456789BR"
            />
          </div>
          {error && <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded p-2">❌ {error}</div>}
          {success && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-2">{success}</div>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Enviando…' : 'Enviar ao Omie'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LancarPorNFModal({ empresas, empresaIdInicial, onClose, onSaved }: {
  empresas: EmpresaOmie[]
  empresaIdInicial: string
  onClose: () => void
  onSaved: () => void
}) {
  const [empresaId, setEmpresaId] = useState(empresaIdInicial)
  const [nf, setNf] = useState('')
  const [codigo, setCodigo] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empresaId || !nf.trim() || !codigo.trim()) return
    setSaving(true); setError(null); setResult(null)
    try {
      const res = await lancarRastreioPorNF(empresaId, nf.trim(), codigo.trim())
      setResult(`✅ Pedido #${res.numero_pedido} atualizado via ${res.metodo}`)
      setTimeout(onSaved, 1200)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h3 className="text-lg font-bold">🚀 Lançar Rastreio por NF</h3>
          <p className="text-xs text-gray-500 mt-1">Replica o fluxo do Apps Script: busca pedido pela NF e atualiza o código de rastreio.</p>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <select
              value={empresaId}
              onChange={e => setEmpresaId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nº Nota Fiscal</label>
            <input
              type="text"
              value={nf}
              onChange={e => setNf(e.target.value)}
              autoFocus
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Ex: 12345"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código de Rastreio</label>
            <input
              type="text"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Ex: BR123456789BR"
            />
          </div>
          {error && <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded p-2">❌ {error}</div>}
          {result && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-2">{result}</div>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Enviando…' : 'Lançar no Omie'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatToOmieDate(isoDate: string): string {
  // input: yyyy-mm-dd → dd/mm/yyyy
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}/${m}/${y}`
}
