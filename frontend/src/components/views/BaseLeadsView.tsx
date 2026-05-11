import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { Cliente, Vendedor } from '../../types'
import * as db from '../../lib/database'
import { authFetch } from '../../lib/botApi'
import { placesSearch, placesDetails, placesPhotoUrl, type PlacesSearchResult, type PlacesDetails } from '../../lib/placesApi'

const BOT_URL = import.meta.env.VITE_BOT_URL || 'http://localhost:3001'

const SEGMENTOS = [
  { label: '🍦 Sorveterias', cnae: '1053800', desc: 'Fabricação de sorvetes' },
  { label: '🥛 Laticínios', cnae: '1052000', desc: 'Fabricação de laticínios' },
  { label: '🏪 Atacado Sorvete', cnae: '4637106', desc: 'Comércio atacadista de sorvetes' },
  { label: '🏭 Atacado Outros', cnae: '4637199', desc: 'Atacado alimentício - outros' },
  { label: '🛒 Varejo Alim.', cnae: '4729699', desc: 'Varejo de produtos alimentícios' },
]

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

interface LeadRf {
  cnpj: string
  cnpj_basico: string
  razao_social: string
  nome_fantasia: string
  cnae: string
  municipio: string
  uf: string
  logradouro: string
  bairro: string
  cep: string
  telefone: string
  email: string
  importado: boolean
}

