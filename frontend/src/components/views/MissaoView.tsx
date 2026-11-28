import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  PlusIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  MapPinIcon,
  FlagIcon,
  ArrowUpTrayIcon,
  MicrophoneIcon,
  TrashIcon,
  ArrowsUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { authFetch, BOT_URL } from '../../lib/botApi'
import { clienteFromDb } from '../../lib/database'
import {
  CLASSES_DESPESA_MISSAO,
  CLASSE_DESPESA_LABEL,
  calcularCustoPrevistoMissao,
  calcularDiasMissao,
  calcularKmRoteiroPorCoordenadas,
  classificarPlanilhaLeadsPorCnpj,
  dataDoDiaMissao,
  filtrarClientesParaMissao,
  formatarDistanciaHumana,
  normalizarTextoCidade,
  reordenarVisitasPorDia,
  resumirDespesasMissao,
  type CoordenadaGeo,
  type LeadPlanilhaExtraido,
} from '../../utils/missaoCalculos'
import {
  construirMapaCidadesConhecidas,
  geocodificarTextoGoogleOuBackend,
  salvarCoordenadaCidadeCache,
} from '../../utils/cidadesCoordenadas'
import {
  blobParaBase64,
  listarGravacoesOffline,
  marcarErroGravacaoOffline,
  removerGravacaoOffline,
} from '../../lib/missaoOfflineQueue'
import MissaoMapaRota, { type PontoMapaMissao } from '../MissaoMapaRota'
import MissaoGravadorModal from '../MissaoGravadorModal'
import type {
  Cliente,
  Missao,
  MissaoDespesa,
  MissaoRoteiroVisita,
  Vendedor,
} from '../../types'

