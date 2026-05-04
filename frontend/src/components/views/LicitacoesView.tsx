import React from 'react'
import {
  MagnifyingGlassIcon, ArrowPathIcon, BuildingOfficeIcon,
  ArrowTopRightOnSquareIcon, PlusCircleIcon, Cog6ToothIcon,
  CheckCircleIcon, ClockIcon, TrophyIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import type { Cliente, Vendedor } from '../../types'
import {
  buscarContratacoesPorPublicacao, buscarPropostasAbertas,
  buscarItensContratacao, buscarResultadoContratacao,
  filtrarPorPalavraChave, getLinkPNCP, PALAVRAS_CHAVE_PADRAO,
  MODALIDADES, UF_SIGLAS,
  type PncpContratacao, type PncpItem,
} from '../../lib/pncpApi'

interface LicitacoesViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  onNovoCliente?: (dados: Partial<{ razaoSocial: string; cnpj: string; enderecoCidade: string; enderecoEstado: string }>) => void
}

type Aba = 'abertas' | 'resultados' | 'config'

interface ConfigLicitacoes {
  palavras: string[]
  ufs: string[]
  diasBusca: number
}

interface ItemExpandido {
  [key: string]: PncpItem[]
}

interface ResultadoExpandido {
  [key: string]: Array<PncpItem & { niFornecedor?: string; nomeRazaoSocialFornecedor?: string }>
}

const CONFIG_KEY = 'crm_licitacoes_config'

function loadConfig(): ConfigLicitacoes {
  try {
    const s = localStorage.getItem(CONFIG_KEY)
    if (s) return JSON.parse(s)
  } catch { /* ignore */ }
  return { palavras: PALAVRAS_CHAVE_PADRAO, ufs: [], diasBusca: 30 }
}

function saveConfig(c: ConfigLicitacoes) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
}

function fmtBRL(v?: number) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function fmtData(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR')
}

function situacaoBadge(id: number, nome: string) {
  if (id === 1) return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">{nome}</span>
  if (id === 2) return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">{nome}</span>
  if (id === 3) return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">{nome}</span>
  return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">{nome}</span>
}

