import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie } from 'recharts'
import WhatsAppIcon from '../icons/WhatsAppIcon'
import type { Cliente, Vendedor, Interacao, DashboardMetrics, Atividade, Produto, Tarefa, Pedido } from '../../types'
import { stageLabels } from '../../utils/constants'

// ── Types ──
type PeriodoTipo = 'hoje' | 'mes' | 'ano'
type TabKey = 'saude' | 'crescimento' | 'produtos' | 'mercado' | 'clientes' | 'funil' | 'equipe' | 'competitiva'

const TAB_LIST: { key: TabKey; label: string; icon: string }[] = [
  { key: 'saude', label: 'Saúde', icon: '💊' },
  { key: 'crescimento', label: 'Crescimento', icon: '📈' },
  { key: 'produtos', label: 'Produtos', icon: '📦' },
  { key: 'mercado', label: 'Mercado', icon: '🌍' },
  { key: 'clientes', label: 'Clientes', icon: '👥' },
  { key: 'funil', label: 'Funil', icon: '🔽' },
  { key: 'equipe', label: 'Equipe', icon: '🏆' },
  { key: 'competitiva', label: 'Competitiva', icon: '⚔️' },
]

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const COLORS = ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899', '#EF4444', '#F97316', '#14B8A6']

function buildMonthOptions(): { label: string; month: number; year: number }[] {
  const now = new Date()
  const opts: { label: string; month: number; year: number }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({ label: `${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`, month: d.getMonth(), year: d.getFullYear() })
  }
  return opts
}

function getDateRange(tipo: PeriodoTipo, selMonth: number, selYear: number): { start: Date; end: Date } {
  const now = new Date()
  if (tipo === 'hoje') {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    return { start: s, end: e }
  }
  if (tipo === 'mes') {
    const s = new Date(selYear, selMonth, 1, 0, 0, 0)
    const e = new Date(selYear, selMonth + 1, 0, 23, 59, 59)
    return { start: s, end: e }
  }
  // ano
  const s = new Date(now.getFullYear(), 0, 1, 0, 0, 0)
  const e = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
  return { start: s, end: e }
}