interface Props {
  loggedUser: Vendedor | null
  clientes: Cliente[]
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  showToast: (tipo: 'success' | 'error', texto: string) => void
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await authFetch(`${BOT_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
  })
  return res.json()
}

// ── Excel export ────────────────────────────────────────────────────────────
function exportToExcel(leads: LeadRf[], filename = 'leads.csv') {
  const cols = ['CNPJ','Razão Social','Nome Fantasia','CNAE','Município','UF','Logradouro','Bairro','CEP','Telefone','Email']
  const rows = leads.map(l => [
    l.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'),
    l.razao_social, l.nome_fantasia, l.cnae,
    l.municipio, l.uf, l.logradouro, l.bairro,
    l.cep?.replace(/(\d{5})(\d{3})/, '$1-$2'),
    l.telefone, l.email,
  ])
  const bom = '\uFEFF'
  const csv = bom + [cols, ...rows].map(r => r.map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Google Places mini-panel por lead ────────────────────────────────────────
const LeadGooglePanel: React.FC<{ lead: LeadRf; onClose: () => void }> = ({ lead, onClose }) => {
  const [step, setStep] = React.useState<'searching'|'results'|'loading'|'done'>('searching')
  const [results, setResults] = React.useState<PlacesSearchResult[]>([])
  const [details, setDetails] = React.useState<PlacesDetails | null>(null)

  React.useEffect(() => {
    const q = [lead.razao_social || lead.nome_fantasia, lead.municipio, lead.uf].filter(Boolean).join(' ')
    placesSearch(q).then(r => { setResults(r.slice(0,5)); setStep('results') })
  }, [])

  const handleSelect = async (r: PlacesSearchResult) => {
    setStep('loading')
    const d = await placesDetails(r.place_id)
    if (d && r.photos?.length) d.photoRefs = r.photos.slice(0,2).map(p => p.photo_reference)
    setDetails(d); setStep('done')
  }

  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-blue-700">🔍 Google Places</p>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕ Fechar</button>
      </div>

      {(step === 'searching') && (
        <p className="text-xs text-blue-600 flex items-center gap-1"><span className="animate-spin">⏳</span> Buscando...</p>
      )}

      {step === 'results' && (
        <div className="space-y-1.5">
          {results.length === 0 && <p className="text-xs text-gray-500">Nenhum resultado encontrado.</p>}
          {results.map(r => (
            <button key={r.place_id} onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 bg-white rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all">
              <p className="text-xs font-semibold text-gray-800">{r.name}</p>
              <p className="text-xs text-gray-500 truncate">{r.formatted_address || r.vicinity}</p>
              {r.rating && <span className="text-xs text-amber-600">⭐ {r.rating} ({r.user_ratings_total?.toLocaleString('pt-BR')})</span>}
            </button>
          ))}
        </div>
      )}

      {step === 'loading' && (
        <p className="text-xs text-blue-600 flex items-center gap-1"><span className="animate-spin">⏳</span> Carregando detalhes...</p>
      )}

      {step === 'done' && details && (
        <div className="space-y-2">
          {details.photoRefs && details.photoRefs.length > 0 && (
            <div className="flex gap-1.5">
              {details.photoRefs.map((ref,i) => (
                <img key={i} src={placesPhotoUrl(ref,180)} alt="" className="h-16 w-24 object-cover rounded-lg border border-gray-100 flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {details.phone && (
              <div className="flex items-center gap-1.5 p-2 bg-green-50 rounded-lg border border-green-200">
                <span className="text-green-600">📞</span>
                <div>
                  <p className="font-bold text-green-700">Telefone</p>
                  <a href={`tel:${details.phone}`} className="text-green-900 font-semibold">{details.phone}</a>
                </div>
                <a href={`https://wa.me/${details.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto bg-green-500 text-white px-1.5 py-0.5 rounded text-xs hover:bg-green-600">WA</a>
              </div>
            )}
            {details.website && (
              <div className="flex items-center gap-1.5 p-2 bg-blue-50 rounded-lg border border-blue-200">
                <span>🌐</span>
                <div className="min-w-0">
                  <p className="font-bold text-blue-700">Site</p>
                  <a href={details.website} target="_blank" rel="noopener noreferrer"
                    className="text-blue-900 hover:underline truncate block max-w-[120px]">
                    {details.website.replace(/^https?:\/\//,'').replace(/\//,'')}
                  </a>
                </div>
              </div>
            )}
            {details.website?.includes('instagram.com') && (
              <div className="flex items-center gap-1.5 p-2 bg-pink-50 rounded-lg border border-pink-200">
                <span>📸</span>
                <div className="min-w-0">
                  <p className="font-bold text-pink-700">Instagram</p>
                  <a href={details.website} target="_blank" rel="noopener noreferrer"
                    className="text-pink-900 hover:underline truncate block max-w-[120px]">
                    {details.website.replace('https://www.instagram.com/','@').replace(/\/$/,'')}
                  </a>
                </div>
              </div>
            )}
            {details.rating && (
              <div className="flex items-center gap-1.5 p-2 bg-amber-50 rounded-lg border border-amber-200">
                <span>⭐</span>
                <div>
                  <p className="font-bold text-amber-700">Google</p>
                  <p className="text-amber-900 font-semibold">{details.rating} <span className="font-normal text-amber-600">({details.totalRatings?.toLocaleString('pt-BR')})</span></p>
                </div>
              </div>
            )}
            {details.isOpen !== undefined && (
              <div className={`flex items-center gap-1.5 p-2 rounded-lg border ${
                details.isOpen ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <span>{details.isOpen ? '✅' : '❌'}</span>
                <div>
                  <p className={`font-bold ${details.isOpen ? 'text-green-700' : 'text-red-600'}`}>
                    {details.isOpen ? 'Aberto agora' : 'Fechado agora'}
                  </p>
                </div>
              </div>
            )}
            {details.googleMapsUrl && (
              <div className="flex items-center gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <span>🗺️</span>
                <div>
                  <p className="font-bold text-gray-600">Maps</p>
                  <a href={details.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                    className="text-gray-800 hover:underline">Ver no Google Maps</a>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => { setStep('results') }}
            className="text-xs text-gray-400 hover:text-gray-600">← Ver outros resultados</button>
        </div>
      )}
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

export default function BaseLeadsView({ loggedUser, clientes, setClientes, showToast }: Props) {
  const [segmento, setSegmento] = useState<string>('')
  const [uf, setUf] = useState<string>('')
  const [municipio, setMunicipio] = useState<string>('')
  const [q, setQ] = useState<string>('')
  const [leads, setLeads] = useState<LeadRf[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [googleOpenCnpj, setGoogleOpenCnpj] = useState<string | null>(null)
  const [municipios, setMunicipios] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cnpjsJaNoCrm = new Set(clientes.map(c => c.cnpj?.replace(/\D/g, '')).filter(Boolean))

  const buscar = useCallback(async (p = 1) => {
    if (!segmento && !uf && !q) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' })
      if (segmento) params.set('cnae', segmento)
      if (uf) params.set('uf', uf)
      if (municipio) params.set('municipio', municipio)
      if (q) params.set('q', q)
      const data = await apiFetch(`/api/leads-rf/buscar?${params}`)
      if (data.success) {
        setLeads(data.leads || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
        setPage(p)
        setSelecionados(new Set())
      }
    } catch { showToast('error', 'Erro ao buscar leads') }
    finally { setLoading(false) }
  }, [segmento, uf, municipio, q])

  useEffect(() => {
    if (!uf) { setMunicipios([]); setMunicipio(''); return }
    apiFetch(`/api/leads-rf/municipios?uf=${uf}`)
      .then(d => { if (d.success) setMunicipios(d.municipios || []) })
      .catch(() => {})
  }, [uf])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(1), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [buscar])

  const toggleSelecionado = (cnpj: string) => {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(cnpj) ? next.delete(cnpj) : next.add(cnpj)
      return next
    })
  }

  const toggleTodos = () => {
    const importaveis = leads.filter(l => !l.importado && !cnpjsJaNoCrm.has(l.cnpj))
    if (selecionados.size === importaveis.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(importaveis.map(l => l.cnpj)))
    }
  }

  const importarSelecionados = async () => {
    if (selecionados.size === 0) return
    setImportando(true)
    try {
      const cnpjsList = Array.from(selecionados)
      const leadsParaImportar = leads.filter(l => cnpjsList.includes(l.cnpj))

      for (const lead of leadsParaImportar) {
        const cep = lead.cep?.replace(/\D/g, '')
        const cepFmt = cep?.length === 8 ? `${cep.slice(0,5)}-${cep.slice(5)}` : lead.cep
        const enderecoCompleto = [lead.logradouro, lead.bairro, lead.municipio, lead.uf].filter(Boolean).join(', ')

        await db.insertCliente({
          razaoSocial: lead.razao_social || lead.nome_fantasia || 'Sem nome',
          nomeFantasia: lead.nome_fantasia || undefined,
          cnpj: lead.cnpj,
          contatoNome: '',
          contatoTelefone: lead.telefone || '',
          contatoEmail: lead.email || '',
          endereco: enderecoCompleto || undefined,
          enderecoRua: lead.logradouro || undefined,
          enderecoBairro: lead.bairro || undefined,
          enderecoCidade: lead.municipio || undefined,
          enderecoEstado: lead.uf || undefined,
          enderecoCep: cepFmt || undefined,
          cnaePrimario: lead.cnae || undefined,
          etapa: 'lead',
          origemLead: 'base_rf',
          score: 15,
          ultimaInteracao: new Date().toISOString().split('T')[0],
          diasInativo: 0,
          vendedorId: loggedUser?.id,
        } as Omit<Cliente, 'id'>)
      }

      // Marca como importado na tabela leads_rf
      await apiFetch('/api/leads-rf/importar', {
        method: 'POST',
        body: JSON.stringify({ cnpjs: cnpjsList }),
      })

      // Atualiza estado local
      setLeads(prev => prev.map(l => cnpjsList.includes(l.cnpj) ? { ...l, importado: true } : l))
      const novosClientes = await db.fetchClientes()
      setClientes(novosClientes)
      setSelecionados(new Set())
      showToast('success', `${cnpjsList.length} lead(s) importado(s) com sucesso!`)
    } catch (err) {
      showToast('error', 'Erro ao importar leads')
    } finally {
      setImportando(false)
    }
  }

  const segLabel = SEGMENTOS.find(s => s.cnae === segmento)?.label || 'Todos'
  const importaveis = leads.filter(l => !l.importado && !cnpjsJaNoCrm.has(l.cnpj))
  const todosSelecionados = importaveis.length > 0 && selecionados.size === importaveis.length

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🍦 Base de Leads — Receita Federal</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              235.519 empresas ativas do setor alimentício • Filtradas por CNAE
            </p>
          </div>
          <div className="flex items-center gap-2">
            {leads.length > 0 && (
              <button
                onClick={() => exportToExcel(leads, `leads-${uf||'br'}-${municipio||'todos'}.csv`)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                title="Baixar lista em Excel/CSV"
              >
                📥 Excel
              </button>
            )}
            {selecionados.size > 0 && (
              <button
                onClick={importarSelecionados}
                disabled={importando}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-60"
              >
                {importando ? (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                ) : '⬇️'}
                Importar {selecionados.size} lead{selecionados.size > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>

        {/* Chips de segmento */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSegmento('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
              !segmento ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            Todos segmentos
          </button>
          {SEGMENTOS.map(s => (
            <button
              key={s.cnae}
              onClick={() => setSegmento(prev => prev === s.cnae ? '' : s.cnae)}
              title={s.desc}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                segmento === s.cnae
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3">
          <select
            value={uf}
            onChange={e => { setUf(e.target.value); setMunicipio('') }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[120px]"
          >
            <option value="">Todos os estados</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          {uf && (
            <select
              value={municipio}
              onChange={e => setMunicipio(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[200px]"
            >
              <option value="">Todas as cidades</option>
              {municipios.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}

          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nome da empresa..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex-1 min-w-[220px]"
          />
        </div>
      </div>

      {/* Resultados */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {/* Barra de info + seleção */}
        {leads.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{total.toLocaleString('pt-BR')}</span> empresa{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
                {segmento && <span className="ml-1 text-blue-600">• {segLabel}</span>}
                {uf && <span className="ml-1 text-blue-600">• {uf}</span>}
                {municipio && <span className="ml-1 text-blue-600">• {municipio}</span>}
              </span>
            </div>
            {importaveis.length > 0 && (
              <button
                onClick={toggleTodos}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {todosSelecionados ? 'Desmarcar todos' : `Selecionar todos (${importaveis.length})`}
              </button>
            )}
          </div>
        )}

        {/* Estado vazio */}
        {!loading && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-6xl mb-4">🍦</div>
            <p className="text-lg font-medium text-gray-700">Selecione um segmento ou estado para começar</p>
            <p className="text-sm text-gray-500 mt-1">Ex: clique em "Sorveterias" e escolha o estado SP</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="ml-3 text-gray-600">Buscando na base da Receita Federal...</span>
          </div>
        )}

        {/* Lista */}
        {!loading && leads.length > 0 && (
          <div className="space-y-2">
            {leads.map(lead => {
              const jaNoCrm = cnpjsJaNoCrm.has(lead.cnpj)
              const importavel = !lead.importado && !jaNoCrm
              const selecionado = selecionados.has(lead.cnpj)
              const cnpjFmt = lead.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
              const cepFmt = lead.cep?.replace(/(\d{5})(\d{3})/, '$1-$2')

              return (
                <div
                  key={lead.cnpj}
                  onClick={() => importavel && toggleSelecionado(lead.cnpj)}
                  className={`bg-white rounded-lg border transition-all ${
                    !importavel
                      ? 'opacity-60 cursor-default border-gray-200'
                      : selecionado
                        ? 'border-blue-500 shadow-sm cursor-pointer ring-1 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 cursor-pointer hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3 p-4">
                    {/* Checkbox */}
                    <div className="mt-0.5 flex-shrink-0">
                      {importavel ? (
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          selecionado ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}>
                          {selecionado && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
                          {lead.importado || jaNoCrm ? (
                            <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <span className="font-semibold text-gray-900 text-sm">
                            {lead.razao_social || lead.nome_fantasia || '—'}
                          </span>
                          {lead.nome_fantasia && lead.nome_fantasia !== lead.razao_social && (
                            <span className="ml-2 text-xs text-gray-500">({lead.nome_fantasia})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {(lead.importado || jaNoCrm) && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                              ✅ No CRM
                            </span>
                          )}
                          <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-mono">
                            {SEGMENTOS.find(s => s.cnae === lead.cnae)?.label.split(' ').slice(1).join(' ') || lead.cnae}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="font-mono text-gray-400">{cnpjFmt}</span>
                        <span>📍 {lead.municipio} — {lead.uf}</span>
                        {lead.telefone && <span>📞 {lead.telefone}</span>}
                        {lead.email && (
                          <span className="truncate max-w-[200px]" title={lead.email}>
                            ✉️ {lead.email}
                          </span>
                        )}
                        {lead.logradouro && (
                          <span className="truncate max-w-[260px]" title={`${lead.logradouro}, ${lead.bairro} — ${cepFmt}`}>
                            {lead.logradouro}{lead.bairro ? `, ${lead.bairro}` : ''}{cepFmt ? ` — ${cepFmt}` : ''}
                          </span>
                        )}
                      </div>

                      {/* Google Places button */}
                      <div className="mt-2" onClick={e => e.stopPropagation()}>
                        {googleOpenCnpj !== lead.cnpj ? (
                          <button
                            onClick={() => setGoogleOpenCnpj(lead.cnpj)}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-all font-medium"
                          >
                            🔍 Conferir no Google
                          </button>
                        ) : (
                          <LeadGooglePanel lead={lead} onClose={() => setGoogleOpenCnpj(null)} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && !loading && (
          <div className="flex items-center justify-center gap-2 mt-6 pb-4">
            <button
              onClick={() => buscar(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              ← Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>
            <button
              onClick={() => buscar(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
