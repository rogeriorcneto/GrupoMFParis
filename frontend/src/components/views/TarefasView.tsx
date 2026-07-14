import React, { useMemo, useState, useCallback } from 'react'
import WhatsAppIcon from '../icons/WhatsAppIcon'
import {
  XMarkIcon, PlusIcon, SparklesIcon, PhoneIcon, EnvelopeIcon,
  ChatBubbleLeftIcon, DevicePhoneMobileIcon, RocketLaunchIcon,
  CheckCircleIcon, ClockIcon, FireIcon, CalendarDaysIcon,
  ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon, FunnelIcon, BoltIcon,
  ExclamationTriangleIcon, ArrowPathIcon, BuildingOfficeIcon,
  EllipsisHorizontalIcon, InboxIcon, ArrowDownTrayIcon, ArrowUpTrayIcon,
  ArrowUturnRightIcon, ClipboardDocumentListIcon, ArrowTopRightOnSquareIcon, PencilIcon, TrashIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import type { Tarefa, TarefaReagendamento, Cliente, Vendedor, Interacao, Pedido } from '../../types'
import { logger } from '../../utils/logger'
import { formatBrazilianPhone } from '../../utils/validators'
import { insertInteracao, insertAtividade, deleteTarefa } from '../../lib/database'
import TaskCommPanel from '../TaskCommPanel'
import WhatsAppUserPanel from '../WhatsAppUserPanel'
import Workspace from '../Workspace'
import * as XLSX from 'xlsx'

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
  onVerNoFunil?: (cliente: Cliente) => void
  onDeleteTarefa?: (tarefa: Tarefa) => void
  onVerRegraAutomacao?: (regraId: number) => void
}

const TarefaCard: React.FC<TarefaCardProps> = ({
  tarefa, cliente, vendedor, isGerente,
  onToggle, onWhatsApp, onBot, onEmail, onCall, onUpdateNota, onReagendar,
  isOverdue, isToday, onVerNoFunil, onDeleteTarefa, onVerRegraAutomacao
}) => {
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [nota, setNota] = useState(tarefa.descricao || '')
  const [notaSaved, setNotaSaved] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [novaData, setNovaData] = useState(tarefa.data)
  const [novaHora, setNovaHora] = useState(tarefa.hora || '')
  const [reagendarOpen, setReagendarOpen] = useState(false)
  const [finalizarOpen, setFinalizarOpen] = useState(false)
  const [obsFinalizacao, setObsFinalizacao] = useState('')

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
    setNovaData(tarefa.data)
    setNovaHora(tarefa.hora || '')
    setReagendarOpen(false)
  }
  const cfg = TIPO_CONFIG[tarefa.tipo] || TIPO_CONFIG.outro
  const pri = PRIORIDADE_CONFIG[tarefa.prioridade]
  const done = tarefa.status === 'concluida'

  const handleConfirmFinalizar = () => {
    setCompleting(true)
    const tarefaFinal = obsFinalizacao.trim()
      ? { ...tarefa, conclusao: obsFinalizacao.trim() }
      : tarefa
    setTimeout(() => {
      onToggle(tarefaFinal)
      setCompleting(false)
      setFinalizarOpen(false)
      setObsFinalizacao('')
    }, 400)
  }

  const handleToggle = async () => {
    if (done) { onToggle(tarefa); return }
    setFinalizarOpen(o => !o)
    if (reagendarOpen) setReagendarOpen(false)
  }

  return (
    <div
      className={`
        group relative rounded-2xl border transition-all duration-300 overflow-hidden
        ${done
          ? cfg.color + ' shadow-sm'
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
          isOverdue ? 'bg-red-500' : 'bg-green-500'
        }`} />
      )}

      <div className="pl-4 pr-4 pt-3 pb-3">
        {/* LINHA 1 (topo): meta info à esquerda + data/badge à direita */}
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400">
            {vendedor && (
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                {vendedor.nome}
              </span>
            )}
            {tarefa.criadoEm && (
              <span className="flex items-center gap-1">
                <ClipboardDocumentListIcon className="h-3.5 w-3.5 flex-shrink-0" />
                Criado em {new Date(tarefa.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
            {cliente && (
              <span className="flex items-center gap-1 truncate max-w-[200px]">
                <BuildingOfficeIcon className="h-3.5 w-3.5 flex-shrink-0" />
                {cliente.razaoSocial}
              </span>
            )}
          </div>
          {/* Data + badge à direita */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${
              isOverdue && !done
                ? 'bg-red-100 text-red-700 border border-red-200'
                : isToday && !done
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
            }`}>
              <CalendarDaysIcon className="h-3 w-3" />
              {new Date(tarefa.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              {tarefa.hora && ` às ${tarefa.hora.slice(0, 5)}`}
            </span>
            {done ? (
              <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-green-100 text-green-700 border-green-200">
                ✓ Concluído
              </span>
            ) : (
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${pri.badge}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${pri.dot}`} />
                {pri.label}
              </span>
            )}
            {tarefa.reagendamentos && tarefa.reagendamentos.length > 0 && (() => {
              const total = tarefa.reagendamentos.length
              const ultimo = tarefa.reagendamentos[total - 1]
              return (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full border border-orange-200 cursor-help"
                  title={`Último motivo: ${ultimo.motivo}\nTotal de reagendamentos: ${total}`}
                >
                  <ArrowUturnRightIcon className="h-3 w-3" />
                  Reagendada
                </span>
              )
            })()}
            {isOverdue && !done && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full border border-red-200">
                <ExclamationTriangleIcon className="h-3 w-3" />
                Atrasada
              </span>
            )}
          </div>
        </div>

        {/* LINHA 2: ícone + título da tarefa */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base">{cfg.icon}</span>
                  <h4 className={`font-semibold text-gray-900 leading-snug ${done ? 'text-gray-500' : ''}`}>
                    {(() => {
                      const titulo = tarefa.titulo
                      if (cliente) {
                        const idx = titulo.lastIndexOf(' - ')
                        if (idx > 0) return titulo.slice(0, idx)
                      }
                      return titulo
                    })()}
                  </h4>
                  {tarefa.origemAutomacaoId && onVerRegraAutomacao && (
                    <button
                      onClick={() => onVerRegraAutomacao(tarefa.origemAutomacaoId!)}
                      className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full border border-purple-200 hover:bg-purple-200 transition-colors"
                      title="Ver regra de automação"
                    >
                      <BoltIcon className="h-3 w-3" />
                      Automática
                    </button>
                  )}
                </div>

                {/* HORA DE EXECUÇÃO (se concluída) */}
                {done && tarefa.concluidaEm && (
                  <div className="mt-1">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-green-100 text-green-700 border border-green-200 inline-flex">
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                      Executada: {new Date(tarefa.concluidaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às {new Date(tarefa.concluidaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZoneName: undefined })}
                    </span>
                  </div>
                )}
              </div>
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

            {/* Observação da tarefa — read-only display */}
            {tarefa.descricao && (
              <div className="mt-3">
                <div className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 min-h-[2.5rem]">
                  {tarefa.descricao}
                </div>
              </div>
            )}
            {/* Conclusão registrada */}
            {done && tarefa.conclusao && (
              <div className="mt-2 px-2.5 py-1.5 bg-green-50 border border-green-100 rounded-lg text-xs text-green-800">
                <span className="font-semibold">Conclusão:</span> {tarefa.conclusao}
              </div>
            )}

            {/* Caixa de finalização com observação */}
            {finalizarOpen && !done && (
              <div className="mt-3 p-3 bg-green-50/80 border border-green-100 rounded-xl space-y-2 animate-in slide-in-from-top-1 duration-200">
                <p className="text-xs font-semibold text-green-700 flex items-center gap-1">
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  Conclusão de tarefa
                </p>
                <textarea
                  value={obsFinalizacao}
                  onChange={e => setObsFinalizacao(e.target.value)}
                  rows={2}
                  placeholder="Conclusão de tarefa (ex: cliente confirmou pedido, reunião realizada...)"
                  className="w-full text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-300 placeholder:text-gray-400"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleConfirmFinalizar}
                    disabled={completing || !obsFinalizacao.trim()}
                    className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1 whitespace-nowrap"
                  >
                    <CheckCircleIcon className="h-3.5 w-3.5" />
                    {completing ? 'Finalizando...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => { setFinalizarOpen(false); setObsFinalizacao('') }}
                    className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Caixa de reagendamento */}
            {reagendarOpen && !done && (
              <div className="mt-3 p-3 bg-orange-50/80 border border-orange-100 rounded-xl space-y-2 animate-in slide-in-from-top-1 duration-200">
                <p className="text-xs font-semibold text-orange-700 flex items-center gap-1">
                  <ArrowUturnRightIcon className="h-3.5 w-3.5" />
                  Reagendar tarefa
                </p>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Motivo do reagendamento (ex: cliente não atendeu)"
                  className="w-full text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 placeholder:text-gray-400"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={novaData}
                    onChange={e => setNovaData(e.target.value)}
                    onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white cursor-pointer"
                  />
                  <input
                    type="time"
                    value={novaHora}
                    onChange={e => setNovaHora(e.target.value)}
                    onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                    className="w-24 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Rodapé: Finalizar + Ver no Funil + Editar + Excluir */}
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-1.5">
                {/* Quando reagendar está aberto: mostrar Confirmar/Cancelar no lugar dos outros botões */}
                {reagendarOpen && !done ? (
                  <>
                    <button
                      onClick={handleConfirmReagendar}
                      disabled={!motivo.trim() || !novaData}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all hover:shadow-sm active:scale-95"
                    >
                      <ArrowUturnRightIcon className="h-3.5 w-3.5" />
                      Confirmar Reagendamento
                    </button>
                    <button
                      onClick={() => setReagendarOpen(false)}
                      className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    {!done && (
                      <button
                        onClick={handleToggle}
                        disabled={completing}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all hover:shadow-sm active:scale-95 disabled:opacity-50 ${
                          finalizarOpen
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        {completing ? 'Finalizando...' : 'Finalizar Tarefa'}
                      </button>
                    )}
                    {!done && (
                      <button
                        onClick={() => { setReagendarOpen(o => !o); if (finalizarOpen) setFinalizarOpen(false) }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all hover:shadow-sm active:scale-95 bg-white hover:bg-orange-50 text-orange-700 border border-orange-200"
                      >
                        <ArrowUturnRightIcon className="h-3.5 w-3.5" />
                        Reagendar
                      </button>
                    )}
                    {onVerNoFunil && cliente && (
                      <button
                        onClick={() => onVerNoFunil(cliente)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-primary-50 text-primary-700 border border-primary-200 rounded-xl transition-all hover:shadow-sm active:scale-95"
                        title="Ir para este cliente no funil"
                      >
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        Ver Card
                      </button>
                    )}
                  </>
                )}
              </div>
              {!done && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title={expanded ? 'Recolher' : 'Editar tarefa'}
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                {onDeleteTarefa && (
                  <button
                    onClick={() => { if (confirm('Tem certeza que deseja excluir esta tarefa?')) onDeleteTarefa(tarefa) }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Excluir tarefa"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente Calendário ───────────────────────────────────────────────────
interface CalendarioViewProps {
  tarefas: Tarefa[]
  clientes: Cliente[]
  onTarefaClick: (tarefa: Tarefa) => void
  onDateClick: (date: string) => void
}

const CalendarioView: React.FC<CalendarioViewProps> = ({ tarefas, clientes, onTarefaClick, onDateClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Navegação entre meses
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    setSelectedDate(null)
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today.toISOString().split('T')[0])
  }

  // Calcular dias do calendário
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay() // 0 = Domingo

  // Organizar tarefas por data
  const tarefasPorData = useMemo(() => {
    const map: Record<string, Tarefa[]> = {}
    tarefas.forEach(t => {
      if (t.data) {
        if (!map[t.data]) map[t.data] = []
        map[t.data].push(t)
      }
    })
    return map
  }, [tarefas])

  // Nomes dos meses em português
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  // Gerar array de dias para o calendário
  const calendarDays = []
  
  // Dias vazios antes do início do mês
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null)
  }
  
  // Dias do mês
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    calendarDays.push({
      day,
      date: dateStr,
      tarefas: tarefasPorData[dateStr] || [],
      isToday: dateStr === new Date().toISOString().split('T')[0]
    })
  }

  const selectedTarefas = selectedDate ? tarefasPorData[selectedDate] || [] : []

  return (
    <div className="space-y-4">
      {/* Header do Calendário */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900">
              {monthNames[month]} {year}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeftIcon className="h-5 w-5 text-gray-600" />
              </button>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRightIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>
          </div>
          <button
            onClick={goToToday}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Hoje
          </button>
        </div>

        {/* Dias da semana */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Grade do calendário */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((dayInfo, index) => (
            <div key={index} className="aspect-square">
              {dayInfo ? (
                <button
                  onClick={() => {
                    setSelectedDate(dayInfo.date)
                    if (dayInfo.tarefas.length === 0) {
                      onDateClick(dayInfo.date)
                    }
                  }}
                  className={`w-full h-full rounded-xl border transition-all flex flex-col items-start p-2 ${
                    selectedDate === dayInfo.date
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                      : dayInfo.isToday
                        ? 'border-primary-400 bg-primary-50/50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-sm font-semibold ${
                    dayInfo.isToday ? 'text-primary-700' : 'text-gray-700'
                  }`}>
                    {dayInfo.day}
                  </span>
                  
                  {/* Indicadores de tarefas */}
                  {dayInfo.tarefas.length > 0 && (
                    <div className="flex-1 w-full flex flex-col justify-end gap-0.5">
                      <div className="flex gap-0.5 flex-wrap">
                        {dayInfo.tarefas.slice(0, 3).map((t, i) => (
                          <button
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation()
                              onTarefaClick(t)
                            }}
                            className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                              t.prioridade === 'alta' ? 'bg-red-500' :
                              t.prioridade === 'media' ? 'bg-amber-500' :
                              'bg-blue-500'
                            }`}
                          />
                        ))}
                        {dayInfo.tarefas.length > 3 && (
                          <span className="text-[8px] text-gray-500 leading-none">+{dayInfo.tarefas.length - 3}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 truncate w-full text-left">
                        {dayInfo.tarefas.length} tarefa{dayInfo.tarefas.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </button>
              ) : (
                <div className="w-full h-full" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Lista de tarefas do dia selecionado */}
      {selectedDate && selectedTarefas.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Tarefas de {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long' 
              })}
            </h3>
            <button
              onClick={() => onDateClick(selectedDate)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Ver no modo listagem →
            </button>
          </div>
          <div className="space-y-2">
            {selectedTarefas.map(tarefa => {
              const cliente = clientes.find(c => c.id === tarefa.clienteId)
              const cfg = TIPO_CONFIG[tarefa.tipo] || TIPO_CONFIG.outro
              return (
                <button
                  key={tarefa.id}
                  onClick={() => onTarefaClick(tarefa)}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-primary-300 hover:bg-primary-50/50 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{(() => {
                        const titulo = tarefa.titulo
                        if (cliente) { const idx = titulo.lastIndexOf(' - '); if (idx > 0) return titulo.slice(0, idx) }
                        return titulo
                      })()}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        {tarefa.hora && <span>🕐 {tarefa.hora}</span>}
                        {cliente && <span>👤 {cliente.razaoSocial}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          tarefa.prioridade === 'alta' ? 'bg-red-100 text-red-700' :
                          tarefa.prioridade === 'media' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {tarefa.prioridade}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Estado vazio quando não há tarefas no mês */}
      {Object.keys(tarefasPorData).length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <CalendarDaysIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma tarefa neste período</p>
          <p className="text-gray-400 text-sm mt-1">
            Navegue para outro mês ou ajuste os filtros
          </p>
        </div>
      )}
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
  onImportTarefas?: (novas: Omit<Tarefa, 'id'>[]) => Promise<Tarefa[]>
  showToast?: (tipo: 'success' | 'error', texto: string) => void
  onVerNoFunil?: (cliente: Cliente) => void
  onDeleteTarefa?: (tarefa: Tarefa) => void
}> = ({ tarefas, clientes, vendedores, loggedUser, interacoes = [], pedidos = [], onUpdateTarefa, onAddTarefa, onImportTarefas, showToast, onVerNoFunil, onDeleteTarefa }) => {
  const [showModal, setShowModal] = useState(false)
  const [commCliente, setCommCliente] = useState<Cliente | null>(null)
  const [filterStatus, setFilterStatus] = useState<'hoje' | 'todas' | 'concluida'>('hoje')
  // Filtros de data estilo Agendor
  const [dateFilter, setDateFilter] = useState<'todas' | 'semana' | 'hoje' | 'definir'>('hoje')
  const [statusFilter, setStatusFilter] = useState<'pendentes' | 'finalizadas' | 'todos'>('pendentes')
  const [viewMode, setViewMode] = useState<'listagem' | 'calendario'>('listagem')
  // Estado para pesquisa
  const [searchTerm, setSearchTerm] = useState('')
  const [searchTermHistorico, setSearchTermHistorico] = useState('')
  const [dateRange, setDateRange] = useState<{start: string, end: string} | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [waCliente, setWaCliente] = useState<Cliente | null>(null)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [wsCliente, setWsCliente] = useState<Cliente | null>(null)
  const [activeTab, setActiveTab] = useState<'tarefas' | 'historico'>('tarefas')

  const normalizarEmpresa = (s: string) => s.toLowerCase().trim()
    .replace(/\b(ltda|me|epp|eireli|s\.?a\.?|s\/a|cia|comercio|comércio|industria|indústria|distribui(dora|cao|ção)?|com\.?|ind\.?|imp\.?|exp\.?)\b/gi, '')
    .replace(/[.\-\/,()]/g, ' ').replace(/\s+/g, ' ').trim()

  const extrairEmpresaImportada = (tarefa: Tarefa) => {
    const texto = `${tarefa.titulo || ''}\n${tarefa.descricao || ''}`
    const match = texto.match(/\[Empresa:\s*([^\]]+)\]/i)
    if (!match) return { nome: '', codigo: '' }
    const ref = match[1].trim()
    const codigo = ref.match(/(?:código|codigo):?\s*(\d+)/i)?.[1] || (/^\d+$/.test(ref) ? ref : '')
    const nome = ref.replace(/\s*-\s*(?:código|codigo):?\s*\d+\s*$/i, '').replace(/^(?:código|codigo)\s+\d+$/i, '').trim()
    return { nome, codigo }
  }

  const getClienteDaTarefa = (tarefa: Tarefa) => {
    const porId = clientes.find(c => c.id === tarefa.clienteId)
    if (porId) return porId
    const { nome, codigo } = extrairEmpresaImportada(tarefa)
    if (codigo) {
      const porCodigo = clientes.find(c => (c.agendorCodigo || '').trim() === codigo)
      if (porCodigo) return porCodigo
    }
    if (nome) {
      const nomeNorm = normalizarEmpresa(nome)
      return clientes.find(c => {
        const razaoNorm = normalizarEmpresa(c.razaoSocial)
        const fantasiaNorm = c.nomeFantasia ? normalizarEmpresa(c.nomeFantasia) : ''
        return razaoNorm === nomeNorm || fantasiaNorm === nomeNorm ||
          (nomeNorm.length >= 4 && razaoNorm.length >= 4 && (razaoNorm.includes(nomeNorm) || nomeNorm.includes(razaoNorm))) ||
          (nomeNorm.length >= 4 && fantasiaNorm.length >= 4 && (fantasiaNorm.includes(nomeNorm) || nomeNorm.includes(fantasiaNorm)))
      })
    }
    return undefined
  }

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
      `"${(getClienteDaTarefa(t)?.razaoSocial || '').replace(/"/g, '""')}"`,
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
    reader.onload = async (ev) => {
      try {
        let text = ''
        let records: string[][] = []
        const isExcel = /\.xlsx?$/i.test(file.name)

        if (isExcel) {
          const workbook = XLSX.read(ev.target?.result as ArrayBuffer, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          records = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
            .map(row => row.map(value => String(value ?? '')))
        } else {
          text = ev.target?.result as string
        }
        const firstLine = text.split(/\r?\n/)[0] || ''
        if (!isExcel && !firstLine.trim()) { alert('Arquivo vazio'); return }

        // Auto-detect separator a partir do cabeçalho
        const sep = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ','

        // Parser CSV que respeita aspas e campos multi-linha (descrições do Agendor)
        const parseCsv = (raw: string): string[][] => {
          const records: string[][] = []
          let field = '', record: string[] = [], inQuotes = false
          for (let k = 0; k < raw.length; k++) {
            const ch = raw[k]
            if (inQuotes) {
              if (ch === '"') {
                if (raw[k + 1] === '"') { field += '"'; k++ }
                else inQuotes = false
              } else field += ch
            } else if (ch === '"') {
              inQuotes = true
            } else if (ch === sep) {
              record.push(field); field = ''
            } else if (ch === '\n' || ch === '\r') {
              if (ch === '\r' && raw[k + 1] === '\n') k++
              record.push(field); field = ''
              if (record.some(c => c.trim() !== '')) records.push(record)
              record = []
            } else field += ch
          }
          if (field !== '' || record.length > 0) {
            record.push(field)
            if (record.some(c => c.trim() !== '')) records.push(record)
          }
          return records
        }

        if (!isExcel) records = parseCsv(text)
        if (records.length < 2) { alert('Nenhuma tarefa encontrada no arquivo'); return }
        const headers = records[0].map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())

        const getIdx = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)))
        const idxDescricao = getIdx(['descrição', 'descricao', 'description'])
        const idxDataAgendamento = getIdx(['data de agendamento', 'agendamento'])
        const idxTipo = getIdx(['tipo de tarefa', 'tipo'])
        const idxEmpresa = getIdx(['empresa relacionada', 'empresa'])
        const idxCodigoEmpresa = getIdx(['código da empresa', 'codigo da empresa'])
        const idxResponsavel = getIdx(['usuários responsáveis', 'usuarios responsaveis', 'responsáveis', 'responsaveis'])
        const idxDataCadastro = getIdx(['data de cadastro'])
        const idxDataFinalizacao = getIdx(['data de finalização', 'data de finalizacao'])
        const idxUsuarioFinalizou = getIdx(['usuário que finalizou', 'usuario que finalizou'])

        if (idxDescricao === -1) { alert('Coluna "Descrição" não encontrada no CSV'); return }

        // Parse date "DD/MM/AAAA HH:MM:SS" ou "DD/MM/AA" → YYYY-MM-DD (descarta horário)
        const parseDate = (s: string): string => {
          const hoje = new Date().toISOString().split('T')[0]
          if (!s || !s.trim()) return hoje
          const clean = s.trim().replace(/^"|"$/g, '').split(/[\sT]/)[0]
          if (!clean) return hoje
          if (clean.includes('/')) {
            const parts = clean.split('/')
            if (parts.length === 3) {
              let [d, m, y] = parts
              if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y
              const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
              return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : hoje
            }
            return hoje
          }
          if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
          const dt = new Date(clean)
          return isNaN(dt.getTime()) ? hoje : dt.toISOString().split('T')[0]
        }

        // Extrai a hora "HH:MM" de "DD/MM/AAAA HH:MM:SS" (se houver)
        const parseHora = (s: string): string => {
          if (!s) return ''
          const m = s.match(/(\d{1,2}):(\d{2})/)
          return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
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
        const hoje = new Date().toISOString().split('T')[0]
        let semCliente = 0

        for (let i = 1; i < records.length; i++) {
          const vals = records[i].map(v => v.trim().replace(/^"|"$/g, ''))
          const descricao = (vals[idxDescricao] || '').trim()
          if (!descricao) continue

          const dataRaw = idxDataAgendamento >= 0 ? vals[idxDataAgendamento] : (idxDataCadastro >= 0 ? vals[idxDataCadastro] : '')
          const dataAgendamento = parseDate(dataRaw)
          const hora = parseHora(dataRaw)
          const tipoRaw = idxTipo >= 0 ? vals[idxTipo] || '' : ''
          const empresaRaw = idxEmpresa >= 0 ? (vals[idxEmpresa] || '').trim() : ''
          const codigoEmpresaRaw = idxCodigoEmpresa >= 0 ? (vals[idxCodigoEmpresa] || '').trim() : ''
          const responsavelRaw = idxResponsavel >= 0 ? vals[idxResponsavel] || '' : ''

          // Match cliente por Código da Empresa do Agendor (exato); fallback por nome apenas se não houver match por código
          let clienteId: number | undefined
          if (codigoEmpresaRaw) {
            const matchCodigo = clientes.find(c => (c.agendorCodigo || '').trim() === codigoEmpresaRaw)
            if (matchCodigo) clienteId = matchCodigo.id
          }
          if (!clienteId && empresaRaw) {
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
          if (!clienteId) semCliente++

          // Match vendedor by name
          let vendedorId: number | undefined
          if (responsavelRaw) {
            const respLower = responsavelRaw.toLowerCase().trim()
            const vMatch = vendedores.find(v => v.nome.toLowerCase().includes(respLower) || respLower.includes(v.nome.toLowerCase()))
            if (vMatch) vendedorId = vMatch.id
          }
          // Tarefas sem responsável no Agendor ficam visíveis para o usuário atual.
          if (!vendedorId && !isGerente) vendedorId = loggedUser?.id

          // Status pelo CSV: só concluída se tiver Data de finalização ou Usuário que finalizou
          const finalizacaoRaw = idxDataFinalizacao >= 0 ? (vals[idxDataFinalizacao] || '') : ''
          const finalizadorRaw = idxUsuarioFinalizou >= 0 ? (vals[idxUsuarioFinalizou] || '') : ''
          const concluida = !!(finalizacaoRaw.trim() || finalizadorRaw.trim())
          const empresaRef = empresaRaw || (codigoEmpresaRaw ? `Código ${codigoEmpresaRaw}` : '')
          const empresaPrefixo = empresaRaw && codigoEmpresaRaw
            ? `[Empresa: ${empresaRaw} - Código: ${codigoEmpresaRaw}]`
            : empresaRef
              ? `[Empresa: ${empresaRef}]`
              : ''
          // Preservar referência da empresa quando não casou com um cliente
          const descricaoFinal = (!clienteId && empresaPrefixo)
            ? `${empresaPrefixo}\n${descricao}`
            : descricao
          const tituloBase = descricaoFinal.split('\n')[0]

          novasTarefas.push({
            titulo: tituloBase.length > 100 ? tituloBase.substring(0, 100) + '...' : tituloBase,
            descricao: descricaoFinal,
            data: dataAgendamento,
            hora: hora || undefined,
            tipo: mapTipo(tipoRaw),
            status: concluida ? 'concluida' : 'pendente',
            concluidaEm: concluida ? `${dataAgendamento}T12:00:00` : undefined,
            prioridade: 'media',
            clienteId,
            vendedorId,
          })
        }

        if (novasTarefas.length === 0) { alert('Nenhuma tarefa encontrada no CSV'); return }

        const comCliente = novasTarefas.filter(t => t.clienteId).length
        const comVendedor = novasTarefas.filter(t => t.vendedorId).length
        const pendentes = novasTarefas.filter(t => t.status === 'pendente').length
        const concluidas = novasTarefas.length - pendentes

        setImportStatus(`Importando ${novasTarefas.length} tarefas...`)
        const saved = await onImportTarefas(novasTarefas)
        setDateFilter('todas')
        setDateRange(null)
        setStatusFilter('todos')
        setImportStatus(`✅ ${saved.length} de ${novasTarefas.length} tarefas salvas · ${comCliente} com cliente (${semCliente} sem) · ${comVendedor} com vendedor · ${concluidas} concluídas / ${pendentes} pendentes`)
        setTimeout(() => setImportStatus(null), 8000)
      } catch (err) {
        logger.error('Erro ao importar tarefas:', err)
        alert(`Erro ao processar/importar CSV de tarefas: ${err instanceof Error ? err.message : 'verifique o formato.'}`)
        setImportStatus(null)
      }
    }
    if (/\.xlsx?$/i.test(file.name)) reader.readAsArrayBuffer(file)
    else reader.readAsText(file, 'UTF-8')
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
  const [showConcluidas, setShowConcluidas] = useState(true)
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
    tarefas.filter(t => isGerente || t.vendedorId === loggedUser?.id || !t.vendedorId)
  , [tarefas, isGerente, loggedUser?.id])

  // Calcular datas da semana
  const inicioSemana = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const day = d.getDay()
    const diff = d.getDate() - day
    return new Date(d.setDate(diff)).toISOString().split('T')[0]
  }, [hoje])

  const fimSemana = useMemo(() => {
    const d = new Date(inicioSemana)
    d.setDate(d.getDate() + 6)
    return d.toISOString().split('T')[0]
  }, [inicioSemana])

  // Filtros de data estilo Agendor
  const tarefasFiltradas = useMemo(() => {
    let filtered = minhasTarefas

    // Aplicar filtro de pesquisa
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(t => {
        const cliente = getClienteDaTarefa(t)
        const clienteNome = cliente?.razaoSocial.toLowerCase() || ''
        const titulo = t.titulo.toLowerCase()
        const descricao = t.descricao?.toLowerCase() || ''
        const tipo = t.tipo.toLowerCase()
        
        return (
          titulo.includes(searchLower) ||
          descricao.includes(searchLower) ||
          clienteNome.includes(searchLower) ||
          tipo.includes(searchLower)
        )
      })
    }

    // Aplicar filtro de status
    if (statusFilter === 'pendentes') {
      filtered = filtered.filter(t => t.status === 'pendente')
    } else if (statusFilter === 'finalizadas') {
      filtered = filtered.filter(t => t.status === 'concluida')
    }
    // 'todos' não filtra por status

    // Aplicar filtro de data
    if (dateFilter === 'hoje') {
      filtered = filtered.filter(t => t.data === hoje)
    } else if (dateFilter === 'semana') {
      filtered = filtered.filter(t => t.data >= inicioSemana && t.data <= fimSemana)
    } else if (dateFilter === 'definir') {
      filtered = filtered.filter(t => !t.data || t.data === '')
    }
    // 'todas' não filtra por data

    // Aplicar filtro de período customizado
    if (dateRange) {
      filtered = filtered.filter(t => t.data >= dateRange.start && t.data <= dateRange.end)
    }

    return filtered
  }, [minhasTarefas, dateFilter, statusFilter, dateRange, searchTerm, hoje, inicioSemana, fimSemana])

  // Segmentar tarefas filtradas
  const { atrasadas, deHoje, futuras, concluidas } = useMemo(() => {
    const pendentes = tarefasFiltradas.filter(t => t.status === 'pendente')

    const applyTipoFilter = (arr: Tarefa[]) =>
      filterTipo === 'todos' ? arr : arr.filter(t => t.tipo === filterTipo)

    const sortByHora = (arr: Tarefa[]) =>
      [...arr].sort((a, b) => {
        const horaA = a.hora || '23:59'
        const horaB = b.hora || '23:59'
        return horaA.localeCompare(horaB)
      })

    // concluidas sempre de minhasTarefas (ignora statusFilter) — ordenadas por data de conclusão decrescente
    const concBase = minhasTarefas.filter(t => t.status === 'concluida')
    const concFiltradas = dateRange
      ? concBase.filter(t => t.data >= dateRange.start && t.data <= dateRange.end)
      : dateFilter === 'hoje'
        ? concBase.filter(t => t.data === hoje)
        : dateFilter === 'semana'
          ? concBase.filter(t => t.data >= inicioSemana && t.data <= fimSemana)
          : concBase

    return {
      atrasadas: applyTipoFilter(sortByHora(pendentes.filter(t => t.data < hoje))),
      deHoje: applyTipoFilter(sortByHora(pendentes.filter(t => t.data === hoje))),
      futuras: applyTipoFilter(
        pendentes
          .filter(t => t.data > hoje)
          .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''))
      ),
      concluidas: applyTipoFilter(
        [...concFiltradas]
          .sort((a, b) => (b.concluidaEm || b.data).localeCompare(a.concluidaEm || a.data))
          .slice(0, 50)
      ),
    }
  }, [tarefasFiltradas, minhasTarefas, hoje, filterTipo, dateFilter, dateRange, inicioSemana, fimSemana])

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
    const cliente = getClienteDaTarefa(tarefa)
    const vendedor = vendedores.find(v => v.id === tarefa.vendedorId)
    return (
      <TarefaCard
        key={tarefa.id}
        tarefa={tarefa}
        cliente={cliente}
        vendedor={vendedor}
        isGerente={isGerente}
        onToggle={toggleStatus}
        onVerRegraAutomacao={(regraId) => {
          // Redirecionar para página de configuração de tarefas
          window.open(`/configuracao-tarefas?regra=${regraId}`, '_blank')
        }}
        onWhatsApp={(c) => { setWaCliente(c); setShowWhatsApp(true) }}
        onBot={(c) => setCommCliente(c)}
        onEmail={(c) => setCommCliente(c)}
        onCall={(c) => registerCall(c)}
        onUpdateNota={handleUpdateNota}
        onReagendar={handleReagendar}
        isOverdue={overdue}
        isToday={tarefa.data === hoje}
        onVerNoFunil={cliente && onVerNoFunil ? async (c) => {
          if (tarefa.clienteId !== c.id) {
            await onUpdateTarefa({ ...tarefa, clienteId: c.id })
          }
          onVerNoFunil(c)
        } : undefined}
        onDeleteTarefa={isGerente ? onDeleteTarefa : undefined}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
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
                <WhatsAppIcon variant={showWhatsApp ? 'outline' : 'filled'} className="h-5 w-5" />
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
                  <input type="file" accept=".csv,.txt,.xls,.xlsx" className="hidden" onChange={handleImportTarefas} />
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Agendor
                </label>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* ── CONTEÚDO ─────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── ABA HISTÓRICO ─────────────────────────── */}
        {activeTab === 'historico' && (() => {
          // Aplicar filtro de pesquisa no histórico
          let todas = minhasTarefas.filter(t => t.status === 'concluida')
          if (searchTermHistorico.trim()) {
            const searchLower = searchTermHistorico.toLowerCase()
            todas = todas.filter(t => {
              const cliente = getClienteDaTarefa(t)
              const clienteNome = cliente?.razaoSocial.toLowerCase() || ''
              const titulo = t.titulo.toLowerCase()
              const descricao = t.descricao?.toLowerCase() || ''
              const tipo = t.tipo.toLowerCase()
              
              return (
                titulo.includes(searchLower) ||
                descricao.includes(searchLower) ||
                clienteNome.includes(searchLower) ||
                tipo.includes(searchLower)
              )
            })
          }
          todas = todas.sort((a, b) => (b.concluidaEm || b.data).localeCompare(a.concluidaEm || a.data))
          
          const comReagendamento = minhasTarefas.filter(t => t.reagendamentos && t.reagendamentos.length > 0)
          return (
            <>
              {/* Barra de Pesquisa do Histórico */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FunnelIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTermHistorico}
                    onChange={e => setSearchTermHistorico(e.target.value)}
                    placeholder="Pesquisar no histórico por título, descrição, cliente ou tipo..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  {searchTermHistorico && (
                    <button
                      onClick={() => setSearchTermHistorico('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>
              </div>

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
                    const cliente = getClienteDaTarefa(t)
                    const cfg = TIPO_CONFIG[t.tipo] || TIPO_CONFIG.outro
                    return (
                      <div key={t.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{cfg.icon}</span>
                            <span className="font-semibold text-gray-700 text-sm">{(() => { const idx = t.titulo.lastIndexOf(' - '); return cliente && idx > 0 ? t.titulo.slice(0, idx) : t.titulo })()}</span>
                          </div>
                          <span className="flex-shrink-0 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200">✓ Concluída</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                          {cliente && <span>🏢 {cliente.razaoSocial}</span>}
                          <span>🗓️ Prazo: {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')}{t.hora ? ` às ${t.hora}` : ''}</span>
                          {t.concluidaEm && (
                            <span>✅ Executada em {new Date(t.concluidaEm).toLocaleDateString('pt-BR')} às {new Date(t.concluidaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                          {/* Indicador de automação no histórico */}
                          {t.origemAutomacaoId && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full border border-purple-200">
                              <BoltIcon className="h-3 w-3" />
                              Automática
                            </span>
                          )}
                        </div>
                        {t.descricao && (
                          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">📝 {t.descricao}</p>
                        )}
                        {t.conclusao && (
                          <p className="text-xs text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2"><span className="font-semibold">Conclusão:</span> {t.conclusao}</p>
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
            {/* Barra de Pesquisa e Filtros - Estilo Agendor */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
              {/* Barra de Pesquisa */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FunnelIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar por título, descrição, cliente ou tipo..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
              
              {/* Linha 1: Filtros de Data e Status */}
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                {/* Filtros de Data */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Data:</span>
                  <button
                    onClick={() => { setDateFilter('todas'); setDateRange(null) }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      dateFilter === 'todas' && !dateRange
                        ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => { setDateFilter('semana'); setDateRange(null) }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      dateFilter === 'semana' && !dateRange
                        ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Esta Semana
                  </button>
                  <button
                    onClick={() => { setDateFilter('hoje'); setDateRange(null) }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      dateFilter === 'hoje' && !dateRange
                        ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Hoje
                  </button>
                  <button
                    onClick={() => { setDateFilter('definir'); setDateRange(null) }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      dateFilter === 'definir' && !dateRange
                        ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    A Definir
                  </button>
                  
                  {/* Date Range Picker Toggle */}
                  <button
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                      dateRange
                        ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <CalendarDaysIcon className="h-4 w-4" />
                    {dateRange ? `${new Date(dateRange.start).toLocaleDateString('pt-BR')} - ${new Date(dateRange.end).toLocaleDateString('pt-BR')}` : 'Período'}
                  </button>
                  
                  {dateRange && (
                    <button
                      onClick={() => { setDateRange(null); setDateFilter('hoje') }}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                      title="Limpar período"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Filtros de Status */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Status:</span>
                  <button
                    onClick={() => setStatusFilter('todos')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      statusFilter === 'todos'
                        ? 'bg-gray-800 text-white ring-1 ring-gray-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setStatusFilter('pendentes')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      statusFilter === 'pendentes'
                        ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Pendentes
                  </button>
                  <button
                    onClick={() => setStatusFilter('finalizadas')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      statusFilter === 'finalizadas'
                        ? 'bg-green-100 text-green-700 ring-1 ring-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Finalizadas
                  </button>
                </div>
              </div>

              {/* Date Range Picker */}
              {showDatePicker && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">De:</label>
                    <input
                      type="date"
                      value={dateRange?.start || ''}
                      onChange={(e) => setDateRange(prev => ({ start: e.target.value, end: prev?.end || e.target.value }))}
                      onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Até:</label>
                    <input
                      type="date"
                      value={dateRange?.end || ''}
                      onChange={(e) => setDateRange(prev => ({ start: prev?.start || e.target.value, end: e.target.value }))}
                      onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 cursor-pointer"
                    />
                  </div>
                  <button
                    onClick={() => { setDateRange(null); setShowDatePicker(false) }}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
              )}

              {/* Linha 2: Modo de Visualização e Contador */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Visualização:</span>
                  <button
                    onClick={() => setViewMode('listagem')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      viewMode === 'listagem'
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    Listagem
                  </button>
                  <button
                    onClick={() => setViewMode('calendario')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      viewMode === 'calendario'
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <CalendarDaysIcon className="h-4 w-4" />
                    Calendário
                  </button>
                </div>

                {/* Contador de Tarefas */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">
                    <span className="font-semibold text-gray-800">{tarefasFiltradas.length}</span> tarefa{tarefasFiltradas.length !== 1 ? 's' : ''} para
                  </span>
                  <span className="font-medium text-gray-800">{loggedUser?.nome.split(' ')[0] || 'Mim'}</span>
                </div>
              </div>
            </div>

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

        {/* VISUALIZAÇÃO DE CALENDÁRIO */}
        {viewMode === 'calendario' && (
          <CalendarioView 
            tarefas={tarefasFiltradas}
            clientes={clientes}
            onTarefaClick={(tarefa) => {
              // Encontrar e expandir a tarefa no modo listagem
              setViewMode('listagem')
              setDateFilter('todas')
              setTimeout(() => {
                const element = document.getElementById(`tarefa-${tarefa.id}`)
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }, 100)
            }}
            onDateClick={(date) => {
              setDateFilter('todas')
              setDateRange({ start: date, end: date })
              setViewMode('listagem')
            }}
          />
        )}

        {/* VISUALIZAÇÃO DE LISTAGEM */}
        {viewMode === 'listagem' && (
          <>
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

        {/* ZONA 2: HOJE — só exibe se houver tarefas pendentes hoje */}
        {deHoje.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FireIcon className="h-5 w-5 text-orange-500" />
              <h2 className="font-bold text-gray-900">Hoje</h2>
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                {deHoje.length}
              </span>
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
          <div className="space-y-2">
            {deHoje.map(t => renderCard(t, false))}
          </div>
        </section>
        )}

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
        )}
      </>
      )}
      {/* fim activeTab tarefas */}
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
                  <input type="date" value={newData} onChange={(e) => setNewData(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm cursor-pointer" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Hora</label>
                  <input type="time" value={newHora} onChange={(e) => setNewHora(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm cursor-pointer" />
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
