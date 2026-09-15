import React, { useEffect, useState } from 'react'
import {
  ClipboardDocumentIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import { authFetch } from '../../lib/botApi'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

interface LinkCandidato {
  id: number
  token: string
  nomeCandidato: string
  validoDe: string
  validoAte: string
  ativo: boolean
  status: 'ativo' | 'expirado' | 'revogado'
  createdAt: string
  sessoes: number
  ultimaAtividade: string | null
  tempoSegundos: number
}

interface SessaoCandidato {
  id: number
  modulo: string
  perfil_nome: string
  mensagens: Array<{ role: string; content: string }>
  duracao_segundos: number
  nota: number | null
  feedback: string
  created_at: string
}

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtDur = (s: number) => `${Math.floor(s / 60)}min`
const fmtTempoTotal = (s: number) => {
  if (!s) return '0min'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
}

const statusChip = (status: string) => {
  if (status === 'ativo') return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
  if (status === 'expirado') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
  return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
}

export default function AcademiaCandidatosPanel() {
  const [links, setLinks] = useState<LinkCandidato[]>([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [dias, setDias] = useState('7')
  const [criando, setCriando] = useState(false)
  const [copiado, setCopiado] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [expandido, setExpandido] = useState<number | null>(null)
  const [sessoesDetalhe, setSessoesDetalhe] = useState<Record<number, SessaoCandidato[]>>({})
  const [loadingSessoes, setLoadingSessoes] = useState(false)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await authFetch(`${BOT_URL}/api/academia/gerente/links`)
      const j = await r.json()
      setLinks(j.links || [])
    } catch { setErro('Não foi possível carregar os links.') }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const gerarLink = async () => {
    if (!nome.trim() || criando) return
    setCriando(true)
    setErro('')
    try {
      const r = await authFetch(`${BOT_URL}/api/academia/gerente/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeCandidato: nome.trim(), diasValidade: Number(dias) || 7 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro ao gerar link')
      setNome('')
      await carregar()
      copiarLink(j.link)
    } catch (e: any) { setErro(e?.message || 'Erro ao gerar link') }
    setCriando(false)
  }

  const urlDoLink = (l: LinkCandidato) => `${window.location.origin}/academia?token=${l.token}`

  const copiarLink = async (l: LinkCandidato) => {
    try {
      await navigator.clipboard.writeText(urlDoLink(l))
      setCopiado(l.id)
      setTimeout(() => setCopiado(null), 2500)
    } catch { /* clipboard bloqueado — mostra o link na listagem */ }
  }

  const revogar = async (l: LinkCandidato) => {
    try {
      await authFetch(`${BOT_URL}/api/academia/gerente/links/${l.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      await carregar()
    } catch { setErro('Não foi possível revogar o link.') }
  }

  const toggleDetalhe = async (l: LinkCandidato) => {
    if (expandido === l.id) { setExpandido(null); return }
    setExpandido(l.id)
    if (sessoesDetalhe[l.id]) return
    setLoadingSessoes(true)
    try {
      const r = await authFetch(`${BOT_URL}/api/academia/gerente/links/${l.id}/sessoes`)
      const j = await r.json()
      setSessoesDetalhe(prev => ({ ...prev, [l.id]: j.sessoes || [] }))
    } catch { /* ignora */ }
    setLoadingSessoes(false)
  }

  const notaMedia = (sessoes: SessaoCandidato[]) => {
    const comNota = sessoes.filter(s => s.nota != null)
    if (!comNota.length) return null
    return (comNota.reduce((a, b) => a + (b.nota || 0), 0) / comNota.length).toFixed(1)
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-primary-500" /> Academia de Candidatos
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Gere links temporários para candidatos treinarem na Academia de Vendas — sem criar login no CRM.
        </p>
      </div>

      {/* Gerar novo link */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <LinkIcon className="h-4 w-4" /> Novo link de acesso
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Nome do candidato"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={dias}
            onChange={e => setDias(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="3">Válido por 3 dias</option>
            <option value="7">Válido por 7 dias</option>
            <option value="14">Válido por 14 dias</option>
            <option value="30">Válido por 30 dias</option>
          </select>
          <button
            onClick={gerarLink}
            disabled={!nome.trim() || criando}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          >
            <PlusIcon className="h-4 w-4" /> {criando ? 'Gerando...' : 'Gerar e copiar'}
          </button>
        </div>
        {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
      </div>

      {/* Lista de candidatos */}
      {loading ? (
        <div className="text-center py-10 text-sm text-gray-400">Carregando...</div>
      ) : links.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
          <LinkIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum link gerado ainda.</p>
          <p className="text-xs text-gray-400 mt-1">Gere um link acima e envie ao candidato pelo WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map(l => {
            const det = sessoesDetalhe[l.id]
            const media = det ? notaMedia(det) : null
            return (
              <div key={l.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{l.nomeCandidato}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusChip(l.status)}`}>
                          {l.status === 'ativo' ? 'Ativo' : l.status === 'expirado' ? 'Expirado' : 'Revogado'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {fmtData(l.validoDe)} → {fmtData(l.validoAte)}
                        {l.ultimaAtividade && ` · último treino ${fmtHora(l.ultimaAtividade)}`}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <span><strong className="text-gray-700 dark:text-gray-200">{l.sessoes}</strong> treino(s)</span>
                        <span><strong className="text-gray-700 dark:text-gray-200">{fmtTempoTotal(l.tempoSegundos)}</strong> treinando</span>
                        {media && <span>Média <strong className="text-gray-700 dark:text-gray-200">{media}</strong></span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {l.status === 'ativo' && (
                        <button onClick={() => copiarLink(l)} title="Copiar link"
                          className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors">
                          <ClipboardDocumentIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => toggleDetalhe(l)} title="Ver treinos"
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        {expandido === l.id ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                      </button>
                      {l.ativo && (
                        <button onClick={() => revogar(l)} title="Revogar acesso"
                          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {copiado === l.id && (
                    <p className="text-[11px] text-green-600 font-medium mt-1.5">✓ Link copiado — envie pelo WhatsApp</p>
                  )}
                  {l.status === 'ativo' && (
                    <p className="text-[10px] text-gray-400 font-mono mt-1.5 truncate select-all">{urlDoLink(l)}</p>
                  )}
                </div>

                {/* Detalhe: sessões do candidato */}
                {expandido === l.id && (
                  <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3">
                    {loadingSessoes && !det ? (
                      <p className="text-xs text-gray-400">Carregando treinos...</p>
                    ) : !det || det.length === 0 ? (
                      <p className="text-xs text-gray-400">O candidato ainda não fez nenhum treino.</p>
                    ) : (
                      <div className="space-y-2">
                        {det.map(s => {
                          let fb: any = null
                          try { fb = typeof s.feedback === 'string' ? JSON.parse(s.feedback) : s.feedback } catch { /* */ }
                          return (
                            <div key={s.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                              <div className="flex items-center gap-3">
                                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${(s.nota ?? 0) >= 9 ? 'bg-green-100 text-green-700' : (s.nota ?? 0) >= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                  {s.nota ?? '—'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{s.modulo}</p>
                                  <p className="text-[10px] text-gray-400">
                                    {s.perfil_nome} · {fmtDur(s.duracao_segundos)} · {fmtHora(s.created_at)} · {s.mensagens?.length || 0} msgs
                                  </p>
                                </div>
                              </div>
                              {fb?.feedback_geral && (
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed border-t border-gray-100 dark:border-gray-700 pt-2">{fb.feedback_geral}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
