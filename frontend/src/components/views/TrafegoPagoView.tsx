import React, { useState, useEffect, useMemo } from 'react'
import type { Vendedor } from '../../types'
import { authFetch } from '../../lib/botApi'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlatformCreds {
  meta: { adAccountId: string; accessToken: string }
  google: { customerId: string; developerToken: string; clientId: string; clientSecret: string; refreshToken: string }
}

interface Campanha {
  id: string
  nome: string
  plataforma: 'meta' | 'google'
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED'
  objetivo: string
  orcamentoDiario: number
  orcamentoTotal?: number
  dataInicio: string
  dataFim?: string
  impressoes: number
  cliques: number
  leads: number
  gasto: number
  ctr: number
  cpc: number
  cpl: number
  roas?: number
}

interface MetricCard {
  label: string
  value: string
  sub?: string
  color: string
  icon: string
  delta?: string
  deltaPositive?: boolean
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

async function apiFetch(path: string, options?: RequestInit) {
  const res = await authFetch(`${BOT_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  return res.json()
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Campanha['status'] }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    PAUSED: 'bg-yellow-100 text-yellow-700',
    ARCHIVED: 'bg-gray-100 text-gray-600',
    DELETED: 'bg-red-100 text-red-700',
  }
  const labels: Record<string, string> = { ACTIVE: 'Ativa', PAUSED: 'Pausada', ARCHIVED: 'Arquivada', DELETED: 'Deletada' }
  return <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${map[status] || 'bg-gray-100 text-gray-600'}`}>{labels[status] || status}</span>
}

function PlataformaBadge({ plataforma }: { plataforma: 'meta' | 'google' }) {
  if (plataforma === 'meta') return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">📘 Meta</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700">🔴 Google</span>
}

function MetricCardComp({ m }: { m: MetricCard }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-lg">{m.icon}</span>
        {m.delta && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.deltaPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {m.deltaPositive ? '▲' : '▼'} {m.delta}
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
      <p className="text-xs text-gray-500 font-medium">{m.label}</p>
      {m.sub && <p className="text-[10px] text-gray-400">{m.sub}</p>}
    </div>
  )
}

// ─── Setup wizard ─────────────────────────────────────────────────────────────

function SetupWizard({ onSave }: { onSave: (creds: PlatformCreds) => void }) {
  const [step, setStep] = useState<'meta' | 'google' | 'done'>('meta')
  const [meta, setMeta] = useState({ adAccountId: '', accessToken: '' })
  const [google, setGoogle] = useState({ customerId: '', developerToken: '', clientId: '', clientSecret: '', refreshToken: '' })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white">
          <h2 className="text-lg font-bold">🚀 Configurar Tráfego Pago</h2>
          <p className="text-sm text-blue-100 mt-1">Conecte suas contas de anúncios para começar</p>
        </div>

        {/* Steps indicator */}
        <div className="flex border-b border-gray-100">
          {(['meta', 'google'] as const).map((s, i) => (
            <button key={s} onClick={() => setStep(s)} className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${step === s ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{i + 1}</span>
              {s === 'meta' ? '📘 Meta Ads' : '🔴 Google Ads'}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {step === 'meta' && (
            <>
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                <p className="font-bold">Como obter suas credenciais Meta:</p>
                <p>1. Acesse <strong>business.facebook.com</strong> → Configurações → Usuários do Sistema</p>
                <p>2. Crie um Usuário de Sistema com permissão de Admin</p>
                <p>3. Gere um Token de Acesso com permissões: <code>ads_management, ads_read, business_management</code></p>
                <p>4. O Ad Account ID está em Contas de Anúncios (formato: <code>act_XXXXXXXXXX</code>)</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Ad Account ID</label>
                  <input value={meta.adAccountId} onChange={e => setMeta(v => ({ ...v, adAccountId: e.target.value }))} placeholder="act_123456789" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Access Token (System User)</label>
                  <input type="password" value={meta.accessToken} onChange={e => setMeta(v => ({ ...v, accessToken: e.target.value }))} placeholder="EAAxxxxxx..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button onClick={() => setStep('google')} disabled={!meta.adAccountId || !meta.accessToken} className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Próximo → Google Ads
              </button>
              <button onClick={() => { onSave({ meta, google }); }} className="w-full py-2 text-gray-500 text-xs hover:text-gray-700">
                Pular Google Ads (só Meta)
              </button>
            </>
          )}

          {step === 'google' && (
            <>
              <div className="bg-red-50 rounded-lg p-3 text-xs text-red-800 space-y-1">
                <p className="font-bold">Como obter suas credenciais Google Ads:</p>
                <p>1. Acesse <strong>console.cloud.google.com</strong> → Criar projeto → Ativar API Google Ads</p>
                <p>2. Crie credenciais OAuth 2.0 (tipo: aplicação web)</p>
                <p>3. Obtenha o Developer Token em <strong>ads.google.com</strong> → Ferramentas → API Center</p>
                <p>4. Customer ID está no topo direito do Google Ads (formato: <code>XXX-XXX-XXXX</code>)</p>
                <p>5. Gere o Refresh Token via OAuth playground ou nossa utilidade</p>
              </div>
              <div className="space-y-3">
                {[
                  { key: 'customerId', label: 'Customer ID', placeholder: '123-456-7890' },
                  { key: 'developerToken', label: 'Developer Token', placeholder: 'xxxxxxxxxxxxxxx' },
                  { key: 'clientId', label: 'OAuth Client ID', placeholder: 'xxxxxxx.apps.googleusercontent.com' },
                  { key: 'clientSecret', label: 'OAuth Client Secret', placeholder: 'GOCSPX-xxxxxxx' },
                  { key: 'refreshToken', label: 'Refresh Token', placeholder: '1//xxxxxxxxx' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
                    <input
                      type={key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') ? 'password' : 'text'}
                      value={(google as any)[key]}
                      onChange={e => setGoogle(v => ({ ...v, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                ))}
              </div>
              <button onClick={() => onSave({ meta, google })} className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
                ✅ Salvar e Conectar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Nova campanha modal ───────────────────────────────────────────────────────

function NovaCampanhaModal({ onClose, onCriar }: { onClose: () => void; onCriar: (data: any) => Promise<void> }) {
  const [form, setForm] = useState({
    plataforma: 'meta' as 'meta' | 'google',
    nome: '',
    objetivo: 'LINK_CLICKS',
    orcamentoDiario: '',
    dataInicio: new Date().toISOString().split('T')[0],
    dataFim: '',
    publicoIdade: '18-65',
    publicoLocalizacao: '',
    publicoInteresses: '',
  })
  const [loading, setLoading] = useState(false)

  const objetivosMeta = [
    { value: 'LINK_CLICKS', label: '🖱️ Cliques no Link' },
    { value: 'LEAD_GENERATION', label: '📋 Geração de Leads' },
    { value: 'REACH', label: '👁️ Alcance' },
    { value: 'BRAND_AWARENESS', label: '📣 Reconhecimento de Marca' },
    { value: 'CONVERSIONS', label: '🎯 Conversões' },
    { value: 'VIDEO_VIEWS', label: '🎥 Visualizações de Vídeo' },
    { value: 'MESSAGES', label: '💬 Mensagens' },
  ]

  const objetivosGoogle = [
    { value: 'SEARCH', label: '🔍 Pesquisa' },
    { value: 'DISPLAY', label: '🖼️ Display' },
    { value: 'SHOPPING', label: '🛒 Shopping' },
    { value: 'VIDEO', label: '🎥 YouTube' },
    { value: 'SMART', label: '🤖 Smart Campaign' },
  ]

  const objetivos = form.plataforma === 'meta' ? objetivosMeta : objetivosGoogle

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await onCriar(form)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">🚀 Nova Campanha</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Plataforma */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Plataforma</label>
            <div className="flex gap-2">
              {(['meta', 'google'] as const).map(p => (
                <button key={p} type="button" onClick={() => setForm(v => ({ ...v, plataforma: p, objetivo: p === 'meta' ? 'LINK_CLICKS' : 'SEARCH' }))}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-lg border-2 transition-colors ${form.plataforma === p ? (p === 'meta' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-red-500 bg-red-50 text-red-700') : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {p === 'meta' ? '📘 Meta Ads' : '🔴 Google Ads'}
                </button>
              ))}
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Nome da Campanha *</label>
            <input required value={form.nome} onChange={e => setForm(v => ({ ...v, nome: e.target.value }))} placeholder="Ex: Prospecção B2B - Abril 2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Objetivo */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Objetivo *</label>
            <select required value={form.objetivo} onChange={e => setForm(v => ({ ...v, objetivo: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {objetivos.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Orçamento */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Orçamento Diário (R$) *</label>
            <input required type="number" min="5" step="0.01" value={form.orcamentoDiario} onChange={e => setForm(v => ({ ...v, orcamentoDiario: e.target.value }))} placeholder="50.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Data Início *</label>
              <input required type="date" value={form.dataInicio} onChange={e => setForm(v => ({ ...v, dataInicio: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Data Fim (opcional)</label>
              <input type="date" value={form.dataFim} onChange={e => setForm(v => ({ ...v, dataFim: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {/* Público */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
            <p className="text-xs font-bold text-gray-700">🎯 Segmentação do Público</p>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Faixa Etária</label>
              <select value={form.publicoIdade} onChange={e => setForm(v => ({ ...v, publicoIdade: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none">
                {['18-24', '25-34', '35-44', '45-54', '55-65', '18-35', '25-45', '35-65', '18-65'].map(r => <option key={r} value={r}>{r} anos</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Localização</label>
              <input value={form.publicoLocalizacao} onChange={e => setForm(v => ({ ...v, publicoLocalizacao: e.target.value }))} placeholder="Ex: São Paulo, Rio de Janeiro, Brasil" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Interesses (separados por vírgula)</label>
              <input value={form.publicoInteresses} onChange={e => setForm(v => ({ ...v, publicoInteresses: e.target.value }))} placeholder="Ex: moda, varejo, empreendedorismo" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {loading ? (
              <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Criando campanha...</span>
            ) : '🚀 Criar Campanha'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function TrafegoPagoView({ loggedUser }: { loggedUser: Vendedor | null }) {
  const [creds, setCreds] = useState<PlatformCreds | null>(null)
  const [credsLoaded, setCredsLoaded] = useState(false)
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState<'dashboard' | 'campanhas' | 'criar' | 'config'>('dashboard')
  const [showNovaCampanha, setShowNovaCampanha] = useState(false)
  const [filterPlat, setFilterPlat] = useState<'all' | 'meta' | 'google'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'ACTIVE' | 'PAUSED'>('all')
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [toastMsg, setToastMsg] = useState('')

  function showToast(msg: string) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3500) }

  // Load saved creds
  useEffect(() => {
    apiFetch('/trafico/config').then(r => {
      if (r.success && r.data) setCreds(r.data)
    }).catch(() => {}).finally(() => setCredsLoaded(true))
  }, [])

  // Load campanhas when creds available
  useEffect(() => {
    if (!creds) return
    setLoading(true)
    apiFetch(`/trafico/campanhas?range=${dateRange}`).then(r => {
      if (r.success && r.data) setCampanhas(r.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [creds, dateRange])

  async function handleSaveCreds(newCreds: PlatformCreds) {
    const r = await apiFetch('/trafico/config', { method: 'POST', body: JSON.stringify(newCreds) })
    if (r.success) { setCreds(newCreds); showToast('✅ Credenciais salvas com sucesso!') }
    else showToast('❌ Erro ao salvar credenciais: ' + r.error)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const r = await apiFetch('/trafico/sync', { method: 'POST', body: JSON.stringify({ range: dateRange }) })
      if (r.success && r.data) { setCampanhas(r.data); showToast('✅ Dados sincronizados!') }
      else showToast('⚠️ ' + (r.error || 'Erro ao sincronizar'))
    } finally { setSyncing(false) }
  }

  async function handleCriarCampanha(form: any) {
    const r = await apiFetch('/trafico/campanha', { method: 'POST', body: JSON.stringify(form) })
    if (r.success) { showToast('✅ Campanha criada! Sincronizando...'); await handleSync() }
    else throw new Error(r.error || 'Erro ao criar campanha')
  }

  async function handleToggleStatus(c: Campanha) {
    const novoStatus = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    const r = await apiFetch(`/trafico/campanha/${c.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ plataforma: c.plataforma, status: novoStatus }),
    })
    if (r.success) {
      setCampanhas(prev => prev.map(cam => cam.id === c.id ? { ...cam, status: novoStatus } : cam))
      showToast(`${novoStatus === 'ACTIVE' ? '▶️' : '⏸️'} Campanha ${novoStatus === 'ACTIVE' ? 'ativada' : 'pausada'}`)
    } else showToast('❌ Erro: ' + r.error)
  }

  // Derived metrics
  const campanhasFiltradas = useMemo(() => campanhas.filter(c => {
    if (filterPlat !== 'all' && c.plataforma !== filterPlat) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    return true
  }), [campanhas, filterPlat, filterStatus])

  const metrics = useMemo(() => {
    const gastoTotal = campanhasFiltradas.reduce((s, c) => s + c.gasto, 0)
    const leadsTotal = campanhasFiltradas.reduce((s, c) => s + c.leads, 0)
    const cliquesTotal = campanhasFiltradas.reduce((s, c) => s + c.cliques, 0)
    const impressoesTotal = campanhasFiltradas.reduce((s, c) => s + c.impressoes, 0)
    const cplMedio = leadsTotal > 0 ? gastoTotal / leadsTotal : 0
    const ctrMedio = impressoesTotal > 0 ? (cliquesTotal / impressoesTotal) * 100 : 0
    const cpcMedio = cliquesTotal > 0 ? gastoTotal / cliquesTotal : 0
    const ativas = campanhasFiltradas.filter(c => c.status === 'ACTIVE').length
    return { gastoTotal, leadsTotal, cliquesTotal, impressoesTotal, cplMedio, ctrMedio, cpcMedio, ativas }
  }, [campanhasFiltradas])

  const metricCards: MetricCard[] = [
    { label: 'Gasto Total', value: `R$ ${metrics.gastoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '💰', color: 'text-gray-800', sub: `${dateRange === '7d' ? 'Últimos 7 dias' : dateRange === '30d' ? 'Últimos 30 dias' : 'Últimos 90 dias'}` },
    { label: 'Leads Gerados', value: metrics.leadsTotal.toLocaleString(), icon: '🎯', color: 'text-indigo-700', sub: `CPL médio: R$ ${metrics.cplMedio.toFixed(2)}` },
    { label: 'Cliques', value: metrics.cliquesTotal.toLocaleString(), icon: '🖱️', color: 'text-blue-700', sub: `CTR: ${metrics.ctrMedio.toFixed(2)}%` },
    { label: 'Impressões', value: metrics.impressoesTotal >= 1000 ? `${(metrics.impressoesTotal / 1000).toFixed(1)}k` : String(metrics.impressoesTotal), icon: '👁️', color: 'text-purple-700', sub: `CPC: R$ ${metrics.cpcMedio.toFixed(2)}` },
    { label: 'Campanhas Ativas', value: String(metrics.ativas), icon: '▶️', color: 'text-green-700', sub: `de ${campanhasFiltradas.length} total` },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!credsLoaded) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )

  if (!creds) return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📊 Tráfego Pago</h1>
        <p className="text-gray-500 text-sm mt-1">Configure suas contas de anúncios para começar</p>
      </div>
      <SetupWizard onSave={handleSaveCreds} />
    </div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">📊 Tráfego Pago</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {creds.meta.adAccountId && <span className="mr-3">📘 Meta: <span className="font-medium text-blue-600">{creds.meta.adAccountId}</span></span>}
              {creds.google.customerId && <span>🔴 Google: <span className="font-medium text-red-600">{creds.google.customerId}</span></span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {(['7d', '30d', '90d'] as const).map(r => (
                <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1.5 transition-colors ${dateRange === r ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {r === '7d' ? '7 dias' : r === '30d' ? '30 dias' : '90 dias'}
                </button>
              ))}
            </div>
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              {syncing ? <span className="w-3 h-3 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin" /> : '🔄'}
              Sync
            </button>
            <button onClick={() => setShowNovaCampanha(true)} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              + Nova Campanha
            </button>
            <button onClick={() => setTab('config')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              ⚙️ Config
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {[
            { id: 'dashboard', label: '📈 Dashboard' },
            { id: 'campanhas', label: '📋 Campanhas' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">

        {/* Filters bar */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-xs font-medium">
            {(['all', 'meta', 'google'] as const).map(p => (
              <button key={p} onClick={() => setFilterPlat(p)} className={`px-3 py-1.5 transition-colors ${filterPlat === p ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                {p === 'all' ? 'Todas' : p === 'meta' ? '📘 Meta' : '🔴 Google'}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-xs font-medium">
            {([['all', 'Todas'], ['ACTIVE', '▶️ Ativas'], ['PAUSED', '⏸️ Pausadas']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilterStatus(v as any)} className={`px-3 py-1.5 transition-colors ${filterStatus === v ? 'bg-green-50 text-green-700' : 'text-gray-500 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>
          <p className="text-xs text-gray-400 ml-auto">{campanhasFiltradas.length} campanhas</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-500">Carregando dados das plataformas...</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── DASHBOARD TAB ── */}
            {tab === 'dashboard' && (
              <div className="space-y-6">
                {/* Metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {metricCards.map(m => <MetricCardComp key={m.label} m={m} />)}
                </div>

                {/* Platform breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(['meta', 'google'] as const).map(plat => {
                    const cs = campanhas.filter(c => c.plataforma === plat)
                    const gasto = cs.reduce((s, c) => s + c.gasto, 0)
                    const leads = cs.reduce((s, c) => s + c.leads, 0)
                    const cliques = cs.reduce((s, c) => s + c.cliques, 0)
                    const cpl = leads > 0 ? gasto / leads : 0
                    if (plat === 'meta' && !creds?.meta.adAccountId) return null
                    if (plat === 'google' && !creds?.google.customerId) return null
                    return (
                      <div key={plat} className={`bg-white rounded-xl border-2 p-5 ${plat === 'meta' ? 'border-blue-100' : 'border-red-100'}`}>
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-xl">{plat === 'meta' ? '📘' : '🔴'}</span>
                          <h3 className="font-bold text-gray-800">{plat === 'meta' ? 'Meta Ads' : 'Google Ads'}</h3>
                          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${plat === 'meta' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{cs.filter(c => c.status === 'ACTIVE').length} ativas</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Gasto', value: `R$ ${gasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                            { label: 'Leads', value: leads.toLocaleString() },
                            { label: 'Cliques', value: cliques.toLocaleString() },
                            { label: 'CPL Médio', value: `R$ ${cpl.toFixed(2)}` },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Top campanhas */}
                {campanhas.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-bold text-gray-800 text-sm">🏆 Top Campanhas por Leads</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {[...campanhas].sort((a, b) => b.leads - a.leads).slice(0, 5).map(c => (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                          <PlataformaBadge plataforma={c.plataforma} />
                          <p className="text-xs font-medium text-gray-800 flex-1 truncate">{c.nome}</p>
                          <StatusBadge status={c.status} />
                          <div className="text-right min-w-[80px]">
                            <p className="text-xs font-bold text-indigo-700">{c.leads} leads</p>
                            <p className="text-[10px] text-gray-400">R$ {c.cpl.toFixed(2)} CPL</p>
                          </div>
                          <div className="text-right min-w-[70px]">
                            <p className="text-xs font-bold text-gray-700">R$ {c.gasto.toFixed(2)}</p>
                            <p className="text-[10px] text-gray-400">{c.cliques} cliques</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {campanhas.length === 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <p className="text-4xl mb-3">📊</p>
                    <p className="text-gray-600 font-medium">Nenhuma campanha encontrada</p>
                    <p className="text-gray-400 text-sm mt-1">Crie sua primeira campanha ou ajuste os filtros de data</p>
                    <button onClick={() => setShowNovaCampanha(true)} className="mt-4 px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors">
                      + Criar Primeira Campanha
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── CAMPANHAS TAB ── */}
            {tab === 'campanhas' && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-800 text-sm">📋 Todas as Campanhas ({campanhasFiltradas.length})</h3>
                  <button onClick={() => setShowNovaCampanha(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">+ Nova</button>
                </div>
                {campanhasFiltradas.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <p className="text-3xl mb-2">📭</p>
                    <p>Nenhuma campanha com os filtros selecionados</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Campanha', 'Plataforma', 'Status', 'Orçamento/dia', 'Gasto', 'Impressões', 'Cliques', 'CTR', 'Leads', 'CPL', 'Ações'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {campanhasFiltradas.map(c => (
                          <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-3 max-w-[180px]">
                              <p className="font-medium text-gray-800 truncate" title={c.nome}>{c.nome}</p>
                              <p className="text-[10px] text-gray-400">{c.objetivo}</p>
                            </td>
                            <td className="px-3 py-3"><PlataformaBadge plataforma={c.plataforma} /></td>
                            <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                            <td className="px-3 py-3 font-medium text-gray-700">R$ {c.orcamentoDiario.toFixed(2)}</td>
                            <td className="px-3 py-3 font-bold text-gray-800">R$ {c.gasto.toFixed(2)}</td>
                            <td className="px-3 py-3 text-gray-600">{c.impressoes.toLocaleString()}</td>
                            <td className="px-3 py-3 text-gray-600">{c.cliques.toLocaleString()}</td>
                            <td className="px-3 py-3 text-gray-600">{c.ctr.toFixed(2)}%</td>
                            <td className="px-3 py-3 font-bold text-indigo-700">{c.leads}</td>
                            <td className="px-3 py-3 font-medium text-gray-700">{c.leads > 0 ? `R$ ${c.cpl.toFixed(2)}` : '—'}</td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => handleToggleStatus(c)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${c.status === 'ACTIVE' ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                              >
                                {c.status === 'ACTIVE' ? '⏸ Pausar' : '▶ Ativar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── CONFIG TAB ── */}
            {tab === 'config' && (
              <SetupWizard onSave={async (newCreds) => { await handleSaveCreds(newCreds); setTab('dashboard') }} />
            )}
          </>
        )}
      </div>

      {/* Nova campanha modal */}
      {showNovaCampanha && (
        <NovaCampanhaModal onClose={() => setShowNovaCampanha(false)} onCriar={handleCriarCampanha} />
      )}
    </div>
  )
}
