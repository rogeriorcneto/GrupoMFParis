import React, { useMemo, useState, useEffect } from 'react'
import {
  CurrencyDollarIcon,
  UsersIcon,
  ChartBarIcon,
  ClipboardDocumentCheckIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  CalendarDaysIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BuildingStorefrontIcon,
  MegaphoneIcon,
  TrophyIcon,
  FlagIcon,
  AcademicCapIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline'
import { calcularComissao, fetchComissaoProdutos, fetchComissaoLog, produtosIncompletos, type ComissaoProduto, type ComissaoLogEntry } from '../../lib/comissao'
import {
  calcularRitmo,
  fetchFeriados,
  fetchMetasMes,
  intervaloSemanaSegDom,
  metaSemanaProrrateada,
  pedidosVendidosPeriodo,
  somaMetasEquipe,
  vendidoPedidosPeriodo,
  volumeKgPedidos,
  type Feriado,
  type MetaVendedorMes,
} from '../../lib/metas'
import { stageLabels } from '../../utils/constants'
import { calcularIndicadoresComerciais, calcularIndicadoresOperacionais, criarIndiceEmpresas, criarMapaUltimaProposta, valorPropostaAtivaCard } from '../../utils/indicadores-comerciais'
import {
  calcularClientesSemNegociacao30d,
  calcularNegociacoesVendedor,
  classificarAlertaSaidaCarteira,
  dataSaidaDaCarteira,
  decisaoDesarmaAlerta,
  diasRestantesNaCarteira,
} from '../../utils/indicadores-negociacao'
import { fetchAllPropostas, fetchSaidaCarteiraDecisoes, insertInteracao, insertSaidaCarteiraDecisao, type SaidaCarteiraDecisao } from '../../lib/database'
import { authFetch, BOT_URL, fetchTempoTelaRelatorio, fetchRoleplayHistoryGerente } from '../../lib/botApi'
import { callAI } from '../../lib/gemini'
import { useParametrosListas } from '../../lib/parametrosListas'
import { BlocoBancoResumo, calcularIndicadoresGrupo, calcularResumoBancosFase2, consolidarEmpresasFase2 } from '../../utils/relatoriosFase2'
import { SITUACAO_COMPRA_CONFIG, situacaoContaNaCarteiraAte180 } from '../../utils/situacaoCompra'
import { obterSaudacaoBrasilia } from '../../utils/tarefaFluxo'
import type { ClientePanelFocus } from '../ClientePanel'
import type { Cliente, Vendedor, Interacao, Atividade, Produto, Tarefa, Pedido, DashboardMetrics, Missao, PropostaHistorico, ViewType } from '../../types'

interface Props {
  dataLoading?: boolean
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  metrics: DashboardMetrics
  atividades: Atividade[]
  produtos: Produto[]
  tarefas: Tarefa[]
  pedidos: Pedido[]
  loggedUser: Vendedor | null
  onNavigate?: (view: ViewType) => void
  onOpenCliente?: (cliente: Cliente, focus?: ClientePanelFocus) => void
  setInteracoes?: React.Dispatch<React.SetStateAction<Interacao[]>>
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const fmtDate = (d?: string | null) => {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtTime = (d?: string | null) => {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const ago = (d?: string | null) => {
  if (!d) return ''
  const diff = (Date.now() - new Date(d).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const hojeStr = new Date().toISOString().slice(0, 10)
const mesStr = new Date().toISOString().slice(0, 7)
const inicioSemana = new Date().setHours(0, 0, 0, 0) - new Date().getDay() * 24 * 60 * 60 * 1000
const fimSemana = inicioSemana + 7 * 24 * 60 * 60 * 1000

const isHoje = (d?: string | null) => !!d && d.slice(0, 10) === hojeStr
const isMes = (d?: string | null) => !!d && d.slice(0, 7) === mesStr
const isSemana = (d?: string | null) => {
  if (!d) return false
  const t = new Date(d).getTime()
  return t >= inicioSemana && t <= fimSemana
}

const stageColors: Record<string, string> = {
  lead: '#10B981',
  prospecção: '#3B82F6',
  amostra: '#F59E0B',
  proposta: '#6366F1',
  negociacao: '#A855F7',
  follow_up: '#22C55E',
}

interface MetricCardProps {
  label: string
  value: string
  meta: number
  total: number
  color: string
  unit?: string
  subtitle?: string
  icon: React.ReactNode
  onClick?: () => void
  metaLabel?: string
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, meta, total, color, unit, subtitle, icon, onClick, metaLabel = 'Meta' }) => {
  const pct = meta > 0 ? Math.min(100, Math.round((total / meta) * 100)) : 0
  return (
    <div className={`bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 flex flex-col justify-between h-full ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300 transition-all' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}20` }}>{icon}</div>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold text-gray-900">
          {value} {unit && <span className="text-sm font-medium text-gray-500">{unit}</span>}
        </p>
        {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {meta > 0 && (
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{metaLabel}: {meta.toLocaleString('pt-BR')}</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
      )}
    </div>
  )
}

const SmallMetric: React.FC<{ label: string; value: number; meta: number; color: string; icon: React.ReactNode }> = ({ label, value, meta, color, icon }) => {
  const pct = meta > 0 ? Math.min(100, Math.round((value / meta) * 100)) : 0
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1 rounded-md" style={{ backgroundColor: `${color}20` }}>{icon}</div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-lg font-bold text-gray-900">{value}</span>
        <span className="text-[10px] text-gray-500">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function DashboardVendedorView({
  dataLoading = false,
  clientes,
  vendedores,
  interacoes,
  atividades,
  tarefas,
  pedidos,
  produtos,
  loggedUser,
  onNavigate,
  onOpenCliente,
  setInteracoes,
}: Props) {
  const userId = loggedUser?.id
  const isGerente = loggedUser?.cargo === 'gerente'
  const { parametros } = useParametrosListas()

  // ─── Filtro de período ────────────────────────────────────────────────────────
  const hoje = new Date()
  const primeiroDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const hojeISO = hoje.toISOString().slice(0, 10)

  type PeriodoPreset = 'mes' | 'semana' | 'hoje' | 'custom'
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>('mes')
  const [periodoInicio, setPeriodoInicio] = useState(primeiroDiaMes)
  const [periodoFim, setPeriodoFim] = useState(hojeISO)

  const handlePreset = (p: PeriodoPreset) => {
    setPeriodoPreset(p)
    if (p === 'mes') { setPeriodoInicio(primeiroDiaMes); setPeriodoFim(hojeISO) }
    if (p === 'semana') {
      const d = new Date(); d.setDate(d.getDate() - d.getDay())
      setPeriodoInicio(d.toISOString().slice(0, 10)); setPeriodoFim(hojeISO)
    }
    if (p === 'hoje') { setPeriodoInicio(hojeISO); setPeriodoFim(hojeISO) }
  }

  const inRange = (d?: string | null) => {
    if (!d) return false
    const ds = d.slice(0, 10)
    return ds >= periodoInicio && ds <= periodoFim
  }

  // ─── Tempo de tela + academia (gerente) + propostas ativas ──────────────────
  const [tempoTelaData, setTempoTelaData] = useState<{ nome: string; totalSegundos: number }[]>([])

  const consolidadoFase2 = useMemo(() => {
    return consolidarEmpresasFase2(
      clientes,
      pedidos,
      tarefas,
      parametros.camposCadastroObrigatorios
    )
  }, [clientes, pedidos, tarefas, parametros.camposCadastroObrigatorios])

  // Item 7: "Minha carteira hoje" — vermelhos → amarelos → sem tarefa aberta → cadastro incompleto vencido + tarefas do dia
  const minhaCarteiraHoje = useMemo(() => {
    if (!userId) return null
    const minhasEmpresas = consolidadoFase2.empresas.filter(e => e.vendedorId === userId)
    const carteira180 = minhasEmpresas.filter(e => situacaoContaNaCarteiraAte180(e.situacaoCompra))
    const vermelhos = [...carteira180.filter(e => e.cadencia === 'vermelho')].sort(
      (a, b) => (b.diasSemContato ?? 999999) - (a.diasSemContato ?? 999999)
    )
    const amarelos = [...carteira180.filter(e => e.cadencia === 'amarelo')].sort(
      (a, b) => (b.diasSemContato ?? 0) - (a.diasSemContato ?? 0)
    )
    const semTarefaAberta = carteira180.filter(e => !e.temTarefaAberta)
    const cadastroIncompletoVencido = minhasEmpresas.filter(e => e.situacaoCadastro === 'incompleto_vencido')
    const tarefasDoDia = tarefas
      .filter(t => t.vendedorId === userId && t.status === 'pendente' && !!t.data && t.data <= hojeISO)
      .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''))
    return {
      possuiCarteira: minhasEmpresas.length > 0,
      vermelhos,
      amarelos,
      semTarefaAberta,
      cadastroIncompletoVencido,
      tarefasDoDia,
    }
  }, [userId, consolidadoFase2, tarefas, hojeISO])

  // Item 1 da devolutiva: Blocos próprios dos Bancos no Dashboard do gestor
  const resumoBancosDashboard = useMemo(() => {
    if (!isGerente) return null
    return calcularResumoBancosFase2({
      empresas: consolidadoFase2.empresas,
      empresaPorCardId: consolidadoFase2.empresaPorCardId,
      interacoes,
      tarefas,
      inicioISO: periodoInicio || '0001-01-01',
      fimISO: periodoFim || hojeISO,
    })
  }, [isGerente, consolidadoFase2, interacoes, tarefas, periodoInicio, periodoFim, hojeISO])

  const [listaBancoDrill, setListaBancoDrill] = useState<{
    titulo: string
    itens: { key: string; cliente?: Cliente; razao: string; cnpj: string; extra: string; situacaoLabel?: string; situacaoCor?: string; focus?: ClientePanelFocus }[]
  } | null>(null)
  const [listaBancoPage, setListaBancoPage] = useState(1)
  const [abaPrioridadeHoje, setAbaPrioridadeHoje] = useState<'vermelhos' | 'amarelos' | 'sem_tarefa' | 'cadastro_vencido' | 'tarefas_dia'>('vermelhos')
  const [academiaData, setAcademiaData] = useState<{ nome: string; treinos: number; minutos: number; notaMedia: number }[]>([])
  const [propostasLoaded, setPropostasLoaded] = useState<PropostaHistorico[]>([])

  useEffect(() => {
    fetchAllPropostas().then(setPropostasLoaded).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isGerente) return
    const idsAtivos = new Set(vendedores.filter(v => v.ativo).map(v => v.id))
    fetchTempoTelaRelatorio(periodoInicio, periodoFim).then(r => {
      setTempoTelaData(
        (r.relatorio || [])
          .filter((x: any) => !x.vendedorId || idsAtivos.size === 0 || idsAtivos.has(Number(x.vendedorId)))
          .map(x => ({ nome: x.nome, totalSegundos: x.totalSegundos }))
      )
    }).catch(() => {})
    fetchRoleplayHistoryGerente().then((r: any) => {
      const sessoes: any[] = r.sessoes || []
      const vendedoresAtivosIds = vendedores.filter(v => v.ativo && v.cargo !== 'gerente')
      const map = new Map<number, { treinos: number; segs: number; somaNotas: number; countNotas: number }>()
      sessoes.forEach((s: any) => {
        const dt = (s.created_at || s.data || '').slice(0, 10)
        if (dt < periodoInicio || dt > periodoFim) return
        const vid = Number(s.vendedor_id)
        const cur = map.get(vid) || { treinos: 0, segs: 0, somaNotas: 0, countNotas: 0 }
        cur.treinos++
        cur.segs += (s.duracao_segundos || 0)
        if (s.nota != null) { cur.somaNotas += s.nota; cur.countNotas++ }
        map.set(vid, cur)
      })
      setAcademiaData(vendedoresAtivosIds.map(v => {
        const d = map.get(v.id) || { treinos: 0, segs: 0, somaNotas: 0, countNotas: 0 }
        return { nome: v.nome, treinos: d.treinos, minutos: Math.floor(d.segs / 60), notaMedia: d.countNotas > 0 ? d.somaNotas / d.countNotas : 0 }
      }))
    }).catch(() => {})
  }, [isGerente, periodoInicio, periodoFim, vendedores])

  // ─── Data derivada (unificada com Relatórios e Funil — exclui bonificação/amostra e agrupa por empresa única; Bancos ficam nos seus blocos próprios) ──
  const meusClientes = useMemo(() => clientes.filter(c => !c.arquivadoDuplicata && (isGerente ? !!c.vendedorId : c.vendedorId === userId)), [clientes, userId, isGerente])
  const meusClientesIds = useMemo(() => new Set(meusClientes.map(c => c.id)), [meusClientes])
  const meusPedidos = useMemo(() => isGerente ? pedidos : pedidos.filter(p => p.vendedorId === userId), [pedidos, userId, isGerente])
  const indiceEmpresas = useMemo(() => criarIndiceEmpresas(clientes), [clientes])

  const metaVendas = isGerente
    ? vendedores.filter(v => v.ativo && v.cargo !== 'gerente').reduce((s, v) => s + (v.metaVendas || 0), 0) || 500000
    : (loggedUser?.metaVendas || 100000)
  const metaLeads = isGerente
    ? vendedores.filter(v => v.ativo && v.cargo !== 'gerente').reduce((s, v) => s + (v.metaLeads || 0), 0) || 20
    : (loggedUser?.metaLeads || 10)
  const metaConversao = loggedUser?.metaConversao || 35

  const periodoValidoInicio = periodoInicio || '2000-01-01'
  const periodoValidoFim = periodoFim && periodoFim >= periodoValidoInicio ? periodoFim : hojeISO

  const indCom = useMemo(() => calcularIndicadoresComerciais(
    clientes,
    pedidos,
    { inicio: periodoValidoInicio, fim: periodoValidoFim },
    { ...(isGerente ? {} : { vendedorId: userId }), meta: metaVendas }
  ), [clientes, pedidos, periodoValidoInicio, periodoValidoFim, isGerente, userId, metaVendas])

  // Motor único 100% algorítmico compartilhado com Relatórios (Itens 1, 2 e 3 da devolutiva)
  const indUnificado = useMemo(() => {
    const idsEquipeAtiva = new Set(
      vendedores
        .filter(v => v.ativo !== false)
        .filter(v => isGerente ? true : v.id === userId)
        .map(v => v.id)
    )
    const emps = consolidadoFase2.empresas.filter(e =>
      isGerente
        ? (e.vendedorId != null && (idsEquipeAtiva.size === 0 || idsEquipeAtiva.has(e.vendedorId)))
        : e.vendedorId === userId
    )
    const cardIds = new Set(emps.flatMap(e => e.cards.map(c => c.id)))
    const tars = tarefas.filter(t =>
      isGerente
        ? (t.vendedorId != null && (idsEquipeAtiva.size === 0 || idsEquipeAtiva.has(t.vendedorId)))
        : t.vendedorId === userId
    )
    const peds = pedidos.filter(p =>
      isGerente
        ? (cardIds.has(p.clienteId) || (p.vendedorId != null && (idsEquipeAtiva.size === 0 || idsEquipeAtiva.has(p.vendedorId))))
        : (p.vendedorId === userId || cardIds.has(p.clienteId))
    )
    return calcularIndicadoresGrupo({
      id: isGerente ? 'equipe' : (userId || 0),
      nome: isGerente ? 'Total equipe ativa' : (loggedUser?.nome || 'Vendedor'),
      ativo: true,
      somaNosTotais: true,
      empresasGrupo: emps,
      tarefasGrupo: tars,
      pedidosGrupo: peds,
      propostas: propostasLoaded,
      empresaPorCardId: consolidadoFase2.empresaPorCardId,
      inicioPeriodoISO: periodoValidoInicio,
      fimPeriodoISO: periodoValidoFim,
    })
  }, [vendedores, isGerente, userId, consolidadoFase2, tarefas, pedidos, propostasLoaded, loggedUser?.nome, periodoValidoInicio, periodoValidoFim])

  // Resultados no período (100% unificados com Relatórios — respeitam Hoje / Semana / Mês / Período)
  const fatMes = indUnificado.faturamentoPeriodo
  const novosClientesMes = indUnificado.novosClientesPeriodo.length
  const novosCadastrosMes = indUnificado.novosCadastrosPeriodo.length
  const propostasMes = indUnificado.propostasEnviadasPeriodo
  const visitasMes = indUnificado.visitasRealizadasPeriodo.length
  const taxaConversao = indUnificado.taxaConversaoPeriodo

  const minhasTarefas = useMemo(
    () => isGerente ? tarefas.filter(t => !!t.vendedorId) : tarefas.filter(t => t.vendedorId === userId),
    [tarefas, userId, isGerente]
  )
  const interacoesUsuario = useMemo(
    () => isGerente ? interacoes : interacoes.filter(i => meusClientesIds.has(i.clienteId)),
    [interacoes, meusClientesIds, isGerente]
  )
  const visitasHoje = useMemo(() => minhasTarefas.filter(t => (t.tipo === 'reuniao' || t.tipo === 'visita') && t.status === 'pendente' && isHoje(t.data)),
    [minhasTarefas])

  const mapaUltimaProposta = useMemo(() => criarMapaUltimaProposta(propostasLoaded), [propostasLoaded])

  const funil = useMemo(() => {
    const etapasDashboard = isGerente
      ? ['lead', 'prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up']
      : ['prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up']
    const isCardAtivoDaEtapa = (c: Cliente, s: string) =>
      s === 'follow_up' ? (c.etapa === 'follow_up' && c.statusFollowUp !== 'concluido') : c.etapa === s
    const max = Math.max(...etapasDashboard.map(s => meusClientes.filter(c => isCardAtivoDaEtapa(c, s)).length), 1)
    const valorPedidosPorCliente = new Map<number, number>()
    meusPedidos.filter(p => p.status === 'confirmado' && p.tipo !== 'bonificacao').forEach(p => {
      if (!valorPedidosPorCliente.has(p.clienteId)) valorPedidosPorCliente.set(p.clienteId, p.totalValor || 0)
    })
    return etapasDashboard.map(s => {
      const cardsEtapa = meusClientes.filter(c => isCardAtivoDaEtapa(c, s))
      const qtd = cardsEtapa.length
      const valor = cardsEtapa.reduce((acc, c) =>
        acc + (s === 'follow_up' ? (valorPedidosPorCliente.get(c.id) || valorPropostaAtivaCard(c, mapaUltimaProposta)) : valorPropostaAtivaCard(c, mapaUltimaProposta)), 0)
      return { stage: s, label: stageLabels[s] || s, qtd, valor, pct: Math.max((qtd / max) * 100, 8) }
    })
  }, [meusClientes, meusPedidos, mapaUltimaProposta, isGerente])

  const formatHoraAgenda = (hora?: string | null): string => {
    const raw = (hora || '').trim()
    const m = raw.match(/^(\d{1,2}):(\d{2})/)
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
    return '09:00'
  }

  const tarefasHoje = useMemo(() => {
    const base = (isGerente
      ? tarefas.filter(t => !!t.vendedorId && isHoje(t.data))
      : tarefas.filter(t => t.vendedorId === userId && isHoje(t.data))
    ).sort((a, b) => formatHoraAgenda(a.hora).localeCompare(formatHoraAgenda(b.hora)))
    // Deduplicação defensiva por empresa + título normalizado
    const vistas = new Set<string>()
    return base.filter(t => {
      const cli = clientes.find(c => c.id === t.clienteId)
      const emp = (cli?.razaoSocial || String(t.clienteId || '')).trim().toUpperCase()
      const tit = (t.titulo || '').trim().toUpperCase()
      const chave = `${emp}::${tit}`
      if (vistas.has(chave)) return false
      vistas.add(chave)
      return true
    })
  }, [tarefas, clientes, userId, isGerente])
  const tarefasPendentes = useMemo(
    () => (isGerente
      ? tarefas.filter(t => !!t.vendedorId && t.status !== 'concluida')
      : tarefas.filter(t => t.vendedorId === userId && t.status !== 'concluida')
    ).sort((a, b) => (a.data || '').localeCompare(b.data || '')),
    [tarefas, userId, isGerente]
  )

  const amostras = useMemo(
    () => meusClientes.filter(c => c.statusAmostra && !['aprovada', 'reprovada'].includes(c.statusAmostra)).slice(0, 5),
    [meusClientes]
  )

  const ranking = useMemo(() => {
    const map = new Map<number, number>()
    vendedores.forEach(v => map.set(v.id, 0))
    pedidos
      .filter(p => p.status === 'confirmado' && p.tipo !== 'bonificacao' && inRange(p.dataAprovacao || p.dataCriacao))
      .forEach(p => {
        map.set(p.vendedorId, (map.get(p.vendedorId) || 0) + p.totalValor)
      })
    return vendedores
      .map(v => ({ ...v, valor: map.get(v.id) || 0 }))
      .filter(v => v.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 3)
  }, [vendedores, pedidos, periodoInicio, periodoFim])

  const oportunidades = useMemo(() => {
    return meusClientes
      .filter(c => ['proposta', 'negociacao', 'follow_up'].includes(c.etapa) && valorPropostaAtivaCard(c, mapaUltimaProposta) > 0 && inRange(c.ultimaInteracao || c.dataEntradaEtapa))
      .sort((a, b) => valorPropostaAtivaCard(b, mapaUltimaProposta) - valorPropostaAtivaCard(a, mapaUltimaProposta))
      .slice(0, 5)
  }, [meusClientes, mapaUltimaProposta, periodoInicio, periodoFim])

  const atualizacoes = useMemo(
    () => (isGerente ? atividades : atividades.filter(a => loggedUser?.nome && a.vendedorNome === loggedUser.nome))
      .filter(a => !String(a.tipo || '').startsWith('store:'))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5),
    [atividades, loggedUser, isGerente]
  )

  const atividadesHoje = useMemo(() => ({
    ligacao: interacoesUsuario.filter(i => i.tipo === 'ligacao' && isHoje(i.data)).length,
    whatsapp: interacoesUsuario.filter(i => i.tipo === 'whatsapp' && isHoje(i.data)).length,
    email: interacoesUsuario.filter(i => i.tipo === 'email' && isHoje(i.data)).length,
    reuniao: interacoesUsuario.filter(i => i.tipo === 'reuniao' && isHoje(i.data)).length,
    prospeccao: meusClientes.filter(c => !c.novoCiclo && isHoje(c.criadoEm)).length,
  }), [interacoesUsuario, meusClientes])

  const [comissaoRows, setComissaoRows] = useState<ComissaoProduto[]>([])
  const [comissaoLog, setComissaoLog] = useState<ComissaoLogEntry[]>([])
  useEffect(() => {
    fetchComissaoProdutos().then(setComissaoRows).catch(() => {})
    fetchComissaoLog().then(setComissaoLog).catch(() => {})
  }, [])

  const pctMeta = metaVendas > 0 ? Math.min(100, Math.round((fatMes / metaVendas) * 100)) : 0
  // Item 3 — comissão por algoritmo: item a item dos pedidos confirmados no período,
  // valor × percentual do produto conforme tabela do pedido (A/B) e tipo do vendedor (CLT/RCA)
  const comissaoEscopo = useMemo(() => isGerente ? pedidos : pedidos.filter(p => p.vendedorId === userId), [pedidos, isGerente, userId])
  const comissaoRes = useMemo(() => calcularComissao(
    comissaoEscopo, vendedores, comissaoRows, comissaoLog,
    new Date(periodoValidoInicio + 'T00:00:00'), new Date(periodoValidoFim + 'T23:59:59'),
  ), [comissaoEscopo, vendedores, comissaoRows, comissaoLog, periodoValidoInicio, periodoValidoFim])
  const comissao = comissaoRes.total
  const comissaoIncompleta = useMemo(() => produtosIncompletos(produtos || [], comissaoRows).length, [produtos, comissaoRows])
  const metaComissao = 0

  // ─── Item 4 — Metas parametrizáveis (tabela metas_vendedor_mes + feriados) ──
  // A FONTE das metas é a tabela nova; os campos antigos do vendedor seguem
  // existindo por compatibilidade, mas não alimentam mais os quadros de meta.
  const [metasMesAtual, setMetasMesAtual] = useState<MetaVendedorMes[]>([])
  const [feriadosMetas, setFeriadosMetas] = useState<Feriado[]>([])
  const [metasCarregadas, setMetasCarregadas] = useState(false)
  useEffect(() => {
    const agora = new Date()
    fetchMetasMes(agora.getFullYear(), agora.getMonth() + 1)
      .then(rows => { setMetasMesAtual(rows); setMetasCarregadas(true) })
      .catch(() => setMetasCarregadas(true))
    fetchFeriados().then(setFeriadosMetas).catch(() => {})
  }, [])

  const anoCorrente = hoje.getFullYear()
  const mesCorrenteNum = hoje.getMonth() + 1
  const ultimoDiaMesISO = (() => {
    const ud = new Date(anoCorrente, mesCorrenteNum, 0).getDate()
    return `${anoCorrente}-${String(mesCorrenteNum).padStart(2, '0')}-${String(ud).padStart(2, '0')}`
  })()
  const nomeMesCorrente = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // Escopo de pedidos idêntico ao usado nos indicadores unificados (fatMes):
  // gerente → equipe ativa inteira; vendedor → pedidos dele + dos cards da carteira
  const pedidosEscopoMetas = useMemo(() => {
    const idsEquipeAtiva = new Set(
      vendedores
        .filter(v => v.ativo !== false)
        .filter(v => isGerente ? true : v.id === userId)
        .map(v => v.id)
    )
    const emps = consolidadoFase2.empresas.filter(e =>
      isGerente
        ? (e.vendedorId != null && (idsEquipeAtiva.size === 0 || idsEquipeAtiva.has(e.vendedorId)))
        : e.vendedorId === userId
    )
    const cardIds = new Set(emps.flatMap(e => e.cards.map(c => c.id)))
    return pedidos.filter(p =>
      isGerente
        ? (cardIds.has(p.clienteId) || (p.vendedorId != null && (idsEquipeAtiva.size === 0 || idsEquipeAtiva.has(p.vendedorId))))
        : (p.vendedorId === userId || cardIds.has(p.clienteId))
    )
  }, [vendedores, isGerente, userId, consolidadoFase2, pedidos])

  // Vendido no mês corrente e na semana corrente — SEMPRE no mês/semana,
  // independente do filtro de período da tela (item 4.1)
  const vendidoMesCorrente = useMemo(
    () => vendidoPedidosPeriodo(pedidosEscopoMetas, primeiroDiaMes, ultimoDiaMesISO),
    [pedidosEscopoMetas, primeiroDiaMes, ultimoDiaMesISO]
  )
  const semanaCorrente = useMemo(() => intervaloSemanaSegDom(hojeISO), [hojeISO])
  const pedidosVendidosMesCorrente = useMemo(
    () => pedidosVendidosPeriodo(pedidosEscopoMetas, primeiroDiaMes, ultimoDiaMesISO),
    [pedidosEscopoMetas, primeiroDiaMes, ultimoDiaMesISO]
  )
  const pedidosVendidosSemanaCorrente = useMemo(
    () => pedidosVendidosPeriodo(pedidosEscopoMetas, semanaCorrente.segunda, semanaCorrente.domingo),
    [pedidosEscopoMetas, semanaCorrente]
  )
  const vendidoSemanaCorrente = useMemo(
    () => Math.round(pedidosVendidosSemanaCorrente.reduce((s, p) => s + (Number(p.totalValor) || 0), 0) * 100) / 100,
    [pedidosVendidosSemanaCorrente]
  )
  const produtosPorId = useMemo(() => new Map((produtos || []).map(p => [p.id, p])), [produtos])
  const volumeKgMesCorrente = useMemo(() => volumeKgPedidos(pedidosVendidosMesCorrente, produtosPorId), [pedidosVendidosMesCorrente, produtosPorId])
  const volumeKgSemanaCorrente = useMemo(() => volumeKgPedidos(pedidosVendidosSemanaCorrente, produtosPorId), [pedidosVendidosSemanaCorrente, produtosPorId])

  // Meta do mês: gestor → soma das metas dos vendedores ativos; vendedor → a própria.
  // Sem fallback: se não houver meta cadastrada, os quadros mostram estado vazio (item 4.5).
  const metaMinhaRow = useMemo(
    () => metasMesAtual.find(m => m.vendedorId === userId) || null,
    [metasMesAtual, userId]
  )
  const metaEquipeSoma = useMemo(() => {
    const idsAtivos = new Set(vendedores.filter(v => v.ativo && v.cargo !== 'gerente').map(v => v.id))
    return somaMetasEquipe(metasMesAtual.filter(m => idsAtivos.has(m.vendedorId)))
  }, [metasMesAtual, vendedores])
  const existeMetaEquipe = useMemo(
    () => metasMesAtual.some(m => vendedores.some(v => v.id === m.vendedorId && v.ativo && v.cargo !== 'gerente')),
    [metasMesAtual, vendedores]
  )
  // Meta de faturamento do mês usada no quadro principal (item 4.1)
  const metaFatMesCorrente = isGerente
    ? (existeMetaEquipe ? metaEquipeSoma.metaFaturamento : 0)
    : (metaMinhaRow?.metaFaturamento || 0)

  const metaSemanaFat = useMemo(
    () => metaFatMesCorrente > 0 ? metaSemanaProrrateada(metaFatMesCorrente, hojeISO, feriadosMetas) : 0,
    [metaFatMesCorrente, hojeISO, feriadosMetas]
  )
  const metaSemanaKg = useMemo(
    () => (metaMinhaRow?.metaVolumeKg || 0) > 0 ? metaSemanaProrrateada(metaMinhaRow?.metaVolumeKg || 0, hojeISO, feriadosMetas) : 0,
    [metaMinhaRow, hojeISO, feriadosMetas]
  )
  const ritmoMeta = useMemo(
    () => calcularRitmo(metaFatMesCorrente, vendidoMesCorrente, hojeISO, feriadosMetas),
    [metaFatMesCorrente, vendidoMesCorrente, hojeISO, feriadosMetas]
  )

  // Contadores do mês corrente (sempre mês cheio até hoje, independente do filtro) para o quadro Minhas metas
  const noMesCorrente = (d?: string | null) => {
    const ds = (d || '').slice(0, 10)
    return !!ds && ds >= primeiroDiaMes && ds <= ultimoDiaMesISO
  }
  const visitasMesCorrente = useMemo(
    () => minhasTarefas.filter(t => (t.tipo === 'reuniao' || t.tipo === 'visita') && t.status === 'concluida' && noMesCorrente(t.concluidaEm || t.data)).length,
    [minhasTarefas, primeiroDiaMes, ultimoDiaMesISO]
  )
  const propostasMesCorrente = useMemo(
    () => propostasLoaded.length > 0
      ? propostasLoaded.filter(pr => meusClientesIds.has(pr.clienteId) && noMesCorrente(pr.criadoEm)).length
      : meusClientes.filter(c => c.dataProposta && noMesCorrente(c.dataProposta)).length,
    [propostasLoaded, meusClientesIds, meusClientes, primeiroDiaMes, ultimoDiaMesISO]
  )
  // Novos clientes no mês: empresas cuja primeira compra confirmada caiu no mês corrente (mesma ideia dos indicadores unificados)
  const novosClientesMesCorrente = useMemo(() => {
    const primeiraPorEmpresa = new Map<string, string>()
    for (const p of pedidosEscopoMetas) {
      if (p.status !== 'confirmado' || (p.tipo || 'venda') === 'bonificacao') continue
      const emp = indiceEmpresas.get(p.clienteId) || `cliente:${p.clienteId}`
      const dt = (p.dataAprovacao || p.dataEnvioOmie || p.dataCriacao || '').slice(0, 10)
      if (!dt) continue
      const cur = primeiraPorEmpresa.get(emp)
      if (!cur || dt < cur) primeiraPorEmpresa.set(emp, dt)
    }
    let n = 0
    primeiraPorEmpresa.forEach(dt => { if (dt >= primeiroDiaMes && dt <= ultimoDiaMesISO) n++ })
    return n
  }, [pedidosEscopoMetas, indiceEmpresas, primeiroDiaMes, ultimoDiaMesISO])

  // Indicadores operacionais (spec PDF vendedor): sem-compra, pipeline ponderado, ticket médio
  const indOps = useMemo(() => calcularIndicadoresOperacionais(
    clientes, pedidos,
    { inicio: periodoValidoInicio, fim: periodoValidoFim },
    hojeISO,
    { ...(isGerente ? {} : { vendedorId: userId }), propostas: propostasLoaded },
  ), [clientes, pedidos, periodoValidoInicio, periodoValidoFim, hojeISO, isGerente, userId, propostasLoaded])
  const ticketMedio = indCom.ticketMedioPedido || 0
  const topProdutosVendedor = [...indOps.porProduto.entries()].sort((a, b) => b[1].receita - a[1].receita).slice(0, 5)

  // ─── Itens 17, 18 e 21 — negociações por vendedor, clientes sem negociação
  // e alertas de saída da carteira. TODOS os números vêm das mesmas funções
  // puras de utils/indicadores-negociacao.ts usadas em Relatórios (regra de
  // divergência zero). ───────────────────────────────────────────────────────
  const [decisoesSaida, setDecisoesSaida] = useState<SaidaCarteiraDecisao[]>([])
  useEffect(() => {
    fetchSaidaCarteiraDecisoes().then(setDecisoesSaida).catch(() => {})
  }, [])

  // Escopo de vendedores idêntico ao usado em Relatórios: ativos não-gestores
  const vendedoresEscopoNeg = useMemo(
    () => vendedores.filter(v => v.ativo !== false && v.cargo !== 'gerente' && (isGerente || v.id === userId)),
    [vendedores, isGerente, userId]
  )

  // Item 17 — negociações por vendedor (mesma função pura do Relatórios)
  const negociacaoPorVendedor = useMemo(() => {
    return vendedoresEscopoNeg.map(v => ({
      vendedor: v,
      resumo: calcularNegociacoesVendedor(clientes, pedidos, { inicio: periodoValidoInicio, fim: periodoValidoFim }, v.id),
    }))
  }, [vendedoresEscopoNeg, clientes, pedidos, periodoValidoInicio, periodoValidoFim])

  // Item 18 — clientes da carteira sem negociação há +30 dias (mesma função pura do Relatórios)
  const semNegociacao30PorVendedor = useMemo(() => {
    const mapa = new Map<number, ReturnType<typeof calcularClientesSemNegociacao30d>>()
    for (const v of vendedoresEscopoNeg) {
      const emps = consolidadoFase2.empresas
        .filter(e => e.vendedorId === v.id)
        .map(e => ({
          chave: e.chave,
          vendedorId: e.vendedorId,
          naCarteira: situacaoContaNaCarteiraAte180(e.situacaoCompra),
          cardPrincipalId: e.cardPrincipal.id,
          cards: e.cards,
        }))
      mapa.set(v.id, calcularClientesSemNegociacao30d(emps, hojeISO))
    }
    return mapa
  }, [vendedoresEscopoNeg, consolidadoFase2, hojeISO])

  // Item 21 — alertas de saída da carteira (150–180d e saídos sem decisão do gestor)
  const alertasSaidaCarteira = useMemo(() => {
    const idsEquipeAtiva = new Set(
      vendedores
        .filter(v => v.ativo !== false)
        .filter(v => isGerente ? true : v.id === userId)
        .map(v => v.id)
    )
    const emps = consolidadoFase2.empresas.filter(e =>
      e.vendedorId != null && (isGerente ? idsEquipeAtiva.has(e.vendedorId) : e.vendedorId === userId)
    )
    const pre: { emp: typeof emps[number]; diasRestantes: number }[] = []
    const saiu: { emp: typeof emps[number]; dataSaida: string; diasFora: number }[] = []
    const decisoesInput = decisoesSaida.map(d => ({ cliente_id: d.clienteId, registrado_em: d.registradoEm }))
    for (const e of emps) {
      const tipo = classificarAlertaSaidaCarteira(e.diasSemCompra)
      if (tipo === 'pre_alerta' && e.diasSemCompra != null) {
        pre.push({ emp: e, diasRestantes: diasRestantesNaCarteira(e.diasSemCompra) })
      } else if (tipo === 'saiu' && e.ultimaVendaISO) {
        const ds = dataSaidaDaCarteira(e.ultimaVendaISO)
        if (!decisaoDesarmaAlerta(decisoesInput, e.cardPrincipal.id, ds)) {
          saiu.push({ emp: e, dataSaida: ds, diasFora: Math.max(0, (e.diasSemCompra || 0) - 180) })
        }
      }
    }
    pre.sort((a, b) => a.diasRestantes - b.diasRestantes || a.emp.chave.localeCompare(b.emp.chave))
    saiu.sort((a, b) => b.dataSaida.localeCompare(a.dataSaida) || a.emp.chave.localeCompare(b.emp.chave))
    return { pre, saiu }
  }, [consolidadoFase2, decisoesSaida, vendedores, isGerente, userId])

  // Drill-down unificado dos itens 17/18/21: número → lista → card do cliente
  type DrillNegItem = {
    key: string
    cliente?: Cliente
    razao: string
    extra: string
    acaoSaida?: { dataSaida: string }
  }
  const [drillNeg, setDrillNeg] = useState<{ titulo: string; itens: DrillNegItem[] } | null>(null)
  const [drillNegPage, setDrillNegPage] = useState(1)
  const abrirDrillNeg = (titulo: string, itens: DrillNegItem[]) => {
    setDrillNegPage(1)
    setDrillNeg({ titulo, itens })
  }

  // Modal de decisão do gestor (Item 21) — NADA é movido automaticamente
  const [decisaoModal, setDecisaoModal] = useState<{ emp: typeof alertasSaidaCarteira.saiu[number]['emp']; dataSaida: string } | null>(null)
  const [decisaoTipo, setDecisaoTipo] = useState<'manter_vendedor' | 'mover_banco' | 'outra'>('manter_vendedor')
  const [decisaoPrazo, setDecisaoPrazo] = useState('')
  const [decisaoTexto, setDecisaoTexto] = useState('')
  const [decisaoSalvando, setDecisaoSalvando] = useState(false)
  const [decisaoErro, setDecisaoErro] = useState('')

  const abrirDecisaoModal = (emp: typeof alertasSaidaCarteira.saiu[number]['emp'], dataSaida: string) => {
    setDecisaoTipo('manter_vendedor')
    setDecisaoPrazo('')
    setDecisaoTexto('')
    setDecisaoErro('')
    setDecisaoModal({ emp, dataSaida })
  }

  const salvarDecisaoSaida = async () => {
    if (!decisaoModal) return
    if (decisaoTipo === 'manter_vendedor' && !decisaoPrazo) {
      setDecisaoErro('Informe o prazo do plano de reativação.')
      return
    }
    if (decisaoTipo === 'outra' && !decisaoTexto.trim()) {
      setDecisaoErro('Descreva a ação a ser tomada.')
      return
    }
    setDecisaoSalvando(true)
    setDecisaoErro('')
    const cli = decisaoModal.emp.cardPrincipal
    const rotulo = decisaoTipo === 'manter_vendedor'
      ? 'Manter com o vendedor com plano de reativação'
      : decisaoTipo === 'mover_banco'
        ? 'Mover para o Banco de Clientes'
        : 'Outra ação'
    const detalhe = decisaoTipo === 'manter_vendedor'
      ? `Prazo: ${decisaoPrazo.split('-').reverse().join('/')}${decisaoTexto.trim() ? ` — ${decisaoTexto.trim()}` : ''}`
      : decisaoTexto.trim() || null
    try {
      await insertSaidaCarteiraDecisao({
        clienteId: cli.id,
        decisao: decisaoTipo,
        detalhe,
        prazo: decisaoTipo === 'manter_vendedor' ? decisaoPrazo : null,
        registradoPor: loggedUser?.nome || null,
      })
      // Registro no histórico do cliente (tabela interacoes — a que de fato
      // aparece na ficha; a tabela atividades não tem cliente_id)
      const interacaoSalva = await insertInteracao({
        clienteId: cli.id,
        tipo: 'nota',
        assunto: 'Decisão de saída da carteira',
        descricao: `Cliente saiu da carteira em ${decisaoModal.dataSaida.split('-').reverse().join('/')}. Decisão do gestor (${loggedUser?.nome || '—'}): ${rotulo}${detalhe ? ` — ${detalhe}` : ''}.${decisaoTipo === 'mover_banco' ? ' A movimentação para o Banco NÃO é automática: o gestor deve mover o cliente manualmente.' : ''}`,
        automatico: false,
        data: new Date().toISOString(),
      })
      setInteracoes?.(prev => [interacaoSalva, ...prev])
      const novas = await fetchSaidaCarteiraDecisoes().catch(() => null)
      if (novas) setDecisoesSaida(novas)
      setDecisaoModal(null)
      setDrillNeg(null)
    } catch (err: any) {
      setDecisaoErro(`Falha ao registrar a decisão: ${err?.message || 'tente novamente'}`)
    } finally {
      setDecisaoSalvando(false)
    }
  }

  const clicarItemDrillNeg = (item: DrillNegItem) => {
    if (item.acaoSaida && isGerente) {
      const emp = consolidadoFase2.empresas.find(e => e.cardPrincipal.id === item.cliente?.id)
      if (emp) {
        abrirDecisaoModal(emp, item.acaoSaida.dataSaida)
        return
      }
    }
    if (item.cliente) onOpenCliente?.(item.cliente)
  }

  // Item 12 — Follow-up sem satisfação há mais de 15 dias (a partir de dataEntradaEtapa; nenhum ciclo encerrado automaticamente)
  const followUpSemSatisfacao15d = useMemo(() => {
    const diasDesdeISO = (d?: string) => d ? Math.max(0, Math.floor((Date.parse(hojeISO) - Date.parse(d.slice(0, 10))) / 86400000)) : 0
    return meusClientes
      .filter(c => c.etapa === 'follow_up' && c.statusFollowUp !== 'concluido' && c.notaSatisfacao == null && diasDesdeISO(c.dataEntradaEtapa) > 15)
      .map(c => ({ cliente: c, dias: diasDesdeISO(c.dataEntradaEtapa) }))
      .sort((a, b) => b.dias - a.dias)
  }, [meusClientes, hojeISO])

  // Gargalos comerciais acionáveis (situação de hoje + recorte do período — unificados 100% com Relatórios!)
  const gargalos = useMemo(() => {
    const diasDesdeISO = (d?: string) => d ? Math.max(0, Math.floor((Date.parse(hojeISO) - Date.parse(d.slice(0, 10))) / 86400000)) : 0
    return {
      tarefasAtrasadas: indUnificado.tarefasAtrasadas.length,
      tarefasVencidasNoPeriodo: indUnificado.tarefasVencidasNoPeriodo.length,
      semTarefaAbertaHoje: indUnificado.semTarefaAberta.length,
      amostrasMais30d: indUnificado.amostrasSemRetorno30d.length,
      negociacoesMais3d: meusClientes.filter(c => c.etapa === 'negociacao' && diasDesdeISO(c.dataEntradaEtapa) > 3).length,
      semCompraMais60d: indUnificado.situacaoCompraCounts.em_risco.length + indUnificado.situacaoCompraCounts.inativo_recente.length + indUnificado.situacaoCompraCounts.inativo_antigo.length,
    }
  }, [indUnificado, meusClientes, hojeISO])

  const [missoesAtivas, setMissoesAtivas] = useState<Missao[]>([])

  useEffect(() => {
    authFetch(`${BOT_URL}/api/missoes?status=em_andamento`)
      .then(r => r.json())
      .then(r => setMissoesAtivas(r.data || []))
      .catch(() => {})
  }, [])

  const visitasMissao = tarefas.filter(t => t.missaoId && missoesAtivas.some(m => m.id === t.missaoId)).length

  // Dicas operacionais usando exatamente os números unificados da tela (Item 3: sem divergência de 927 clientes!)
  const dica = useMemo(() => {
    if (dataLoading) return 'Carregando indicadores da carteira...'
    if (indUnificado.semTarefaAberta.length > 0) {
      return `Há ${indUnificado.semTarefaAberta.length} cliente(s) da carteira (≤180d) sem tarefa aberta hoje e ${indUnificado.tarefasAtrasadas.length} tarefa(s) atrasada(s). Priorize zerar pendências.`
    }
    if (indUnificado.vermelhos.length > 0) {
      return `${indUnificado.vermelhos.length} cliente(s) da carteira estão vencidos na cadência (>15d sem contato) e ${gargalos.semCompraMais60d} estão sem compra há 61+ dias.`
    }
    if (indUnificado.amostrasSemRetorno30d.length > 0) {
      return `${indUnificado.amostrasSemRetorno30d.length} amostra(s) estão há mais de 30 dias aguardando retorno. Acompanhe o teste para acelerar a conversão.`
    }
    return 'Carteira com cadência e tarefas em dia. Aproveite para qualificar novos leads e avançar propostas.'
  }, [dataLoading, indUnificado, gargalos.semCompraMais60d])

  // ─── Detalhamento por vendedor (modal) ───────────────────────────────────────
  type DetailKey = 'faturamento' | 'comissao' | 'visitas' | 'propostas' | 'novos' | 'conversao' | 'visitasHoje' | 'missoes' | 'visitasMissao'
  const [detailOpen, setDetailOpen] = useState<DetailKey | null>(null)

  const vendedoresAtivos = useMemo(() => vendedores.filter(v => v.ativo && v.cargo !== 'gerente'), [vendedores])

  const detailData = useMemo(() => {
    if (!detailOpen || !isGerente) return []
    return vendedoresAtivos.map(v => {
      const vc = clientes.filter(c => !c.arquivadoDuplicata && c.vendedorId === v.id)
      const vcIds = new Set(vc.map(c => c.id))
      const vp = pedidos.filter(p => p.vendedorId === v.id && p.tipo !== 'bonificacao')
      const vt = tarefas.filter(t => t.vendedorId === v.id)
      const indV = calcularIndicadoresComerciais(clientes, pedidos, { inicio: periodoValidoInicio, fim: periodoValidoFim }, { vendedorId: v.id })
      let valor = 0
      let label = ''
      switch (detailOpen) {
        case 'faturamento':
          valor = indV.vendasConfirmadas
          label = fmtBRL(valor)
          break
        case 'comissao':
          valor = indV.vendasConfirmadas * 0.01
          label = fmtBRL(valor)
          break
        case 'visitas':
          valor = vt.filter(t => (t.tipo === 'reuniao' || t.tipo === 'visita') && t.status === 'concluida' && inRange(t.concluidaEm || t.data)).length
          label = String(valor)
          break
        case 'propostas':
          valor = propostasLoaded.length > 0
            ? propostasLoaded.filter(pr => vcIds.has(pr.clienteId) && inRange(pr.criadoEm)).length
            : vc.filter(c => c.dataProposta && inRange(c.dataProposta)).length
          label = String(valor)
          break
        case 'novos':
          valor = indV.novosClientes
          label = `${valor} (${vc.filter(c => !c.novoCiclo && inRange(c.criadoEm)).length} cadastros)`
          break
        case 'conversao': {
          const empCart = new Set(vc.map(c => indiceEmpresas.get(c.id) || `cliente:${c.id}`))
          const empComp = new Set(vp.filter(p => p.status === 'confirmado').map(p => indiceEmpresas.get(p.clienteId) || `cliente:${p.clienteId}`))
          valor = empCart.size > 0 ? (empComp.size / empCart.size) * 100 : 0
          label = `${valor.toFixed(0)}%`
          break
        }
        case 'visitasHoje':
          valor = vt.filter(t => (t.tipo === 'reuniao' || t.tipo === 'visita') && t.status === 'pendente' && isHoje(t.data)).length
          label = String(valor)
          break
        case 'visitasMissao':
          valor = vt.filter(t => t.missaoId && missoesAtivas.some(m => m.id === t.missaoId)).length
          label = String(valor)
          break
        default:
          break
      }
      return { nome: v.nome, valor, label }
    }).sort((a, b) => b.valor - a.valor)
  }, [detailOpen, isGerente, vendedoresAtivos, clientes, pedidos, tarefas, missoesAtivas, periodoInicio, periodoFim])

  // ─── Relatório IA ──────────────────────────────────────────────────────────
  const [relatorioIA, setRelatorioIA] = useState<string | null>(null)
  const [relatorioLoading, setRelatorioLoading] = useState(false)
  const [relatorioOpen, setRelatorioOpen] = useState(false)

  const gerarRelatorioIA = async () => {
    setRelatorioLoading(true)
    setRelatorioOpen(true)
    setRelatorioIA(null)
    const periodoLabel = periodoPreset === 'hoje' ? 'diário' : periodoPreset === 'semana' ? 'semanal' : periodoPreset === 'mes' ? 'mensal' : `de ${periodoInicio} a ${periodoFim}`
    const kpis = [
      `Período: ${periodoLabel} (${new Date(periodoInicio).toLocaleDateString('pt-BR')} a ${new Date(periodoFim).toLocaleDateString('pt-BR')})`,
      `Cargo: ${isGerente ? 'Gerente' : 'Vendedor'}`,
      `Faturamento: ${fmtBRL(fatMes)} (meta ${fmtBRL(metaVendas)}, ${pctMeta}%)`,
      `Comissão estimada: ${fmtBRL(comissao)}`,
      `Visitas realizadas: ${visitasMes}`,
      `Propostas enviadas: ${propostasMes}`,
      `Novos clientes: ${novosClientesMes} (meta ${metaLeads})`,
      `Taxa de conversão: ${taxaConversao.toFixed(1)}% (meta ${metaConversao}%)`,
      `Próximas visitas hoje: ${visitasHoje.length}`,
      `Tarefas pendentes: ${tarefasPendentes.length}`,
      `Missões em andamento: ${missoesAtivas.length}`,
      `Visitas de missão: ${visitasMissao}`,
    ]
    if (isGerente && ranking.length > 0) {
      kpis.push(`Ranking equipe: ${ranking.map((v, i) => `${i + 1}º ${v.nome} ${fmtBRL(v.valor)}`).join(', ')}`)
    }
    if (isGerente && tempoTelaData.length > 0) {
      kpis.push(`Tempo ativo no CRM: ${tempoTelaData.map(d => `${d.nome}: ${Math.floor(d.totalSegundos / 3600)}h${String(Math.floor((d.totalSegundos % 3600) / 60)).padStart(2, '0')}m`).join(', ')}`)
    }
    if (isGerente && academiaData.some(d => d.treinos > 0)) {
      kpis.push(`Academia de vendas: ${academiaData.filter(d => d.treinos > 0).map(d => `${d.nome}: ${d.treinos} treinos, ${d.minutos}min, nota ${d.notaMedia.toFixed(1)}`).join(', ')}`)
    }
    const funil_str = funil.map(f => `${f.label}: ${f.qtd} clientes (${fmtBRL(f.valor)})`).join(', ')
    kpis.push(`Funil: ${funil_str}`)

    const systemPrompt = `Você é um consultor comercial sênior especialista em gestão de vendas B2B de alimentos e ingredientes industriais (MF Paris / Grupo Paris).
Gere um relatório ${periodoLabel} crítico e estratégico baseado nos KPIs fornecidos.
O relatório deve conter:
1. **Resumo executivo** (2-3 frases diretas)
2. **Pontos positivos** — o que está funcionando
3. **Pontos de atenção** — riscos, gargalos, indicadores abaixo da meta
4. **Recomendações práticas** — ações concretas para melhorar resultados no próximo período
5. **Nota geral** — de 0 a 10 com justificativa

Seja direto, use dados concretos, não invente números. Use formatação Markdown.`

    try {
      const resp = await callAI(
        [{ role: 'user', content: `Dados do período:\n${kpis.join('\n')}` }],
        systemPrompt
      )
      setRelatorioIA(resp)
    } catch (err: any) {
      setRelatorioIA(`Erro ao gerar relatório: ${err?.message || 'Tente novamente.'}`)
    } finally {
      setRelatorioLoading(false)
    }
  }

  const detailTitles: Record<DetailKey, string> = {
    faturamento: 'Faturamento do mês',
    comissao: 'Comissão estimada',
    visitas: 'Visitas realizadas',
    propostas: 'Propostas enviadas',
    novos: 'Novos clientes',
    conversao: 'Conversão',
    visitasHoje: 'Próximas visitas hoje',
    missoes: 'Missões em andamento',
    visitasMissao: 'Visitas de missão',
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-6">
      {/* ── Modal detalhamento por vendedor ── */}
      {detailOpen && isGerente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailOpen(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{detailTitles[detailOpen]}</h3>
              <button onClick={() => setDetailOpen(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto max-h-[55vh] divide-y divide-gray-50">
              {detailData.length === 0 ? (
                <p className="p-5 text-sm text-gray-400 text-center">Sem dados para exibir.</p>
              ) : (
                detailData.map((d, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="text-sm font-medium text-gray-800">{d.nome}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{d.label}</span>
                  </div>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Total equipe</span>
              <span className="text-sm font-bold text-gray-900">
                {detailOpen === 'faturamento' || detailOpen === 'comissao'
                  ? fmtBRL(detailData.reduce((s, d) => s + d.valor, 0))
                  : detailOpen === 'conversao'
                    ? `${detailData.length > 0 ? (detailData.reduce((s, d) => s + d.valor, 0) / detailData.length).toFixed(0) : 0}%`
                    : detailData.reduce((s, d) => s + d.valor, 0)
                }
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal decisão de saída da carteira (Item 21 — somente gestor) ── */}
      {decisaoModal && isGerente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !decisaoSalvando && setDecisaoModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Decisão — saída da carteira</h3>
              <button onClick={() => !decisaoSalvando && setDecisaoModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-sm font-semibold text-red-900">{decisaoModal.emp.cardPrincipal.razaoSocial}</p>
                <p className="text-[11px] text-red-700">
                  Saiu da carteira em {decisaoModal.dataSaida.split('-').reverse().join('/')} · {decisaoModal.emp.diasSemCompra} dias sem compra
                </p>
              </div>
              <p className="text-[11px] text-gray-500">
                Registre a decisão para desarmar o alerta. <strong>Nada é movido automaticamente</strong> — mesmo quando a decisão
                for mover para o Banco de Clientes, a movimentação deve ser feita manualmente depois.
              </p>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="decisao-saida" checked={decisaoTipo === 'manter_vendedor'} onChange={() => setDecisaoTipo('manter_vendedor')} className="mt-0.5" />
                  <span className="text-sm text-gray-800">
                    <span className="font-medium">Manter com o vendedor</span> com plano de reativação e prazo
                  </span>
                </label>
                {decisaoTipo === 'manter_vendedor' && (
                  <div className="ml-6 space-y-1.5">
                    <label className="block text-[11px] font-medium text-gray-500">Prazo do plano de reativação</label>
                    <input type="date" value={decisaoPrazo} onChange={e => setDecisaoPrazo(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500/25 focus:outline-none" />
                  </div>
                )}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="decisao-saida" checked={decisaoTipo === 'mover_banco'} onChange={() => setDecisaoTipo('mover_banco')} className="mt-0.5" />
                  <span className="text-sm text-gray-800">
                    <span className="font-medium">Mover para o Banco de Clientes</span>
                    <span className="block text-[11px] text-gray-500">A decisão fica registrada; a movimentação é manual (nada é movido automaticamente).</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="decisao-saida" checked={decisaoTipo === 'outra'} onChange={() => setDecisaoTipo('outra')} className="mt-0.5" />
                  <span className="text-sm text-gray-800"><span className="font-medium">Outra ação</span></span>
                </label>
                {(decisaoTipo === 'outra' || decisaoTipo === 'manter_vendedor') && (
                  <div className="ml-6">
                    <textarea
                      value={decisaoTexto}
                      onChange={e => setDecisaoTexto(e.target.value)}
                      rows={2}
                      placeholder={decisaoTipo === 'outra' ? 'Descreva a ação a ser tomada...' : 'Detalhes do plano (opcional)'}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500/25 focus:outline-none resize-none"
                    />
                  </div>
                )}
              </div>
              {decisaoErro && <p className="text-xs font-medium text-red-600">{decisaoErro}</p>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setDecisaoModal(null)}
                disabled={decisaoSalvando}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarDecisaoSaida}
                disabled={decisaoSalvando}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-700 text-white hover:bg-primary-800 disabled:opacity-50"
              >
                {decisaoSalvando ? 'Registrando...' : 'Registrar decisão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Relatório IA ── */}
      {relatorioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRelatorioOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <ArrowTrendingUpIcon className="h-5 w-5 text-violet-600" />
                <h3 className="font-bold text-gray-900">Relatório IA — {periodoPreset === 'hoje' ? 'Diário' : periodoPreset === 'semana' ? 'Semanal' : periodoPreset === 'mes' ? 'Mensal' : 'Personalizado'}</h3>
              </div>
              <div className="flex items-center gap-2">
                {relatorioIA && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(relatorioIA) }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Copiar
                  </button>
                )}
                <button onClick={() => setRelatorioOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {relatorioLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Analisando KPIs e gerando relatório...</p>
                </div>
              ) : relatorioIA ? (
                <div className="prose prose-sm max-w-none text-gray-800 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:text-sm [&_p]:leading-relaxed [&_li]:text-sm [&_strong]:text-gray-900 [&_ul]:space-y-1 [&_ol]:space-y-1"
                  dangerouslySetInnerHTML={{ __html: relatorioIA
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;')
                    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                    .replace(/^- (.+)$/gm, '<li>$1</li>')
                    .replace(/^(\d+)\. (.+)$/gm, '<li>$1. $2</li>')
                    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
                    .replace(/\n{2,}/g, '</p><p>')
                    .replace(/\n/g, '<br/>')
                    .replace(/^/, '<p>')
                    .replace(/$/, '</p>')
                  }}
                />
              ) : null}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <span className="text-[10px] text-gray-400">Relatório gerado por IA com base nos KPIs do período selecionado</span>
              <button
                onClick={gerarRelatorioIA}
                disabled={relatorioLoading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors disabled:opacity-50"
              >
                Regenerar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{obterSaudacaoBrasilia()}, {loggedUser?.nome?.split(' ')[0] || 'Vendedor'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Visão geral da operação · resultados no período selecionado e situação de hoje.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex p-0.5 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30]">
              {(['hoje', 'semana', 'mes'] as PeriodoPreset[]).map(p => (
                <button key={p} onClick={() => handlePreset(p)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${periodoPreset === p ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}>
                  {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
              <input type="date" value={periodoInicio} onChange={e => { setPeriodoInicio(e.target.value); setPeriodoPreset('custom') }}
                className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500/25 focus:outline-none" />
              <span className="text-xs text-gray-400">até</span>
              <input type="date" value={periodoFim} onChange={e => { setPeriodoFim(e.target.value); setPeriodoPreset('custom') }}
                className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500/25 focus:outline-none" />
            </div>
            <button
              onClick={gerarRelatorioIA}
              disabled={relatorioLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-primary-700 text-white hover:bg-primary-800 transition-all shadow-apple-sm disabled:opacity-60"
            >
              <ArrowTrendingUpIcon className="h-4 w-4" />
              {relatorioLoading ? 'Gerando...' : 'Análise executiva'}
            </button>
          </div>
        </div>

        {/* Item 7: Tela inicial "Minha carteira hoje" — enquanto carrega, exibe Carregando (nunca 0 falso!) */}
        {dataLoading ? (
          <div className="bg-white rounded-apple border border-gray-200 shadow-apple-sm p-4 text-xs text-gray-500 flex items-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
            Carregando Minha carteira hoje...
          </div>
        ) : minhaCarteiraHoje && (!isGerente || minhaCarteiraHoje.possuiCarteira) && (
          <div className="bg-white rounded-apple border border-gray-200 shadow-apple-sm p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-gray-900">Minha carteira hoje <span className="text-[11px] font-normal text-gray-400">· situação de hoje</span></h2>
                <p className="text-xs text-gray-500">Ordem de prioridade diária: vencidos, atenção, sem tarefa aberta, cadastro vencido e tarefas do dia.</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { id: 'vermelhos', label: `1. Vermelhos (${minhaCarteiraHoje.vermelhos.length})`, cls: 'bg-red-100 text-red-800 border-red-200' },
                  { id: 'amarelos', label: `2. Amarelos (${minhaCarteiraHoje.amarelos.length})`, cls: 'bg-amber-100 text-amber-800 border-amber-200' },
                  { id: 'sem_tarefa', label: `3. Sem tarefa (${minhaCarteiraHoje.semTarefaAberta.length})`, cls: 'bg-rose-100 text-rose-800 border-rose-200' },
                  { id: 'cadastro_vencido', label: `4. Cad. vencido (${minhaCarteiraHoje.cadastroIncompletoVencido.length})`, cls: 'bg-orange-100 text-orange-800 border-orange-200' },
                  { id: 'tarefas_dia', label: `5. Tarefas hoje/atras. (${minhaCarteiraHoje.tarefasDoDia.length})`, cls: 'bg-blue-100 text-blue-800 border-blue-200' },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAbaPrioridadeHoje(tab.id)}
                    className={`px-2.5 py-1 rounded-full border text-xs font-bold cursor-pointer ${tab.cls} ${abaPrioridadeHoje === tab.id ? 'ring-2 ring-primary-500' : 'opacity-80'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Item 21 — topo de "Minha carteira hoje": pré-alerta (150–180d) e alerta máximo (saiu da carteira) */}
            {(alertasSaidaCarteira.saiu.length > 0 || alertasSaidaCarteira.pre.length > 0) && (
              <div className="space-y-1.5">
                {alertasSaidaCarteira.saiu.slice(0, 5).map(s => (
                  <button
                    key={`saiu-top-${s.emp.chave}`}
                    type="button"
                    onClick={() => isGerente ? abrirDecisaoModal(s.emp, s.dataSaida) : onOpenCliente?.(s.emp.cardPrincipal)}
                    className="w-full text-left flex items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 hover:bg-red-100 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-red-900 truncate">{s.emp.cardPrincipal.razaoSocial}</span>
                    <span className="text-[11px] font-bold text-red-700 whitespace-nowrap">
                      Saiu da carteira{isGerente ? ' · registrar decisão' : ''}
                    </span>
                  </button>
                ))}
                {alertasSaidaCarteira.pre.slice(0, 5).map(p => (
                  <button
                    key={`pre-top-${p.emp.chave}`}
                    type="button"
                    onClick={() => onOpenCliente?.(p.emp.cardPrincipal)}
                    className="w-full text-left flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 hover:bg-amber-100 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-amber-900 truncate">{p.emp.cardPrincipal.razaoSocial}</span>
                    <span className="text-[11px] font-bold text-amber-700 whitespace-nowrap">
                      sai da carteira em {p.diasRestantes} dia{p.diasRestantes === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {followUpSemSatisfacao15d.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs text-amber-900">
                  <span className="font-semibold">Follow-up sem satisfação há mais de 15 dias:</span> {followUpSemSatisfacao15d.length} cliente(s)
                </span>
                <button
                  type="button"
                  onClick={() => abrirDrillNeg('Follow-up sem satisfação há mais de 15 dias', followUpSemSatisfacao15d.map(f => ({
                    key: `fup-${f.cliente.id}`,
                    cliente: f.cliente,
                    razao: f.cliente.razaoSocial,
                    extra: `${f.dias} dias em Follow-up sem satisfação registrada`,
                  })))}
                  className="text-xs font-semibold text-amber-900 underline hover:no-underline whitespace-nowrap cursor-pointer"
                >
                  Ver lista
                </button>
              </div>
            )}

            {abaPrioridadeHoje === 'tarefas_dia' ? (
              <div className="divide-y divide-gray-100 text-xs max-h-64 overflow-y-auto">
                {minhaCarteiraHoje.tarefasDoDia.slice(0, 20).map(t => {
                  const cli = t.clienteId ? clientes.find(c => c.id === t.clienteId) : undefined
                  const atrasada = t.data < hojeISO
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => cli && onOpenCliente ? onOpenCliente(cli, { section: 'tarefas', tarefaId: t.id }) : onNavigate?.('tarefas')}
                      className="w-full text-left py-2 px-2 hover:bg-primary-50/50 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{t.titulo}</p>
                        <p className="text-gray-500 truncate">{cli?.razaoSocial || 'Sem cliente vinculado'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${atrasada ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {atrasada ? `Atrasada (${t.data.split('-').reverse().join('/')})` : `Hoje${t.hora ? ` ${t.hora.slice(0, 5)}` : ''}`}
                      </span>
                    </button>
                  )
                })}
                {minhaCarteiraHoje.tarefasDoDia.length === 0 && (
                  <p className="text-xs text-gray-400 py-4 text-center">Nenhuma tarefa pendente para hoje.</p>
                )}
              </div>
            ) : (() => {
              const lista =
                abaPrioridadeHoje === 'vermelhos' ? minhaCarteiraHoje.vermelhos
                  : abaPrioridadeHoje === 'amarelos' ? minhaCarteiraHoje.amarelos
                    : abaPrioridadeHoje === 'sem_tarefa' ? minhaCarteiraHoje.semTarefaAberta
                      : minhaCarteiraHoje.cadastroIncompletoVencido
              const focus = abaPrioridadeHoje === 'cadastro_vencido' ? ({ section: 'cadastro' } as const) : ({ section: 'tarefas' } as const)
              return (
                <div className="divide-y divide-gray-100 text-xs max-h-64 overflow-y-auto">
                  {lista.slice(0, 20).map(emp => (
                    <button
                      key={emp.chave}
                      type="button"
                      onClick={() => onOpenCliente ? onOpenCliente(emp.cardPrincipal, focus) : onNavigate?.('clientes')}
                      className="w-full text-left py-2 px-2 hover:bg-primary-50/50 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{emp.cardPrincipal.razaoSocial}</p>
                        <p className="text-gray-500 truncate">
                          {abaPrioridadeHoje === 'cadastro_vencido'
                            ? `${emp.camposFaltantes.length} campo(s) pendente(s)`
                            : emp.proximaTarefa
                              ? `Próx.: ${emp.proximaTarefa.titulo} (${emp.proximaTarefa.data.split('-').reverse().join('/')})`
                              : 'Sem tarefa aberta'}
                        </p>
                      </div>
                      <span className="font-bold text-gray-700 whitespace-nowrap">
                        {emp.diasSemContato == null ? 'Sem contato' : `${emp.diasSemContato}d s/ contato`}
                      </span>
                    </button>
                  ))}
                  {lista.length === 0 && (
                    <p className="text-xs text-emerald-700 py-4 text-center font-medium">Tudo em dia nesta lista.</p>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Item 3 — aviso de comissão incompleta enquanto houver produto sem percentual */}
        {!dataLoading && comissaoIncompleta > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-apple border border-amber-300 bg-amber-50 px-4 py-2.5 mb-1">
            <div className="flex items-center gap-2">
              <ExclamationCircleIcon className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Comissão incompleta:</span> há {comissaoIncompleta} produto(s) sem percentual de comissão. Itens desses produtos entram no cálculo como 0% até o preenchimento.
              </p>
            </div>
            {isGerente && (
              <button onClick={() => onNavigate?.('parametros')} className="text-xs font-semibold text-amber-900 bg-amber-200 hover:bg-amber-300 px-3 py-1.5 rounded-lg whitespace-nowrap">Configurar em Parâmetros</button>
            )}
          </div>
        )}

        {/* KPIs · Resultados no período selecionado + Situação de hoje explícita */}
        {(() => {
          const periodoNome = periodoPreset === 'hoje' ? 'hoje' : periodoPreset === 'semana' ? 'na semana' : periodoPreset === 'mes' ? 'no mês' : 'no período'
          const L = (val: string) => dataLoading ? 'Carregando...' : val
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <MetricCard
                label={`Faturamento (${periodoNome})`}
                value={L(fmtBRL(fatMes))}
                subtitle={dataLoading ? undefined : `${indUnificado.pedidosConfirmadosPeriodo.length} pedido(s) confirmado(s) ${periodoNome}`}
                meta={metaFatMesCorrente}
                total={dataLoading ? 0 : vendidoMesCorrente}
                metaLabel="Meta do mês"
                color="#22C55E"
                icon={<CurrencyDollarIcon className="h-5 w-5" style={{ color: '#22C55E' }} />}
                onClick={isGerente ? () => setDetailOpen('faturamento') : undefined}
              />
              <MetricCard
                label={`Comissão estimada (${periodoNome})`}
                value={L(fmtBRL(comissao))}
                meta={metaComissao}
                total={dataLoading ? 0 : comissao}
                color="#10B981"
                icon={<CurrencyDollarIcon className="h-5 w-5" style={{ color: '#10B981' }} />}
                onClick={isGerente ? () => setDetailOpen('comissao') : undefined}
              />
              <MetricCard
                label={`Visitas realizadas (${periodoNome})`}
                value={L(String(visitasMes))}
                subtitle={dataLoading ? undefined : `Resultado ${periodoNome}`}
                meta={45}
                total={dataLoading ? 0 : visitasMes}
                color="#3B82F6"
                icon={<MapPinIcon className="h-5 w-5" style={{ color: '#3B82F6' }} />}
                onClick={isGerente ? () => setDetailOpen('visitas') : undefined}
              />
              <MetricCard
                label={`Propostas enviadas (${periodoNome})`}
                value={L(String(propostasMes))}
                subtitle={dataLoading ? undefined : `Resultado ${periodoNome}`}
                meta={25}
                total={dataLoading ? 0 : propostasMes}
                color="#A855F7"
                icon={<ClipboardDocumentCheckIcon className="h-5 w-5" style={{ color: '#A855F7' }} />}
                onClick={isGerente ? () => setDetailOpen('propostas') : undefined}
              />
              <MetricCard
                label={`Novos clientes (${periodoNome})`}
                value={L(String(novosClientesMes))}
                subtitle={dataLoading ? undefined : `${novosCadastrosMes} cadastro(s) novo(s) ${periodoNome}`}
                meta={metaLeads}
                total={dataLoading ? 0 : novosClientesMes}
                color="#F59E0B"
                icon={<UsersIcon className="h-5 w-5" style={{ color: '#F59E0B' }} />}
                onClick={isGerente ? () => setDetailOpen('novos') : undefined}
              />
              <MetricCard
                label={`Conversão (${periodoNome})`}
                value={L(`${taxaConversao.toFixed(1)}%`)}
                subtitle={dataLoading ? undefined : `${indUnificado.negociacoesGanhasPeriodo.length} ganha(s) · ${indUnificado.negociacoesPerdidasPeriodo.length} perdida(s) ${periodoNome}`}
                meta={metaConversao}
                total={dataLoading ? 0 : taxaConversao}
                color="#EF4444"
                icon={<ChartBarIcon className="h-5 w-5" style={{ color: '#EF4444' }} />}
                onClick={isGerente ? () => setDetailOpen('conversao') : undefined}
              />
              <MetricCard
                label={`Ticket médio (${periodoNome})`}
                value={L(fmtBRL(ticketMedio))}
                meta={0}
                total={dataLoading ? 0 : ticketMedio}
                color="#0EA5E9"
                icon={<CurrencyDollarIcon className="h-5 w-5" style={{ color: '#0EA5E9' }} />}
              />
              <MetricCard
                label="Pipeline ponderado · hoje"
                value={L(fmtBRL(indOps.pipelinePonderado))}
                subtitle="Situação de hoje"
                meta={0}
                total={dataLoading ? 0 : indOps.pipelinePonderado}
                color="#14B8A6"
                icon={<ChartBarIcon className="h-5 w-5" style={{ color: '#14B8A6' }} />}
              />
              <MetricCard
                label="Em atenção (41–60d) · hoje"
                value={L(String(indUnificado.situacaoCompraCounts.em_atencao.length))}
                subtitle={`Situação de hoje · ${indUnificado.coberturaMes.length} atendidos ${periodoNome}`}
                meta={0}
                total={dataLoading ? 0 : indUnificado.situacaoCompraCounts.em_atencao.length}
                color="#F97316"
                icon={<UsersIcon className="h-5 w-5" style={{ color: '#F97316' }} />}
              />
              <MetricCard
                label="Próximas visitas hoje"
                value={L(String(visitasHoje.length))}
                subtitle="Situação de hoje"
                meta={Math.max(visitasHoje.length, 1)}
                total={dataLoading ? 0 : visitasHoje.length}
                color="#14B8A6"
                icon={<CalendarIcon className="h-5 w-5" style={{ color: '#14B8A6' }} />}
                onClick={isGerente ? () => setDetailOpen('visitasHoje') : undefined}
              />
              <MetricCard
                label="Missões em andamento"
                value={L(String(missoesAtivas.length))}
                subtitle="Situação de hoje"
                meta={Math.max(missoesAtivas.length, 1)}
                total={dataLoading ? 0 : missoesAtivas.length}
                color="#F97316"
                icon={<FlagIcon className="h-5 w-5" style={{ color: '#F97316' }} />}
              />
              <MetricCard
                label="Visitas de missão"
                value={L(String(visitasMissao))}
                subtitle="Situação de hoje"
                meta={Math.max(visitasMissao, 1)}
                total={dataLoading ? 0 : visitasMissao}
                color="#8B5CF6"
                icon={<MapPinIcon className="h-5 w-5" style={{ color: '#8B5CF6' }} />}
                onClick={isGerente ? () => setDetailOpen('visitasMissao') : undefined}
              />
            </div>
          )
        })()}

        {/* Item 4.5 — Quadro "Minhas metas": mês e semana com ritmo necessário (vendedor vê as próprias) */}
        {(!isGerente || metaMinhaRow) && (() => {
          const pctNum = (v: number, m: number) => m > 0 ? Math.min(100, Math.round((v / m) * 100)) : 0
          const fmtKg = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`
          const LinhaMeta = ({ titulo, vendido, meta, fmt }: { titulo: string; vendido: number; meta: number; fmt: (v: number) => string }) => (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-gray-500">{titulo}</span>
                <span className="text-xs text-gray-400">{pctNum(vendido, meta)}%</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-bold text-gray-900">{fmt(vendido)}</span>
                <span className="text-xs text-gray-500">meta {fmt(meta)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-primary-600 transition-all" style={{ width: `${pctNum(vendido, meta)}%` }} />
              </div>
              <p className="text-[11px] text-gray-500">
                {meta - vendido > 0 ? `falta ${fmt(Math.round((meta - vendido) * 100) / 100)}` : 'meta atingida'}
              </p>
            </div>
          )
          const semanaLabel = `${semanaCorrente.segunda.split('-').reverse().slice(0, 2).join('/')} a ${semanaCorrente.domingo.split('-').reverse().slice(0, 2).join('/')}`
          return (
            <div className="bg-white rounded-apple border border-gray-200 shadow-apple-sm p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Minhas metas <span className="text-[11px] font-normal text-gray-400">· {nomeMesCorrente}</span></h2>
                  <p className="text-xs text-gray-500">Vendido = pedidos confirmados. A meta da semana é a meta do mês prorrateada pelos dias úteis (seg-sex exceto feriados).</p>
                </div>
              </div>

              {!metasCarregadas ? (
                <p className="text-xs text-gray-400 py-4 text-center">Carregando metas...</p>
              ) : !metaMinhaRow ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-gray-600">Nenhuma meta cadastrada para você neste mês.</p>
                  <p className="text-xs text-gray-400 mt-1">Peça ao gestor para cadastrar em Parâmetros &gt; Metas. O sistema não assume nenhum valor por conta própria.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Mês */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Mês</p>
                      <LinhaMeta titulo="Faturamento" vendido={vendidoMesCorrente} meta={metaMinhaRow.metaFaturamento || 0} fmt={fmtBRL} />
                      {(metaMinhaRow.metaVolumeKg || 0) > 0 && (
                        <LinhaMeta titulo="Volume" vendido={volumeKgMesCorrente} meta={metaMinhaRow.metaVolumeKg || 0} fmt={fmtKg} />
                      )}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {([
                          { label: 'Visitas', meta: metaMinhaRow.metaVisitas, vendido: visitasMesCorrente },
                          { label: 'Propostas', meta: metaMinhaRow.metaPropostas, vendido: propostasMesCorrente },
                          { label: 'Novos clientes', meta: metaMinhaRow.metaNovosClientes, vendido: novosClientesMesCorrente },
                        ]).map(x => (
                          <div key={x.label} className="rounded-lg bg-white border border-gray-100 px-2.5 py-2 text-center">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{x.label}</p>
                            {x.meta != null ? (
                              <>
                                <p className="text-sm font-bold text-gray-900">
                                  {x.vendido}<span className="text-[10px] font-normal text-gray-400"> / {x.meta}</span>
                                </p>
                                <p className="text-[10px] text-gray-400">
                                  {pctNum(x.vendido, x.meta)}%{x.meta - x.vendido > 0 ? ` · falta ${x.meta - x.vendido}` : ' · atingida'}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm font-bold text-gray-400">—</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Semana */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Semana <span className="font-normal normal-case text-gray-400">({semanaLabel})</span></p>
                      <LinhaMeta titulo="Faturamento" vendido={vendidoSemanaCorrente} meta={metaSemanaFat} fmt={fmtBRL} />
                      {(metaMinhaRow.metaVolumeKg || 0) > 0 && (
                        <LinhaMeta titulo="Volume" vendido={volumeKgSemanaCorrente} meta={metaSemanaKg} fmt={fmtKg} />
                      )}
                    </div>
                  </div>

                  {/* Ritmo necessário (item 4.4) */}
                  {(metaMinhaRow.metaFaturamento || 0) > 0 && (
                    <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                      {ritmoMeta.noRitmo ? (
                        <p className="text-sm font-semibold text-emerald-700">No ritmo — a meta do mês já foi atingida.</p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-700">
                            Para bater o mês: <span className="font-bold text-gray-900">{fmtBRL(ritmoMeta.ritmoNecessario)} por dia útil</span>
                            <span className="text-xs text-gray-400"> ({ritmoMeta.diasUteisRestantesMes} dia(s) útil(eis) restantes)</span>
                          </p>
                          <p className="text-sm text-gray-700">
                            Nesta semana você precisa vender <span className="font-bold text-gray-900">{fmtBRL(ritmoMeta.paraEstaSemana)}</span>
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}

        {/* Item 1 da devolutiva: Blocos próprios dos dois Bancos no Dashboard do gestor */}
        {isGerente && resumoBancosDashboard && (() => {
          const abrirDrillEmpresas = (titulo: string, lista: typeof resumoBancosDashboard.bancoClientes.empresas, extraFn?: (e: typeof lista[number]) => string) => {
            setListaBancoPage(1)
            setListaBancoDrill({
              titulo,
              itens: lista.map(e => ({
                key: e.chave,
                cliente: e.cardPrincipal,
                razao: e.cardPrincipal.razaoSocial,
                cnpj: e.cardPrincipal.cnpj || e.cardPrincipal.cpf || '—',
                extra: extraFn ? extraFn(e) : (e.diasSemCompra != null ? `Últ. venda há ${e.diasSemCompra}d` : 'Prospecto'),
                situacaoLabel: SITUACAO_COMPRA_CONFIG[e.situacaoCompra]?.label,
                situacaoCor: SITUACAO_COMPRA_CONFIG[e.situacaoCompra]?.cor,
              })),
            })
          }
          const renderBloco = (bloco: BlocoBancoResumo) => (
            <div key={bloco.tipo} className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-apple-sm p-4 space-y-3 tabular-nums">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => abrirDrillEmpresas(`${bloco.nome} · Total`, bloco.empresas)}
                  className="text-left group cursor-pointer"
                >
                  <p className="text-xs font-semibold text-gray-500 group-hover:text-primary-700">{bloco.nome}</p>
                  <p className="text-2xl font-semibold tracking-tight text-gray-900 group-hover:underline">
                    {bloco.empresas.length}{' '}
                    <span className="text-xs font-normal text-gray-400">{bloco.tipo === 'clientes' ? 'clientes' : 'empresas'}</span>
                  </p>
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setListaBancoPage(1)
                      setListaBancoDrill({
                        titulo: `${bloco.nome} · Tarefas nos cards (sem responsável)`,
                        itens: bloco.tarefasNosCards.map(t => {
                          const emp = t.clienteId ? consolidadoFase2.empresaPorCardId.get(t.clienteId) : undefined
                          return {
                            key: `tb-${t.id}`,
                            cliente: emp?.cardPrincipal,
                            razao: emp?.cardPrincipal.razaoSocial || 'Cliente',
                            cnpj: emp?.cardPrincipal.cnpj || emp?.cardPrincipal.cpf || '—',
                            extra: `${t.titulo} · prazo ${t.data.split('-').reverse().join('/')}`,
                            focus: { section: 'tarefas', tarefaId: t.id },
                          }
                        }),
                      })
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] dark:bg-[#262629] hover:bg-black/[0.07] text-[11px] font-medium text-gray-700 cursor-pointer"
                    title="Tarefas pendentes mantidas nos cards deste banco sem responsável"
                  >
                    {bloco.tarefasNosCards.length} tarefa(s) nos cards
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('relatorios')}
                    className="px-2.5 py-1 rounded-lg bg-[#EFEFF4] dark:bg-[#262629] hover:bg-black/[0.08] text-[11px] font-semibold text-gray-800 cursor-pointer"
                  >
                    Redistribuir
                  </button>
                </div>
              </div>

              {bloco.tipo === 'clientes' && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Situação de compra</p>
                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    {([
                      { label: 'Ativo', lista: bloco.porSituacaoCompra.ativo },
                      { label: 'Em atenção', lista: bloco.porSituacaoCompra.em_atencao },
                      { label: 'Em risco', lista: bloco.porSituacaoCompra.em_risco },
                      { label: 'Inat. recente', lista: bloco.porSituacaoCompra.inativo_recente },
                      { label: 'Inat. antigo', lista: bloco.porSituacaoCompra.inativo_antigo },
                    ] as const).map(s => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => abrirDrillEmpresas(`${bloco.nome} · ${s.label}`, s.lista)}
                        className="bg-[#F5F5F7] dark:bg-[#262629] hover:bg-black/[0.07] rounded-xl px-1.5 py-1.5 cursor-pointer transition-colors"
                      >
                        <p className="text-sm font-semibold text-gray-900">{s.lista.length}</p>
                        <p className="text-[10px] text-gray-500 truncate">{s.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Tempo no banco</p>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {([
                    { label: 'Até 30 dias', itens: bloco.tempoNoBanco.ate30d },
                    { label: '31–90 dias', itens: bloco.tempoNoBanco.de31a90d },
                    { label: 'Mais de 90 dias', itens: bloco.tempoNoBanco.mais90d },
                  ] as const).map(f => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => {
                        setListaBancoPage(1)
                        setListaBancoDrill({
                          titulo: `${bloco.nome} · Tempo no banco: ${f.label}`,
                          itens: f.itens.map(x => ({
                            key: x.empresa.chave,
                            cliente: x.empresa.cardPrincipal,
                            razao: x.empresa.cardPrincipal.razaoSocial,
                            cnpj: x.empresa.cardPrincipal.cnpj || x.empresa.cardPrincipal.cpf || '—',
                            extra: `${x.diasNoBanco}d no banco (desde ${x.entradaISO.split('-').reverse().join('/')})`,
                            situacaoLabel: SITUACAO_COMPRA_CONFIG[x.empresa.situacaoCompra]?.label,
                            situacaoCor: SITUACAO_COMPRA_CONFIG[x.empresa.situacaoCompra]?.cor,
                          })),
                        })
                      }}
                      className="bg-[#F5F5F7] dark:bg-[#262629] hover:bg-black/[0.07] rounded-xl px-2 py-1.5 cursor-pointer transition-colors"
                    >
                      <p className="text-sm font-semibold text-gray-900">{f.itens.length}</p>
                      <p className="text-[10px] text-gray-500">{f.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setListaBancoPage(1)
                    setListaBancoDrill({
                      titulo: `${bloco.nome} · Redistribuídos no período`,
                      itens: bloco.redistribuidosNoPeriodo.total.map(r => {
                        const cli = r.empresa?.cardPrincipal || clientes.find(c => c.id === r.clienteId)
                        return {
                          key: `red-${r.interacaoId}`,
                          cliente: cli,
                          razao: cli?.razaoSocial || 'Cliente',
                          cnpj: cli?.cnpj || cli?.cpf || '—',
                          extra: `Para ${r.vendedorDestinoNome} em ${r.dataISO.split('-').reverse().join('/')}`,
                        }
                      }),
                    })
                  }}
                  className="text-xs font-semibold text-gray-800 hover:text-primary-700 hover:underline cursor-pointer"
                >
                  Redistribuídos no período: <span className="text-primary-700">{bloco.redistribuidosNoPeriodo.total.length}</span>
                </button>
                <div className="flex items-center gap-1 flex-wrap">
                  {bloco.redistribuidosNoPeriodo.porVendedor.length === 0 ? (
                    <span className="text-[11px] text-gray-400">Nenhuma redistribuição no período</span>
                  ) : (
                    bloco.redistribuidosNoPeriodo.porVendedor.map(pv => (
                      <button
                        key={pv.vendedorNome}
                        type="button"
                        onClick={() => {
                          setListaBancoPage(1)
                          setListaBancoDrill({
                            titulo: `${bloco.nome} → ${pv.vendedorNome}`,
                            itens: pv.itens.map(r => {
                              const cli = r.empresa?.cardPrincipal || clientes.find(c => c.id === r.clienteId)
                              return {
                                key: `redv-${r.interacaoId}`,
                                cliente: cli,
                                razao: cli?.razaoSocial || 'Cliente',
                                cnpj: cli?.cnpj || cli?.cpf || '—',
                                extra: `Redistribuído em ${r.dataISO.split('-').reverse().join('/')}`,
                              }
                            }),
                          })
                        }}
                        className="px-2 py-0.5 rounded-full bg-[#EFEFF4] dark:bg-[#262629] hover:bg-black/[0.08] text-[11px] font-medium text-gray-700 cursor-pointer"
                      >
                        {pv.vendedorNome.split(' ')[0]}: <strong>{pv.itens.length}</strong>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {renderBloco(resumoBancosDashboard.bancoClientes)}
                {renderBloco(resumoBancosDashboard.bancoProspectos)}
              </div>
              {listaBancoDrill && (
                <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/[0.08] dark:border-white/[0.10] shadow-apple p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-gray-900">
                      {listaBancoDrill.titulo} ({listaBancoDrill.itens.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setListaBancoDrill(null)}
                      className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer"
                    >
                      Fechar lista
                    </button>
                  </div>
                  {listaBancoDrill.itens.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">Nenhum registro encontrado para este filtro.</p>
                  ) : (
                    <>
                      <div className="divide-y divide-gray-100 text-xs max-h-80 overflow-y-auto">
                        {listaBancoDrill.itens.slice((listaBancoPage - 1) * 20, listaBancoPage * 20).map(item => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => item.cliente && onOpenCliente?.(item.cliente, item.focus)}
                            className="w-full text-left py-2 px-2 hover:bg-gray-50 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{item.razao}</p>
                              <p className="text-[11px] text-gray-400 truncate tabular-nums">{item.cnpj} · {item.extra}</p>
                            </div>
                            {item.situacaoLabel && (
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${item.situacaoCor || ''}`}>
                                {item.situacaoLabel}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {listaBancoDrill.itens.length > 20 && (
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px] text-gray-500 tabular-nums">
                          <span>Pág. {listaBancoPage}/{Math.ceil(listaBancoDrill.itens.length / 20)}</span>
                          <div className="flex gap-1">
                            <button type="button" disabled={listaBancoPage <= 1} onClick={() => setListaBancoPage(p => p - 1)} className="px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer">Anterior</button>
                            <button type="button" disabled={listaBancoPage >= Math.ceil(listaBancoDrill.itens.length / 20)} onClick={() => setListaBancoPage(p => p + 1)} className="px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer">Próxima</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Painel Acionável: Gargalos de Atenção */}
        <div className="bg-amber-50/60 rounded-apple border border-amber-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
              <ExclamationCircleIcon className="h-4 w-4 text-amber-600" />
              Gargalos de atenção imediata
            </h2>
            <span className="text-[11px] text-amber-800">Clique para agir</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => onNavigate?.('tarefas')}
              className="text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-xl p-3 transition-colors"
            >
              <p className="text-[11px] font-medium text-gray-500 uppercase">Tarefas atrasadas · situação de hoje</p>
              <p className={`text-xl font-bold mt-0.5 ${!dataLoading && gargalos.tarefasAtrasadas > 0 ? 'text-red-600' : 'text-green-700'}`}>
                {dataLoading ? 'Carregando...' : `${gargalos.tarefasAtrasadas} atrasadas hoje`}
              </p>
              <p className="text-[11px] text-gray-500">
                {dataLoading ? 'aguarde...' : `${gargalos.tarefasVencidasNoPeriodo} vencidas no período · ${gargalos.semTarefaAbertaHoje} s/ tarefa aberta`}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('funil')}
              className="text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-xl p-3 transition-colors"
            >
              <p className="text-[11px] font-medium text-gray-500 uppercase">Amostras &gt; 30 dias · hoje</p>
              <p className={`text-xl font-bold mt-0.5 ${!dataLoading && gargalos.amostrasMais30d > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {dataLoading ? 'Carregando...' : gargalos.amostrasMais30d}
              </p>
              <p className="text-[11px] text-gray-400">situação de hoje · aguardando avaliação</p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('funil')}
              className="text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-xl p-3 transition-colors"
            >
              <p className="text-[11px] font-medium text-gray-500 uppercase">Negociações &gt; 3 dias · hoje</p>
              <p className={`text-xl font-bold mt-0.5 ${!dataLoading && gargalos.negociacoesMais3d > 0 ? 'text-purple-700' : 'text-green-700'}`}>
                {dataLoading ? 'Carregando...' : gargalos.negociacoesMais3d}
              </p>
              <p className="text-[11px] text-gray-400">situação de hoje · encerrar venda ou perda</p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('clientes')}
              className="text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-xl p-3 transition-colors"
            >
              <p className="text-[11px] font-medium text-gray-500 uppercase">Em risco ou inativo · hoje</p>
              <p className={`text-xl font-bold mt-0.5 ${!dataLoading && gargalos.semCompraMais60d > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {dataLoading ? 'Carregando...' : gargalos.semCompraMais60d}
              </p>
              <p className="text-[11px] text-gray-400">situação de hoje · sem compra há 61+ dias</p>
            </button>
            {/* Item 12 — Follow-up sem satisfação há mais de 15 dias */}
            <button
              type="button"
              onClick={() => abrirDrillNeg('Follow-up sem satisfação há mais de 15 dias', followUpSemSatisfacao15d.map(f => ({
                key: `fup-${f.cliente.id}`,
                cliente: f.cliente,
                razao: f.cliente.razaoSocial,
                extra: `${f.dias} dias em Follow-up sem satisfação registrada`,
              })))}
              className="text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-xl p-3 transition-colors"
            >
              <p className="text-[11px] font-medium text-gray-500 uppercase">Follow-up sem satisfação &gt; 15d</p>
              <p className={`text-xl font-bold mt-0.5 ${!dataLoading && followUpSemSatisfacao15d.length > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {dataLoading ? 'Carregando...' : followUpSemSatisfacao15d.length}
              </p>
              <p className="text-[11px] text-gray-400">situação de hoje · registrar satisfação</p>
            </button>
            {/* Item 21 — pré-alerta: clientes entre 150 e 180 dias sem compra */}
            <button
              type="button"
              onClick={() => abrirDrillNeg('Saindo da carteira (150–180 dias sem compra)', alertasSaidaCarteira.pre.map(p => ({
                key: `pre-${p.emp.chave}`,
                cliente: p.emp.cardPrincipal,
                razao: p.emp.cardPrincipal.razaoSocial,
                extra: `sai da carteira em ${p.diasRestantes} dia${p.diasRestantes === 1 ? '' : 's'} · ${p.emp.diasSemCompra}d sem compra`,
              })))}
              className="text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-xl p-3 transition-colors"
            >
              <p className="text-[11px] font-medium text-gray-500 uppercase">Saindo da carteira · hoje</p>
              <p className={`text-xl font-bold mt-0.5 ${!dataLoading && alertasSaidaCarteira.pre.length > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {dataLoading ? 'Carregando...' : alertasSaidaCarteira.pre.length}
              </p>
              <p className="text-[11px] text-gray-400">150–180 dias sem compra · saem em breve</p>
            </button>
            {/* Item 21 — alerta máximo: saiu da carteira e aguarda decisão do gestor */}
            <button
              type="button"
              onClick={() => abrirDrillNeg('Saiu da carteira — aguardando decisão do gestor', alertasSaidaCarteira.saiu.map(s => ({
                key: `saiu-${s.emp.chave}`,
                cliente: s.emp.cardPrincipal,
                razao: s.emp.cardPrincipal.razaoSocial,
                extra: `saiu em ${s.dataSaida.split('-').reverse().join('/')}${isGerente ? ' · clique para registrar a decisão' : ''}`,
                acaoSaida: { dataSaida: s.dataSaida },
              })))}
              className={`text-left border rounded-xl p-3 transition-colors ${alertasSaidaCarteira.saiu.length > 0 ? 'bg-red-50 hover:bg-red-100 border-red-300' : 'bg-white hover:bg-amber-50 border-amber-200'}`}
            >
              <p className="text-[11px] font-medium text-gray-500 uppercase">Saiu da carteira · alerta máximo</p>
              <p className={`text-xl font-bold mt-0.5 ${!dataLoading && alertasSaidaCarteira.saiu.length > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {dataLoading ? 'Carregando...' : alertasSaidaCarteira.saiu.length}
              </p>
              <p className="text-[11px] text-gray-400">passou de 180 dias · permanece até o gestor registrar a decisão</p>
            </button>
          </div>
        </div>

        {/* Drill-down: número → lista → card do cliente (itens 17/18/21) */}
          {drillNeg && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-gray-900">{drillNeg.titulo} ({drillNeg.itens.length})</h3>
                <button type="button" onClick={() => setDrillNeg(null)} className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer">Fechar lista</button>
              </div>
              {drillNeg.itens.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 text-center">Nenhum registro.</p>
              ) : (
                <>
                  <div className="divide-y divide-gray-100 text-xs max-h-72 overflow-y-auto bg-white rounded-lg border border-gray-100">
                    {drillNeg.itens.slice((drillNegPage - 1) * 20, drillNegPage * 20).map(item => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => clicarItemDrillNeg(item)}
                        className="w-full text-left py-2 px-2.5 hover:bg-primary-50/50 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="font-semibold text-gray-900 truncate">{item.razao}</span>
                        <span className="text-[11px] text-gray-500 truncate text-right">{item.extra}</span>
                      </button>
                    ))}
                  </div>
                  {drillNeg.itens.length > 20 && (
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Pág. {drillNegPage}/{Math.ceil(drillNeg.itens.length / 20)}</span>
                      <div className="flex gap-1">
                        <button type="button" disabled={drillNegPage <= 1} onClick={() => setDrillNegPage(p => p - 1)} className="px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer">Anterior</button>
                        <button type="button" disabled={drillNegPage >= Math.ceil(drillNeg.itens.length / 20)} onClick={() => setDrillNegPage(p => p + 1)} className="px-2 py-0.5 border rounded disabled:opacity-40 cursor-pointer">Próxima</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        {/* Itens 17 e 18 — Negociações por vendedor e clientes sem negociação há +30 dias.
            Números calculados pelas mesmas funções puras usadas em Relatórios (zero divergência).
            Cada número abre a lista, e cada item da lista abre o card do cliente. */}
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Negociações por vendedor</h2>
              <p className="text-xs text-gray-500">
                Abertas e sem negociação são a situação de hoje; ganhas e perdidas respeitam o filtro de período.
              </p>
            </div>
          </div>
          {dataLoading ? (
            <p className="text-xs text-gray-400 py-4 text-center">Carregando...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left py-1.5 px-2">Vendedor</th>
                    <th className="text-center py-1.5 px-2">Abertas · hoje</th>
                    <th className="text-center py-1.5 px-2">Ganhas · período</th>
                    <th className="text-center py-1.5 px-2">Perdidas · período</th>
                    <th className="text-left py-1.5 px-2">Motivos de perda · período</th>
                    <th className="text-center py-1.5 px-2">Sem negociação +30d · hoje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {negociacaoPorVendedor.map(({ vendedor: v, resumo: r }) => {
                    const semNeg = semNegociacao30PorVendedor.get(v.id) || []
                    const cellBtn = (qtd: number, onClick: () => void, cor: string) => (
                      <button
                        type="button"
                        onClick={onClick}
                        className={`font-bold text-sm ${cor} ${qtd > 0 ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                      >
                        {qtd}
                      </button>
                    )
                    return (
                      <tr key={v.id} className="hover:bg-gray-50/60">
                        <td className="py-2 px-2 font-semibold text-gray-900 whitespace-nowrap">{v.nome}</td>
                        <td className="py-2 px-2 text-center">
                          {cellBtn(r.abertas.length, () => r.abertas.length > 0 && abrirDrillNeg(
                            `Negociações abertas · ${v.nome}`,
                            r.abertas.map(c => ({ key: `ab-${c.id}`, cliente: c, razao: c.razaoSocial, extra: 'Em negociação agora' }))
                          ), 'text-purple-700')}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {cellBtn(r.ganhas.length, () => r.ganhas.length > 0 && abrirDrillNeg(
                            `Negociações ganhas no período · ${v.nome}`,
                            r.ganhas.map(p => {
                              const cli = clientes.find(c => c.id === p.clienteId)
                              return { key: `ga-${p.id}`, cliente: cli, razao: cli?.razaoSocial || `Pedido ${p.numero}`, extra: `${p.numero} · ${fmtBRL(p.totalValor)}` }
                            })
                          ), 'text-emerald-700')}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {cellBtn(r.perdidas.length, () => r.perdidas.length > 0 && abrirDrillNeg(
                            `Negociações perdidas no período · ${v.nome}`,
                            r.perdidas.map(c => ({ key: `pe-${c.id}`, cliente: c, razao: c.razaoSocial, extra: c.motivoPerda || c.categoriaPerda || 'Motivo não informado' }))
                          ), 'text-red-700')}
                        </td>
                        <td className="py-2 px-2">
                          {r.motivosPerda.length === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <div className="flex items-center gap-1 flex-wrap">
                              {r.motivosPerda.map(m => (
                                <button
                                  key={m.key}
                                  type="button"
                                  onClick={() => abrirDrillNeg(
                                    `Perdas por ${m.label} no período · ${v.nome}`,
                                    m.cards.map(c => ({ key: `mp-${m.key}-${c.id}`, cliente: c, razao: c.razaoSocial, extra: c.motivoPerda || m.label }))
                                  )}
                                  className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[11px] font-medium text-red-800 hover:bg-red-100 cursor-pointer"
                                >
                                  {m.label}: <strong>{m.cards.length}</strong>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {cellBtn(semNeg.length, () => semNeg.length > 0 && abrirDrillNeg(
                            `Clientes da carteira sem negociação há +30 dias · ${v.nome}`,
                            semNeg.map(x => {
                              const emp = consolidadoFase2.empresas.find(e => e.chave === x.chave)
                              const cli = emp?.cardPrincipal || clientes.find(c => c.id === x.cardPrincipalId)
                              return {
                                key: `sn-${x.chave}`,
                                cliente: cli,
                                razao: cli?.razaoSocial || 'Cliente',
                                extra: x.ultimaNegociacao
                                  ? `última negociação em ${x.ultimaNegociacao.split('-').reverse().join('/')} (${x.diasSemNegociacao}d)`
                                  : 'nunca esteve em negociação',
                              }
                            })
                          ), 'text-orange-700')}
                        </td>
                      </tr>
                    )
                  })}
                  {negociacaoPorVendedor.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-gray-400">Nenhum vendedor no escopo.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* Volume por produto (spec vendedor: volume vendido por produto em kg) */}
        {topProdutosVendedor.length > 0 && (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Top produtos no período</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {topProdutosVendedor.map(([nome, v]) => (
                <div key={nome} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 truncate" title={nome}>{nome}</p>
                  <p className="text-sm font-bold text-gray-900 mt-1">{v.quantidade.toLocaleString('pt-BR')} kg</p>
                  <p className="text-xs text-green-700 font-medium">{fmtBRL(v.receita)} · {v.participacao}%</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gerente: Tempo de Tela + Academia de Vendas */}
        {isGerente && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tempo de Tela */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <ComputerDesktopIcon className="h-5 w-5 text-primary-600" />
                <h2 className="text-lg font-bold text-gray-900">Tempo ativo no CRM</h2>
                <span className="text-[11px] text-gray-400">(pausa após 10 min sem interação)</span>
              </div>
              {tempoTelaData.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sem dados de tempo ativo no período.</p>
              ) : (
                <div className="space-y-2">
                  {[...tempoTelaData].sort((a, b) => b.totalSegundos - a.totalSegundos).map((d, i) => {
                    const horas = Math.floor(d.totalSegundos / 3600)
                    const mins = Math.floor((d.totalSegundos % 3600) / 60)
                    const maxSecs = Math.max(...tempoTelaData.map(x => x.totalSegundos), 1)
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 w-28 truncate">{d.nome}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div className="h-5 rounded-full bg-primary-500 flex items-center px-2 transition-all" style={{ width: `${Math.max((d.totalSegundos / maxSecs) * 100, 8)}%` }}>
                            <span className="text-[10px] font-bold text-white whitespace-nowrap">{horas}h{String(mins).padStart(2, '0')}m</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Academia de Vendas */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <AcademicCapIcon className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-gray-900">Academia de Vendas</h2>
              </div>
              {academiaData.every(d => d.treinos === 0) ? (
                <p className="text-sm text-gray-400 py-4 text-center">Nenhum treinamento realizado no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase border-b border-gray-100">
                        <th className="py-2 pr-3">Vendedor</th>
                        <th className="py-2 px-2 text-center">Treinos</th>
                        <th className="py-2 px-2 text-center">Tempo</th>
                        <th className="py-2 px-2 text-center">Nota média</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[...academiaData].sort((a, b) => b.treinos - a.treinos).map((d, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-2 pr-3 font-medium text-gray-800">{d.nome}</td>
                          <td className="py-2 px-2 text-center">{d.treinos}</td>
                          <td className="py-2 px-2 text-center text-gray-600">{d.minutos}min</td>
                          <td className="py-2 px-2 text-center">
                            {d.notaMedia > 0 ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${d.notaMedia >= 8 ? 'bg-green-100 text-green-700' : d.notaMedia >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                {d.notaMedia.toFixed(1)}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* Funil de Vendas */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Funil de Vendas</h2>
                <span className="text-xs text-gray-500">{new Date().toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase()}</span>
              </div>
              <div className="space-y-3">
                {funil.map((f) => (
                  <div key={f.stage} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 w-24 text-right">{f.label}</span>
                    <div className="flex-1 relative">
                      <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                        <div className="h-8 rounded-full flex items-center px-3 transition-all duration-500" style={{ width: `${f.pct}%`, backgroundColor: stageColors[f.stage] || '#6B7280' }}>
                          <span className="text-xs font-bold text-white drop-shadow">{f.qtd}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-20 text-right">{fmtBRL(f.valor)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-500">Total em pipeline (Proposta + Negociação)</span>
                <span className="font-bold text-gray-900">{fmtBRL(indOps.pipelineAberto)}</span>
              </div>
            </div>

            {/* Atividades de hoje */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Atividades de hoje</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SmallMetric label="Ligações" value={atividadesHoje.ligacao} meta={18} color="#3B82F6" icon={<PhoneIcon className="h-4 w-4 text-blue-600" />} />
                <SmallMetric label="WhatsApps" value={atividadesHoje.whatsapp} meta={42} color="#22C55E" icon={<ChatBubbleLeftRightIcon className="h-4 w-4 text-green-600" />} />
                <SmallMetric label="E-mails" value={atividadesHoje.email} meta={15} color="#8B5CF6" icon={<EnvelopeIcon className="h-4 w-5 text-violet-600" />} />
                <SmallMetric label="Visitas" value={atividadesHoje.reuniao} meta={6} color="#F59E0B" icon={<MapPinIcon className="h-4 w-4 text-amber-600" />} />
                <SmallMetric label="Prospecções" value={atividadesHoje.prospeccao} meta={20} color="#14B8A6" icon={<MegaphoneIcon className="h-4 w-4 text-teal-600" />} />
              </div>
            </div>

            {/* Amostras em andamento */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Amostras em andamento</h2>
              {amostras.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma amostra em andamento.</p>
              ) : (
                <div className="space-y-2">
                  {amostras.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <BuildingStorefrontIcon className="h-4 w-4 text-gray-500" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{c.razaoSocial}</p>
                          <p className="text-xs text-gray-500">{c.statusAmostra?.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">Amostra</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Últimas atualizações */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Últimas atualizações</h2>
              {atualizacoes.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma atualização recente.</p>
              ) : (
                <div className="space-y-3">
                  {atualizacoes.map(a => (
                    <div key={a.id} className="flex items-start gap-3">
                      <div className="p-1.5 bg-primary-50 rounded-lg">
                        <ArrowTrendingUpIcon className="h-4 w-4 text-primary-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-800">{a.descricao}</p>
                        <p className="text-xs text-gray-400">{ago(a.timestamp)} atrás</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            {/* Agenda de hoje + Roteiro */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><CalendarIcon className="h-5 w-5 text-primary-600" /> Agenda de hoje</h2>
                <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">
                  {tarefasHoje.length} {tarefasHoje.length === 1 ? 'atividade' : 'atividades'}
                  {visitasHoje.length > 0 ? ` · ${visitasHoje.length} ${visitasHoje.length === 1 ? 'visita' : 'visitas'}` : ''}
                </span>
              </div>
              {tarefasHoje.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma atividade agendada para hoje.</p>
              ) : (
                <div className="space-y-3 mb-4">
                  {tarefasHoje.map(t => {
                    const cli = clientes.find(c => c.id === t.clienteId)
                    return (
                      <div key={t.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="text-center min-w-[3.5rem]">
                          <p className="text-sm font-bold text-gray-900">{formatHoraAgenda(t.hora)}</p>
                          <p className="text-[10px] text-gray-400">{cli?.enderecoCidade || ''}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{cli?.razaoSocial || t.titulo}</p>
                          <p className="text-xs text-gray-500 truncate">{t.titulo}</p>
                        </div>
                        {t.status === 'concluida' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">Confirmada</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendente</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><MapPinIcon className="h-4 w-4 text-gray-500" /> Roteiro do dia</h3>
                {visitasHoje.length === 0 ? (
                  <p className="text-xs text-gray-400">Sem roteiro para hoje.</p>
                ) : (
                  <ol className="space-y-2">
                    {visitasHoje.map((t, i) => {
                      const cli = clientes.find(c => c.id === t.clienteId)
                      return (
                        <li key={t.id} className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                          <span className="truncate">{cli?.razaoSocial} — {cli?.endereco || cli?.enderecoCidade || 'Endereço não informado'}</span>
                        </li>
                      )
                    })}
                  </ol>
                )}
                <button type="button" onClick={() => onNavigate?.('mapa')} className="mt-3 text-xs text-primary-600 font-medium hover:underline">Ver mapa completo</button>
              </div>
            </div>

            {/* Tarefas pendentes */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Tarefas pendentes</h2>
              {tarefasPendentes.length === 0 ? (
                <p className="text-sm text-gray-400">Tudo certo! Sem tarefas pendentes.</p>
              ) : (
                <div className="space-y-2">
                  {tarefasPendentes.slice(0, 6).map(t => {
                    const cli = clientes.find(c => c.id === t.clienteId)
                    const prioridadeCor = t.prioridade === 'alta' ? 'text-red-600' : t.prioridade === 'media' ? 'text-amber-600' : 'text-green-600'
                    return (
                      <div key={t.id} className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded-lg">
                        <ExclamationCircleIcon className={`h-4 w-4 mt-0.5 ${prioridadeCor}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{t.titulo}</p>
                          <p className="text-xs text-gray-400">{cli?.razaoSocial} · {t.data ? new Date(t.data).toLocaleDateString('pt-BR') : ''}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Ranking da equipe */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><TrophyIcon className="h-5 w-5 text-yellow-500" /> Ranking da equipe</h2>
              {ranking.length === 0 ? (
                <p className="text-sm text-gray-400">Sem faturamento no mês.</p>
              ) : (
                <div className="space-y-3">
                  {ranking.map((v, i) => (
                    <div key={v.id} className="flex items-center gap-3">
                      <span className="text-lg font-bold w-6 text-center">{i === 0 ? '' : i === 1 ? '' : ''}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-gray-900 truncate">{v.nome}</span>
                          <span className="text-sm font-bold text-green-600">{fmtBRL(v.valor)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: `${ranking[0].valor > 0 ? (v.valor / ranking[0].valor) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Oportunidades da semana */}
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Oportunidades da semana</h2>
              {oportunidades.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma oportunidade recente.</p>
              ) : (
                <div className="space-y-2">
                  {oportunidades.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{c.razaoSocial}</p>
                        <p className="text-xs text-gray-500">{stageLabels[c.etapa] || c.etapa}</p>
                      </div>
                      <span className="text-sm font-bold text-green-600">{fmtBRL(c.valorEstimado || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: Meta + Dicas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6 flex items-center gap-6">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path className="text-gray-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                <path className="text-green-500" strokeDasharray={`${pctMeta}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-gray-900">{pctMeta}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Meta do mês</p>
              <p className="text-xl font-bold text-gray-900">{fmtBRL(fatMes)} <span className="text-sm font-normal text-gray-500">de {fmtBRL(metaVendas)}</span></p>
              <p className="text-xs text-gray-400 mt-1">Faltam {fmtBRL(Math.max(0, metaVendas - fatMes))} para bater a meta.</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-apple shadow-lg p-6 text-white">
            <div className="flex items-center gap-2 mb-2">
              <ArrowTrendingUpIcon className="h-5 w-5" />
              <h3 className="font-bold text-lg">Dicas de IA para você</h3>
            </div>
            <p className="text-sm text-primary-50 leading-relaxed">{dica}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
