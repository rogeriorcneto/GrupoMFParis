import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentArrowDownIcon,
  FlagIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import * as XLSX from 'xlsx'
import type {
  Atividade,
  Cliente,
  Interacao,
  Missao,
  Pedido,
  Produto,
  PropostaHistorico,
  Tarefa,
  Vendedor,
} from '../../types'
import type { ClientePanelFocus } from '../ClientePanel'
import { authFetch, BOT_URL, fetchTempoTelaRelatorio, type TempoTelaRelatorioItem } from '../../lib/botApi'
import {
  EvolucaoSemanalSnapshot,
  fetchAllPropostas,
  fetchEvolucaoSemanal,
  moverEmpresasEntreCarteiras,
  salvarSnapshotEvolucaoSemanal,
} from '../../lib/database'
import { useParametrosListas } from '../../lib/parametrosListas'
import { CADASTRO_CAMPO_LABEL, SITUACAO_CADASTRO_CONFIG, SituacaoCadastro } from '../../utils/cadastroCompleto'
import { stageLabels } from '../../utils/constants'
import { diasEtapaAtual } from '../../utils/etapas'
import { criarMapaUltimaProposta, valorPropostaAtivaCard } from '../../utils/indicadores-comerciais'
import {
  CADENCIA_CONFIG,
  calcularIndicadoresGrupo,
  CANAL_RELATORIO_LABEL,
  canalEfetivoTarefa,
  CanalRelatorio,
  consolidarEmpresasFase2,
  dataConclusaoISO,
  detectarSinaisIrregulares,
  EmpresaConsolidada,
  FILTROS_RELATORIO_PADRAO,
  FiltrosRelatorioFase2,
  IndicadoresVendedorFase2,
  intervaloDatasFiltro,
  OBJETIVO_RELATORIO_LABEL,
  objetivoEfetivoTarefa,
  ObjetivoRelatorio,
  StatusCadencia,
} from '../../utils/relatoriosFase2'
import { SITUACAO_COMPRA_CONFIG, SituacaoCompra } from '../../utils/situacaoCompra'
import { inferirOrigemTarefa } from '../../utils/tarefaFluxo'

type AbaRelatorio = 'visao_geral' | 'tarefas_cadencia' | 'cadastros' | 'funil_vendas' | 'bancos' | 'missoes'

interface DrilldownRow {
  key: string
  empresa?: EmpresaConsolidada
  clienteCard?: Cliente
  focus?: ClientePanelFocus
  extraInfo?: string
  diasOrdenacao?: number
}

interface DrilldownState {
  titulo: string
  formula?: string
  rows: DrilldownRow[]
}

type SortCol = 'cliente' | 'situacaoCompra' | 'situacaoCadastro' | 'diasSemContato' | 'ultimoContato' | 'proximaTarefa' | 'segmento'

const PAGE_SIZE = 20

function fmtMoeda(v: number): string {
  return `R$ ${Math.round(v || 0).toLocaleString('pt-BR')}`
}

function fmtHoras(seg: number): string {
  const h = Math.floor((seg || 0) / 3600)
  const m = Math.floor(((seg || 0) % 3600) / 60)
  return `${h}h${String(m).padStart(2, '0')}m`
}

function fmtDataCurta(iso?: string | null): string {
  if (!iso) return '—'
  const clean = iso.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : clean
}

function segundaFeiraISO(d = new Date()): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const seg = new Date(d)
  seg.setDate(d.getDate() + diff)
  return `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, '0')}-${String(seg.getDate()).padStart(2, '0')}`
}

interface RelatoriosViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  produtos?: Produto[]
  pedidos?: Pedido[]
  tarefas?: Tarefa[]
  atividades?: Atividade[]
  loggedUser?: Vendedor | null
  onOpenCliente?: (cliente: Cliente, focus?: ClientePanelFocus) => void
  setClientes?: React.Dispatch<React.SetStateAction<Cliente[]>>
  setTarefas?: React.Dispatch<React.SetStateAction<Tarefa[]>>
  setInteracoes?: React.Dispatch<React.SetStateAction<Interacao[]>>
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