interface Props {
  clientes: Cliente[]
  setClientes?: React.Dispatch<React.SetStateAction<Cliente[]>>
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  onOpenCliente?: (cliente: Cliente) => void
  onNavigateParametros?: () => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

interface MissaoDetalheState {
  missao: Missao
  visitas: MissaoRoteiroVisita[]
  despesas: MissaoDespesa[]
  parametros: {
    valorKm: number
    valorDiaria: number
    raioCheckinMetros: number
    cidadeBase: string
  }
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-700' },
  planejada: { label: 'Em montagem', cls: 'bg-gray-100 text-gray-700' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', cls: 'bg-amber-100 text-amber-800' },
  aprovada: { label: 'Aprovada', cls: 'bg-sky-100 text-sky-800' },
  reprovada: { label: 'Recusada', cls: 'bg-red-100 text-red-700' },
  em_andamento: { label: 'Em viagem', cls: 'bg-blue-100 text-blue-800' },
  concluida: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-800' },
  cancelada: { label: 'Cancelada', cls: 'bg-gray-200 text-gray-600' },
}

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDataCurta = (iso?: string) => {
  if (!iso) return '—'
  const s = iso.slice(0, 10)
  const p = s.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s
}

async function apiJson(path: string, opts?: RequestInit) {
  const res = await authFetch(`${BOT_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
  })
  return res.json()
}

export default function MissaoView({
  clientes,
  setClientes,
  vendedores,
  loggedUser,
  onOpenCliente,
  onNavigateParametros,
  showToast,
}: Props) {
  const isGerente = loggedUser?.cargo === 'gerente'
  const userId = loggedUser?.id || 0

  const [missoes, setMissoes] = useState<Missao[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroVendedorLista, setFiltroVendedorLista] = useState<string>('')
  const [filtroStatusLista, setFiltroStatusLista] = useState<string>('')

  // Parâmetros globais (carregados também na criação)
  const [parametrosGlobais, setParametrosGlobais] = useState({
    valorKm: 1.5,
    valorDiaria: 120,
    raioCheckinMetros: 300,
    cidadeBase: '',
  })

  // Fila do gestor: leads marcados como "Estabelecimento não localizado"
  const [naoLocalizadosPendentes, setNaoLocalizadosPendentes] = useState<any[]>([])

  // Fila offline de gravações no aparelho
  const [offlineCount, setOfflineCount] = useState(0)
  const [sincronizandoOffline, setSincronizandoOffline] = useState(false)

  // Modal de importação Excel de leads (Item 1)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importVendedorId, setImportVendedorId] = useState<string>(String(userId || ''))
  const [importPreview, setImportPreview] = useState<{
    novosLeads: LeadPlanilhaExtraido[]
    duplicadosNoCrm: { cnpj: string; razaoSocial: string }[]
    duplicadosNaPlanilha: string[]
    invalidosSemCnpj: number
    nomeArquivo: string
  } | null>(null)
  const [importando, setImportando] = useState(false)

  // Formulário Nova Missão (Item 2 — mantém todos os campos existentes + saída/hospedagem)
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    objetivo: '',
    vendedorId: String(userId || ''),
    dataSaida: new Date().toISOString().slice(0, 10),
    dataRetorno: new Date().toISOString().slice(0, 10),
    veiculo: '',
    hotel: '',
    cidades: '',
    custoEstimado: '',
    cidadeOrigem: '',
    cidadeRetorno: '',
    hospedagemPrevista: '',
  })

  // Detalhe da missão aberta
  const [detalhe, setDetalhe] = useState<MissaoDetalheState | null>(null)
  const [abaDetalhe, setAbaDetalhe] = useState<'roteiro' | 'montar' | 'despesas'>('roteiro')

  // Filtros de montagem de visitas (Item 2: cidade, região/várias cidades/UF, raio em km)
  const [buscaLead, setBuscaLead] = useState('')
  const [filtroUfLead, setFiltroUfLead] = useState('')
  const [cidadesSelecionadasFiltro, setCidadesSelecionadasFiltro] = useState<string[]>([])
  const [cidadeRaioInput, setCidadeRaioInput] = useState('')
  const [raioKmFiltro, setRaioKmFiltro] = useState<string>('')
  const [centrosRaioCoords, setCentrosRaioCoords] = useState<CoordenadaGeo[]>([])
  const [geocodificandoRaio, setGeocodificandoRaio] = useState(false)
  const [idsSelecionadosParaAdicionar, setIdsSelecionadosParaAdicionar] = useState<Set<number>>(new Set())
  const [diaDestinoAdicao, setDiaDestinoAdicao] = useState<number>(1)

  // Mapa de coordenadas conhecidas por cidade
  const [mapaCidadesCoords, setMapaCidadesCoords] = useState<Map<string, CoordenadaGeo>>(() => construirMapaCidadesConhecidas())
  const [origemCoord, setOrigemCoord] = useState<CoordenadaGeo | null>(null)
  const [retornoCoord, setRetornoCoord] = useState<CoordenadaGeo | null>(null)

  // Drag-and-drop de visitas
  const dragVisitaIdRef = useRef<number | null>(null)
  const [salvandoRoteiro, setSalvandoRoteiro] = useState(false)

  // Modais de ação em visita
  const [gravadorVisita, setGravadorVisita] = useState<MissaoRoteiroVisita | null>(null)
  const [motivoNaoRealizadaModal, setMotivoNaoRealizadaModal] = useState<{ visita: MissaoRoteiroVisita; texto: string } | null>(null)
  const [naoLocalizadoModal, setNaoLocalizadoModal] = useState<{ visita: MissaoRoteiroVisita; obs: string } | null>(null)
  const [checkinLoadingId, setCheckinLoadingId] = useState<number | null>(null)

  // Recusa de missão pelo gestor (exige motivo)
  const [recusaMissaoModal, setRecusaMissaoModal] = useState<{ missao: Missao; motivo: string } | null>(null)

  // Formulário de despesa (Item 6)
  const [despesaForm, setDespesaForm] = useState({
    tipo: 'COMBUSTIVEL',
    valor: '',
    data: new Date().toISOString().slice(0, 10),
    observacao: '',
    comprovanteBase64: '',
    comprovanteMime: '',
    comprovanteNome: '',
  })
  const [salvandoDespesa, setSalvandoDespesa] = useState(false)

  const geocodeBackend = useCallback(async (texto: string): Promise<CoordenadaGeo | null> => {
    try {
      const r = await apiJson(`/api/missoes/geocode?q=${encodeURIComponent(texto)}`)
      if (r?.success && r.data?.lat != null && r.data?.lon != null) {
        return { lat: Number(r.data.lat), lon: Number(r.data.lon) }
      }
    } catch { /* ignore */ }
    return null
  }, [])

  const carregarLista = useCallback(async () => {
    if (!loggedUser) return
    setLoading(true)
    try {
      const [resMissoes, resParams] = await Promise.all([
        apiJson('/api/missoes'),
        apiJson('/api/missoes/parametros'),
      ])
      const listaBruta: Missao[] = resMissoes?.data || []
      // Dupla trava de permissão no cliente: vendedor jamais vê missão de outro vendedor
      const listaVisivel = isGerente
        ? listaBruta
        : listaBruta.filter(m => Number(m.vendedorId) === Number(loggedUser.id))
      setMissoes(listaVisivel)

      if (resParams?.data) {
        setParametrosGlobais(resParams.data)
        setForm(f => ({
          ...f,
          cidadeOrigem: f.cidadeOrigem || resParams.data.cidadeBase || '',
          cidadeRetorno: f.cidadeRetorno || resParams.data.cidadeBase || '',
        }))
      }

      if (isGerente) {
        const resNL = await apiJson('/api/missoes/leads-nao-localizados')
        setNaoLocalizadosPendentes(resNL?.data || [])
      }
    } catch (e: any) {
      showToast?.('error', e?.message || 'Erro ao carregar missões')
    } finally {
      setLoading(false)
    }
  }, [loggedUser, isGerente, showToast])

  useEffect(() => {
    void carregarLista()
  }, [carregarLista])

  // Sincronização automática de gravações guardadas offline quando a internet volta (Item 5)
  const sincronizarFilaOffline = useCallback(async () => {
    if (!loggedUser) return
    const pendentes = await listarGravacoesOffline(isGerente ? undefined : loggedUser.id)
    setOfflineCount(pendentes.length)
    if (pendentes.length === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) return

    setSincronizandoOffline(true)
    let processadas = 0
    for (const item of pendentes) {
      try {
        const audioBase64 = await blobParaBase64(item.audioBlob)
        const r = await apiJson(`/api/missoes/visitas/${item.visitaId}/gravacao`, {
          method: 'POST',
          body: JSON.stringify({
            audioBase64,
            mimeType: item.mimeType,
            duracaoSeg: item.duracaoSeg,
          }),
        })
        if (r?.success) {
          await removerGravacaoOffline(item.localId)
          processadas++
        } else {
          await marcarErroGravacaoOffline(item.localId, r?.error || 'Falha na IA')
        }
      } catch (err: any) {
        await marcarErroGravacaoOffline(item.localId, err?.message || 'Sem conexão')
      }
    }
    const restantes = await listarGravacoesOffline(isGerente ? undefined : loggedUser.id)
    setOfflineCount(restantes.length)
    setSincronizandoOffline(false)
    if (processadas > 0) {
      showToast?.('success', `${processadas} gravação(ões) offline processada(s)! Revise e confirme o resumo na visita.`)
      if (detalhe) void abrirMissao(detalhe.missao.id)
    }
  }, [loggedUser, isGerente, detalhe, showToast])

  useEffect(() => {
    void sincronizarFilaOffline()
    const onOnline = () => { void sincronizarFilaOffline() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [sincronizarFilaOffline])

  const abrirMissao = async (missaoId: number) => {
    try {
      const r = await apiJson(`/api/missoes/${missaoId}`)
      if (!r?.success) {
        showToast?.('error', r?.error || 'Erro ao abrir missão')
        return
      }
      const d = r.data
      setDetalhe({
        missao: d.missao,
        visitas: d.visitas || [],
        despesas: d.despesas || [],
        parametros: d.parametros || parametrosGlobais,
      })
      setAbaDetalhe((d.visitas || []).length === 0 ? 'montar' : 'roteiro')
    } catch (e: any) {
      showToast?.('error', e?.message || 'Erro ao abrir missão')
    }
  }

  // Resolver coordenadas de saída/retorno da missão aberta para cálculo de km e mapa
  useEffect(() => {
    if (!detalhe) {
      setOrigemCoord(null)
      setRetornoCoord(null)
      return
    }
    let cancelado = false
    const resolver = async (texto?: string): Promise<CoordenadaGeo | null> => {
      const limpo = String(texto || '').trim()
      if (!limpo) return null
      const norm = normalizarTextoCidade(limpo.split('-')[0].split(',')[0])
      const conhecida = mapaCidadesCoords.get(norm)
      if (conhecida) return conhecida
      const geo = await geocodificarTextoGoogleOuBackend(limpo, geocodeBackend)
      if (geo) {
        salvarCoordenadaCidadeCache(norm, undefined, geo)
        setMapaCidadesCoords(construirMapaCidadesConhecidas())
      }
      return geo
    }
    const origTxt = detalhe.missao.cidadeOrigem || detalhe.parametros.cidadeBase || detalhe.missao.cidades?.[0] || ''
    const retTxt = detalhe.missao.cidadeRetorno || origTxt
    void Promise.all([resolver(origTxt), resolver(retTxt)]).then(([cOrig, cRet]) => {
      if (!cancelado) {
        setOrigemCoord(cOrig)
        setRetornoCoord(cRet || cOrig)
      }
    })
    return () => { cancelado = true }
  }, [detalhe?.missao.id, detalhe?.missao.cidadeOrigem, detalhe?.missao.cidadeRetorno, detalhe?.parametros.cidadeBase])

  // Resolver coordenadas dos centros do filtro de raio (ex.: 2 cidades escolhidas + raio de 50 km)
  useEffect(() => {
    const alvos = [
      ...cidadesSelecionadasFiltro,
      ...(cidadeRaioInput.trim() ? [cidadeRaioInput.trim()] : []),
    ]
    const raio = Number(raioKmFiltro) || 0
    if (raio <= 0 || alvos.length === 0) {
      setCentrosRaioCoords([])
      return
    }
    let cancelado = false
    setGeocodificandoRaio(true)
    void (async () => {
      const coords: CoordenadaGeo[] = []
      let mudouCache = false
      for (const alvo of alvos) {
        const norm = normalizarTextoCidade(alvo.split('-')[0].split('/')[0])
        const cLocal = mapaCidadesCoords.get(norm)
        if (cLocal) {
          coords.push(cLocal)
        } else {
          const geo = await geocodificarTextoGoogleOuBackend(
            filtroUfLead ? `${alvo} - ${filtroUfLead}` : alvo,
            geocodeBackend,
          )
          if (geo) {
            salvarCoordenadaCidadeCache(norm, filtroUfLead || undefined, geo)
            mudouCache = true
            coords.push(geo)
          }
        }
      }
      if (!cancelado) {
        if (mudouCache) setMapaCidadesCoords(construirMapaCidadesConhecidas())
        setCentrosRaioCoords(coords)
        setGeocodificandoRaio(false)
      }
    })()
    return () => { cancelado = true }
  }, [cidadesSelecionadasFiltro, cidadeRaioInput, raioKmFiltro, filtroUfLead])

  // ─── Item 1 + Item 8: Carteira visível por vendedor ──────────────────────────
  const donoCarteiraAlvo = detalhe?.missao.vendedorId || (isGerente && form.vendedorId ? Number(form.vendedorId) : userId)

  const clientesDaCarteira = useMemo(() => {
    return clientes.filter(c => {
      if (c.arquivadoDuplicata) return false
      if (isGerente) {
        return donoCarteiraAlvo ? Number(c.vendedorId) === Number(donoCarteiraAlvo) : true
      }
      return Number(c.vendedorId) === Number(userId)
    })
  }, [clientes, isGerente, donoCarteiraAlvo, userId])

  const clienteById = useMemo(() => {
    const m = new Map<number, Cliente>()
    for (const c of clientes) m.set(c.id, c)
    return m
  }, [clientes])

  const ufsDisponiveis = useMemo(() => {
    const s = new Set<string>()
    for (const c of clientesDaCarteira) {
      const uf = String(c.enderecoEstado || '').trim().toUpperCase()
      if (uf.length === 2) s.add(uf)
    }
    return [...s].sort()
  }, [clientesDaCarteira])

  const cidadesDisponiveis = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of clientesDaCarteira) {
      if (filtroUfLead && String(c.enderecoEstado || '').trim().toUpperCase() !== filtroUfLead) continue
      const cid = String(c.enderecoCidade || '').trim()
      if (!cid) continue
      const norm = normalizarTextoCidade(cid)
      if (!map.has(norm)) map.set(norm, cid)
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [clientesDaCarteira, filtroUfLead])

  const idsJaNoRoteiro = useMemo(() => {
    return new Set((detalhe?.visitas || []).filter(v => v.status !== 'removida').map(v => v.clienteId))
  }, [detalhe?.visitas])

  const clientesFiltradosMontagem = useMemo(() => {
    return filtrarClientesParaMissao(
      clientesDaCarteira,
      {
        busca: buscaLead,
        uf: filtroUfLead,
        cidades: cidadesSelecionadasFiltro,
        cidadesCentroRaio: centrosRaioCoords,
        raioKm: Number(raioKmFiltro) || 0,
      },
      mapaCidadesCoords,
    )
  }, [clientesDaCarteira, buscaLead, filtroUfLead, cidadesSelecionadasFiltro, centrosRaioCoords, raioKmFiltro, mapaCidadesCoords])

  // ─── Coordenadas de cada visita do roteiro + Km Total e Custo Previsto ───────
  const resolverCoordCliente = useCallback((cli?: Cliente): CoordenadaGeo | null => {
    if (!cli) return null
    if (cli.latitude != null && cli.longitude != null && Number.isFinite(cli.latitude) && Number.isFinite(cli.longitude)) {
      return { lat: cli.latitude, lon: cli.longitude }
    }
    const cidNorm = normalizarTextoCidade(cli.enderecoCidade)
    if (!cidNorm) return null
    const uf = String(cli.enderecoEstado || '').trim().toUpperCase()
    return mapaCidadesCoords.get(`${cidNorm}|${uf}`) || mapaCidadesCoords.get(cidNorm) || null
  }, [mapaCidadesCoords])

  const visitasOrdenadas = useMemo(() => {
    return [...(detalhe?.visitas || [])]
      .filter(v => v.status !== 'removida')
      .sort((a, b) => (a.diaNumero - b.diaNumero) || (a.ordem - b.ordem))
  }, [detalhe?.visitas])

  const kmCalculadoLocal = useMemo(() => {
    if (!detalhe) return 0
    const paradas = visitasOrdenadas.map(v => {
      if (v.clienteLat != null && v.clienteLon != null) return { lat: v.clienteLat, lon: v.clienteLon }
      return resolverCoordCliente(clienteById.get(v.clienteId))
    })
    return calcularKmRoteiroPorCoordenadas(origemCoord, paradas, retornoCoord)
  }, [detalhe, visitasOrdenadas, origemCoord, retornoCoord, resolverCoordCliente, clienteById])

  const diasDaMissao = useMemo(() => {
    if (!detalhe) return 1
    return calcularDiasMissao(detalhe.missao.dataSaida, detalhe.missao.dataRetorno)
  }, [detalhe?.missao.dataSaida, detalhe?.missao.dataRetorno])

  const resumoCustoPrevisto = useMemo(() => {
    if (!detalhe) return { custoKm: 0, custoDiarias: 0, custoHospedagem: 0, custoPrevistoTotal: 0 }
    const km = detalhe.missao.kmTotal && detalhe.missao.kmTotal > 0 ? detalhe.missao.kmTotal : kmCalculadoLocal
    return calcularCustoPrevistoMissao({
      kmTotal: km,
      valorKm: detalhe.missao.valorKmAplicado ?? detalhe.parametros.valorKm,
      valorDiaria: detalhe.missao.valorDiariaAplicado ?? detalhe.parametros.valorDiaria,
      dias: diasDaMissao,
      hospedagem: detalhe.missao.hospedagemPrevista || 0,
    })
  }, [detalhe, kmCalculadoLocal, diasDaMissao])

  const resumoDespesas = useMemo(() => {
    return resumirDespesasMissao(detalhe?.despesas || [], resumoCustoPrevisto.custoPrevistoTotal)
  }, [detalhe?.despesas, resumoCustoPrevisto.custoPrevistoTotal])

  const pontosMapa = useMemo<PontoMapaMissao[]>(() => {
    return visitasOrdenadas.map((v, idx) => {
      const cli = clienteById.get(v.clienteId)
      const coord = v.clienteLat != null && v.clienteLon != null
        ? { lat: v.clienteLat, lon: v.clienteLon }
        : resolverCoordCliente(cli)
      const statusMapa: PontoMapaMissao['status'] =
        v.status === 'visitado'
          ? 'visitado'
          : v.status === 'pendente'
            ? 'pendente'
            : 'nao_visitado'
      return {
        id: v.id,
        ordemGlobal: idx + 1,
        diaNumero: v.diaNumero,
        titulo: cli?.nomeFantasia || cli?.razaoSocial || `Cliente #${v.clienteId}`,
        subtitulo: cli?.enderecoCidade ? `${cli.enderecoCidade}/${cli.enderecoEstado || ''}` : undefined,
        status: statusMapa,
        coord,
      }
    })
  }, [visitasOrdenadas, clienteById, resolverCoordCliente])

  // ─── Ações: Importação Excel de Leads (Item 1) ───────────────────────────────
  const lerArquivoPlanilha = (file: File) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result as ArrayBuffer, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' })
        const cnpjsAtuais = clientes.flatMap(c => [c.cnpj || '', c.cnpj2 || '']).filter(Boolean)
        const classif = classificarPlanilhaLeadsPorCnpj(rows, cnpjsAtuais)
        setImportPreview({ ...classif, nomeArquivo: file.name })
      } catch (err: any) {
        showToast?.('error', `Não foi possível ler a planilha: ${err?.message || 'formato inválido'}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const confirmarImportacaoLeads = async () => {
    if (!importPreview || importPreview.novosLeads.length === 0) return
    setImportando(true)
    try {
      const r = await apiJson('/api/missoes/importar-leads', {
        method: 'POST',
        body: JSON.stringify({
          vendedorId: isGerente ? Number(importVendedorId || userId) : userId,
          leads: importPreview.novosLeads,
        }),
      })
      if (!r?.success) throw new Error(r?.error || 'Falha ao importar planilha')
      const novosClientes: Cliente[] = (r.data?.clientes || []).map((row: any) => clienteFromDb(row))
      if (novosClientes.length > 0 && setClientes) {
        setClientes(prev => [...novosClientes, ...prev])
      }
      showToast?.(
        'success',
        `${r.data.inseridos} lead(s) importado(s) na carteira · ${r.data.duplicadosNoCrm} CNPJ(s) já existente(s) ignorado(s).`,
      )
      setShowImportModal(false)
      setImportPreview(null)
    } catch (err: any) {
      showToast?.('error', err?.message || 'Erro ao importar leads.')
    } finally {
      setImportando(false)
    }
  }

  // ─── Ações: Criar Missão + Sincronizar Roteiro ───────────────────────────────
  const criarMissao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.dataSaida || !form.dataRetorno) {
      showToast?.('error', 'Informe nome, data de saída e data de retorno.')
      return
    }
    if (form.dataRetorno < form.dataSaida) {
      showToast?.('error', 'A data de retorno não pode ser anterior à data de saída.')
      return
    }
    const vendAlvo = isGerente ? Number(form.vendedorId || userId) : userId
    try {
      const r = await apiJson('/api/missoes', {
        method: 'POST',
        body: JSON.stringify({
          nome: form.nome.trim(),
          objetivo: form.objetivo.trim(),
          vendedorId: vendAlvo,
          dataSaida: form.dataSaida,
          dataRetorno: form.dataRetorno,
          veiculo: form.veiculo.trim(),
          hotel: form.hotel.trim(),
          cidades: form.cidades.split(',').map(s => s.trim()).filter(Boolean),
          custoEstimado: form.custoEstimado ? Number(form.custoEstimado) : undefined,
          cidadeOrigem: form.cidadeOrigem.trim() || parametrosGlobais.cidadeBase,
          cidadeRetorno: form.cidadeRetorno.trim() || form.cidadeOrigem.trim() || parametrosGlobais.cidadeBase,
          hospedagemPrevista: form.hospedagemPrevista ? Number(form.hospedagemPrevista) : 0,
          status: 'planejada',
        }),
      })
      if (!r?.success) throw new Error(r?.error || 'Erro ao criar missão')
      showToast?.('success', 'Missão criada. Monte agora o roteiro de visitas.')
      setCriando(false)
      setForm(f => ({ ...f, nome: '', objetivo: '', cidades: '', custoEstimado: '', hospedagemPrevista: '' }))
      await carregarLista()
      await abrirMissao(r.data.id)
    } catch (err: any) {
      showToast?.('error', err?.message || 'Erro ao criar missão')
    }
  }

  const persistirRoteiro = async (
    proximasVisitas: { id?: number; clienteId: number; diaNumero: number; ordem: number; dataVisita?: string }[],
    kmOverride?: number,
    origemOverride?: string,
    retornoOverride?: string,
    hospedagemOverride?: number,
  ) => {
    if (!detalhe) return
    setSalvandoRoteiro(true)
    try {
      const paradas = proximasVisitas.map(v => resolverCoordCliente(clienteById.get(v.clienteId)))
      const kmCalc = kmOverride ?? calcularKmRoteiroPorCoordenadas(origemCoord, paradas, retornoCoord)
      const r = await apiJson(`/api/missoes/${detalhe.missao.id}/visitas-plano`, {
        method: 'PUT',
        body: JSON.stringify({
          visitas: proximasVisitas.map(v => ({
            ...v,
            dataVisita: dataDoDiaMissao(detalhe.missao.dataSaida, v.diaNumero),
          })),
          kmTotal: kmCalc,
          cidadeOrigem: origemOverride ?? detalhe.missao.cidadeOrigem,
          cidadeRetorno: retornoOverride ?? detalhe.missao.cidadeRetorno,
          hospedagemPrevista: hospedagemOverride ?? detalhe.missao.hospedagemPrevista,
        }),
      })
      if (!r?.success) throw new Error(r?.error || 'Erro ao salvar roteiro')
      setDetalhe(prev => prev ? {
        ...prev,
        missao: r.data.missao,
        visitas: r.data.visitas || [],
      } : null)
      void carregarLista()
    } catch (err: any) {
      showToast?.('error', err?.message || 'Erro ao atualizar roteiro')
    } finally {
      setSalvandoRoteiro(false)
    }
  }

  const adicionarSelecionadosAoDia = async () => {
    if (!detalhe || idsSelecionadosParaAdicionar.size === 0) return
    const existentesNoDia = visitasOrdenadas.filter(v => v.diaNumero === diaDestinoAdicao)
    let proxOrdem = existentesNoDia.length + 1
    const novos = [...idsSelecionadosParaAdicionar]
      .filter(cid => !idsJaNoRoteiro.has(cid))
      .map(cid => ({
        clienteId: cid,
        diaNumero: diaDestinoAdicao,
        ordem: proxOrdem++,
      }))
    if (novos.length === 0) {
      showToast?.('error', 'Os clientes selecionados já estão no roteiro desta missão.')
      return
    }
    const base = visitasOrdenadas.map(v => ({
      id: v.id,
      clienteId: v.clienteId,
      diaNumero: v.diaNumero,
      ordem: v.ordem,
    }))
    await persistirRoteiro([...base, ...novos])
    setIdsSelecionadosParaAdicionar(new Set())
    setAbaDetalhe('roteiro')
    showToast?.('success', `${novos.length} visita(s) incluída(s) no Dia ${diaDestinoAdicao}.`)
  }

  const moverVisitaPosicao = async (visitaId: number, novoDia: number, novoIndiceZeroBased: number) => {
    const reordenadas = reordenarVisitasPorDia(visitasOrdenadas, visitaId, novoDia, novoIndiceZeroBased)
    // Atualização otimista imediata na tela + recálculo de km
    setDetalhe(prev => prev ? { ...prev, visitas: reordenadas } : null)
    await persistirRoteiro(
      reordenadas.map(v => ({
        id: v.id,
        clienteId: v.clienteId,
        diaNumero: v.diaNumero,
        ordem: v.ordem,
      })),
    )
  }

  const removerVisitaDoRoteiro = async (visitaId: number) => {
    const restantes = visitasOrdenadas
      .filter(v => v.id !== visitaId)
      .map((v, i) => ({ id: v.id, clienteId: v.clienteId, diaNumero: v.diaNumero, ordem: i + 1 }))
    await persistirRoteiro(restantes)
  }

  // ─── Check-in GPS no celular (Item 4) ────────────────────────────────────────
  const realizarCheckin = (visita: MissaoRoteiroVisita) => {
    if (!navigator.geolocation) {
      showToast?.('error', 'Geolocalização não suportada neste navegador.')
      return
    }
    setCheckinLoadingId(visita.id)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await apiJson(`/api/missoes/visitas/${visita.id}/checkin`, {
            method: 'POST',
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            }),
          })
          if (!r?.success) throw new Error(r?.error || 'Erro ao registrar check-in')
          const vUpd: MissaoRoteiroVisita = r.data
          setDetalhe(prev => prev ? {
            ...prev,
            visitas: prev.visitas.map(x => x.id === vUpd.id ? vUpd : x),
          } : null)
          if (vUpd.foraDoLocal) {
            showToast?.(
              'success',
              `Check-in aceito e marcado "Fora do local" (${formatarDistanciaHumana(vUpd.distanciaMetros)} do endereço).`,
            )
          } else {
            showToast?.(
              'success',
              `Check-in válido registrado (${formatarDistanciaHumana(vUpd.distanciaMetros)}).`,
            )
          }
          void carregarLista()
        } catch (err: any) {
          showToast?.('error', err?.message || 'Falha no check-in.')
        } finally {
          setCheckinLoadingId(null)
        }
      },
      (geoErr) => {
        setCheckinLoadingId(null)
        showToast?.(
          'error',
          geoErr.code === 1
            ? 'Permissão de localização negada. Ative o GPS do celular para fazer o check-in.'
            : 'Não foi possível obter o GPS do aparelho. Tente novamente em área aberta.',
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const confirmarNaoRealizada = async () => {
    if (!motivoNaoRealizadaModal) return
    const motivo = motivoNaoRealizadaModal.texto.trim()
    if (!motivo) {
      showToast?.('error', 'Informe o motivo da visita não realizada.')
      return
    }
    const r = await apiJson(`/api/missoes/visitas/${motivoNaoRealizadaModal.visita.id}/nao-realizada`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    })
    if (!r?.success) {
      showToast?.('error', r?.error || 'Erro ao salvar motivo')
      return
    }
    setDetalhe(prev => prev ? {
      ...prev,
      visitas: prev.visitas.map(v => v.id === r.data.id ? r.data : v),
    } : null)
    setMotivoNaoRealizadaModal(null)
    showToast?.('success', 'Visita marcada como não realizada.')
    void carregarLista()
  }

  const confirmarNaoLocalizado = async () => {
    if (!naoLocalizadoModal) return
    const enviar = async (lat?: number, lon?: number) => {
      const r = await apiJson(`/api/missoes/visitas/${naoLocalizadoModal.visita.id}/nao-localizado`, {
        method: 'POST',
        body: JSON.stringify({ observacao: naoLocalizadoModal.obs, lat, lon }),
      })
      if (!r?.success) {
        showToast?.('error', r?.error || 'Erro ao registrar')
        return
      }
      setDetalhe(prev => prev ? {
        ...prev,
        visitas: prev.visitas.map(v => v.id === r.data.id ? r.data : v),
      } : null)
      setNaoLocalizadoModal(null)
      showToast?.('success', 'Registrado como "Estabelecimento não localizado" e enviado para decisão do gestor.')
      void carregarLista()
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { void enviar(pos.coords.latitude, pos.coords.longitude) },
        () => { void enviar() },
        { timeout: 6000 },
      )
    } else {
      await enviar()
    }
  }

  const decidirDescarteGestor = async (visitaId: number, decisao: 'descartado' | 'mantido') => {
    const r = await apiJson(`/api/missoes/visitas/${visitaId}/decidir-descarte`, {
      method: 'POST',
      body: JSON.stringify({ decisao }),
    })
    if (!r?.success) {
      showToast?.('error', r?.error || 'Erro ao registrar decisão')
      return
    }
    showToast?.('success', decisao === 'descartado' ? 'Lead descartado com registro no histórico.' : 'Lead mantido na carteira.')
    void carregarLista()
    if (detalhe) void abrirMissao(detalhe.missao.id)
  }

  // ─── Aprovação / Recusa / Início / Conclusão da Missão ───────────────────────
  const solicitarAprovacao = async () => {
    if (!detalhe) return
    if (visitasOrdenadas.length === 0) {
      showToast?.('error', 'Inclua ao menos 1 visita no roteiro antes de enviar para aprovação.')
      return
    }
    const r = await apiJson(`/api/missoes/${detalhe.missao.id}/solicitar-aprovacao`, { method: 'POST' })
    if (r?.success) {
      showToast?.('success', 'Missão enviada para aprovação do gestor.')
      await abrirMissao(detalhe.missao.id)
      void carregarLista()
    } else {
      showToast?.('error', r?.error || 'Erro ao solicitar aprovação')
    }
  }

  const aprovarMissaoGestor = async () => {
    if (!detalhe) return
    const r = await apiJson(`/api/missoes/${detalhe.missao.id}/aprovar`, {
      method: 'POST',
      body: JSON.stringify({ acao: 'aprovar' }),
    })
    if (r?.success) {
      showToast?.('success', 'Missão aprovada.')
      await abrirMissao(detalhe.missao.id)
      void carregarLista()
    } else {
      showToast?.('error', r?.error || 'Erro ao aprovar missão')
    }
  }

  const confirmarRecusaMissaoGestor = async () => {
    if (!recusaMissaoModal) return
    if (!recusaMissaoModal.motivo.trim()) {
      showToast?.('error', 'Informe o motivo da recusa.')
      return
    }
    const r = await apiJson(`/api/missoes/${recusaMissaoModal.missao.id}/aprovar`, {
      method: 'POST',
      body: JSON.stringify({ acao: 'recusar', motivo: recusaMissaoModal.motivo.trim() }),
    })
    if (r?.success) {
      showToast?.('success', 'Missão recusada com motivo registrado.')
      const id = recusaMissaoModal.missao.id
      setRecusaMissaoModal(null)
      await abrirMissao(id)
      void carregarLista()
    } else {
      showToast?.('error', r?.error || 'Erro ao recusar missão')
    }
  }

  const iniciarViagem = async () => {
    if (!detalhe) return
    const r = await apiJson(`/api/missoes/${detalhe.missao.id}/iniciar`, { method: 'POST' })
    if (r?.success) {
      showToast?.('success', 'Viagem iniciada! Bom trabalho em campo.')
      await abrirMissao(detalhe.missao.id)
      void carregarLista()
    } else {
      showToast?.('error', r?.error || 'Erro ao iniciar viagem')
    }
  }

  const encerrarViagem = async () => {
    if (!detalhe) return
    const r = await apiJson(`/api/missoes/${detalhe.missao.id}/encerrar`, { method: 'POST' })
    if (r?.success) {
      showToast?.('success', 'Missão concluída!')
      await abrirMissao(detalhe.missao.id)
      void carregarLista()
    } else {
      showToast?.('error', r?.error || 'Erro ao encerrar missão')
    }
  }

  // ─── Despesas com comprovante (Item 6) ───────────────────────────────────────
  const selecionarFotoComprovante = (file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '')
      const idx = dataUrl.indexOf(',')
      setDespesaForm(f => ({
        ...f,
        comprovanteBase64: idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl,
        comprovanteMime: file.type || 'image/jpeg',
        comprovanteNome: file.name,
      }))
    }
    reader.readAsDataURL(file)
  }

  const salvarDespesa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!detalhe) return
    const valorNum = Number(String(despesaForm.valor).replace(',', '.'))
    if (!Number.isFinite(valorNum) || valorNum <= 0 || !despesaForm.data) {
      showToast?.('error', 'Informe data e valor válido para a despesa.')
      return
    }
    setSalvandoDespesa(true)
    try {
      const r = await apiJson(`/api/missoes/${detalhe.missao.id}/despesas`, {
        method: 'POST',
        body: JSON.stringify({
          tipo: despesaForm.tipo,
          valor: valorNum,
          data: despesaForm.data,
          observacao: despesaForm.observacao.trim(),
          comprovanteBase64: despesaForm.comprovanteBase64 || undefined,
          comprovanteMime: despesaForm.comprovanteMime || undefined,
        }),
      })
      if (!r?.success) throw new Error(r?.error || 'Erro ao lançar despesa')
      setDespesaForm({
        tipo: 'COMBUSTIVEL',
        valor: '',
        data: new Date().toISOString().slice(0, 10),
        observacao: '',
        comprovanteBase64: '',
        comprovanteMime: '',
        comprovanteNome: '',
      })
      showToast?.('success', 'Despesa lançada.')
      await abrirMissao(detalhe.missao.id)
      void carregarLista()
    } catch (err: any) {
      showToast?.('error', err?.message || 'Erro ao salvar despesa')
    } finally {
      setSalvandoDespesa(false)
    }
  }

  const excluirDespesa = async (despesaId: number) => {
    if (!detalhe) return
    const r = await apiJson(`/api/missoes/${detalhe.missao.id}/despesas/${despesaId}`, { method: 'DELETE' })
    if (r?.success) {
      await abrirMissao(detalhe.missao.id)
      void carregarLista()
    }
  }

  const missoesFiltradas = useMemo(() => {
    return missoes.filter(m => {
      if (filtroVendedorLista && Number(m.vendedorId) !== Number(filtroVendedorLista)) return false
      if (filtroStatusLista && m.status !== filtroStatusLista) return false
      return true
    })
  }, [missoes, filtroVendedorLista, filtroStatusLista])

  // ═════════════════════════════════════════════════════════════════════════════
  // TELA DE DETALHE DA MISSÃO
  // ═════════════════════════════════════════════════════════════════════════════
  if (detalhe) {
    const m = detalhe.missao
    const vendDono = vendedores.find(v => v.id === m.vendedorId)
    const stInfo = STATUS_LABEL[m.status] || STATUS_LABEL.planejada
    const kmExibido = m.kmTotal && m.kmTotal > 0 ? m.kmTotal : kmCalculadoLocal
    const podeEditarRoteiro = m.status !== 'concluida' && m.status !== 'cancelada'

    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDetalhe(null)}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Voltar para Missões
          </button>
          {offlineCount > 0 && (
            <button
              type="button"
              onClick={() => void sincronizarFilaOffline()}
              disabled={sincronizandoOffline}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200"
            >
              {sincronizandoOffline ? 'Sincronizando áudios...' : `${offlineCount} gravação(ões) no aparelho · sincronizar`}
            </button>
          )}
        </div>

        {/* Cabeçalho da missão + KPIs de Km e Custo Previsto x Realizado */}
        <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-apple-sm border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{m.nome}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${stInfo.cls}`}>
                  {stInfo.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Vendedor: <span className="font-semibold text-gray-700 dark:text-gray-300">{vendDono?.nome || `#${m.vendedorId}`}</span>
                {' · '}Período: <span className="tabular-nums font-medium">{fmtDataCurta(m.dataSaida)} a {fmtDataCurta(m.dataRetorno)}</span> ({diasDaMissao} {diasDaMissao === 1 ? 'dia' : 'dias'})
                {m.veiculo ? ` · Veículo: ${m.veiculo}` : ''}
                {m.hotel ? ` · Hotel: ${m.hotel}` : ''}
              </p>
              {m.objetivo && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{m.objetivo}</p>}
            </div>

            {/* Botões de fluxo de status */}
            <div className="flex flex-wrap items-center gap-2">
              {(m.status === 'planejada' || m.status === 'rascunho' || m.status === 'reprovada') && (
                <button
                  type="button"
                  onClick={solicitarAprovacao}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl"
                >
                  Enviar para aprovação do gestor
                </button>
              )}
              {m.status === 'aguardando_aprovacao' && isGerente && (
                <>
                  <button
                    type="button"
                    onClick={aprovarMissaoGestor}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
                  >
                    Aprovar missão
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecusaMissaoModal({ missao: m, motivo: '' })}
                    className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl"
                  >
                    Recusar missão
                  </button>
                </>
              )}
              {m.status === 'aprovada' && (
                <button
                  type="button"
                  onClick={iniciarViagem}
                  className="px-3.5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl"
                >
                  Iniciar viagem
                </button>
              )}
              {m.status === 'em_andamento' && (
                <button
                  type="button"
                  onClick={encerrarViagem}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
                >
                  Concluir missão
                </button>
              )}
            </div>
          </div>

          {m.status === 'reprovada' && m.motivoReprovacao && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              <span className="font-bold">Motivo da recusa pelo gestor:</span> {m.motivoReprovacao}
            </div>
          )}

          {/* Resumo numérico da missão: Visitas, Km total, Custo Previsto e Custo Realizado */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3">
              <p className="text-[11px] font-medium text-gray-500 uppercase">Visitas realizadas</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                {visitasOrdenadas.filter(v => v.status === 'visitado').length} / {visitasOrdenadas.length}
              </p>
              <p className="text-[11px] text-gray-400">
                {visitasOrdenadas.filter(v => v.foraDoLocal).length > 0
                  ? `${visitasOrdenadas.filter(v => v.foraDoLocal).length} fora do local`
                  : 'roteiro ativo'}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3">
              <p className="text-[11px] font-medium text-gray-500 uppercase">Quilometragem total</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                {kmExibido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km
              </p>
              <p className="text-[11px] text-gray-400 truncate">
                {m.cidadeOrigem || 'Saída'} → {visitasOrdenadas.length} visita(s) → {m.cidadeRetorno || m.cidadeOrigem || 'Retorno'}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3">
              <p className="text-[11px] font-medium text-gray-500 uppercase">Custo previsto (fórmula)</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                {fmtBRL(resumoCustoPrevisto.custoPrevistoTotal)}
              </p>
              <p className="text-[11px] text-gray-400">
                Km {fmtBRL(resumoCustoPrevisto.custoKm)} + Diárias {fmtBRL(resumoCustoPrevisto.custoDiarias)} + Hosp. {fmtBRL(resumoCustoPrevisto.custoHospedagem)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3">
              <p className="text-[11px] font-medium text-gray-500 uppercase">Custo realizado</p>
              <p className={`text-lg font-bold mt-0.5 ${resumoDespesas.totalRealizado > resumoCustoPrevisto.custoPrevistoTotal && resumoCustoPrevisto.custoPrevistoTotal > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {fmtBRL(resumoDespesas.totalRealizado)}
              </p>
              <p className="text-[11px] text-gray-400">
                {detalhe.despesas.length} despesa(s) lançada(s)
              </p>
            </div>
          </div>

          {/* Edição rápida de Saída, Retorno e Hospedagem Prevista */}
          {podeEditarRoteiro && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Cidade de saída</label>
                <input
                  type="text"
                  defaultValue={m.cidadeOrigem || ''}
                  placeholder="Ex.: Belo Horizonte - MG"
                  onBlur={e => {
                    const val = e.target.value.trim()
                    if (val !== (m.cidadeOrigem || '')) {
                      void persistirRoteiro(
                        visitasOrdenadas.map(v => ({ id: v.id, clienteId: v.clienteId, diaNumero: v.diaNumero, ordem: v.ordem })),
                        undefined,
                        val,
                        m.cidadeRetorno || val,
                      )
                    }
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Cidade de retorno</label>
                <input
                  type="text"
                  defaultValue={m.cidadeRetorno || m.cidadeOrigem || ''}
                  placeholder="Ex.: Belo Horizonte - MG"
                  onBlur={e => {
                    const val = e.target.value.trim()
                    if (val !== (m.cidadeRetorno || '')) {
                      void persistirRoteiro(
                        visitasOrdenadas.map(v => ({ id: v.id, clienteId: v.clienteId, diaNumero: v.diaNumero, ordem: v.ordem })),
                        undefined,
                        m.cidadeOrigem,
                        val,
                      )
                    }
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Hospedagem prevista (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={m.hospedagemPrevista || 0}
                  onBlur={e => {
                    const val = Math.max(0, Number(e.target.value) || 0)
                    if (val !== (m.hospedagemPrevista || 0)) {
                      void persistirRoteiro(
                        visitasOrdenadas.map(v => ({ id: v.id, clienteId: v.clienteId, diaNumero: v.diaNumero, ordem: v.ordem })),
                        undefined,
                        m.cidadeOrigem,
                        m.cidadeRetorno,
                        val,
                      )
                    }
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg tabular-nums bg-white dark:bg-gray-800"
                />
              </div>
              <div className="flex items-end">
                <p className="text-[11px] text-gray-400 leading-tight pb-1">
                  Parâmetros: R$ {(m.valorKmAplicado ?? detalhe.parametros.valorKm).toFixed(2)}/km · Diária R$ {(m.valorDiariaAplicado ?? detalhe.parametros.valorDiaria).toFixed(2)} · Raio {detalhe.parametros.raioCheckinMetros}m
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Abas internas da Missão */}
        <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
          <button
            type="button"
            onClick={() => setAbaDetalhe('roteiro')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${abaDetalhe === 'roteiro' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}
          >
            Roteiro, Mapa e Check-in ({visitasOrdenadas.length})
          </button>
          {podeEditarRoteiro && (
            <button
              type="button"
              onClick={() => setAbaDetalhe('montar')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${abaDetalhe === 'montar' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}
            >
              Incluir / Filtrar Leads e Clientes
            </button>
          )}
          <button
            type="button"
            onClick={() => setAbaDetalhe('despesas')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${abaDetalhe === 'despesas' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}
          >
            Despesas ({detalhe.despesas.length})
          </button>
        </div>

        {/* ─── ABA 1: ROTEIRO, MAPA E EXECUÇÃO EM CAMPO ─── */}
        {abaDetalhe === 'roteiro' && (
          <div className="space-y-5">
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5">
              <MissaoMapaRota
                origem={{ nome: m.cidadeOrigem || detalhe.parametros.cidadeBase || 'Saída', coord: origemCoord }}
                retorno={{ nome: m.cidadeRetorno || m.cidadeOrigem || detalhe.parametros.cidadeBase || 'Retorno', coord: retornoCoord }}
                pontos={pontosMapa}
                onKmRodoviarioReal={(kmReal) => {
                  if (Math.abs((m.kmTotal || 0) - kmReal) >= 1) {
                    void persistirRoteiro(
                      visitasOrdenadas.map(v => ({ id: v.id, clienteId: v.clienteId, diaNumero: v.diaNumero, ordem: v.ordem })),
                      kmReal,
                    )
                  }
                }}
              />
            </div>

            {visitasOrdenadas.length === 0 ? (
              <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Nenhuma visita no roteiro ainda.</p>
                <p className="text-xs text-gray-500">Filtre seus leads e clientes por cidade, região ou raio em km para montar a viagem.</p>
                {podeEditarRoteiro && (
                  <button
                    type="button"
                    onClick={() => setAbaDetalhe('montar')}
                    className="px-4 py-2 bg-primary-600 text-white text-xs font-semibold rounded-xl"
                  >
                    Escolher clientes para visitar
                  </button>
                )}
              </div>
            ) : (
              Array.from({ length: Math.max(diasDaMissao, ...visitasOrdenadas.map(v => v.diaNumero)) }, (_, idx) => idx + 1).map(diaNum => {
                const visitasDoDia = visitasOrdenadas.filter(v => v.diaNumero === diaNum)
                const dataISO = dataDoDiaMissao(m.dataSaida, diaNum)
                return (
                  <div
                    key={diaNum}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      if (dragVisitaIdRef.current != null && podeEditarRoteiro) {
                        void moverVisitaPosicao(dragVisitaIdRef.current, diaNum, visitasDoDia.length)
                        dragVisitaIdRef.current = null
                      }
                    }}
                    className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-gray-400" />
                        Dia {diaNum} · {fmtDataCurta(dataISO)}
                        <span className="text-xs font-normal text-gray-400">({visitasDoDia.length} visita{visitasDoDia.length === 1 ? '' : 's'})</span>
                      </h3>
                      {salvandoRoteiro && <span className="text-[11px] text-gray-400">Recalculando km...</span>}
                    </div>

                    {visitasDoDia.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Arraste visitas para este dia ou inclua na aba de seleção.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {visitasDoDia.map((v, idxNoDia) => {
                          const cli = clienteById.get(v.clienteId)
                          const temRascunhoIA = Boolean(v.resumoIa && !v.resumoConfirmado)
                          return (
                            <div
                              key={v.id}
                              draggable={podeEditarRoteiro}
                              onDragStart={() => { dragVisitaIdRef.current = v.id }}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (dragVisitaIdRef.current != null && dragVisitaIdRef.current !== v.id && podeEditarRoteiro) {
                                  void moverVisitaPosicao(dragVisitaIdRef.current, diaNum, idxNoDia)
                                  dragVisitaIdRef.current = null
                                }
                              }}
                              className={`rounded-xl border p-3.5 transition-colors ${
                                v.status === 'visitado'
                                  ? 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20'
                                  : v.status === 'nao_realizada' || v.status === 'nao_localizado'
                                    ? 'border-red-200 bg-red-50/40 dark:bg-red-950/20'
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-900 text-white text-[11px] font-bold tabular-nums">
                                      {v.ordem}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => cli && onOpenCliente?.(cli)}
                                      className="text-sm font-bold text-gray-900 dark:text-white hover:underline text-left truncate"
                                    >
                                      {cli?.nomeFantasia || cli?.razaoSocial || `Cliente #${v.clienteId}`}
                                    </button>
                                    {!v.planejada && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800">
                                        Incluída na viagem
                                      </span>
                                    )}
                                    {v.status === 'visitado' && !v.foraDoLocal && (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                        Visitado · válido ({formatarDistanciaHumana(v.distanciaMetros)})
                                      </span>
                                    )}
                                    {v.status === 'visitado' && v.foraDoLocal && (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                        Fora do local · {formatarDistanciaHumana(v.distanciaMetros)}
                                      </span>
                                    )}
                                    {v.status === 'nao_localizado' && (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">
                                        Estabelecimento não localizado
                                      </span>
                                    )}
                                    {v.status === 'nao_realizada' && (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-200 text-gray-700">
                                        Não realizada
                                      </span>
                                    )}
                                    {temRascunhoIA && (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                                        Resumo pendente de confirmação
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-xs text-gray-500 mt-1">
                                    {[cli?.enderecoRua, cli?.enderecoBairro, cli?.enderecoCidade && `${cli.enderecoCidade}/${cli.enderecoEstado || ''}`].filter(Boolean).join(' · ') || 'Endereço não informado'}
                                    {v.checkinEm && (
                                      <>
                                        {' · '}Check-in às <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{new Date(v.checkinEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                      </>
                                    )}
                                  </p>
                                </div>

                                {/* Controles de ordem / dia */}
                                {podeEditarRoteiro && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      title="Subir na ordem"
                                      disabled={idxNoDia === 0}
                                      onClick={() => void moverVisitaPosicao(v.id, diaNum, idxNoDia - 1)}
                                      className="p-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                                    >
                                      <ChevronUpIcon className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Descer na ordem"
                                      disabled={idxNoDia === visitasDoDia.length - 1}
                                      onClick={() => void moverVisitaPosicao(v.id, diaNum, idxNoDia + 1)}
                                      className="p-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                                    >
                                      <ChevronDownIcon className="h-3.5 w-3.5" />
                                    </button>
                                    {diasDaMissao > 1 && (
                                      <select
                                        value={v.diaNumero}
                                        onChange={e => void moverVisitaPosicao(v.id, Number(e.target.value), 999)}
                                        className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white dark:bg-gray-800"
                                        title="Mover para outro dia"
                                      >
                                        {Array.from({ length: diasDaMissao }, (_, d) => d + 1).map(d => (
                                          <option key={d} value={d}>Dia {d}</option>
                                        ))}
                                      </select>
                                    )}
                                    {v.status === 'pendente' && (
                                      <button
                                        type="button"
                                        title="Retirar visita do roteiro"
                                        onClick={() => void removerVisitaDoRoteiro(v.id)}
                                        className="p-1 rounded border border-gray-200 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                      >
                                        <TrashIcon className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Resumo confirmado da visita (Item 5 & 7) */}
                              {v.resumoConfirmado && v.resumoIa && (
                                <div className="mt-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/50 p-2.5 text-xs space-y-1">
                                  <p><span className="font-semibold text-gray-700 dark:text-gray-300">Conversado:</span> {v.resumoIa.conversado}</p>
                                  {v.resumoIa.produtosInteresse && (
                                    <p><span className="font-semibold text-gray-700 dark:text-gray-300">Produtos de interesse:</span> {v.resumoIa.produtosInteresse}</p>
                                  )}
                                  {v.resumoIa.objecoes && (
                                    <p><span className="font-semibold text-gray-700 dark:text-gray-300">Objeções:</span> {v.resumoIa.objecoes}</p>
                                  )}
                                  {v.resumoIa.proximoPasso && (
                                    <p>
                                      <span className="font-semibold text-gray-700 dark:text-gray-300">Próximo passo:</span> {v.resumoIa.proximoPasso}
                                      {v.resumoIa.proximoPrazo ? ` (${fmtDataCurta(v.resumoIa.proximoPrazo)})` : ''}
                                    </p>
                                  )}
                                </div>
                              )}

                              {v.motivoNaoRealizada && v.status !== 'visitado' && (
                                <p className="mt-2 text-xs text-red-700">
                                  <span className="font-semibold">Motivo:</span> {v.motivoNaoRealizada}
                                </p>
                              )}

                              {/* Botões de execução da visita no celular */}
                              {podeEditarRoteiro && (
                                <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={checkinLoadingId === v.id}
                                    onClick={() => realizarCheckin(v)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-semibold"
                                  >
                                    <MapPinIcon className="h-3.5 w-3.5" />
                                    {checkinLoadingId === v.id ? 'Obtendo GPS...' : v.checkinEm ? 'Refazer check-in' : 'Check-in GPS'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setGravadorVisita(v)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                      temRascunhoIA
                                        ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    <MicrophoneIcon className="h-3.5 w-3.5" />
                                    {temRascunhoIA ? 'Revisar e confirmar resumo' : v.resumoConfirmado ? 'Editar resumo / regravar' : 'Gravar reunião'}
                                  </button>

                                  {v.status !== 'visitado' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setMotivoNaoRealizadaModal({ visita: v, texto: v.motivoNaoRealizada || '' })}
                                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-medium"
                                      >
                                        Visita não realizada
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setNaoLocalizadoModal({ visita: v, obs: '' })}
                                        className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-medium"
                                      >
                                        Estabelecimento não localizado
                                      </button>
                                    </>
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
              })
            )}
          </div>
        )}

        {/* ─── ABA 2: MONTAGEM / SELEÇÃO DE LEADS E CLIENTES (CIDADE, REGIÃO, RAIO KM) ─── */}
        {abaDetalhe === 'montar' && podeEditarRoteiro && (
          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Selecionar leads e clientes para visitar</h2>
                <p className="text-xs text-gray-500">
                  Filtre por UF, uma ou várias cidades e/ou raio em km (ex.: escolher duas cidades + raio de 50 km).
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setImportVendedorId(String(m.vendedorId || userId)); setShowImportModal(true) }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                Importar planilha Excel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Buscar por nome ou CNPJ</label>
                <input
                  type="text"
                  placeholder="Razão social, fantasia, CNPJ..."
                  value={buscaLead}
                  onChange={e => setBuscaLead(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">UF (Região)</label>
                <select
                  value={filtroUfLead}
                  onChange={e => { setFiltroUfLead(e.target.value); setCidadesSelecionadasFiltro([]) }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                >
                  <option value="">Todas as UFs</option>
                  {ufsDisponiveis.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Adicionar cidade ao filtro</label>
                <select
                  value=""
                  onChange={e => {
                    const v = e.target.value
                    if (v && !cidadesSelecionadasFiltro.includes(v)) {
                      setCidadesSelecionadasFiltro(prev => [...prev, v])
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                >
                  <option value="">Escolher cidade(s)...</option>
                  {cidadesDisponiveis.map(cid => <option key={cid} value={cid}>{cid}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Cidade ref. raio</label>
                  <input
                    type="text"
                    placeholder="Opcional..."
                    value={cidadeRaioInput}
                    onChange={e => setCidadeRaioInput(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Raio (km)</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    placeholder="Ex.: 50"
                    value={raioKmFiltro}
                    onChange={e => setRaioKmFiltro(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-700 rounded-xl tabular-nums bg-white dark:bg-gray-800"
                  />
                </div>
              </div>
            </div>

            {cidadesSelecionadasFiltro.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">Cidades selecionadas:</span>
                {cidadesSelecionadasFiltro.map(cid => (
                  <span key={cid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-50 text-primary-800 border border-primary-200 text-xs font-medium">
                    {cid}
                    <button
                      type="button"
                      onClick={() => setCidadesSelecionadasFiltro(prev => prev.filter(x => x !== cid))}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => { setCidadesSelecionadasFiltro([]); setRaioKmFiltro(''); setCidadeRaioInput('') }}
                  className="text-xs text-gray-400 hover:text-gray-700 ml-1"
                >
                  Limpar filtro
                </button>
              </div>
            )}

            {geocodificandoRaio && (
              <p className="text-xs text-gray-400">Calculando raio geográfico das cidades selecionadas...</p>
            )}

            {/* Barra de seleção em lote + botão incluir no Dia X */}
            <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {clientesFiltradosMontagem.length} encontrado(s) · {idsSelecionadosParaAdicionar.size} marcado(s)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const elegiveis = clientesFiltradosMontagem.filter(c => !idsJaNoRoteiro.has(c.id)).map(c => c.id)
                    setIdsSelecionadosParaAdicionar(new Set(elegiveis))
                  }}
                  className="text-primary-600 font-semibold hover:underline"
                >
                  Selecionar todos os filtrados
                </button>
                {idsSelecionadosParaAdicionar.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setIdsSelecionadosParaAdicionar(new Set())}
                    className="text-gray-500 hover:underline"
                  >
                    Desmarcar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="text-gray-600 dark:text-gray-300 font-medium">Incluir no:</label>
                <select
                  value={diaDestinoAdicao}
                  onChange={e => setDiaDestinoAdicao(Number(e.target.value))}
                  className="px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 font-semibold"
                >
                  {Array.from({ length: diasDaMissao }, (_, idx) => idx + 1).map(d => (
                    <option key={d} value={d}>Dia {d} ({fmtDataCurta(dataDoDiaMissao(m.dataSaida, d))})</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={idsSelecionadosParaAdicionar.size === 0 || salvandoRoteiro}
                  onClick={() => void adicionarSelecionadosAoDia()}
                  className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white font-semibold rounded-lg"
                >
                  Incluir ({idsSelecionadosParaAdicionar.size})
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              {clientesFiltradosMontagem.slice(0, 250).map(c => {
                const jaEsta = idsJaNoRoteiro.has(c.id)
                const marcado = idsSelecionadosParaAdicionar.has(c.id)
                return (
                  <label
                    key={c.id}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${jaEsta ? 'opacity-55 bg-gray-50/60' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        disabled={jaEsta}
                        checked={marcado || jaEsta}
                        onChange={e => {
                          setIdsSelecionadosParaAdicionar(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(c.id)
                            else next.delete(c.id)
                            return next
                          })
                        }}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {c.nomeFantasia || c.razaoSocial}
                        </p>
                        <p className="text-gray-500 truncate">
                          {[c.cnpj, c.segmento, c.enderecoCidade && `${c.enderecoCidade}/${c.enderecoEstado || ''}`].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap">
                      {jaEsta ? 'Já no roteiro' : c.etapa}
                    </span>
                  </label>
                )
              })}
              {clientesFiltradosMontagem.length === 0 && (
                <p className="text-xs text-gray-400 py-8 text-center">Nenhum cliente/lead encontrado com esses filtros.</p>
              )}
            </div>
          </div>
        )}

        {/* ─── ABA 3: DESPESAS SIMPLES (ITEM 6: 8 CLASSES + FOTO COMPROVANTE + PREVISTO x REALIZADO) ─── */}
        {abaDetalhe === 'despesas' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Lançar despesa na missão</h2>
              <form onSubmit={salvarDespesa} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Classe</label>
                    <select
                      value={despesaForm.tipo}
                      onChange={e => setDespesaForm({ ...despesaForm, tipo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                    >
                      {CLASSES_DESPESA_MISSAO.map(cls => (
                        <option key={cls} value={cls}>{CLASSE_DESPESA_LABEL[cls]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Valor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={despesaForm.valor}
                      onChange={e => setDespesaForm({ ...despesaForm, valor: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl tabular-nums bg-white dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Data</label>
                    <input
                      type="date"
                      value={despesaForm.data}
                      onChange={e => setDespesaForm({ ...despesaForm, data: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Observação (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex.: Posto BR-381, recibo estacionamento..."
                    value={despesaForm.observacao}
                    onChange={e => setDespesaForm({ ...despesaForm, observacao: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Foto do comprovante</label>
                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 text-gray-600">
                    <PhotoIcon className="h-4 w-4" />
                    <span className="truncate">
                      {despesaForm.comprovanteNome || 'Tirar foto ou anexar comprovante'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      onChange={e => selecionarFotoComprovante(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={salvandoDespesa}
                  className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold rounded-xl"
                >
                  {salvandoDespesa ? 'Salvando despesa...' : 'Registrar despesa'}
                </button>
              </form>

              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Lançamentos realizados</p>
                {detalhe.despesas.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhuma despesa lançada nesta missão.</p>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto text-xs">
                    {detalhe.despesas.map(d => (
                      <div key={d.id} className="py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 dark:text-gray-100">
                            {CLASSE_DESPESA_LABEL[d.tipo as keyof typeof CLASSE_DESPESA_LABEL] || d.tipo} · {fmtDataCurta(d.data)}
                          </p>
                          {d.observacao && <p className="text-gray-500 truncate">{d.observacao}</p>}
                          {d.comprovanteUrl && (
                            <a
                              href={d.comprovanteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary-600 hover:underline font-medium"
                            >
                              Ver comprovante
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold tabular-nums text-gray-900 dark:text-white">{fmtBRL(d.valor)}</span>
                          {podeEditarRoteiro && (
                            <button
                              type="button"
                              onClick={() => void excluirDespesa(d.id)}
                              className="text-gray-400 hover:text-red-600 p-1"
                              title="Excluir despesa"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Resumo por classe + Previsto x Realizado */}
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Total por classe e Previsto × Realizado</h2>
              <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500">Previsto total</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">{fmtBRL(resumoDespesas.custoPrevisto)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500">Realizado total</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">{fmtBRL(resumoDespesas.totalRealizado)}</p>
                </div>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-800 text-xs tabular-nums">
                {CLASSES_DESPESA_MISSAO.map(cls => (
                  <div key={cls} className="py-2 flex items-center justify-between">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{CLASSE_DESPESA_LABEL[cls]}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{fmtBRL(resumoDespesas.porClasse[cls])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Gravação de Reunião + Resumo IA Editável */}
        {gravadorVisita && (
          <MissaoGravadorModal
            visita={gravadorVisita}
            clienteNome={clienteById.get(gravadorVisita.clienteId)?.razaoSocial || `Cliente #${gravadorVisita.clienteId}`}
            vendedorId={userId}
            onClose={() => setGravadorVisita(null)}
            onQueuedOffline={() => { void listarGravacoesOffline(isGerente ? undefined : userId).then(l => setOfflineCount(l.length)) }}
            onSavedVisita={(visitaUpd, ultimaInteracaoISO) => {
              setDetalhe(prev => prev ? {
                ...prev,
                visitas: prev.visitas.map(v => v.id === visitaUpd.id ? visitaUpd : v),
              } : null)
              if (ultimaInteracaoISO && setClientes) {
                setClientes(prev => prev.map(c => c.id === visitaUpd.clienteId ? { ...c, ultimaInteracao: ultimaInteracaoISO } : c))
              }
              void carregarLista()
            }}
            showToast={showToast}
          />
        )}

        {/* Modal Motivo de Visita Não Realizada */}
        {motivoNaoRealizadaModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 p-5 w-full max-w-md space-y-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Motivo da visita não realizada</h3>
              <textarea
                rows={3}
                placeholder="Descreva obrigatoriamente por que a visita não pôde ser realizada..."
                value={motivoNaoRealizadaModal.texto}
                onChange={e => setMotivoNaoRealizadaModal({ ...motivoNaoRealizadaModal, texto: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMotivoNaoRealizadaModal(null)} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
                <button type="button" onClick={() => void confirmarNaoRealizada()} className="px-4 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-xl">Salvar motivo</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Estabelecimento Não Localizado */}
        {naoLocalizadoModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 p-5 w-full max-w-md space-y-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Estabelecimento não localizado</h3>
              <p className="text-xs text-gray-500">
                Use quando o estabelecimento não existir no endereço ou estiver fechado em definitivo. O gestor receberá o alerta para decidir se descarta o lead.
              </p>
              <textarea
                rows={2}
                placeholder="Observação opcional (ex.: imóvel vazio, placa de aluga-se...)"
                value={naoLocalizadoModal.obs}
                onChange={e => setNaoLocalizadoModal({ ...naoLocalizadoModal, obs: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setNaoLocalizadoModal(null)} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
                <button type="button" onClick={() => void confirmarNaoLocalizado()} className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-xl">Registrar e enviar ao gestor</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Recusa da Missão pelo Gestor */}
        {recusaMissaoModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 p-5 w-full max-w-md space-y-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Recusar missão</h3>
              <textarea
                rows={3}
                placeholder="Informe o motivo da recusa para o vendedor ajustar..."
                value={recusaMissaoModal.motivo}
                onChange={e => setRecusaMissaoModal({ ...recusaMissaoModal, motivo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRecusaMissaoModal(null)} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
                <button type="button" onClick={() => void confirmarRecusaMissaoGestor()} className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-xl">Confirmar recusa</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // TELA PRINCIPAL: LISTA DE ACOMPANHAMENTO DE MISSÕES + IMPORTAÇÃO EXCEL
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FlagIcon className="h-6 w-6 text-primary-600" />
            Missões · Viagens dos Vendedores
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Planejamento de roteiro por cidade/raio, check-in por GPS, gravação com resumo por IA e despesas de viagem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setImportVendedorId(String(userId || '')); setShowImportModal(true) }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Importar leads (Excel)
          </button>
          {isGerente && onNavigateParametros && (
            <button
              type="button"
              onClick={onNavigateParametros}
              className="px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50"
            >
              Parâmetros (km / diária / raio)
            </button>
          )}
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-apple-sm"
          >
            <PlusIcon className="h-4 w-4" />
            Nova missão
          </button>
        </div>
      </div>

      {/* Fila do gestor: Estabelecimento não localizado (Item 4) */}
      {isGerente && naoLocalizadosPendentes.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-700" />
            <h2 className="text-xs sm:text-sm font-bold text-amber-950">
              Estabelecimentos não localizados aguardando sua decisão ({naoLocalizadosPendentes.length})
            </h2>
          </div>
          <div className="divide-y divide-amber-200/70 text-xs">
            {naoLocalizadosPendentes.map((row: any) => (
              <div key={row.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    {row.clientes?.razao_social || `Cliente #${row.cliente_id}`}
                    {row.clientes?.endereco_cidade ? ` · ${row.clientes.endereco_cidade}/${row.clientes.endereco_estado || ''}` : ''}
                  </p>
                  <p className="text-gray-600">
                    Missão: {row.missoes?.nome || `#${row.missao_id}`} · {row.motivo_nao_realizada || 'Não localizado'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void decidirDescarteGestor(row.id, 'mantido')}
                    className="px-3 py-1 rounded-lg bg-white border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
                  >
                    Manter lead
                  </button>
                  <button
                    type="button"
                    onClick={() => void decidirDescarteGestor(row.id, 'descartado')}
                    className="px-3 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
                  >
                    Descartar lead
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário Nova Missão (mantém todos os campos originais + saída e hospedagem) */}
      {criando && (
        <form onSubmit={criarMissao} className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-apple-sm border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Nova missão</h2>
            <button type="button" onClick={() => setCriando(false)} className="text-gray-400 hover:text-gray-700">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome da missão *</label>
              <input
                required
                placeholder="Ex.: Rota Triângulo Mineiro"
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Objetivo</label>
              <input
                placeholder="Prospecção e visita a clientes ativos"
                value={form.objetivo}
                onChange={e => setForm({ ...form, objetivo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>

            {isGerente && (
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Vendedor (1 por missão)</label>
                <select
                  value={form.vendedorId}
                  onChange={e => setForm({ ...form, vendedorId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                >
                  {vendedores.filter(v => v.ativo).map(v => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Data de saída *</label>
              <input
                type="date"
                required
                value={form.dataSaida}
                onChange={e => setForm({ ...form, dataSaida: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Data de retorno *</label>
              <input
                type="date"
                required
                value={form.dataRetorno}
                onChange={e => setForm({ ...form, dataRetorno: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Veículo</label>
              <input
                placeholder="Ex.: Frota / Próprio"
                value={form.veiculo}
                onChange={e => setForm({ ...form, veiculo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Hotel</label>
              <input
                placeholder="Nome do hotel (opcional)"
                value={form.hotel}
                onChange={e => setForm({ ...form, hotel: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Cidades-alvo (vírgula)</label>
              <input
                placeholder="Ex.: Uberlândia, Araguari"
                value={form.cidades}
                onChange={e => setForm({ ...form, cidades: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Cidade de saída / retorno</label>
              <input
                placeholder="Ex.: Belo Horizonte - MG"
                value={form.cidadeOrigem}
                onChange={e => setForm({ ...form, cidadeOrigem: e.target.value, cidadeRetorno: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Hospedagem informada (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.hospedagemPrevista}
                onChange={e => setForm({ ...form, hospedagemPrevista: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl tabular-nums bg-white dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Custo estimado manual (opcional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Calculado automaticamente pelo roteiro"
                value={form.custoEstimado}
                onChange={e => setForm({ ...form, custoEstimado: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl tabular-nums bg-white dark:bg-gray-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCriando(false)} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl">
              Criar e montar visitas
            </button>
          </div>
        </form>
      )}

      {/* Lista de acompanhamento das missões (Item 7) */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-apple-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isGerente && (
              <select
                value={filtroVendedorLista}
                onChange={e => setFiltroVendedorLista(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800"
              >
                <option value="">Todos os vendedores</option>
                {vendedores.filter(v => v.ativo).map(v => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            )}
            <select
              value={filtroStatusLista}
              onChange={e => setFiltroStatusLista(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void carregarLista()}
            className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg"
            title="Atualizar"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {missoesFiltradas.map(m => {
            const vend = vendedores.find(v => v.id === m.vendedorId)
            const st = STATUS_LABEL[m.status] || STATUS_LABEL.planejada
            const previsto = m.custoPrevisto != null && m.custoPrevisto > 0 ? m.custoPrevisto : (m.custoEstimado || 0)
            const realizado = m.custoRealizadoTotal || 0
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => void abrirMissao(m.id)}
                className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-gray-900 dark:text-white">{m.nome}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Vendedor: <span className="font-semibold text-gray-700 dark:text-gray-300">{vend?.nome || `#${m.vendedorId}`}</span>
                    {' · '}Período: <span className="tabular-nums">{fmtDataCurta(m.dataSaida)} a {fmtDataCurta(m.dataRetorno)}</span>
                    {m.cidades && m.cidades.length > 0 ? ` · ${m.cidades.join(', ')}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-gray-400">Visitas (realizadas/planejadas)</p>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {m.visitasRealizadasCount ?? 0} / {m.visitasPlanejadasCount ?? 0}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-gray-400">Custo (realizado / previsto)</p>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {fmtBRL(realizado)} <span className="text-gray-400 font-normal">/ {fmtBRL(previsto)}</span>
                    </p>
                  </div>
                </div>
              </button>
            )
          })}

          {missoesFiltradas.length === 0 && !loading && (
            <p className="p-8 text-center text-xs text-gray-400">
              Nenhuma missão cadastrada. Clique em &ldquo;Nova missão&rdquo; para planejar uma viagem.
            </p>
          )}
        </div>
      </div>

      {/* Modal de Importação Excel de Leads por Vendedor (Item 1) */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-gray-700 p-5 w-full max-w-lg space-y-4 my-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Importar planilha de leads (Excel)</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cruza automaticamente pelo CNPJ: o que já existe no CRM não é duplicado, e os novos entram como prospectos na carteira do vendedor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowImportModal(false); setImportPreview(null) }}
                className="text-gray-400 hover:text-gray-700"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {isGerente && (
              <div className="text-xs">
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Vendedor dono da planilha
                </label>
                <select
                  value={importVendedorId}
                  onChange={e => setImportVendedorId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
                >
                  {vendedores.filter(v => v.ativo).map(v => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex flex-col items-center justify-center gap-1.5 p-5 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 text-xs text-gray-600">
              <ArrowUpTrayIcon className="h-6 w-6 text-gray-400" />
              <span className="font-semibold">
                {importPreview ? importPreview.nomeArquivo : 'Clique para escolher arquivo .xlsx, .xls ou .csv'}
              </span>
              <span className="text-[11px] text-gray-400">
                Colunas reconhecidas: CNPJ, Razão Social, Nome Fantasia, Cidade/Município, UF, Endereço, Telefone, E-mail, Segmento
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivoPlanilha(f) }}
                className="hidden"
              />
            </label>

            {importPreview && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3.5 text-xs space-y-1.5 tabular-nums">
                <p className="font-semibold text-emerald-700">
                  Novos leads prontos para importar: {importPreview.novosLeads.length}
                </p>
                <p className="text-gray-600 dark:text-gray-300">
                  CNPJs já cadastrados no CRM (ignorados sem duplicar): {importPreview.duplicadosNoCrm.length}
                </p>
                {importPreview.duplicadosNaPlanilha.length > 0 && (
                  <p className="text-gray-500">
                    CNPJs repetidos na própria planilha: {importPreview.duplicadosNaPlanilha.length}
                  </p>
                )}
                {importPreview.invalidosSemCnpj > 0 && (
                  <p className="text-gray-400">
                    Linhas sem CNPJ de 14 dígitos ou sem nome: {importPreview.invalidosSemCnpj}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowImportModal(false); setImportPreview(null) }}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!importPreview || importPreview.novosLeads.length === 0 || importando}
                onClick={() => void confirmarImportacaoLeads()}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-xs font-semibold rounded-xl"
              >
                {importando ? 'Importando...' : `Importar ${importPreview?.novosLeads.length || 0} lead(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