export default function LicitacoesView({ loggedUser, onNovoCliente }: LicitacoesViewProps) {
  const [aba, setAba] = React.useState<Aba>('abertas')
  const [config, setConfig] = React.useState<ConfigLicitacoes>(loadConfig)

  // Abertas
  const [abertas, setAbertas] = React.useState<PncpContratacao[]>([])
  const [loadingAbertas, setLoadingAbertas] = React.useState(false)
  const [erroAbertas, setErroAbertas] = React.useState('')
  const [paginaAbertas, setPaginaAbertas] = React.useState(1)
  const [totalAbertas, setTotalAbertas] = React.useState(0)
  const [itensExpandidos, setItensExpandidos] = React.useState<ItemExpandido>({})
  const [loadingItens, setLoadingItens] = React.useState<Record<string, boolean>>({})

  // Resultados / vencedores
  const [resultados, setResultados] = React.useState<PncpContratacao[]>([])
  const [loadingResultados, setLoadingResultados] = React.useState(false)
  const [erroResultados, setErroResultados] = React.useState('')
  const [paginaResultados, setPaginaResultados] = React.useState(1)
  const [totalResultados, setTotalResultados] = React.useState(0)
  const [resultadosExpandidos, setResultadosExpandidos] = React.useState<ResultadoExpandido>({})
  const [loadingResultadosExp, setLoadingResultadosExp] = React.useState<Record<string, boolean>>({})

  // Config form
  const [novaPalavra, setNovaPalavra] = React.useState('')
  const [configUfTemp, setConfigUfTemp] = React.useState<string[]>(config.ufs)
  const [configPalavrasTemp, setConfigPalavrasTemp] = React.useState<string[]>(config.palavras)
  const [configDiasTemp, setConfigDiasTemp] = React.useState(config.diasBusca)

  // toast
  const [toast, setToast] = React.useState<{ tipo: 'success' | 'error'; msg: string } | null>(null)
  const showToast = (tipo: 'success' | 'error', msg: string) => {
    setToast({ tipo, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const buscarAbertas = React.useCallback(async (pagina = 1) => {
    setLoadingAbertas(true)
    setErroAbertas('')
    try {
      const hoje = new Date()
      const results: PncpContratacao[] = []
      let total = 0

      // Busca propostas com recebimento ainda aberto
      const ufsParaBuscar = config.ufs.length > 0 ? config.ufs : [undefined]
      for (const uf of ufsParaBuscar.slice(0, 5)) { // max 5 UFs por vez para não sobrecarregar
        try {
          const r = await buscarPropostasAbertas({
            dataFinal: hoje,
            ufSigla: uf as string | undefined,
            pagina,
            tamanhoPagina: 50,
          })
          const filtrados = filtrarPorPalavraChave(r.data ?? [], config.palavras)
          results.push(...filtrados)
          total = Math.max(total, r.totalRegistros)
        } catch { /* ignora erro de UF específica */ }
      }

      setAbertas(results)
      setTotalAbertas(total)
      setPaginaAbertas(pagina)
    } catch (e: any) {
      setErroAbertas(e.message ?? 'Erro ao buscar licitações')
    } finally {
      setLoadingAbertas(false)
    }
  }, [config])

  const buscarResultados = React.useCallback(async (pagina = 1) => {
    setLoadingResultados(true)
    setErroResultados('')
    try {
      const hoje = new Date()
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - config.diasBusca)
      const results: PncpContratacao[] = []
      let total = 0

      const ufsParaBuscar = config.ufs.length > 0 ? config.ufs : [undefined]
      for (const uf of ufsParaBuscar.slice(0, 5)) {
        try {
          const r = await buscarContratacoesPorPublicacao({
            dataInicial: inicio,
            dataFinal: hoje,
            ufSigla: uf as string | undefined,
            pagina,
            tamanhoPagina: 50,
          })
          const filtrados = filtrarPorPalavraChave(r.data ?? [], config.palavras)
          results.push(...filtrados)
          total = Math.max(total, r.totalRegistros)
        } catch { /* ignora erro de UF específica */ }
      }

      setResultados(results)
      setTotalResultados(total)
      setPaginaResultados(pagina)
    } catch (e: any) {
      setErroResultados(e.message ?? 'Erro ao buscar resultados')
    } finally {
      setLoadingResultados(false)
    }
  }, [config])

  React.useEffect(() => {
    if (aba === 'abertas' && abertas.length === 0) buscarAbertas()
    if (aba === 'resultados' && resultados.length === 0) buscarResultados()
  }, [aba])

  const expandirItens = async (c: PncpContratacao) => {
    const key = c.numeroControlePNCP
    if (itensExpandidos[key]) {
      setItensExpandidos(prev => { const n = { ...prev }; delete n[key]; return n })
      return
    }
    setLoadingItens(prev => ({ ...prev, [key]: true }))
    try {
      const r = await buscarItensContratacao({
        cnpj: c.orgaoEntidade.cnpj,
        anoCompra: c.anoCompra,
        sequencialCompra: c.sequencialCompra,
      })
      setItensExpandidos(prev => ({ ...prev, [key]: r.data ?? [] }))
    } catch {
      setItensExpandidos(prev => ({ ...prev, [key]: [] }))
    } finally {
      setLoadingItens(prev => ({ ...prev, [key]: false }))
    }
  }

  const expandirResultado = async (c: PncpContratacao) => {
    const key = c.numeroControlePNCP
    if (resultadosExpandidos[key]) {
      setResultadosExpandidos(prev => { const n = { ...prev }; delete n[key]; return n })
      return
    }
    setLoadingResultadosExp(prev => ({ ...prev, [key]: true }))
    try {
      const r = await buscarResultadoContratacao({
        cnpj: c.orgaoEntidade.cnpj,
        anoCompra: c.anoCompra,
        sequencialCompra: c.sequencialCompra,
      })
      setResultadosExpandidos(prev => ({ ...prev, [key]: r.data ?? [] }))
    } catch {
      setResultadosExpandidos(prev => ({ ...prev, [key]: [] }))
    } finally {
      setLoadingResultadosExp(prev => ({ ...prev, [key]: false }))
    }
  }

  const criarLead = (c: PncpContratacao) => {
    if (!onNovoCliente) return
    onNovoCliente({
      razaoSocial: c.orgaoEntidade.razaoSocial,
      cnpj: c.orgaoEntidade.cnpj,
      enderecoCidade: c.unidadeOrgao.municipioNome,
      enderecoEstado: c.unidadeOrgao.ufSigla,
    })
    showToast('success', `Abrindo modal para: ${c.orgaoEntidade.razaoSocial}`)
  }

  const salvarConfig = () => {
    const nova: ConfigLicitacoes = {
      palavras: configPalavrasTemp,
      ufs: configUfTemp,
      diasBusca: configDiasTemp,
    }
    setConfig(nova)
    saveConfig(nova)
    setAbertas([])
    setResultados([])
    showToast('success', 'Configurações salvas!')
  }

  const toggleUf = (uf: string) => {
    setConfigUfTemp(prev => prev.includes(uf) ? prev.filter(u => u !== uf) : [...prev, uf])
  }

  const addPalavra = () => {
    const t = novaPalavra.trim().toLowerCase()
    if (!t || configPalavrasTemp.includes(t)) return
    setConfigPalavrasTemp(prev => [...prev, t])
    setNovaPalavra('')
  }

  const removePalavra = (p: string) => setConfigPalavrasTemp(prev => prev.filter(x => x !== p))

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-apple shadow-lg text-sm font-medium flex items-center gap-2 ${toast.tipo === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.tipo === 'success' ? <CheckCircleIcon className="h-4 w-4" /> : <XMarkIcon className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🏛️ Licitações Públicas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Monitoramento via Portal Nacional de Contratações Públicas (PNCP)</p>
          </div>
          <div className="flex gap-2">
            {aba === 'abertas' && (
              <button onClick={() => buscarAbertas(1)} disabled={loadingAbertas}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-sm font-medium disabled:opacity-50">
                <ArrowPathIcon className={`h-4 w-4 ${loadingAbertas ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            )}
            {aba === 'resultados' && (
              <button onClick={() => buscarResultados(1)} disabled={loadingResultados}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-sm font-medium disabled:opacity-50">
                <ArrowPathIcon className={`h-4 w-4 ${loadingResultados ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            )}
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-0 mt-4 border-b border-gray-200 -mb-px">
          {[
            { id: 'abertas', label: '📋 Oportunidades Abertas', count: abertas.length },
            { id: 'resultados', label: '🏆 Empresas Vencedoras', count: resultados.length },
            { id: 'config', label: '⚙️ Configuração', count: null },
          ].map(tab => (
            <button key={tab.id} onClick={() => setAba(tab.id as Aba)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${aba === tab.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="bg-primary-100 text-primary-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── ABA OPORTUNIDADES ABERTAS ── */}
        {aba === 'abertas' && (
          <div className="space-y-3">
            {config.palavras.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="text-xs text-gray-500 self-center">Filtrando por:</span>
                {config.palavras.map(p => (
                  <span key={p} className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full font-medium">{p}</span>
                ))}
                {config.ufs.length > 0 && config.ufs.map(u => (
                  <span key={u} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">{u}</span>
                ))}
              </div>
            )}

            {loadingAbertas && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ArrowPathIcon className="h-10 w-10 animate-spin mb-3" />
                <p className="text-sm">Buscando licitações no PNCP...</p>
              </div>
            )}

            {erroAbertas && !loadingAbertas && (
              <div className="bg-red-50 border border-red-200 rounded-apple p-4 text-sm text-red-700">
                ⚠️ {erroAbertas}
              </div>
            )}

            {!loadingAbertas && !erroAbertas && abertas.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <MagnifyingGlassIcon className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhuma licitação encontrada</p>
                <p className="text-xs mt-1">Clique em "Atualizar" para buscar ou ajuste as palavras-chave em Configuração</p>
              </div>
            )}

            {abertas.map(c => (
              <div key={c.numeroControlePNCP} className="bg-white border border-gray-200 rounded-apple shadow-sm hover:border-primary-300 transition-colors">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {situacaoBadge(c.situacaoCompraId, c.situacaoCompraNome)}
                        <span className="text-xs text-gray-500">{MODALIDADES[c.modalidadeId] ?? c.modalidadeNome}</span>
                        <span className="text-xs text-gray-400">#{c.numeroControlePNCP}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 line-clamp-2">{c.objetoCompra}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <BuildingOfficeIcon className="h-3.5 w-3.5" />
                          {c.orgaoEntidade.razaoSocial}
                        </span>
                        <span className="text-xs text-gray-500">📍 {c.unidadeOrgao.municipioNome} — {c.unidadeOrgao.ufSigla}</span>
                        {c.dataEncerramentoProposta && (
                          <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                            <ClockIcon className="h-3.5 w-3.5" />
                            Encerra: {fmtData(c.dataEncerramentoProposta)}
                          </span>
                        )}
                        {c.valorTotalEstimado && (
                          <span className="text-xs font-semibold text-green-700">💰 {fmtBRL(c.valorTotalEstimado)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <a href={getLinkPNCP(c)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 hover:border-primary-400 rounded-apple text-xs font-medium text-gray-700 hover:text-primary-700">
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        PNCP
                      </a>
                      {onNovoCliente && (
                        <button onClick={() => criarLead(c)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-xs font-medium">
                          <PlusCircleIcon className="h-3.5 w-3.5" />
                          Criar Lead
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandir Itens */}
                  <button onClick={() => expandirItens(c)}
                    className="mt-2 text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1">
                    {loadingItens[c.numeroControlePNCP] ? (
                      <ArrowPathIcon className="h-3 w-3 animate-spin" />
                    ) : itensExpandidos[c.numeroControlePNCP] ? '▲ Ocultar itens' : '▼ Ver itens da licitação'}
                  </button>

                  {itensExpandidos[c.numeroControlePNCP] && (
                    <div className="mt-2 border-t border-gray-100 pt-2 space-y-1">
                      {itensExpandidos[c.numeroControlePNCP].length === 0 ? (
                        <p className="text-xs text-gray-400">Sem itens disponíveis.</p>
                      ) : itensExpandidos[c.numeroControlePNCP].map(item => (
                        <div key={item.numeroItem} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                          <span className="text-gray-700"><span className="font-semibold text-gray-500">#{item.numeroItem}</span> {item.descricao}</span>
                          <div className="flex gap-3 shrink-0 text-gray-500">
                            {item.quantidade && <span>{item.quantidade} {item.unidadeMedida}</span>}
                            {item.valorUnitarioEstimado && <span className="text-green-700 font-medium">{fmtBRL(item.valorUnitarioEstimado)}/un</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {abertas.length > 0 && (
              <p className="text-center text-xs text-gray-400 pt-2">
                Mostrando {abertas.length} licitações filtradas · Total no PNCP: {totalAbertas.toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* ── ABA VENCEDORES ── */}
        {aba === 'resultados' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className="text-xs text-gray-500 self-center">Últimos {config.diasBusca} dias · Filtrando por:</span>
              {config.palavras.map(p => (
                <span key={p} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">{p}</span>
              ))}
            </div>

            {loadingResultados && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ArrowPathIcon className="h-10 w-10 animate-spin mb-3" />
                <p className="text-sm">Buscando resultados no PNCP...</p>
              </div>
            )}

            {erroResultados && !loadingResultados && (
              <div className="bg-red-50 border border-red-200 rounded-apple p-4 text-sm text-red-700">
                ⚠️ {erroResultados}
              </div>
            )}

            {!loadingResultados && !erroResultados && resultados.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <TrophyIcon className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhum resultado encontrado</p>
                <p className="text-xs mt-1">Clique em "Atualizar" para buscar ou amplie o período em Configuração</p>
              </div>
            )}

            {resultados.map(c => (
              <div key={c.numeroControlePNCP} className="bg-white border border-gray-200 rounded-apple shadow-sm hover:border-amber-300 transition-colors">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {situacaoBadge(c.situacaoCompraId, c.situacaoCompraNome)}
                        <span className="text-xs text-gray-500">{MODALIDADES[c.modalidadeId] ?? c.modalidadeNome}</span>
                        <span className="text-xs text-gray-400">Publicado: {fmtData(c.dataPublicacaoPncp)}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 line-clamp-2">{c.objetoCompra}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <BuildingOfficeIcon className="h-3.5 w-3.5" />
                          {c.orgaoEntidade.razaoSocial}
                        </span>
                        <span className="text-xs text-gray-500">📍 {c.unidadeOrgao.municipioNome} — {c.unidadeOrgao.ufSigla}</span>
                        {c.valorTotalHomologado && (
                          <span className="text-xs font-semibold text-amber-700">🏆 {fmtBRL(c.valorTotalHomologado)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <a href={getLinkPNCP(c)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 hover:border-amber-400 rounded-apple text-xs font-medium text-gray-700 hover:text-amber-700">
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        PNCP
                      </a>
                      {onNovoCliente && (
                        <button onClick={() => criarLead(c)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-xs font-medium">
                          <PlusCircleIcon className="h-3.5 w-3.5" />
                          Lead Órgão
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandir vencedores */}
                  <button onClick={() => expandirResultado(c)}
                    className="mt-2 text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1">
                    {loadingResultadosExp[c.numeroControlePNCP] ? (
                      <ArrowPathIcon className="h-3 w-3 animate-spin" />
                    ) : resultadosExpandidos[c.numeroControlePNCP] ? '▲ Ocultar vencedores' : '▼ Ver empresas vencedoras'}
                  </button>

                  {resultadosExpandidos[c.numeroControlePNCP] && (
                    <div className="mt-2 border-t border-gray-100 pt-2 space-y-1">
                      {resultadosExpandidos[c.numeroControlePNCP].length === 0 ? (
                        <p className="text-xs text-gray-400">Sem dados de resultado disponíveis.</p>
                      ) : resultadosExpandidos[c.numeroControlePNCP].map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-amber-50 rounded px-2 py-1.5">
                          <div>
                            <span className="font-semibold text-gray-800">{item.nomeRazaoSocialFornecedor ?? '—'}</span>
                            {item.niFornecedor && <span className="text-gray-500 ml-2">CNPJ: {item.niFornecedor}</span>}
                            <span className="text-gray-600 block">{item.descricao}</span>
                          </div>
                          {item.valorTotal && (
                            <span className="text-amber-700 font-semibold shrink-0 ml-3">{fmtBRL(item.valorTotal)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {resultados.length > 0 && (
              <p className="text-center text-xs text-gray-400 pt-2">
                Mostrando {resultados.length} licitações filtradas · Total no PNCP: {totalResultados.toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* ── ABA CONFIGURAÇÃO ── */}
        {aba === 'config' && (
          <div className="max-w-xl space-y-6">

            {/* Palavras-chave */}
            <div className="bg-white border border-gray-200 rounded-apple p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <MagnifyingGlassIcon className="h-4 w-4 text-primary-600" />
                Palavras-chave para filtrar
              </h3>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {configPalavrasTemp.map(p => (
                  <span key={p} className="flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-full font-medium">
                    {p}
                    <button onClick={() => removePalavra(p)} className="hover:text-red-500 ml-0.5">✕</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={novaPalavra} onChange={e => setNovaPalavra(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPalavra() } }}
                  placeholder="Ex: achocolatado em pó"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <button onClick={addPalavra}
                  className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-sm font-medium">
                  + Adicionar
                </button>
              </div>
            </div>

            {/* Filtro por UF */}
            <div className="bg-white border border-gray-200 rounded-apple p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                <BuildingOfficeIcon className="h-4 w-4 text-primary-600" />
                Filtrar por Estado (UF)
              </h3>
              <p className="text-xs text-gray-500 mb-3">Deixe em branco para buscar em todo o Brasil (mais lento).</p>
              <div className="flex flex-wrap gap-1.5">
                {UF_SIGLAS.map(uf => (
                  <button key={uf} onClick={() => toggleUf(uf)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${configUfTemp.includes(uf) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}>
                    {uf}
                  </button>
                ))}
              </div>
            </div>

            {/* Período */}
            <div className="bg-white border border-gray-200 rounded-apple p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-primary-600" />
                Período de busca (aba Vencedoras)
              </h3>
              <div className="flex items-center gap-3">
                <input type="range" min={7} max={90} step={7} value={configDiasTemp}
                  onChange={e => setConfigDiasTemp(Number(e.target.value))}
                  className="flex-1 accent-primary-600" />
                <span className="text-sm font-semibold text-primary-700 w-20">Últimos {configDiasTemp}d</span>
              </div>
            </div>

            <button onClick={salvarConfig}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-sm font-semibold">
              <Cog6ToothIcon className="h-4 w-4" />
              Salvar e Aplicar
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