const BarraHorizontalItem: React.FC<{
  label: string
  valorTexto: string
  pct: number
  cor: string
  formula?: string
  onClick?: () => void
}> = ({ label, valorTexto, pct, cor, formula, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={formula}
    className="w-full text-left group hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors cursor-pointer"
  >
    <div className="flex items-center justify-between gap-2 text-xs mb-1">
      <span className="font-medium text-gray-700 group-hover:text-primary-700 truncate">{label}</span>
      <span className="font-bold text-gray-900 whitespace-nowrap">{valorTexto}</span>
    </div>
    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300 group-hover:brightness-95"
        style={{ width: `${Math.max(pct > 0 ? 4 : 0, Math.min(100, pct))}%`, backgroundColor: cor }}
      />
    </div>
  </button>
)

const RelatoriosView: React.FC<RelatoriosViewProps> = ({
  clientes: clientesProp,
  vendedores,
  interacoes: _interacoes,
  pedidos = [],
  tarefas = [],
  loggedUser = null,
  onOpenCliente,
  setClientes,
  setTarefas,
  setInteracoes,
  showToast,
}) => {
  const isGerente = !loggedUser || loggedUser.cargo === 'gerente'
  const { parametros } = useParametrosListas()
  const camposObrigatorios = parametros.camposCadastroObrigatorios

  const [aba, setAba] = useState<AbaRelatorio>(isGerente ? 'visao_geral' : 'tarefas_cadencia')
  const [filtros, setFiltros] = useState<FiltrosRelatorioFase2>(() => ({
    ...FILTROS_RELATORIO_PADRAO,
    vendedorId: isGerente ? 'todos' : (loggedUser?.id ?? 'todos'),
  }))
  const [vendedorNivel2Id, setVendedorNivel2Id] = useState<number | 'banco_clientes' | 'banco_prospectos' | null>(
    isGerente ? null : (loggedUser?.id ?? null)
  )
  const [abaCadenciaNivel2, setAbaCadenciaNivel2] = useState<StatusCadencia | 'todas'>('vermelho')

  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null)
  const [drillSearch, setDrillSearch] = useState('')
  const [drillSortCol, setDrillSortCol] = useState<SortCol>('diasSemContato')
  const [drillSortDir, setDrillSortDir] = useState<'asc' | 'desc'>('desc')
  const [drillPage, setDrillPage] = useState(1)
  const drillRef = useRef<HTMLDivElement>(null)

  const [perdidosPage, setPerdidosPage] = useState(1)
  const [tempoEtapaPage, setTempoEtapaPage] = useState(1)

  const [bancoSubAba, setBancoSubAba] = useState<'clientes' | 'prospectos'>('clientes')
  const [bancoSearch, setBancoSearch] = useState('')
  const [bancoPage, setBancoPage] = useState(1)
  const [selecionadosChaves, setSelecionadosChaves] = useState<Set<string>>(new Set())
  const [destinoRedistribuicao, setDestinoRedistribuicao] = useState<string>('')
  const [movendoLote, setMovendoLote] = useState(false)

  const [propostasLoaded, setPropostasLoaded] = useState<PropostaHistorico[]>([])
  const [missoes, setMissoes] = useState<Missao[]>([])
  const [ttRelatorio, setTtRelatorio] = useState<TempoTelaRelatorioItem[]>([])
  const [evolucaoSemanal, setEvolucaoSemanal] = useState<EvolucaoSemanalSnapshot[]>([])
  const snapshotSalvoRef = useRef(false)

  // Garante isolamento quando logado como vendedor
  useEffect(() => {
    if (!isGerente && loggedUser?.id) {
      setFiltros(prev => ({ ...prev, vendedorId: loggedUser.id }))
      setVendedorNivel2Id(loggedUser.id)
      if (aba === 'visao_geral' || aba === 'bancos') setAba('tarefas_cadencia')
    }
  }, [isGerente, loggedUser?.id])

  useEffect(() => {
    fetchAllPropostas().then(setPropostasLoaded).catch(() => {})
    fetchEvolucaoSemanal().then(setEvolucaoSemanal).catch(() => {})
    authFetch(`${BOT_URL}/api/missoes?status=em_andamento`)
      .then(r => r.json())
      .then(r => setMissoes(r.data || []))
      .catch(() => {})
  }, [])

  const { inicioISO, fimISO } = useMemo(() => intervaloDatasFiltro(filtros), [filtros.periodo, filtros.dataInicio, filtros.dataFim])

  useEffect(() => {
    const ini = inicioISO === '0001-01-01' ? `${new Date().getFullYear()}-01-01` : inicioISO
    fetchTempoTelaRelatorio(ini, fimISO)
      .then(r => setTtRelatorio(r.relatorio || []))
      .catch(() => setTtRelatorio([]))
  }, [inicioISO, fimISO])

  // Consolidação global das empresas
  const { empresas: todasEmpresasBrutas, empresaPorCardId } = useMemo(
    () => consolidarEmpresasFase2(clientesProp, pedidos, tarefas, camposObrigatorios),
    [clientesProp, pedidos, tarefas, camposObrigatorios]
  )

  // Escopo de visibilidade por perfil (Item 7: vendedor nunca vê outros vendedores nem bancos)
  const empresasVisiveisPerfil = useMemo(() => {
    if (isGerente) return todasEmpresasBrutas
    if (!loggedUser) return []
    return todasEmpresasBrutas.filter(e => e.vendedorId === loggedUser.id)
  }, [todasEmpresasBrutas, isGerente, loggedUser?.id])

  const segmentosDisponiveis = useMemo(() => {
    const s = new Set<string>()
    for (const o of parametros.listas.segmento_cliente || []) if (o.ativo && o.valor) s.add(o.valor)
    for (const e of empresasVisiveisPerfil) if (e.segmento) s.add(e.segmento)
    return Array.from(s).sort()
  }, [parametros.listas.segmento_cliente, empresasVisiveisPerfil])

  const ufsDisponiveis = useMemo(() => {
    const s = new Set<string>()
    for (const e of empresasVisiveisPerfil) if (e.uf) s.add(e.uf)
    return Array.from(s).sort()
  }, [empresasVisiveisPerfil])

  // Aplicação dos filtros da barra fixa no topo
  const empresasFiltradas = useMemo(() => {
    return empresasVisiveisPerfil.filter(e => {
      if (filtros.vendedorId === 'banco_clientes') {
        if (e.banco !== 'clientes') return false
      } else if (filtros.vendedorId === 'banco_prospectos') {
        if (e.banco !== 'prospectos') return false
      } else if (typeof filtros.vendedorId === 'number') {
        if (e.vendedorId !== filtros.vendedorId) return false
      }
      if (filtros.cadencia !== 'todos' && e.cadencia !== filtros.cadencia) return false
      if (filtros.situacaoCompra !== 'todos' && e.situacaoCompra !== filtros.situacaoCompra) return false
      if (filtros.situacaoCadastro !== 'todos' && e.situacaoCadastro !== filtros.situacaoCadastro) return false
      if (filtros.segmento !== 'todos' && e.segmento !== filtros.segmento) return false
      if (filtros.uf !== 'todos' && e.uf !== filtros.uf) return false
      return true
    })
  }, [empresasVisiveisPerfil, filtros])

  const cardIdsFiltrados = useMemo(
    () => new Set(empresasFiltradas.flatMap(e => e.cards.map(c => c.id))),
    [empresasFiltradas]
  )

  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter(t => {
      if (!isGerente && loggedUser && t.vendedorId !== loggedUser.id) return false
      if (typeof filtros.vendedorId === 'number' && t.vendedorId !== filtros.vendedorId) return false
      if ((filtros.vendedorId === 'banco_clientes' || filtros.vendedorId === 'banco_prospectos') && (!t.clienteId || !cardIdsFiltrados.has(t.clienteId))) return false
      if (t.clienteId && (filtros.segmento !== 'todos' || filtros.uf !== 'todos' || filtros.situacaoCompra !== 'todos' || filtros.situacaoCadastro !== 'todos' || filtros.cadencia !== 'todos')) {
        if (!cardIdsFiltrados.has(t.clienteId)) return false
      }
      if (filtros.canal !== 'todos' && canalEfetivoTarefa(t) !== filtros.canal) return false
      if (filtros.objetivo !== 'todos' && objetivoEfetivoTarefa(t) !== filtros.objetivo) return false
      if (filtros.origemTarefa !== 'todos' && inferirOrigemTarefa(t) !== filtros.origemTarefa) return false
      return true
    })
  }, [tarefas, isGerente, loggedUser?.id, filtros, cardIdsFiltrados])

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(p => {
      if (!isGerente && loggedUser && p.vendedorId !== loggedUser.id && !cardIdsFiltrados.has(p.clienteId)) return false
      if (!cardIdsFiltrados.has(p.clienteId)) return false
      return true
    })
  }, [pedidos, isGerente, loggedUser?.id, cardIdsFiltrados])

  const tempoPorVendedor = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of ttRelatorio) m.set(r.vendedorId, r.totalSegundos)
    return m
  }, [ttRelatorio])

  const todosSinaisIrregulares = useMemo(
    () => isGerente ? detectarSinaisIrregulares(tarefasFiltradas, vendedores, empresaPorCardId) : [],
    [isGerente, tarefasFiltradas, vendedores, empresaPorCardId]
  )

  // Indicadores por vendedor (Item 6 e Item 7: todos aparecem na tabela; entram nos totais só ativos com clientes na carteira)
  const linhasVendedores = useMemo(() => {
    const lista = isGerente ? vendedores : vendedores.filter(v => v.id === loggedUser?.id)
    return lista
      .map(v => {
        const emps = empresasFiltradas.filter(e => e.vendedorId === v.id)
        const cardIdsV = new Set(emps.flatMap(e => e.cards.map(c => c.id)))
        const tars = tarefasFiltradas.filter(t => t.vendedorId === v.id || (t.clienteId != null && cardIdsV.has(t.clienteId) && !t.vendedorId))
        const peds = pedidosFiltrados.filter(p => cardIdsV.has(p.clienteId))
        const somaNosTotais = v.ativo !== false && emps.length > 0
        return calcularIndicadoresGrupo({
          id: v.id,
          nome: v.nome,
          ativo: v.ativo !== false,
          somaNosTotais,
          empresasGrupo: emps,
          tarefasGrupo: tars,
          pedidosGrupo: peds,
          propostas: propostasLoaded,
          empresaPorCardId,
          tempoAtivoSegundos: tempoPorVendedor.get(v.id) || 0,
          sinaisIrregulares: todosSinaisIrregulares.filter(s => s.vendedorId === v.id),
          inicioPeriodoISO: inicioISO,
          fimPeriodoISO: fimISO,
        })
      })
      .filter(ind => ind.ativo || ind.totalEmpresas > 0 || ind.tarefasFinalizadasMes.length > 0)
      .sort((a, b) => Number(b.ativo) - Number(a.ativo) || b.carteira180.length - a.carteira180.length || a.vendedorNome.localeCompare(b.vendedorNome))
  }, [isGerente, vendedores, loggedUser?.id, empresasFiltradas, tarefasFiltradas, pedidosFiltrados, propostasLoaded, empresaPorCardId, tempoPorVendedor, todosSinaisIrregulares, inicioISO, fimISO])

  // Linhas separadas dos dois Bancos (Item 6 e Item 10: não entram nos totais de vendedores)
  const linhaBancoClientes = useMemo(() => {
    const emps = todasEmpresasBrutas.filter(e => e.banco === 'clientes').filter(e => {
      if (filtros.segmento !== 'todos' && e.segmento !== filtros.segmento) return false
      if (filtros.uf !== 'todos' && e.uf !== filtros.uf) return false
      return true
    })
    const ids = new Set(emps.flatMap(e => e.cards.map(c => c.id)))
    return calcularIndicadoresGrupo({
      id: 'banco_clientes',
      nome: 'Banco de Clientes',
      ativo: true,
      somaNosTotais: false,
      empresasGrupo: emps,
      tarefasGrupo: tarefas.filter(t => t.clienteId != null && ids.has(t.clienteId)),
      pedidosGrupo: pedidos.filter(p => ids.has(p.clienteId)),
      propostas: propostasLoaded,
      empresaPorCardId,
      inicioPeriodoISO: inicioISO,
      fimPeriodoISO: fimISO,
    })
  }, [todasEmpresasBrutas, filtros.segmento, filtros.uf, tarefas, pedidos, propostasLoaded, empresaPorCardId, inicioISO, fimISO])

  const linhaBancoProspectos = useMemo(() => {
    const emps = todasEmpresasBrutas.filter(e => e.banco === 'prospectos').filter(e => {
      if (filtros.segmento !== 'todos' && e.segmento !== filtros.segmento) return false
      if (filtros.uf !== 'todos' && e.uf !== filtros.uf) return false
      return true
    })
    const ids = new Set(emps.flatMap(e => e.cards.map(c => c.id)))
    return calcularIndicadoresGrupo({
      id: 'banco_prospectos',
      nome: 'Banco de Prospectos',
      ativo: true,
      somaNosTotais: false,
      empresasGrupo: emps,
      tarefasGrupo: tarefas.filter(t => t.clienteId != null && ids.has(t.clienteId)),
      pedidosGrupo: pedidos.filter(p => ids.has(p.clienteId)),
      propostas: propostasLoaded,
      empresaPorCardId,
      inicioPeriodoISO: inicioISO,
      fimPeriodoISO: fimISO,
    })
  }, [todasEmpresasBrutas, filtros.segmento, filtros.uf, tarefas, pedidos, propostasLoaded, empresaPorCardId, inicioISO, fimISO])

  // Totais da equipe ativa (Item 7: só usuários com cadastro ativo e clientes na carteira; bancos de fora)
  const indTotalAtivos = useMemo(() => {
    if (filtros.vendedorId === 'banco_clientes') return linhaBancoClientes
    if (filtros.vendedorId === 'banco_prospectos') return linhaBancoProspectos
    const idsVendedoresValidos = new Set(
      linhasVendedores.filter(l => typeof filtros.vendedorId === 'number' ? l.vendedorId === filtros.vendedorId : l.somaNosTotais).map(l => l.vendedorId as number)
    )
    const emps = empresasFiltradas.filter(e => e.vendedorId != null && idsVendedoresValidos.has(e.vendedorId))
    const cardIds = new Set(emps.flatMap(e => e.cards.map(c => c.id)))
    const tars = tarefasFiltradas.filter(t => (t.vendedorId != null && idsVendedoresValidos.has(t.vendedorId)) || (t.clienteId != null && cardIds.has(t.clienteId)))
    const peds = pedidosFiltrados.filter(p => cardIds.has(p.clienteId))
    const tempoTotal = [...idsVendedoresValidos].reduce((s, id) => s + (tempoPorVendedor.get(id) || 0), 0)
    return calcularIndicadoresGrupo({
      id: 'equipe',
      nome: typeof filtros.vendedorId === 'number'
        ? (vendedores.find(v => v.id === filtros.vendedorId)?.nome || 'Vendedor')
        : 'Total equipe ativa',
      ativo: true,
      somaNosTotais: true,
      empresasGrupo: emps,
      tarefasGrupo: tars,
      pedidosGrupo: peds,
      propostas: propostasLoaded,
      empresaPorCardId,
      tempoAtivoSegundos: tempoTotal,
      sinaisIrregulares: todosSinaisIrregulares.filter(s => idsVendedoresValidos.has(s.vendedorId)),
      inicioPeriodoISO: inicioISO,
      fimPeriodoISO: fimISO,
    })
  }, [filtros.vendedorId, linhaBancoClientes, linhaBancoProspectos, linhasVendedores, empresasFiltradas, tarefasFiltradas, pedidosFiltrados, propostasLoaded, empresaPorCardId, tempoPorVendedor, todosSinaisIrregulares, vendedores, inicioISO, fimISO])

  // Item 8: garante o registro automático do ponto da semana atual caso ainda não exista
  useEffect(() => {
    if (!isGerente || snapshotSalvoRef.current || linhasVendedores.length === 0) return
    const semAtual = segundaFeiraISO()
    if (evolucaoSemanal.some(s => s.semanaInicio === semAtual)) return
    snapshotSalvoRef.current = true
    const pontos = linhasVendedores
      .filter(l => l.somaNosTotais && typeof l.vendedorId === 'number' && l.carteira180.length > 0)
      .map(l => ({
        vendedorId: l.vendedorId as number,
        vendedorNome: l.vendedorNome,
        carteira180: l.carteira180.length,
        verdes: l.verdes.length,
        pctCarteiraEmDia: l.pctCarteiraEmDia,
        semTarefaAberta: l.semTarefaAberta.length,
        pctCoberturaMes: l.pctCoberturaMes,
        pctCadastrosCompletos: l.pctCadastrosCompletos,
      }))
    if (pontos.length === 0) return
    const novoSnap: EvolucaoSemanalSnapshot = {
      semanaInicio: semAtual,
      registradoEm: new Date().toISOString(),
      pontos,
    }
    salvarSnapshotEvolucaoSemanal(novoSnap, loggedUser?.nome || 'Sistema')
      .then(() => setEvolucaoSemanal(prev => [...prev, novoSnap]))
      .catch(() => {})
  }, [isGerente, evolucaoSemanal, linhasVendedores, loggedUser?.nome])

  // Variação vs semana anterior para os cartões da Visão Geral
  const variacaoSemanaAnterior = useMemo(() => {
    if (evolucaoSemanal.length < 2) return null
    const penultima = evolucaoSemanal[evolucaoSemanal.length - 2]
    if (!penultima) return null
    const totCart = penultima.pontos.reduce((s, p) => s + (p.carteira180 || 0), 0)
    const totVerdes = penultima.pontos.reduce((s, p) => s + (p.verdes || 0), 0)
    const totSemTar = penultima.pontos.reduce((s, p) => s + (p.semTarefaAberta || 0), 0)
    const pctAnt = totCart > 0 ? Math.round((totVerdes / totCart) * 1000) / 10 : 0
    return {
      pctCarteiraEmDiaDiff: Math.round((indTotalAtivos.pctCarteiraEmDia - pctAnt) * 10) / 10,
      semTarefaDiff: indTotalAtivos.semTarefaAberta.length - totSemTar,
    }
  }, [evolucaoSemanal, indTotalAtivos.pctCarteiraEmDia, indTotalAtivos.semTarefaAberta.length])

  // Abertura do painel de Lista Detalhada (Clique 2) na mesma tela
  const abrirListaEmpresas = useCallback((titulo: string, empresas: EmpresaConsolidada[], focus?: ClientePanelFocus, formula?: string) => {
    setDrilldown({
      titulo: `${titulo} · ${empresas.length} cliente${empresas.length === 1 ? '' : 's'}`,
      formula,
      rows: empresas.map(emp => ({
        key: emp.chave,
        empresa: emp,
        clienteCard: emp.cardPrincipal,
        focus,
      })),
    })
    setDrillSearch('')
    setDrillPage(1)
    setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
  }, [])

  const abrirListaCustom = useCallback((titulo: string, rows: DrilldownRow[], sufixo: string, formula?: string) => {
    setDrilldown({
      titulo: `${titulo} · ${rows.length} ${sufixo}`,
      formula,
      rows,
    })
    setDrillSearch('')
    setDrillPage(1)
    setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
  }, [])

  // Linhas filtradas/ordenadas do Drilldown
  const drillRowsOrdenadas = useMemo(() => {
    if (!drilldown) return []
    const q = drillSearch.trim().toLowerCase()
    const qDigits = drillSearch.replace(/\D/g, '')
    const base = !q
      ? drilldown.rows
      : drilldown.rows.filter(r => {
          const nome = (r.empresa?.cardPrincipal.razaoSocial || r.clienteCard?.razaoSocial || r.extraInfo || '').toLowerCase()
          const cnpj = String(r.empresa?.cardPrincipal.cnpj || r.clienteCard?.cnpj || r.empresa?.cardPrincipal.cpf || '')
          return nome.includes(q) || cnpj.toLowerCase().includes(q) || (qDigits.length >= 3 && cnpj.replace(/\D/g, '').includes(qDigits))
        })

    const dir = drillSortDir === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      const ea = a.empresa
      const eb = b.empresa
      if (drillSortCol === 'cliente') {
        return ((ea?.cardPrincipal.razaoSocial || a.clienteCard?.razaoSocial || '').localeCompare(eb?.cardPrincipal.razaoSocial || b.clienteCard?.razaoSocial || '')) * dir
      }
      if (drillSortCol === 'situacaoCompra') {
        return ((SITUACAO_COMPRA_CONFIG[ea?.situacaoCompra || 'prospecto'].ordem) - (SITUACAO_COMPRA_CONFIG[eb?.situacaoCompra || 'prospecto'].ordem)) * dir
      }
      if (drillSortCol === 'situacaoCadastro') {
        return ((ea?.camposFaltantes.length ?? 0) - (eb?.camposFaltantes.length ?? 0)) * dir
      }
      if (drillSortCol === 'ultimoContato') {
        return String(ea?.ultimoContatoISO || '').localeCompare(String(eb?.ultimoContatoISO || '')) * dir
      }
      if (drillSortCol === 'proximaTarefa') {
        return String(ea?.proximaTarefa?.data || '9999').localeCompare(String(eb?.proximaTarefa?.data || '9999')) * dir
      }
      if (drillSortCol === 'segmento') {
        return String(ea?.segmento || '').localeCompare(String(eb?.segmento || '')) * dir
      }
      // default: diasSemContato (null = nunca contatado = maior urgência 999999)
      const da = a.diasOrdenacao ?? (ea?.diasSemContato == null ? 999999 : ea.diasSemContato)
      const dbVal = b.diasOrdenacao ?? (eb?.diasSemContato == null ? 999999 : eb.diasSemContato)
      return (da - dbVal) * dir
    })
  }, [drilldown, drillSearch, drillSortCol, drillSortDir])

  const toggleSortDrill = (col: SortCol) => {
    if (drillSortCol === col) setDrillSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setDrillSortCol(col); setDrillSortDir(col === 'cliente' ? 'asc' : 'desc') }
  }

  // Exportações (Item 7: só gestor)
  const exportarDrilldownExcel = () => {
    if (!isGerente || !drilldown) return
    const dados = drillRowsOrdenadas.map(r => {
      const e = r.empresa
      const cli = e?.cardPrincipal || r.clienteCard
      const vend = e?.vendedorId ? vendedores.find(v => v.id === e.vendedorId)?.nome : (e?.banco === 'clientes' ? 'Banco de Clientes' : e?.banco === 'prospectos' ? 'Banco de Prospectos' : '—')
      return {
        Cliente: cli?.razaoSocial || '—',
        'CNPJ / CPF': cli?.cnpj || cli?.cpf || '—',
        Vendedor: vend || '—',
        'Situação de Compra': e ? SITUACAO_COMPRA_CONFIG[e.situacaoCompra].label : '—',
        'Dias s/ Compra': e?.diasSemCompra ?? 'Nunca',
        'Situação do Cadastro': e ? SITUACAO_CADASTRO_CONFIG[e.situacaoCadastro].label : '—',
        'Campos Pendentes': e ? e.camposFaltantes.map(c => CADASTRO_CAMPO_LABEL[c]).join(', ') : '',
        Cadência: e ? CADENCIA_CONFIG[e.cadencia].label : '—',
        'Dias s/ Contato': e?.diasSemContato ?? 'Sem contato',
        'Último Contato': fmtDataCurta(e?.ultimoContatoISO),
        'Objetivo Último Contato': e?.ultimoContatoObjetivo ? OBJETIVO_RELATORIO_LABEL[e.ultimoContatoObjetivo] : '—',
        'Próxima Tarefa': e?.proximaTarefa ? `${e.proximaTarefa.titulo} (${fmtDataCurta(e.proximaTarefa.data)})` : 'Sem tarefa aberta',
        Justificativa: e?.justificativaPrazoLongo || r.extraInfo || '',
        Segmento: e?.segmento || '—',
        UF: e?.uf || '—',
      }
    })
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Detalhamento')
    XLSX.writeFile(wb, `relatorio_detalhe_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarVisaoGeralExcel = () => {
    if (!isGerente) return
    const rows = [...linhasVendedores, linhaBancoClientes, linhaBancoProspectos].map(l => ({
      Carteira: l.vendedorNome + (l.ativo ? '' : ' (inativo)'),
      'Soma nos Totais': l.somaNosTotais ? 'Sim' : 'Não',
      'Carteira ≤180d': l.carteira180.length,
      'Sem Tarefa Aberta': l.semTarefaAberta.length,
      'Verde (≤10d)': l.verdes.length,
      'Amarelo (11–15d)': l.amarelos.length,
      'Vermelho (>15d)': l.vermelhos.length,
      'Justificado (Cinza)': l.justificados.length,
      '% Carteira em Dia': `${l.pctCarteiraEmDia}%`,
      '% Cobertura Mês': `${l.pctCoberturaMes}%`,
      'Tarefas Atrasadas': l.tarefasAtrasadas.length,
      'Cliente Empurrado (3+x)': l.clientesEmpurrados.length,
      '% Cadastros Completos': `${l.pctCadastrosCompletos}%`,
      'Contatos / Cliente Mês': l.contatosPorClienteMes,
      Ativos: l.situacaoCompraCounts.ativo.length,
      'Em Atenção': l.situacaoCompraCounts.em_atencao.length,
      'Em Risco': l.situacaoCompraCounts.em_risco.length,
      'Inativo Recente': l.situacaoCompraCounts.inativo_recente.length,
      'Inativo Antigo': l.situacaoCompraCounts.inativo_antigo.length,
      Prospectos: l.situacaoCompraCounts.prospecto.length,
      'Tempo Ativo CRM': fmtHoras(l.tempoAtivoSegundos),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Visao_Geral')
    XLSX.writeFile(wb, `relatorio_acompanhamento_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarPDF = (modo: 'geral' | 'lista') => {
    if (!isGerente) return
    const dataGeracao = new Date().toLocaleString('pt-BR')
    const tituloDoc = modo === 'lista' && drilldown ? drilldown.titulo : 'Relatório de Acompanhamento Comercial — MF Paris'
    const corpoTabela = modo === 'lista' && drilldown
      ? `<table><thead><tr><th>Cliente</th><th>Compra</th><th>Cadastro</th><th>Dias s/ Contato</th><th>Últ. Contato</th><th>Próx. Tarefa</th><th>Detalhe/Justificativa</th><th>Segmento</th></tr></thead><tbody>${
          drillRowsOrdenadas.map(r => {
            const e = r.empresa
            const cli = e?.cardPrincipal || r.clienteCard
            return `<tr><td>${cli?.razaoSocial || '—'}</td><td>${e ? SITUACAO_COMPRA_CONFIG[e.situacaoCompra].label : '—'}</td><td>${e ? SITUACAO_CADASTRO_CONFIG[e.situacaoCadastro].label : '—'}</td><td style="text-align:right">${e?.diasSemContato ?? 'Nunca'}</td><td>${fmtDataCurta(e?.ultimoContatoISO)}</td><td>${e?.proximaTarefa ? fmtDataCurta(e.proximaTarefa.data) : '—'}</td><td>${e?.justificativaPrazoLongo || r.extraInfo || '—'}</td><td>${e?.segmento || '—'}</td></tr>`
          }).join('')
        }</tbody></table>`
      : `<table><thead><tr><th>Vendedor / Banco</th><th>Carteira ≤180d</th><th>Sem Tarefa</th><th>Verde</th><th>Amarelo</th><th>Vermelho</th><th>Justif.</th><th>% Em Dia</th><th>% Cobertura</th><th>Atrasadas</th><th>% Cad. Compl.</th><th>Cont./Cli</th></tr></thead><tbody>${
          [...linhasVendedores, linhaBancoClientes, linhaBancoProspectos].map(l =>
            `<tr><td>${l.vendedorNome}${l.ativo ? '' : ' (inativo)'}</td><td style="text-align:right">${l.carteira180.length}</td><td style="text-align:right">${l.semTarefaAberta.length}</td><td style="text-align:right">${l.verdes.length}</td><td style="text-align:right">${l.amarelos.length}</td><td style="text-align:right">${l.vermelhos.length}</td><td style="text-align:right">${l.justificados.length}</td><td style="text-align:right">${l.pctCarteiraEmDia}%</td><td style="text-align:right">${l.pctCoberturaMes}%</td><td style="text-align:right">${l.tarefasAtrasadas.length}</td><td style="text-align:right">${l.pctCadastrosCompletos}%</td><td style="text-align:right">${l.contatosPorClienteMes}</td></tr>`
          ).join('')
        }</tbody></table>`

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${tituloDoc}</title><style>@page{margin:14mm;size:A4 landscape}body{font-family:'Segoe UI',Arial,sans-serif;font-size:9.5pt;color:#1e293b}h1{font-size:15pt;color:#1e40af;margin:0 0 4px}p.sub{font-size:8.5pt;color:#64748b;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f1f5f9;text-align:left;padding:6px;border-bottom:2px solid #cbd5e1;font-size:8.5pt}td{padding:5px 6px;border-bottom:1px solid #e2e8f0;font-size:8.5pt}</style></head><body><h1>${tituloDoc}</h1><p class="sub">Gerado em ${dataGeracao}</p>${corpoTabela}</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
  }

  // Redistribuição individual ou em lote (Item 10)
  const executarMovimentacaoCarteira = async (empresasAlvo: EmpresaConsolidada[], destinoStr: string) => {
    if (!isGerente || !loggedUser || empresasAlvo.length === 0 || !destinoStr) return
    const destino = destinoStr === 'banco'
      ? ({ tipo: 'banco' } as const)
      : ({ tipo: 'vendedor', vendedorId: Number(destinoStr) } as const)
    setMovendoLote(true)
    try {
      const res = await moverEmpresasEntreCarteiras({
        empresas: empresasAlvo,
        destino,
        vendedores,
        gestor: loggedUser,
        todasTarefas: tarefas,
        todosClientes: clientesProp,
      })
      const cardSet = new Set(res.cardsAtualizadosIds)
      setClientes?.(prev => prev.map(c => cardSet.has(c.id) ? { ...c, vendedorId: res.novoVendedorId ?? undefined } : c))
      if (res.interacoesCriadas.length > 0) {
        setInteracoes?.(prev => [...res.interacoesCriadas, ...prev])
      }
      if (res.tarefasAtualizadasIds.length > 0 || res.tarefasCriadas.length > 0) {
        const tSet = new Set(res.tarefasAtualizadasIds)
        setTarefas?.(prev => [
          ...res.tarefasCriadas,
          ...prev.map(t => tSet.has(t.id) ? { ...t, vendedorId: res.novoVendedorTarefasId } : t),
        ])
      }
      setSelecionadosChaves(new Set())
      showToast?.('success', `${empresasAlvo.length} empresa(s) movimentada(s) com histórico e tarefas preservadas!`)
    } catch (err: any) {
      showToast?.('error', `Erro ao movimentar carteira: ${err?.message || 'falha'}`)
    } finally {
      setMovendoLote(false)
    }
  }

  // Dados da aba Funil e Vendas (Item 5 e Item 11)
  const mapaUltimaProposta = useMemo(() => criarMapaUltimaProposta(propostasLoaded), [propostasLoaded])
  const cardsVisiveisSemBancos = useMemo(() => {
    const ids = new Set(
      empresasFiltradas
        .filter(e => filtros.vendedorId === 'banco_clientes' || filtros.vendedorId === 'banco_prospectos' ? true : e.vendedorId != null)
        .flatMap(e => e.cards.map(c => c.id))
    )
    return clientesProp.filter(c => !c.arquivadoDuplicata && ids.has(c.id))
  }, [empresasFiltradas, clientesProp, filtros.vendedorId])

  const etapasPipelineSemPerdido = ['lead', 'prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up'] as const
  const pipelinePorEtapa = useMemo(() => {
    return etapasPipelineSemPerdido.map(et => {
      const cards = cardsVisiveisSemBancos.filter(c => c.etapa === et)
      const valor = cards.reduce((s, c) => s + valorPropostaAtivaCard(c, mapaUltimaProposta), 0)
      return { etapa: et, label: stageLabels[et] || et, cards, qtd: cards.length, valor }
    })
  }, [cardsVisiveisSemBancos, mapaUltimaProposta])

  // Funil de conversão corrigido (Item 5: coorte cumulativa por empresa única — sempre entre 0% e 100%, sem "Diagnósticos")
  const funilCoorte = useMemo(() => {
    const ordem: Record<string, number> = { lead: 1, 'prospecção': 2, amostra: 3, proposta: 4, negociacao: 5, follow_up: 6 }
    const emps = empresasFiltradas.filter(e => e.vendedorId != null || filtros.vendedorId === 'banco_clientes' || filtros.vendedorId === 'banco_prospectos')
    const maxEtapaPorEmp = emps.map(emp => {
      let max = 0
      for (const c of emp.cards) {
        max = Math.max(max, ordem[c.etapa] || 0)
        for (const h of c.historicoEtapas || []) {
          max = Math.max(max, ordem[h.etapa] || 0, h.de ? (ordem[h.de] || 0) : 0)
        }
        if (c.etapaAnterior) max = Math.max(max, ordem[c.etapaAnterior] || 0)
      }
      if (emp.ultimaVendaISO) max = Math.max(max, 6)
      return { emp, max }
    }).filter(x => x.max > 0)

    const etapasCoorte = [
      { key: 'prospecção', minRank: 2, label: 'Entrada / Prospecção' },
      { key: 'amostra', minRank: 3, label: 'Qualificados / Amostra+' },
      { key: 'proposta', minRank: 4, label: 'Chegaram em Proposta' },
      { key: 'negociacao', minRank: 5, label: 'Chegaram em Negociação' },
      { key: 'follow_up', minRank: 6, label: 'Ganho / Pedido Fechado' },
    ]
    return etapasCoorte.map((et, idx, arr) => {
      const atingiram = maxEtapaPorEmp.filter(x => x.max >= et.minRank).map(x => x.emp)
      const anteriorCount = idx === 0 ? atingiram.length : maxEtapaPorEmp.filter(x => x.max >= arr[idx - 1].minRank).length
      const taxa = idx === 0 ? 100 : (anteriorCount > 0 ? Math.round((atingiram.length / anteriorCount) * 1000) / 10 : 0)
      return { ...et, empresas: atingiram, qtd: atingiram.length, taxa }
    })
  }, [empresasFiltradas, filtros.vendedorId])

  // Clientes Ativos vs Novos vs Retenção/Churn corrigidos (Item 5)
  const metricasBaseCorrigidas = useMemo(() => {
    const empsCarteira = empresasFiltradas.filter(e => e.vendedorId != null)
    const ativos40d = empsCarteira.filter(e => e.situacaoCompra === 'ativo')
    // Primeira compra histórica por empresa
    const primeiraCompra = new Map<string, string>()
    for (const p of pedidos) {
      if (p.status !== 'confirmado' || (p.tipo || 'venda') !== 'venda' || !(p.omieCodigo || p.omieNumero || p.dataEnvioOmie)) continue
      const emp = empresaPorCardId.get(p.clienteId)
      if (!emp) continue
      const dt = (p.dataEnvioOmie || p.dataAprovacao || p.dataCriacao || '').slice(0, 10)
      if (!dt) continue
      const prev = primeiraCompra.get(emp.chave)
      if (!prev || dt < prev) primeiraCompra.set(emp.chave, dt)
    }
    const janelaNovosIni = inicioISO === '0001-01-01'
      ? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
      : inicioISO
    const novosNoPeriodo = empsCarteira.filter(e => {
      const d1 = primeiraCompra.get(e.chave)
      return !!d1 && d1 >= janelaNovosIni && d1 <= fimISO
    })
    // Retenção e Churn sobre a base de compradores até 180 dias: mantidos ≤60d (Ativo + Em atenção) vs em evasão 61–180d (Em risco + Inativo recente)
    const baseCompradores = empsCarteira.filter(e => e.situacaoCompra !== 'prospecto')
    const mantidos = baseCompradores.filter(e => e.situacaoCompra === 'ativo' || e.situacaoCompra === 'em_atencao')
    const emChurn = baseCompradores.filter(e => e.situacaoCompra === 'inativo_recente' || e.situacaoCompra === 'inativo_antigo')
    const retencaoPct = baseCompradores.length > 0 ? Math.round((mantidos.length / baseCompradores.length) * 1000) / 10 : 0
    const churnPct = baseCompradores.length > 0 ? Math.round((emChurn.length / baseCompradores.length) * 1000) / 10 : 0
    return { ativos40d, novosNoPeriodo, baseCompradores, mantidos, emChurn, retencaoPct, churnPct }
  }, [empresasFiltradas, pedidos, empresaPorCardId, inicioISO, fimISO])

  // Tempo médio em cada etapa (um único cálculo consistente sobre os cards atuais na etapa — Item 5)
  const tempoAtualPorEtapa = useMemo(() => {
    return etapasPipelineSemPerdido.map(et => {
      const cards = cardsVisiveisSemBancos.filter(c => c.etapa === et)
      const media = cards.length > 0
        ? Math.round(cards.reduce((s, c) => s + diasEtapaAtual(c), 0) / cards.length)
        : 0
      return { etapa: et, label: stageLabels[et] || et, cards, media }
    })
  }, [cardsVisiveisSemBancos])

  const cardsPerdidos = useMemo(
    () => cardsVisiveisSemBancos.filter(c => c.etapa === 'perdido'),
    [cardsVisiveisSemBancos]
  )

  const top5MotivosPerda = useMemo(() => {
    const catLabels: Record<string, string> = {
      preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade',
      concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro',
    }
    const counts = new Map<string, Cliente[]>()
    for (const c of cardsPerdidos) {
      const k = c.categoriaPerda || 'outro'
      if (!counts.has(k)) counts.set(k, [])
      counts.get(k)!.push(c)
    }
    return Array.from(counts.entries())
      .map(([k, arr]) => ({ key: k, label: catLabels[k] || k, cards: arr, qtd: arr.length }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5)
  }, [cardsPerdidos])

  const tempoNaEtapaClientes = useMemo(() => {
    return cardsVisiveisSemBancos
      .filter(c => (etapasPipelineSemPerdido as readonly string[]).includes(c.etapa))
      .map(c => ({
        card: c,
        empresa: empresaPorCardId.get(c.id),
        dias: diasEtapaAtual(c),
        vendedorNome: vendedores.find(v => v.id === c.vendedorId)?.nome || '—',
      }))
      .sort((a, b) => b.dias - a.dias)
  }, [cardsVisiveisSemBancos, empresaPorCardId, vendedores])

  // Gráficos compactos da Visão Geral (3 por linha, ≤ 250px)
  const dadosGraficoSituacaoPorVendedor = useMemo(() => {
    return linhasVendedores.filter(l => l.somaNosTotais).map(l => ({
      vendedorId: l.vendedorId,
      nome: l.vendedorNome.split(' ')[0],
      Ativo: l.situacaoCompraCounts.ativo.length,
      'Em atenção': l.situacaoCompraCounts.em_atencao.length,
      'Em risco': l.situacaoCompraCounts.em_risco.length,
      'Inat. recente': l.situacaoCompraCounts.inativo_recente.length,
    }))
  }, [linhasVendedores])

  const dadosGraficoEvolucao = useMemo(() => {
    const nomesVend = new Set<string>()
    const rows = evolucaoSemanal.map(snap => {
      const r: Record<string, any> = { semana: fmtDataCurta(snap.semanaInicio).slice(0, 5) }
      for (const p of snap.pontos) {
        const curto = p.vendedorNome.split(' ')[0]
        nomesVend.add(curto)
        r[curto] = p.pctCarteiraEmDia
      }
      return r
    })
    return { rows, series: Array.from(nomesVend).slice(0, 8) }
  }, [evolucaoSemanal])

  const dadosGraficoSemanaCanal = useMemo(() => {
    const canais: CanalRelatorio[] = ['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'sem_canal']
    return canais.map(canal => {
      const lista = indTotalAtivos.atividadesSemana.filter(t => canalEfetivoTarefa(t) === canal)
      return {
        canal,
        nome: CANAL_RELATORIO_LABEL[canal],
        Relacionamento: lista.filter(t => objetivoEfetivoTarefa(t) === 'relacionamento').length,
        'Oferta/Venda': lista.filter(t => objetivoEfetivoTarefa(t) === 'oferta_venda').length,
        Demais: lista.filter(t => !['relacionamento', 'oferta_venda'].includes(objetivoEfetivoTarefa(t))).length,
        total: lista.length,
      }
    }).filter(x => x.total > 0)
  }, [indTotalAtivos.atividadesSemana])

  // Nível 2 — Carteira do vendedor selecionado
  const indicadorNivel2: IndicadoresVendedorFase2 | null = useMemo(() => {
    const alvo = vendedorNivel2Id ?? (typeof filtros.vendedorId === 'number' ? filtros.vendedorId : (!isGerente ? loggedUser?.id ?? null : null))
    if (!alvo) return null
    if (alvo === 'banco_clientes') return linhaBancoClientes
    if (alvo === 'banco_prospectos') return linhaBancoProspectos
    return linhasVendedores.find(l => l.vendedorId === alvo) || null
  }, [vendedorNivel2Id, filtros.vendedorId, isGerente, loggedUser?.id, linhaBancoClientes, linhaBancoProspectos, linhasVendedores])

  const empresasNivel2Ordenadas = useMemo(() => {
    if (!indicadorNivel2) return []
    const base = abaCadenciaNivel2 === 'todas'
      ? indicadorNivel2.carteira180
      : indicadorNivel2.carteira180.filter(e => e.cadencia === abaCadenciaNivel2)
    return [...base].sort((a, b) => {
      const da = a.diasSemContato == null ? 999999 : a.diasSemContato
      const dbVal = b.diasSemContato == null ? 999999 : b.diasSemContato
      return dbVal - da
    })
  }, [indicadorNivel2, abaCadenciaNivel2])

  const abrirCardCliente = (emp?: EmpresaConsolidada, cardFallback?: Cliente, focus?: ClientePanelFocus) => {
    const alvo = emp?.cardPrincipal || cardFallback
    if (alvo && onOpenCliente) onOpenCliente(alvo, focus)
  }

  const abasVisiveis: { id: AbaRelatorio; label: string }[] = isGerente
    ? [
        { id: 'visao_geral', label: 'Visão geral' },
        { id: 'tarefas_cadencia', label: 'Tarefas e cadência' },
        { id: 'cadastros', label: 'Cadastros' },
        { id: 'funil_vendas', label: 'Funil e vendas' },
        { id: 'bancos', label: `Bancos (${linhaBancoClientes.totalEmpresas + linhaBancoProspectos.totalEmpresas})` },
        { id: 'missoes', label: 'Missões' },
      ]
    : [
        { id: 'tarefas_cadencia', label: 'Minha carteira e cadência' },
        { id: 'cadastros', label: 'Meus cadastros' },
        { id: 'funil_vendas', label: 'Meu funil e vendas' },
        { id: 'missoes', label: 'Missões' },
      ]

  const coresLinhas = ['#2563EB', '#7C3AED', '#0891B2', '#EA580C', '#0D9488', '#4F46E5', '#DB2777', '#65A30D']

  return (
    <div className="space-y-3 pb-10">
      {/* BARRA DE FILTROS FIXA NO TOPO (Itens 6 e 11) */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {abasVisiveis.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAba(t.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  aba === t.id ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
            {isGerente && loggedUser && linhasVendedores.some(l => l.vendedorId === loggedUser.id && l.totalEmpresas > 0) && (
              <button
                type="button"
                onClick={() => {
                  setFiltros(f => ({ ...f, vendedorId: f.vendedorId === loggedUser.id ? 'todos' : loggedUser.id }))
                  setVendedorNivel2Id(prev => prev === loggedUser.id ? null : loggedUser.id)
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                  filtros.vendedorId === loggedUser.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                }`}
                title="Alternar entre visão geral de gestor e a sua própria carteira"
              >
                {filtros.vendedorId === loggedUser.id ? 'Ver toda a equipe' : 'Minha carteira'}
              </button>
            )}
          </div>

          {isGerente && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={exportarVisaoGeralExcel}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-semibold cursor-pointer"
                title="Exportar relatório atual em Excel (.xlsx)"
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Excel
              </button>
              <button
                type="button"
                onClick={() => exportarPDF('geral')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-xs font-semibold cursor-pointer"
                title="Exportar relatório atual em PDF"
              >
                <DocumentArrowDownIcon className="h-3.5 w-3.5" /> PDF
              </button>
            </div>
          )}
        </div>

        {/* 10 filtros globais compactos */}
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5 text-xs">
          <select
            value={filtros.periodo}
            onChange={e => setFiltros(f => ({ ...f, periodo: e.target.value as FiltrosRelatorioFase2['periodo'] }))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
            title="Filtro de período"
          >
            <option value="mes_atual">Mês atual</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="total">Todo período</option>
          </select>

          {isGerente && (
            <select
              value={String(filtros.vendedorId)}
              onChange={e => {
                const val = e.target.value
                const parsed = val === 'todos' || val === 'banco_clientes' || val === 'banco_prospectos' ? val : Number(val)
                setFiltros(f => ({ ...f, vendedorId: parsed }))
                setVendedorNivel2Id(parsed === 'todos' ? null : parsed)
              }}
              className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
              title="Filtro de vendedor ou banco"
            >
              <option value="todos">Vendedor: Todos</option>
              {vendedores.filter(v => v.ativo !== false).map(v => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
              <option value="banco_clientes">Banco de Clientes</option>
              <option value="banco_prospectos">Banco de Prospectos</option>
            </select>
          )}

          <select
            value={filtros.cadencia}
            onChange={e => setFiltros(f => ({ ...f, cadencia: e.target.value as any }))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
            title="Status de cadência"
          >
            <option value="todos">Cadência: Todas</option>
            <option value="verde">Verde (≤10d)</option>
            <option value="amarelo">Amarelo (11–15d)</option>
            <option value="vermelho">Vermelho (&gt;15d)</option>
            <option value="cinza">Justificado (Cinza)</option>
          </select>

          <select
            value={filtros.situacaoCompra}
            onChange={e => setFiltros(f => ({ ...f, situacaoCompra: e.target.value as any }))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
            title="Situação de compra"
          >
            <option value="todos">Compra: Todas</option>
            <option value="ativo">Ativo (≤40d)</option>
            <option value="em_atencao">Em atenção (41–60d)</option>
            <option value="em_risco">Em risco (61–90d)</option>
            <option value="inativo_recente">Inat. recente (91–180d)</option>
            <option value="inativo_antigo">Inat. antigo (181+d)</option>
            <option value="prospecto">Prospecto</option>
          </select>

          <select
            value={filtros.situacaoCadastro}
            onChange={e => setFiltros(f => ({ ...f, situacaoCadastro: e.target.value as any }))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
            title="Situação do cadastro"
          >
            <option value="todos">Cadastro: Todos</option>
            <option value="completo">Completo</option>
            <option value="completo_com_justificativa">Completo c/ justif.</option>
            <option value="incompleto">Incompleto</option>
            <option value="incompleto_vencido">Incompleto vencido</option>
          </select>

          <select
            value={filtros.objetivo}
            onChange={e => setFiltros(f => ({ ...f, objetivo: e.target.value as any }))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
            title="Objetivo da tarefa"
          >
            <option value="todos">Objetivo: Todos</option>
            <option value="relacionamento">Relacionamento</option>
            <option value="oferta_venda">Oferta/Venda</option>
            <option value="cotacao">Cotação</option>
            <option value="pos_venda">Pós-venda</option>
            <option value="cobranca">Cobrança</option>
            <option value="sem_objetivo">Sem objetivo</option>
          </select>

          <select
            value={filtros.canal}
            onChange={e => setFiltros(f => ({ ...f, canal: e.target.value as any }))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
            title="Canal usado"
          >
            <option value="todos">Canal: Todos</option>
            <option value="ligacao">Ligação</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
            <option value="visita">Visita</option>
            <option value="reuniao">Reunião</option>
            <option value="sem_canal">Sem canal (legado)</option>
          </select>

          <select
            value={filtros.origemTarefa}
            onChange={e => setFiltros(f => ({ ...f, origemTarefa: e.target.value as any }))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
            title="Origem da tarefa"
          >
            <option value="todos">Origem: Todas</option>
            <option value="manual">Manual</option>
            <option value="automatica">Automática</option>
          </select>

          <select
            value={filtros.segmento}
            onChange={e => setFiltros(f => ({ ...f, segmento: e.target.value }))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
            title="Segmento do cadastro"
          >
            <option value="todos">Segmento: Todos</option>
            {segmentosDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="flex items-center gap-1">
            <select
              value={filtros.uf}
              onChange={e => setFiltros(f => ({ ...f, uf: e.target.value }))}
              className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
              title="Região / UF"
            >
              <option value="todos">UF: Todas</option>
              {ufsDisponiveis.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
            {(filtros.cadencia !== 'todos' || filtros.situacaoCompra !== 'todos' || filtros.situacaoCadastro !== 'todos' || filtros.objetivo !== 'todos' || filtros.canal !== 'todos' || filtros.origemTarefa !== 'todos' || filtros.segmento !== 'todos' || filtros.uf !== 'todos' || (isGerente && filtros.vendedorId !== 'todos')) && (
              <button
                type="button"
                onClick={() => {
                  setFiltros({ ...FILTROS_RELATORIO_PADRAO, vendedorId: isGerente ? 'todos' : (loggedUser?.id ?? 'todos') })
                  if (isGerente) setVendedorNivel2Id(null)
                }}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg cursor-pointer"
                title="Limpar todos os filtros"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PAINEL INTERATIVO DE LISTA DETALHADA — CLIQUE 2 (Item 11: na mesma tela, sem trocar de página) */}
      {drilldown && (
        <div ref={drillRef} className="bg-white border-2 border-primary-300 rounded-xl shadow-md p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{drilldown.titulo}</h3>
              {drilldown.formula && <p className="text-[11px] text-gray-500">Cálculo: {drilldown.formula}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <MagnifyingGlassIcon className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-2" />
                <input
                  value={drillSearch}
                  onChange={e => { setDrillSearch(e.target.value); setDrillPage(1) }}
                  placeholder="Buscar nome ou CNPJ..."
                  className="pl-7 pr-2.5 py-1 text-xs border border-gray-200 rounded-lg"
                />
              </div>
              {isGerente && (
                <>
                  <button
                    type="button"
                    onClick={exportarDrilldownExcel}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => exportarPDF('lista')}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                  >
                    PDF
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setDrilldown(null)}
                className="px-2 py-1 text-xs font-semibold text-gray-500 hover:text-gray-800 cursor-pointer"
              >
                ✕ Fechar lista
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th onClick={() => toggleSortDrill('cliente')} className="text-left py-2 px-2 cursor-pointer hover:text-gray-900">Cliente ↕</th>
                  <th onClick={() => toggleSortDrill('situacaoCompra')} className="text-left py-2 px-2 cursor-pointer hover:text-gray-900">Sit. Compra ↕</th>
                  <th onClick={() => toggleSortDrill('situacaoCadastro')} className="text-left py-2 px-2 cursor-pointer hover:text-gray-900">Sit. Cadastro ↕</th>
                  <th onClick={() => toggleSortDrill('diasSemContato')} className="text-right py-2 px-2 cursor-pointer hover:text-gray-900">Dias s/ contato ↕</th>
                  <th onClick={() => toggleSortDrill('ultimoContato')} className="text-left py-2 px-2 cursor-pointer hover:text-gray-900">Último contato ↕</th>
                  <th onClick={() => toggleSortDrill('proximaTarefa')} className="text-left py-2 px-2 cursor-pointer hover:text-gray-900">Próxima tarefa ↕</th>
                  <th className="text-left py-2 px-2">Justificativa / Detalhe</th>
                  <th onClick={() => toggleSortDrill('segmento')} className="text-left py-2 px-2 cursor-pointer hover:text-gray-900">Segmento ↕</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {drillRowsOrdenadas.slice((drillPage - 1) * PAGE_SIZE, drillPage * PAGE_SIZE).map(r => {
                  const e = r.empresa
                  const cli = e?.cardPrincipal || r.clienteCard
                  return (
                    <tr
                      key={r.key}
                      onClick={() => abrirCardCliente(e, cli, r.focus)}
                      className="hover:bg-primary-50/60 cursor-pointer transition-colors"
                    >
                      <td className="py-2 px-2 font-semibold text-gray-900">
                        <div>{cli?.razaoSocial || '—'}</div>
                        <div className="text-[10px] font-normal text-gray-400">{cli?.cnpj || cli?.cpf || ''}</div>
                      </td>
                      <td className="py-2 px-2">
                        {e ? (
                          <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${SITUACAO_COMPRA_CONFIG[e.situacaoCompra].cor}`}>
                            {SITUACAO_COMPRA_CONFIG[e.situacaoCompra].label}{e.diasSemCompra != null ? ` · ${e.diasSemCompra}d` : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2 px-2">
                        {e ? (
                          <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${SITUACAO_CADASTRO_CONFIG[e.situacaoCadastro].cor}`}>
                            {SITUACAO_CADASTRO_CONFIG[e.situacaoCadastro].label}{e.camposFaltantes.length > 0 ? ` (${e.camposFaltantes.length})` : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right font-bold">
                        {e ? (
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] ${CADENCIA_CONFIG[e.cadencia].cor}`}>
                            {e.diasSemContato == null ? 'Sem contato' : `${e.diasSemContato}d`}
                          </span>
                        ) : (r.diasOrdenacao != null ? `${r.diasOrdenacao}d` : '—')}
                      </td>
                      <td className="py-2 px-2 text-gray-600 whitespace-nowrap">
                        {e?.ultimoContatoISO ? `${fmtDataCurta(e.ultimoContatoISO)}${e.ultimoContatoObjetivo ? ` · ${OBJETIVO_RELATORIO_LABEL[e.ultimoContatoObjetivo]}` : ''}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-gray-600">
                        {e?.proximaTarefa ? `${e.proximaTarefa.titulo.slice(0, 28)} (${fmtDataCurta(e.proximaTarefa.data)})` : <span className="text-red-600 font-semibold">Sem tarefa</span>}
                      </td>
                      <td className="py-2 px-2 text-gray-600 max-w-[240px] truncate" title={r.extraInfo || e?.justificativaPrazoLongo || ''}>
                        {r.extraInfo || e?.justificativaPrazoLongo || '—'}
                      </td>
                      <td className="py-2 px-2 text-gray-600">{e?.segmento || '—'}</td>
                    </tr>
                  )
                })}
                {drillRowsOrdenadas.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-gray-400">Nenhum registro encontrado para este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {drillRowsOrdenadas.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-600">
              <span>Mostrando {(drillPage - 1) * PAGE_SIZE + 1}–{Math.min(drillPage * PAGE_SIZE, drillRowsOrdenadas.length)} de {drillRowsOrdenadas.length}</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={drillPage <= 1} onClick={() => setDrillPage(p => p - 1)} className="p-1 border rounded disabled:opacity-40 cursor-pointer"><ChevronLeftIcon className="h-4 w-4" /></button>
                <span className="px-2">Pág. {drillPage}/{Math.ceil(drillRowsOrdenadas.length / PAGE_SIZE)}</span>
                <button type="button" disabled={drillPage >= Math.ceil(drillRowsOrdenadas.length / PAGE_SIZE)} onClick={() => setDrillPage(p => p + 1)} className="p-1 border rounded disabled:opacity-40 cursor-pointer"><ChevronRightIcon className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== ABA 1: VISÃO GERAL (SÓ GESTOR — NÍVEL 1) ==================== */}
      {aba === 'visao_geral' && isGerente && (
        <div className="space-y-3">
          {/* 6 cartões compactos por linha no computador, 2 no celular */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
            {[
              {
                titulo: 'Sem tarefa aberta',
                valor: String(indTotalAtivos.semTarefaAberta.length),
                variacao: variacaoSemanaAnterior ? `${variacaoSemanaAnterior.semTarefaDiff > 0 ? '+' : ''}${variacaoSemanaAnterior.semTarefaDiff} vs sem. ant.` : 'Meta: 0 na carteira',
                cor: indTotalAtivos.semTarefaAberta.length === 0 ? 'text-emerald-700' : 'text-red-600',
                formula: 'clientes da carteira até 180 dias sem tarefa pendente (meta = 0)',
                onClick: () => abrirListaEmpresas(`${indTotalAtivos.vendedorNome} · Sem tarefa aberta`, indTotalAtivos.semTarefaAberta, { section: 'tarefas' }, 'clientes da carteira até 180 dias sem tarefa pendente'),
              },
              {
                titulo: 'Carteira em dia',
                valor: `${indTotalAtivos.pctCarteiraEmDia}%`,
                variacao: variacaoSemanaAnterior ? `${variacaoSemanaAnterior.pctCarteiraEmDiaDiff >= 0 ? '+' : ''}${variacaoSemanaAnterior.pctCarteiraEmDiaDiff} p.p. vs sem. ant.` : `${indTotalAtivos.verdes.length}/${indTotalAtivos.carteira180.length} verdes`,
                cor: 'text-emerald-700',
                formula: 'clientes verdes (contato ≤ 10d) ÷ carteira até 180 dias',
                onClick: () => abrirListaEmpresas(`${indTotalAtivos.vendedorNome} · Em dia (Verde)`, indTotalAtivos.verdes, { section: 'historico' }, 'clientes verdes ÷ carteira até 180 dias'),
              },
              {
                titulo: 'Cobertura do mês',
                valor: `${indTotalAtivos.pctCoberturaMes}%`,
                variacao: `${indTotalAtivos.coberturaMes.length}/${indTotalAtivos.carteira180.length} atendidos`,
                cor: 'text-blue-700',
                formula: 'clientes da carteira com ≥ 1 tarefa finalizada no período ÷ carteira até 180 dias',
                onClick: () => abrirListaEmpresas(`${indTotalAtivos.vendedorNome} · Cobertura no período`, indTotalAtivos.coberturaMes, { section: 'historico' }, 'clientes com ≥ 1 tarefa finalizada no período ÷ carteira até 180 dias'),
              },
              {
                titulo: 'Tarefas atrasadas',
                valor: String(indTotalAtivos.tarefasAtrasadas.length),
                variacao: indTotalAtivos.tarefasAtrasadas[0] ? `Maior: ${indTotalAtivos.tarefasAtrasadas[0].diasAtraso}d vencida` : 'Em dia',
                cor: indTotalAtivos.tarefasAtrasadas.length > 0 ? 'text-red-600' : 'text-emerald-700',
                formula: 'tarefas pendentes com prazo anterior a hoje',
                onClick: () => abrirListaCustom(
                  `${indTotalAtivos.vendedorNome} · Tarefas atrasadas`,
                  indTotalAtivos.tarefasAtrasadas.map(x => ({
                    key: `atrasada-${x.tarefa.id}`,
                    empresa: x.empresa,
                    clienteCard: x.empresa?.cardPrincipal,
                    focus: { section: 'tarefas', tarefaId: x.tarefa.id },
                    extraInfo: `${x.tarefa.titulo} · vencida há ${x.diasAtraso}d`,
                    diasOrdenacao: x.diasAtraso,
                  })),
                  'tarefas',
                  'tarefas pendentes com prazo < hoje'
                ),
              },
              {
                titulo: 'Cadastros completos',
                valor: `${indTotalAtivos.pctCadastrosCompletos}%`,
                variacao: `${indTotalAtivos.cadastrosCompletos.length}/${indTotalAtivos.carteira180.length} completos`,
                cor: 'text-purple-700',
                formula: '(cadastros completos + completos c/ justificativa) ÷ carteira até 180 dias',
                onClick: () => abrirListaEmpresas(
                  `${indTotalAtivos.vendedorNome} · Cadastros incompletos na carteira`,
                  indTotalAtivos.carteira180.filter(e => e.situacaoCadastro === 'incompleto' || e.situacaoCadastro === 'incompleto_vencido'),
                  { section: 'cadastro' },
                  'clientes da carteira até 180 dias com campos pendentes no cadastro'
                ),
              },
              {
                titulo: 'Contatos / cliente',
                valor: String(indTotalAtivos.contatosPorClienteMes),
                variacao: 'Ref.: ≥ 2,0 / mês',
                cor: indTotalAtivos.contatosPorClienteMes >= 2 ? 'text-emerald-700' : 'text-amber-700',
                formula: 'tarefas finalizadas da carteira no período ÷ carteira até 180 dias',
                onClick: () => abrirListaCustom(
                  `${indTotalAtivos.vendedorNome} · Tarefas finalizadas no período`,
                  indTotalAtivos.tarefasFinalizadasMes.map(t => ({
                    key: `tf-${t.id}`,
                    empresa: t.clienteId ? empresaPorCardId.get(t.clienteId) : undefined,
                    focus: { section: 'tarefas', tarefaId: t.id },
                    extraInfo: `${t.titulo} · ${CANAL_RELATORIO_LABEL[canalEfetivoTarefa(t)]} · ${fmtDataCurta(dataConclusaoISO(t))}`,
                  })),
                  'tarefas',
                  'tarefas finalizadas ÷ carteira até 180 dias'
                ),
              },
            ].map(card => (
              <button
                key={card.titulo}
                type="button"
                onClick={card.onClick}
                title={card.formula}
                className="text-left bg-white hover:bg-primary-50/40 border border-gray-200 hover:border-primary-300 rounded-xl px-3 py-2.5 shadow-sm transition-all cursor-pointer"
              >
                <p className="text-[11px] font-semibold text-gray-500 truncate">{card.titulo}</p>
                <p className={`text-xl font-bold leading-tight mt-0.5 ${card.cor}`}>{card.valor}</p>
                <p className="text-[10px] text-gray-400 truncate mt-0.5">{card.variacao}</p>
              </button>
            ))}
          </div>

          {/* Tabela compacta por vendedor + linhas separadas dos Bancos (cada célula clicável) */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <th className="text-left py-2 px-2.5 font-semibold sticky left-0 bg-gray-50">Vendedor / Carteira</th>
                  <th className="text-right py-2 px-2 font-semibold" title="Ativo + Em atenção + Em risco + Inativo recente">Cart. ≤180d</th>
                  <th className="text-right py-2 px-2 font-semibold" title="Clientes da carteira sem tarefa pendente">Sem tar.</th>
                  <th className="text-right py-2 px-2 font-semibold text-emerald-700" title="Última tarefa finalizada há até 10 dias">Verde</th>
                  <th className="text-right py-2 px-2 font-semibold text-amber-700" title="Última tarefa finalizada entre 11 e 15 dias">Amarelo</th>
                  <th className="text-right py-2 px-2 font-semibold text-red-700" title="Última tarefa finalizada há mais de 15 dias ou nunca">Vencido</th>
                  <th className="text-right py-2 px-2 font-semibold text-slate-600" title="Próximo passo >15d com justificativa dentro do prazo">Justif.</th>
                  <th className="text-right py-2 px-2 font-semibold" title="Clientes verdes ÷ carteira até 180 dias">% Dia</th>
                  <th className="text-right py-2 px-2 font-semibold" title="Clientes com tarefa concluída no mês ÷ carteira">% Cob.</th>
                  <th className="text-right py-2 px-2 font-semibold" title="Tarefas pendentes vencidas">Atras.</th>
                  <th className="text-right py-2 px-2 font-semibold" title="Ativo / Atenção / Risco / Inat.Rec / Inat.Ant / Prospecto">Compra (A/At/R/IR/IA/P)</th>
                  <th className="text-right py-2 px-2 font-semibold" title="Completo + Justif. / Incompleto / Incompleto vencido">Cad. (OK/Inc/Venc)</th>
                  <th className="text-right py-2 px-2 font-semibold" title="Tarefas finalizadas ÷ carteira">Cont./Cli</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linhasVendedores.map(l => (
                  <tr key={String(l.vendedorId)} className={`hover:bg-gray-50 ${!l.ativo ? 'opacity-60 bg-gray-50/50' : ''}`}>
                    <td className="py-1.5 px-2.5 font-semibold text-gray-900 sticky left-0 bg-white">
                      <button
                        type="button"
                        onClick={() => { setVendedorNivel2Id(l.vendedorId as number); setAba('tarefas_cadencia') }}
                        className="text-left hover:text-primary-700 hover:underline cursor-pointer"
                        title="Abrir Nível 2 deste vendedor"
                      >
                        {l.vendedorNome}{!l.ativo ? ' (inativo)' : ''}
                      </button>
                    </td>
                    <td onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Carteira ≤180d`, l.carteira180)} className="py-1.5 px-2 text-right font-bold cursor-pointer hover:bg-primary-50">{l.carteira180.length}</td>
                    <td onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Sem tarefa aberta`, l.semTarefaAberta, { section: 'tarefas' })} className={`py-1.5 px-2 text-right font-bold cursor-pointer hover:bg-primary-50 ${l.semTarefaAberta.length > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{l.semTarefaAberta.length}</td>
                    <td onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Em dia (Verde)`, l.verdes)} className="py-1.5 px-2 text-right text-emerald-700 font-semibold cursor-pointer hover:bg-emerald-50">{l.verdes.length}</td>
                    <td onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Atenção (Amarelo)`, l.amarelos)} className="py-1.5 px-2 text-right text-amber-700 font-semibold cursor-pointer hover:bg-amber-50">{l.amarelos.length}</td>
                    <td onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Vencidos`, l.vermelhos)} className="py-1.5 px-2 text-right text-red-700 font-bold cursor-pointer hover:bg-red-50">{l.vermelhos.length}</td>
                    <td onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Justificados`, l.justificados)} className="py-1.5 px-2 text-right text-slate-600 font-semibold cursor-pointer hover:bg-slate-100">{l.justificados.length}</td>
                    <td onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Em dia`, l.verdes)} className="py-1.5 px-2 text-right cursor-pointer hover:bg-primary-50">{l.pctCarteiraEmDia}%</td>
                    <td onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Cobertura no período`, l.coberturaMes)} className="py-1.5 px-2 text-right cursor-pointer hover:bg-primary-50">{l.pctCoberturaMes}%</td>
                    <td
                      onClick={() => abrirListaCustom(
                        `${l.vendedorNome} · Tarefas atrasadas`,
                        l.tarefasAtrasadas.map(x => ({ key: `at-${x.tarefa.id}`, empresa: x.empresa, focus: { section: 'tarefas', tarefaId: x.tarefa.id }, extraInfo: `${x.tarefa.titulo} · ${x.diasAtraso}d vencida`, diasOrdenacao: x.diasAtraso })),
                        'tarefas'
                      )}
                      className={`py-1.5 px-2 text-right font-semibold cursor-pointer hover:bg-red-50 ${l.tarefasAtrasadas.length > 0 ? 'text-red-600' : 'text-gray-500'}`}
                    >
                      {l.tarefasAtrasadas.length}
                    </td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap space-x-1">
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Ativos`, l.situacaoCompraCounts.ativo)} className="text-blue-700 hover:underline cursor-pointer" title="Ativo ≤40d">{l.situacaoCompraCounts.ativo.length}</button>
                      <span className="text-gray-300">/</span>
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Em atenção`, l.situacaoCompraCounts.em_atencao)} className="text-orange-500 hover:underline cursor-pointer" title="Em atenção 41–60d">{l.situacaoCompraCounts.em_atencao.length}</button>
                      <span className="text-gray-300">/</span>
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Em risco`, l.situacaoCompraCounts.em_risco)} className="text-orange-800 hover:underline cursor-pointer" title="Em risco 61–90d">{l.situacaoCompraCounts.em_risco.length}</button>
                      <span className="text-gray-300">/</span>
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Inativo recente`, l.situacaoCompraCounts.inativo_recente)} className="text-gray-600 hover:underline cursor-pointer" title="Inativo recente 91–180d">{l.situacaoCompraCounts.inativo_recente.length}</button>
                      <span className="text-gray-300">/</span>
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Inativo antigo`, l.situacaoCompraCounts.inativo_antigo)} className="text-gray-800 hover:underline cursor-pointer" title="Inativo antigo 181+d">{l.situacaoCompraCounts.inativo_antigo.length}</button>
                      <span className="text-gray-300">/</span>
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Prospectos`, l.situacaoCompraCounts.prospecto)} className="text-purple-700 hover:underline cursor-pointer" title="Prospecto">{l.situacaoCompraCounts.prospecto.length}</button>
                    </td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap space-x-1">
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Cadastros completos`, [...l.situacaoCadastroCounts.completo, ...l.situacaoCadastroCounts.completo_com_justificativa], { section: 'cadastro' })} className="text-blue-700 hover:underline cursor-pointer">{l.situacaoCadastroCounts.completo.length + l.situacaoCadastroCounts.completo_com_justificativa.length}</button>
                      <span className="text-gray-300">/</span>
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Cadastros incompletos`, l.situacaoCadastroCounts.incompleto, { section: 'cadastro' })} className="text-orange-600 hover:underline cursor-pointer">{l.situacaoCadastroCounts.incompleto.length}</button>
                      <span className="text-gray-300">/</span>
                      <button type="button" onClick={() => abrirListaEmpresas(`${l.vendedorNome} · Cadastros incompletos vencidos`, l.situacaoCadastroCounts.incompleto_vencido, { section: 'cadastro' })} className="text-orange-900 font-semibold hover:underline cursor-pointer">{l.situacaoCadastroCounts.incompleto_vencido.length}</button>
                    </td>
                    <td className="py-1.5 px-2 text-right font-semibold text-gray-700">{l.contatosPorClienteMes}</td>
                  </tr>
                ))}

                {/* Total apenas de usuários ativos com clientes na carteira */}
                <tr className="bg-primary-50/60 font-bold border-t-2 border-primary-200 text-gray-900">
                  <td className="py-2 px-2.5 sticky left-0 bg-primary-50">{indTotalAtivos.vendedorNome}</td>
                  <td onClick={() => abrirListaEmpresas('Equipe ativa · Carteira ≤180d', indTotalAtivos.carteira180)} className="py-2 px-2 text-right cursor-pointer hover:underline">{indTotalAtivos.carteira180.length}</td>
                  <td onClick={() => abrirListaEmpresas('Equipe ativa · Sem tarefa aberta', indTotalAtivos.semTarefaAberta, { section: 'tarefas' })} className="py-2 px-2 text-right cursor-pointer hover:underline">{indTotalAtivos.semTarefaAberta.length}</td>
                  <td onClick={() => abrirListaEmpresas('Equipe ativa · Verde', indTotalAtivos.verdes)} className="py-2 px-2 text-right text-emerald-700 cursor-pointer hover:underline">{indTotalAtivos.verdes.length}</td>
                  <td onClick={() => abrirListaEmpresas('Equipe ativa · Amarelo', indTotalAtivos.amarelos)} className="py-2 px-2 text-right text-amber-700 cursor-pointer hover:underline">{indTotalAtivos.amarelos.length}</td>
                  <td onClick={() => abrirListaEmpresas('Equipe ativa · Vencidos', indTotalAtivos.vermelhos)} className="py-2 px-2 text-right text-red-700 cursor-pointer hover:underline">{indTotalAtivos.vermelhos.length}</td>
                  <td onClick={() => abrirListaEmpresas('Equipe ativa · Justificados', indTotalAtivos.justificados)} className="py-2 px-2 text-right text-slate-700 cursor-pointer hover:underline">{indTotalAtivos.justificados.length}</td>
                  <td className="py-2 px-2 text-right">{indTotalAtivos.pctCarteiraEmDia}%</td>
                  <td className="py-2 px-2 text-right">{indTotalAtivos.pctCoberturaMes}%</td>
                  <td className="py-2 px-2 text-right text-red-700">{indTotalAtivos.tarefasAtrasadas.length}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {indTotalAtivos.situacaoCompraCounts.ativo.length}/{indTotalAtivos.situacaoCompraCounts.em_atencao.length}/{indTotalAtivos.situacaoCompraCounts.em_risco.length}/{indTotalAtivos.situacaoCompraCounts.inativo_recente.length}/{indTotalAtivos.situacaoCompraCounts.inativo_antigo.length}/{indTotalAtivos.situacaoCompraCounts.prospecto.length}
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {indTotalAtivos.situacaoCadastroCounts.completo.length + indTotalAtivos.situacaoCadastroCounts.completo_com_justificativa.length}/{indTotalAtivos.situacaoCadastroCounts.incompleto.length}/{indTotalAtivos.situacaoCadastroCounts.incompleto_vencido.length}
                  </td>
                  <td className="py-2 px-2 text-right">{indTotalAtivos.contatosPorClienteMes}</td>
                </tr>

                {/* Linhas separadas dos dois Bancos (não somam nos totais de vendedores) */}
                {[linhaBancoClientes, linhaBancoProspectos].map(b => (
                  <tr key={String(b.vendedorId)} className="bg-amber-50/40 text-gray-700">
                    <td className="py-1.5 px-2.5 font-semibold sticky left-0 bg-amber-50/80">
                      <button
                        type="button"
                        onClick={() => { setBancoSubAba(b.vendedorId === 'banco_clientes' ? 'clientes' : 'prospectos'); setAba('bancos') }}
                        className="hover:text-primary-700 hover:underline cursor-pointer"
                      >
                        🏦 {b.vendedorNome} ({b.totalEmpresas})
                      </button>
                    </td>
                    <td onClick={() => abrirListaEmpresas(`${b.vendedorNome} · ≤180d`, b.carteira180)} className="py-1.5 px-2 text-right cursor-pointer hover:underline">{b.carteira180.length}</td>
                    <td className="py-1.5 px-2 text-right">{b.semTarefaAberta.length}</td>
                    <td className="py-1.5 px-2 text-right">{b.verdes.length}</td>
                    <td className="py-1.5 px-2 text-right">{b.amarelos.length}</td>
                    <td className="py-1.5 px-2 text-right">{b.vermelhos.length}</td>
                    <td className="py-1.5 px-2 text-right">{b.justificados.length}</td>
                    <td className="py-1.5 px-2 text-right">—</td>
                    <td className="py-1.5 px-2 text-right">—</td>
                    <td className="py-1.5 px-2 text-right">{b.tarefasAtrasadas.length}</td>
                    <td onClick={() => abrirListaEmpresas(b.vendedorNome, [...b.situacaoCompraCounts.ativo, ...b.situacaoCompraCounts.em_atencao, ...b.situacaoCompraCounts.em_risco, ...b.situacaoCompraCounts.inativo_recente, ...b.situacaoCompraCounts.inativo_antigo, ...b.situacaoCompraCounts.prospecto])} className="py-1.5 px-2 text-right cursor-pointer hover:underline whitespace-nowrap">
                      {b.situacaoCompraCounts.ativo.length}/{b.situacaoCompraCounts.em_atencao.length}/{b.situacaoCompraCounts.em_risco.length}/{b.situacaoCompraCounts.inativo_recente.length}/{b.situacaoCompraCounts.inativo_antigo.length}/{b.situacaoCompraCounts.prospecto.length}
                    </td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      {b.situacaoCadastroCounts.completo.length + b.situacaoCadastroCounts.completo_com_justificativa.length}/{b.situacaoCadastroCounts.incompleto.length}/{b.situacaoCadastroCounts.incompleto_vencido.length}
                    </td>
                    <td className="py-1.5 px-2 text-right">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grade de 3 gráficos por linha, altura máx ~240px, sem pizza e sem legenda sobreposta */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Situação de compra por vendedor (carteira ≤180d)</h4>
              {dadosGraficoSituacaoPorVendedor.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">Sem dados no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={dadosGraficoSituacaoPorVendedor}
                    layout="vertical"
                    onClick={(st: any) => {
                      const payload = st?.activePayload?.[0]?.payload
                      if (!payload) return
                      const vend = linhasVendedores.find(l => l.vendedorId === payload.vendedorId)
                      if (vend) abrirListaEmpresas(`${vend.vendedorNome} · Carteira ≤180d`, vend.carteira180)
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis dataKey="nome" type="category" width={72} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                    <Bar dataKey="Ativo" stackId="a" fill="#2563EB" className="cursor-pointer" />
                    <Bar dataKey="Em atenção" stackId="a" fill="#FB923C" className="cursor-pointer" />
                    <Bar dataKey="Em risco" stackId="a" fill="#C2410C" className="cursor-pointer" />
                    <Bar dataKey="Inat. recente" stackId="a" fill="#6B7280" className="cursor-pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Evolução semanal — % da carteira em dia</h4>
              {dadosGraficoEvolucao.rows.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">Sem dados no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dadosGraficoEvolucao.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Em dia']} />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                    {dadosGraficoEvolucao.series.map((serie, idx) => (
                      <Line key={serie} type="monotone" dataKey={serie} stroke={coresLinhas[idx % coresLinhas.length]} strokeWidth={2} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Atividades na semana por canal e objetivo</h4>
              {dadosGraficoSemanaCanal.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">Sem dados no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={dadosGraficoSemanaCanal}
                    layout="vertical"
                    onClick={(st: any) => {
                      const canal = st?.activePayload?.[0]?.payload?.canal as CanalRelatorio | undefined
                      if (!canal) return
                      const ts = indTotalAtivos.atividadesSemana.filter(t => canalEfetivoTarefa(t) === canal)
                      abrirListaCustom(
                        `Semana · Canal ${CANAL_RELATORIO_LABEL[canal]}`,
                        ts.map(t => ({ key: `sem-${t.id}`, empresa: t.clienteId ? empresaPorCardId.get(t.clienteId) : undefined, focus: { section: 'tarefas', tarefaId: t.id }, extraInfo: `${t.titulo} · ${fmtDataCurta(dataConclusaoISO(t))}` })),
                        'atividades'
                      )
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis dataKey="nome" type="category" width={72} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                    <Bar dataKey="Relacionamento" stackId="b" fill="#3B82F6" className="cursor-pointer" />
                    <Bar dataKey="Oferta/Venda" stackId="b" fill="#8B5CF6" className="cursor-pointer" />
                    <Bar dataKey="Demais" stackId="b" fill="#64748B" className="cursor-pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== ABA 2: TAREFAS, CADÊNCIA E NÍVEL 2 (Itens 3, 4 e 6) ==================== */}
      {aba === 'tarefas_cadencia' && (
        <div className="space-y-3">
          {/* Todos os indicadores operacionais do Item 4 clicáveis */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {[
              { label: 'Atividades hoje', val: indTotalAtivos.atividadesDia.length, sub: `Semana: ${indTotalAtivos.atividadesSemana.length} · Mês: ${indTotalAtivos.atividadesMes.length}`, formula: 'tarefas concluídas hoje (pela data de conclusão)', onClick: () => abrirListaCustom('Atividades concluídas hoje', indTotalAtivos.atividadesDia.map(t => ({ key: `d-${t.id}`, empresa: t.clienteId ? empresaPorCardId.get(t.clienteId) : undefined, focus: { section: 'tarefas', tarefaId: t.id }, extraInfo: t.titulo })), 'tarefas') },
              { label: 'Cliente empurrado (3+x)', val: indTotalAtivos.clientesEmpurrados.length, sub: 'reagendadas ≥ 3x', formula: 'tarefas pendentes reagendadas 3 vezes ou mais', onClick: () => abrirListaCustom('Cliente empurrado (3+ reagendamentos)', indTotalAtivos.clientesEmpurrados.map(x => ({ key: `emp-${x.tarefa.id}`, empresa: x.empresa, focus: { section: 'tarefas', tarefaId: x.tarefa.id }, extraInfo: `${x.tarefa.titulo} · ${x.qtdReagendamentos} reagendamentos`, diasOrdenacao: x.qtdReagendamentos })), 'tarefas') },
              { label: 'Justificados (>15d)', val: indTotalAtivos.justificativasPrazoLongo.length, sub: 'prazo longo ativo', formula: 'clientes com próximo passo > 15 dias e justificativa válida', onClick: () => abrirListaCustom('Justificativas de prazo longo', indTotalAtivos.justificativasPrazoLongo.map(x => ({ key: `jp-${x.tarefa.id}`, empresa: x.empresa, focus: { section: 'tarefas', tarefaId: x.tarefa.id }, extraInfo: x.justificativa })), 'clientes') },
              { label: 'Proporção Objetivos', val: `${indTotalAtivos.pctRelacionamento}% Rel.`, sub: `${indTotalAtivos.pctOfertaVenda}% Oferta · ${indTotalAtivos.pctDemaisObjetivos}% Demais`, formula: 'distribuição % das tarefas finalizadas por objetivo', onClick: () => abrirListaCustom('Atividades Oferta/Venda no período', indTotalAtivos.porObjetivoMes.oferta_venda.map(t => ({ key: `ov-${t.id}`, empresa: t.clienteId ? empresaPorCardId.get(t.clienteId) : undefined, focus: { section: 'tarefas', tarefaId: t.id }, extraInfo: t.titulo })), 'tarefas') },
              { label: 'Tempo ativo CRM', val: fmtHoras(indTotalAtivos.tempoAtivoSegundos), sub: 'pausa após 10min ocioso', formula: 'soma das batidas ativas no período (pausa automática após 10 min sem interação)', onClick: () => {} },
              ...(isGerente ? [{
                label: 'Sinais irregulares',
                val: indTotalAtivos.sinaisIrregulares.length,
                sub: '>10 em 15min / repetidas',
                formula: 'rajadas de >10 conclusões em 15 min ou textos de conclusão repetidos',
                onClick: () => abrirListaCustom('Sinais de registro irregular', indTotalAtivos.sinaisIrregulares.map((s, idx) => ({ key: `ir-${idx}`, empresa: s.clienteId ? empresaPorCardId.get(s.clienteId) : undefined, extraInfo: `${s.vendedorNome}: ${s.descricao}` })), 'ocorrências'),
              }] : []),
            ].map(c => (
              <button key={c.label} type="button" onClick={c.onClick} title={c.formula} className="text-left bg-white hover:bg-primary-50/40 border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer">
                <p className="text-[11px] font-semibold text-gray-500 truncate">{c.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{c.val}</p>
                <p className="text-[10px] text-gray-400 truncate">{c.sub}</p>
              </button>
            ))}
          </div>

          {/* Atividades por canal e por objetivo em barras horizontais */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Atividades finalizadas por canal usado</h4>
              {indTotalAtivos.atividadesMes.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Sem dados no período</p>
              ) : (
                <div className="space-y-1">
                  {(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'sem_canal'] as CanalRelatorio[]).map(canal => {
                    const arr = indTotalAtivos.porCanalMes[canal]
                    const max = Math.max(...Object.values(indTotalAtivos.porCanalMes).map(x => x.length), 1)
                    return (
                      <BarraHorizontalItem
                        key={canal}
                        label={CANAL_RELATORIO_LABEL[canal]}
                        valorTexto={`${arr.length}`}
                        pct={(arr.length / max) * 100}
                        cor={canal === 'sem_canal' ? '#94A3B8' : '#2563EB'}
                        formula={`tarefas concluídas com canal ${CANAL_RELATORIO_LABEL[canal]}`}
                        onClick={() => abrirListaCustom(`Canal · ${CANAL_RELATORIO_LABEL[canal]}`, arr.map(t => ({ key: `c-${t.id}`, empresa: t.clienteId ? empresaPorCardId.get(t.clienteId) : undefined, focus: { section: 'tarefas', tarefaId: t.id }, extraInfo: `${t.titulo} · ${fmtDataCurta(dataConclusaoISO(t))}` })), 'tarefas')}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Atividades finalizadas por objetivo</h4>
              {indTotalAtivos.atividadesMes.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Sem dados no período</p>
              ) : (
                <div className="space-y-1">
                  {(['relacionamento', 'oferta_venda', 'cotacao', 'pos_venda', 'cobranca', 'sem_objetivo'] as ObjetivoRelatorio[]).map(obj => {
                    const arr = indTotalAtivos.porObjetivoMes[obj]
                    const max = Math.max(...Object.values(indTotalAtivos.porObjetivoMes).map(x => x.length), 1)
                    return (
                      <BarraHorizontalItem
                        key={obj}
                        label={OBJETIVO_RELATORIO_LABEL[obj]}
                        valorTexto={`${arr.length}`}
                        pct={(arr.length / max) * 100}
                        cor={obj === 'sem_objetivo' ? '#94A3B8' : '#7C3AED'}
                        formula={`tarefas concluídas com objetivo ${OBJETIVO_RELATORIO_LABEL[obj]}`}
                        onClick={() => abrirListaCustom(`Objetivo · ${OBJETIVO_RELATORIO_LABEL[obj]}`, arr.map(t => ({ key: `o-${t.id}`, empresa: t.clienteId ? empresaPorCardId.get(t.clienteId) : undefined, focus: { section: 'tarefas', tarefaId: t.id }, extraInfo: `${t.titulo} · ${fmtDataCurta(dataConclusaoISO(t))}` })), 'tarefas')}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* NÍVEL 2 — Carteira por vendedor separada em Vermelho, Amarelo, Verde e Cinza (Item 6) */}
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-gray-900">Nível 2 · Carteira por Cadência</h3>
                {isGerente && (
                  <select
                    value={String(vendedorNivel2Id ?? '')}
                    onChange={e => setVendedorNivel2Id(e.target.value ? Number(e.target.value) : null)}
                    className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-gray-50"
                  >
                    <option value="">Selecione um vendedor...</option>
                    {linhasVendedores.map(l => (
                      <option key={String(l.vendedorId)} value={String(l.vendedorId)}>{l.vendedorNome} ({l.carteira180.length})</option>
                    ))}
                  </select>
                )}
              </div>

              {indicadorNivel2 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {([
                    { id: 'vermelho', label: `Vermelho (${indicadorNivel2.vermelhos.length})`, cls: 'bg-red-100 text-red-800 border-red-200' },
                    { id: 'amarelo', label: `Amarelo (${indicadorNivel2.amarelos.length})`, cls: 'bg-amber-100 text-amber-800 border-amber-200' },
                    { id: 'verde', label: `Verde (${indicadorNivel2.verdes.length})`, cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
                    { id: 'cinza', label: `Cinza / Justif. (${indicadorNivel2.justificados.length})`, cls: 'bg-slate-200 text-slate-700 border-slate-300' },
                    { id: 'todas', label: `Toda carteira (${indicadorNivel2.carteira180.length})`, cls: 'bg-gray-100 text-gray-700 border-gray-200' },
                  ] as const).map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setAbaCadenciaNivel2(b.id)}
                      className={`px-2.5 py-1 rounded-full border text-xs font-bold cursor-pointer ${b.cls} ${abaCadenciaNivel2 === b.id ? 'ring-2 ring-primary-500' : 'opacity-80'}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!indicadorNivel2 ? (
              <p className="text-xs text-gray-500 py-4 text-center">Selecione um vendedor acima (ou clique no nome dele na Visão Geral) para inspecionar a carteira em Nível 2.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="text-left py-2 px-2">Cliente</th>
                      <th className="text-left py-2 px-2">Situação de compra</th>
                      <th className="text-left py-2 px-2">Situação do cadastro</th>
                      <th className="text-right py-2 px-2">Dias s/ contato</th>
                      <th className="text-left py-2 px-2">Último contato (data e objetivo)</th>
                      <th className="text-left py-2 px-2">Próxima tarefa e data</th>
                      <th className="text-left py-2 px-2">Justificativa</th>
                      <th className="text-left py-2 px-2">Segmento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {empresasNivel2Ordenadas.map(e => (
                      <tr key={e.chave} onClick={() => abrirCardCliente(e)} className="hover:bg-primary-50/50 cursor-pointer">
                        <td className="py-2 px-2 font-semibold text-gray-900">{e.cardPrincipal.razaoSocial}</td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${SITUACAO_COMPRA_CONFIG[e.situacaoCompra].cor}`}>
                            {SITUACAO_COMPRA_CONFIG[e.situacaoCompra].label}{e.diasSemCompra != null ? ` · ${e.diasSemCompra}d` : ''}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${SITUACAO_CADASTRO_CONFIG[e.situacaoCadastro].cor}`}>
                            {SITUACAO_CADASTRO_CONFIG[e.situacaoCadastro].label}{e.camposFaltantes.length > 0 ? ` (${e.camposFaltantes.length})` : ''}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold">{e.diasSemContato == null ? 'Sem contato' : `${e.diasSemContato}d`}</td>
                        <td className="py-2 px-2 text-gray-600">{e.ultimoContatoISO ? `${fmtDataCurta(e.ultimoContatoISO)}${e.ultimoContatoObjetivo ? ` · ${OBJETIVO_RELATORIO_LABEL[e.ultimoContatoObjetivo]}` : ''}` : '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{e.proximaTarefa ? `${e.proximaTarefa.titulo.slice(0, 30)} (${fmtDataCurta(e.proximaTarefa.data)})` : <span className="text-red-600 font-semibold">Sem tarefa</span>}</td>
                        <td className="py-2 px-2 text-gray-600 max-w-[200px] truncate">{e.justificativaPrazoLongo || '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{e.segmento || '—'}</td>
                      </tr>
                    ))}
                    {empresasNivel2Ordenadas.length === 0 && (
                      <tr><td colSpan={8} className="py-6 text-center text-gray-400">Nenhum cliente nesta faixa de cadência.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== ABA 3: CADASTROS (Itens 4.7, 4.8 e 12) ==================== */}
      {aba === 'cadastros' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {([
              { key: 'completo', label: 'Completos', lista: indTotalAtivos.situacaoCadastroCounts.completo, cor: 'text-blue-700' },
              { key: 'completo_com_justificativa', label: 'Completos c/ justificativa', lista: indTotalAtivos.situacaoCadastroCounts.completo_com_justificativa, cor: 'text-purple-700' },
              { key: 'incompleto', label: 'Incompletos (≤15d)', lista: indTotalAtivos.situacaoCadastroCounts.incompleto, cor: 'text-orange-600' },
              { key: 'incompleto_vencido', label: 'Incompletos vencidos (>15d)', lista: indTotalAtivos.situacaoCadastroCounts.incompleto_vencido, cor: 'text-orange-900' },
            ] as const).map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => abrirListaEmpresas(`Cadastro · ${item.label}`, item.lista, { section: 'cadastro' })}
                className="text-left bg-white hover:bg-primary-50/40 border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer"
              >
                <p className="text-xs font-semibold text-gray-500">{item.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${item.cor}`}>{item.lista.length}</p>
              </button>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3.5">
            <h4 className="text-xs font-bold text-gray-800 mb-2">Auditoria de campos marcados como “Não possui” ({indTotalAtivos.justificativasCadastro.length})</h4>
            {indTotalAtivos.justificativasCadastro.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Nenhuma justificativa de “Não possui” registrada no filtro atual.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="text-left py-2 px-2">Cliente</th>
                      <th className="text-left py-2 px-2">Campo</th>
                      <th className="text-left py-2 px-2">Justificativa</th>
                      <th className="text-left py-2 px-2">Autor</th>
                      <th className="text-left py-2 px-2">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {indTotalAtivos.justificativasCadastro.slice(0, 50).map((j, idx) => (
                      <tr key={idx} onClick={() => abrirCardCliente(j.empresa, undefined, { section: 'cadastro' })} className="hover:bg-primary-50/50 cursor-pointer">
                        <td className="py-2 px-2 font-semibold text-gray-900">{j.empresa.cardPrincipal.razaoSocial}</td>
                        <td className="py-2 px-2 text-purple-700 font-medium">{CADASTRO_CAMPO_LABEL[j.item.campo]}</td>
                        <td className="py-2 px-2 text-gray-700">{j.item.justificativa}</td>
                        <td className="py-2 px-2 text-gray-500">{j.item.autorNome || '—'}</td>
                        <td className="py-2 px-2 text-gray-500">{fmtDataCurta(j.item.criadoEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== ABA 4: FUNIL E VENDAS (Itens 4.12–17, 5 e 11) ==================== */}
      {aba === 'funil_vendas' && (
        <div className="space-y-3">
          {/* Cartões de resultado do trabalho (Item 4: 12 a 17 + Item 5 corrigidos) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {[
              { label: 'Ativos (≤40d)', val: metricasBaseCorrigidas.ativos40d.length, sub: `Novos no período: ${metricasBaseCorrigidas.novosNoPeriodo.length}`, formula: 'empresas únicas com última venda enviada ao Omie há até 40 dias', onClick: () => abrirListaEmpresas('Clientes Ativos (≤40d)', metricasBaseCorrigidas.ativos40d) },
              { label: 'Retenção / Churn', val: `${metricasBaseCorrigidas.retencaoPct}%`, sub: `Churn: ${metricasBaseCorrigidas.churnPct}%`, formula: 'compradores mantidos até 60d ÷ total de compradores históricos', onClick: () => abrirListaEmpresas('Clientes em Churn (>90d sem compra)', metricasBaseCorrigidas.emChurn) },
              { label: 'Pedido s/ contato 15d', val: indTotalAtivos.pedidosSemContato15d.length, sub: 'sem tarefa concluída antes', formula: 'pedidos confirmados sem tarefa finalizada nos 15 dias anteriores', onClick: () => abrirListaCustom('Pedidos sem contato registrado (15d antes)', indTotalAtivos.pedidosSemContato15d.map(x => ({ key: `psc-${x.pedido.id}`, empresa: x.empresa, focus: { section: 'pedidos', pedidoId: x.pedido.id }, extraInfo: `Pedido ${x.pedido.numero} · ${fmtMoeda(x.pedido.totalValor)}` })), 'pedidos') },
              { label: 'Fora do próprio ritmo', val: indTotalAtivos.clientesForaDoRitmo.length, sub: '> 1,2x intervalo médio', formula: 'clientes com dias sem comprar > 1,2 × intervalo médio histórico', onClick: () => abrirListaCustom('Clientes fora do próprio ritmo', indTotalAtivos.clientesForaDoRitmo.map(x => ({ key: `rit-${x.empresa.chave}`, empresa: x.empresa, extraInfo: `Ritmo médio: ${x.intervaloMedioDias}d · Sem comprar há ${x.diasDesdeUltimaCompra}d`, diasOrdenacao: x.diasDesdeUltimaCompra })), 'clientes') },
              { label: 'Amostra >30d / Proposta >3d', val: `${indTotalAtivos.amostrasSemRetorno30d.length} / ${indTotalAtivos.propostasParadas3d.length}`, sub: `Conv.: Am. ${indTotalAtivos.pctAmostrasViraramPedido}% · Prop. ${indTotalAtivos.pctPropostasViraramPedido}%`, formula: 'amostras há >30d sem conclusão e propostas há >3d sem follow-up', onClick: () => abrirListaCustom('Amostras >30d e Propostas paradas >3d', [...indTotalAtivos.amostrasSemRetorno30d.map(x => ({ key: `am-${x.card.id}`, empresa: x.empresa, clienteCard: x.card, extraInfo: `Amostra parada há ${x.dias}d`, diasOrdenacao: x.dias })), ...indTotalAtivos.propostasParadas3d.map(x => ({ key: `pr-${x.card.id}`, empresa: x.empresa, clienteCard: x.card, extraInfo: `Proposta sem follow-up (${x.dias}d)`, diasOrdenacao: x.dias }))], 'cards') },
              { label: 'Reativações / Lead time', val: `${indTotalAtivos.reativacoesMes.length} reat.`, sub: indTotalAtivos.leadTimeMediaDias != null ? `Lead time: ${indTotalAtivos.leadTimeMediaDias}d (máx ${indTotalAtivos.leadTimeMaxDias}d)` : 'Lead time: sem NF no período', formula: 'clientes que voltaram de Em risco/Inativo recente para Ativo; dias entre envio ao Omie e faturamento', onClick: () => indTotalAtivos.leadTimePedidos.length > 0 ? abrirListaCustom('Lead time dos pedidos (envio Omie → faturamento)', indTotalAtivos.leadTimePedidos.map(x => ({ key: `lt-${x.pedido.id}`, empresa: x.empresa, focus: { section: 'pedidos', pedidoId: x.pedido.id }, extraInfo: `Pedido ${x.pedido.numero} · ${x.diasLeadTime}d (${fmtDataCurta(x.dataEnvioISO)} → ${fmtDataCurta(x.dataFaturamentoISO)})`, diasOrdenacao: x.diasLeadTime })), 'pedidos') : abrirListaEmpresas('Clientes reativados no período', indTotalAtivos.reativacoesMes) },
            ].map(c => (
              <button key={c.label} type="button" onClick={c.onClick} title={c.formula} className="text-left bg-white hover:bg-primary-50/40 border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer">
                <p className="text-[11px] font-semibold text-gray-500 truncate">{c.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{c.val}</p>
                <p className="text-[10px] text-gray-400 truncate">{c.sub}</p>
              </button>
            ))}
          </div>

          {/* Pipeline por etapa (sem Perdido), Cards por etapa e Funil de Conversão real — tudo em barras horizontais (sem pizza!) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Pipeline por etapa (sem Perdido)</h4>
              <div className="space-y-1">
                {(() => {
                  const maxVal = Math.max(...pipelinePorEtapa.map(p => p.valor), 1)
                  return pipelinePorEtapa.map(p => (
                    <BarraHorizontalItem
                      key={p.etapa}
                      label={p.label}
                      valorTexto={`${p.qtd} · ${fmtMoeda(p.valor)}`}
                      pct={(p.valor / maxVal) * 100}
                      cor="#2563EB"
                      formula={`soma das propostas/valores ativos na etapa ${p.label} (exclui Perdido)`}
                      onClick={() => abrirListaCustom(`Pipeline · ${p.label}`, p.cards.map(c => ({ key: `pip-${c.id}`, empresa: empresaPorCardId.get(c.id), clienteCard: c, extraInfo: fmtMoeda(valorPropostaAtivaCard(c, mapaUltimaProposta)) })), 'cards')}
                    />
                  ))
                })()}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Cards por etapa</h4>
              <div className="space-y-1">
                {(() => {
                  const maxQtd = Math.max(...pipelinePorEtapa.map(p => p.qtd), 1)
                  return pipelinePorEtapa.map(p => (
                    <BarraHorizontalItem
                      key={p.etapa}
                      label={p.label}
                      valorTexto={`${p.qtd} card${p.qtd === 1 ? '' : 's'}`}
                      pct={(p.qtd / maxQtd) * 100}
                      cor="#7C3AED"
                      formula={`quantidade de cards atualmente na etapa ${p.label}`}
                      onClick={() => abrirListaCustom(`Cards por etapa · ${p.label}`, p.cards.map(c => ({ key: `ce-${c.id}`, empresa: empresaPorCardId.get(c.id), clienteCard: c })), 'cards')}
                    />
                  ))
                })()}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Funil de conversão real (por empresa única)</h4>
              <div className="space-y-1">
                {(() => {
                  const maxQtd = Math.max(...funilCoorte.map(f => f.qtd), 1)
                  return funilCoorte.map((f, idx) => (
                    <BarraHorizontalItem
                      key={f.key}
                      label={f.label}
                      valorTexto={`${f.qtd}${idx > 0 ? ` (${f.taxa}%)` : ''}`}
                      pct={(f.qtd / maxQtd) * 100}
                      cor="#0891B2"
                      formula="empresas únicas que atingiram esta etapa ou posterior ÷ etapa anterior"
                      onClick={() => abrirListaEmpresas(`Coorte · ${f.label}`, f.empresas)}
                    />
                  ))
                })()}
              </div>
            </div>
          </div>

          {/* Perdas separadas (sem pizza: top 5 motivos em barras horizontais) + Tempo Médio por Etapa unificado */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-800">Perdas ({cardsPerdidos.length} cards · {fmtMoeda(cardsPerdidos.reduce((s, c) => s + valorPropostaAtivaCard(c, mapaUltimaProposta), 0))})</h4>
                <span className="text-[11px] text-gray-400">5 principais motivos</span>
              </div>
              {top5MotivosPerda.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Sem dados no período</p>
              ) : (
                <div className="space-y-1">
                  {top5MotivosPerda.map(m => (
                    <BarraHorizontalItem
                      key={m.key}
                      label={m.label}
                      valorTexto={`${m.qtd} card${m.qtd === 1 ? '' : 's'}`}
                      pct={(m.qtd / Math.max(cardsPerdidos.length, 1)) * 100}
                      cor="#DC2626"
                      formula={`cards perdidos pelo motivo ${m.label}`}
                      onClick={() => abrirListaCustom(`Perdas · ${m.label}`, m.cards.map(c => ({ key: `perd-${c.id}`, empresa: empresaPorCardId.get(c.id), clienteCard: c, extraInfo: c.motivoPerda || m.label })), 'cards')}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <h4 className="text-xs font-bold text-gray-800">Tempo médio nos cards atuais por etapa (cálculo único)</h4>
              <div className="space-y-1">
                {(() => {
                  const maxD = Math.max(...tempoAtualPorEtapa.map(t => t.media), 1)
                  return tempoAtualPorEtapa.map(t => (
                    <BarraHorizontalItem
                      key={t.etapa}
                      label={t.label}
                      valorTexto={`${t.media}d (${t.cards.length} card${t.cards.length === 1 ? '' : 's'})`}
                      pct={(t.media / maxD) * 100}
                      cor="#EA580C"
                      formula="média de dias na etapa atual considerando apenas os cards atualmente abertos nela"
                      onClick={() => abrirListaCustom(`Tempo atual · ${t.label}`, t.cards.map(c => ({ key: `tm-${c.id}`, empresa: empresaPorCardId.get(c.id), clienteCard: c, extraInfo: `${diasEtapaAtual(c)}d na etapa`, diasOrdenacao: diasEtapaAtual(c) })), 'cards')}
                    />
                  ))
                })()}
              </div>
            </div>
          </div>

          {/* Tempo médio por Etapa e Vendedor (apenas cards atuais — Item 5) */}
          {isGerente && (
            <div className="bg-white border border-gray-200 rounded-xl p-3 overflow-x-auto">
              <h4 className="text-xs font-bold text-gray-800 mb-2">Tempo médio na etapa atual por vendedor (apenas cards atuais)</h4>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left py-1.5 px-2">Vendedor</th>
                    {etapasPipelineSemPerdido.map(et => <th key={et} className="text-center py-1.5 px-2">{stageLabels[et] || et}</th>)}
                    <th className="text-right py-1.5 px-2">Lead time pedido (méd.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {linhasVendedores.filter(l => l.ativo).map(l => {
                    const cardsVend = cardsVisiveisSemBancos.filter(c => c.vendedorId === l.vendedorId)
                    return (
                      <tr key={String(l.vendedorId)}>
                        <td className="py-1.5 px-2 font-semibold text-gray-900">{l.vendedorNome}</td>
                        {etapasPipelineSemPerdido.map(et => {
                          const cs = cardsVend.filter(c => c.etapa === et)
                          const med = cs.length > 0 ? Math.round(cs.reduce((s, c) => s + diasEtapaAtual(c), 0) / cs.length) : null
                          return (
                            <td
                              key={et}
                              onClick={() => cs.length > 0 && abrirListaCustom(`${l.vendedorNome} · ${stageLabels[et]}`, cs.map(c => ({ key: `ve-${c.id}`, empresa: empresaPorCardId.get(c.id), clienteCard: c, extraInfo: `${diasEtapaAtual(c)}d na etapa`, diasOrdenacao: diasEtapaAtual(c) })), 'cards')}
                              className={`py-1.5 px-2 text-center ${cs.length > 0 ? 'cursor-pointer hover:bg-primary-50' : 'text-gray-300'}`}
                            >
                              {med != null ? <span className="font-semibold text-gray-800">{med}d <span className="text-[10px] text-gray-400">({cs.length})</span></span> : '—'}
                            </td>
                          )
                        })}
                        <td className="py-1.5 px-2 text-right font-semibold text-gray-700">
                          {l.leadTimeMediaDias != null ? `${l.leadTimeMediaDias}d` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tabelas longas paginadas em 20 linhas: Tempo na Etapa Atual e Clientes Perdidos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <h4 className="text-xs font-bold text-gray-800">Tempo na etapa atual por cliente ({tempoNaEtapaClientes.length})</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="text-left py-1.5 px-2">Cliente</th>
                      <th className="text-left py-1.5 px-2">Etapa</th>
                      <th className="text-right py-1.5 px-2">Dias</th>
                      <th className="text-left py-1.5 px-2">Vendedor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tempoNaEtapaClientes.slice((tempoEtapaPage - 1) * PAGE_SIZE, tempoEtapaPage * PAGE_SIZE).map(item => (
                      <tr key={item.card.id} onClick={() => abrirCardCliente(item.empresa, item.card)} className="hover:bg-primary-50/50 cursor-pointer">
                        <td className="py-1.5 px-2 font-medium text-gray-900 truncate max-w-[180px]">{item.card.razaoSocial}</td>
                        <td className="py-1.5 px-2 text-gray-600">{stageLabels[item.card.etapa] || item.card.etapa}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-gray-900">{item.dias}d</td>
                        <td className="py-1.5 px-2 text-gray-500">{item.vendedorNome.split(' ')[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tempoNaEtapaClientes.length > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-gray-500">
                  <span>Pág. {tempoEtapaPage}/{Math.ceil(tempoNaEtapaClientes.length / PAGE_SIZE)}</span>
                  <div className="flex gap-1">
                    <button type="button" disabled={tempoEtapaPage <= 1} onClick={() => setTempoEtapaPage(p => p - 1)} className="px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer">Anterior</button>
                    <button type="button" disabled={tempoEtapaPage >= Math.ceil(tempoNaEtapaClientes.length / PAGE_SIZE)} onClick={() => setTempoEtapaPage(p => p + 1)} className="px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer">Próxima</button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <h4 className="text-xs font-bold text-gray-800">Clientes perdidos ({cardsPerdidos.length})</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="text-left py-1.5 px-2">Cliente</th>
                      <th className="text-left py-1.5 px-2">Motivo</th>
                      <th className="text-right py-1.5 px-2">Valor</th>
                      <th className="text-left py-1.5 px-2">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cardsPerdidos.slice((perdidosPage - 1) * PAGE_SIZE, perdidosPage * PAGE_SIZE).map(c => (
                      <tr key={c.id} onClick={() => abrirCardCliente(empresaPorCardId.get(c.id), c)} className="hover:bg-red-50/50 cursor-pointer">
                        <td className="py-1.5 px-2 font-medium text-gray-900 truncate max-w-[180px]">{c.razaoSocial}</td>
                        <td className="py-1.5 px-2 text-gray-600 truncate max-w-[140px]">{c.motivoPerda || c.categoriaPerda || 'Outro'}</td>
                        <td className="py-1.5 px-2 text-right font-semibold text-red-600">{fmtMoeda(valorPropostaAtivaCard(c, mapaUltimaProposta))}</td>
                        <td className="py-1.5 px-2 text-gray-500">{fmtDataCurta(c.dataPerda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cardsPerdidos.length > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-gray-500">
                  <span>Pág. {perdidosPage}/{Math.ceil(cardsPerdidos.length / PAGE_SIZE)}</span>
                  <div className="flex gap-1">
                    <button type="button" disabled={perdidosPage <= 1} onClick={() => setPerdidosPage(p => p - 1)} className="px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer">Anterior</button>
                    <button type="button" disabled={perdidosPage >= Math.ceil(cardsPerdidos.length / PAGE_SIZE)} onClick={() => setPerdidosPage(p => p + 1)} className="px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer">Próxima</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== ABA 5: BANCOS DE CLIENTES E DE PROSPECTOS (SÓ GESTOR — Item 10) ==================== */}
      {aba === 'bancos' && isGerente && (() => {
        const listaBase = todasEmpresasBrutas
          .filter(e => e.banco === bancoSubAba)
          .filter(e => {
            if (filtros.segmento !== 'todos' && e.segmento !== filtros.segmento) return false
            if (filtros.uf !== 'todos' && e.uf !== filtros.uf) return false
            if (filtros.situacaoCadastro !== 'todos' && e.situacaoCadastro !== filtros.situacaoCadastro) return false
            if (filtros.situacaoCompra !== 'todos' && e.situacaoCompra !== filtros.situacaoCompra) return false
            if (!bancoSearch.trim()) return true
            const q = bancoSearch.toLowerCase()
            const qd = bancoSearch.replace(/\D/g, '')
            const cnpj = String(e.cardPrincipal.cnpj || e.cardPrincipal.cpf || '')
            return e.cardPrincipal.razaoSocial.toLowerCase().includes(q) || cnpj.includes(q) || (qd.length >= 3 && cnpj.replace(/\D/g, '').includes(qd))
          })
          .sort((a, b) => (b.diasSemCompra ?? 999999) - (a.diasSemCompra ?? 999999))

        const pagina = listaBase.slice((bancoPage - 1) * PAGE_SIZE, bancoPage * PAGE_SIZE)
        const selecionadasObj = todasEmpresasBrutas.filter(e => selecionadosChaves.has(e.chave))

        return (
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setBancoSubAba('clientes'); setBancoPage(1); setSelecionadosChaves(new Set()) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${bancoSubAba === 'clientes' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Banco de Clientes — já compraram ({todasEmpresasBrutas.filter(e => e.banco === 'clientes').length})
                </button>
                <button
                  type="button"
                  onClick={() => { setBancoSubAba('prospectos'); setBancoPage(1); setSelecionadosChaves(new Set()) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${bancoSubAba === 'prospectos' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Banco de Prospectos — nunca compraram ({todasEmpresasBrutas.filter(e => e.banco === 'prospectos').length})
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={bancoSearch}
                  onChange={e => { setBancoSearch(e.target.value); setBancoPage(1) }}
                  placeholder="Buscar por nome ou CNPJ..."
                  className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg"
                />
                <select
                  value={destinoRedistribuicao}
                  onChange={e => setDestinoRedistribuicao(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50"
                >
                  <option value="">Redistribuir selecionados para...</option>
                  {vendedores.filter(v => v.ativo !== false).map(v => (
                    <option key={v.id} value={String(v.id)}>{v.nome}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={movendoLote || selecionadasObj.length === 0 || !destinoRedistribuicao}
                  onClick={() => executarMovimentacaoCarteira(selecionadasObj, destinoRedistribuicao)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
                  {movendoLote ? 'Movendo...' : `Redistribuir (${selecionadasObj.length})`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 px-2 w-8">
                      <input
                        type="checkbox"
                        checked={pagina.length > 0 && pagina.every(e => selecionadosChaves.has(e.chave))}
                        onChange={ev => {
                          const next = new Set(selecionadosChaves)
                          pagina.forEach(e => ev.target.checked ? next.add(e.chave) : next.delete(e.chave))
                          setSelecionadosChaves(next)
                        }}
                      />
                    </th>
                    <th className="text-left py-2 px-2">Cliente</th>
                    <th className="text-left py-2 px-2">Sit. Compra</th>
                    <th className="text-left py-2 px-2">Sit. Cadastro</th>
                    <th className="text-right py-2 px-2">Dias s/ contato</th>
                    <th className="text-left py-2 px-2">Último contato</th>
                    <th className="text-left py-2 px-2">Segmento / UF</th>
                    <th className="text-right py-2 px-2">Ação rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagina.map(e => (
                    <tr key={e.chave} className="hover:bg-gray-50">
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={selecionadosChaves.has(e.chave)}
                          onChange={ev => {
                            const next = new Set(selecionadosChaves)
                            if (ev.target.checked) next.add(e.chave)
                            else next.delete(e.chave)
                            setSelecionadosChaves(next)
                          }}
                        />
                      </td>
                      <td onClick={() => abrirCardCliente(e)} className="py-2 px-2 font-semibold text-gray-900 cursor-pointer hover:text-primary-700">
                        <div>{e.cardPrincipal.razaoSocial}</div>
                        <div className="text-[10px] font-normal text-gray-400">{e.cardPrincipal.cnpj || e.cardPrincipal.cpf || ''}</div>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${SITUACAO_COMPRA_CONFIG[e.situacaoCompra].cor}`}>
                          {SITUACAO_COMPRA_CONFIG[e.situacaoCompra].label}{e.diasSemCompra != null ? ` · ${e.diasSemCompra}d` : ''}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${SITUACAO_CADASTRO_CONFIG[e.situacaoCadastro].cor}`}>
                          {SITUACAO_CADASTRO_CONFIG[e.situacaoCadastro].label}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-semibold">{e.diasSemContato == null ? 'Sem contato' : `${e.diasSemContato}d`}</td>
                      <td className="py-2 px-2 text-gray-600">{fmtDataCurta(e.ultimoContatoISO)}</td>
                      <td className="py-2 px-2 text-gray-600">{[e.segmento, e.uf].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="py-2 px-2 text-right">
                        <select
                          defaultValue=""
                          disabled={movendoLote}
                          onChange={ev => {
                            if (ev.target.value) {
                              executarMovimentacaoCarteira([e], ev.target.value)
                              ev.target.value = ''
                            }
                          }}
                          className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer"
                        >
                          <option value="">Enviar p/ vendedor...</option>
                          {vendedores.filter(v => v.ativo !== false).map(v => (
                            <option key={v.id} value={String(v.id)}>{v.nome}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {pagina.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-gray-400">Nenhum registro neste banco para os filtros atuais.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {listaBase.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-600">
                <span>Pág. {bancoPage}/{Math.ceil(listaBase.length / PAGE_SIZE)} · Total: {listaBase.length}</span>
                <div className="flex gap-1">
                  <button type="button" disabled={bancoPage <= 1} onClick={() => setBancoPage(p => p - 1)} className="px-2.5 py-1 border rounded disabled:opacity-40 cursor-pointer">Anterior</button>
                  <button type="button" disabled={bancoPage >= Math.ceil(listaBase.length / PAGE_SIZE)} onClick={() => setBancoPage(p => p + 1)} className="px-2.5 py-1 border rounded disabled:opacity-40 cursor-pointer">Próxima</button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ==================== ABA 6: MISSÕES (Item 11) ==================== */}
      {aba === 'missoes' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 text-orange-600"><FlagIcon className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-gray-500">Missões em andamento</p>
                <p className="text-xl font-bold text-gray-900">{missoes.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600"><FunnelIcon className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-gray-500">Custo estimado</p>
                <p className="text-xl font-bold text-gray-900">{fmtMoeda(missoes.reduce((s, m) => s + (m.custoEstimado || 0), 0))}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3.5">
            <h4 className="text-xs font-bold text-gray-800 mb-2">Missões ativas</h4>
            {missoes.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">Sem dados no período</p>
            ) : (
              <div className="divide-y divide-gray-100 text-xs">
                {missoes.map(m => (
                  <div key={m.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{m.nome}</p>
                      <p className="text-gray-500">{fmtDataCurta(m.dataSaida)} → {fmtDataCurta(m.dataRetorno)} · {(m.cidades || []).join(', ') || '—'}</p>
                    </div>
                    <span className="font-bold text-indigo-700">{fmtMoeda(m.custoEstimado || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RelatoriosView
