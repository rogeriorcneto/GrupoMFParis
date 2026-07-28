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
  ClockIcon,
  ArrowTrendingUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BuildingStorefrontIcon,
  MegaphoneIcon,
  TrophyIcon,
  FlagIcon,
} from '@heroicons/react/24/outline'
import { stageLabels } from '../../utils/constants'
import { authFetch, BOT_URL } from '../../lib/botApi'
import type { Cliente, Vendedor, Interacao, Atividade, Produto, Tarefa, Pedido, DashboardMetrics, Missao } from '../../types'

interface Props {
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  metrics: DashboardMetrics
  atividades: Atividade[]
  produtos: Produto[]
  tarefas: Tarefa[]
  pedidos: Pedido[]
  loggedUser: Vendedor | null
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

const stageOrder = ['prospecção', 'qualificação', 'amostra', 'proposta', 'negociacao', 'follow_up']
const stageColors: Record<string, string> = {
  prospecção: '#3B82F6',
  qualificação: '#0EA5E9',
  amostra: '#6366F1',
  proposta: '#A855F7',
  negociacao: '#F59E0B',
  follow_up: '#22C55E',
}

interface MetricCardProps {
  label: string
  value: string
  meta: number
  total: number
  color: string
  unit?: string
  icon: React.ReactNode
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, meta, total, color, unit, icon }) => {
  const pct = meta > 0 ? Math.min(100, Math.round((total / meta) * 100)) : 0
  return (
    <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 flex flex-col justify-between h-full">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}20` }}>{icon}</div>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold text-gray-900">
          {value} {unit && <span className="text-sm font-medium text-gray-500">{unit}</span>}
        </p>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Meta: {meta.toLocaleString('pt-BR')}</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
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
  clientes,
  vendedores,
  interacoes,
  atividades,
  tarefas,
  pedidos,
  loggedUser,
}: Props) {
  const userId = loggedUser?.id
  const meusClientes = useMemo(() => clientes.filter(c => c.vendedorId === userId), [clientes, userId])
  const meusPedidos = useMemo(() => pedidos.filter(p => p.vendedorId === userId), [pedidos, userId])

  const metaVendas = loggedUser?.metaVendas || 100000
  const metaLeads = loggedUser?.metaLeads || 10
  const metaConversao = loggedUser?.metaConversao || 35

  const fatMes = useMemo(
    () => meusPedidos.filter(p => p.status === 'confirmado' && isMes(p.dataCriacao)).reduce((s, p) => s + p.totalValor, 0),
    [meusPedidos]
  )
  const novosClientesMes = useMemo(() => meusClientes.filter(c => isMes(c.dataEntradaEtapa)).length, [meusClientes])
  const propostasMes = useMemo(
    () => meusPedidos.filter(p => (p.status === 'rascunho' || p.status === 'enviado') && isMes(p.dataCriacao)).length,
    [meusPedidos]
  )

  const interacoesUsuario = useMemo(
    () => interacoes.filter(i => meusClientes.some(c => c.id === i.clienteId)),
    [interacoes, meusClientes]
  )
  const visitasMes = useMemo(() => interacoesUsuario.filter(i => i.tipo === 'reuniao' && isMes(i.data)).length, [interacoesUsuario])
  const visitasHoje = useMemo(() => tarefas.filter(t => t.vendedorId === userId && t.tipo === 'reuniao' && isHoje(t.data)), [tarefas, userId])

  const ativos = meusClientes.filter(c => c.etapa !== 'perdido')
  const convertidos = ativos.filter(c => c.etapa === 'follow_up').length
  const taxaConversao = ativos.length > 0 ? (convertidos / ativos.length) * 100 : 0

  const funil = useMemo(() => {
    const max = Math.max(...stageOrder.map(s => meusClientes.filter(c => c.etapa === s).length), 1)
    return stageOrder.map(s => {
      const qtd = meusClientes.filter(c => c.etapa === s).length
      const valor = meusClientes.filter(c => c.etapa === s).reduce((s, c) => s + (c.valorEstimado || 0), 0)
      return { stage: s, label: stageLabels[s] || s, qtd, valor, pct: Math.max((qtd / max) * 100, 8) }
    })
  }, [meusClientes])

  const tarefasHoje = useMemo(
    () => tarefas.filter(t => t.vendedorId === userId && isHoje(t.data)).sort((a, b) => (a.hora || '').localeCompare(b.hora || '')),
    [tarefas, userId]
  )
  const tarefasPendentes = useMemo(
    () => tarefas.filter(t => t.vendedorId === userId && t.status !== 'concluida').sort((a, b) => (a.data || '').localeCompare(b.data || '')),
    [tarefas, userId]
  )

  const amostras = useMemo(
    () => meusClientes.filter(c => c.statusAmostra && !['aprovada', 'reprovada'].includes(c.statusAmostra)).slice(0, 5),
    [meusClientes]
  )

  const ranking = useMemo(() => {
    const map = new Map<number, number>()
    vendedores.forEach(v => map.set(v.id, 0))
    pedidos.filter(p => p.status === 'confirmado' && isMes(p.dataCriacao)).forEach(p => {
      map.set(p.vendedorId, (map.get(p.vendedorId) || 0) + p.totalValor)
    })
    return vendedores
      .map(v => ({ ...v, valor: map.get(v.id) || 0 }))
      .filter(v => v.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 3)
  }, [vendedores, pedidos])

  const oportunidades = useMemo(() => {
    return meusClientes
      .filter(c => (c.valorEstimado || 0) > 0 && ['proposta', 'negociacao', 'follow_up'].includes(c.etapa) && isSemana(c.ultimaInteracao || c.dataEntradaEtapa))
      .sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0))
      .slice(0, 5)
  }, [meusClientes])

  const atualizacoes = useMemo(
    () => atividades
      .filter(a => loggedUser?.nome && a.vendedorNome === loggedUser.nome)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5),
    [atividades, loggedUser]
  )

  const atividadesHoje = useMemo(() => ({
    ligacao: interacoesUsuario.filter(i => i.tipo === 'ligacao' && isHoje(i.data)).length,
    whatsapp: interacoesUsuario.filter(i => i.tipo === 'whatsapp' && isHoje(i.data)).length,
    email: interacoesUsuario.filter(i => i.tipo === 'email' && isHoje(i.data)).length,
    reuniao: interacoesUsuario.filter(i => i.tipo === 'reuniao' && isHoje(i.data)).length,
    prospeccao: meusClientes.filter(c => isHoje(c.criadoEm)).length,
  }), [interacoesUsuario, meusClientes])

  const pctMeta = metaVendas > 0 ? Math.min(100, Math.round((fatMes / metaVendas) * 100)) : 0
  const comissao = fatMes * 0.01
  const metaComissao = metaVendas * 0.01

  const [missoesAtivas, setMissoesAtivas] = useState<Missao[]>([])

  useEffect(() => {
    authFetch(`${BOT_URL}/api/missoes?status=em_andamento`)
      .then(r => r.json())
      .then(r => setMissoesAtivas(r.data || []))
      .catch(() => {})
  }, [])

  const visitasMissao = tarefas.filter(t => t.missaoId && missoesAtivas.some(m => m.id === t.missaoId)).length

  const dica = useMemo(() => {
    const inativos = meusClientes.filter(c => (c.diasInativo || 0) > 30 && c.etapa !== 'perdido').length
    const amostrasPendentes = amostras.length
    if (inativos > 0) return `Você tem ${inativos} cliente(s) inativo(s) há mais de 30 dias. Que tal uma rodada de reaquecimento?`
    if (amostrasPendentes > 0) return `${amostrasPendentes} amostra(s) estão em andamento. Acompanhe o teste para acelerar a conversão.`
    return 'Bom ritmo! Aproveite para qualificar novos leads e enviar propostas personalizadas.'
  }, [meusClientes, amostras])

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bom dia, {loggedUser?.nome?.split(' ')[0] || 'Vendedor'}! 👋</h1>
            <p className="text-sm text-gray-500 mt-0.5">Aqui está o seu resumo de hoje.</p>
          </div>
          <div className="text-sm text-gray-400 bg-white rounded-apple border border-gray-200 px-4 py-2 shadow-apple-sm">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Faturamento do mês"
            value={fmtBRL(fatMes)}
            meta={metaVendas}
            total={fatMes}
            color="#22C55E"
            icon={<CurrencyDollarIcon className="h-5 w-5" style={{ color: '#22C55E' }} />}
          />
          <MetricCard
            label="Comissão estimada"
            value={fmtBRL(comissao)}
            meta={metaComissao}
            total={comissao}
            color="#10B981"
            icon={<CurrencyDollarIcon className="h-5 w-5" style={{ color: '#10B981' }} />}
          />
          <MetricCard
            label="Visitas realizadas"
            value={String(visitasMes)}
            meta={45}
            total={visitasMes}
            color="#3B82F6"
            icon={<MapPinIcon className="h-5 w-5" style={{ color: '#3B82F6' }} />}
          />
          <MetricCard
            label="Propostas enviadas"
            value={String(propostasMes)}
            meta={25}
            total={propostasMes}
            color="#A855F7"
            icon={<ClipboardDocumentCheckIcon className="h-5 w-5" style={{ color: '#A855F7' }} />}
          />
          <MetricCard
            label="Novos clientes"
            value={String(novosClientesMes)}
            meta={metaLeads}
            total={novosClientesMes}
            color="#F59E0B"
            icon={<UsersIcon className="h-5 w-5" style={{ color: '#F59E0B' }} />}
          />
          <MetricCard
            label="Conversão"
            value={`${taxaConversao.toFixed(0)}%`}
            meta={metaConversao}
            total={taxaConversao}
            color="#EF4444"
            icon={<ChartBarIcon className="h-5 w-5" style={{ color: '#EF4444' }} />}
          />
          <MetricCard
            label="Próximas visitas hoje"
            value={String(visitasHoje.length)}
            meta={Math.max(visitasHoje.length, 1)}
            total={visitasHoje.length}
            color="#14B8A6"
            icon={<CalendarIcon className="h-5 w-5" style={{ color: '#14B8A6' }} />}
          />
          <MetricCard
            label="Missões em andamento"
            value={String(missoesAtivas.length)}
            meta={Math.max(missoesAtivas.length, 1)}
            total={missoesAtivas.length}
            color="#F97316"
            icon={<FlagIcon className="h-5 w-5" style={{ color: '#F97316' }} />}
          />
          <MetricCard
            label="Visitas de missão"
            value={String(visitasMissao)}
            meta={Math.max(visitasMissao, 1)}
            total={visitasMissao}
            color="#8B5CF6"
            icon={<MapPinIcon className="h-5 w-5" style={{ color: '#8B5CF6' }} />}
          />
        </div>

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
                <span className="text-gray-500">Total em negociação</span>
                <span className="font-bold text-gray-900">{fmtBRL(meusClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0))}</span>
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
                <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">{visitasHoje.length} visitas</span>
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
                          <p className="text-sm font-bold text-gray-900">{t.hora || '--:--'}</p>
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
                <button className="mt-3 text-xs text-primary-600 font-medium hover:underline">Ver mapa completo</button>
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
                      <span className="text-lg font-bold w-6 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
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