const fmt = (v: number) => v > 0 ? `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'R$ 0'
const fmtK = (v: number) => `${(v / 1000).toFixed(0)}k`
const medals = ['🥇', '🥈', '🥉']

// ── KPI Card ──
const KPI: React.FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
  <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 transition-all duration-300">
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
)

// ── Ranking Row ──
const RankRow: React.FC<{ i: number; nome: string; value: string; pct: number; barColor: string; sub?: string }> = ({ i, nome, value, pct, barColor, sub }) => (
  <div className="flex items-center gap-3">
    <span className="text-lg w-8 text-center flex-shrink-0 font-bold">{medals[i] || `${i + 1}.`}</span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-900 truncate">{nome}</span>
        <span className="text-sm font-bold flex-shrink-0 ml-2" style={{ color: barColor }}>{value}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div className="h-2.5 rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: barColor }} />
      </div>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
)

// ── Props ──
interface DashboardViewFullProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  metrics: DashboardMetrics
  atividades: Atividade[]
  produtos: Produto[]
  tarefas: Tarefa[]
  loggedUser: Vendedor | null
  pedidos?: Pedido[]
  onRefresh?: () => void
}

const DashboardView: React.FC<DashboardViewFullProps> = ({ clientes, vendedores, interacoes, produtos, tarefas, loggedUser, pedidos = [], atividades, onRefresh }) => {
  const now = new Date()
  const monthOpts = useMemo(() => buildMonthOptions(), [])
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>('mes')
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [activeTab, setActiveTab] = useState<TabKey>('equipe')
  const [tvMode, setTvMode] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(Date.now())
  const [secondsAgo, setSecondsAgo] = useState(0)
  const tvIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Live update ticker
  useEffect(() => {
    const t = setInterval(() => setSecondsAgo(Math.floor((Date.now() - lastUpdate) / 1000)), 1000)
    return () => clearInterval(t)
  }, [lastUpdate])

  // Mark data as updated when props change
  useEffect(() => { setLastUpdate(Date.now()) }, [clientes, interacoes, pedidos])

  // Polling de segurança — re-fetch every 60s
  useEffect(() => {
    if (!onRefresh) return
    const t = setInterval(() => onRefresh(), 60000)
    return () => clearInterval(t)
  }, [onRefresh])

  // TV Mode auto-rotation
  const advanceTab = useCallback(() => {
    setActiveTab(prev => {
      const idx = TAB_LIST.findIndex(t => t.key === prev)
      return TAB_LIST[(idx + 1) % TAB_LIST.length].key
    })
  }, [])

  useEffect(() => {
    if (tvMode) {
      tvIntervalRef.current = setInterval(advanceTab, 15000)
      try { containerRef.current?.requestFullscreen?.() } catch { /* ignore */ }
    } else {
      if (tvIntervalRef.current) clearInterval(tvIntervalRef.current)
      if (document.fullscreenElement) try { document.exitFullscreen?.() } catch { /* ignore */ }
    }
    return () => { if (tvIntervalRef.current) clearInterval(tvIntervalRef.current) }
  }, [tvMode, advanceTab])

  // ── Date range filtering ──
  const range = useMemo(() => getDateRange(periodoTipo, selMonth, selYear), [periodoTipo, selMonth, selYear])

  const inRange = useCallback((dateStr?: string | null) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d >= range.start && d <= range.end
  }, [range])

  const fc = useMemo(() => clientes.filter(c => inRange(c.dataEntradaEtapa) || inRange(c.ultimaInteracao)), [clientes, inRange])
  const fi = useMemo(() => interacoes.filter(i => inRange(i.data)), [interacoes, inRange])
  const fp = useMemo(() => pedidos.filter(p => inRange(p.dataCriacao)), [pedidos, inRange])
  const fpConfirmed = useMemo(() => fp.filter(p => p.status === 'confirmado'), [fp])

  // ── Global computed data ──
  const computed = useMemo(() => {
    const receita = fpConfirmed.reduce((s, p) => s + p.totalValor, 0)
    const ticketMedioPedido = fpConfirmed.length > 0 ? receita / fpConfirmed.length : 0
    const clientesAtivos = fc.filter(c => c.etapa !== 'perdido')
    const ticketMedioCliente = clientesAtivos.length > 0 ? receita / clientesAtivos.length : 0
    const margemMedia = (() => {
      let totalM = 0; let count = 0
      fpConfirmed.forEach(p => p.itens.forEach(it => {
        const prod = produtos.find(pr => pr.id === it.produtoId)
        if (prod?.margemLucro) { totalM += prod.margemLucro; count++ }
      }))
      return count > 0 ? totalM / count : 0
    })()
    const novosClientes = fc.filter(c => inRange(c.dataEntradaEtapa)).length
    const perdidos = fc.filter(c => c.etapa === 'perdido')
    const valorPipeline = fc.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const taxaConversao = fc.length > 0 ? (fc.filter(c => c.etapa === 'follow_up').length / fc.length) * 100 : 0

    // Interações por vendedor e tipo
    const vendInteracoes = new Map<number, Map<string, number>>()
    fi.forEach(i => {
      const clt = clientes.find(c => c.id === i.clienteId)
      const vid = clt?.vendedorId
      if (!vid) return
      if (!vendInteracoes.has(vid)) vendInteracoes.set(vid, new Map())
      const m = vendInteracoes.get(vid)!
      m.set(i.tipo, (m.get(i.tipo) || 0) + 1)
    })

    // Faturamento por vendedor
    const vendFaturamento = new Map<number, number>()
    fpConfirmed.forEach(p => {
      vendFaturamento.set(p.vendedorId, (vendFaturamento.get(p.vendedorId) || 0) + p.totalValor)
    })

    return { receita, ticketMedioPedido, ticketMedioCliente, margemMedia, novosClientes, perdidos, valorPipeline, taxaConversao, vendInteracoes, vendFaturamento }
  }, [fc, fi, fp, fpConfirmed, clientes, produtos, inRange])

  const activeVendedores = useMemo(() => vendedores.filter(v => v.ativo), [vendedores])

  // ── Period label ──
  const periodoLabel = periodoTipo === 'hoje' ? 'Hoje' : periodoTipo === 'ano' ? `Ano ${now.getFullYear()}` : `${MONTHS_PT[selMonth]} ${selYear}`

  // ──────────────────────────────────────────
  // RENDER TABS
  // ──────────────────────────────────────────

  const renderSaude = () => {
    // Monthly revenue chart (last 12 months)
    const monthlyRev = monthOpts.slice().reverse().map(m => {
      const r = getDateRange('mes', m.month, m.year)
      const rev = pedidos.filter(p => p.status === 'confirmado' && new Date(p.dataCriacao) >= r.start && new Date(p.dataCriacao) <= r.end)
        .reduce((s, p) => s + p.totalValor, 0)
      return { mes: `${MONTHS_PT[m.month]}/${String(m.year).slice(2)}`, receita: rev }
    })
    // Top 10 clients by revenue
    const clientRev = new Map<number, { nome: string; valor: number }>()
    fpConfirmed.forEach(p => {
      const c = clientes.find(cl => cl.id === p.clienteId)
      if (!c) return
      const prev = clientRev.get(c.id) || { nome: c.razaoSocial, valor: 0 }
      prev.valor += p.totalValor
      clientRev.set(c.id, prev)
    })
    const topClientes = Array.from(clientRev.values()).sort((a, b) => b.valor - a.valor).slice(0, 10)

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI label="Receita Período" value={fmt(computed.receita)} color="text-green-700" />
          <KPI label="Pedidos Confirmados" value={fpConfirmed.length} />
          <KPI label="Ticket Médio Pedido" value={fmt(computed.ticketMedioPedido)} />
          <KPI label="Ticket Médio Cliente" value={fmt(computed.ticketMedioCliente)} />
          <KPI label="Margem Média" value={`${computed.margemMedia.toFixed(1)}%`} color={computed.margemMedia >= 20 ? 'text-green-700' : 'text-red-600'} />
          <KPI label="Pipeline Total" value={fmt(computed.valorPipeline)} color="text-blue-700" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📈 Receita Mensal (12 meses)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyRev}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="mes" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} /><Tooltip formatter={(v: number) => [fmt(v), 'Receita']} /><Line type="monotone" dataKey="receita" stroke="#22C55E" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🏆 Top 10 Clientes (Receita)</h3>
            {topClientes.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem pedidos confirmados no período</p> : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topClientes.map(c => ({ name: c.nome.length > 20 ? c.nome.slice(0, 20) + '…' : c.nome, valor: c.valor }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={130} /><Tooltip formatter={(v: number) => [fmt(v), 'Receita']} /><Bar dataKey="valor" fill="#3B82F6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderCrescimento = () => {
    // Growth: compare current period to previous
    const prevRange = periodoTipo === 'mes'
      ? getDateRange('mes', selMonth === 0 ? 11 : selMonth - 1, selMonth === 0 ? selYear - 1 : selYear)
      : periodoTipo === 'ano'
        ? { start: new Date(selYear - 1, 0, 1), end: new Date(selYear - 1, 11, 31, 23, 59, 59) }
        : { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59) }
    const prevRev = pedidos.filter(p => p.status === 'confirmado' && new Date(p.dataCriacao) >= prevRange.start && new Date(p.dataCriacao) <= prevRange.end).reduce((s, p) => s + p.totalValor, 0)
    const growthPct = prevRev > 0 ? ((computed.receita - prevRev) / prevRev) * 100 : 0
    const prevClientes = clientes.filter(c => { const d = c.dataEntradaEtapa; return d ? new Date(d) >= prevRange.start && new Date(d) <= prevRange.end : false }).length
    const growthClientes = prevClientes > 0 ? ((computed.novosClientes - prevClientes) / prevClientes) * 100 : 0

    // Growth by vendor
    const vendGrowth = activeVendedores.map(v => {
      const curRev = computed.vendFaturamento.get(v.id) || 0
      const prevVRev = pedidos.filter(p => p.status === 'confirmado' && p.vendedorId === v.id && new Date(p.dataCriacao) >= prevRange.start && new Date(p.dataCriacao) <= prevRange.end).reduce((s, p) => s + p.totalValor, 0)
      return { name: v.nome.split(' ')[0], atual: curRev, anterior: prevVRev }
    }).filter(v => v.atual > 0 || v.anterior > 0)

    // New clients by month
    const newByMonth = monthOpts.slice().reverse().map(m => {
      const r = getDateRange('mes', m.month, m.year)
      return { mes: MONTHS_PT[m.month], novos: clientes.filter(c => c.dataEntradaEtapa && new Date(c.dataEntradaEtapa) >= r.start && new Date(c.dataEntradaEtapa) <= r.end).length }
    })

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Crescimento Faturamento" value={`${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%`} color={growthPct >= 0 ? 'text-green-700' : 'text-red-600'} sub={`vs período anterior (${fmt(prevRev)})`} />
          <KPI label="Receita Atual" value={fmt(computed.receita)} color="text-green-700" />
          <KPI label="Novos Clientes" value={computed.novosClientes} sub={`${growthClientes >= 0 ? '+' : ''}${growthClientes.toFixed(0)}% vs anterior`} />
          <KPI label="Base Ativa" value={fc.filter(c => c.etapa !== 'perdido').length} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Faturamento por Vendedor (Atual vs Anterior)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={vendGrowth}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} /><Tooltip formatter={(v: number) => [fmt(v)]} /><Bar dataKey="atual" fill="#22C55E" name="Atual" radius={[4, 4, 0, 0]} /><Bar dataKey="anterior" fill="#D1D5DB" name="Anterior" radius={[4, 4, 0, 0]} /><Legend /></BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">👤 Novos Clientes por Mês</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={newByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip /><Bar dataKey="novos" fill="#3B82F6" name="Novos" radius={[6, 6, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    )
  }

  const renderProdutos = () => {
    // Product volume and revenue from confirmed orders
    const prodMap = new Map<string, { nome: string; qtd: number; receita: number; margem: number }>()
    fpConfirmed.forEach(p => p.itens.forEach(it => {
      const prev = prodMap.get(it.nomeProduto) || { nome: it.nomeProduto, qtd: 0, receita: 0, margem: 0 }
      prev.qtd += it.quantidade
      prev.receita += it.preco * it.quantidade
      const prod = produtos.find(pr => pr.id === it.produtoId)
      if (prod?.margemLucro) prev.margem = prod.margemLucro
      prodMap.set(it.nomeProduto, prev)
    }))
    const prodArr = Array.from(prodMap.values()).sort((a, b) => b.receita - a.receita)
    const totalReceita = prodArr.reduce((s, p) => s + p.receita, 0)
    const pieData = prodArr.slice(0, 8).map((p, i) => ({ name: p.nome.length > 15 ? p.nome.slice(0, 15) + '…' : p.nome, value: p.receita, fill: COLORS[i % COLORS.length] }))
    const mixPedido = fpConfirmed.length > 0 ? (fpConfirmed.reduce((s, p) => s + new Set(p.itens.map(i => i.nomeProduto)).size, 0) / fpConfirmed.length).toFixed(1) : '0'

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Produtos Vendidos" value={prodArr.length} />
          <KPI label="Receita Produtos" value={fmt(totalReceita)} color="text-green-700" />
          <KPI label="Mix Médio/Pedido" value={mixPedido} sub="produtos distintos" />
          <KPI label="Maior Receita" value={prodArr[0]?.nome || '—'} sub={prodArr[0] ? fmt(prodArr[0].receita) : ''} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Receita por Produto</h3>
            {prodArr.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={prodArr.slice(0, 10).map(p => ({ name: p.nome.length > 18 ? p.nome.slice(0, 18) + '…' : p.nome, receita: p.receita }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={130} /><Tooltip formatter={(v: number) => [fmt(v), 'Receita']} /><Bar dataKey="receita" fill="#F59E0B" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🥧 Participação no Faturamento</h3>
            {pieData.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip formatter={(v: number) => [fmt(v), 'Receita']} /></PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderMercado = () => {
    // Sales by state and city
    const stateMap = new Map<string, { qtd: number; receita: number }>()
    const cityMap = new Map<string, { qtd: number; receita: number }>()
    fpConfirmed.forEach(p => {
      const c = clientes.find(cl => cl.id === p.clienteId)
      if (!c) return
      const st = c.enderecoEstado || 'N/D'
      const ct = c.enderecoCidade || 'N/D'
      const prev = stateMap.get(st) || { qtd: 0, receita: 0 }
      prev.qtd++; prev.receita += p.totalValor; stateMap.set(st, prev)
      const prevC = cityMap.get(ct) || { qtd: 0, receita: 0 }
      prevC.qtd++; prevC.receita += p.totalValor; cityMap.set(ct, prevC)
    })
    const stateArr = Array.from(stateMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.receita - a.receita)
    const cityArr = Array.from(cityMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.receita - a.receita).slice(0, 15)

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Estados Atendidos" value={stateArr.length} />
          <KPI label="Cidades Atendidas" value={cityMap.size} />
          <KPI label="Principal Estado" value={stateArr[0]?.name || '—'} sub={stateArr[0] ? fmt(stateArr[0].receita) : ''} />
          <KPI label="Clientes no Período" value={fc.length} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🗺️ Receita por Estado</h3>
            {stateArr.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stateArr}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} /><Tooltip formatter={(v: number) => [fmt(v), 'Receita']} /><Bar dataKey="receita" fill="#6366F1" radius={[6, 6, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🏙️ Top Cidades (Receita)</h3>
            {cityArr.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={cityArr} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} /><Tooltip formatter={(v: number) => [fmt(v), 'Receita']} /><Bar dataKey="receita" fill="#14B8A6" radius={[0, 6, 6, 0]} /></BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderClientes = () => {
    const ativos = fc.filter(c => c.etapa !== 'perdido').length
    const novos = computed.novosClientes
    const perdidosQtd = computed.perdidos.length
    const retenção = fc.length > 0 ? ((ativos / fc.length) * 100).toFixed(1) : '0'
    const churn = fc.length > 0 ? ((perdidosQtd / fc.length) * 100).toFixed(1) : '0'
    // ABC classification by revenue
    const clientRev = new Map<number, number>()
    fpConfirmed.forEach(p => clientRev.set(p.clienteId, (clientRev.get(p.clienteId) || 0) + p.totalValor))
    const sortedRevs = Array.from(clientRev.values()).sort((a, b) => b - a)
    const totalRev = sortedRevs.reduce((s, v) => s + v, 0)
    let cumA = 0; let countA = 0; let cumB = 0; let countB = 0; let countC = 0
    sortedRevs.forEach(v => {
      const cum = cumA + cumB + v
      if (cumA / (totalRev || 1) < 0.8 && countA < sortedRevs.length) { cumA += v; countA++ }
      else if ((cumA + cumB) / (totalRev || 1) < 0.95) { cumB += v; countB++ }
      else countC++
    })
    const abcData = [
      { name: 'Classe A (80%)', qtd: countA, fill: '#22C55E' },
      { name: 'Classe B (15%)', qtd: countB, fill: '#F59E0B' },
      { name: 'Classe C (5%)', qtd: countC, fill: '#EF4444' },
    ].filter(d => d.qtd > 0)
    // Top 10 concentration
    const top10Rev = sortedRevs.slice(0, 10).reduce((s, v) => s + v, 0)
    const concentracao = totalRev > 0 ? ((top10Rev / totalRev) * 100).toFixed(1) : '0'

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <KPI label="Clientes Ativos" value={ativos} color="text-green-700" />
          <KPI label="Novos no Período" value={novos} color="text-blue-700" />
          <KPI label="Perdidos" value={perdidosQtd} color="text-red-600" />
          <KPI label="Taxa Retenção" value={`${retenção}%`} color={Number(retenção) >= 80 ? 'text-green-700' : 'text-red-600'} />
          <KPI label="Churn" value={`${churn}%`} color={Number(churn) <= 20 ? 'text-green-700' : 'text-red-600'} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Classificação ABC</h3>
            {abcData.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem pedidos confirmados</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={abcData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip /><Bar dataKey="qtd" name="Clientes" radius={[6, 6, 0, 0]}>{abcData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar></BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Concentração de Receita</h3>
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-5xl font-bold text-gray-900">{concentracao}%</p>
              <p className="text-sm text-gray-500 mt-2">da receita vem dos Top 10 clientes</p>
              {Number(concentracao) > 50 && <p className="text-xs text-orange-600 mt-1 font-medium">⚠️ Alta concentração — diversifique a carteira</p>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderFunil = () => {
    const stages = ['lead', 'prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up']
    const funilData = stages.map(s => ({ name: stageLabels[s] || s, qtd: fc.filter(c => c.etapa === s).length }))
    const maxQtd = Math.max(...funilData.map(d => d.qtd), 1)
    const funilColors = ['#0EA5E9', '#F59E0B', '#6366F1', '#A855F7', '#3B82F6', '#22C55E']
    // Tempo médio de fechamento
    const tempos: number[] = []
    fc.filter(c => c.etapa === 'follow_up').forEach(c => {
      const hist = c.historicoEtapas || []
      if (hist.length > 0 && c.dataEntradaEtapa) {
        const first = hist.reduce((min, h) => h.data < min ? h.data : min, hist[0].data)
        const dias = Math.floor((new Date(c.dataEntradaEtapa).getTime() - new Date(first).getTime()) / 86400000)
        if (dias > 0) tempos.push(dias)
      }
    })
    const tempoMedio = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Leads no Funil" value={fc.filter(c => c.etapa !== 'perdido').length} />
          <KPI label="Pedidos Fechados" value={fpConfirmed.length} color="text-green-700" />
          <KPI label="Taxa Conversão" value={`${computed.taxaConversao.toFixed(1)}%`} />
          <KPI label="Tempo Médio Fechamento" value={tempoMedio > 0 ? `${tempoMedio} dias` : '—'} />
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🔽 Funil de Conversão</h3>
          <div className="space-y-3">
            {funilData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 w-28 text-right">{d.name}</span>
                <div className="flex-1 relative">
                  <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                    <div className="h-8 rounded-full flex items-center px-3 transition-all duration-500" style={{ width: `${Math.max((d.qtd / maxQtd) * 100, 8)}%`, backgroundColor: funilColors[i] }}>
                      <span className="text-xs font-bold text-white drop-shadow">{d.qtd}</span>
                    </div>
                  </div>
                </div>
                {i > 0 && funilData[i - 1].qtd > 0 && (
                  <span className={`text-xs font-bold w-12 text-right ${(d.qtd / funilData[i - 1].qtd) >= 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                    {Math.round((d.qtd / funilData[i - 1].qtd) * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderEquipe = () => {
    // Build rankings per interaction type
    const buildRanking = (tipo: string) => {
      return activeVendedores.map(v => {
        const m = computed.vendInteracoes.get(v.id)
        return { id: v.id, nome: v.nome, qtd: m?.get(tipo) || 0 }
      }).filter(v => v.qtd > 0).sort((a, b) => b.qtd - a.qtd)
    }
    const rankFaturamento = activeVendedores.map(v => ({ id: v.id, nome: v.nome, valor: computed.vendFaturamento.get(v.id) || 0 })).sort((a, b) => b.valor - a.valor)
    const rankLigacoes = buildRanking('ligacao')
    const rankEmails = buildRanking('email')
    const rankWhatsapp = buildRanking('whatsapp')
    const rankReunioes = buildRanking('reuniao')
    const maxFat = rankFaturamento[0]?.valor || 1

    const RankSection: React.FC<{ title: string; icon: React.ReactNode; data: { id: number; nome: string; qtd: number }[]; color: string; suffix?: string }> = ({ title, icon, data, color, suffix = '' }) => (
      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
        <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">{icon} {title}</h4>
        {data.length === 0 ? <p className="text-sm text-gray-400">Sem dados no período</p> : (
          <div className="space-y-2">
            {data.slice(0, 5).map((v, i) => (
              <RankRow key={v.id} i={i} nome={v.nome.split(' ')[0]} value={`${v.qtd}${suffix}`} pct={data[0].qtd > 0 ? (v.qtd / data[0].qtd) * 100 : 0} barColor={color} />
            ))}
          </div>
        )}
      </div>
    )

    return (
      <div className="space-y-6">
        {/* Faturamento ranking — BIG */}
        <div className={`bg-gradient-to-br from-gray-900 to-gray-800 rounded-apple shadow-lg p-6 ${tvMode ? 'p-10' : ''}`}>
          <h3 className={`font-bold text-white mb-6 ${tvMode ? 'text-3xl' : 'text-xl'}`}>🏆 Ranking Faturamento — {periodoLabel}</h3>
          <div className="space-y-4">
            {rankFaturamento.filter(v => v.valor > 0).slice(0, 8).map((v, i) => (
              <div key={v.id} className="flex items-center gap-4">
                <span className={`flex-shrink-0 font-bold ${tvMode ? 'text-4xl' : 'text-2xl'}`}>{medals[i] || <span className="text-gray-400 text-lg">{i + 1}.</span>}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-bold text-white truncate ${tvMode ? 'text-2xl' : 'text-base'}`}>{v.nome}</span>
                    <span className={`font-bold text-green-400 flex-shrink-0 ml-3 ${tvMode ? 'text-2xl' : 'text-base'}`}>{fmt(v.valor)}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3"><div className="h-3 rounded-full bg-green-500 transition-all duration-700" style={{ width: `${(v.valor / maxFat) * 100}%` }} /></div>
                </div>
              </div>
            ))}
            {rankFaturamento.filter(v => v.valor > 0).length === 0 && <p className="text-gray-400">Sem faturamento no período</p>}
          </div>
        </div>

        {/* Activity rankings grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <RankSection title="Ligações" icon="📞" data={rankLigacoes} color="#3B82F6" />
          <RankSection title="Emails" icon="📧" data={rankEmails} color="#8B5CF6" />
          <RankSection title="WhatsApp" icon={<WhatsAppIcon variant="filled" className="h-4 w-4" />} data={rankWhatsapp} color="#22C55E" />
          <RankSection title="Reuniões" icon="🤝" data={rankReunioes} color="#F59E0B" />
        </div>

        {/* Conversão por vendedor */}
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Conversão por Vendedor</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={activeVendedores.map(v => {
              const leads = fc.filter(c => c.vendedorId === v.id).length
              const conv = fc.filter(c => c.vendedorId === v.id && c.etapa === 'follow_up').length
              return { name: v.nome.split(' ')[0], leads, conversoes: conv, taxa: leads > 0 ? Math.round((conv / leads) * 100) : 0 }
            })}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip /><Bar dataKey="leads" fill="#93C5FD" name="Leads" radius={[4, 4, 0, 0]} /><Bar dataKey="conversoes" fill="#22C55E" name="Conversões" radius={[4, 4, 0, 0]} /><Legend />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  const renderCompetitiva = () => {
    const perdidos = computed.perdidos
    const totalPerdido = perdidos.length
    const valorPerdido = perdidos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
    const catColors: Record<string, string> = { preco: '#EAB308', prazo: '#F97316', qualidade: '#3B82F6', concorrencia: '#EF4444', sem_resposta: '#6B7280', outro: '#A855F7' }
    const porCategoria = Object.entries(perdidos.reduce((acc, c) => { const k = c.categoriaPerda || 'outro'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>))
      .map(([key, value]) => ({ name: catLabels[key] || key, value, fill: catColors[key] || '#6B7280' }))
      .sort((a, b) => b.value - a.value)
    const motivoTop = porCategoria[0]?.name || '—'

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Negócios Perdidos" value={totalPerdido} color="text-red-600" />
          <KPI label="Valor Perdido" value={fmt(valorPerdido)} color="text-red-600" />
          <KPI label="Motivo + Frequente" value={motivoTop} />
          <KPI label="Taxa de Perda" value={`${fc.length > 0 ? ((totalPerdido / fc.length) * 100).toFixed(1) : 0}%`} color="text-red-600" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🥧 Motivos de Perda</h3>
            {porCategoria.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Nenhum cliente perdido</p> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart><Pie data={porCategoria} cx="50%" cy="50%" outerRadius={95} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{porCategoria.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Perdas por Motivo</h3>
            {porCategoria.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porCategoria}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Perdas" radius={[6, 6, 0, 0]}>{porCategoria.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar></BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    )
  }

  const tabRenderers: Record<TabKey, () => React.ReactNode> = {
    saude: renderSaude, crescimento: renderCrescimento, produtos: renderProdutos,
    mercado: renderMercado, clientes: renderClientes, funil: renderFunil,
    equipe: renderEquipe, competitiva: renderCompetitiva,
  }

  // ── Main Render ──
  return (
    <div ref={containerRef} className={`space-y-5 ${tvMode ? 'bg-gray-950 min-h-screen p-6' : ''}`} data-testid="dashboard-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className={`font-bold ${tvMode ? 'text-3xl text-white' : 'text-xl sm:text-2xl text-gray-900'}`}>Dashboard Comercial</h1>
            <p className={`text-sm mt-0.5 ${tvMode ? 'text-gray-400' : 'text-gray-600'}`}>{periodoLabel}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full animate-pulse" data-testid="live-badge">
            <span className="w-2 h-2 bg-green-500 rounded-full" />AO VIVO
          </span>
          <span className={`text-xs ${tvMode ? 'text-gray-500' : 'text-gray-400'}`} data-testid="last-update">Atualizado há {secondsAgo}s</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-apple p-0.5 shadow-apple-sm">
            <button onClick={() => setPeriodoTipo('hoje')} className={`px-3 py-1.5 text-xs font-medium rounded-apple transition-all ${periodoTipo === 'hoje' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`} data-testid="btn-hoje">Hoje</button>
            <button onClick={() => setPeriodoTipo('mes')} className={`px-3 py-1.5 text-xs font-medium rounded-apple transition-all ${periodoTipo === 'mes' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`} data-testid="btn-mes">Mês</button>
            <button onClick={() => setPeriodoTipo('ano')} className={`px-3 py-1.5 text-xs font-medium rounded-apple transition-all ${periodoTipo === 'ano' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`} data-testid="btn-ano">Ano</button>
          </div>
          {periodoTipo === 'mes' && (
            <select value={`${selYear}-${selMonth}`} onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setSelYear(y); setSelMonth(m) }}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-apple bg-white shadow-apple-sm" data-testid="month-selector">
              {monthOpts.map(o => <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>)}
            </select>
          )}
          <button onClick={() => setTvMode(v => !v)} className={`px-3 py-1.5 text-xs font-medium rounded-apple border transition-all ${tvMode ? 'bg-red-600 text-white border-red-600' : 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800'}`} data-testid="btn-tv">
            {tvMode ? '✕ Sair TV' : '📺 Modo TV'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1" data-testid="tab-bar">
        {TAB_LIST.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} data-testid={`tab-${t.key}`}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-apple whitespace-nowrap transition-all ${
              activeTab === t.key
                ? tvMode ? 'bg-white text-gray-900 shadow' : 'bg-primary-600 text-white shadow-sm'
                : tvMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div data-testid={`panel-${activeTab}`}>
        {tabRenderers[activeTab]()}
      </div>
    </div>
  )
}

export default DashboardView
