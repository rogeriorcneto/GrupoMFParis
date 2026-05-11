import React, { useMemo, useState, useCallback } from 'react'
import {
  XMarkIcon, PlusIcon, SparklesIcon, PhoneIcon, EnvelopeIcon,
  ChatBubbleLeftIcon, DevicePhoneMobileIcon, RocketLaunchIcon,
  CheckCircleIcon, ClockIcon, FireIcon, CalendarDaysIcon,
  ChevronDownIcon, ChevronUpIcon, FunnelIcon, BoltIcon,
  ExclamationTriangleIcon, ArrowPathIcon, UserCircleIcon,
  EllipsisHorizontalIcon, InboxIcon, ArrowDownTrayIcon, ArrowUpTrayIcon,
  ArrowUturnRightIcon, ClipboardDocumentListIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import type { Tarefa, TarefaReagendamento, Cliente, Vendedor, Interacao, Pedido } from '../../types'
import { logger } from '../../utils/logger'
import { formatBrazilianPhone } from '../../utils/validators'
import { insertInteracao, insertAtividade } from '../../lib/database'
import TaskCommPanel from '../TaskCommPanel'
import WhatsAppUserPanel from '../WhatsAppUserPanel'
import Workspace from '../Workspace'

// ─── Sub-componente: TarefaCard ───────────────────────────────────────────────
const TIPO_CONFIG: Record<string, { icon: string; label: string; color: string; ring: string }> = {
  ligacao:   { icon: '📞', label: 'Ligação',   color: 'bg-violet-50 border-violet-200', ring: 'ring-violet-400' },
  reuniao:   { icon: '🤝', label: 'Reunião',   color: 'bg-blue-50 border-blue-200',    ring: 'ring-blue-400' },
  email:     { icon: '📧', label: 'E-mail',    color: 'bg-sky-50 border-sky-200',      ring: 'ring-sky-400' },
  whatsapp:  { icon: '💬', label: 'WhatsApp',  color: 'bg-green-50 border-green-200',  ring: 'ring-green-400' },
  'follow-up':{ icon: '🔄', label: 'Follow-up', color: 'bg-amber-50 border-amber-200', ring: 'ring-amber-400' },
  outro:     { icon: '📋', label: 'Outro',     color: 'bg-gray-50 border-gray-200',    ring: 'ring-gray-400' },
}

const PRIORIDADE_CONFIG = {
  alta:  { label: 'Urgente', dot: 'bg-red-500',    text: 'text-red-600',    badge: 'bg-red-100 text-red-700 border-red-200' },
  media: { label: 'Normal',  dot: 'bg-amber-400',  text: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  baixa: { label: 'Baixa',   dot: 'bg-gray-300',   text: 'text-gray-500',   badge: 'bg-gray-100 text-gray-600 border-gray-200' },
}

interface TarefaCardProps {
  tarefa: Tarefa
  cliente?: Cliente
  vendedor?: Vendedor
  isGerente: boolean
  onToggle: (t: Tarefa) => void
  onWhatsApp: (c: Cliente) => void
  onBot: (c: Cliente) => void
  onEmail: (c: Cliente) => void
  onCall: (c: Cliente) => void
  onUpdateNota: (tarefa: Tarefa, nota: string) => void
  onReagendar: (tarefa: Tarefa, motivo: string, novaData: string, novaHora: string) => void
  isOverdue: boolean
  isToday: boolean
}

const TarefaCard: React.FC<TarefaCardProps> = ({
  tarefa, cliente, vendedor, isGerente,
  onToggle, onWhatsApp, onBot, onEmail, onCall, onUpdateNota, onReagendar,
  isOverdue, isToday
}) => {
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [nota, setNota] = useState(tarefa.descricao || '')
  const [notaSaved, setNotaSaved] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [novaData, setNovaData] = useState(tarefa.data)
  const [novaHora, setNovaHora] = useState(tarefa.hora || '')

  const handleSaveNota = () => {
    if (nota !== (tarefa.descricao || '')) {
      onUpdateNota(tarefa, nota)
      setNotaSaved(true)
      setTimeout(() => setNotaSaved(false), 2000)
    }
  }

  const handleConfirmReagendar = () => {
    if (!motivo.trim() || !novaData) return
    onReagendar(tarefa, motivo.trim(), novaData, novaHora)
    setMotivo('')
  }
  const cfg = TIPO_CONFIG[tarefa.tipo] || TIPO_CONFIG.outro
  const pri = PRIORIDADE_CONFIG[tarefa.prioridade]
  const done = tarefa.status === 'concluida'

  const handleToggle = async () => {
    if (done) { onToggle(tarefa); return }
    setCompleting(true)
    setTimeout(() => {
      onToggle(tarefa)
      setCompleting(false)
    }, 400)
  }

  return (
    <div
      className={`
        group relative rounded-2xl border transition-all duration-300 overflow-hidden
        ${done
          ? 'bg-gray-50 border-gray-200 opacity-60'
          : isOverdue
            ? 'bg-red-50 border-red-300 shadow-sm shadow-red-100'
            : cfg.color + ' shadow-sm hover:shadow-md'
        }
        ${completing ? 'scale-95 opacity-50' : 'scale-100 opacity-100'}
      `}
    >
      {/* Barra lateral de prioridade */}
      {!done && (
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${
          isOverdue ? 'bg-red-500' : tarefa.prioridade === 'alta' ? 'bg-red-400' : tarefa.prioridade === 'media' ? 'bg-amber-400' : 'bg-gray-300'
        }`} />
      )}

      <div className="pl-4 pr-4 pt-4 pb-3">
        {/* Linha principal */}
        <div className="flex items-start gap-3">
          {/* Checkbox animado */}
          <button
            onClick={handleToggle}
            className={`
              mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center
              transition-all duration-300 hover:scale-110 active:scale-95
              ${done
                ? 'bg-green-500 border-green-500'
                : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
              }
            `}
          >
            {done && <CheckCircleSolid className="h-5 w-5 text-white" />}
          </button>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                {/* Tipo + título */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base">{cfg.icon}</span>
                  <h4 className={`font-semibold text-gray-900 leading-snug ${done ? 'line-through text-gray-400' : ''}`}>
                    {tarefa.titulo}
                  </h4>
                  {isOverdue && !done && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full border border-red-200">
                      <ExclamationTriangleIcon className="h-3 w-3" />
                      Atrasada
                    </span>
                  )}
                </div>

                {/* Meta info em linha */}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {tarefa.hora && (
                    <span className={`flex items-center gap-1 text-xs font-semibold ${isOverdue && !done ? 'text-red-600' : 'text-gray-600'}`}>
                      <ClockIcon className="h-3.5 w-3.5" />
                      {tarefa.hora}
                    </span>
                  )}
                  {cliente && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 truncate max-w-[160px]">
                      <UserCircleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                      {cliente.razaoSocial}
                    </span>
                  )}
                  {isGerente && vendedor && (
                    <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                      {vendedor.nome}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${pri.badge}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${pri.dot}`} />
                    {pri.label}
                  </span>
                </div>
              </div>

              {/* Botão expandir */}
              <button
                onClick={() => setExpanded(e => !e)}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/70 transition-colors"
                title={expanded ? 'Recolher' : 'Expandir / Adicionar anotação'}
              >
                {expanded
                  ? <ChevronUpIcon className="h-4 w-4" />
                  : <ChevronDownIcon className="h-4 w-4" />
                }
              </button>
            </div>

            {/* Área expandida */}
            {expanded && (
              <div className="mt-3 pt-3 border-t border-black/5 space-y-3 animate-in slide-in-from-top-1 duration-200">
                {/* Histórico de reagendamentos */}
                {tarefa.reagendamentos && tarefa.reagendamentos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                      <ArrowUturnRightIcon className="h-3.5 w-3.5" />
                      Histórico de tentativas ({tarefa.reagendamentos.length})
                    </p>
                    <div className="space-y-1.5">
                      {tarefa.reagendamentos.map((r, i) => (
                        <div key={i} className="bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 text-xs">
                          <p className="font-semibold text-orange-700">❌ {r.motivo}</p>
                          <p className="text-gray-400 mt-0.5">
                            Era: {r.dataOriginal}{r.horaOriginal ? ` às ${r.horaOriginal}` : ''} · Registrado em {new Date(r.reagendadoEm).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Anotação editável */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                    📝 Anotação
                    {notaSaved && <span className="text-green-600 font-medium">✓ Salvo</span>}
                  </label>
                  <textarea
                    value={nota}
                    onChange={e => setNota(e.target.value)}
                    onBlur={handleSaveNota}
                    rows={3}
                    placeholder="Escreva suas observações sobre esta tarefa..."
                    className="w-full text-sm text-gray-700 bg-white/80 border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 placeholder:text-gray-400 transition-all"
                  />
                </div>
                {cliente && (
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                    {cliente.contatoNome && <span>👤 {cliente.contatoNome}</span>}
                    {(cliente.contatoTelefone || cliente.contatoCelular) && (
                      <span>📱 {cliente.contatoTelefone || cliente.contatoCelular}</span>
                    )}
                    {cliente.contatoEmail && <span className="col-span-2">✉️ {cliente.contatoEmail}</span>}
                    {cliente.etapa && (
                      <span className="col-span-2">📍 Etapa: <strong>{cliente.etapa}</strong></span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Motivo + reagendar — always visible on pending tasks */}
            {!done && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Motivo / observação (ex: cliente não atendeu, reagendar...)"
                  className="w-full text-xs text-gray-600 bg-white/70 border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 placeholder:text-gray-400 transition-all"
                />
                {motivo.trim() && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={novaData}
                      onChange={e => setNovaData(e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white"
                    />
                    <input
                      type="time"
                      value={novaHora}
                      onChange={e => setNovaHora(e.target.value)}
                      className="w-24 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white"
                    />
                    <button
                      onClick={handleConfirmReagendar}
                      disabled={!novaData}
                      className="px-3 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1 whitespace-nowrap"
                    >
                      <ArrowUturnRightIcon className="h-3 w-3" />
                      Reagendar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Botões de ação rápida */}
            {!done && cliente && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {(cliente.whatsapp || cliente.contatoCelular || cliente.contatoTelefone) && (
                  <>
                    <button
                      onClick={() => onWhatsApp(cliente)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-500 hover:bg-green-600 text-white rounded-xl transition-all hover:shadow-sm active:scale-95"
                    >
                      <DevicePhoneMobileIcon className="h-3.5 w-3.5" />
                      WhatsApp
                    </button>
                    <button
                      onClick={() => onBot(cliente)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-green-50 text-green-700 border border-green-200 rounded-xl transition-all hover:shadow-sm active:scale-95"
                    >
                      <ChatBubbleLeftIcon className="h-3.5 w-3.5" />
                      Bot
                    </button>
                  </>
                )}
                {cliente.contatoEmail && (
                  <button
                    onClick={() => onEmail(cliente)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 rounded-xl transition-all hover:shadow-sm active:scale-95"
                  >
                    <EnvelopeIcon className="h-3.5 w-3.5" />
                    E-mail
                  </button>
                )}
                {(cliente.contatoTelefone || cliente.contatoCelular) && (
                  <a
                    href={`tel:+${formatBrazilianPhone(cliente.contatoTelefone || cliente.contatoCelular || '')}`}
                    onClick={() => onCall(cliente)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-violet-50 text-violet-700 border border-violet-200 rounded-xl transition-all hover:shadow-sm active:scale-95"
                  >
                    <PhoneIcon className="h-3.5 w-3.5" />
                    Ligar
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
const TarefasView: React.FC<{
  tarefas: Tarefa[]
  clientes: Cliente[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  interacoes?: Interacao[]
  pedidos?: Pedido[]
  onUpdateTarefa: (t: Tarefa) => void
  onAddTarefa: (t: Tarefa) => void
  onImportTarefas?: (novas: Omit<Tarefa, 'id'>[]) => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}> = ({ tarefas, clientes, vendedores, loggedUser, interacoes = [], pedidos = [], onUpdateTarefa, onAddTarefa, onImportTarefas, showToast }) => {
  const [showModal, setShowModal] = useState(false)
  const [commCliente, setCommCliente] = useState<Cliente | null>(null)
  const [filterStatus, setFilterStatus] = useState<'hoje' | 'todas' | 'concluida'>('hoje')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [waCliente, setWaCliente] = useState<Cliente | null>(null)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [wsCliente, setWsCliente] = useState<Cliente | null>(null)
  const [activeTab, setActiveTab] = useState<'tarefas' | 'historico'>('tarefas')

  const handleExportTarefas = () => {
    const tarefasVisiveis = [...atrasadas, ...deHoje, ...futuras, ...concluidas]
    if (tarefasVisiveis.length === 0) { alert('Nenhuma tarefa para exportar.'); return }
    const header = ['ID', 'Título', 'Descrição', 'Data', 'Hora', 'Tipo', 'Status', 'Prioridade', 'Cliente', 'Vendedor']
    const rows = tarefasVisiveis.map(t => [
      t.id,
      `"${(t.titulo || '').replace(/"/g, '""')}"`,
      `"${(t.descricao || '').replace(/"/g, '""')}"`,
      t.data,
      t.hora || '',
      t.tipo,
      t.status,
      t.prioridade,
      `"${(clientes.find(c => c.id === t.clienteId)?.razaoSocial || '').replace(/"/g, '""')}"`,
      `"${(vendedores.find(v => v.id === t.vendedorId)?.nome || '').replace(/"/g, '""')}"`
    ])
    const csv = [header.join(';'), ...rows.map(r => r.join(';'))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tarefas_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportTarefas = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onImportTarefas) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) { alert('CSV vazio'); return }

        // Auto-detect separator
        const header = lines[0]
        const sep = header.includes('\t') ? '\t' : header.split(';').length > header.split(',').length ? ';' : ','
        const headers = header.split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())

        const getIdx = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)))
        const idxDescricao = getIdx(['descrição', 'descricao', 'description'])
        const idxDataAgendamento = getIdx(['data de agendamento', 'agendamento'])
        const idxDataFinalizacao = getIdx(['data de finalização', 'data de finalizacao', 'finalização', 'finalizacao'])
        const idxTipo = getIdx(['tipo de tarefa', 'tipo'])
        const idxEmpresa = getIdx(['empresa relacionada', 'empresa'])
        const idxResponsavel = getIdx(['usuários responsáveis', 'usuarios responsaveis', 'responsáveis', 'responsaveis'])
        const idxDataCadastro = getIdx(['data de cadastro'])

        if (idxDescricao === -1) { alert('Coluna "Descrição" não encontrada no CSV'); return }

        // Parse date DD/MM/YY or DD/MM/YYYY → YYYY-MM-DD
        const parseDate = (s: string): string => {
          if (!s || !s.trim()) return new Date().toISOString().split('T')[0]
          const clean = s.trim().replace(/^"|"$/g, '')
          const parts = clean.split('/')
          if (parts.length === 3) {
            let [d, m, y] = parts
            if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
          }
          return clean
        }

        // Map tipo de tarefa Agendor → CRM
        const mapTipo = (t: string): Tarefa['tipo'] => {
          const tl = t.toLowerCase().trim()
          if (tl.includes('whatsapp') || tl.includes('whats')) return 'whatsapp'
          if (tl.includes('ligaç') || tl.includes('ligac') || tl.includes('telefone') || tl.includes('ligar')) return 'ligacao'
          if (tl.includes('email') || tl.includes('e-mail')) return 'email'
          if (tl.includes('reunião') || tl.includes('reuniao') || tl.includes('visita')) return 'reuniao'
          if (tl.includes('follow') || tl.includes('retorno')) return 'follow-up'
          return 'outro'
        }

        // Normalize for fuzzy matching
        const normalize = (s: string) => s.toLowerCase().trim()
          .replace(/\b(ltda|me|epp|eireli|s\.?a\.?|s\/a|cia|comercio|comércio|industria|indústria|distribui(dora|cao|ção)?|com\.?|ind\.?|imp\.?|exp\.?)\b/gi, '')
          .replace(/[.\-\/,()]/g, ' ').replace(/\s+/g, ' ').trim()

        const novasTarefas: Omit<Tarefa, 'id'>[] = []

        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''))
          const descricao = vals[idxDescricao] || ''
          if (!descricao) continue

          const dataAgendamento = idxDataAgendamento >= 0 ? parseDate(vals[idxDataAgendamento]) : (idxDataCadastro >= 0 ? parseDate(vals[idxDataCadastro]) : new Date().toISOString().split('T')[0])
          const dataFinalizacao = idxDataFinalizacao >= 0 ? vals[idxDataFinalizacao]?.trim() : ''
          const tipoRaw = idxTipo >= 0 ? vals[idxTipo] || '' : ''
          const empresaRaw = idxEmpresa >= 0 ? vals[idxEmpresa] || '' : ''
          const responsavelRaw = idxResponsavel >= 0 ? vals[idxResponsavel] || '' : ''

          // Match cliente by empresa name (fuzzy)
          let clienteId: number | undefined
          if (empresaRaw) {
            const empNorm = normalize(empresaRaw)
            const match = clientes.find(c => {
              const razaoNorm = normalize(c.razaoSocial)
              const fantasiaNorm = c.nomeFantasia ? normalize(c.nomeFantasia) : ''
              if (razaoNorm === empNorm || fantasiaNorm === empNorm) return true
              if (empNorm.length >= 4 && razaoNorm.length >= 4) {
                if (razaoNorm.includes(empNorm) || empNorm.includes(razaoNorm)) return true
                if (fantasiaNorm && (fantasiaNorm.includes(empNorm) || empNorm.includes(fantasiaNorm))) return true
              }
              return false
            })
            if (match) clienteId = match.id
          }

          // Match vendedor by name
          let vendedorId: number | undefined
          if (responsavelRaw) {
            const respLower = responsavelRaw.toLowerCase().trim()
            const vMatch = vendedores.find(v => v.nome.toLowerCase().includes(respLower) || respLower.includes(v.nome.toLowerCase()))
            if (vMatch) vendedorId = vMatch.id
          }

          novasTarefas.push({
            titulo: descricao.length > 100 ? descricao.substring(0, 100) + '...' : descricao,
            descricao: descricao,
            data: dataAgendamento,
            tipo: mapTipo(tipoRaw),
            status: dataFinalizacao ? 'concluida' : 'pendente',
            prioridade: 'media',
            clienteId,
            vendedorId,
          })
        }

        if (novasTarefas.length === 0) { alert('Nenhuma tarefa encontrada no CSV'); return }

        const comCliente = novasTarefas.filter(t => t.clienteId).length
        const comVendedor = novasTarefas.filter(t => t.vendedorId).length
        const pendentes = novasTarefas.filter(t => t.status === 'pendente').length

        setImportStatus(`Importando ${novasTarefas.length} tarefas...`)
        onImportTarefas(novasTarefas)
        setImportStatus(`✅ ${novasTarefas.length} tarefas importadas (${comCliente} com cliente, ${comVendedor} com vendedor, ${pendentes} pendentes)`)
        setTimeout(() => setImportStatus(null), 8000)
      } catch (err) {
        logger.error('Erro ao importar tarefas:', err)
        alert('Erro ao processar CSV de tarefas. Verifique o formato.')
        setImportStatus(null)
      }
    }
    reader.readAsText(file, 'UTF-8')
  }
  const [newTitulo, setNewTitulo] = useState('')
  const [newDescricao, setNewDescricao] = useState('')
  const [newData, setNewData] = useState(new Date().toISOString().split('T')[0])
  const [newHora, setNewHora] = useState('')
  const [newTipo, setNewTipo] = useState<Tarefa['tipo']>('ligacao')
  const [newPrioridade, setNewPrioridade] = useState<Tarefa['prioridade']>('media')
  const [newClienteId, setNewClienteId] = useState<number | ''>('')
  const [newVendedorId, setNewVendedorId] = useState<number | ''>(loggedUser?.id ?? '')
  const [clienteSearch, setClienteSearch] = useState('')
  const [showClienteList, setShowClienteList] = useState(false)
  const [filterTipo, setFilterTipo] = useState<string>('todos')
  const [showConcluidas, setShowConcluidas] = useState(false)
  const isGerente = loggedUser?.cargo === 'gerente'

  const hoje = new Date().toISOString().split('T')[0]
  const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  const registerCall = useCallback(async (cliente: Cliente) => {
    const numero = cliente.contatoTelefone || cliente.contatoCelular || ''
    try {
      await insertInteracao({
        clienteId: cliente.id,
        tipo: 'ligacao',
        data: new Date().toISOString(),
        assunto: `Ligação para ${cliente.contatoNome || cliente.razaoSocial}`,
        descricao: `Ligação realizada para ${numero} — ${cliente.razaoSocial}`,
        automatico: false,
      })
      await insertAtividade({
        tipo: 'ligacao',
        descricao: `Ligação para ${cliente.razaoSocial} (${numero})`,
        vendedorNome: loggedUser?.nome || 'Vendedor',
        timestamp: new Date().toISOString(),
      })
      showToast?.('success', `Ligação registrada para ${cliente.razaoSocial}`)
    } catch (err) {
      logger.error('Erro ao registrar ligação:', err)
    }
  }, [loggedUser, showToast])

  const meusClientes = useMemo(() =>
    isGerente ? clientes : clientes.filter(c => c.vendedorId === loggedUser?.id)
  , [clientes, isGerente, loggedUser?.id])

  const minhasTarefas = useMemo(() =>
    tarefas.filter(t => isGerente ? true : t.vendedorId === loggedUser?.id)
  , [tarefas, isGerente, loggedUser?.id])

  // Segmentar tarefas
  const { atrasadas, deHoje, futuras, concluidas } = useMemo(() => {
    const pendentes = minhasTarefas.filter(t => t.status === 'pendente')
    const conc = minhasTarefas.filter(t => t.status === 'concluida')

    const applyTipoFilter = (arr: Tarefa[]) =>
      filterTipo === 'todos' ? arr : arr.filter(t => t.tipo === filterTipo)

    const sortByHora = (arr: Tarefa[]) =>
      [...arr].sort((a, b) => {
        const horaA = a.hora || '23:59'
        const horaB = b.hora || '23:59'
        return horaA.localeCompare(horaB)
      })

    return {
      atrasadas: applyTipoFilter(sortByHora(pendentes.filter(t => t.data < hoje))),
      deHoje: applyTipoFilter(sortByHora(pendentes.filter(t => t.data === hoje))),
      futuras: applyTipoFilter(
        pendentes
          .filter(t => t.data > hoje)
          .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''))
      ),
      concluidas: applyTipoFilter(
        [...conc].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 30)
      ),
    }
  }, [minhasTarefas, hoje, filterTipo])

  // Stats do dia
  const totalHoje = deHoje.length
  const concluidasHoje = minhasTarefas.filter(t => t.status === 'concluida' && t.data === hoje).length
  const progressoHoje = totalHoje + concluidasHoje > 0
    ? Math.round((concluidasHoje / (totalHoje + concluidasHoje)) * 100)
    : 0

  const toggleStatus = useCallback((tarefa: Tarefa) => {
    const novoConcluida = tarefa.status === 'pendente'
    onUpdateTarefa({
      ...tarefa,
      status: novoConcluida ? 'concluida' : 'pendente',
      concluidaEm: novoConcluida ? new Date().toISOString() : undefined,
    })
  }, [onUpdateTarefa])

  const handleAddTarefa = () => {
    if (!newTitulo.trim()) return
    onAddTarefa({
      id: Date.now(),
      titulo: newTitulo.trim(),
      descricao: newDescricao.trim() || undefined,
      data: newData,
      hora: newHora.trim() || undefined,
      tipo: newTipo,
      status: 'pendente',
      prioridade: newPrioridade,
      clienteId: typeof newClienteId === 'number' ? newClienteId : undefined,
      vendedorId: typeof newVendedorId === 'number' ? newVendedorId : undefined
    })
    setNewTitulo('')
    setNewDescricao('')
    setNewHora('')
    setNewVendedorId(loggedUser?.id ?? '')
    setNewClienteId('')
    setClienteSearch('')
    setShowModal(false)
  }

  const formatDataLabel = (data: string) => {
    if (data === hoje) return 'Hoje'
    if (data === amanha) return 'Amanhã'
    return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  // Agrupar futuras por data
  const futurasPorData = useMemo(() => {
    const map: Record<string, Tarefa[]> = {}
    for (const t of futuras) {
      if (!map[t.data]) map[t.data] = []
      map[t.data].push(t)
    }
    return map
  }, [futuras])

  const handleUpdateNota = useCallback((tarefa: Tarefa, nota: string) => {
    onUpdateTarefa({ ...tarefa, descricao: nota })
  }, [onUpdateTarefa])

  const handleReagendar = useCallback((tarefa: Tarefa, motivo: string, novaData: string, novaHora: string) => {
    const reagendamento: TarefaReagendamento = {
      dataOriginal: tarefa.data,
      horaOriginal: tarefa.hora,
      motivo,
      reagendadoEm: new Date().toISOString(),
    }
    onUpdateTarefa({
      ...tarefa,
      data: novaData,
      hora: novaHora || tarefa.hora,
      status: 'pendente',
      reagendamentos: [...(tarefa.reagendamentos || []), reagendamento],
    })
    showToast?.('success', `Tarefa reagendada para ${new Date(novaData + 'T00:00:00').toLocaleDateString('pt-BR')}`)
  }, [onUpdateTarefa, showToast])

  const renderCard = (tarefa: Tarefa, overdue = false) => {
    const cliente = clientes.find(c => c.id === tarefa.clienteId)
    const vendedor = vendedores.find(v => v.id === tarefa.vendedorId)
    return (
      <TarefaCard
        key={tarefa.id}
        tarefa={tarefa}
        cliente={cliente}
        vendedor={vendedor}
        isGerente={isGerente}
        onToggle={toggleStatus}
        onWhatsApp={(c) => { setWaCliente(c); setShowWhatsApp(true) }}
        onBot={(c) => setCommCliente(c)}
        onEmail={(c) => setCommCliente(c)}
        onCall={(c) => registerCall(c)}
        onUpdateNota={handleUpdateNota}
        onReagendar={handleReagendar}
        isOverdue={overdue}
        isToday={tarefa.data === hoje}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* ── HEADER STICKY ────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 h-14">

            {/* Tabs */}
            <div className="flex gap-0.5">
              <button
                onClick={() => setActiveTab('tarefas')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl transition-all ${
                  activeTab === 'tarefas'
                    ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <CalendarDaysIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Minhas Tarefas</span>
                <span className="sm:hidden">Tarefas</span>
              </button>
              <button
                onClick={() => setActiveTab('historico')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl transition-all ${
                  activeTab === 'historico'
                    ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <ClipboardDocumentListIcon className="h-4 w-4" />
                Histórico
                {minhasTarefas.filter(t => t.status === 'concluida').length > 0 && (
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                    {minhasTarefas.filter(t => t.status === 'concluida').length}
                  </span>
                )}
              </button>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-1.5">
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                className="hidden md:block px-2.5 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 bg-gray-50"
              >
                <option value="todos">Todos os tipos</option>
                <option value="ligacao">📞 Ligações</option>
                <option value="whatsapp">💬 WhatsApp</option>
                <option value="email">📧 E-mails</option>
                <option value="reuniao">🤝 Reuniões</option>
                <option value="follow-up">🔄 Follow-ups</option>
              </select>

              <button
                onClick={() => setShowWhatsApp(prev => !prev)}
                className={`p-2 rounded-xl transition-all ${showWhatsApp ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600'}`}
                title="Meu WhatsApp"
              >
                <DevicePhoneMobileIcon className="h-4.5 w-4.5 h-5 w-5" />
              </button>

              <button
                onClick={() => { setShowWorkspace(true); setWsCliente(null) }}
                className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 text-white rounded-xl shadow-sm hover:shadow-md transition-all"
                title="Workspace"
              >
                <RocketLaunchIcon className="h-5 w-5" />
              </button>

              <button
                onClick={handleExportTarefas}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700 rounded-xl transition-all text-xs font-medium"
                title="Exportar CSV"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Exportar
              </button>

              {onImportTarefas && (
                <label className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl cursor-pointer transition-all text-xs font-medium" title="Importar Agendor">
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={handleImportTarefas} />
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Agendor
                </label>
              )}

              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 shadow-sm transition-all active:scale-95 text-sm"
              >
                <PlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Nova Tarefa</span>
                <span className="sm:hidden">Nova</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTEÚDO ─────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── ABA HISTÓRICO ─────────────────────────── */}
        {activeTab === 'historico' && (() => {
          const todas = minhasTarefas.filter(t => t.status === 'concluida')
            .sort((a, b) => (b.concluidaEm || b.data).localeCompare(a.concluidaEm || a.data))
          const comReagendamento = minhasTarefas.filter(t => t.reagendamentos && t.reagendamentos.length > 0)
          return (
            <>
              {/* KPIs rápidos */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{todas.length}</p>
                  <p className="text-xs text-green-600 font-medium mt-0.5">Concluídas</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-bold text-orange-700">{comReagendamento.length}</p>
                  <p className="text-xs text-orange-600 font-medium mt-0.5">Reagendadas</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">
                    {todas.length + comReagendamento.length > 0
                      ? Math.round((todas.length / (todas.length + comReagendamento.length)) * 100)
                      : 0}%
                  </p>
                  <p className="text-xs text-blue-600 font-medium mt-0.5">Taxa de conclusão</p>
                </div>
              </div>

              {todas.length === 0 && comReagendamento.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <ClipboardDocumentListIcon className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">Nenhuma tarefa no histórico ainda</p>
                  <p className="text-gray-400 text-sm mt-1">As tarefas concluídas e reagendadas aparecerão aqui.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Concluídas */}
                  {todas.map(t => {
                    const cliente = clientes.find(c => c.id === t.clienteId)
                    const cfg = TIPO_CONFIG[t.tipo] || TIPO_CONFIG.outro
                    return (
                      <div key={t.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{cfg.icon}</span>
                            <span className="font-semibold text-gray-700 line-through text-sm">{t.titulo}</span>
                          </div>
                          <span className="flex-shrink-0 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200">✓ Concluída</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                          {cliente && <span>🏢 {cliente.razaoSocial}</span>}
                          <span>🗓️ {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')}{t.hora ? ` às ${t.hora}` : ''}</span>
                          {t.concluidaEm && <span>✅ Concluída em {new Date(t.concluidaEm).toLocaleDateString('pt-BR')}</span>}
                        </div>
                        {t.descricao && (
                          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">📝 {t.descricao}</p>
                        )}
                        {t.reagendamentos && t.reagendamentos.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-orange-600">🔁 {t.reagendamentos.length} tentativa(s) anterior(es):</p>
                            {t.reagendamentos.map((r, i) => (
                              <div key={i} className="bg-orange-50 rounded-lg px-2.5 py-1.5 text-xs">
                                <span className="font-medium text-orange-700">❌ {r.motivo}</span>
                                <span className="text-gray-400 ml-2">· Era {r.dataOriginal}{r.horaOriginal ? ` às ${r.horaOriginal}` : ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}

        {activeTab === 'tarefas' && (
          <>
            {/* Saudação + progresso */}
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'}
                  {loggedUser ? `, ${loggedUser.nome.split(' ')[0]}` : ''}! 👋
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {totalHoje + concluidasHoje === 0
                    ? 'Nenhuma tarefa para hoje'
                    : `${concluidasHoje} de ${totalHoje + concluidasHoje} tarefas concluídas hoje`
                  }
                </p>
              </div>
              {totalHoje + concluidasHoje > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-28 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-700"
                      style={{ width: `${progressoHoje}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-600">{progressoHoje}%</span>
                </div>
              )}
            </div>

            {importStatus && (
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4" />
                {importStatus}
              </div>
            )}

            {/* WhatsApp Panel */}
            {showWhatsApp && (
              <WhatsAppUserPanel
                loggedUser={loggedUser}
                cliente={waCliente}
                onClose={() => { setShowWhatsApp(false); setWaCliente(null) }}
                showToast={showToast}
                compact
              />
            )}

        {/* ZONA 1: ATRASADAS */}
        {atrasadas.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
              <h2 className="font-bold text-red-600">Atrasadas</h2>
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                {atrasadas.length}
              </span>
            </div>
            <div className="space-y-2">
              {atrasadas.map(t => renderCard(t, true))}
            </div>
          </section>
        )}

        {/* ZONA 2: HOJE */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FireIcon className="h-5 w-5 text-orange-500" />
              <h2 className="font-bold text-gray-900">Hoje</h2>
              {deHoje.length > 0 && (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                  {deHoje.length}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                const sugeridas: Tarefa[] = [
                  { id: Date.now() + 1, clienteId: meusClientes.find(c => c.diasInativo && c.diasInativo > 7)?.id, vendedorId: loggedUser?.id, titulo: 'Follow-up com clientes inativos', descricao: 'Clientes sem interação há mais de 7 dias', data: hoje, hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta' },
                  { id: Date.now() + 2, clienteId: meusClientes.find(c => c.etapa === 'negociacao')?.id, vendedorId: loggedUser?.id, titulo: 'Enviar proposta comercial', data: hoje, hora: '14:00', tipo: 'email', status: 'pendente', prioridade: 'alta' },
                ]
                sugeridas.forEach(t => onAddTarefa(t))
                showToast?.('success', '✨ IA adicionou tarefas sugeridas para hoje!')
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl border border-purple-200 transition-colors"
            >
              <SparklesIcon className="h-3.5 w-3.5" />
              Sugerir com IA
            </button>
          </div>

          {deHoje.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
              <InboxIcon className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Nenhuma tarefa para hoje</p>
              <p className="text-gray-400 text-sm mt-1">Que tal adicionar uma?</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
              >
                + Nova Tarefa
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {deHoje.map(t => renderCard(t, false))}
            </div>
          )}
        </section>

        {/* ZONA 3: PRÓXIMAS (agrupadas por data) */}
        {Object.keys(futurasPorData).length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDaysIcon className="h-5 w-5 text-blue-500" />
              <h2 className="font-bold text-gray-900">Próximas</h2>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                {futuras.length}
              </span>
            </div>

            <div className="space-y-4">
              {Object.entries(futurasPorData).map(([data, lista]) => (
                <div key={data}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                      data === amanha
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {formatDataLabel(data)}
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <div className="space-y-2">
                    {lista.map(t => renderCard(t, false))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ZONA 4: CONCLUÍDAS (colapsável) */}
        {concluidas.length > 0 && (
          <section>
            <button
              onClick={() => setShowConcluidas(v => !v)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
              <h2 className="font-bold text-gray-400 group-hover:text-gray-600 transition-colors">
                Concluídas
              </h2>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded-full">
                {concluidas.length}
              </span>
              <div className="flex-1 h-px bg-gray-200" />
              {showConcluidas
                ? <ChevronUpIcon className="h-4 w-4 text-gray-400" />
                : <ChevronDownIcon className="h-4 w-4 text-gray-400" />
              }
            </button>

            {showConcluidas && (
              <div className="mt-3 space-y-2">
                {concluidas.map(t => renderCard(t, false))}
              </div>
            )}
          </section>
        )}

        {/* ESTADO VAZIO GERAL */}
        {atrasadas.length === 0 && deHoje.length === 0 && futuras.length === 0 && concluidas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-4">
              <CheckCircleIcon className="h-10 w-10 text-primary-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-700 mb-1">Tudo limpo por aqui!</h3>
            <p className="text-gray-400 text-center max-w-xs">
              Nenhuma tarefa pendente. Aproveite para adicionar novas atividades.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-6 px-6 py-3 bg-primary-600 text-white rounded-2xl font-semibold hover:bg-primary-700 transition-all shadow-lg hover:shadow-xl"
            >
              + Criar primeira tarefa
            </button>
          </div>
        )}
        </>
        )}{/* fim activeTab tarefas */}
      </div>

      {/* ── MODAIS ───────────────────────────────────────── */}

      {commCliente && (
        <TaskCommPanel
          cliente={commCliente}
          loggedUser={loggedUser}
          onClose={() => setCommCliente(null)}
          showToast={showToast}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Nova Tarefa</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tipo — botões visuais */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo *</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewTipo(key as Tarefa['tipo'])}
                      className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                        newTipo === key
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-lg">{cfg.icon}</span>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Título *</label>
                <input
                  value={newTitulo}
                  onChange={(e) => setNewTitulo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTarefa()}
                  placeholder="Ex: Ligar para João da Panificadora"
                  autoFocus
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Data *</label>
                  <input type="date" value={newData} onChange={(e) => setNewData(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Hora</label>
                  <input type="time" value={newHora} onChange={(e) => setNewHora(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm" />
                </div>
              </div>

              {/* Prioridade — visual */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Prioridade</label>
                <div className="flex gap-2">
                  {(['baixa', 'media', 'alta'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPrioridade(p)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                        newPrioridade === p
                          ? p === 'alta' ? 'border-red-400 bg-red-50 text-red-700'
                            : p === 'media' ? 'border-amber-400 bg-amber-50 text-amber-700'
                            : 'border-gray-400 bg-gray-50 text-gray-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {p === 'alta' ? '🔴 Urgente' : p === 'media' ? '🟡 Normal' : '⚪ Baixa'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cliente */}
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Cliente</label>
                <input
                  type="text"
                  value={clienteSearch}
                  onChange={(e) => { setClienteSearch(e.target.value); setShowClienteList(true); if (!e.target.value) setNewClienteId('') }}
                  onFocus={() => setShowClienteList(true)}
                  placeholder="Buscar cliente..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
                />
                {newClienteId && (
                  <button type="button" onClick={() => { setNewClienteId(''); setClienteSearch('') }} className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                )}
                {showClienteList && clienteSearch.length >= 2 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {meusClientes
                      .filter(c => c.razaoSocial.toLowerCase().includes(clienteSearch.toLowerCase()) || (c.nomeFantasia || '').toLowerCase().includes(clienteSearch.toLowerCase()))
                      .slice(0, 15)
                      .map(c => (
                        <button key={c.id} type="button"
                          onClick={() => { setNewClienteId(c.id); setClienteSearch(c.razaoSocial); setShowClienteList(false) }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50 border-b border-gray-50 last:border-0 transition-colors"
                        >
                          <span className="font-medium text-gray-900">{c.razaoSocial}</span>
                          {c.etapa && <span className="text-xs text-gray-400 ml-2">· {c.etapa}</span>}
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>

              {isGerente && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Responsável</label>
                  <select value={newVendedorId} onChange={(e) => setNewVendedorId(e.target.value ? Number(e.target.value) : '')} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm">
                    <option value="">Sem responsável</option>
                    {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Observações</label>
                <textarea value={newDescricao} onChange={(e) => setNewDescricao(e.target.value)} rows={2} placeholder="Contexto ou notas..." className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm resize-none" />
              </div>
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleAddTarefa}
                disabled={!newTitulo.trim()}
                className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all active:scale-95"
              >
                Criar Tarefa
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkspace && (
        <Workspace
          loggedUser={loggedUser}
          clientes={meusClientes}
          vendedores={vendedores}
          interacoes={interacoes}
          pedidos={pedidos}
          tarefas={tarefas}
          cliente={wsCliente}
          onClose={() => { setShowWorkspace(false); setWsCliente(null) }}
          showToast={showToast}
          onAddTarefa={onAddTarefa}
          onUpdateTarefa={onUpdateTarefa}
        />
      )}
    </div>
  )
}

export default TarefasView
