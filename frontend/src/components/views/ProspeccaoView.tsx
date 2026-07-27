import React from 'react'
import { SparklesIcon, MagnifyingGlassIcon, PhoneIcon, GlobeAltIcon, MapPinIcon, StarIcon, ClockIcon } from '@heroicons/react/24/outline'
import WhatsAppIcon from '../icons/WhatsAppIcon'
import type { Cliente, Interacao, TemplateMsg, Cadencia, Campanha, JobAutomacao } from '../../types'
import { placesSearch, placesDetails, placesPhotoUrl, type PlacesSearchResult, type PlacesDetails } from '../../lib/placesApi'

// ─── Google Places enrichment inline no painel do lead ───────────────────────
const LeadPlacesEnrich: React.FC<{ lead: Cliente }> = ({ lead }) => {
  const [state, setState] = React.useState<'idle' | 'searching' | 'results' | 'loading_details' | 'done'>('idle')
  const [results, setResults] = React.useState<PlacesSearchResult[]>([])
  const [details, setDetails] = React.useState<PlacesDetails | null>(null)
  const prevLeadId = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (lead.id !== prevLeadId.current) {
      prevLeadId.current = lead.id
      setState('idle')
      setResults([])
      setDetails(null)
    }
  }, [lead.id])

  const handleSearch = async () => {
    setState('searching')
    const q = [lead.razaoSocial, lead.enderecoCidade || lead.endereco?.split(',').pop()?.trim()].filter(Boolean).join(' ')
    const res = await placesSearch(q)
    setResults(res.slice(0, 5))
    setState('results')
  }

  const handleSelect = async (r: PlacesSearchResult) => {
    setState('loading_details')
    const d = await placesDetails(r.place_id)
    if (d && r.photos?.length) d.photoRefs = r.photos.slice(0, 2).map(p => p.photo_reference)
    setDetails(d)
    setState('done')
  }

  const handleReset = () => { setState('idle'); setResults([]); setDetails(null) }

  if (state === 'idle') {
    return (
      <div className="mt-4 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={handleSearch}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl transition-all"
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
          🔍 Cruzar dados no Google (telefone, site, Instagram...)
        </button>
        <p className="text-xs text-gray-400 mt-1">1 consulta por cliente — econômico</p>
      </div>
    )
  }

  if (state === 'searching' || state === 'loading_details') {
    return (
      <div className="mt-4 border-t border-gray-100 pt-4 flex items-center gap-2 text-sm text-blue-600">
        <span className="animate-spin">⏳</span>
        {state === 'searching' ? 'Buscando no Google Places...' : 'Carregando detalhes...'}
      </div>
    )
  }

  if (state === 'results') {
    return (
      <div className="mt-4 border-t border-gray-100 pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-blue-700">Qual desses é o cliente?</p>
          <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
        </div>
        {results.length === 0 && <p className="text-xs text-gray-500">Nenhum resultado encontrado.</p>}
        {results.map(r => (
          <button
            key={r.place_id}
            onClick={() => handleSelect(r)}
            className="w-full text-left px-3 py-2 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <p className="text-sm font-semibold text-gray-800">{r.name}</p>
            <p className="text-xs text-gray-500 truncate">{r.formatted_address || r.vicinity}</p>
            {r.rating && (
              <span className="text-xs text-amber-600 font-medium">⭐ {r.rating} ({r.user_ratings_total?.toLocaleString('pt-BR')} avaliações)</span>
            )}
          </button>
        ))}
      </div>
    )
  }

  if (state === 'done' && details) {
    return (
      <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
            <SparklesIcon className="h-3.5 w-3.5" /> Dados encontrados no Google
          </p>
          <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600">Nova busca</button>
        </div>

        {/* Fotos */}
        {details.photoRefs && details.photoRefs.length > 0 && (
          <div className="flex gap-2">
            {details.photoRefs.map((ref, i) => (
              <img key={i} src={placesPhotoUrl(ref, 200)} alt="" className="h-20 w-32 object-cover rounded-xl border border-gray-100 flex-shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Telefone */}
          {details.phone && (
            <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-xl border border-green-200">
              <PhoneIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-xs text-green-700 font-bold">Telefone</p>
                <a href={`tel:${details.phone}`} className="text-sm font-semibold text-green-900">{details.phone}</a>
              </div>
              <a href={`https://wa.me/${details.phone?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs bg-green-500 text-white px-2 py-1 rounded-lg hover:bg-green-600 whitespace-nowrap">
                <WhatsAppIcon variant="outline" className="h-3 w-3" /> WhatsApp
              </a>
            </div>
          )}

          {/* Site */}
          {details.website && (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-xl border border-blue-200">
              <GlobeAltIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-blue-700 font-bold">Site</p>
                <a href={details.website} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-semibold text-blue-900 hover:underline truncate block max-w-[160px]">
                  {details.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </div>
            </div>
          )}

          {/* Instagram hint */}
          {details.website?.includes('instagram.com') && (
            <div className="flex items-center gap-2 p-2.5 bg-pink-50 rounded-xl border border-pink-200">
              <span className="text-pink-500 text-lg">📸</span>
              <div className="min-w-0">
                <p className="text-xs text-pink-700 font-bold">Instagram</p>
                <a href={details.website} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-semibold text-pink-900 hover:underline truncate block max-w-[160px]">
                  {details.website.replace('https://www.instagram.com/', '@').replace(/\/$/, '')}
                </a>
              </div>
            </div>
          )}

          {/* Rating */}
          {details.rating && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200">
              <StarIcon className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-amber-700 font-bold">Avaliação Google</p>
                <p className="text-sm font-bold text-amber-900">{details.rating} <span className="text-xs font-normal text-amber-700">({details.totalRatings?.toLocaleString('pt-BR')} avaliações)</span></p>
              </div>
            </div>
          )}

          {/* Endereço */}
          {details.address && (
            <div className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-200 sm:col-span-2">
              <MapPinIcon className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs text-gray-600 font-bold">Endereço</p>
                <p className="text-sm text-gray-800">{details.address}</p>
              </div>
              {details.googleMapsUrl && (
                <a href={details.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-300 whitespace-nowrap flex-shrink-0">
                  🗺️ Maps
                </a>
              )}
            </div>
          )}

          {/* Horários */}
          {details.openingHours && details.openingHours.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-200 sm:col-span-2">
              <ClockIcon className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-600 font-bold mb-1">
                  Horários —{' '}
                  <span className={details.isOpen ? 'text-green-600' : 'text-red-500'}>
                    {details.isOpen ? 'Aberto agora ✅' : 'Fechado agora ❌'}
                  </span>
                </p>
                <div className="text-xs text-gray-600 space-y-0.5">
                  {details.openingHours.map((h, i) => <p key={i}>{h}</p>)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
// ─────────────────────────────────────────────────────────────────────────────

const ProspeccaoView: React.FC<{
  clientes: Cliente[]
  interacoes: Interacao[]
  templates: TemplateMsg[]
  cadencias: Cadencia[]
  campanhas: Campanha[]
  jobs: JobAutomacao[]
  onQuickAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
  onStartCampanha: (campanhaId: number) => void
  onRunJobNow: (jobId: number) => void
  onCreateTemplate: (t: TemplateMsg) => void
  onCreateCampanha: (c: Campanha) => void
}> = ({
  clientes, interacoes, templates, cadencias, campanhas, jobs,
  onQuickAction, onStartCampanha, onRunJobNow, onCreateTemplate, onCreateCampanha
}) => {
  const [tab, setTab] = React.useState<'painel' | 'fila' | 'campanhas' | 'cadencias' | 'templates'>('painel')
  const [query, setQuery] = React.useState('')
  const [selectedLeadId, setSelectedLeadId] = React.useState<number>(clientes[0]?.id ?? 0)
  React.useEffect(() => {
    if (clientes.length > 0 && !clientes.find(c => c.id === selectedLeadId)) {
      setSelectedLeadId(clientes[0].id)
    }
  }, [clientes])
  const selectedLead = clientes.find((c) => c.id === selectedLeadId) ?? null

  const [newTemplateNome, setNewTemplateNome] = React.useState('')
  const [newTemplateCanal, setNewTemplateCanal] = React.useState<Interacao['tipo']>('whatsapp')
  const [newTemplateConteudo, setNewTemplateConteudo] = React.useState('')

  const [newCampanhaNome, setNewCampanhaNome] = React.useState('')
  const [newCampanhaCadenciaId, setNewCampanhaCadenciaId] = React.useState<number>(cadencias[0]?.id ?? 0)
  React.useEffect(() => {
    if (cadencias.length > 0 && !cadencias.find(c => c.id === newCampanhaCadenciaId)) {
      setNewCampanhaCadenciaId(cadencias[0].id)
    }
  }, [cadencias])
  const [newCampanhaEtapa, setNewCampanhaEtapa] = React.useState<string>('')
  const [newCampanhaMinScore, setNewCampanhaMinScore] = React.useState<string>('')
  const [newCampanhaDiasInativo, setNewCampanhaDiasInativo] = React.useState<string>('')

  const filteredLeads = clientes.filter((c) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return c.razaoSocial.toLowerCase().includes(q) || (c.nomeFantasia || '').toLowerCase().includes(q) || c.contatoNome.toLowerCase().includes(q) || c.cnpj.includes(q)
  })

  const leadInteracoes = selectedLead ? interacoes.filter((i) => i.clienteId === selectedLead.id) : []
  const topLeads = [...clientes].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10)

  const badge = (status: string) => {
    switch (status) {
      case 'ativa': return 'bg-green-100 text-green-800'
      case 'pausada': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const jobBadge = (status: JobAutomacao['status']) => {
    switch (status) {
      case 'pendente': return 'bg-blue-100 text-blue-800'
      case 'enviado': return 'bg-green-100 text-green-800'
      case 'pausado': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-red-100 text-red-800'
    }
  }

  const TabButton: React.FC<{ id: typeof tab; label: string }> = ({ id, label }) => (
    <button onClick={() => setTab(id)} className={`px-3 py-2 text-sm font-medium rounded-apple transition-colors duration-200 ${tab === id ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}>
      {label}
    </button>
  )

  const createTemplate = () => {
    if (!newTemplateNome.trim() || !newTemplateConteudo.trim()) return
    onCreateTemplate({ id: Date.now(), canal: newTemplateCanal, nome: newTemplateNome.trim(), conteudo: newTemplateConteudo })
    setNewTemplateNome(''); setNewTemplateConteudo('')
  }

  const createCampanha = () => {
    if (!newCampanhaNome.trim()) return
    onCreateCampanha({
      id: Date.now(), nome: newCampanhaNome.trim(), cadenciaId: newCampanhaCadenciaId,
      etapa: newCampanhaEtapa.trim() ? newCampanhaEtapa.trim() : undefined,
      minScore: newCampanhaMinScore.trim() ? Number(newCampanhaMinScore) : undefined,
      diasInativoMin: newCampanhaDiasInativo.trim() ? Number(newCampanhaDiasInativo) : undefined,
      status: 'rascunho'
    })
    setNewCampanhaNome(''); setNewCampanhaEtapa(''); setNewCampanhaMinScore(''); setNewCampanhaDiasInativo('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Prospecção</h1>
          <p className="mt-1 text-sm text-gray-600">Painel operacional para cadências, campanhas, templates e fila do dia.</p>
        </div>
        <button
          onClick={() => {
            const sugestoes = clientes.map(cliente => {
              let acao = ''; let prioridade = 'media'
              if ((cliente.diasInativo || 0) > 30) { acao = `Urgente: Reativar ${cliente.razaoSocial} - ${cliente.diasInativo} dias inativo`; prioridade = 'alta' }
              else if (cliente.etapa === 'negociacao' && (cliente.score || 0) > 70) { acao = `Enviar proposta para ${cliente.razaoSocial} - Alta chance de conversão`; prioridade = 'alta' }
              else if (cliente.etapa === 'prospecção' && (cliente.score || 0) < 40) { acao = `Qualificar melhor ${cliente.razaoSocial} - Score baixo`; prioridade = 'baixa' }
              else if (cliente.etapa === 'amostra') { acao = `Follow-up amostra com ${cliente.razaoSocial}` }
              else { acao = `Manter contato com ${cliente.razaoSocial}` }
              return { cliente: cliente.razaoSocial, acao, prioridade }
            })
            const alta = sugestoes.filter(s => s.prioridade === 'alta').length
            const media = sugestoes.filter(s => s.prioridade === 'media').length
            const baixa = sugestoes.filter(s => s.prioridade === 'baixa').length
            const resumo = sugestoes.slice(0, 5).map(s => `• ${s.prioridade === 'alta' ? '🔴' : s.prioridade === 'media' ? '🟡' : '⚪'} ${s.acao}`).join('\n')
            alert(`✨ IA analisou ${clientes.length} clientes!\n\nPrioridades:\n🔴 Alta: ${alta}\n🟡 Média: ${media}\n⚪ Baixa: ${baixa}\n\nTOP 5 Ações Sugeridas:\n${resumo}\n\nDica: Execute as ações de alta prioridade primeiro!`)
          }}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-apple hover:from-purple-700 hover:to-blue-700 shadow-apple-sm flex items-center text-sm font-semibold"
        >
          <SparklesIcon className="h-4 w-4 mr-2" />
          IA Automatizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton id="painel" label="Painel do Lead" />
        <TabButton id="fila" label="Fila do dia" />
        <TabButton id="campanhas" label="Campanhas" />
        <TabButton id="cadencias" label="Cadências" />
        <TabButton id="templates" label="Templates" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 xl:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-900">Leads</div>
            <div className="text-xs text-gray-500">Top por score</div>
          </div>
          <div className="space-y-2">
            {topLeads.map((c) => (
              <button key={c.id} onClick={() => setSelectedLeadId(c.id)} className={`w-full text-left p-3 rounded-apple border transition-colors ${c.id === selectedLeadId ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 truncate">{c.razaoSocial}</div>
                  <div className="text-xs font-semibold text-gray-700">{c.score || 0}</div>
                </div>
                <div className="text-xs text-gray-600 mt-1 truncate">{c.contatoNome}</div>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar lead..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
              {filteredLeads.slice(0, 20).map((c) => (
                <button key={c.id} onClick={() => setSelectedLeadId(c.id)} className="w-full text-left px-3 py-2 text-sm rounded-apple hover:bg-gray-50 border border-transparent">{c.razaoSocial}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          {tab === 'painel' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900">{selectedLead?.razaoSocial || 'Selecione um lead'}</div>
                  {selectedLead && <div className="text-sm text-gray-600 mt-1">{selectedLead.contatoNome} • {selectedLead.contatoEmail} • {selectedLead.contatoTelefone}</div>}
                </div>
                {selectedLead && <div className="text-right"><div className="text-xs text-gray-500">Score</div><div className="text-lg font-bold text-gray-900">{selectedLead.score || 0}</div></div>}
              </div>
              {selectedLead && <LeadPlacesEnrich lead={selectedLead} />}
              {selectedLead && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="rounded-apple border border-gray-200 p-4">
                    <div className="text-sm font-semibold text-gray-900">Ações rápidas</div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={() => onQuickAction(selectedLead, 'whatsapp', 'contato')} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Contato WhatsApp</button>
                      <button onClick={() => onQuickAction(selectedLead, 'email', 'contato')} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Contato Email</button>
                      <button onClick={() => onQuickAction(selectedLead, 'linkedin', 'contato')} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Contato LinkedIn</button>
                      <button onClick={() => onQuickAction(selectedLead, 'instagram', 'contato')} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Contato Instagram</button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={() => onQuickAction(selectedLead, 'whatsapp', 'propaganda')} className="px-3 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm">Propaganda WhatsApp</button>
                      <button onClick={() => onQuickAction(selectedLead, 'email', 'propaganda')} className="px-3 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm">Propaganda Email</button>
                      <button onClick={() => onQuickAction(selectedLead, 'linkedin', 'propaganda')} className="px-3 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm">Propaganda LinkedIn</button>
                      <button onClick={() => onQuickAction(selectedLead, 'instagram', 'propaganda')} className="px-3 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm">Propaganda Instagram</button>
                    </div>
                  </div>
                  <div className="rounded-apple border border-gray-200 p-4">
                    <div className="text-sm font-semibold text-gray-900">Próxima ação sugerida</div>
                    <div className="text-sm text-gray-700 mt-3">{(selectedLead.diasInativo || 0) > 15 ? 'Lead inativo: sugerido follow-up por WhatsApp + Email.' : 'Lead ativo: sugerido contato consultivo e envio de catálogo.'}</div>
                    <div className="text-xs text-gray-500 mt-2">Inatividade: {selectedLead.diasInativo ?? '-'} dias • Etapa: {selectedLead.etapa}</div>
                  </div>
                </div>
              )}
              <div className="mt-6">
                <div className="text-sm font-semibold text-gray-900">Timeline</div>
                <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                  {leadInteracoes.length === 0 && <div className="text-sm text-gray-500">Sem interações ainda.</div>}
                  {leadInteracoes.map((i) => (
                    <div key={i.id} className="p-3 rounded-apple border border-gray-200 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-700">{i.tipo.toUpperCase()}</div>
                        <div className="text-xs text-gray-500">{new Date(i.data).toLocaleString('pt-BR')}</div>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{i.descricao}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'fila' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="text-lg font-semibold text-gray-900">Fila do dia</div>
              <div className="text-sm text-gray-600 mt-1">Jobs pendentes para execução manual.</div>
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-apple text-xs text-yellow-800">⚠️ <strong>MVP:</strong> Os jobs são registros de ações planejadas. Clique "Executar" para registrar a interação no CRM. O envio real (WhatsApp/Email) requer integração futura.</div>
              <div className="mt-4 space-y-2">
                {jobs.length === 0 && <div className="text-sm text-gray-500">Sem jobs agendados ainda.</div>}
                {jobs.slice(0, 30).map((j) => {
                  const lead = clientes.find((c) => c.id === j.clienteId)
                  return (
                    <div key={j.id} className="flex items-center justify-between p-3 rounded-apple border border-gray-200">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{lead?.razaoSocial || `Lead ${j.clienteId}`}</div>
                        <div className="text-xs text-gray-600">{j.tipo} • {j.canal.toUpperCase()} • {new Date(j.agendadoPara).toLocaleString('pt-BR')}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${jobBadge(j.status)}`}>{j.status}</span>
                        <button disabled={j.status !== 'pendente'} onClick={() => onRunJobNow(j.id)} className="px-3 py-2 text-sm bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-300">Executar</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'campanhas' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div><div className="text-lg font-semibold text-gray-900">Campanhas</div><div className="text-sm text-gray-600 mt-1">Defina audiência e inicie uma cadência.</div></div>
              </div>
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-apple text-xs text-yellow-800">⚠️ <strong>MVP:</strong> Campanhas agendam jobs na fila, mas o envio é manual. Vá na aba "Fila" e clique "Executar" para disparar cada ação.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">Nova campanha</div>
                  <div className="mt-3 space-y-3">
                    <input value={newCampanhaNome} onChange={(e) => setNewCampanhaNome(e.target.value)} placeholder="Nome" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <select value={newCampanhaCadenciaId} onChange={(e) => setNewCampanhaCadenciaId(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-apple">
                      {cadencias.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                    </select>
                    <input value={newCampanhaEtapa} onChange={(e) => setNewCampanhaEtapa(e.target.value)} placeholder="Filtro etapa (opcional)" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <input value={newCampanhaMinScore} onChange={(e) => setNewCampanhaMinScore(e.target.value)} placeholder="Score mínimo (opcional)" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <input value={newCampanhaDiasInativo} onChange={(e) => setNewCampanhaDiasInativo(e.target.value)} placeholder="Dias inativo mínimo (opcional)" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <button onClick={createCampanha} className="w-full px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700">Criar</button>
                  </div>
                </div>
                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">Campanhas existentes</div>
                  <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                    {campanhas.map((c) => (
                      <div key={c.id} className="p-3 rounded-apple border border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900">{c.nome}</div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${badge(c.status)}`}>{c.status}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">Cadência: {cadencias.find(x => x.id === c.cadenciaId)?.nome || c.cadenciaId}</div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button onClick={() => { if (window.confirm('Isso vai criar jobs na fila. Os envios devem ser executados manualmente na aba Fila. Continuar?')) onStartCampanha(c.id) }} className="px-3 py-2 text-sm bg-primary-600 text-white rounded-apple hover:bg-primary-700">Iniciar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'cadencias' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="text-lg font-semibold text-gray-900">Cadências</div>
              <div className="text-sm text-gray-600 mt-1">Sequências de prospecção (layout). Edição avançada pode vir depois.</div>
              <div className="mt-4 space-y-3">
                {cadencias.map((c) => (
                  <div key={c.id} className="rounded-apple border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">{c.nome}</div>
                      <div className="text-xs text-gray-500">Pausa ao responder: {c.pausarAoResponder ? 'sim' : 'não'}</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {c.steps.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-apple px-3 py-2">
                          <div>Dia +{s.delayDias} • {s.canal.toUpperCase()}</div>
                          <div className="text-gray-500">Template: {templates.find(t => t.id === s.templateId)?.nome || s.templateId}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'templates' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">Novo template</div>
                  <div className="mt-3 space-y-3">
                    <input value={newTemplateNome} onChange={(e) => setNewTemplateNome(e.target.value)} placeholder="Nome" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <select value={newTemplateCanal} onChange={(e) => setNewTemplateCanal(e.target.value as Interacao['tipo'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple">
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="instagram">Instagram</option>
                      <option value="linkedin">LinkedIn</option>
                    </select>
                    <textarea value={newTemplateConteudo} onChange={(e) => setNewTemplateConteudo(e.target.value)} rows={6} placeholder="Conteúdo (use {nome}, {empresa})" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <button onClick={createTemplate} className="w-full px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700">Criar</button>
                  </div>
                </div>
                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">Templates existentes</div>
                  <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                    {templates.map((t) => (
                      <div key={t.id} className="p-3 rounded-apple border border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900">{t.nome}</div>
                          <div className="text-xs text-gray-500">{t.canal.toUpperCase()}</div>
                        </div>
                        <div className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{t.conteudo}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProspeccaoView
