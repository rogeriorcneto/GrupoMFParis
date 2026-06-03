import React, { useState, useRef, useCallback, useEffect } from 'react'
import { XMarkIcon, PencilIcon } from '@heroicons/react/24/outline'
import WhatsAppIcon from './icons/WhatsAppIcon'
import type { Cliente, Interacao, Tarefa, Vendedor, Produto, Pedido, ItemPedido, PropostaHistorico } from '../types'
import { fetchPropostasByCliente, savePropostaHistorico } from '../lib/database'
import { gerarPropostaPDF } from '../utils/pdfGenerator'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { formatCNPJ } from '../utils/validators'
import WhatsAppUserPanel from './WhatsAppUserPanel'
import CallRecorder from './CallRecorder'
import EmailCenterPanel from './EmailCenterPanel'
import { DEFAULT_PAYMENT_TERM, PAYMENT_TERM_GROUPS } from '../constants/paymentTerms'
import { supabase } from '../lib/supabase'
import { transcribeCallRecording } from '../lib/botApi'

interface ClientePanelProps {
  cliente: Cliente
  interacoes: Interacao[]
  tarefas: Tarefa[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  onClose: () => void
  onEditCliente: (c: Cliente) => void
  onMoverCliente: (id: number, toStage: string, extras?: Partial<Cliente>) => void
  onTriggerAmostra: (cliente: Cliente) => void
  onTriggerNegociacao: (cliente: Cliente) => void
  onTriggerPerda: (cliente: Cliente) => void
  setInteracoes: React.Dispatch<React.SetStateAction<Interacao[]>>
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  setTarefas: React.Dispatch<React.SetStateAction<Tarefa[]>>
  addNotificacao: (tipo: 'info' | 'warning' | 'error' | 'success', titulo: string, mensagem: string, clienteId?: number) => void
  produtos?: Produto[]
  pedidos?: Pedido[]
  onAddPedido?: (p: Omit<Pedido, 'id'>) => Promise<void>
  onSolicitarCancelamentoPedido?: (pedidoId: number, motivo: string) => Promise<void>
  /** Redireciona para o Funil já posicionado no card deste cliente. */
  onVerNoFunil?: (c: Cliente) => void
  /** Exclui o cliente (apenas Gestor). Ação irreversível. */
  onExcluirCliente?: (c: Cliente) => void | Promise<void>
  /** Reativa cliente inativo, voltando à etapa anterior (apenas Gestor). */
  onReativarCliente?: (c: Cliente) => void | Promise<void>
}

const STATUS_CLIENTE_BADGE: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-green-100 text-green-700 border-green-200' },
  em_risco: { label: 'Em Risco', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  inativo: { label: 'Inativo', cls: 'bg-gray-200 text-gray-700 border-gray-300' },
  prospecto: { label: 'Prospecto', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  descartado: { label: 'Descartado', cls: 'bg-red-100 text-red-700 border-red-200' },
  bloqueado: { label: 'Bloqueado', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
}

const etapaLabels: Record<string, string> = { 'lead': 'Leads', 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'amostra_perdida': 'Amostra Perdida', 'proposta': 'Proposta', 'negociacao': 'Negociação', 'follow_up': 'Follow-up', 'inativo': 'Clientes Inativos', 'perdido': 'Perdido' }
const etapaCores: Record<string, string> = { 'lead': 'bg-emerald-100 text-emerald-800', 'prospecção': 'bg-sky-100 text-sky-800', 'amostra': 'bg-amber-100 text-amber-800', 'amostra_perdida': 'bg-orange-100 text-orange-800', 'proposta': 'bg-indigo-100 text-indigo-800', 'negociacao': 'bg-purple-100 text-purple-800', 'follow_up': 'bg-blue-100 text-blue-800', 'inativo': 'bg-gray-200 text-gray-700', 'perdido': 'bg-red-100 text-red-800' }
const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
const tipoInteracaoIcon: Record<string, string> = { email: '📧', whatsapp: '💬', ligacao: '📞', reuniao: '🤝', instagram: '📸', linkedin: '💼', nota: '📝' }
const tipoInteracaoLabel: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', ligacao: 'Ligação', reuniao: 'Reunião', instagram: 'Instagram', linkedin: 'LinkedIn', nota: 'Observação' }
const tipoInteracaoCor: Record<string, { bg: string; border: string; dot: string }> = {
  ligacao: { bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500' },
  whatsapp: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  email: { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500' },
  reuniao: { bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-500' },
  instagram: { bg: 'bg-pink-50', border: 'border-pink-200', dot: 'bg-pink-500' },
  linkedin: { bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-500' },
  nota: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
}

function currentTimeHHMM(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function parseNotasEmpresa(notas?: string): { setor: string; info: string } {
  const raw = (notas || '').trim()
  if (!raw) return { setor: '', info: '' }
  const setorMatch = raw.match(/^Setor\s*respons[aá]vel:\s*(.+)$/im)
  const setor = setorMatch?.[1]?.trim() || ''
  const info = raw
    .replace(/^Setor\s*respons[aá]vel:\s*.+$/gim, '')
    .replace(/^Informa[cç][oõ]es\s+adicionais:\s*/gim, '')
    .trim()
  return { setor, info }
}

function composeNotasEmpresa(setor: string, info: string): string {
  const setorLine = setor.trim() ? `Setor responsável: ${setor.trim()}` : ''
  const infoBlock = info.trim() ? `Informações adicionais:\n${info.trim()}` : ''
  return [setorLine, infoBlock].filter(Boolean).join('\n\n').trim()
}

export default function ClientePanel({
  cliente: c, interacoes, tarefas, vendedores, loggedUser,
  onClose, onEditCliente, onMoverCliente,
  onTriggerAmostra, onTriggerNegociacao, onTriggerPerda,
  setInteracoes, setClientes, setTarefas, addNotificacao,
  produtos, pedidos: todosPedidos, onAddPedido, onSolicitarCancelamentoPedido,
  onVerNoFunil, onExcluirCliente, onReativarCliente
}: ClientePanelProps) {
  const isGerente = loggedUser?.cargo === 'gerente'
  const [showVendedorPicker, setShowVendedorPicker] = useState(false)
  const [vendedorSearch, setVendedorSearch] = useState('')
  const [showMaisOpcoesHeader, setShowMaisOpcoesHeader] = useState(false)
  const [showExcluirConfirm, setShowExcluirConfirm] = useState(false)
  const [excluirConfirmText, setExcluirConfirmText] = useState('')
  // Abas do perfil (referência Agendor): Histórico (default) | Negócios
  const [activeTab, setActiveTab] = useState<'historico' | 'negocios'>('historico')
  const notasEmpresa = React.useMemo(() => parseNotasEmpresa(c.notas), [c.notas])
  const [panelAtividadeTipo, setPanelAtividadeTipo] = useState<Interacao['tipo'] | 'proposta' | 'visita' | ''>('')
  const [panelAtividadeDesc, setPanelAtividadeDesc] = useState('')
  const [panelAtividadePrazo, setPanelAtividadePrazo] = useState(new Date().toISOString().split('T')[0])
  const [panelAtividadeHora, setPanelAtividadeHora] = useState(currentTimeHHMM())
  const [panelContatoSetor, setPanelContatoSetor] = useState(notasEmpresa.setor)
  const [panelInfoAdicional, setPanelInfoAdicional] = useState(notasEmpresa.info)
  // Redes sociais estruturadas
  type RedesSociaisMap = Record<string, string>
  const parseRedesSociais = (raw: string): RedesSociaisMap => {
    if (!raw) return {}
    try { const p = JSON.parse(raw); if (typeof p === 'object' && !Array.isArray(p)) return p } catch {}
    return {}
  }
  const [redesSociaisMap, setRedesSociaisMap] = useState<RedesSociaisMap>(() => parseRedesSociais(c.redesSociais || ''))
  const [socialModalOpen, setSocialModalOpen] = useState<string | null>(null)
  const [socialModalValue, setSocialModalValue] = useState('')
  // keep legacy string in sync for other parts that use panelRedesSociais
  const [panelRedesSociais, setPanelRedesSociais] = useState(c.redesSociais || '')
  const [pinnedInteracoes, setPinnedInteracoes] = useState<number[]>([])
  const [panelNovaTarefa, setPanelNovaTarefa] = useState(false)
  const [showAllTarefas, setShowAllTarefas] = useState(false)
  const [panelTarefaTitulo, setPanelTarefaTitulo] = useState('')
  const [panelTarefaData, setPanelTarefaData] = useState(new Date().toISOString().split('T')[0])
  const [panelTarefaHora, setPanelTarefaHora] = useState('')
  const [panelTarefaTipo, setPanelTarefaTipo] = useState<Tarefa['tipo']>('follow-up')
  const [panelTarefaPrioridade, setPanelTarefaPrioridade] = useState<Tarefa['prioridade']>('media')
  const [showCallRecorder, setShowCallRecorder] = useState(false)
  const [showProspeccaoModal, setShowProspeccaoModal] = useState(false)
  const [prospeccaoVendedorId, setProspeccaoVendedorId] = useState<number | ''>('')

  // Pedido rápido state
  const [showPedido, setShowPedido] = useState(false)
  const [pedidoTipo, setPedidoTipo] = useState<'venda' | 'bonificacao'>('venda')
  const [pedidoFrete, setPedidoFrete] = useState<'CIF' | 'FOB' | ''>('')
  const [pedidoItens, setPedidoItens] = useState<ItemPedido[]>([])
  const [pedidoObs, setPedidoObs] = useState('')
  const [pedidoSaving, setPedidoSaving] = useState(false)
  const [pedidoSearch, setPedidoSearch] = useState('')
  const [pedidoFormaPagamento, setPedidoFormaPagamento] = useState(DEFAULT_PAYMENT_TERM)

  // Collapsible sections
  const [showHistorico, setShowHistorico] = useState(true)
  const [expandedHistoricoGroups, setExpandedHistoricoGroups] = useState<Record<string, boolean>>({})
  const [historicoItemCount, setHistoricoItemCount] = useState<Record<string, number>>({})
  const [historicoTab, setHistoricoTab] = useState<'todas' | 'fixadas'>('todas')

  // Editar Proposta
  const [showEditProposta, setShowEditProposta] = useState(false)
  const [ultimaProposta, setUltimaProposta] = useState<PropostaHistorico | null>(null)
  const [editPropostaItens, setEditPropostaItens] = useState<ItemPedido[]>([])
  const [editPropostaFrete, setEditPropostaFrete] = useState<'CIF' | 'FOB' | ''>('')
  const [editPropostaPagamento, setEditPropostaPagamento] = useState(DEFAULT_PAYMENT_TERM)
  const [editPropostaObs, setEditPropostaObs] = useState('')
  const [editPropostaSaving, setEditPropostaSaving] = useState(false)
  const [editPropostaProdSearch, setEditPropostaProdSearch] = useState('')

  // Modal cancelamento de pedido
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelPedidoId, setCancelPedidoId] = useState<number | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)

  // Modal aprovação por item de amostra
  const [showAvaliarAmostra, setShowAvaliarAmostra] = useState(false)
  type AvaliacaoItem = { aprovado: boolean | null; motivo: string }
  const [avaliacaoItens, setAvaliacaoItens] = useState<Record<number, AvaliacaoItem>>({})

  // Gravações de ligação
  const [gravacoes, setGravacoes] = useState<any[]>([])
  const [gravacoesPorData, setGravacoesPorData] = useState<Map<string, any>>(new Map())
  const [transcricoes, setTranscricoes] = useState<Record<number, string>>({})
  const [transcrevendo, setTranscrevendo] = useState<Record<number, boolean>>({})

  // Carregar propostas do cliente
  const [todasPropostas, setTodasPropostas] = useState<PropostaHistorico[]>([])
  const [showPropostasAnteriores, setShowPropostasAnteriores] = useState(false)
  useEffect(() => {
    fetchPropostasByCliente(c.id)
      .then(list => { setUltimaProposta(list[0] || null); setTodasPropostas(list) })
      .catch(() => {})
  }, [c.id])

  useEffect(() => {
    supabase
      .from('gravacoes_chamada')
      .select('*')
      .eq('cliente_id', c.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        setGravacoes(data)
        const map = new Map<string, any>()
        for (const g of data) {
          const dia = (g.created_at || '').split('T')[0]
          if (!map.has(dia)) map.set(dia, g)
        }
        setGravacoesPorData(map)
      })
  }, [c.id])

  const handleTranscrever = useCallback(async (gravacaoId: number) => {
    setTranscrevendo(prev => ({ ...prev, [gravacaoId]: true }))
    try {
      const result = await transcribeCallRecording(gravacaoId)
      if (result.success && result.transcription) {
        setTranscricoes(prev => ({ ...prev, [gravacaoId]: result.transcription! }))
      } else {
        setTranscricoes(prev => ({ ...prev, [gravacaoId]: `Erro: ${result.error || 'Não foi possível transcrever'}` }))
      }
    } catch (err: any) {
      setTranscricoes(prev => ({ ...prev, [gravacaoId]: `Erro: ${err.message}` }))
    } finally {
      setTranscrevendo(prev => ({ ...prev, [gravacaoId]: false }))
    }
  }, [])
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [showEmail, setShowEmail] = useState(false)

  // Refs for scroll-to
  const whatsAppRef = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLDivElement>(null)

  const vendedor = vendedores.find(v => v.id === c.vendedorId)
  const diasNaEtapa = c.dataEntradaEtapa ? Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000) : 0
  const clienteInteracoes = interacoes.filter(i => i.clienteId === c.id).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  const clienteInteracoesOrdenadas = [...clienteInteracoes].sort((a, b) => {
    const aPinned = pinnedInteracoes.includes(a.id)
    const bPinned = pinnedInteracoes.includes(b.id)
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    return new Date(b.data).getTime() - new Date(a.data).getTime()
  })
  const clienteTarefas = tarefas.filter(t => t.clienteId === c.id).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  const enderecoPrincipal = [
    c.enderecoRua,
    c.enderecoNumero,
    c.enderecoComplemento,
    c.enderecoBairro,
    c.enderecoCidade,
    c.enderecoEstado,
    c.enderecoCep ? `CEP ${c.enderecoCep}` : '',
  ].filter(Boolean).join(', ')
  const mapQuery = encodeURIComponent(enderecoPrincipal || c.localizacao || c.endereco || '')

  React.useEffect(() => {
    const raw = localStorage.getItem(`cliente_panel_pins_${c.id}`)
    if (!raw) { setPinnedInteracoes([]); return }
    try {
      const parsed = JSON.parse(raw)
      setPinnedInteracoes(Array.isArray(parsed) ? parsed.filter((v: unknown) => typeof v === 'number') : [])
    } catch {
      setPinnedInteracoes([])
    }
  }, [c.id])

  // Pedido helpers
  const phone = (c.contatoCelular || c.contatoTelefone || '').replace(/\D/g, '')
  const pedidoTotal = pedidoItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
  const filteredProdutos = (produtos || []).filter(p => {
    if (!pedidoSearch.trim()) return true
    const q = pedidoSearch.toLowerCase()
    return p.nome.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
  })

  const handleRegistrarAtividade = async () => {
    if (!panelAtividadeDesc.trim()) return
    const isNota = panelAtividadeTipo === 'nota'
    const semTipo = !panelAtividadeTipo
    // proposta/visita/atividades com tipo precisam de prazo; semTipo usa padrão
    const precisaPrazo = !isNota && !semTipo
    if (precisaPrazo && (!panelAtividadePrazo || !panelAtividadeHora)) return
    // semTipo: garantir prazo com valor padrão
    const prazoFinal = panelAtividadePrazo || new Date().toISOString().split('T')[0]
    const horaFinal = panelAtividadeHora || currentTimeHHMM()
    try {
      // proposta e visita não existem no tipo Interacao — salvar como 'nota' mas ainda gerar tarefa
      const tiposExtraComoNota = ['proposta', 'visita']
      const isExtra = tiposExtraComoNota.includes(panelAtividadeTipo as string)
      const tipoInteracao = (isExtra ? 'nota' : (panelAtividadeTipo || 'nota')) as Interacao['tipo']
      const labelAtividade = panelAtividadeTipo === 'proposta' ? 'Proposta'
        : panelAtividadeTipo === 'visita' ? 'Visita'
        : tipoInteracaoLabel[panelAtividadeTipo] || panelAtividadeTipo || 'Atividade'
      const savedI = await db.insertInteracao({
        clienteId: c.id, tipo: tipoInteracao, data: new Date().toISOString(),
        assunto: `${labelAtividade} - ${c.razaoSocial}`,
        descricao: panelAtividadeDesc.trim(), automatico: false
      })
      setInteracoes(prev => [savedI, ...prev])

      if (!isNota) {
        const tipoFinal = tipoInteracao
        const tarefaTipo: Tarefa['tipo'] =
          tipoFinal === 'email' || tipoFinal === 'whatsapp' || tipoFinal === 'ligacao' || tipoFinal === 'reuniao'
            ? tipoFinal
            : 'outro'
        const savedT = await db.insertTarefa({
          titulo: `Retorno: ${labelAtividade} - ${c.razaoSocial}`,
          descricao: panelAtividadeDesc.trim(),
          data: prazoFinal,
          hora: horaFinal,
          tipo: tarefaTipo,
          status: 'pendente',
          prioridade: 'media',
          clienteId: c.id,
          vendedorId: c.vendedorId || loggedUser?.id,
        })
        setTarefas(prev => [savedT, ...prev])
      }

      const hoje = new Date().toISOString().split('T')[0]
      await db.updateCliente(c.id, { ultimaInteracao: hoje })
      setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, ultimaInteracao: hoje } : cl))
    } catch (err) { logger.error('Erro ao registrar atividade:', err) }
    const labelFinal = panelAtividadeTipo === 'proposta' ? 'Proposta'
      : panelAtividadeTipo === 'visita' ? 'Visita'
      : tipoInteracaoLabel[panelAtividadeTipo] || 'Atividade'
    const msg = isNota
      ? `Nota salva para ${c.razaoSocial}`
      : `${labelFinal}: ${c.razaoSocial} (prazo ${new Date(panelAtividadePrazo).toLocaleDateString('pt-BR')} às ${panelAtividadeHora})`
    addNotificacao('success', 'Atividade registrada', msg, c.id)
    setPanelAtividadeTipo('')
    setPanelAtividadeDesc('')
  }

  const REDES_CONFIG: { key: string; label: string; placeholder: string; icon: React.ReactNode; activeColor: string }[] = [
    { key: 'facebook',  label: 'Facebook',  placeholder: 'facebook.com/suapagina',  activeColor: 'text-blue-600',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
    { key: 'instagram', label: 'Instagram', placeholder: 'instagram.com/suapagina', activeColor: 'text-pink-600',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> },
    { key: 'linkedin',  label: 'LinkedIn',  placeholder: 'linkedin.com/in/seuperfil', activeColor: 'text-sky-600',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
    { key: 'twitter',   label: 'X / Twitter', placeholder: 'x.com/seuperfil',     activeColor: 'text-gray-800',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.213 5.567zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
    { key: 'tiktok',    label: 'TikTok',    placeholder: 'tiktok.com/@seuperfil',   activeColor: 'text-gray-900',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg> },
    { key: 'youtube',   label: 'YouTube',   placeholder: 'youtube.com/@seucanal',   activeColor: 'text-red-600',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
    { key: 'site',      label: 'Site',      placeholder: 'www.seusite.com.br',      activeColor: 'text-emerald-600',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg> },
  ]

  const handleSalvarRedesSociais = async (key: string, value: string) => {
    const next = { ...redesSociaisMap }
    if (value.trim()) next[key] = value.trim()
    else delete next[key]
    const jsonStr = Object.keys(next).length > 0 ? JSON.stringify(next) : ''
    setRedesSociaisMap(next)
    setPanelRedesSociais(jsonStr)
    setSocialModalOpen(null)
    try {
      await db.updateCliente(c.id, { redesSociais: jsonStr || undefined })
      setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, redesSociais: jsonStr || undefined } : cl))
    } catch (err) { logger.error('Erro ao salvar rede social:', err) }
  }

  const handleSalvarDadosEmpresa = async () => {
    const notas = composeNotasEmpresa(panelContatoSetor, panelInfoAdicional)
    const jsonStr = Object.keys(redesSociaisMap).length > 0 ? JSON.stringify(redesSociaisMap) : ''
    try {
      await db.updateCliente(c.id, {
        redesSociais: jsonStr || undefined,
        notas: notas || undefined,
      })
      setClientes(prev => prev.map(cl => cl.id === c.id ? {
        ...cl,
        redesSociais: jsonStr || undefined,
        notas: notas || undefined,
      } : cl))
      addNotificacao('success', 'Dados atualizados', `Informações de ${c.razaoSocial} atualizadas.`, c.id)
    } catch (err) { logger.error('Erro ao salvar nota:', err) }
  }

  const handleTogglePinInteracao = (interacaoId: number) => {
    setPinnedInteracoes(prev => {
      const next = prev.includes(interacaoId) ? prev.filter(id => id !== interacaoId) : [interacaoId, ...prev]
      localStorage.setItem(`cliente_panel_pins_${c.id}`, JSON.stringify(next))
      return next
    })
  }

  const handleCriarTarefa = async () => {
    if (!panelTarefaTitulo.trim() || !panelTarefaData || !panelTarefaHora) return
    try {
      const saved = await db.insertTarefa({
        titulo: panelTarefaTitulo.trim(), data: panelTarefaData,
        hora: panelTarefaHora,
        tipo: panelTarefaTipo, status: 'pendente', prioridade: panelTarefaPrioridade, clienteId: c.id, vendedorId: c.vendedorId || loggedUser?.id
      })
      setTarefas(prev => [saved, ...prev])
    } catch (err) { logger.error('Erro ao criar tarefa:', err) }
    setPanelTarefaTitulo('')
    setPanelNovaTarefa(false)
    addNotificacao('success', 'Tarefa criada', `${panelTarefaTitulo.trim()} - ${c.razaoSocial}`, c.id)
  }

  const handleEnviarPedido = async () => {
    if (!onAddPedido || pedidoItens.length === 0 || !pedidoFrete) return
    if (pedidoTipo === 'venda' && pedidoItens.some(i => i.preco <= 0)) {
      addNotificacao('warning', 'Preço obrigatório', 'Defina o preço unitário de todos os itens para venda.', c.id)
      return
    }
    if (pedidoTipo === 'venda' && pedidoTotal <= 0) {
      addNotificacao('warning', 'Valor inválido', 'O total da venda deve ser maior que zero.', c.id)
      return
    }
    setPedidoSaving(true)
    try {
      const numero = `PED-${Date.now().toString().slice(-6)}`
      await onAddPedido({
        numero, clienteId: c.id, vendedorId: loggedUser?.id || 0,
        itens: pedidoItens, observacoes: pedidoObs.trim(), status: 'enviado',
        dataCriacao: new Date().toISOString(), dataEnvio: new Date().toISOString(),
        totalValor: pedidoTotal, tipo: pedidoTipo, formaPagamento: pedidoFormaPagamento, tipoFrete: pedidoFrete || undefined,
      })
      addNotificacao('success', 'Pedido enviado', `Pedido ${numero} — ${pedidoTipo === 'venda' ? `R$ ${pedidoTotal.toFixed(2)}` : 'Amostra sem valor'}`, c.id)
      setPedidoItens([]); setPedidoObs(''); setPedidoFrete(''); setPedidoTipo('venda'); setPedidoFormaPagamento(DEFAULT_PAYMENT_TERM); setShowPedido(false)
    } catch { addNotificacao('error', 'Erro', 'Falha ao enviar pedido', c.id) }
    setPedidoSaving(false)
  }

  const setPedidoItemQtd = (produto: Produto, qtd: number) => {
    if (qtd <= 0) { setPedidoItens(prev => prev.filter(i => i.produtoId !== produto.id)); return }
    setPedidoItens(prev => {
      const exists = prev.find(i => i.produtoId === produto.id)
      if (exists) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: qtd } : i)
      return [...prev, { produtoId: produto.id, nomeProduto: produto.nome, sku: produto.omieCodigo || produto.sku || '', preco: 0, unidade: produto.unidade, quantidade: qtd }]
    })
  }

  const setPedidoItemPreco = (produtoId: number, preco: number) => {
    const precoSeguro = Number.isFinite(preco) ? Math.max(0, preco) : 0
    setPedidoItens(prev => prev.map(i => i.produtoId === produtoId ? { ...i, preco: precoSeguro } : i))
  }

  React.useEffect(() => {
    if (pedidoTipo === 'bonificacao') {
      setPedidoItens(prev => prev.map(i => ({ ...i, preco: 0 })))
    }
  }, [pedidoTipo])

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black bg-opacity-30" onClick={onClose} />
      <div className="relative w-full sm:max-w-[95vw] lg:max-w-[80vw] xl:max-w-[75vw] bg-white shadow-2xl rounded-none sm:rounded-2xl overflow-hidden animate-slide-in-right sm:my-2 sm:mr-2">
        {/* Header — Perfil do Cliente (referência: Agendor) */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 truncate">{c.razaoSocial}</h2>
              {/* Tag Status do Cliente */}
              {(() => {
                const statusKey = c.statusCliente || (c.etapa === 'inativo' ? 'inativo' : 'prospecto')
                const stb = STATUS_CLIENTE_BADGE[statusKey] || STATUS_CLIENTE_BADGE.prospecto
                return <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${stb.cls}`}>{stb.label}</span>
              })()}
              {/* Data Última Compra */}
              {c.dataUltimoPedido && (
                <span className="text-[11px] text-gray-500">
                  🛒 Última compra: <strong className="text-gray-700">{new Date(c.dataUltimoPedido).toLocaleDateString('pt-BR')}</strong>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${etapaCores[c.etapa] || 'bg-gray-100 text-gray-800'}`}>{etapaLabels[c.etapa] || c.etapa}</span>
              <span className="text-xs text-gray-500">Há {diasNaEtapa}d nesta etapa</span>
              {(() => {
                const vend = vendedores.find(v => v.id === c.vendedorId)
                return (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowVendedorPicker(v => !v); setVendedorSearch('') }}
                      className="group text-xs text-gray-600 inline-flex items-center gap-1 hover:text-primary-700 transition-colors"
                      title="Alterar responsável"
                    >
                      {vend && <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center">{vend.nome.charAt(0)}</span>}
                      <span>{vend ? vend.nome.split(' ')[0] : 'Sem responsável'}</span>
                      <PencilIcon className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    {showVendedorPicker && (
                      <div className="absolute left-0 top-7 z-50 bg-white border border-gray-200 rounded-apple shadow-apple-lg min-w-[200px]">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Pesquisar..."
                            value={vendedorSearch}
                            onChange={e => setVendedorSearch(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-400"
                          />
                        </div>
                        <div className="py-1 max-h-48 overflow-y-auto">
                        {vendedores.filter(v => v.ativo && (!vendedorSearch.trim() || v.nome.toLowerCase().includes(vendedorSearch.toLowerCase()))).map(v => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={async () => {
                              setShowVendedorPicker(false)
                              await db.updateCliente(c.id, { vendedorId: v.id })
                              setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, vendedorId: v.id } : cl))
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-primary-50 transition-colors ${ c.vendedorId === v.id ? 'font-semibold text-primary-700' : 'text-gray-700' }`}
                          >
                            <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{v.nome.charAt(0)}</span>
                            {v.nome}
                          </button>
                        ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
              {c.score !== undefined && <span className="text-xs font-bold text-gray-600 ml-auto">Score: {c.score}</span>}
            </div>
          </div>

          {/* Ações no canto direito do header */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Atalhos rápidos: Ligação | WhatsApp | E-mail */}
            {(() => {
              const fone = (c.contatoCelular || c.contatoTelefone || c.whatsapp || '').replace(/\D/g, '')
              return (
                <div className="hidden md:flex items-center gap-1">
                  {fone && (
                    <a
                      href={`tel:+55${fone}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-apple bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                      title="Ligar"
                    >📞</a>
                  )}
                  {fone && (
                    <button
                      type="button"
                      onClick={() => setShowWhatsApp(true)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-apple bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                      title="WhatsApp"
                    ><WhatsAppIcon variant="outline" className="h-4 w-4" /></button>
                  )}
                  {c.contatoEmail && (
                    <button
                      type="button"
                      onClick={() => { setShowEmail(true); setTimeout(() => emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-apple bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                      title="E-mail"
                    >📧</button>
                  )}
                </div>
              )
            })()}
            {/* VER NO FUNIL */}
            {onVerNoFunil && (
              <button
                onClick={() => { onVerNoFunil(c); onClose() }}
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200 rounded-apple hover:bg-primary-100 transition-colors"
                title="Abrir o card deste cliente no Funil"
              >
                🎯 Ver no Funil
              </button>
            )}
            {/* Menu Mais Opções */}
            <div className="relative">
              <button
                onClick={() => setShowMaisOpcoesHeader(v => !v)}
                className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-apple hover:bg-gray-50"
                title="Mais opções"
              >
                Mais opções ▾
              </button>
              {showMaisOpcoesHeader && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMaisOpcoesHeader(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-apple shadow-lg border border-gray-200 z-40 py-1">
                    <button
                      onClick={() => { setShowMaisOpcoesHeader(false); onEditCliente(c); onClose() }}
                      className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left flex items-center gap-2"
                    >
                      ✏️ Editar Empresa
                    </button>
                    {onVerNoFunil && (
                      <button
                        onClick={() => { setShowMaisOpcoesHeader(false); onVerNoFunil(c); onClose() }}
                        className="sm:hidden w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left flex items-center gap-2"
                      >
                        🎯 Ver no Funil
                      </button>
                    )}
                    {isGerente && (
                      <button
                        onClick={() => {
                          setShowMaisOpcoesHeader(false)
                          // Exporta histórico/timeline em CSV (Excel-compatível).
                          const linhas: string[] = []
                          linhas.push(['data', 'tipo', 'assunto', 'descricao', 'automatico'].join(';'))
                          const interCliente = interacoes.filter(i => i.clienteId === c.id).sort((a, b) => (b.data || '').localeCompare(a.data || ''))
                          for (const i of interCliente) {
                            linhas.push([
                              new Date(i.data).toLocaleString('pt-BR'),
                              i.tipo,
                              `"${(i.assunto || '').replace(/"/g, '""')}"`,
                              `"${(i.descricao || '').replace(/"/g, '""')}"`,
                              i.automatico ? 'sim' : 'não',
                            ].join(';'))
                          }
                          const tarefasCli = tarefas.filter(t => t.clienteId === c.id)
                          for (const t of tarefasCli) {
                            linhas.push([
                              `${t.data}${t.hora ? ' ' + t.hora : ''}`,
                              `tarefa-${t.tipo}`,
                              `"${(t.titulo || '').replace(/"/g, '""')}"`,
                              `"${(t.descricao || '').replace(/"/g, '""')} [status: ${t.status}]"`,
                              'não',
                            ].join(';'))
                          }
                          const csv = '\uFEFF' + linhas.join('\n')
                          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `historico_${(c.razaoSocial || 'cliente').replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                        className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left flex items-center gap-2"
                      >
                        📥 Exportar Histórico
                        <span className="ml-auto text-[9px] text-gray-400 font-medium">GESTOR</span>
                      </button>
                    )}
                    {isGerente && c.etapa === 'inativo' && onReativarCliente && (
                      <button
                        onClick={() => {
                          setShowMaisOpcoesHeader(false)
                          if (confirm('Reativar este cliente? Ele voltará à etapa anterior.')) {
                            onReativarCliente(c)
                            onClose()
                          }
                        }}
                        className="w-full px-3 py-2 text-sm text-green-700 hover:bg-green-50 text-left flex items-center gap-2"
                      >
                        ♻️ Reativar Cliente
                        <span className="ml-auto text-[9px] text-gray-400 font-medium">GESTOR</span>
                      </button>
                    )}
                    {isGerente && onExcluirCliente && (
                      <>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          onClick={() => { setShowMaisOpcoesHeader(false); setExcluirConfirmText(''); setShowExcluirConfirm(true) }}
                          className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left flex items-center gap-2"
                        >
                          🗑️ Excluir Empresa
                          <span className="ml-auto text-[9px] text-gray-400 font-medium">GESTOR</span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-apple"><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 h-[calc(100dvh-84px)] sm:h-[calc(100%-84px)] overflow-y-auto lg:overflow-hidden">
          <div className="lg:h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="space-y-4 lg:col-span-5 xl:col-span-4 lg:overflow-y-auto lg:pr-1">

          {/* === AÇÕES RÁPIDAS === */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">⚡ Ações Rápidas</h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => {
                  if (!ultimaProposta) return
                  setEditPropostaItens(ultimaProposta.itens.map(i => ({ ...i })))
                  setEditPropostaFrete((ultimaProposta.frete as 'CIF' | 'FOB' | '') || '')
                  setEditPropostaPagamento(ultimaProposta.pagamento || DEFAULT_PAYMENT_TERM)
                  setEditPropostaObs(ultimaProposta.observacoes || '')
                  setShowEditProposta(true)
                }}
                disabled={!ultimaProposta}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-apple hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title={ultimaProposta ? `Editar proposta ${ultimaProposta.numero}` : 'Nenhuma proposta gerada ainda'}
              >
                📝 Editar Proposta
              </button>
              {todasPropostas.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowPropostasAnteriores(v => !v)}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 rounded-apple hover:bg-gray-100"
                    title="Ver histórico de propostas"
                  >
                    📋 Anteriores ({todasPropostas.length - 1})
                  </button>
                  {showPropostasAnteriores && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[260px] max-h-72 overflow-y-auto">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-[11px] font-semibold text-gray-700">Histórico de Propostas</p>
                      </div>
                      {todasPropostas.map((p, i) => (
                        <div key={p.id} className={`flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 ${i === 0 ? 'bg-indigo-50' : ''}`}>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-gray-800 truncate">{p.numero} {i === 0 ? <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1 rounded">atual</span> : ''}</p>
                            <p className="text-[10px] text-gray-500">{new Date(p.criadoEm).toLocaleDateString('pt-BR')} · R$ {p.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            {p.pagamento && <p className="text-[9px] text-gray-400">{p.pagamento}</p>}
                          </div>
                          <button
                            onClick={() => gerarPropostaPDF(c, p.itens, p.observacoes, p.vendedorNome, p.numero, { tipoFrete: (p.frete as 'CIF' | 'FOB' | '') || '', formaPagamento: p.pagamento })}
                            className="flex-shrink-0 px-2 py-1 text-[10px] bg-indigo-600 text-white rounded hover:bg-indigo-700"
                            title="Baixar PDF"
                          >
                            📄 PDF
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {c.etapa === 'prospecção' && (
                <>
                  <button onClick={() => { onTriggerAmostra(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded-apple hover:bg-yellow-700">📦 Enviar Amostra</button>
                  <button onClick={() => { onMoverCliente(c.id, 'proposta', { etapaAnterior: 'prospecção', dataEntradaEtapa: new Date().toISOString() }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-apple hover:bg-indigo-700">📋 Ir para Proposta</button>
                </>
              )}
              {c.etapa === 'amostra' && (
                <>
                  {c.statusAmostra === 'entregue' && (
                    <>
                      <button
                        onClick={() => {
                          const pedidoAmostra = (todosPedidos || []).find(p => p.clienteId === c.id && p.tipo === 'bonificacao')
                          const initMap: Record<number, AvaliacaoItem> = {}
                          ;(pedidoAmostra?.itens || []).forEach((_, idx) => { initMap[idx] = { aprovado: null, motivo: '' } })
                          setAvaliacaoItens(initMap)
                          setShowAvaliarAmostra(true)
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700"
                      >🧪 Avaliar Itens</button>
                    </>
                  )}
                  {!['aprovada', 'reprovada', 'faturado', 'expedido', 'entregue'].includes(c.statusAmostra || '') && (
                    <button onClick={() => { if (confirm(`Cancelar envio de amostra para ${c.razaoSocial}?`)) { onMoverCliente(c.id, 'prospecção', { statusAmostra: undefined, dataEnvioAmostra: undefined, resultadoAmostra: undefined, dataResultadoAmostra: undefined }); onClose() } }} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-apple hover:bg-red-100">❌ Cancelar Envio</button>
                  )}
                </>
              )}
              {c.etapa === 'amostra_perdida' && (
                <button onClick={() => { if (confirm(`Cancelar envio de amostra para ${c.razaoSocial}?`)) { onMoverCliente(c.id, 'prospecção', { statusAmostra: undefined, dataEnvioAmostra: undefined, resultadoAmostra: undefined, dataResultadoAmostra: undefined }); onClose() } }} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-apple hover:bg-red-100">🚫 Cancelar Envio</button>
              )}
              {c.etapa === 'proposta' && (
                <>
                  <button onClick={() => { onTriggerAmostra(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-apple hover:bg-amber-700">📦 Enviar Amostra</button>
                  <button onClick={() => { onTriggerNegociacao(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-apple hover:bg-purple-700">💰 Negociar</button>
                </>
              )}
              {c.etapa === 'negociacao' && (
                <>
                  <button
                    onClick={async () => {
                      alert('DEBUG: Botão Ganhou clicado!')
                      console.log('[DEBUG Ganhou] Clicked!')
                      const hoje = new Date().toISOString().split('T')[0]
                      console.log('[DEBUG Ganhou] onAddPedido:', onAddPedido)
                      console.log('[DEBUG Ganhou] ultimaProposta:', ultimaProposta)
                      console.log('[DEBUG Ganhou] ultimaProposta?.itens:', ultimaProposta?.itens)
                      if (onAddPedido && ultimaProposta && ultimaProposta.itens.length > 0) {
                        console.log('[DEBUG Ganhou] Criando pedido...')
                        try {
                          const numero = `PED-${Date.now().toString().slice(-6)}`
                          await onAddPedido({
                            numero,
                            clienteId: c.id,
                            vendedorId: loggedUser?.id || 0,
                            itens: ultimaProposta.itens,
                            observacoes: ultimaProposta.observacoes || '',
                            status: 'enviado',
                            dataCriacao: new Date().toISOString(),
                            dataEnvio: new Date().toISOString(),
                            totalValor: ultimaProposta.totalValor,
                            tipo: 'venda',
                            formaPagamento: ultimaProposta.pagamento || DEFAULT_PAYMENT_TERM,
                            tipoFrete: (ultimaProposta.frete as 'CIF' | 'FOB') || undefined,
                          })
                          addNotificacao('success', 'Pedido enviado para aprovação', `Pedido ${numero} — R$ ${ultimaProposta.totalValor.toLocaleString('pt-BR')} aguardando aprovação do gerente`, c.id)
                        } catch (err) {
                          console.error('[DEBUG Ganhou] Erro ao criar pedido:', err)
                          addNotificacao('error', 'Erro', 'Falha ao criar pedido de aprovação', c.id)
                        }
                      } else {
                        console.log('[DEBUG Ganhou] Sem proposta ou itens, mostrando notificacao')
                        addNotificacao('info', 'Sem proposta', 'Crie uma proposta com itens antes de marcar como Ganhou', c.id)
                      }
                      console.log('[DEBUG Ganhou] Movendo cliente...')
                      onMoverCliente(c.id, 'negociacao', { statusFollowUp: 'aguardando_aprovacao_gerente', dataUltimoPedido: hoje })
                      console.log('[DEBUG Ganhou] Fechando panel...')
                      onClose()
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700"
                  >
                    🎉 Ganhou
                  </button>
                  <button onClick={() => { onMoverCliente(c.id, 'proposta', {}); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-apple hover:bg-gray-300">↩ Voltou p/ Proposta</button>
                </>
              )}
              {c.etapa === 'follow_up' && (() => {
                const pedidoCancelavel = (todosPedidos || []).find(p => p.clienteId === c.id && (p.status === 'confirmado' || p.status === 'enviado') && !['faturado', 'expedido', 'entregue'].includes(p.omieStatus || ''))
                if (!pedidoCancelavel) return null
                const jaSolicitado = pedidoCancelavel.status === 'cancelamento_solicitado'
                return (
                  <button
                    onClick={() => {
                      if (jaSolicitado) return
                      setCancelPedidoId(pedidoCancelavel.id)
                      setCancelMotivo('')
                      setShowCancelModal(true)
                    }}
                    disabled={jaSolicitado}
                    className={`px-3 py-1.5 text-xs font-medium rounded-apple border ${
                      jaSolicitado
                        ? 'bg-orange-50 text-orange-600 border-orange-200 cursor-not-allowed opacity-70'
                        : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    }`}
                    title={jaSolicitado ? 'Cancelamento já solicitado — aguardando aprovação do gerente' : 'Solicitar cancelamento do pedido (requer aprovação do gerente)'}
                  >
                    {jaSolicitado ? '⏳ Cancelamento Solicitado' : '🚫 Cancelar Pedido'}
                  </button>
                )
              })()}
              {['negociacao', 'follow_up', 'inativo'].includes(c.etapa) && (
                <button onClick={() => { onTriggerPerda(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-apple hover:bg-red-100">❌ Perdido</button>
              )}
              {c.etapa === 'lead' && !showProspeccaoModal && (
                <button
                  onClick={() => {
                    setProspeccaoVendedorId(c.vendedorId || loggedUser?.id || '')
                    setShowProspeccaoModal(true)
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-sky-600 text-white rounded-apple hover:bg-sky-700"
                >
                  🔎 Enviar para Prospecção
                </button>
              )}
              {c.etapa === 'lead' && showProspeccaoModal && (
                <div className="w-full mt-1 p-3 bg-sky-50 border border-sky-200 rounded-xl space-y-2" onClick={e => e.stopPropagation()}>
                  <p className="text-xs font-bold text-sky-800">🔎 Designar responsável pela prospecção</p>
                  <select
                    value={prospeccaoVendedorId}
                    onChange={e => setProspeccaoVendedorId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-sky-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                    autoFocus
                  >
                    <option value="">— Selecionar vendedor —</option>
                    {vendedores.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.nome}{v.id === loggedUser?.id ? ' (você)' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowProspeccaoModal(false)}
                      className="flex-1 py-1.5 text-xs font-medium bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={prospeccaoVendedorId === ''}
                      onClick={() => {
                        if (prospeccaoVendedorId === '') return
                        onMoverCliente(c.id, 'prospecção', { vendedorId: prospeccaoVendedorId as number })
                        onClose()
                      }}
                      className="flex-1 py-1.5 text-xs font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
                    >
                      ✅ Confirmar
                    </button>
                  </div>
                </div>
              )}
              {c.etapa === 'amostra_perdida' && (c.tentativaAmostra || 0) < 2 && (
                <button onClick={() => { onTriggerAmostra(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-apple hover:bg-amber-700">🔄 2ª Tentativa Amostra</button>
              )}
              {c.etapa === 'inativo' && (
                <button onClick={() => { onMoverCliente(c.id, 'prospecção', { motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-apple hover:bg-blue-700">🔄 Reativar</button>
              )}
            </div>
          </div>

          {/* === CONTATO === */}
          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">🏢 Dados básicos da empresa</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-xs text-gray-500">Razão social</p><p className="font-medium text-gray-900">{c.razaoSocial}</p></div>
              <div><p className="text-xs text-gray-500">CNPJ</p><p className="font-medium text-gray-900">{formatCNPJ(c.cnpj || '') || '-'}</p></div>
              <div><p className="text-xs text-gray-500">Nome fantasia</p><p className="font-medium text-gray-900">{c.nomeFantasia || '-'}</p></div>
              <div><p className="text-xs text-gray-500">Segmento</p><p className="font-medium text-gray-900">{c.segmento || '-'}</p></div>
            </div>
          </div>

          {/* === CONTATO E LOCALIZAÇÃO === */}
          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">📇 Informações para contato</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-xs text-gray-500">Pessoa responsável</p><p className="font-medium text-gray-900">{c.contatoNome || '-'}</p></div>
              <div>
                <p className="text-xs text-gray-500">Setor</p>
                <select value={panelContatoSetor} onChange={(e) => setPanelContatoSetor(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  <option value="">Selecionar...</option>
                  <option value="compras">Compras</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="diretoria">Diretoria</option>
                  <option value="marketing">Marketing</option>
                  <option value="qualidade">Qualidade</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div><p className="text-xs text-gray-500">Telefone</p>
                {(c.contatoTelefone || c.contatoCelular) ? (
                  <button onClick={() => setShowCallRecorder(true)} className="font-medium text-orange-600 hover:text-orange-700 hover:underline cursor-pointer flex items-center gap-1" title="Ligar com gravação">
                    📞 {c.contatoCelular || c.contatoTelefone}
                  </button>
                ) : (
                  <p className="font-medium text-gray-900">{c.contatoTelefone || '-'}</p>
                )}
              </div>
              <div><p className="text-xs text-gray-500">Email</p><p className="font-medium text-gray-900 truncate">{c.contatoEmail}</p></div>
              <div><p className="text-xs text-gray-500">WhatsApp</p><p className="font-medium text-gray-900">{c.whatsapp || c.contatoCelular || c.contatoTelefone || '-'}</p></div>
              <div><p className="text-xs text-gray-500">Site</p><p className="font-medium text-gray-900 truncate">{c.localizacao || '-'}</p></div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Endereço</p>
              <p className="text-sm text-gray-900">{enderecoPrincipal || c.endereco || c.localizacao || 'Não informado'}</p>
            </div>
            {mapQuery && (
              <div className="rounded-apple border border-gray-200 overflow-hidden">
                <iframe
                  title={`Mapa ${c.razaoSocial}`}
                  src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                  className="w-full h-44"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
            {c.cnpj2 && (
              <div><p className="text-xs text-gray-500">CNPJ 2</p><p className="font-medium text-gray-900">{formatCNPJ(c.cnpj2)}</p></div>
            )}
            {c.enderecoRua2 && (
              <div>
                <p className="text-xs text-gray-500">Endereço 2</p>
                <p className="text-sm text-gray-900">
                  {[c.enderecoRua2, c.enderecoNumero2, c.enderecoComplemento2, c.enderecoBairro2, c.enderecoCidade2, c.enderecoEstado2, c.enderecoCep2 ? `CEP ${c.enderecoCep2}` : '']
                    .filter(Boolean).join(', ')}
                </p>
              </div>
            )}

          </div>

          {/* === PRODUTOS HOMOLOGADOS === */}
          {(() => {
            const pedidosCliente = (todosPedidos || []).filter(p => p.clienteId === c.id)
            const statusAprovados = new Set(['confirmado', 'faturado', 'expedido', 'entregue'])
            const nomesHomologados = new Set<string>()
            for (const p of pedidosCliente) {
              const isAmostraAprovada = p.tipo === 'bonificacao' && c.resultadoAmostra === 'aprovada'
              const isVendaConfirmada = p.tipo !== 'bonificacao' && statusAprovados.has(p.status)
              if (isAmostraAprovada || isVendaConfirmada) {
                for (const item of (p.itens || [])) {
                  if (item.nomeProduto) nomesHomologados.add(item.nomeProduto)
                }
              }
            }
            const lista = Array.from(nomesHomologados)
            return (
              <div className="bg-green-50 rounded-apple border border-green-200 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-green-900">✅ Produtos Homologados</h3>
                {lista.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {lista.map(nome => (
                      <span key={nome} className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full border border-green-300 font-medium">{nome}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-green-700 opacity-70">Nenhum produto homologado ainda.</p>
                )}
              </div>
            )
          })()}

          {/* === PRODUTOS DE INTERESSE === */}
          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">📦 Produtos de interesse</h3>
            {c.produtosInteresse && c.produtosInteresse.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {c.produtosInteresse.map(p => <span key={p} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-700 rounded-full border border-primary-100">{p}</span>)}
              </div>
            ) : (
              <p className="text-xs text-gray-500">Nenhum produto de interesse registrado.</p>
            )}
          </div>

          {/* === REDES E INFO ADICIONAIS === */}
          {/* Mini-modal de rede social */}
          {socialModalOpen && (() => {
            const rede = REDES_CONFIG.find(r => r.key === socialModalOpen)!
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setSocialModalOpen(null)}>
                <div className="bg-white rounded-2xl shadow-2xl w-80 p-5 space-y-3" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-bold text-gray-900">Adicionar Rede Social</h3>
                  <label className="block text-xs font-medium text-gray-600">{rede.label}</label>
                  <input
                    autoFocus
                    type="text"
                    value={socialModalValue}
                    onChange={e => setSocialModalValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSalvarRedesSociais(rede.key, socialModalValue)}
                    placeholder={rede.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {redesSociaisMap[rede.key] && (
                    <a href={redesSociaisMap[rede.key].startsWith('http') ? redesSociaisMap[rede.key] : `https://${redesSociaisMap[rede.key]}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary-600 hover:underline truncate">
                      🔗 {redesSociaisMap[rede.key]}
                    </a>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => handleSalvarRedesSociais(rede.key, socialModalValue)} className="flex-1 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">Salvar</button>
                    {redesSociaisMap[rede.key] && (
                      <button onClick={() => handleSalvarRedesSociais(rede.key, '')} className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors">Remover</button>
                    )}
                    <button onClick={() => setSocialModalOpen(null)} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">Cancelar</button>
                  </div>
                </div>
              </div>
            )
          })()}

          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">🌐 Redes sociais e informações adicionais</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-2">Redes sociais — clique no ícone para adicionar o link</label>
              <div className="flex items-center gap-3 flex-wrap">
                {REDES_CONFIG.map(rede => {
                  const hasLink = !!redesSociaisMap[rede.key]
                  const url = hasLink ? (redesSociaisMap[rede.key].startsWith('http') ? redesSociaisMap[rede.key] : `https://${redesSociaisMap[rede.key]}`) : null
                  return (
                    <div key={rede.key} className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => { setSocialModalOpen(rede.key); setSocialModalValue(redesSociaisMap[rede.key] || '') }}
                        title={hasLink ? `${rede.label}: ${redesSociaisMap[rede.key]}` : `Adicionar ${rede.label}`}
                        className={`relative p-2 rounded-xl border-2 transition-all ${
                          hasLink
                            ? `border-primary-300 bg-primary-50 ${rede.activeColor}`
                            : 'border-gray-200 bg-white text-gray-300 hover:border-gray-400 hover:text-gray-500'
                        }`}
                      >
                        {rede.icon}
                        {hasLink && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                        )}
                      </button>
                      {hasLink && url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className={`text-[9px] font-semibold ${rede.activeColor} hover:underline`}>
                          {rede.label}
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Informações adicionais</label>
              <textarea
                value={panelInfoAdicional}
                onChange={(e) => setPanelInfoAdicional(e.target.value)}
                placeholder="Observações internas sobre responsável, processo de compra, exigências, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                rows={3}
              />
            </div>
            <button onClick={handleSalvarDadosEmpresa} className="px-4 py-1.5 bg-gray-800 text-white rounded-apple text-xs font-medium hover:bg-gray-900 transition-colors">
              💾 Salvar informações
            </button>
          </div>

          {/* === DADOS COMERCIAIS === */}
          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">💼 Dados Comerciais</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {c.valorEstimado && <div><p className="text-xs text-gray-500">Valor estimado</p><p className="font-bold text-primary-600">R$ {c.valorEstimado.toLocaleString('pt-BR')}</p></div>}
              {vendedor && <div><p className="text-xs text-gray-500">Vendedor</p><p className="font-medium text-gray-900">{vendedor.nome}</p></div>}
              {c.valorProposta && <div><p className="text-xs text-gray-500">Valor proposta</p><p className="font-bold text-purple-700">R$ {c.valorProposta.toLocaleString('pt-BR')}</p></div>}
              {c.dataProposta && <div><p className="text-xs text-gray-500">Data proposta</p><p className="text-gray-900">{new Date(c.dataProposta).toLocaleDateString('pt-BR')}</p></div>}
            </div>
          </div>

          {/* === INFO DA ETAPA === */}
          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">📊 Info da Etapa</h3>
            {c.etapa === 'amostra' && (
              <div className="space-y-1 text-sm">
                {c.dataEnvioAmostra && <p className="text-gray-700">📦 Amostra enviada em: <span className="font-medium">{new Date(c.dataEnvioAmostra).toLocaleDateString('pt-BR')}</span></p>}
                {c.statusAmostra && <p className="text-gray-700">Status: <span className="font-medium">{({ enviada: '📤 Enviada', aguardando_resposta: '⏳ Aguardando', aprovada: '✅ Aprovada', rejeitada: '❌ Rejeitada' })[c.statusAmostra]}</span></p>}
                <p className="text-gray-700">Prazo: <span className="font-medium">{Math.max(30 - (c.dataEnvioAmostra ? Math.floor((Date.now() - new Date(c.dataEnvioAmostra).getTime()) / 86400000) : 0), 0)} dias restantes</span></p>
              </div>
            )}
            {c.etapa === 'proposta' && (
              <div className="space-y-1 text-sm">
                {c.valorEstimado && <p className="text-gray-700">💰 Valor: <span className="font-medium">R$ {c.valorEstimado.toLocaleString('pt-BR')}</span></p>}
                <p className="text-gray-700">Prazo: <span className="font-medium">{Math.max(30 - (c.dataEntradaEtapa ? Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000) : 0), 0)} dias restantes</span></p>
              </div>
            )}
            {c.etapa === 'negociacao' && (
              <div className="space-y-1 text-sm">
                {c.valorProposta && <p className="text-gray-700">💰 Proposta: <span className="font-bold">R$ {c.valorProposta.toLocaleString('pt-BR')}</span></p>}
                {c.dataProposta && <p className="text-gray-700">📅 Enviada em: <span className="font-medium">{new Date(c.dataProposta).toLocaleDateString('pt-BR')}</span></p>}
              </div>
            )}
            {c.etapa === 'amostra_perdida' && (
              <div className="space-y-1 text-sm">
                {c.motivoReprovacao && <p className="text-gray-700">❌ Motivo: <span className="font-medium">{c.motivoReprovacao}</span></p>}
                <p className="text-gray-700">🧪 Tentativas: <span className="font-medium">{c.tentativaAmostra || 0} de 2</span></p>
                {c.etapaAnterior && <p className="text-gray-700">↩ Veio de: <span className="font-medium">{etapaLabels[c.etapaAnterior]}</span></p>}
              </div>
            )}
            {c.etapa === 'inativo' && (
              <div className="space-y-1 text-sm">
                <p className="text-gray-700">💤 Inativo há {c.diasInativo || 0} dias</p>
                {c.etapaAnterior && <p className="text-gray-700">↩ Veio de: <span className="font-medium">{etapaLabels[c.etapaAnterior]}</span></p>}
                {c.totalCompras !== undefined && c.totalCompras > 0 && <p className="text-gray-700">🛒 {c.totalCompras} compra(s)</p>}
              </div>
            )}
            {c.etapa === 'lead' && (
              <div className="space-y-1 text-sm">
                {c.segmento && <p className="text-gray-700">🏢 Segmento: <span className="font-medium">{c.segmento}</span></p>}
                {c.localizacao && <p className="text-gray-700">📍 Localização: <span className="font-medium">{c.localizacao}</span></p>}
                {c.origemLead && <p className="text-gray-700">🌐 Origem: <span className="font-medium">{c.origemLead}</span></p>}
              </div>
            )}
            {c.etapa === 'follow_up' && (
              <div className="space-y-1 text-sm">
                {c.omieStatusLogistico && <p className="text-gray-700">Logística: <span className="font-medium">{c.omieStatusLogistico}</span></p>}
                {c.omieCodigoRastreio && <p className="text-gray-700">📦 Rastreio: <span className="font-medium">{c.omieCodigoRastreio}</span></p>}
                {c.omieNotaFiscal && <p className="text-gray-700">📄 NF: <span className="font-medium">{c.omieNotaFiscal}</span></p>}
                {c.dataUltimoPedido && <p className="text-gray-700">📦 Último pedido: <span className="font-medium">{new Date(c.dataUltimoPedido).toLocaleDateString('pt-BR')}</span></p>}
              </div>
            )}
            {c.etapa === 'perdido' && (
              <div className="space-y-1 text-sm">
                {c.categoriaPerda && <p className="text-gray-700">Categoria: <span className="font-medium">{catLabels[c.categoriaPerda]}</span></p>}
                {c.motivoPerda && <p className="text-gray-700">Motivo: <span className="font-medium">{c.motivoPerda}</span></p>}
                {c.etapaAnterior && <p className="text-gray-700">Veio de: <span className="font-medium">{etapaLabels[c.etapaAnterior]}</span></p>}
                {c.dataPerda && <p className="text-gray-700">Data: <span className="font-medium">{new Date(c.dataPerda).toLocaleDateString('pt-BR')}</span></p>}
              </div>
            )}
            {c.etapa === 'prospecção' && (
              <div className="space-y-1 text-sm">
                <p className="text-gray-700">📅 Em prospecção há {diasNaEtapa} dias</p>
                {c.diasInativo !== undefined && <p className="text-gray-700">⏳ Última interação: {c.diasInativo} dias atrás</p>}
              </div>
            )}
          </div>

          </div>

          <div className="space-y-4 lg:col-span-7 xl:col-span-8 lg:overflow-y-auto lg:pl-1">

          {/* === ABAS: Histórico | Negócios === */}
          <div className="sticky top-0 z-[5] bg-white border-b border-gray-200 -mx-1 px-1 pb-0 mb-2">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('historico')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'historico' ? 'text-primary-700 border-primary-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
              >
                Ver histórico
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('negocios')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'negocios' ? 'text-primary-700 border-primary-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
              >
                Ver negócios
                {(() => {
                  const count = (todosPedidos || []).filter(p => p.clienteId === c.id && p.status !== 'cancelado').length
                  return count > 0 ? <span className="bg-gray-200 text-gray-700 text-[10px] font-bold rounded-full px-1.5">{count}</span> : null
                })()}
              </button>
            </div>
          </div>

          {/* ===== ABA NEGÓCIOS ===== */}
          {activeTab === 'negocios' && (() => {
            const pedidosCli = (todosPedidos || [])
              .filter(p => p.clienteId === c.id)
              .sort((a, b) => (b.dataCriacao || '').localeCompare(a.dataCriacao || ''))
            const total = pedidosCli.filter(p => p.status !== 'cancelado' && p.tipo !== 'bonificacao').reduce((s, p) => s + (p.totalValor || 0), 0)
            const statusBadge: Record<string, string> = {
              rascunho: 'bg-gray-100 text-gray-700',
              enviado: 'bg-yellow-100 text-yellow-700',
              confirmado: 'bg-green-100 text-green-700',
              cancelado: 'bg-red-100 text-red-700',
              cancelamento_solicitado: 'bg-orange-100 text-orange-700',
            }
            return (
              <div className="space-y-3">
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-apple border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Pedidos</p>
                    <p className="text-lg font-bold text-gray-900">{pedidosCli.length}</p>
                  </div>
                  <div className="bg-white rounded-apple border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Faturado</p>
                    <p className="text-lg font-bold text-green-700">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white rounded-apple border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Propostas</p>
                    <p className="text-lg font-bold text-indigo-700">{todasPropostas.length}</p>
                  </div>
                </div>

                {/* Lista de Pedidos */}
                <div className="bg-white rounded-apple border border-gray-200">
                  <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                    <p className="text-sm font-semibold text-gray-900">🧾 Pedidos do cliente</p>
                  </div>
                  {pedidosCli.length === 0 ? (
                    <p className="text-sm text-gray-400 p-4 text-center">Nenhum pedido registrado ainda.</p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {pedidosCli.map(p => (
                        <div key={p.id} className="px-4 py-2.5 hover:bg-gray-50">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900">{p.numero} {p.tipo === 'bonificacao' && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">amostra</span>}</p>
                              <p className="text-[11px] text-gray-500">{new Date(p.dataCriacao).toLocaleDateString('pt-BR')} · {(p.itens || []).length} item(ns)</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-gray-900">{p.tipo === 'bonificacao' ? '—' : `R$ ${(p.totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</p>
                              <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${statusBadge[p.status] || 'bg-gray-100 text-gray-700'}`}>{p.status}</span>
                            </div>
                          </div>
                          {p.itens && p.itens.length > 0 && (
                            <p className="text-[11px] text-gray-400 mt-1 truncate">
                              {p.itens.map(it => `${it.quantidade}× ${it.nomeProduto}`).join(' · ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lista de Propostas */}
                {todasPropostas.length > 0 && (
                  <div className="bg-white rounded-apple border border-gray-200">
                    <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                      <p className="text-sm font-semibold text-gray-900">📋 Histórico de Propostas</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {todasPropostas.map((p, i) => (
                        <div key={p.id} className={`px-4 py-2.5 ${i === 0 ? 'bg-indigo-50/30' : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900">{p.numero} {i === 0 && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 rounded">atual</span>}</p>
                              <p className="text-[11px] text-gray-500">{new Date(p.criadoEm).toLocaleDateString('pt-BR')} · {p.vendedorNome} · {(p.itens || []).length} item(ns)</p>
                            </div>
                            <p className="text-sm font-bold text-gray-900 flex-shrink-0">R$ {(p.totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ===== ABA HISTÓRICO (default) ===== */}
          {activeTab === 'historico' && <>

          {/* === REGISTRAR ATIVIDADE === */}
          {(() => {
            const TIPOS_ATIV = [
              { tipo: 'nota',     label: 'Nota',      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> },
              { tipo: 'email',    label: 'E-mail',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
              { tipo: 'ligacao',  label: 'Ligação',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> },
              { tipo: 'whatsapp', label: 'WhatsApp',  icon: <WhatsAppIcon variant="filled" className="h-4 w-4" /> },
              { tipo: 'proposta', label: 'Proposta',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
              { tipo: 'reuniao',  label: 'Reunião',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
              { tipo: 'visita',   label: 'Visita',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
            ] as const
            const isNota = panelAtividadeTipo === 'nota'
            const semTipo = !panelAtividadeTipo
            return (
              <div className="bg-white rounded-apple border border-gray-200 shadow-sm overflow-hidden">
                {/* Abas de tipo */}
                <div className="flex flex-wrap border-b border-gray-200 bg-gray-50">
                  {TIPOS_ATIV.map(({ tipo, label, icon }) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setPanelAtividadeTipo(panelAtividadeTipo === tipo ? '' : tipo as Interacao['tipo'])}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                        panelAtividadeTipo === tipo
                          ? 'border-primary-600 text-primary-700 bg-white'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {icon}{label}
                    </button>
                  ))}
                </div>
                {/* Textarea sempre visível */}
                <div className="p-3 space-y-3">
                  <textarea
                    value={panelAtividadeDesc}
                    onChange={(e) => setPanelAtividadeDesc(e.target.value)}
                    placeholder={
                      semTipo ? 'Digite uma atividade livre para gerar uma tarefa genérica...'
                      : isNota ? 'Digite sua nota...'
                      : `Descreva a ${tipoInteracaoLabel[panelAtividadeTipo] || 'atividade'}...`
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    rows={4}
                  />
                  {/* Prazo + Hora: visível para tipos com data, opcional para semTipo */}
                  {!isNota && !semTipo && (
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-xs text-gray-500 mb-1">Prazo</label>
                        <input type="date" value={panelAtividadePrazo} onChange={(e) => setPanelAtividadePrazo(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                      <div className="flex-1 min-w-[100px]">
                        <label className="block text-xs text-gray-500 mb-1">Horário</label>
                        <input type="time" value={panelAtividadeHora} onChange={(e) => setPanelAtividadeHora(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                      <button
                        onClick={handleRegistrarAtividade}
                        disabled={!panelAtividadeDesc.trim() || !panelAtividadePrazo || !panelAtividadeHora}
                        className="px-5 py-2 bg-primary-600 text-white rounded-apple text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {semTipo ? 'Salvar Tarefa' : 'Salvar'}
                      </button>
                    </div>
                  )}
                  {(isNota || semTipo) && (
                    <div className="flex justify-end">
                      <button
                        onClick={handleRegistrarAtividade}
                        disabled={!panelAtividadeDesc.trim()}
                        className="px-5 py-2 bg-primary-600 text-white rounded-apple text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {semTipo ? 'Salvar Tarefa' : 'Salvar Nota'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* === HISTÓRICO DE ATIVIDADES === */}
          {clienteInteracoes.length > 0 && (() => {
            // Tempo relativo: "Hoje 12:55", "Ontem 10:30", "22/mai 16:08"
            const fmtRelativo = (data: string) => {
              const d = new Date(data)
              const hoje = new Date(); hoje.setHours(0,0,0,0)
              const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1)
              const alvo = new Date(d); alvo.setHours(0,0,0,0)
              const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              if (alvo.getTime() === hoje.getTime()) return `Hoje ${hora}`
              if (alvo.getTime() === ontem.getTime()) return `Ontem ${hora}`
              const dataFmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
              return `${dataFmt} ${hora}`
            }
            const itens = historicoTab === 'fixadas'
              ? clienteInteracoesOrdenadas.filter(i => pinnedInteracoes.includes(i.id))
              : clienteInteracoesOrdenadas
            const totalFixadas = clienteInteracoes.filter(i => pinnedInteracoes.includes(i.id)).length
            return (
              <div className="space-y-3">
                {/* Tabs Histórico / Fixadas */}
                <div className="flex items-center gap-1 border-b border-gray-200">
                  <button
                    onClick={() => setHistoricoTab('todas')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                      historicoTab === 'todas'
                        ? 'border-primary-600 text-primary-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    🕐 Histórico de atividades
                    <span className="text-[11px] font-normal text-gray-400">({clienteInteracoes.length})</span>
                  </button>
                  <button
                    onClick={() => setHistoricoTab('fixadas')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                      historicoTab === 'fixadas'
                        ? 'border-primary-600 text-primary-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    📌 Fixadas
                    <span className="text-[11px] font-normal text-gray-400">({totalFixadas})</span>
                  </button>
                </div>

                {/* Lista de cards */}
                {itens.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">
                    {historicoTab === 'fixadas' ? 'Nenhuma atividade fixada ainda.' : 'Nenhuma atividade registrada.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {itens.map(inter => {
                      const tipo = inter.tipo || 'nota'
                      const cor = tipoInteracaoCor[tipo] || { bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' }
                      const isPinned = pinnedInteracoes.includes(inter.id)
                      const criador = inter.automatico ? 'Automação' : (vendedor?.nome?.split(' ')[0] || '—')
                      const criadorIniciais = inter.automatico ? '⚡' : (vendedor?.nome?.charAt(0) || '?').toUpperCase()
                      const respNome = vendedor?.nome?.split(' ')[0] || '—'
                      const respIni = (vendedor?.nome?.charAt(0) || '?').toUpperCase()
                      // Match com tarefa vinculada: descrição igual OU título contém assunto da interação
                      const tarefaVinculada = clienteTarefas.find(t => {
                        const descMatch = (t.descricao || '').trim() === (inter.descricao || '').trim() && (inter.descricao || '').trim().length > 0
                        const assuntoMatch = inter.assunto && (t.titulo || '').toLowerCase().includes((inter.assunto || '').toLowerCase().slice(0, 20))
                        return descMatch || assuntoMatch
                      }) || clienteTarefas.find(t => {
                        // fallback: tarefa criada no mesmo dia da interação
                        return t.data === (inter.data || '').split('T')[0]
                      })
                      const prazoData = tarefaVinculada?.data
                      const prazoHora = tarefaVinculada?.hora
                      const prazoVencido = prazoData ? (() => {
                        const agora = new Date()
                        const prazo = new Date(`${prazoData}T${prazoHora || '23:59'}`)
                        return prazo.getTime() < agora.getTime() && tarefaVinculada?.status !== 'concluida'
                      })() : false
                      const fmtPrazo = (() => {
                        if (!prazoData) return null
                        const d = new Date(`${prazoData}T${prazoHora || '00:00'}`)
                        const hoje = new Date(); hoje.setHours(0,0,0,0)
                        const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1)
                        const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1)
                        const alvo = new Date(d); alvo.setHours(0,0,0,0)
                        const horaHM = prazoHora ? prazoHora.slice(0, 5) : ''
                        const horaTxt = horaHM ? ` ${horaHM}` : ''
                        if (alvo.getTime() === hoje.getTime()) return `Hoje${horaTxt}`
                        if (alvo.getTime() === ontem.getTime()) return `Ontem${horaTxt}`
                        if (alvo.getTime() === amanha.getTime()) return `Amanhã${horaTxt}`
                        return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}${horaTxt}`
                      })()
                      return (
                        <div key={inter.id} className={`group rounded-apple border overflow-hidden ${isPinned ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-white'} hover:border-gray-300 transition-colors`}>

                          {/* CABEÇALHO: ícone + nome + tipo + badge + data criação */}
                          <div className={`flex items-center justify-between gap-2 px-3 py-2.5 ${isPinned ? 'bg-amber-50' : 'bg-primary-50'} border-b ${isPinned ? 'border-amber-100' : 'border-primary-100'}`}>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-white border ${cor.border} flex items-center justify-center text-sm shadow-sm`}>
                                {tipoInteracaoIcon[tipo] || '📋'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-primary-500 truncate leading-none mb-0.5">{c.razaoSocial}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-700">{tipoInteracaoLabel[tipo] || tipo}</span>
                                  {inter.automatico && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700 border border-purple-200 rounded-full">⚡ Auto</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-500">Criada {fmtRelativo(inter.data)}</p>
                              </div>
                            </div>
                            {fmtPrazo && (
                              <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                                <span className="text-[9px] uppercase tracking-wide text-gray-400 font-semibold">Prazo</span>
                                <span
                                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                                    tarefaVinculada?.status === 'concluida'
                                      ? 'bg-white/70 text-gray-400 border-gray-200 line-through'
                                      : prazoVencido
                                      ? 'bg-red-500 text-white border-red-600'
                                      : 'bg-amber-400 text-white border-amber-500'
                                  }`}
                                  title={tarefaVinculada?.status === 'concluida' ? 'Tarefa concluída' : prazoVencido ? 'Vencida' : 'Prazo'}
                                >
                                  📅 {fmtPrazo}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Descrição (sem assunto/label duplicado) */}
                          {inter.descricao && (
                            <div className="px-3 py-1.5">
                              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{inter.descricao}</p>
                            </div>
                          )}

                          {/* Gravação de ligação */}
                          {inter.tipo === 'ligacao' && (() => {
                            const diaDaInteracao = (inter.data || '').split('T')[0]
                            const gravacao = gravacoesPorData.get(diaDaInteracao)
                              || gravacoes.find(g => Math.abs(new Date(g.created_at).getTime() - new Date(inter.data).getTime()) < 24 * 3600 * 1000)
                            if (!gravacao) return null
                            const tid = transcricoes[gravacao.id]
                            const carregando = transcrevendo[gravacao.id]
                            return (
                              <div className="mx-3 mb-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-2">
                                {gravacao.arquivo_url && <audio controls src={gravacao.arquivo_url} className="w-full h-8" />}
                                <div className="flex gap-1.5 flex-wrap">
                                  {gravacao.arquivo_url && (
                                    <a href={gravacao.arquivo_url} download className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                                      ⬇️ Download
                                    </a>
                                  )}
                                  {!tid && (
                                    <button onClick={() => handleTranscrever(gravacao.id)} disabled={carregando}
                                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors">
                                      {carregando ? '⏳ Transcrevendo...' : '🤖 Transcrever com IA'}
                                    </button>
                                  )}
                                  <span className="text-[9px] text-gray-400 self-center">{Math.floor((gravacao.duracao_segundos || 0) / 60)}:{String((gravacao.duracao_segundos || 0) % 60).padStart(2, '0')} min</span>
                                </div>
                                {tid && (
                                  <div className={`rounded-lg p-2 text-[10px] leading-relaxed ${tid.startsWith('Erro') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-gray-700 border border-gray-200'}`}>
                                    <span className="font-semibold block mb-0.5">📝 Transcrição:</span>{tid}
                                  </div>
                                )}
                              </div>
                            )
                          })()}

                          {/* Rodapé: Criada por | Responsável | pin (hover) */}
                          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                              <div className="flex items-center gap-1.5">
                                <span>Criada por</span>
                                <span
                                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                                    inter.automatico ? 'bg-purple-100 text-purple-700' : 'bg-primary-100 text-primary-700'
                                  }`}
                                  title={criador}
                                >
                                  {criadorIniciais}
                                </span>
                                <span className={`font-medium ${inter.automatico ? 'text-purple-700' : 'text-gray-700'}`}>
                                  {criador}
                                </span>
                              </div>
                              {vendedor && (
                                <>
                                  <span className="text-gray-300">|</span>
                                  <div className="flex items-center gap-1.5">
                                    <span>Responsável</span>
                                    <span
                                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold"
                                      title={vendedor.nome}
                                    >
                                      {respIni}
                                    </span>
                                    <span className="font-medium text-gray-700">{respNome}</span>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {tarefaVinculada && tarefaVinculada.status !== 'concluida' && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const agora = new Date().toISOString()
                                    await db.updateTarefa(tarefaVinculada.id, { status: 'concluida', concluidaEm: agora })
                                    setTarefas(prev => prev.map(t => t.id === tarefaVinculada.id ? { ...t, status: 'concluida', concluidaEm: agora } : t))
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors opacity-0 group-hover:opacity-100"
                                  title="Marcar tarefa como concluída"
                                >
                                  ✓ Finalizar
                                </button>
                              )}
                              <button
                                onClick={() => handleTogglePinInteracao(inter.id)}
                                className={`flex-shrink-0 p-1 rounded-full transition-all ${
                                  isPinned
                                    ? 'text-amber-500 opacity-100'
                                    : 'text-gray-400 opacity-0 group-hover:opacity-100 hover:text-amber-500'
                                }`}
                                title={isPinned ? 'Desafixar' : 'Fixar'}
                              >
                                📌
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {/* === TIMELINE (collapsible) === */}

          {/* === WHATSAPP MODAL (separado) === */}
          {showWhatsApp && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowWhatsApp(false)}>
              <div
                ref={whatsAppRef}
                className="bg-white rounded-apple shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-emerald-50">
                  <div className="flex items-center gap-2">
                    <WhatsAppIcon variant="filled" className="h-6 w-6 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">WhatsApp — {c.razaoSocial}</p>
                      {(c.contatoCelular || c.contatoTelefone) && (
                        <p className="text-xs text-gray-500">{c.contatoCelular || c.contatoTelefone}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowWhatsApp(false)}
                    className="p-1.5 rounded-full hover:bg-emerald-100 text-gray-500 hover:text-gray-800 transition-colors"
                    title="Fechar"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <WhatsAppUserPanel
                    loggedUser={loggedUser}
                    cliente={c}
                    showToast={(tipo, texto) => addNotificacao(tipo === 'success' ? 'success' : 'error', tipo === 'success' ? 'WhatsApp' : 'Erro WhatsApp', texto, c.id)}
                    compact
                  />
                </div>
              </div>
            </div>
          )}

          {/* === EMAIL (collapsible) === */}
          <div ref={emailRef} className="bg-gray-50 rounded-apple border border-gray-200">
            <button onClick={() => setShowEmail(!showEmail)} className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors rounded-apple">
              <span>📧 Email</span>
              <span>{showEmail ? '▲' : '▼'}</span>
            </button>
            {showEmail && (
              <div className="px-4 pb-4">
                <EmailCenterPanel
                  cliente={c}
                  vendedorNome={loggedUser?.nome}
                  showToast={(tipo, texto) => addNotificacao(tipo === 'success' ? 'success' : 'error', tipo === 'success' ? 'Email' : 'Erro Email', texto, c.id)}
                />
              </div>
            )}
          </div>

          </>}{/* fim aba Histórico */}

          </div>
        </div>

        </div>
      </div>

      {/* Call Recorder overlay */}
      {showCallRecorder && (
        <CallRecorder
          cliente={c}
          vendedorId={loggedUser?.id}
          phoneNumber={(c.contatoCelular || c.contatoTelefone || '').replace(/\D/g, '')}
          onClose={() => setShowCallRecorder(false)}
        />
      )}

      {/* Modal Editar Proposta */}
      {showEditProposta && ultimaProposta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">📝 Editar Proposta</h2>
                <p className="text-xs text-gray-500 mt-0.5">{ultimaProposta.numero} · {new Date(ultimaProposta.criadoEm).toLocaleDateString('pt-BR')}</p>
              </div>
              <button onClick={() => { setShowEditProposta(false); setEditPropostaProdSearch('') }} className="p-1.5 hover:bg-gray-100 rounded-lg"><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Frete */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Tipo de Frete</p>
                <div className="flex gap-2">
                  <button onClick={() => setEditPropostaFrete('CIF')} className={`flex-1 py-2 rounded-apple text-sm font-medium border-2 transition-colors ${editPropostaFrete === 'CIF' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>📦 CIF (Entrega)</button>
                  <button onClick={() => setEditPropostaFrete('FOB')} className={`flex-1 py-2 rounded-apple text-sm font-medium border-2 transition-colors ${editPropostaFrete === 'FOB' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>🏭 FOB (Retirada)</button>
                </div>
              </div>

              {/* Pagamento */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Forma de Pagamento</p>
                <select value={editPropostaPagamento} onChange={e => setEditPropostaPagamento(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {PAYMENT_TERM_GROUPS.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Itens */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Itens da Proposta</p>
                <div className="space-y-2">
                  {editPropostaItens.map((item, idx) => (
                    <div key={item.produtoId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-apple border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.nomeProduto}</p>
                        <p className="text-[10px] text-gray-400">KG</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex flex-col items-center gap-0.5">
                          <label className="text-[9px] text-gray-400">Qtd</label>
                          <input
                            type="number" min={0}
                            value={item.quantidade}
                            onChange={e => setEditPropostaItens(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: Math.max(0, parseInt(e.target.value) || 0) } : it))}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <label className="text-[9px] text-gray-400">R$ / un</label>
                          <input
                            type="number" min={0} step="0.01"
                            value={item.preco}
                            onChange={e => setEditPropostaItens(prev => prev.map((it, i) => i === idx ? { ...it, preco: parseFloat(e.target.value) || 0 } : it))}
                            onFocus={e => e.target.select()}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <label className="text-[9px] text-gray-400">Total</label>
                          <p className="text-xs font-bold text-indigo-700 w-24 text-right">R$ {(item.quantidade * item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <button
                          onClick={() => setEditPropostaItens(prev => prev.filter((_, i) => i !== idx))}
                          className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Remover item"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                  {editPropostaItens.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhum item. Adicione produtos abaixo.</p>}
                </div>

                {/* Adicionar produto */}
                {produtos && produtos.length > 0 && (
                  <div className="mt-3 relative">
                    <p className="text-[10px] text-gray-500 mb-1">Adicionar produto:</p>
                    <input
                      type="text"
                      placeholder="🔍 Buscar produto para adicionar..."
                      value={editPropostaProdSearch}
                      onChange={e => setEditPropostaProdSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                    {editPropostaProdSearch.trim() && (
                      <div className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-apple shadow-lg mt-1 max-h-52 overflow-y-auto">
                        {produtos
                          .filter(p => p.ativo && p.nome.toLowerCase().includes(editPropostaProdSearch.toLowerCase()))
                          .slice(0, 20)
                          .map(p => {
                            const jaAdicionado = editPropostaItens.some(it => it.produtoId === p.id)
                            return (
                              <button
                                key={p.id}
                                disabled={jaAdicionado}
                                onClick={() => {
                                  if (jaAdicionado) return
                                  setEditPropostaItens(prev => [...prev, { produtoId: p.id, nomeProduto: p.nome, sku: p.omieCodigo || p.sku || '', unidade: p.unidade, preco: p.preco, quantidade: 1 }])
                                  setEditPropostaProdSearch('')
                                }}
                                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                                  jaAdicionado ? 'text-gray-300 cursor-not-allowed bg-gray-50' : 'hover:bg-indigo-50 text-gray-800'
                                }`}
                              >
                                <span className="font-medium">{p.nome}</span>
                                <span className="text-xs text-gray-400 ml-2">R$ {p.preco.toFixed(2).replace('.', ',')}/KG</span>
                                {jaAdicionado && <span className="text-xs text-gray-300 ml-1">(já adicionado)</span>}
                              </button>
                            )
                          })}
                        {produtos.filter(p => p.ativo && p.nome.toLowerCase().includes(editPropostaProdSearch.toLowerCase())).length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-3">Nenhum produto encontrado</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Observações</p>
                <textarea
                  value={editPropostaObs}
                  onChange={e => setEditPropostaObs(e.target.value)}
                  rows={3}
                  placeholder="Observações da proposta..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Total */}
              <div className="flex items-center justify-between py-3 border-t border-gray-200">
                <span className="text-sm text-gray-600">{editPropostaItens.reduce((s, i) => s + i.quantidade, 0)} item(ns)</span>
                <span className="text-lg font-bold text-indigo-700">
                  R$ {editPropostaItens.reduce((s, i) => s + i.preco * i.quantidade, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => { setShowEditProposta(false); setEditPropostaProdSearch('') }} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button
                disabled={editPropostaSaving || editPropostaItens.length === 0}
                onClick={async () => {
                  setEditPropostaSaving(true)
                  try {
                    const total = editPropostaItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
                    const numero = `PROP-${Date.now().toString().slice(-6)}`
                    await gerarPropostaPDF(c, editPropostaItens, editPropostaObs, loggedUser?.nome || 'Vendedor', numero, { formaPagamento: editPropostaPagamento, tipoFrete: editPropostaFrete as 'CIF' | 'FOB' | '' })
                    const saved = await savePropostaHistorico({
                      numero, clienteId: c.id, vendedorNome: loggedUser?.nome || 'Vendedor',
                      itens: editPropostaItens, observacoes: editPropostaObs,
                      frete: editPropostaFrete || undefined, pagamento: editPropostaPagamento || undefined,
                      totalValor: total, criadoEm: new Date().toISOString(),
                    })
                    setUltimaProposta(saved)
                    setShowEditProposta(false)
                    setEditPropostaProdSearch('')
                  } catch {
                    alert('Erro ao gerar proposta.')
                  } finally {
                    setEditPropostaSaving(false)
                  }
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-apple text-sm flex items-center gap-2"
              >
                {editPropostaSaving
                  ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Gerando...</>
                  : '📄 Gerar Nova Versão PDF'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Solicitar Cancelamento de Pedido */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">🚫 Solicitar Cancelamento de Pedido</h2>
            <p className="text-sm text-gray-500 mb-4">A solicitação será enviada para aprovação do gerente. O pedido só será cancelado após confirmação.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo do cancelamento <span className="text-red-500">*</span></label>
            <textarea
              value={cancelMotivo}
              onChange={e => setCancelMotivo(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo do cancelamento..."
              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-red-500 mb-4 text-sm resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCancelModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Voltar</button>
              <button
                disabled={!cancelMotivo.trim() || cancelSaving}
                onClick={async () => {
                  if (!cancelPedidoId || !cancelMotivo.trim()) {
                    addNotificacao('error', 'Erro', 'Informe o motivo do cancelamento.', c.id)
                    return
                  }
                  if (!onSolicitarCancelamentoPedido) {
                    addNotificacao('error', 'Erro', 'Função de cancelamento não disponível.', c.id)
                    console.error('onSolicitarCancelamentoPedido is undefined')
                    return
                  }
                  setCancelSaving(true)
                  try {
                    await onSolicitarCancelamentoPedido(cancelPedidoId, cancelMotivo.trim())
                    addNotificacao('info', 'Cancelamento solicitado', `Aguardando aprovação do gerente para cancelar o pedido de ${c.razaoSocial}.`, c.id)
                    setShowCancelModal(false)
                  } catch (err) {
                    console.error('Erro ao solicitar cancelamento:', err)
                    addNotificacao('error', 'Erro', 'Falha ao solicitar cancelamento. Tente novamente.', c.id)
                  } finally {
                    setCancelSaving(false)
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-apple hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelSaving ? '⏳ Enviando...' : 'Solicitar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Avaliação por Item de Amostra */}
      {showAvaliarAmostra && (() => {
        const pedidoAmostra = (todosPedidos || []).find(p => p.clienteId === c.id && p.tipo === 'bonificacao')
        const itens = pedidoAmostra?.itens || []
        const todosAvaliados = itens.length > 0 && itens.every((_, idx) => avaliacaoItens[idx]?.aprovado !== null && avaliacaoItens[idx]?.aprovado !== undefined)
        const todosAprovados = itens.every((_, idx) => avaliacaoItens[idx]?.aprovado === true)
        const algumReprovado = itens.some((_, idx) => avaliacaoItens[idx]?.aprovado === false)
        const reprovadoSemMotivo = itens.some((_, idx) => avaliacaoItens[idx]?.aprovado === false && !avaliacaoItens[idx]?.motivo?.trim())

        const criarNovoCicloEmProposta = async () => {
          if (c.etapaAnterior !== 'proposta') return
          try {
            const novoCard: Omit<Cliente, 'id'> = {
              ...c,
              etapa: 'proposta',
              etapaAnterior: 'amostra',
              novoCiclo: true,
              cicloNumero: (c.cicloNumero || 1) + 1,
              statusAmostra: undefined,
              dataEnvioAmostra: undefined,
              resultadoAmostra: undefined,
              dataResultadoAmostra: undefined,
              dataEntradaEtapa: new Date().toISOString(),
              historicoEtapas: [],
            }
            const saved = await db.insertCliente(novoCard)
            setClientes(prev => [saved, ...prev])
            addNotificacao('info', 'Novo card criado', `Card de ${c.razaoSocial} criado em Proposta após amostra aprovada.`, saved.id)
          } catch (err) {
            logger.error('Erro ao criar card em proposta após amostra:', err)
          }
        }

        const handleConfirmar = async () => {
          const hoje = new Date().toISOString().split('T')[0]
          if (todosAprovados) {
            onMoverCliente(c.id, 'proposta', { resultadoAmostra: 'aprovada', dataResultadoAmostra: hoje })
            await criarNovoCicloEmProposta()
          } else {
            const motivosReprovados = itens
              .map((item, idx) => avaliacaoItens[idx]?.aprovado === false
                ? `${item.nomeProduto}: ${avaliacaoItens[idx]?.motivo || ''}`
                : null
              )
              .filter(Boolean)
              .join('; ')
            onMoverCliente(c.id, 'amostra_perdida', { resultadoAmostra: 'reprovada', dataResultadoAmostra: hoje, motivoReprovacao: motivosReprovados })
          }
          setShowAvaliarAmostra(false)
          onClose()
        }

        return (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4" onClick={() => setShowAvaliarAmostra(false)}>
            <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">🧪 Avaliação de Amostra por Item</h2>
                <p className="text-sm text-gray-500 mt-0.5">{c.razaoSocial} — Aprove ou reprove cada produto individualmente</p>
              </div>

              {itens.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <p>Nenhum item encontrado no pedido de amostra.</p>
                  <p className="text-xs mt-1">Use os botões de Aprovar / Reprovar gerais.</p>
                  <div className="flex gap-3 justify-center mt-4">
                    <button onClick={async () => { const hoje = new Date().toISOString().split('T')[0]; onMoverCliente(c.id, 'proposta', { resultadoAmostra: 'aprovada', dataResultadoAmostra: hoje }); await criarNovoCicloEmProposta(); setShowAvaliarAmostra(false); onClose() }} className="px-4 py-2 bg-green-600 text-white rounded-apple text-sm hover:bg-green-700">✅ Aprovar</button>
                    <button onClick={() => { onMoverCliente(c.id, 'amostra_perdida', { resultadoAmostra: 'reprovada', dataResultadoAmostra: new Date().toISOString().split('T')[0] }); setShowAvaliarAmostra(false); onClose() }} className="px-4 py-2 bg-orange-600 text-white rounded-apple text-sm hover:bg-orange-700">🚫 Reprovar</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {itens.map((item, idx) => {
                    const av = avaliacaoItens[idx] || { aprovado: null, motivo: '' }
                    return (
                      <div key={idx} className={`rounded-apple border p-3 space-y-2 transition-colors ${av.aprovado === true ? 'border-green-300 bg-green-50' : av.aprovado === false ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                            <p className="text-xs text-gray-500">{item.quantidade} KG</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => setAvaliacaoItens(prev => ({ ...prev, [idx]: { aprovado: true, motivo: '' } }))}
                              className={`px-3 py-1 rounded-apple text-xs font-medium border transition-colors ${av.aprovado === true ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}`}
                            >✅ OK</button>
                            <button
                              onClick={() => setAvaliacaoItens(prev => ({ ...prev, [idx]: { ...prev[idx], aprovado: false, motivo: prev[idx]?.motivo || '' } }))}
                              className={`px-3 py-1 rounded-apple text-xs font-medium border transition-colors ${av.aprovado === false ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50'}`}
                            >🚫 Reprovar</button>
                          </div>
                        </div>
                        {av.aprovado === false && (
                          <input
                            type="text"
                            value={av.motivo}
                            onChange={e => setAvaliacaoItens(prev => ({ ...prev, [idx]: { ...prev[idx], motivo: e.target.value } }))}
                            placeholder="Motivo da reprovação (obrigatório)..."
                            className="w-full px-2 py-1.5 border border-orange-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                            autoFocus
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {itens.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  {todosAvaliados && (
                    <p className="text-xs text-gray-500 mb-3">
                      {todosAprovados
                        ? c.etapaAnterior === 'proposta'
                          ? '✅ Todos aprovados — cliente volta para Proposta e novo card será criado em Proposta'
                          : '✅ Todos aprovados — cliente será movido para Proposta'
                        : algumReprovado && !todosAprovados
                          ? '⚠️ Aprovação parcial — cliente será movido para Amostra Perdida com motivos registrados'
                          : '🚫 Todos reprovados — cliente será movido para Amostra Perdida'}
                    </p>
                  )}
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowAvaliarAmostra(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
                    <button
                      disabled={!todosAvaliados || reprovadoSemMotivo}
                      onClick={handleConfirmar}
                      className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Confirmar Avaliação
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Modal: confirmar Excluir Empresa (irreversível) */}
      {showExcluirConfirm && onExcluirCliente && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowExcluirConfirm(false)}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-3">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-base font-bold text-gray-900">Excluir Empresa</h3>
              <p className="text-sm text-gray-600 mt-1">Você está prestes a excluir <strong>{c.razaoSocial}</strong> permanentemente.</p>
              <p className="text-xs text-red-600 font-semibold mt-2">Esta ação é IRREVERSÍVEL e removerá interações, tarefas e histórico.</p>
            </div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Digite <span className="font-bold text-red-600">EXCLUIR</span> para confirmar:</label>
            <input
              type="text"
              value={excluirConfirmText}
              onChange={(e) => setExcluirConfirmText(e.target.value)}
              placeholder="Digite EXCLUIR"
              className="w-full px-3 py-2 border border-gray-300 rounded-apple text-center font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowExcluirConfirm(false)} className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-apple font-medium text-sm">Cancelar</button>
              <button
                onClick={async () => {
                  if (excluirConfirmText !== 'EXCLUIR') return
                  await onExcluirCliente(c)
                  setShowExcluirConfirm(false)
                  onClose()
                }}
                disabled={excluirConfirmText !== 'EXCLUIR'}
                className={`flex-1 px-3 py-2 rounded-apple font-medium text-sm text-white ${excluirConfirmText === 'EXCLUIR' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300 cursor-not-allowed'}`}
              >
                🗑️ Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
