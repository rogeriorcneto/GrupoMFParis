import React, { useState, useRef, useCallback, useEffect } from 'react'
import { XMarkIcon, PencilIcon } from '@heroicons/react/24/outline'
import WhatsAppIcon from './icons/WhatsAppIcon'
import type { Cliente, Interacao, Atividade, Tarefa, Vendedor, Produto, Pedido, ItemPedido, PropostaHistorico, ConsumoProdutoInfo, ProdutosConsumoMap } from '../types'
import { fetchPropostasByCliente, savePropostaHistorico } from '../lib/database'
import { gerarPropostaPDF } from '../utils/pdfGenerator'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { formatCNPJ, formatBrazilianPhone } from '../utils/validators'
import { isMobileDevice } from '../utils/device'
import { mesmaEmpresaNoFunil, existeCardAtivoNoFunil } from '../utils/funil-logic'
import { parseRedesSociaisMap } from '../utils/socialLinks'
import WhatsAppUserPanel from './WhatsAppUserPanel'
import OcorrenciasPedido from './OcorrenciasPedido'
import CallRecorder from './CallRecorder'
import EmailCenterPanel from './EmailCenterPanel'
import TimePicker5Min, { isDataHoraNoPassado, arredondarHora5Min } from './TimePicker5Min'
import { DEFAULT_PAYMENT_TERM } from '../constants/paymentTerms'
import { useParametrosListas } from '../lib/parametrosListas'
import CadastroCompletoModal from './CadastroCompletoModal'
import FinalizarTarefaInline from './FinalizarTarefaInline'
import { avaliarCadastroCliente, SITUACAO_CADASTRO_CONFIG, temJustificativaAtiva } from '../utils/cadastroCompleto'
import { obterSituacaoCompraCliente, SITUACAO_COMPRA_CONFIG } from '../utils/situacaoCompra'
import {
  buildProximaTarefa,
  CANAIS_TAREFA,
  CANAL_LABEL,
  CanalTarefa,
  clienteJaTemOutraTarefaAberta,
  ehTarefaIncluirProdutos,
  exigeJustificativaPrazoLongo,
  FinalizacaoTarefaInput,
  inferirOrigemTarefa,
  OBJETIVO_LABEL,
  OBJETIVOS_TAREFA,
  ObjetivoTarefa,
  validarFinalizacaoTarefa,
} from '../utils/tarefaFluxo'
import { supabase } from '../lib/supabase'
import { transcribeCallRecording, fetchCnpjViaBackend, fetchPedidoDocumentosOmie, downloadXmlNfePedido, PedidoDocumentos, fetchWhatsAppMessages, dispararAuditoriaIA, fetchAuditoriaIARegistros } from '../lib/botApi'
import { CLASSIFICACAO_IA_CONFIG, classificarRegistroLocal, type RegistroAuditoriaIA } from '../utils/iaAuditoria'

function normalizarEmpresa(s: string) {
  return s.toLowerCase().trim()
    .replace(/\b(ltda|me|epp|eireli|s\.?a\.?|s\/a|cia|comercio|comércio|industria|indústria|distribui(dora|cao|ção)?|com\.?|ind\.?|imp\.?|exp\.?)\b/gi, '')
    .replace(/[.\-/\/,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

function extrairEmpresaImportada(tarefa: Tarefa) {
  const texto = `${tarefa.titulo || ''}\n${tarefa.descricao || ''}`
  const match = texto.match(/\[Empresa:\s*([^\]]+)\]/i)
  if (!match) return { nome: '', codigo: '' }
  const raw = match[1].trim()
  const idxPipe = raw.indexOf('| Código:')
  const nome = (idxPipe >= 0 ? raw.slice(0, idxPipe) : raw).trim()
  const codigoMatch = raw.match(/\| Código:\s*([^\]]+)/)
  const codigo = codigoMatch ? codigoMatch[1].trim() : ''
  return { nome, codigo }
}

function tarefaPertenceCliente(tarefa: Tarefa, cliente: Cliente) {
  if (tarefa.clienteId === cliente.id) return true
  if (tarefa.clienteId) return false
  const { nome, codigo } = extrairEmpresaImportada(tarefa)
  if (codigo && (cliente.agendorCodigo || '').trim() === codigo) return true
  if (!nome) return false
  const nomeNorm = normalizarEmpresa(nome)
  const razaoNorm = normalizarEmpresa(cliente.razaoSocial)
  const fantasiaNorm = cliente.nomeFantasia ? normalizarEmpresa(cliente.nomeFantasia) : ''
  return razaoNorm === nomeNorm || fantasiaNorm === nomeNorm ||
    (nomeNorm.length >= 4 && razaoNorm.length >= 4 && (razaoNorm.includes(nomeNorm) || nomeNorm.includes(razaoNorm))) ||
    (nomeNorm.length >= 4 && fantasiaNorm.length >= 4 && (fantasiaNorm.includes(nomeNorm) || nomeNorm.includes(fantasiaNorm)))
}

export interface ClientePanelFocus {
  section?: 'cadastro' | 'pedidos' | 'tarefas' | 'historico'
  tarefaId?: number
  pedidoId?: number
}

interface ClientePanelProps {
  cliente: Cliente
  initialFocus?: ClientePanelFocus | null
  todosClientes?: Cliente[]
  onSelectCardCiclo?: (card: Cliente) => void
  onCriarNovoCiclo?: (cliente: Cliente, extras?: Partial<Cliente>, etapa?: string) => Promise<Cliente>
  onTriggerSatisfacao?: (cliente: Cliente) => void
  interacoes: Interacao[]
  atividades?: Atividade[]
  tarefas: Tarefa[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  onClose: () => void
  onEditCliente: (c: Cliente) => void
  onMoverCliente: (id: number, toStage: string, extras?: Partial<Cliente>) => void
  onTriggerAmostra: (cliente: Cliente) => void
  onTriggerNegociacao: (cliente: Cliente) => void
  onNovoCiclo?: (cliente: Cliente) => void
  onTriggerPerda: (cliente: Cliente) => void
  onDeleteTarefa?: (tarefaId: number) => void
  setInteracoes: React.Dispatch<React.SetStateAction<Interacao[]>>
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  setTarefas: React.Dispatch<React.SetStateAction<Tarefa[]>>
  addNotificacao: (tipo: 'info' | 'warning' | 'error' | 'success', titulo: string, mensagem: string, clienteId?: number) => void
  /** Toast visível na tela (diferente de addNotificacao, que só vai para o sino). */
  showToast?: (tipo: 'success' | 'error', texto: string) => void
  produtos?: Produto[]
  pedidos?: Pedido[]
  onAddPedido?: (p: Omit<Pedido, 'id'>) => Promise<void>
  onSolicitarCancelamentoPedido?: (pedidoId: number, motivo: string) => Promise<void>
  /** Edita conteúdo de pedido ainda não integrado ao Omie (rascunho/enviado/recusado). */
  onEditarPedido?: (pedidoId: number, fields: { observacoes?: string; formaPagamento?: string; tipoFrete?: 'CIF' | 'FOB' | 'VISITA' | null; itens?: ItemPedido[]; totalValor?: number; reenviar?: boolean }) => Promise<void>
  /** Redireciona para o Funil já posicionado no card deste cliente. */
  onVerNoFunil?: (c: Cliente) => void
  /** Redireciona para a página de Tarefas. */
  onVerTarefas?: () => void
  /** Exclui o cliente (apenas Gestor). Ação irreversível. */
  onExcluirCliente?: (c: Cliente) => void | Promise<void>
  /** Reativa cliente inativo, voltando à etapa anterior (apenas Gestor). */
  onReativarCliente?: (c: Cliente) => void | Promise<void>
}

let _auditoriasIACache: { ts: number; map: Map<string, RegistroAuditoriaIA> } | null = null

const STATUS_CLIENTE_BADGE: Record<string, { label: string; cls: string; title?: string }> = {
  prospecto: { label: 'Prospecto', cls: 'bg-blue-100 text-blue-700 border-blue-200', title: 'Lead até homologar o produto' },
  ativo: { label: 'Ativo', cls: 'bg-green-100 text-green-700 border-green-200', title: 'Compra dentro de 30 dias' },
  em_risco: { label: 'Em Risco', cls: 'bg-orange-100 text-orange-700 border-orange-200', title: 'Última compra entre 31 e 60 dias' },
  inativo: { label: 'Inativo', cls: 'bg-gray-200 text-gray-700 border-gray-300', title: 'Sem compras há mais de 60 dias' },
  inativado: { label: 'Inativado', cls: 'bg-red-100 text-red-700 border-red-300', title: 'Inativado manualmente no cadastro' },
  descartado: { label: 'Descartado', cls: 'bg-red-100 text-red-700 border-red-200' },
  bloqueado: { label: 'Bloqueado', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
}

function calcStatusAutomatico(
  c: { statusCliente?: string; etapa?: string; dataUltimaVenda?: string; etapaAnterior?: string; inativadoPorAbandono?: boolean },
  ultimaVendaOmieISO?: string | null
): string {
  if (c.statusCliente === 'inativado') return 'inativado'
  if (c.statusCliente === 'descartado') return 'descartado'
  if (c.statusCliente === 'bloqueado') return 'bloqueado'
  if (c.etapa === 'inativo' && c.inativadoPorAbandono !== true) return 'inativado'
  // Condição 5: só considerar "Cliente" (Ativo / Em Risco / Inativo de recompra) quem tem pedido de venda aprovado/faturado no Omie
  if (ultimaVendaOmieISO) {
    const diasSemCompra = Math.floor((Date.now() - new Date(ultimaVendaOmieISO).getTime()) / 86400000)
    if (diasSemCompra <= 30) return 'ativo'
    if (diasSemCompra <= 60) return 'em_risco'
    return 'inativo'
  }
  return 'prospecto'
}

const etapaLabels: Record<string, string> = { 'lead': 'Leads', 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'amostra_perdida': 'Amostra Finalizada', 'proposta': 'Proposta', 'negociacao': 'Negociação', 'follow_up': 'Follow-up', 'arquivado': 'Arquivados', 'inativo': 'Clientes Inativos', 'perdido': 'Perdido' }
const etapaCores: Record<string, string> = { 'lead': 'bg-emerald-100 text-emerald-800', 'prospecção': 'bg-sky-100 text-sky-800', 'amostra': 'bg-amber-100 text-amber-800', 'amostra_perdida': 'bg-orange-100 text-orange-800', 'proposta': 'bg-indigo-100 text-indigo-800', 'negociacao': 'bg-purple-100 text-purple-800', 'follow_up': 'bg-blue-100 text-blue-800', 'arquivado': 'bg-slate-200 text-slate-700', 'inativo': 'bg-gray-200 text-gray-700', 'perdido': 'bg-red-100 text-red-800' }
const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
const tipoInteracaoIcon: Record<string, string> = { email: '📧', whatsapp: '💬', ligacao: '📞', reuniao: '🤝', instagram: '📸', linkedin: '💼', nota: '📝' }
const tipoInteracaoLabel: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', ligacao: 'Ligação', reuniao: 'Reunião', instagram: 'Instagram', linkedin: 'LinkedIn', nota: 'Nota', proposta: 'Proposta', visita: 'Visita' }
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
  const raw = (notas || '').replace(/<br\s*\/?>/gi, '\n').trim()
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
  cliente: c, initialFocus, todosClientes, onSelectCardCiclo, onCriarNovoCiclo, onTriggerSatisfacao, interacoes, atividades, tarefas, vendedores, loggedUser,
  onClose, onEditCliente, onMoverCliente,
  onTriggerAmostra, onTriggerNegociacao, onNovoCiclo, onTriggerPerda, onDeleteTarefa,
  setInteracoes, setClientes, setTarefas, addNotificacao, showToast,
  produtos, pedidos: todosPedidos, onAddPedido, onSolicitarCancelamentoPedido, onEditarPedido,
  onVerNoFunil, onVerTarefas, onExcluirCliente, onReativarCliente
}: ClientePanelProps) {
  const isGerente = loggedUser?.cargo === 'gerente'
  const { opcoesAtivas, reload: reloadParametros, parametros } = useParametrosListas()
  const prazosAtivos = opcoesAtivas('prazo_pagamento')
  const setoresAtivos = opcoesAtivas('setor_contato')
  const fretesAtivos = opcoesAtivas('tipo_frete')
  const segmentosAtivos = opcoesAtivas('segmento_cliente')
  const [produtoPendenteNome, setProdutoPendenteNome] = useState<string | null>(null)
  const [produtoPendenteKg, setProdutoPendenteKg] = useState('')
  const [showCadastroCompleto, setShowCadastroCompleto] = useState(false)
  const [showInfoSituacaoCompra, setShowInfoSituacaoCompra] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [auditoriasIA, setAuditoriasIA] = useState<Map<string, RegistroAuditoriaIA>>(
    () => (_auditoriasIACache && Date.now() - _auditoriasIACache.ts < 60_000 ? _auditoriasIACache.map : new Map())
  )

  useEffect(() => {
    setMapReady(false)
    const t = window.setTimeout(() => setMapReady(true), 220)
    return () => window.clearTimeout(t)
  }, [c.id])

  useEffect(() => {
    if (!isGerente) {
      setAuditoriasIA(new Map())
      return
    }
    if (_auditoriasIACache && Date.now() - _auditoriasIACache.ts < 60_000) {
      setAuditoriasIA(_auditoriasIACache.map)
      return
    }
    fetchAuditoriaIARegistros().then(lista => {
      const m = new Map<string, RegistroAuditoriaIA>()
      for (const r of lista) m.set(r.chave, r)
      _auditoriasIACache = { ts: Date.now(), map: m }
      setAuditoriasIA(m)
    }).catch(() => {})
  }, [isGerente])

  const obterClassificacaoTarefaIA = useCallback((tarefa: Tarefa): { classificacao: 'OK' | 'Fraco' | 'Incoerente'; motivo: string } | null => {
    if (!isGerente || tarefa.status !== 'concluida' || !tarefa.conclusao) return null
    const salva = auditoriasIA.get(`tarefa:${tarefa.id}`)
    if (salva) return { classificacao: salva.classificacao, motivo: salva.motivo }
    return classificarRegistroLocal({
      tipoRegistro: 'tarefa',
      canalUsado: tarefa.canalUsado || tarefa.tipo,
      objetivo: tarefa.objetivo,
      conclusao: tarefa.conclusao,
      justificativaPrazoLongo: tarefa.justificativaPrazoLongo,
    })
  }, [isGerente, auditoriasIA])

  useEffect(() => {
    reloadParametros().catch(() => {})
  }, [c.id])
  const [showVendedorPicker, setShowVendedorPicker] = useState(false)
  const [vendedorSearch, setVendedorSearch] = useState('')
  const [showMaisOpcoesHeader, setShowMaisOpcoesHeader] = useState(false)
  const [showExcluirConfirm, setShowExcluirConfirm] = useState(false)
  const [excluirConfirmText, setExcluirConfirmText] = useState('')
  // Abas do perfil (referência Agendor): Histórico (default) | Negócios
  const [activeTab, setActiveTab] = useState<'historico' | 'negocios' | 'whatsapp'>('historico')

  useEffect(() => {
    if (!initialFocus) return
    if (initialFocus.section === 'cadastro') {
      setShowCadastroCompleto(true)
    } else if (initialFocus.section === 'pedidos') {
      setActiveTab('negocios')
    } else if (initialFocus.section === 'tarefas') {
      setActiveTab('historico')
      if (initialFocus.tarefaId) {
        const alvo = tarefas.find(t => t.id === initialFocus.tarefaId)
        if (alvo?.titulo) setTaskHistorySearch(alvo.titulo)
      }
    }
  }, [c.id, initialFocus?.section, initialFocus?.tarefaId, initialFocus?.pedidoId])
  const notasEmpresa = React.useMemo(() => parseNotasEmpresa(c.notas), [c.notas])
  const [panelAtividadeTipo, setPanelAtividadeTipo] = useState<Interacao['tipo'] | 'proposta' | 'visita' | ''>('')
  const [panelAtividadeDesc, setPanelAtividadeDesc] = useState('')
  const [panelAtividadeObjetivo, setPanelAtividadeObjetivo] = useState<ObjetivoTarefa>('relacionamento')
  const [panelAtividadePrazo, setPanelAtividadePrazo] = useState(new Date().toISOString().split('T')[0])
  const [panelAtividadeHora, setPanelAtividadeHora] = useState(currentTimeHHMM())
  const [panelAtividadeFocused, setPanelAtividadeFocused] = useState(false)
  const [panelAnexo, setPanelAnexo] = useState<File | null>(null)
  const panelAnexoRef = useRef<HTMLInputElement>(null)
  const [panelContatoSetor, setPanelContatoSetor] = useState(notasEmpresa.setor)
  const [panelInfoAdicional, setPanelInfoAdicional] = useState(notasEmpresa.info)
  const [editingInfoAdicional, setEditingInfoAdicional] = useState(false)
  // Documentos fiscais do pedido (Omie): PDF pedido + NF-e
  const [docsPedido, setDocsPedido] = useState<Record<number, PedidoDocumentos | 'loading' | 'error'>>({})
  const [ocorrenciasAbertas, setOcorrenciasAbertas] = useState<Record<number, boolean>>({})
  const toggleDocsPedido = async (pedidoId: number) => {
    const atual = docsPedido[pedidoId]
    if (atual === 'loading') return
    if (atual && atual !== 'error') {
      setDocsPedido(prev => { const n = { ...prev }; delete n[pedidoId]; return n })
      return
    }
    setDocsPedido(prev => ({ ...prev, [pedidoId]: 'loading' }))
    const r = await fetchPedidoDocumentosOmie(pedidoId)
    setDocsPedido(prev => ({ ...prev, [pedidoId]: r.success && r.data ? r.data : 'error' }))
    if (!r.success) showToast?.('error', r.error || 'Falha ao buscar documentos no Omie')
  }
  // Dados cadastrais da Receita Federal (BrasilAPI/ReceitaWS via backend)
  const [dadosCnpj, setDadosCnpj] = useState<any | null>(null)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  useEffect(() => {
    const digits = (c.cnpj || '').replace(/\D/g, '')
    if (digits.length !== 14) { setDadosCnpj(null); return }
    let cancelled = false
    setLoadingCnpj(true)
    fetchCnpjViaBackend(digits)
      .then(data => { if (!cancelled) setDadosCnpj(data) })
      .catch(() => { if (!cancelled) setDadosCnpj(null) })
      .finally(() => { if (!cancelled) setLoadingCnpj(false) })
    return () => { cancelled = true }
  }, [c.cnpj])
  // ─── Família completa de cards/ciclos da empresa (Histórico Global por Cliente — Item 3 + Item 8) ───
  const familiaEmpresa = React.useMemo(() => {
    const base = (todosClientes && todosClientes.length > 0 ? todosClientes : [c]).filter(cl => mesmaEmpresaNoFunil(cl, c))
    return [...base].sort((a, b) => (a.cicloNumero || 0) - (b.cicloNumero || 0) || a.id - b.id)
  }, [todosClientes, c])
  const familiaEmpresaIds = React.useMemo(() => new Set(familiaEmpresa.map(cl => cl.id)), [familiaEmpresa])
  const familiaKeyStr = React.useMemo(() => Array.from(familiaEmpresaIds).sort((a, b) => a - b).join(','), [familiaEmpresaIds])
  const cicloPorCardId = React.useMemo(() => {
    const m = new Map<number, number>()
    familiaEmpresa.forEach((cl, idx) => {
      m.set(cl.id, cl.cicloNumero || idx + 1)
    })
    return m
  }, [familiaEmpresa])

  const clientesParaCalculo = familiaEmpresa
  const situacaoCompraInfo = React.useMemo(() =>
    obterSituacaoCompraCliente(c, familiaEmpresa, todosPedidos || [])
  , [c, familiaEmpresa, todosPedidos])
  const avaliacaoCadastro = React.useMemo(() =>
    avaliarCadastroCliente(c, familiaEmpresa, (parametros.camposCadastroObrigatorios || []) as any)
  , [c, familiaEmpresa, parametros.camposCadastroObrigatorios])

  const salvarCadastroCompleto = useCallback(async (changes: Partial<Cliente>) => {
    // O cadastro pertence à empresa, não a um ciclo específico. Replica nos cards
    // ativos da mesma empresa para que ficha, funil e indicadores não diverjam.
    const alvos = familiaEmpresa.filter(cl => !cl.arquivadoDuplicata)
    const alvosIds = alvos.length > 0 ? alvos.map(cl => cl.id) : [c.id]
    await Promise.all(alvosIds.map(id => db.updateCliente(id, changes)))
    const setIds = new Set(alvosIds)
    setClientes(prev => prev.map(cl => setIds.has(cl.id) ? { ...cl, ...changes } : cl))
    if (Array.isArray(changes.cadastroJustificativas) && changes.cadastroJustificativas.length > 0) {
      const ultimaAtiva = [...changes.cadastroJustificativas].reverse().find(j => j.ativo !== false && j.justificativa?.trim())
      if (ultimaAtiva) {
        dispararAuditoriaIA({ tipo: 'cadastro', clienteId: c.id, campo: ultimaAtiva.campo, justificativa: ultimaAtiva.justificativa })
      }
    }
    showToast?.('success', 'Cadastro atualizado.')
  }, [c.id, familiaEmpresa, setClientes, showToast])

  // Condição 5 + Item 3 Sapori: última venda e última amostra considerando TODOS os pedidos de TODOS os ciclos da empresa
  const ultimaVendaOmieISO = React.useMemo(() => {
    const vendasOmie = (todosPedidos || []).filter(p =>
      familiaEmpresaIds.has(p.clienteId) &&
      p.status === 'confirmado' &&
      p.tipo !== 'bonificacao' &&
      Boolean(p.omieCodigo || p.omieNumero) &&
      p.omieStatus !== 'cancelado'
    )
    const datasPedidos = vendasOmie.map(p => p.dataAprovacao || p.dataCriacao).filter(Boolean)
    if (datasPedidos.length > 0) {
      datasPedidos.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      return datasPedidos[datasPedidos.length - 1]
    }
    return null
  }, [todosPedidos, familiaEmpresaIds])

  const ultimaVendaExibicaoISO = situacaoCompraInfo.ultimaVenda

  const ultimaAmostraExibicaoISO = React.useMemo(() => {
    const amostras = (todosPedidos || []).filter(p =>
      familiaEmpresaIds.has(p.clienteId) && p.status !== 'cancelado' && p.tipo === 'bonificacao'
    )
    const datas = [
      ...amostras.map(p => p.dataAprovacao || p.dataCriacao),
      ...familiaEmpresa.filter(cl => !cl.arquivadoDuplicata).map(cl => cl.dataUltimaAmostra || cl.dataEnvioAmostra),
    ].filter(Boolean) as string[]
    if (datas.length === 0) return null
    datas.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    return datas[datas.length - 1]
  }, [todosPedidos, familiaEmpresaIds, familiaEmpresa])

  const scoreUnificado = React.useMemo(() => {
    const visiveis = familiaEmpresa.filter(cl => !cl.arquivadoDuplicata)
    const base = visiveis.length > 0 ? visiveis : [c]
    return Math.max(...base.map(cl => cl.score ?? 0))
  }, [familiaEmpresa, c])

  // Histórico WhatsApp completo do cliente em todos os ciclos (tab "Ver WhatsApp")
  useEffect(() => {
    if (activeTab !== 'whatsapp' || !c.id) return
    let cancelled = false
    setWaHistoricoLoading(true)
    const ids = Array.from(familiaEmpresaIds)
    const numRef = (c.whatsapp || c.contatoCelular || c.contatoTelefone || '').replace(/\D/g, '')
    Promise.all([
      ...ids.map(cid => fetchWhatsAppMessages({ clienteId: cid, limit: 200 }).catch(() => [])),
      numRef.length >= 8 ? fetchWhatsAppMessages({ numero: numRef, limit: 200 }).catch(() => []) : Promise.resolve([]),
    ])
      .then(listas => {
        if (cancelled) return
        const unicos = new Map<string | number, any>()
        listas.flat().forEach(m => { if (m && m.id != null) unicos.set(m.id, m) })
        const ordenadas = Array.from(unicos.values()).sort((a, b) => String(a.createdAt || a.created_at || '').localeCompare(String(b.createdAt || b.created_at || '')))
        setWaHistorico(ordenadas)
      })
      .catch(() => { if (!cancelled) setWaHistorico([]) })
      .finally(() => { if (!cancelled) setWaHistoricoLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, c.id, familiaKeyStr])
  React.useEffect(() => {
    if (!editingInfoAdicional) {
      setPanelInfoAdicional(notasEmpresa.info)
      setPanelContatoSetor(notasEmpresa.setor)
    }
  }, [c.notas])
  const [editingInter, setEditingInter] = useState<{ id: number; tipo: Interacao['tipo']; descricao: string; prazo: string; hora: string; responsavelId: number | '' } | null>(null)
  const [editingInterSaving, setEditingInterSaving] = useState(false)
  // Redes sociais estruturadas (suporta JSON e formato importado "Instagram: url | Facebook: url")
  type RedesSociaisMap = Record<string, string>
  const [redesSociaisMap, setRedesSociaisMap] = useState<RedesSociaisMap>(() =>
    parseRedesSociaisMap(c.redesSociais, c)
  )
  const [socialModalOpen, setSocialModalOpen] = useState<string | null>(null)
  const [socialModalValue, setSocialModalValue] = useState('')
  // keep legacy string in sync for other parts that use panelRedesSociais
  const [panelRedesSociais, setPanelRedesSociais] = useState(c.redesSociais || '')
  const [pinnedInteracoes, setPinnedInteracoes] = useState<number[]>([])
  const [finalizandoInteracaoId, setFinalizandoInteracaoId] = useState<number | null>(null)
  const [finalizandoObs, setFinalizandoObs] = useState('')
  const [reagendandoInteracaoId, setReagendandoInteracaoId] = useState<number | null>(null)
  const [reagendandoMotivo, setReagendandoMotivo] = useState('')
  const [reagendandoData, setReagendandoData] = useState(new Date().toISOString().split('T')[0])
  const [reagendandoHora, setReagendandoHora] = useState('')
  const [panelNovaTarefa, setPanelNovaTarefa] = useState(false)
  const [panelTarefaTitulo, setPanelTarefaTitulo] = useState('')
  const [panelTarefaData, setPanelTarefaData] = useState(new Date().toISOString().split('T')[0])
  const [panelTarefaHora, setPanelTarefaHora] = useState('')
  const [panelTarefaTipo, setPanelTarefaTipo] = useState<CanalTarefa | ''>('')
  const [panelTarefaObjetivo, setPanelTarefaObjetivo] = useState<ObjetivoTarefa>('relacionamento')
  const [panelTarefaPrioridade, setPanelTarefaPrioridade] = useState<Tarefa['prioridade']>('media')
  const [panelResponsavelId, setPanelResponsavelId] = useState<number | ''>(c.vendedorId || '')
  const [taskHistorySearch, setTaskHistorySearch] = useState('')
  const [taskHistoryLimit, setTaskHistoryLimit] = useState(5)
  const [showCallRecorder, setShowCallRecorder] = useState(false)
  const [showProspeccaoModal, setShowProspeccaoModal] = useState(false)
  const [prospeccaoVendedorId, setProspeccaoVendedorId] = useState<number | ''>('')

  // Pedido rápido state
  const [showPedido, setShowPedido] = useState(false)
  const [pedidoTipo, setPedidoTipo] = useState<'venda' | 'bonificacao'>('venda')
  const [pedidoFrete, setPedidoFrete] = useState<'CIF' | 'FOB' | 'VISITA' | ''>('')
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
  const editPropostaLockRef = useRef(false)
  const [ultimaProposta, setUltimaProposta] = useState<PropostaHistorico | null>(null)
  const [editPropostaItens, setEditPropostaItens] = useState<ItemPedido[]>([])
  const [editPropostaFrete, setEditPropostaFrete] = useState<'CIF' | 'FOB' | 'VISITA' | ''>('')
  const [editPropostaPagamento, setEditPropostaPagamento] = useState(DEFAULT_PAYMENT_TERM)
  const [editPropostaObs, setEditPropostaObs] = useState('')
  const [editPropostaSaving, setEditPropostaSaving] = useState(false)
  const [editPropostaProdSearch, setEditPropostaProdSearch] = useState('')

  // Modal cancelamento de pedido
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelPedidoId, setCancelPedidoId] = useState<number | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)

  // Modal edição de pedido (item 4.6 — só rascunho/enviado, antes do Omie)
  const [editPedido, setEditPedido] = useState<Pedido | null>(null)
  const [editPedidoItens, setEditPedidoItens] = useState<ItemPedido[]>([])
  const [editPedidoObs, setEditPedidoObs] = useState('')
  const [editPedidoPagamento, setEditPedidoPagamento] = useState(DEFAULT_PAYMENT_TERM)
  const [editPedidoFrete, setEditPedidoFrete] = useState<'CIF' | 'FOB' | 'VISITA' | ''>('')
  const [editPedidoProdutoSel, setEditPedidoProdutoSel] = useState<number | ''>('')
  const [editPedidoSaving, setEditPedidoSaving] = useState(false)
  const [ganhouLoading, setGanhouLoading] = useState(false)

  // Modal aprovação por item de amostra
  const [showAvaliarAmostra, setShowAvaliarAmostra] = useState(false)
  type AvaliacaoItem = { aprovado: boolean | null; motivo: string }
  const [avaliacaoItens, setAvaliacaoItens] = useState<Record<number, AvaliacaoItem>>({})

  // Gravações de ligação
  const [gravacoes, setGravacoes] = useState<any[]>([])
  const [transcricoes, setTranscricoes] = useState<Record<number, string>>({})
  const [transcrevendo, setTranscrevendo] = useState<Record<number, boolean>>({})

  // Carregar propostas e histórico de mudanças de etapa de TODOS os ciclos da empresa (Item 3 + Item 8)
  const [todasPropostas, setTodasPropostas] = useState<PropostaHistorico[]>([])
  const [historicoEtapasGlobal, setHistoricoEtapasGlobal] = useState<Array<{ id: number; cliente_id: number; etapa: string; etapa_anterior?: string; data: string; observacao?: string }>>([])
  const [showPropostasAnteriores, setShowPropostasAnteriores] = useState(false)
  const [propostasExpandidas, setPropostasExpandidas] = useState<Set<number>>(new Set())
  const togglePropostaExpandida = (id: number) => setPropostasExpandidas(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  useEffect(() => {
    const ids = Array.from(familiaEmpresaIds)
    if (ids.length === 0) return
    Promise.all(ids.map(cid => fetchPropostasByCliente(cid).catch(() => [])))
      .then(listas => {
        const todas = listas.flat().sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
        const doCardAtual = todas.find(p => p.clienteId === c.id) || null
        setUltimaProposta(doCardAtual)
        setTodasPropostas(todas)
      })
      .catch(() => {})
    supabase
      .from('historico_etapas')
      .select('id, cliente_id, etapa, etapa_anterior, data, observacao, created_at')
      .in('cliente_id', ids)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setHistoricoEtapasGlobal(data as any)
      })
  }, [c.id, familiaKeyStr])

  // Pedido real aguardando aprovação do gerente. Usa a tabela de pedidos como fonte
  // de verdade — o campo statusFollowUp pode ficar travado ('aguardando_aprovacao_gerente')
  // se um pedido foi recusado, o que deixava o botão "Ganhou" desabilitado para sempre.
  const pedidoAguardandoAprovacao = (todosPedidos || []).some(p => p.clienteId === c.id && p.status === 'enviado')
  const pedidoRecusadoEditavel = React.useMemo(() => {
    const recusados = (todosPedidos || [])
      .filter(p => p.clienteId === c.id && p.status === 'cancelado' && Boolean(p.motivoRecusa) && !p.omieCodigo)
      .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())
    return recusados[0] || null
  }, [todosPedidos, c.id])

  const abrirEdicaoProposta = () => {
    const itens = ultimaProposta && Array.isArray(ultimaProposta.itens) ? ultimaProposta.itens : []
    setEditPropostaItens(itens.map(i => ({ ...i })))
    setEditPropostaFrete((ultimaProposta?.frete as 'CIF' | 'FOB' | '') || '')
    setEditPropostaPagamento(ultimaProposta?.pagamento || DEFAULT_PAYMENT_TERM)
    setEditPropostaObs(ultimaProposta?.observacoes || '')
    setEditPropostaProdSearch('')
    setShowEditProposta(true)
  }

  useEffect(() => {
    const ids = Array.from(familiaEmpresaIds)
    if (ids.length === 0) return
    supabase
      .from('gravacoes_chamada')
      .select('*')
      .in('cliente_id', ids)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        setGravacoes(data)
        const trMap: Record<number, string> = {}
        for (const g of data) {
          if (g.transcricao) trMap[g.id] = g.transcricao
        }
        setTranscricoes(trMap)
      })
  }, [c.id, familiaKeyStr])

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
  const [waHistorico, setWaHistorico] = useState<any[]>([])
  const [waHistoricoLoading, setWaHistoricoLoading] = useState(false)
  const [produtoInteresseBusca, setProdutoInteresseBusca] = useState('')
  const [salvandoProdutosInteresse, setSalvandoProdutosInteresse] = useState(false)

  // Refs for scroll-to
  const whatsAppRef = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLDivElement>(null)

  const vendedor = vendedores.find(v => v.id === c.vendedorId)
  const diasNaEtapa = c.dataEntradaEtapa ? Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000) : 0

  // Histórico Global por Cliente (Item 3 + Condição 8): agrega TODOS os ciclos da empresa!
  const clienteInteracoesBase = interacoes.filter(i => familiaEmpresaIds.has(i.clienteId))
  const clienteTarefasBase = React.useMemo(() => {
    const vistas = new Set<number>()
    const out: Tarefa[] = []
    const codigosFamilia = new Set(familiaEmpresa.map(cl => (cl.agendorCodigo || '').trim()).filter(Boolean))
    const nomesFamilia = familiaEmpresa.flatMap(cl => [
      normalizarEmpresa(cl.razaoSocial),
      cl.nomeFantasia ? normalizarEmpresa(cl.nomeFantasia) : '',
    ]).filter(Boolean)
    for (const t of tarefas) {
      if (vistas.has(t.id)) continue
      if (t.clienteId) {
        if (familiaEmpresaIds.has(t.clienteId)) {
          vistas.add(t.id)
          out.push(t)
        }
        continue
      }
      const { nome, codigo } = extrairEmpresaImportada(t)
      if (codigo && codigosFamilia.has(codigo)) {
        vistas.add(t.id)
        out.push(t)
        continue
      }
      if (!nome) continue
      const nomeNorm = normalizarEmpresa(nome)
      if (!nomeNorm) continue
      if (nomesFamilia.some(nf => nf === nomeNorm || (nomeNorm.length >= 4 && nf.length >= 4 && (nf.includes(nomeNorm) || nomeNorm.includes(nf))))) {
        vistas.add(t.id)
        out.push(t)
      }
    }
    return out
  }, [tarefas, familiaEmpresaIds, familiaEmpresa])

  const limparConclusao = (txt?: string) => (txt || '').split(/\n*\[CONCLUSAO\]/i)[0].trim()
  const tarefasVinculadasIds = new Set<number>()
  for (const inter of clienteInteracoesBase) {
    const interDescBase = limparConclusao(inter.descricao)
    const interTs = new Date(inter.data).getTime()
    const t = clienteTarefasBase.find(t => {
      if (tarefasVinculadasIds.has(t.id)) return false
      const tDescBase = limparConclusao(t.descricao)
      const descMatch = tDescBase.length > 3 && tDescBase === interDescBase
      const tituloLower = (t.titulo || '').toLowerCase()
      const assuntoLower = (inter.assunto || '').toLowerCase()
      const assuntoMatch = assuntoLower.length > 5 && tituloLower.includes(assuntoLower.slice(0, 30))
      const tTs = t.criadoEm ? new Date(t.criadoEm).getTime() : NaN
      const tsMatch = Number.isFinite(interTs) && Number.isFinite(tTs) && Math.abs(interTs - tTs) < 15_000 && t.clienteId === inter.clienteId
      return descMatch || assuntoMatch || tsMatch
    })
    if (t) tarefasVinculadasIds.add(t.id)
  }

  // Offsets negativos para itens sintéticos de todas as origens do Item 8 na timeline unificada:
  const GRAVACAO_ID_OFFSET = 10_000_000
  const PROPOSTA_ID_OFFSET = 20_000_000
  const AMOSTRA_ID_OFFSET = 30_000_000
  const ETAPA_ID_OFFSET = 40_000_000
  const ATIVIDADE_ID_OFFSET = 50_000_000

  const razaoNormUpper = (c.razaoSocial || '').trim().toUpperCase()
  const atividadesDoCliente = React.useMemo(() => {
    if (!atividades || razaoNormUpper.length < 4) return []
    return atividades.filter(a =>
      !String(a.tipo || '').startsWith('store:') &&
      String(a.descricao || '').toUpperCase().includes(razaoNormUpper)
    )
  }, [atividades, razaoNormUpper])

  const amostrasDaEmpresa = React.useMemo(
    () => (todosPedidos || []).filter(p => familiaEmpresaIds.has(p.clienteId) && p.tipo === 'bonificacao'),
    [todosPedidos, familiaEmpresaIds]
  )

  type InteracaoGlobal = Interacao & { cicloOrigem?: number; anexoNome?: string }

  const clienteInteracoes: InteracaoGlobal[] = [
    ...clienteInteracoesBase.map(i => ({
      ...i,
      cicloOrigem: cicloPorCardId.get(i.clienteId) || 1,
    })),
    ...clienteTarefasBase.filter(t => !tarefasVinculadasIds.has(t.id)).map(t => {
      const checkInInfo = t.chegadaEm
        ? `\n📍 Check-in de visita: ${new Date(t.chegadaEm).toLocaleString('pt-BR')}${t.resultado ? ` · Resultado: ${t.resultado}` : ''}`
        : ''
      const missaoInfo = t.missaoId ? `\n🚩 Missão comercial #${t.missaoId}` : ''
      return {
        id: -t.id,
        clienteId: t.clienteId || c.id,
        cicloOrigem: (t.clienteId ? cicloPorCardId.get(t.clienteId) : undefined) || 1,
        tipo: (t.tipo === 'ligacao' || t.tipo === 'whatsapp' || t.tipo === 'email' || t.tipo === 'reuniao' ? t.tipo : 'nota') as Interacao['tipo'],
        assunto: t.titulo,
        descricao: `${t.descricao || t.titulo}${checkInInfo}${missaoInfo}`,
        data: t.criadoEm || `${t.data}T${t.hora || '00:00'}`,
        automatico: Boolean((t as any).origemAutomacaoId),
      } as InteracaoGlobal
    }),
    ...gravacoes
      .filter(g => !clienteInteracoesBase.some(i =>
        i.tipo === 'ligacao' && Math.abs(new Date(i.data).getTime() - new Date(g.created_at).getTime()) < 24 * 3600 * 1000
      ))
      .map(g => ({
        id: -(g.id + GRAVACAO_ID_OFFSET),
        clienteId: g.cliente_id || c.id,
        cicloOrigem: cicloPorCardId.get(g.cliente_id) || 1,
        tipo: 'ligacao' as Interacao['tipo'],
        assunto: `Ligação - ${c.razaoSocial}`,
        descricao: `Ligação gravada para ${g.numero_telefone || '—'}${g.notas ? ` — ${g.notas}` : ''}`,
        data: g.created_at,
        automatico: true,
      } as InteracaoGlobal)),
    ...todasPropostas.map(pr => ({
      id: -(pr.id + PROPOSTA_ID_OFFSET),
      clienteId: pr.clienteId,
      cicloOrigem: cicloPorCardId.get(pr.clienteId) || 1,
      tipo: 'nota' as Interacao['tipo'],
      assunto: `Proposta - ${pr.numero}`,
      descricao: `Proposta ${pr.numero} (${pr.vendedorNome || 'Comercial'}) — R$ ${(pr.totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${pr.pagamento ? ` · Pgto: ${pr.pagamento}` : ''}${pr.frete ? ` · Frete: ${pr.frete}` : ''}${pr.observacoes ? `\n${pr.observacoes}` : ''}`,
      data: pr.criadoEm,
      automatico: false,
    } as InteracaoGlobal)),
    ...amostrasDaEmpresa.map(am => ({
      id: -(am.id + AMOSTRA_ID_OFFSET),
      clienteId: am.clienteId,
      cicloOrigem: cicloPorCardId.get(am.clienteId) || 1,
      tipo: 'nota' as Interacao['tipo'],
      assunto: `${am.numero?.toUpperCase().startsWith('BON-') ? 'Bonificação' : 'Amostra'} - ${am.numero}`,
      descricao: `${am.numero?.toUpperCase().startsWith('BON-') ? 'Bonificação comercial' : 'Envio de amostra'} ${am.numero} (${am.status})${(am.itens || []).length > 0 ? ` — ${am.itens.map(it => `${it.nomeProduto} (${it.quantidade} kg)`).join(', ')}` : ''}`,
      data: am.dataCriacao,
      automatico: false,
    } as InteracaoGlobal)),
    ...historicoEtapasGlobal.map(h => ({
      id: -(h.id + ETAPA_ID_OFFSET),
      clienteId: h.cliente_id,
      cicloOrigem: cicloPorCardId.get(h.cliente_id) || 1,
      tipo: 'nota' as Interacao['tipo'],
      assunto: 'Mudança de etapa',
      descricao: `Etapa alterada${h.etapa_anterior ? ` de ${etapaLabels[h.etapa_anterior] || h.etapa_anterior}` : ''} para ${etapaLabels[h.etapa] || h.etapa}${h.observacao ? ` — ${h.observacao}` : ''}`,
      data: (h as any).created_at || h.data,
      automatico: true,
    } as InteracaoGlobal)),
    ...atividadesDoCliente
      .filter(a => a.tipo !== 'moveu') // mudanças de etapa já vêm com ciclo exato via historico_etapas
      .map(a => ({
        id: -(a.id + ATIVIDADE_ID_OFFSET),
        clienteId: c.id,
        cicloOrigem: cicloPorCardId.get(c.id) || 1,
        tipo: (a.tipo === 'whatsapp' || a.tipo === 'email' || a.tipo === 'ligacao' ? a.tipo : 'nota') as Interacao['tipo'],
        assunto: `Atividade (${a.vendedorNome || 'Sistema'})`,
        descricao: a.descricao,
        data: a.timestamp,
        automatico: a.vendedorNome === 'Sistema',
      } as InteracaoGlobal)),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  const clienteInteracoesOrdenadas = [...clienteInteracoes].sort((a, b) => {
    const aPinned = pinnedInteracoes.includes(a.id)
    const bPinned = pinnedInteracoes.includes(b.id)
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    return new Date(b.data).getTime() - new Date(a.data).getTime()
  })
  const clienteTarefas = [...clienteTarefasBase].sort((a, b) => {
    const aPinned = pinnedInteracoes.includes(-a.id)
    const bPinned = pinnedInteracoes.includes(-b.id)
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    if ((a.status === 'concluida') !== (b.status === 'concluida')) return a.status === 'concluida' ? -1 : 1
    if (a.status === 'concluida') return (b.concluidaEm || b.data).localeCompare(a.concluidaEm || a.data)
    return a.data.localeCompare(b.data)
  })
  const taskHistoryQuery = taskHistorySearch.toLowerCase().trim()
  const filteredTaskHistory = taskHistoryQuery
    ? clienteTarefas.filter(t => `${t.titulo} ${t.descricao || ''}`.toLowerCase().includes(taskHistoryQuery))
    : clienteTarefas
  const visibleTaskHistory = filteredTaskHistory.slice(0, taskHistoryLimit)
  const extrairKgMes = (val: number | ConsumoProdutoInfo | undefined): number | '' => {
    if (val === undefined || val === null) return ''
    if (typeof val === 'number') return Number.isFinite(val) ? val : ''
    return typeof val.kgMes === 'number' && Number.isFinite(val.kgMes) ? val.kgMes : ''
  }

  // Consolida produtos de interesse + kg/mês entre todos os cards da empresa para não perder dados de ciclos anteriores
  const consumoUnificado = React.useMemo(() => {
    const familia = familiaEmpresa
    const nomes = new Set<string>(c.produtosInteresse || [])
    const mapa: ProdutosConsumoMap = {}
    // Ordem crescente de id para que o mais recente / card atual prevaleça
    ;[...familia].sort((a, b) => a.id - b.id).forEach(cl => {
      ;(cl.produtosInteresse || []).forEach(n => { if (n) nomes.add(n) })
      if (cl.produtosQuantidadesMensais) {
        Object.entries(cl.produtosQuantidadesMensais).forEach(([prodNome, info]) => {
          nomes.add(prodNome)
          mapa[prodNome] = info
        })
      }
    })
    if (c.produtosQuantidadesMensais) {
      Object.entries(c.produtosQuantidadesMensais).forEach(([prodNome, info]) => {
        nomes.add(prodNome)
        mapa[prodNome] = info
      })
    }
    return { lista: Array.from(nomes), mapa }
  }, [c, todosClientes])

  const salvarProdutosEConsumo = async (novaLista: string[], novoMapa: ProdutosConsumoMap) => {
    if (salvandoProdutosInteresse) return
    setSalvandoProdutosInteresse(true)
    try {
      const familia = (todosClientes && todosClientes.length > 0 ? todosClientes : [c]).filter(cl => !cl.arquivadoDuplicata && mesmaEmpresaNoFunil(cl, c))
      const alvosIds = familia.length > 0 ? familia.map(cl => cl.id) : [c.id]
      await Promise.all(alvosIds.map(id => db.updateCliente(id, {
        produtosInteresse: novaLista,
        produtosQuantidadesMensais: novoMapa,
      })))
      const setIds = new Set(alvosIds)
      setClientes(prev => prev.map(cl => setIds.has(cl.id) ? { ...cl, produtosInteresse: novaLista, produtosQuantidadesMensais: novoMapa } : cl))
    } catch (err) {
      logger.error('Erro ao atualizar produtos de interesse / consumo:', err)
      addNotificacao('error', 'Erro ao salvar', 'Não foi possível atualizar os produtos de interesse.', c.id)
    } finally {
      setSalvandoProdutosInteresse(false)
    }
  }

  const atualizarProdutosInteresse = async (produtosInteresse: string[]) => {
    const novoMapa: ProdutosConsumoMap = { ...consumoUnificado.mapa }
    Object.keys(novoMapa).forEach(k => {
      if (!produtosInteresse.includes(k)) delete novoMapa[k]
    })
    await salvarProdutosEConsumo(produtosInteresse, novoMapa)
  }

  const atualizarConsumoKgMes = async (nomeProduto: string, rawDigits: string): Promise<boolean> => {
    const limpo = rawDigits.replace(/\D/g, '')
    const kgMes = limpo === '' ? 0 : Number(limpo)
    if (!Number.isFinite(kgMes) || kgMes <= 0) {
      showToast?.('error', 'Informe um consumo mensal maior que 0 kg/mês.')
      return false
    }
    const prodCatalogo = (produtos || []).find(p => p.nome === nomeProduto)
    const info: ConsumoProdutoInfo = {
      kgMes,
      atualizadoEm: new Date().toISOString(),
      vendedorId: loggedUser?.id || c.vendedorId,
      vendedorNome: loggedUser?.nome,
      produtoId: prodCatalogo?.id,
      clienteId: c.empresaFunilId || c.id,
      produto: nomeProduto,
    }
    const novaLista = consumoUnificado.lista.includes(nomeProduto) ? consumoUnificado.lista : [...consumoUnificado.lista, nomeProduto]
    const novoMapa: ProdutosConsumoMap = { ...consumoUnificado.mapa, [nomeProduto]: info }
    await salvarProdutosEConsumo(novaLista, novoMapa)
    return true
  }
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
    const isDescricaoEmpresa = /(cnpj|data de abertura|situação cadastral|situacao cadastral|quadro de sócios|quadro de socios|porte da empresa|atividade econômica|cnae|capital social|faturamento presumido|inscrição estadual|inscricao estadual)/i.test(panelAtividadeDesc.trim())
    const isNota = panelAtividadeTipo === 'nota' || isDescricaoEmpresa
    const semTipo = !panelAtividadeTipo
    // proposta/visita/atividades com tipo precisam de prazo; semTipo usa padrão
    const precisaPrazo = !isNota && !semTipo
    // sempre usa fallback — nunca bloqueia por falta de prazo/hora
    const prazoFinal = panelAtividadePrazo || new Date().toISOString().split('T')[0]
    const horaFinal = panelAtividadeHora || currentTimeHHMM()
    if (precisaPrazo && !prazoFinal) return
    const labelMap: Record<string, string> = {
      proposta: 'Proposta', visita: 'Visita', reuniao: 'Reunião',
      ligacao: 'Ligação', email: 'E-mail', whatsapp: 'WhatsApp', nota: 'Nota'
    }
    const canalDireto = (['ligacao', 'whatsapp', 'email', 'visita', 'reuniao'] as string[]).includes(panelAtividadeTipo as string)
      ? panelAtividadeTipo as CanalTarefa
      : null
    const tipoTarefaPrevisto = canalDireto || panelTarefaTipo
    if (!isNota && !tipoTarefaPrevisto) {
      addNotificacao('warning', 'Tipo obrigatório', 'Selecione o tipo previsto da tarefa: Ligação, WhatsApp, E-mail, Visita ou Reunião.', c.id)
      return
    }
    try {
      // tipos que não existem em Interacao['tipo'] — salvar como 'nota'
      const tiposExtraComoNota = ['proposta', 'visita']
      const isExtra = tiposExtraComoNota.includes(panelAtividadeTipo as string)
      const tipoInteracao = (isDescricaoEmpresa || isExtra || semTipo ? 'nota' : panelAtividadeTipo) as Interacao['tipo']
      const labelAtividade = isDescricaoEmpresa
        ? 'Nota'
        : (semTipo ? 'Tarefa' : (labelMap[panelAtividadeTipo as string] || panelAtividadeTipo || 'Atividade'))

      // Upload de anexo se houver
      let anexoUrl: string | null = null
      let anexoNome: string | null = null
      if (panelAnexo) {
        const ext = panelAnexo.name.split('.').pop() || 'bin'
        const path = `${c.id}/${Date.now()}_${panelAnexo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { data: upData, error: upErr } = await supabase.storage
          .from('interacoes-anexos')
          .upload(path, panelAnexo, { upsert: false })
        if (!upErr && upData) {
          const { data: urlData } = supabase.storage.from('interacoes-anexos').getPublicUrl(upData.path)
          anexoUrl = urlData?.publicUrl || null
          anexoNome = panelAnexo.name
        }
      }

      const descFinal = panelAtividadeDesc.trim() + (anexoUrl ? `\n\n📎 [${anexoNome}](${anexoUrl})` : '')
      const savedI = await db.insertInteracao({
        clienteId: c.id, tipo: tipoInteracao, data: new Date().toISOString(),
        assunto: `${labelAtividade} - ${c.razaoSocial}`,
        descricao: descFinal, automatico: false
      })
      setInteracoes(prev => [savedI, ...prev])

      // Nota continua fora da cadência. Qualquer tarefa nova precisa ter um dos
      // cinco tipos previstos da especificação; Proposta/atividade livre exigem
      // a escolha explícita desse tipo antes de salvar.
      const gerarTarefa = !isNota
      if (gerarTarefa) {
        const savedT = await db.insertTarefa({
          titulo: `Retorno: ${labelAtividade} - ${c.razaoSocial}`,
          descricao: panelAtividadeDesc.trim(),
          data: prazoFinal,
          hora: horaFinal,
          tipo: tipoTarefaPrevisto as Tarefa['tipo'],
          status: 'pendente',
          prioridade: 'media',
          clienteId: c.id,
          vendedorId: (panelResponsavelId !== '' ? panelResponsavelId : (c.vendedorId || loggedUser?.id)),
          objetivo: panelAtividadeObjetivo,
          origem: 'manual',
          criadoPor: loggedUser?.nome || 'Vendedor',
        })
        setTarefas(prev => [savedT, ...prev])
      }

      const hoje = new Date().toISOString().split('T')[0]
      await db.updateCliente(c.id, { ultimaInteracao: hoje })
      setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, ultimaInteracao: hoje } : cl))
      // Só limpa e notifica sucesso se chegou aqui sem erro
      const labelFinal = labelMap[panelAtividadeTipo as string] || 'Atividade'
      const msg = isNota
        ? `Nota salva para ${c.razaoSocial}`
        : semTipo
        ? `Tarefa genérica criada para ${c.razaoSocial}`
        : `${labelFinal}: ${c.razaoSocial} (prazo ${prazoFinal ? new Date(prazoFinal).toLocaleDateString('pt-BR') : '—'} às ${horaFinal})`
      addNotificacao('success', 'Atividade registrada', msg, c.id)
      setPanelAtividadeTipo('')
      setPanelAtividadeDesc('')
      setPanelAtividadeObjetivo('relacionamento')
      setPanelTarefaTipo('')
      setPanelResponsavelId(c.vendedorId || '')
      setPanelAnexo(null)
      setPanelAtividadeFocused(false)
      if (panelAnexoRef.current) panelAnexoRef.current.value = ''
    } catch (err: any) {
      logger.error('Erro ao registrar atividade:', err)
      addNotificacao('error', 'Erro ao salvar', `Não foi possível registrar: ${err?.message || err?.code || 'erro desconhecido'}`, c.id)
      alert(`Erro ao salvar: ${err?.message || err?.code || JSON.stringify(err)}`)
    }
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
        notas: notas,
      })
      setClientes(prev => prev.map(cl => cl.id === c.id ? {
        ...cl,
        redesSociais: jsonStr || undefined,
        notas: notas,
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

  const handleEditarTarefa = async (tarefa: Tarefa) => {
    const titulo = window.prompt('Editar título da tarefa', tarefa.titulo)
    if (titulo === null) return
    const descricao = window.prompt('Editar descrição da tarefa', tarefa.descricao || '')
    if (descricao === null) return
    const updated = { ...tarefa, titulo: titulo.trim() || tarefa.titulo, descricao: descricao.trim() }
    await db.updateTarefa(tarefa.id, updated)
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? updated : t))
    addNotificacao('success', 'Tarefa editada', updated.titulo, c.id)
  }

  const handleFinalizarTarefaComProximoPasso = useCallback(async (tarefa: Tarefa, finalizacao: FinalizacaoTarefaInput) => {
    const outraAberta = clienteJaTemOutraTarefaAberta(tarefa, tarefas, clientesParaCalculo)
    const exigeProdutos = ehTarefaIncluirProdutos(tarefa, parametros.tarefasPadraoCadastro?.incluirProdutos)
      && !temJustificativaAtiva(c, 'produtos_interesse', clientesParaCalculo)
    const erro = validarFinalizacaoTarefa(finalizacao, new Date(), {
      exigeProximoPasso: !outraAberta,
      exigeProdutosInteresse: exigeProdutos,
    })
    if (erro) {
      showToast?.('error', erro)
      throw new Error(erro)
    }
    try {
      if (finalizacao.produtosInteresseRegistro) {
        await salvarCadastroCompleto({
          produtosInteresse: finalizacao.produtosInteresseRegistro.produtosInteresse,
          produtosQuantidadesMensais: finalizacao.produtosInteresseRegistro.produtosQuantidadesMensais,
        })
      }
      const agora = new Date().toISOString()
      let proximaSalva: Tarefa | null = null
      if (finalizacao.proximoPasso) {
        const proximaTarefa = buildProximaTarefa(tarefa, finalizacao, c, loggedUser?.nome || 'Vendedor')
        proximaSalva = await db.insertTarefa(proximaTarefa)
      }
      const justPrazoLongo = finalizacao.proximoPasso && exigeJustificativaPrazoLongo(finalizacao.proximoPasso.data)
        ? finalizacao.proximoPasso.justificativaPrazoLongo
        : tarefa.justificativaPrazoLongo
      const updates: Partial<Tarefa> = {
        status: 'concluida',
        concluidaEm: agora,
        concluidaPor: loggedUser?.nome || 'Vendedor',
        canalUsado: finalizacao.canalUsado,
        descricao: tarefa.descricao || '',
        conclusao: finalizacao.conclusao,
        justificativaPrazoLongo: justPrazoLongo,
        proximaTarefaId: proximaSalva?.id ?? outraAberta?.id,
      }
      try {
        await db.updateTarefa(tarefa.id, updates)
      } catch (updErr) {
        if (proximaSalva) {
          await db.deleteTarefa(proximaSalva.id).catch(() => {})
        }
        throw updErr
      }
      setTarefas(prev => [
        ...(proximaSalva ? [proximaSalva] : []),
        ...prev.map(t => t.id === tarefa.id ? { ...t, ...updates } as Tarefa : t),
      ])
      dispararAuditoriaIA({ tipo: 'tarefa', tarefaId: tarefa.id })
      setFinalizandoInteracaoId(null)
      setFinalizandoObs('')
      const msgNotif = proximaSalva
        ? `Próximo passo agendado para ${new Date(`${proximaSalva.data}T00:00:00`).toLocaleDateString('pt-BR')}`
        : `Mantida próxima tarefa aberta em ${outraAberta ? new Date(`${outraAberta.data}T00:00:00`).toLocaleDateString('pt-BR') : 'aberto'}`
      addNotificacao('success', 'Tarefa finalizada', msgNotif, c.id)
    } catch (err: any) {
      logger.error('Erro ao finalizar tarefa com próximo passo:', err)
      showToast?.('error', `Erro ao finalizar tarefa: ${err?.message || 'falha de rede'}`)
      throw err
    }
  }, [c, tarefas, clientesParaCalculo, parametros.tarefasPadraoCadastro?.incluirProdutos, salvarCadastroCompleto, loggedUser?.nome, setTarefas, showToast, addNotificacao])

  const handleCriarTarefa = async () => {
    if (!panelTarefaTitulo.trim() || !panelTarefaData || !panelTarefaHora || !panelTarefaTipo) return
    const horaNorm = arredondarHora5Min(panelTarefaHora)
    if (isDataHoraNoPassado(panelTarefaData, horaNorm)) {
      showToast?.('error', 'Não é permitido agendar tarefa com data ou horário anterior ao momento atual.')
      return
    }
    try {
      const saved = await db.insertTarefa({
        titulo: panelTarefaTitulo.trim(), data: panelTarefaData,
        hora: horaNorm,
        tipo: panelTarefaTipo, status: 'pendente', prioridade: panelTarefaPrioridade, clienteId: c.id, vendedorId: c.vendedorId || loggedUser?.id,
        objetivo: panelTarefaObjetivo, origem: 'manual', criadoPor: loggedUser?.nome || 'Vendedor'
      })
      setTarefas(prev => [saved, ...prev])
    } catch (err) { logger.error('Erro ao criar tarefa:', err) }
    setPanelTarefaTitulo('')
    setPanelNovaTarefa(false)
    addNotificacao('success', 'Tarefa criada', `${panelTarefaTitulo.trim()} - ${c.razaoSocial}`, c.id)
  }

  const handleEnviarPedido = async () => {
    if (!onAddPedido) return
    if (pedidoItens.length === 0) { addNotificacao('warning', 'Sem itens', 'Adicione pelo menos um produto.', c.id); return }
    if (!pedidoFrete) { addNotificacao('warning', 'Frete obrigatório', 'Selecione o tipo de frete.', c.id); return }
    if (!pedidoFormaPagamento.trim()) { addNotificacao('warning', 'Pagamento obrigatório', 'Selecione a forma de pagamento.', c.id); return }
    if (!pedidoObs.trim()) { addNotificacao('warning', 'Observações obrigatórias', 'Informe as observações do pedido.', c.id); return }
    if (pedidoItens.some(i => !i.sku?.trim())) { addNotificacao('warning', 'SKU obrigatório', 'Todos os produtos devem ter SKU preenchido.', c.id); return }
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
        numero, clienteId: c.id, vendedorId: c.vendedorId || loggedUser?.id || 0,
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
      setPedidoItens(prev => prev.map(i => ({ ...i, preco: 1 })))
    }
  }, [pedidoTipo])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-0 sm:p-[4vh_4vw]">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full h-[100dvh] sm:w-[92vw] sm:h-[92vh] bg-[#F5F5F7] dark:bg-[#141416] shadow-[0_24px_64px_rgba(0,0,0,0.28)] border border-black/[0.08] dark:border-white/[0.10] rounded-none sm:rounded-2xl overflow-hidden">
        {/* Header — Perfil do Cliente (Apple macOS Sonoma Sheet Header) */}
        <div className="sticky top-0 bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] z-10 px-4 sm:px-6 py-3.5 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-semibold tracking-tight text-gray-900 truncate">{c.razaoSocial}</h2>
              {/* Tag Status do Cliente */}
              {(() => {
                const stb = SITUACAO_COMPRA_CONFIG[situacaoCompraInfo.situacao]
                const titulo = situacaoCompraInfo.dias == null
                  ? 'Nunca comprou'
                  : `${situacaoCompraInfo.dias} dia${situacaoCompraInfo.dias === 1 ? '' : 's'} desde a última venda enviada ao Omie`
                return (
                  <span className="relative inline-flex">
                    <button type="button" onClick={() => setShowInfoSituacaoCompra(v => !v)} className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium rounded-full border cursor-help tabular-nums ${stb.cor}`} title={titulo}>
                      <span className={`w-1.5 h-1.5 rounded-full ${stb.corDot}`} />
                      {stb.label}{situacaoCompraInfo.dias != null ? ` · ${situacaoCompraInfo.dias}d` : ''}
                    </button>
                    {showInfoSituacaoCompra && <span className="absolute left-0 top-7 z-30 w-52 rounded-xl border border-gray-200 bg-white p-2.5 text-[11px] font-normal text-gray-700 shadow-xl">{titulo}</span>}
                  </span>
                )
              })()}
              {(['inativado', 'descartado', 'bloqueado'] as const).includes(c.statusCliente as any) && (
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full border bg-red-50 text-red-700 border-red-200" title="Status manual excepcional do cadastro">
                  {STATUS_CLIENTE_BADGE[c.statusCliente as string]?.label || c.statusCliente}
                </span>
              )}
              {(() => {
                const cfg = SITUACAO_CADASTRO_CONFIG[avaliacaoCadastro.situacao]
                const qtd = avaliacaoCadastro.faltantes.length
                const texto = avaliacaoCadastro.situacao === 'completo'
                  ? 'Cadastro completo'
                  : avaliacaoCadastro.situacao === 'completo_com_justificativa'
                    ? 'Cadastro completo c/ justificativa'
                    : avaliacaoCadastro.situacao === 'incompleto_vencido'
                      ? `Incompleto vencido (${qtd} campo${qtd === 1 ? '' : 's'})`
                      : `Cadastro incompleto (${qtd} campo${qtd === 1 ? '' : 's'})`
                return (
                  <button type="button" onClick={() => setShowCadastroCompleto(true)} className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full border ${cfg.cor} hover:brightness-95`} title="Ver campos pendentes e completar cadastro">
                    {texto}
                  </button>
                )
              })()}
              {/* Atalhos rápidos inline: Ligação | WhatsApp | E-mail (botões neutros estilo macOS) */}
              {(() => {
                const fone = (c.contatoCelular || c.contatoTelefone || c.whatsapp || '').replace(/\D/g, '')
                return (
                  <div className="flex items-center gap-1">
                    {fone && (
                      <button type="button" onClick={() => setShowCallRecorder(true)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 hover:bg-black/[0.08] transition-colors"
                        title="Ligar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      </button>
                    )}
                    {fone && (
                      <button type="button" onClick={() => {
                        if (isMobileDevice()) {
                          window.location.href = `https://wa.me/${formatBrazilianPhone(fone)}`
                        } else {
                          setShowWhatsApp(true)
                        }
                      }}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 hover:bg-black/[0.08] transition-colors"
                        title="WhatsApp">
                        <WhatsAppIcon variant="outline" className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {c.contatoEmail && (
                      <button type="button" onClick={() => {
                        if (isMobileDevice()) {
                          window.location.href = `mailto:${c.contatoEmail}`
                        } else {
                          setShowEmail(true); setTimeout(() => emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
                        }
                      }}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 hover:bg-black/[0.08] transition-colors"
                        title="E-mail">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      </button>
                    )}
                  </div>
                )
              })()}
              {ultimaAmostraExibicaoISO && (
                <span className="text-[11px] text-gray-500 tabular-nums">
                  Última amostra: <strong className="font-medium text-gray-800">{new Date(ultimaAmostraExibicaoISO).toLocaleDateString('pt-BR')}</strong>
                </span>
              )}
              {ultimaVendaExibicaoISO && (
                <span className="text-[11px] text-gray-500 tabular-nums">
                  Última venda: <strong className="font-medium text-gray-800">{new Date(ultimaVendaExibicaoISO).toLocaleDateString('pt-BR')}</strong>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-800 dark:text-gray-200">{etapaLabels[c.etapa] || c.etapa}</span>
              {c.etapa === 'negociacao' && pedidoAguardandoAprovacao && (
                <span className="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  Aguardando aprovação
                </span>
              )}
              <span className="text-xs text-gray-500 tabular-nums">Há {diasNaEtapa}d nesta etapa</span>
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
              <span className="text-xs font-bold text-gray-600 ml-auto">Score: {scoreUnificado}</span>
            </div>
          </div>

          {/* Ações no canto direito do header */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onVerTarefas && (
              <button
                onClick={() => { onVerTarefas(); onClose() }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-black/[0.08] transition-colors"
                title="Ir para a página de Tarefas"
              >
                Tarefas
              </button>
            )}
            {onVerNoFunil && (
              <button
                onClick={() => { onVerNoFunil(c); onClose() }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-black/[0.08] transition-colors"
                title="Abrir o card deste cliente no Funil"
              >
                Ver no Funil
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowMaisOpcoesHeader(v => !v)}
                className="px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-[#EFEFF4] dark:bg-[#2C2C30] rounded-lg hover:bg-black/[0.08] transition-colors"
                title="Mais opções"
              >
                Opções ▾
              </button>
              {showMaisOpcoesHeader && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMaisOpcoesHeader(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-[#2C2C30] rounded-xl shadow-xl border border-gray-200 z-40 py-1">
                    <button
                      onClick={() => { setShowMaisOpcoesHeader(false); onEditCliente(c); onClose() }}
                      className="w-full px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 text-left flex items-center gap-2"
                    >
                      Editar empresa
                    </button>
                    {onVerNoFunil && (
                      <button
                        onClick={() => { setShowMaisOpcoesHeader(false); onVerNoFunil(c); onClose() }}
                        className="sm:hidden w-full px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 text-left flex items-center gap-2"
                      >
                        Ver no Funil
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
            <button aria-label="Fechar painel" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-apple"><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 h-[calc(90vh-84px)] overflow-y-auto lg:overflow-hidden">
          <div className="lg:h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="space-y-4 lg:col-span-5 xl:col-span-4 lg:overflow-y-auto lg:pr-1">

          {/* === AÇÕES RÁPIDAS === */}
          <div className="space-y-2">
            {c.etapa === 'negociacao' && !pedidoAguardandoAprovacao && pedidoRecusadoEditavel && (
              <div className="rounded-apple border border-red-300 bg-red-50 p-3">
                <p className="text-xs font-bold text-red-800 whitespace-pre-line">
                  Pedido {pedidoRecusadoEditavel.numero} recusado na aprovação — Motivo: {pedidoRecusadoEditavel.motivoRecusa}
                </p>
              </div>
            )}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Ações da etapa</h3>
            <div className="flex flex-wrap gap-1.5">
              {c.etapa === 'negociacao' && ultimaProposta && (
                <button
                  onClick={abrirEdicaoProposta}
                  className="px-3 py-1.5 text-xs font-medium bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-800 dark:text-gray-200 rounded-lg hover:bg-black/[0.08]"
                  title={`Editar proposta ${ultimaProposta.numero}`}
                >
                  Editar proposta
                </button>
              )}
              {ultimaProposta && (isGerente || c.etapa === 'follow_up') && (
                <button
                  onClick={() => gerarPropostaPDF(c, ultimaProposta.itens, ultimaProposta.observacoes, ultimaProposta.vendedorNome, ultimaProposta.numero, { tipoFrete: (ultimaProposta.frete as 'CIF' | 'FOB' | '') || '', formaPagamento: ultimaProposta.pagamento, dataLancamento: ultimaProposta.criadoEm })}
                  className="px-3 py-1.5 text-xs font-medium bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-800 dark:text-gray-200 rounded-lg hover:bg-black/[0.08]"
                  title={`Baixar PDF da ${ultimaProposta.numero}`}
                >
                  Baixar PDF
                </button>
              )}
              {todasPropostas.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowPropostasAnteriores(v => !v)}
                    className="px-3 py-1.5 text-xs font-medium bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-black/[0.08]"
                    title="Ver histórico de propostas"
                  >
                    Anteriores ({todasPropostas.length - 1})
                  </button>
                  {showPropostasAnteriores && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[260px] max-h-72 overflow-y-auto">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-[11px] font-semibold text-gray-700">Histórico de propostas</p>
                      </div>
                      {todasPropostas.map((p, i) => (
                        <div key={p.id} className={`flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 ${i === 0 ? 'bg-gray-50' : ''}`}>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-gray-800 truncate">{p.numero} {i === 0 ? <span className="text-[9px] bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded">atual</span> : ''}</p>
                            <p className="text-[10px] text-gray-500 tabular-nums">{new Date(p.criadoEm).toLocaleDateString('pt-BR')} · R$ {p.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            {p.pagamento && <p className="text-[9px] text-gray-400">{p.pagamento}</p>}
                          </div>
                          <button
                            onClick={() => gerarPropostaPDF(c, p.itens, p.observacoes, p.vendedorNome, p.numero, { tipoFrete: (p.frete as 'CIF' | 'FOB' | '') || '', formaPagamento: p.pagamento, dataLancamento: p.criadoEm })}
                            className="flex-shrink-0 px-2.5 py-1 text-[10px] font-medium bg-primary-700 text-white rounded-md hover:bg-primary-800"
                            title="Baixar PDF"
                          >
                            PDF
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {c.etapa === 'prospecção' && (
                <>
                  <button onClick={() => { onTriggerAmostra(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-800 dark:text-gray-200 rounded-lg hover:bg-black/[0.08]">Enviar amostra</button>
                  <button onClick={() => { onMoverCliente(c.id, 'proposta', { etapaAnterior: 'prospecção', dataEntradaEtapa: new Date().toISOString() }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-primary-700 text-white rounded-lg hover:bg-primary-800 shadow-apple-sm">Ir para proposta</button>
                </>
              )}
              {c.etapa === 'amostra' && (
                <>
                  {c.statusAmostra !== 'cancelamento_pendente' && (
                    <>
                      <button
                        onClick={() => {
                          const pedidoAmostra = (todosPedidos || []).find(p => p.clienteId === c.id && p.tipo === 'bonificacao')
                          const initMap: Record<number, AvaliacaoItem> = {}
                          ;(pedidoAmostra?.itens || []).forEach((_, idx) => { initMap[idx] = { aprovado: null, motivo: '' } })
                          setAvaliacaoItens(initMap)
                          setShowAvaliarAmostra(true)
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-primary-700 text-white rounded-lg hover:bg-primary-800 shadow-apple-sm"
                      >Resultado da amostra</button>
                      <button
                        onClick={() => {
                          onMoverCliente(c.id, 'amostra_perdida', {
                            resultadoAmostra: undefined,
                            dataResultadoAmostra: new Date().toISOString().split('T')[0],
                            motivoReprovacao: 'Amostra perdida / não recebida pelo cliente',
                          })
                          onClose()
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-black/[0.08]"
                        title="Cliente não recebeu, esqueceu ou perdeu a amostra (permite 2º envio)"
                      >Amostra não recebida</button>
                    </>
                  )}
                  {c.statusAmostra === 'cancelamento_pendente' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-2">
                      <p className="text-xs text-amber-800 font-medium">Cancelamento aguardando aprovação do gerente.</p>
                      {isGerente && (
                        <button onClick={async () => { if (confirm(`Aprovar cancelamento da amostra de ${c.razaoSocial}?`)) { await onMoverCliente(c.id, 'prospecção', { statusAmostra: undefined, dataEnvioAmostra: undefined, resultadoAmostra: undefined, dataResultadoAmostra: undefined }); onClose() } }} className="w-full px-3 py-1.5 text-xs font-medium bg-primary-700 text-white rounded-lg hover:bg-primary-800">Aprovar cancelamento</button>
                      )}
                    </div>
                  )}
                  {c.statusAmostra !== 'cancelamento_pendente' && !['aprovada', 'reprovada', 'faturado', 'expedido', 'entregue'].includes(c.statusAmostra || '') && (
                    <button onClick={async () => { if (confirm(`Solicitar cancelamento do envio de amostra para ${c.razaoSocial}?`)) { try { await db.updateCliente(c.id, { statusAmostra: 'cancelamento_pendente' }); setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, statusAmostra: 'cancelamento_pendente' } : cl)); addNotificacao('warning', 'Cancelamento solicitado', `${c.razaoSocial}: aguardando aprovação do gerente`, c.id); onClose() } catch { addNotificacao('error', 'Erro', 'Falha ao solicitar cancelamento', c.id) } } }} className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg">Cancelar envio</button>
                  )}
                </>
              )}
              {c.etapa === 'amostra_perdida' && (
                <>
                  {(c.tentativaAmostra || 1) < 2 && !c.resultadoAmostra && (
                    <button
                      onClick={() => { onTriggerAmostra(c); onClose() }}
                      className="px-3 py-1.5 text-xs font-medium bg-primary-700 text-white rounded-lg hover:bg-primary-800"
                    >Reenviar amostra (2º envio)</button>
                  )}
                  {c.statusAmostra === 'cancelamento_pendente' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-2">
                      <p className="text-xs text-amber-800 font-medium">Cancelamento aguardando aprovação do gerente.</p>
                      {isGerente && (
                        <button onClick={async () => { if (confirm(`Aprovar cancelamento da amostra de ${c.razaoSocial}?`)) { await onMoverCliente(c.id, 'prospecção', { statusAmostra: undefined, dataEnvioAmostra: undefined, resultadoAmostra: undefined, dataResultadoAmostra: undefined }); onClose() } }} className="w-full px-3 py-1.5 text-xs font-medium bg-primary-700 text-white rounded-lg hover:bg-primary-800">Aprovar cancelamento</button>
                      )}
                    </div>
                  )}
                  {c.statusAmostra !== 'cancelamento_pendente' && (
                    <button onClick={async () => { if (confirm(`Solicitar cancelamento do envio de amostra para ${c.razaoSocial}?`)) { try { await db.updateCliente(c.id, { statusAmostra: 'cancelamento_pendente' }); setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, statusAmostra: 'cancelamento_pendente' } : cl)); addNotificacao('warning', 'Cancelamento solicitado', `${c.razaoSocial}: aguardando aprovação do gerente`, c.id); onClose() } catch { addNotificacao('error', 'Erro', 'Falha ao solicitar cancelamento', c.id) } } }} className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg">Cancelar envio</button>
                  )}
                </>
              )}
              {c.etapa === 'proposta' && (
                <>
                  <button onClick={() => { onTriggerAmostra(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-800 dark:text-gray-200 rounded-lg hover:bg-black/[0.08]">Enviar amostra</button>
                  <button onClick={() => { onTriggerNegociacao(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-primary-700 text-white rounded-lg hover:bg-primary-800 shadow-apple-sm">Criar proposta</button>
                </>
              )}
              {c.etapa === 'negociacao' && (
                <>
                  <button
                    disabled={ganhouLoading || pedidoAguardandoAprovacao}
                    onClick={async () => {
                      if (ganhouLoading || pedidoAguardandoAprovacao) return
                      setGanhouLoading(true)
                      const hoje = new Date().toISOString().split('T')[0]
                      const proposta = ultimaProposta
                      const propostaItens = proposta && Array.isArray(proposta.itens) ? proposta.itens : []
                      if (!onAddPedido || !proposta || propostaItens.length === 0) {
                        const msg = proposta
                          ? 'A última proposta não tem itens. Complete a proposta para enviar o pedido.'
                          : 'Nenhuma proposta registrada neste cliente. Crie uma proposta antes de marcar como Vendido.'
                        addNotificacao('info', 'Sem proposta válida', msg, c.id)
                        showToast?.('error', msg)
                        setGanhouLoading(false)
                        abrirEdicaoProposta()
                        return
                      }
                      const faltando: string[] = []
                      if (!proposta.frete) faltando.push('frete')
                      if (!proposta.pagamento?.trim()) faltando.push('forma de pagamento')
                      if (propostaItens.some(i => !i.sku?.trim())) faltando.push('SKU dos produtos')
                      if (faltando.length > 0) {
                        const msg = `Proposta incompleta — falta: ${faltando.join(', ')}. Complete e tente novamente.`
                        addNotificacao('warning', 'Proposta incompleta', msg, c.id)
                        showToast?.('error', msg)
                        setGanhouLoading(false)
                        abrirEdicaoProposta()
                        return
                      }
                      try {
                        const ehBonificacao = proposta.numero.toUpperCase().startsWith('BON-')
                        const formaPgtoFinal = ehBonificacao ? 'À vista' : (proposta.pagamento || DEFAULT_PAYMENT_TERM)
                        const freteFinal = (proposta.frete as 'CIF' | 'FOB') || undefined
                        let numeroPedidoEnviado = ''

                        // Item 5: Se já existe um pedido recusado neste card, atualiza e reenvia o MESMO pedido (sem criar novo pedido nem novo ciclo)
                        if (pedidoRecusadoEditavel && onEditarPedido) {
                          numeroPedidoEnviado = pedidoRecusadoEditavel.numero
                          await onEditarPedido(pedidoRecusadoEditavel.id, {
                            observacoes: proposta.observacoes || '',
                            formaPagamento: formaPgtoFinal,
                            tipoFrete: freteFinal || null,
                            itens: propostaItens,
                            totalValor: proposta.totalValor,
                            reenviar: true,
                          })
                        } else {
                          const sufixoPed = Date.now().toString().slice(-6)
                          numeroPedidoEnviado = ehBonificacao ? `BON-${sufixoPed}` : `PED-${sufixoPed}`
                          await onAddPedido({
                            numero: numeroPedidoEnviado,
                            clienteId: c.id,
                            vendedorId: c.vendedorId || loggedUser?.id || 0,
                            itens: propostaItens,
                            observacoes: proposta.observacoes || '',
                            status: 'enviado',
                            dataCriacao: new Date().toISOString(),
                            dataEnvio: new Date().toISOString(),
                            totalValor: proposta.totalValor,
                            tipo: ehBonificacao ? 'bonificacao' : 'venda',
                            formaPagamento: formaPgtoFinal,
                            tipoFrete: freteFinal,
                          })
                        }
                        // Parte 1 Item 1: Enviar para aprovação mantém o card em Negociação ("Aguardando aprovação") e NÃO abre novo ciclo!
                        try {
                          await db.updateCliente(c.id, { statusFollowUp: 'aguardando_aprovacao_gerente', dataUltimoPedido: hoje })
                          setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, statusFollowUp: 'aguardando_aprovacao_gerente', dataUltimoPedido: hoje } : cl))
                        } catch { /* non-critical */ }
                        addNotificacao('success', 'Pedido enviado para aprovação', `Pedido ${numeroPedidoEnviado} — R$ ${proposta.totalValor.toLocaleString('pt-BR')} aguardando aprovação do gerente`, c.id)
                        showToast?.('success', `Pedido ${numeroPedidoEnviado} enviado! Card permanece em Negociação aguardando aprovação.`)
                      } catch (err: any) {
                        console.error('[DEBUG Ganhou] Erro ao criar pedido:', err)
                        const msg = err?.message || 'Falha ao criar pedido de aprovação'
                        addNotificacao('error', 'Erro', msg, c.id)
                        showToast?.('error', `Erro ao enviar pedido: ${msg}`)
                        setGanhouLoading(false)
                        return
                      }
                      setGanhouLoading(false)
                      onClose()
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-apple transition-colors ${
                      ganhouLoading || pedidoAguardandoAprovacao
                        ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {pedidoAguardandoAprovacao ? '⏳ Aguardando aprovação' : ganhouLoading ? '⏳ Processando...' : 'Vendido'}
                  </button>
                </>
              )}
              {c.etapa === 'follow_up' && c.statusFollowUp !== 'concluido' && onTriggerSatisfacao && (
                <button
                  onClick={() => { onTriggerSatisfacao(c); onClose() }}
                  className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-apple hover:bg-purple-700"
                  title="Registrar satisfação do cliente e finalizar card em Follow-up"
                >
                  ⭐ Coletar Satisfação
                </button>
              )}
              {((c.etapa === 'follow_up' && c.statusFollowUp === 'concluido') || c.etapa === 'arquivado') && (
                <span className="px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-apple border border-green-200">
                  Finalizado
                </span>
              )}
              {c.etapa === 'follow_up' && (() => {
                const pedidoCancelavel = (todosPedidos || []).find(p => p.clienteId === c.id && (p.status === 'confirmado' || p.status === 'enviado' || p.status === 'cancelamento_solicitado') && !['faturado', 'expedido', 'entregue'].includes(p.omieStatus || ''))
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
              {(isGerente
                ? ['prospecção', 'proposta', 'amostra_perdida', 'negociacao', 'inativo'].includes(c.etapa)
                : ['proposta', 'negociacao', 'amostra_perdida'].includes(c.etapa)
              ) && (
                <button onClick={() => {
                  onTriggerPerda(c)
                  onClose()
                }} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-apple hover:bg-red-100">❌ Perdido</button>
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
            <h3 className="text-sm font-semibold text-gray-900">Dados básicos da empresa</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div><p className="text-xs text-gray-500">Razão social</p><p className="font-medium text-gray-900">{c.razaoSocial}</p></div>
              <div><p className="text-xs text-gray-500">{c.cpf && !c.cnpj ? 'CPF' : 'CNPJ'}</p><p className="font-medium text-gray-900">{formatCNPJ(c.cnpj || '') || c.cpf || '-'}</p></div>
              <div><p className="text-xs text-gray-500">Nome fantasia</p><p className="font-medium text-gray-900">{c.nomeFantasia || '-'}</p></div>
              <div>
                <p className="text-xs text-gray-500">Segmento</p>
                <select
                  aria-label="Segmento do cliente"
                  value={c.segmento || ''}
                  onChange={async (e) => {
                    const novoSeg = e.target.value
                    try {
                      const familia = (todosClientes && todosClientes.length > 0 ? todosClientes : [c]).filter(cl => !cl.arquivadoDuplicata && mesmaEmpresaNoFunil(cl, c))
                      const ids = familia.length > 0 ? familia.map(cl => cl.id) : [c.id]
                      await Promise.all(ids.map(id => db.updateCliente(id, { segmento: novoSeg || undefined })))
                      const idSet = new Set(ids)
                      setClientes(prev => prev.map(cl => idSet.has(cl.id) ? { ...cl, segmento: novoSeg || undefined } : cl))
                    } catch (err) {
                      logger.error('Erro ao salvar segmento:', err)
                    }
                  }}
                  className="w-full px-2 py-1 border border-gray-300 rounded-apple text-xs font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Selecionar...</option>
                  {c.segmento && !segmentosAtivos.some(s => s.valor === c.segmento) && (
                    <option value={c.segmento}>{c.segmento} (desativado)</option>
                  )}
                  {segmentosAtivos.map(s => (
                    <option key={s.id} value={s.valor}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {c.descricao && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Descrição</p>
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{c.descricao}</p>
              </div>
            )}
          </div>

          {/* === ITEM 6: PRODUTOS DE INTERESSE + CONSUMO MENSAL (kg/mês) === */}
          <div className="bg-white dark:bg-[#1C1C1E] rounded-apple border border-gray-200 p-4 space-y-3 shadow-apple-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-600" />
                Produtos de interesse
              </h3>
              <span className="text-[11px] font-medium text-gray-500">Consumo mensal (kg)</span>
            </div>
            {consumoUnificado.lista.length > 0 ? (
              <div className="space-y-2">
                {consumoUnificado.lista.map(nomeProd => {
                  const infoBruta = consumoUnificado.mapa[nomeProd]
                  const valorKg = extrairKgMes(infoBruta)
                  const metaInfo = typeof infoBruta === 'object' && infoBruta !== null ? infoBruta : null
                  return (
                    <div key={nomeProd} className="bg-white rounded-apple border border-indigo-100 px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-gray-900 leading-snug flex-1 min-w-0 truncate" title={nomeProd}>{nomeProd}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`Consumo mensal (kg) — ${nomeProd}`}
                            defaultValue={valorKg === '' ? '' : String(valorKg)}
                            key={`${nomeProd}-${valorKg}`}
                            onChange={e => { e.target.value = e.target.value.replace(/\D/g, '') }}
                            onBlur={async e => {
                              const novoDig = e.target.value.replace(/\D/g, '')
                              const valorAtualStr = valorKg === '' || valorKg === 0 ? '' : String(valorKg)
                              if (novoDig === valorAtualStr) return
                              const ok = await atualizarConsumoKgMes(nomeProd, novoDig)
                              if (!ok) {
                                e.target.value = valorAtualStr
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            }}
                            placeholder="> 0"
                            className={`w-20 px-2 py-1 border rounded-apple text-xs text-right font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!valorKg || Number(valorKg) <= 0 ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'}`}
                          />
                          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">kg/mês</span>
                          <button
                            type="button"
                            onClick={() => atualizarProdutosInteresse(consumoUnificado.lista.filter(n => n !== nomeProd))}
                            disabled={salvandoProdutosInteresse}
                            className="ml-1 text-gray-400 hover:text-red-600 font-bold text-sm disabled:opacity-50"
                            aria-label={`Remover ${nomeProd}`}
                            title="Remover produto"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {metaInfo?.atualizadoEm && (
                        <p className="text-[10px] text-gray-400">
                          Atualizado em {new Date(metaInfo.atualizadoEm).toLocaleDateString('pt-BR')}
                          {metaInfo.vendedorNome ? ` · ${metaInfo.vendedorNome}` : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-indigo-800/70">Nenhum produto de interesse registrado. Adicione abaixo informando o consumo em kg/mês.</p>
            )}
            {produtoPendenteNome && (
              <div className="bg-white rounded-apple border-2 border-indigo-300 p-2.5 space-y-2">
                <p className="text-xs font-semibold text-indigo-950 truncate" title={produtoPendenteNome}>
                  Informar consumo mensal para: <span className="text-indigo-700">{produtoPendenteNome}</span>
                </p>
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    aria-label="Consumo mensal (kg/mês) do novo produto"
                    value={produtoPendenteKg}
                    onChange={e => setProdutoPendenteKg(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const ok = await atualizarConsumoKgMes(produtoPendenteNome, produtoPendenteKg)
                        if (ok) { setProdutoPendenteNome(null); setProdutoPendenteKg('') }
                      }
                      if (e.key === 'Escape') { setProdutoPendenteNome(null); setProdutoPendenteKg('') }
                    }}
                    placeholder="Ex.: 100"
                    className="w-28 px-2.5 py-1.5 border border-gray-300 rounded-apple text-xs text-right font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-medium text-gray-600">kg/mês</span>
                  <button
                    type="button"
                    disabled={salvandoProdutosInteresse || !produtoPendenteKg || Number(produtoPendenteKg) <= 0}
                    onClick={async () => {
                      const ok = await atualizarConsumoKgMes(produtoPendenteNome, produtoPendenteKg)
                      if (ok) { setProdutoPendenteNome(null); setProdutoPendenteKg('') }
                    }}
                    className="ml-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-apple text-xs font-semibold"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setProdutoPendenteNome(null); setProdutoPendenteKg('') }}
                    className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            <div className="relative">
              <input
                value={produtoInteresseBusca}
                onChange={e => setProdutoInteresseBusca(e.target.value)}
                placeholder="🔍 Buscar e adicionar produto..."
                className="w-full px-3 py-2 border border-indigo-200 bg-white rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {produtoInteresseBusca.trim() && (
                <div className="absolute z-20 mt-1 w-full max-h-44 overflow-y-auto rounded-apple border border-gray-200 bg-white shadow-lg">
                  {(produtos || [])
                    .filter(produto => produto.ativo !== false && produto.nome.toLowerCase().includes(produtoInteresseBusca.trim().toLowerCase()) && !consumoUnificado.lista.includes(produto.nome))
                    .slice(0, 10)
                    .map(produto => (
                      <button
                        key={produto.id}
                        type="button"
                        onClick={() => {
                          setProdutoPendenteNome(produto.nome)
                          setProdutoPendenteKg('')
                          setProdutoInteresseBusca('')
                        }}
                        disabled={salvandoProdutosInteresse}
                        className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {produto.nome}
                      </button>
                    ))}
                  {(produtos || []).filter(produto => produto.ativo !== false && produto.nome.toLowerCase().includes(produtoInteresseBusca.trim().toLowerCase()) && !consumoUnificado.lista.includes(produto.nome)).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-500">Nenhum produto disponível.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* === INFORMAÇÕES ADICIONAIS === */}
          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">📋 Informações adicionais</h3>
              {!editingInfoAdicional && (
                <button
                  onClick={() => setEditingInfoAdicional(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg border border-gray-200 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Editar
                </button>
              )}
            </div>
            {editingInfoAdicional ? (
              <>
                <textarea
                  autoFocus
                  value={panelInfoAdicional}
                  onChange={(e) => setPanelInfoAdicional(e.target.value)}
                  placeholder="Observações internas sobre responsável, processo de compra, exigências, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  rows={4}
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => { await handleSalvarDadosEmpresa(); setEditingInfoAdicional(false) }}
                    className="px-4 py-1.5 bg-gray-800 text-white rounded-apple text-xs font-medium hover:bg-gray-900 transition-colors"
                  >
                    💾 Salvar
                  </button>
                  <button
                    onClick={() => setEditingInfoAdicional(false)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-apple text-xs font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed min-h-[2rem]">
                {panelInfoAdicional || <span className="text-gray-400 italic">Nenhuma informação adicionada.</span>}
              </p>
            )}
          </div>

          {/* === DADOS CADASTRAIS (RECEITA FEDERAL) === */}
          {(() => {
            const formatCapital = (v: any) => {
              const n = typeof v === 'number' ? v : parseFloat(String(v || '').replace(/\./g, '').replace(',', '.'))
              return Number.isFinite(n) && n > 0 ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null
            }
            const formatData = (v: any) => {
              if (!v) return null
              const s = String(v)
              const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
              if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
              const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
              if (br) return s.slice(0, 10)
              return s
            }
            const cnaesSec: { codigo?: string; descricao?: string }[] = dadosCnpj?.cnaes_secundarios || []
            const socios: { nome_socio?: string; qualificacao_socio?: string }[] = dadosCnpj?.qsa || []
            return (c.cnpj || loadingCnpj || dadosCnpj) ? (
              <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">🏛️ Dados cadastrais <span className="text-xs font-normal text-gray-500">(Receita Federal)</span></h3>
                {loadingCnpj ? (
                  <p className="text-sm text-gray-400 italic">Consultando CNPJ...</p>
                ) : dadosCnpj ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {dadosCnpj.descricao_situacao_cadastral && (
                        <div><p className="text-xs text-gray-500">Situação cadastral</p><p className={`font-medium ${/ativa/i.test(dadosCnpj.descricao_situacao_cadastral) ? 'text-emerald-700' : 'text-red-600'}`}>{dadosCnpj.descricao_situacao_cadastral}{dadosCnpj.data_situacao_cadastral ? ` desde ${formatData(dadosCnpj.data_situacao_cadastral)}` : ''}</p></div>
                      )}
                      {dadosCnpj.motivo_situacao_cadastral && (
                        <div><p className="text-xs text-gray-500">Motivo da situação</p><p className="font-medium text-gray-900">{dadosCnpj.motivo_situacao_cadastral}</p></div>
                      )}
                      {formatData(dadosCnpj.data_inicio_atividade) && (
                        <div><p className="text-xs text-gray-500">Data de abertura</p><p className="font-medium text-gray-900">{formatData(dadosCnpj.data_inicio_atividade)}</p></div>
                      )}
                      {(dadosCnpj.descricao_natureza_juridica || dadosCnpj.natureza_juridica) && (
                        <div><p className="text-xs text-gray-500">Natureza jurídica</p><p className="font-medium text-gray-900">{dadosCnpj.descricao_natureza_juridica || dadosCnpj.natureza_juridica}</p></div>
                      )}
                      {formatCapital(dadosCnpj.capital_social) && (
                        <div><p className="text-xs text-gray-500">Capital social</p><p className="font-medium text-gray-900">{formatCapital(dadosCnpj.capital_social)}</p></div>
                      )}
                      {(dadosCnpj.descricao_porte || dadosCnpj.porte) && (
                        <div><p className="text-xs text-gray-500">Porte</p><p className="font-medium text-gray-900">{dadosCnpj.descricao_porte || dadosCnpj.porte}</p></div>
                      )}
                      {dadosCnpj.cnae_fiscal_descricao && (
                        <div className="sm:col-span-2"><p className="text-xs text-gray-500">Atividade principal (CNAE)</p><p className="font-medium text-gray-900">{dadosCnpj.cnae_fiscal ? `${dadosCnpj.cnae_fiscal} - ` : ''}{dadosCnpj.cnae_fiscal_descricao}</p></div>
                      )}
                      {(dadosCnpj.ddd_telefone_1 || dadosCnpj.email) && (
                        <div className="sm:col-span-2"><p className="text-xs text-gray-500">Contato no cadastro</p><p className="font-medium text-gray-900">{[dadosCnpj.ddd_telefone_1, dadosCnpj.email].filter(Boolean).join(' · ')}</p></div>
                      )}
                    </div>
                    {cnaesSec.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Atividades secundárias</p>
                        <ul className="text-xs text-gray-700 space-y-0.5 list-disc pl-4">
                          {cnaesSec.slice(0, 8).map((a, i) => <li key={i}>{a.codigo ? `${a.codigo} - ` : ''}{a.descricao}</li>)}
                          {cnaesSec.length > 8 && <li className="text-gray-400 italic">+ {cnaesSec.length - 8} outras</li>}
                        </ul>
                      </div>
                    )}
                    {socios.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Quadro de sócios</p>
                        <ul className="text-xs text-gray-700 space-y-0.5">
                          {socios.map((s, i) => <li key={i}>• {s.nome_socio}{s.qualificacao_socio ? ` (${s.qualificacao_socio})` : ''}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400 italic">Não foi possível consultar o CNPJ.</p>
                )}
              </div>
            ) : null
          })()}

          {/* === CONTATO E LOCALIZAÇÃO === */}
          <div className="bg-white dark:bg-[#1C1C1E] rounded-apple border border-gray-200 p-4 space-y-3 shadow-apple-sm">
            <h3 className="text-sm font-semibold text-gray-900">Informações para contato</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-2.5">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Contato Comprador</p>
                <p className="font-medium text-gray-900 mt-0.5">{c.contatoComprasNome || c.contatoNome || '—'}</p>
                <p className="text-xs text-gray-600 tabular-nums">{c.contatoComprasTelefone || c.contatoCelular || c.contatoTelefone || '—'}</p>
                <p className="text-[11px] text-gray-400">Setor: {c.contatoComprasSetor || 'Compras'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-2.5">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Contato Financeiro</p>
                <p className="font-medium text-gray-900 mt-0.5">{c.contatoFinanceiroNome || '—'}</p>
                <p className="text-xs text-gray-600 tabular-nums">{c.contatoFinanceiroTelefone || '—'}</p>
                <p className="text-[11px] text-gray-400">Setor: {c.contatoFinanceiroSetor || 'Financeiro'}</p>
              </div>
              <div><p className="text-xs text-gray-500">Telefone da empresa</p>
                {(c.contatoTelefone || c.contatoCelular) ? (
                  <button onClick={() => setShowCallRecorder(true)} className="font-medium text-primary-700 hover:underline cursor-pointer flex items-center gap-1 tabular-nums" title="Ligar com gravação">
                    {c.contatoCelular || c.contatoTelefone}
                  </button>
                ) : (
                  <p className="font-medium text-gray-900">{c.contatoTelefone || '-'}</p>
                )}
              </div>
              <div><p className="text-xs text-gray-500">WhatsApp</p><p className="font-medium text-gray-900">{c.whatsapp || c.contatoCelular || c.contatoTelefone || '-'}</p></div>
              <div><p className="text-xs text-gray-500">E-mail geral</p><p className="font-medium text-gray-900 truncate">{c.contatoEmail || '-'}</p></div>
              <div><p className="text-xs text-gray-500">E-mail para boleto</p><p className="font-medium text-gray-900 truncate">{c.emailBoleto || '-'}</p></div>
              <div className="sm:col-span-2"><p className="text-xs text-gray-500">Site</p>{c.website ? <a href={/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="font-medium text-primary-700 hover:text-primary-800 hover:underline truncate block" title={c.website}>{c.website}</a> : <p className="font-medium text-gray-900 truncate">{c.localizacao || '-'}</p>}</div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Endereço</p>
              <p className="text-sm text-gray-900">{enderecoPrincipal || c.endereco || c.localizacao || 'Não informado'}</p>
            </div>
            {mapQuery && mapReady && (
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
            const familia = familiaEmpresa
            const familiaIds = familiaEmpresaIds
            const denegadosUnificados = new Set<string>(c.produtosDenegados || [])
            familia.forEach(cl => (cl.produtosDenegados || []).forEach(nome => denegadosUnificados.add(nome)))
            const pedidosCliente = (todosPedidos || []).filter(p => familiaIds.has(p.clienteId))
            const statusAprovados = new Set(['confirmado', 'faturado', 'expedido', 'entregue'])
            const nomesHomologados = new Set<string>()
            for (const p of pedidosCliente) {
              const donoPed = familia.find(cl => cl.id === p.clienteId)
              const isAmostraAvaliada = p.tipo === 'bonificacao' && !!(donoPed?.resultadoAmostra || c.resultadoAmostra)
              const isVendaConfirmada = p.tipo !== 'bonificacao' && statusAprovados.has(p.status)
              if (isAmostraAvaliada || isVendaConfirmada) {
                for (const item of (p.itens || [])) {
                  if (item.nomeProduto && !denegadosUnificados.has(item.nomeProduto)) nomesHomologados.add(item.nomeProduto)
                }
              }
            }
            const lista = Array.from(nomesHomologados)
            return (
              <div className="bg-white dark:bg-[#1C1C1E] rounded-apple border border-gray-200 p-4 space-y-2 shadow-apple-sm">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Produtos homologados
                </h3>
                {lista.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {lista.map(nome => (
                      <span key={nome} className="px-2.5 py-0.5 text-xs bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200 font-medium">{nome}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Nenhum produto homologado ainda.</p>
                )}
              </div>
            )
          })()}

          {/* === PRODUTOS REPROVADOS === */}
          {(() => {
            const familia = familiaEmpresa
            const denegadosSet = new Set<string>(c.produtosDenegados || [])
            const motivoMap: Record<string, string> = {}
            familia.forEach(cl => {
              ;(cl.produtosDenegados || []).forEach(nome => denegadosSet.add(nome))
              if (cl.motivoReprovacao) {
                cl.motivoReprovacao.split(';').forEach(part => {
                  const [nome, ...rest] = part.split(':')
                  const key = nome.trim()
                  const txt = rest.join(':').trim()
                  if (key && txt) motivoMap[key] = txt
                })
              }
            })
            const lista = Array.from(denegadosSet)
            return (
              <div className="bg-white dark:bg-[#1C1C1E] rounded-apple border border-gray-200 p-4 space-y-2 shadow-apple-sm">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Produtos reprovados
                </h3>
                {lista.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {lista.map(nome => (
                      <div key={nome} className="inline-flex flex-col px-2.5 py-1 text-xs bg-red-50 text-red-800 rounded-lg border border-red-200">
                        <span className="font-medium">{nome}</span>
                        {motivoMap[nome] && <span className="text-[10px] text-red-600 font-normal">Motivo: {motivoMap[nome]}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Nenhum produto reprovado registrado.</p>
                )}
              </div>
            )
          })()}

          <div className="bg-white dark:bg-[#1C1C1E] rounded-apple border border-gray-200 p-4 space-y-3 shadow-apple-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Histórico de tarefas ({clienteTarefas.length})</h3>
              {filteredTaskHistory.length > visibleTaskHistory.length && <span className="text-[11px] text-gray-500">{visibleTaskHistory.length}/{filteredTaskHistory.length}</span>}
            </div>
            {clienteTarefas.length === 0 ? <p className="text-xs text-gray-500">Nenhuma tarefa registrada para este cliente.</p> : <>
              <input value={taskHistorySearch} onChange={e => { setTaskHistorySearch(e.target.value); setTaskHistoryLimit(5) }} placeholder="Buscar tarefa por palavra-chave..." className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-400" />
              {filteredTaskHistory.length === 0 ? <p className="text-xs text-gray-500">Nenhuma tarefa encontrada.</p> : <div className="space-y-2 max-h-96 overflow-y-auto pr-1">{visibleTaskHistory.map(tarefa => {
                const cicloTar = (tarefa.clienteId ? cicloPorCardId.get(tarefa.clienteId) : undefined) || 1
                const origTar = inferirOrigemTarefa(tarefa)
                return (
                  <button key={tarefa.id} onClick={() => setTaskHistorySearch(tarefa.titulo)} className="w-full text-left rounded-apple border border-gray-200 bg-white px-3 py-2 hover:border-primary-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">Ciclo {cicloTar}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${origTar === 'automatica' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {origTar === 'automatica' ? 'Automática' : 'Manual'}
                          </span>
                          {tarefa.objetivo && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 rounded">
                              {OBJETIVO_LABEL[tarefa.objetivo] || tarefa.objetivo}
                            </span>
                          )}
                          {tarefa.canalUsado && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 rounded">
                              Canal: {CANAL_LABEL[tarefa.canalUsado] || tarefa.canalUsado}
                            </span>
                          )}
                          <p className="text-sm font-medium text-gray-900">{tarefa.titulo}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tarefa.status === 'concluida' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{tarefa.status === 'concluida' ? 'Concluída' : 'Pendente'}</span>
                    </div>
                    {tarefa.descricao && <p className="mt-1 text-xs text-gray-600 whitespace-pre-line">{tarefa.descricao}</p>}
                    {tarefa.conclusao && <p className="mt-1 text-xs text-green-800 bg-green-50 border border-green-100 rounded px-2 py-1"><strong>Conclusão:</strong> {tarefa.conclusao}</p>}
                    {(() => {
                      const iaInfo = obterClassificacaoTarefaIA(tarefa)
                      if (!iaInfo) return null
                      const cfgIA = CLASSIFICACAO_IA_CONFIG[iaInfo.classificacao]
                      return (
                        <p className={`mt-1 text-[11px] border rounded px-2 py-1 ${cfgIA.cor}`}>
                          <strong>{cfgIA.label}:</strong> {iaInfo.motivo}
                        </p>
                      )
                    })()}
                    {tarefa.justificativaPrazoLongo && <p className="mt-1 text-xs text-orange-800 bg-orange-50 border border-orange-100 rounded px-2 py-1"><strong>Justificativa de prazo longo:</strong> {tarefa.justificativaPrazoLongo}</p>}
                    <p className="mt-1 text-[11px] text-gray-500">Prazo: {new Date(`${tarefa.data}T${tarefa.hora || '00:00'}`).toLocaleString('pt-BR')}{tarefa.criadoEm ? ` · Criada em ${new Date(tarefa.criadoEm).toLocaleString('pt-BR')}` : ''}{tarefa.concluidaEm ? ` · Concluída em ${new Date(tarefa.concluidaEm).toLocaleString('pt-BR')}` : ''}</p>
                  </button>
                )
              })}</div>}
              {filteredTaskHistory.length > visibleTaskHistory.length && <button onClick={() => setTaskHistoryLimit(limit => limit + 5)} className="w-full py-2 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-xl">Mostrar mais 5</button>}
            </>}
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
          </div>

          {/* === AUDITORIA === */}
          {(c.criadoEm || c.atualizadoEm) && (
            <div className="px-1 space-y-1">
              {c.criadoEm && (
                <p className="text-xs text-gray-500">
                  • Criado por <span className="font-medium text-gray-700">{c.criadoPorNome || 'Sistema'}</span> em{' '}
                  <span className="font-medium text-gray-700">
                    {new Date(c.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} às {new Date(c.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </p>
              )}
              {c.atualizadoEm && (
                <p className="text-xs text-gray-500">
                  • Última atualização em{' '}
                  <span className="font-medium text-gray-700">
                    {new Date(c.atualizadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} às {new Date(c.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </p>
              )}
            </div>
          )}

          </div>

          <div className="space-y-4 lg:col-span-7 xl:col-span-8 lg:overflow-y-auto lg:pl-1">

          {/* === ABAS: Histórico | Negócios | WhatsApp (Apple Segmented Control) === */}
          <div className="sticky top-0 z-[5] bg-[#F5F5F7]/90 dark:bg-[#141416]/90 backdrop-blur-md py-1.5 mb-2">
            <div className="inline-flex p-1 rounded-xl bg-[#E5E5EA]/80 dark:bg-[#242428]">
              <button
                type="button"
                onClick={() => setActiveTab('historico')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'historico' ? 'bg-white dark:bg-[#323236] text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
              >
                Histórico
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('negocios')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'negocios' ? 'bg-white dark:bg-[#323236] text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
              >
                Negócios
                {(() => {
                  const count = (todosPedidos || []).filter(p => p.clienteId === c.id && p.status !== 'cancelado').length
                  return count > 0 ? <span className="bg-black/[0.06] dark:bg-white/[0.12] text-gray-700 dark:text-gray-200 text-[10px] font-bold rounded-full px-1.5 tabular-nums">{count}</span> : null
                })()}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('whatsapp')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'whatsapp' ? 'bg-white dark:bg-[#323236] text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
              >
                <WhatsAppIcon variant="outline" className="h-3.5 w-3.5" />
                WhatsApp
              </button>
            </div>
          </div>

          {/* ===== ABA WHATSAPP — conversa estilo Apple Messages (Claro e Escuro) ===== */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-2.5">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowWhatsApp(true)}
                  className="px-3.5 py-1.5 bg-primary-700 hover:bg-primary-800 text-white text-xs font-medium rounded-lg shadow-apple-sm transition-colors"
                >
                  Abrir chat WhatsApp
                </button>
              </div>
              <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-apple-sm min-h-[400px] max-h-[60vh] overflow-y-auto p-4 space-y-2.5">
                {waHistoricoLoading && (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin h-5 w-5 border-2 border-primary-600 border-t-transparent rounded-full" />
                  </div>
                )}
                {!waHistoricoLoading && waHistorico.length === 0 && (
                  <div className="text-center py-14">
                    <p className="text-xs text-gray-400">
                      Nenhuma mensagem WhatsApp registrada para este cliente ainda.
                    </p>
                  </div>
                )}
                {waHistorico.map(m => {
                  const enviada = m.direcao === 'enviada'
                  return (
                    <div key={m.id} className={`flex ${enviada ? 'justify-end' : 'justify-start'}`}>
                      <div className={`text-[13px] leading-relaxed px-3.5 py-2 rounded-2xl max-w-[82%] shadow-sm ${
                        enviada
                          ? 'bg-primary-700 dark:bg-[#2A4380] text-white rounded-br-sm'
                          : 'bg-[#F2F2F7] dark:bg-[#2C2C30] text-gray-900 dark:text-gray-100 rounded-bl-sm'
                      }`}>
                        {m.mediaUrl && m.tipo === 'audio' && (
                          <audio controls src={m.mediaUrl} className="w-full max-w-[240px] h-9" />
                        )}
                        {m.mediaUrl && m.tipo === 'image' && (
                          <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer">
                            <img src={m.mediaUrl} alt={m.mensagem} className="rounded-xl max-w-[240px] max-h-[240px] object-cover mb-1" />
                          </a>
                        )}
                        {m.mediaUrl && m.tipo === 'video' && (
                          <video controls src={m.mediaUrl} className="rounded-xl max-w-[240px] max-h-[240px] mb-1" />
                        )}
                        {m.mediaUrl && m.tipo === 'document' && (
                          <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className={`underline text-xs block mb-1 ${enviada ? 'text-white/90' : 'text-primary-700'}`}>
                            {m.fileName || 'Abrir documento'}
                          </a>
                        )}
                        <p className="whitespace-pre-wrap">{m.mensagem}</p>
                        <p className={`text-[10px] text-right mt-1 tabular-nums ${enviada ? 'text-white/70' : 'text-gray-400'}`}>
                          {m.createdAt ? new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                          {enviada ? ' · enviada' : ''}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ===== ABA NEGÓCIOS ===== */}
          {activeTab === 'negocios' && (() => {
            const familiaCiclos = (todosClientes && todosClientes.length > 0 ? todosClientes : [c])
              .filter(cl => !cl.arquivadoDuplicata && mesmaEmpresaNoFunil(cl, c))
              .sort((a, b) => (b.cicloNumero || 1) - (a.cicloNumero || 1) || b.id - a.id)
            const familiaIds = new Set(familiaCiclos.map(cl => cl.id))
            const dataMaisRecente = (p: Pedido) => p.dataAprovacao || p.dataEnvio || p.dataCriacao || ''
            const pedidosCli = (todosPedidos || [])
              .filter(p => familiaIds.has(p.clienteId))
              .sort((a, b) => dataMaisRecente(b).localeCompare(dataMaisRecente(a)))
            const total = pedidosCli.filter(p => p.status !== 'cancelado' && p.tipo !== 'bonificacao').reduce((s, p) => s + (p.totalValor || 0), 0)
            // Conta corrente de margem (item 6.1): margem estimada por pedido
            // = Σ preço × qtd × (margemLucro% cadastrada no produto)
            const ledgerMargem = pedidosCli
              .filter(p => p.status !== 'cancelado' && p.tipo !== 'bonificacao')
              .map(p => {
                let receita = 0, margem = 0, semMargem = 0
                for (const it of (p.itens || [])) {
                  const valor = it.preco * it.quantidade
                  receita += valor
                  const prod = (produtos || []).find(pr => pr.id === it.produtoId)
                  if (prod?.margemLucro != null) margem += valor * (prod.margemLucro / 100)
                  else semMargem += valor
                }
                return { p, receita, margem, semMargem }
              })
            const margemTotal = ledgerMargem.reduce((s, l) => s + l.margem, 0)
            const receitaComMargem = ledgerMargem.reduce((s, l) => s + (l.receita - l.semMargem), 0)
            const receitaSemMargem = ledgerMargem.reduce((s, l) => s + l.semMargem, 0)
            const margemPct = receitaComMargem > 0 ? (margemTotal / receitaComMargem) * 100 : 0
            const statusBadge: Record<string, string> = {
              rascunho: 'bg-gray-100 text-gray-700',
              enviado: 'bg-yellow-100 text-yellow-700',
              confirmado: 'bg-green-100 text-green-700',
              cancelado: 'bg-red-100 text-red-700',
              cancelamento_solicitado: 'bg-orange-100 text-orange-700',
            }
            const statusLabel: Record<string, string> = {
              rascunho: 'Rascunho',
              enviado: 'Aguardando aprovação',
              confirmado: 'Aprovado',
              cancelado: 'Cancelado',
              cancelamento_solicitado: 'Cancelamento pendente',
            }
            return (
              <div className="space-y-3">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

                {/* Item 5: Ciclos de venda (cards ligados a este cadastro único) */}
                {familiaCiclos.length > 0 && (
                  <div className="bg-white rounded-apple border border-gray-200">
                    <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                      <p className="text-sm font-semibold text-gray-900">🔄 Ciclos de venda no funil ({familiaCiclos.length})</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {familiaCiclos.map(cardCiclo => {
                        const isAtual = cardCiclo.id === c.id
                        return (
                          <div key={cardCiclo.id} className={`px-4 py-2.5 flex items-center justify-between gap-2 ${isAtual ? 'bg-primary-50/40' : 'hover:bg-gray-50'}`}>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-900">
                                Ciclo #{cardCiclo.cicloNumero || 1} · Card #{cardCiclo.id}
                                {isAtual && <span className="ml-1.5 text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">aberto agora</span>}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                Etapa:{' '}
                                <span className="font-medium">
                                  {(cardCiclo.etapa === 'follow_up' && cardCiclo.statusFollowUp === 'concluido') || cardCiclo.etapa === 'arquivado'
                                    ? 'Follow-up · Finalizado'
                                    : (etapaLabels[cardCiclo.etapa] || cardCiclo.etapa)}
                                </span>
                                {cardCiclo.dataEntradaEtapa ? ` · desde ${new Date(cardCiclo.dataEntradaEtapa).toLocaleDateString('pt-BR')}` : ''}
                              </p>
                            </div>
                            {!isAtual && onSelectCardCiclo && (
                              <button
                                type="button"
                                onClick={() => onSelectCardCiclo(cardCiclo)}
                                className="px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-apple border border-primary-200"
                              >
                                Abrir card
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                                  Ciclo {cicloPorCardId.get(p.clienteId) || 1}
                                </span>
                                <p className="text-sm font-medium text-gray-900">
                                  {p.numero}
                                  {p.omieNumero ? <span className="ml-1.5 text-[11px] font-normal text-gray-500">(Omie #{String(p.omieNumero).replace(/^0+/, '')})</span> : null}
                                  {p.tipo === 'bonificacao' && <span className="ml-1.5 text-[9px] bg-amber-100 text-amber-700 px-1 rounded">amostra</span>}
                                </p>
                              </div>
                              <p className="text-[11px] text-gray-500">{new Date(p.dataCriacao).toLocaleDateString('pt-BR')} · {(p.itens || []).length} item(ns)</p>
                            </div>
                            <div className="text-right flex-shrink-0 space-y-1">
                              <p className="text-sm font-bold text-gray-900">{p.tipo === 'bonificacao' ? '—' : `R$ ${(p.totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</p>
                              <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${statusBadge[p.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel[p.status] || p.status}</span>
                              {p.omieCodigo && (
                                <div>
                                  <button
                                    onClick={() => toggleDocsPedido(p.id)}
                                    disabled={docsPedido[p.id] === 'loading'}
                                    className="px-2 py-0.5 text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50"
                                    title="Documentos fiscais do pedido no Omie"
                                  >
                                    {docsPedido[p.id] === 'loading' ? '⏳' : docsPedido[p.id] ? '▲ Docs' : '📄 NF/PDF'}
                                  </button>
                                </div>
                              )}
                              <div>
                                <button
                                  onClick={() => setOcorrenciasAbertas(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                                  className="px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100"
                                  title="Reportar e ver ocorrências do pedido"
                                >
                                  {ocorrenciasAbertas[p.id] ? '▲ Ocorrências' : '⚠️ Ocorrências'}
                                </button>
                              </div>
                              {(p.status === 'rascunho' || p.status === 'enviado') && (
                                <div>
                                  <button
                                    onClick={() => {
                                      setEditPedido(p)
                                      setEditPedidoItens((p.itens || []).map(i => ({ ...i })))
                                      setEditPedidoObs(p.observacoes || '')
                                      setEditPedidoPagamento(p.formaPagamento || DEFAULT_PAYMENT_TERM)
                                      setEditPedidoFrete((p.tipoFrete as 'CIF' | 'FOB' | '') || '')
                                      setEditPedidoProdutoSel('')
                                    }}
                                    className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                                    title="Editar pedido (antes de integrar ao Omie)"
                                  >
                                    ✏️ Editar
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {p.motivoRecusa && p.status === 'cancelado' && (
                            <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1.5">
                              <strong>Motivo da recusa:</strong> {p.motivoRecusa}
                            </p>
                          )}
                          {p.itens && p.itens.length > 0 && (
                            <p className="text-[11px] text-gray-400 mt-1 truncate">
                              {p.itens.map(it => `${it.quantidade}× ${it.nomeProduto}`).join(' · ')}
                            </p>
                          )}
                          {(() => {
                            const docs = docsPedido[p.id]
                            if (!docs || docs === 'loading' || docs === 'error') return null
                            return (
                              <div className="mt-2 p-2 bg-sky-50 border border-sky-100 rounded-lg space-y-1.5">
                                {docs.pdfPedido && (
                                  <a href={docs.pdfPedido} target="_blank" rel="noreferrer" className="block text-[11px] text-sky-700 hover:underline font-medium">📄 PDF do pedido (Omie)</a>
                                )}
                                {docs.nfe ? (
                                  <>
                                    <p className="text-[11px] text-gray-600 font-medium">
                                      NF-e nº {docs.nfe.numero || '-'}{docs.nfe.serie ? ` · série ${docs.nfe.serie}` : ''}
                                      {docs.nfe.emissao ? ` · emitida em ${docs.nfe.emissao}` : ''}
                                      {docs.nfe.valor != null ? ` · R$ ${Number(docs.nfe.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                                    </p>
                                    {docs.nfe.pdfDanfe && (
                                      <a href={docs.nfe.pdfDanfe} target="_blank" rel="noreferrer" className="block text-[11px] text-sky-700 hover:underline font-medium">🧾 DANFE — NF-e nº {docs.nfe.numero || '-'}{docs.nfe.serie ? `/${docs.nfe.serie}` : ''}</a>
                                    )}
                                    {docs.nfe.temXml && (
                                      <button onClick={async () => { const r = await downloadXmlNfePedido(p.id); if (!r.success) showToast?.('error', r.error || 'Falha ao baixar XML') }} className="block text-[11px] text-sky-700 hover:underline font-medium">⬇ XML da NF-e{docs.nfe.chave ? ` (${docs.nfe.chave.slice(-8)})` : ''}</button>
                                    )}
                                    {docs.nfe.linkPortal && (
                                      <a href={docs.nfe.linkPortal} target="_blank" rel="noreferrer" className="block text-[11px] text-sky-700 hover:underline font-medium">🔗 Documentos no portal Omie</a>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-[11px] text-gray-500">Sem NF-e emitida ainda (pedido não faturado).</p>
                                )}
                              </div>
                            )
                          })()}
                          {ocorrenciasAbertas[p.id] && (
                            <OcorrenciasPedido pedidoId={p.id} showToast={showToast} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Conta corrente de margem (item 6.1) */}
                <div className="bg-white rounded-apple border border-gray-200">
                  <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">💰 Conta Corrente de Margem</p>
                    <span className="text-[10px] text-gray-400">estimada via margem cadastrada no produto</span>
                  </div>
                  {ledgerMargem.length === 0 ? (
                    <p className="text-sm text-gray-400 p-4 text-center">Sem vendas para compor a margem.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 p-3 border-b border-gray-100">
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Receita</p>
                          <p className="text-sm font-bold text-gray-900">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Margem R$</p>
                          <p className="text-sm font-bold text-green-700">R$ {margemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Margem %</p>
                          <p className={`text-sm font-bold ${margemPct >= 15 ? 'text-green-700' : 'text-red-600'}`}>{margemPct.toFixed(1)}%</p>
                        </div>
                      </div>
                      {receitaSemMargem > 0 && (
                        <p className="px-4 py-1.5 text-[10px] text-amber-700 bg-amber-50 border-b border-amber-100">
                          ⚠️ R$ {receitaSemMargem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em vendas sem margem cadastrada no produto — fora do cálculo.
                        </p>
                      )}
                      <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                        {ledgerMargem.map(({ p, receita, margem, semMargem }) => (
                          <div key={p.id} className="px-4 py-2 flex items-center justify-between gap-2 text-[11px]">
                            <div className="min-w-0">
                              <span className="font-medium text-gray-800">{p.numero}</span>
                              <span className="text-gray-400 ml-1.5">{new Date(p.dataCriacao).toLocaleDateString('pt-BR')}</span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-gray-500">R$ {receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              <span className={`ml-2 font-semibold ${margem >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {semMargem >= receita ? 's/ margem' : `+R$ ${margem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Lista de Propostas */}
                {todasPropostas.length > 0 && (
                  <div className="bg-white rounded-apple border border-gray-200">
                    <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">📋 Histórico de Propostas</p>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{todasPropostas.length} proposta(s)</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {todasPropostas.map((p, i) => {
                        const expandida = propostasExpandidas.has(p.id)
                        return (
                          <div key={p.id} className={`${i === 0 ? 'bg-indigo-50/30' : ''}`}>
                            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
                              <button className="min-w-0 flex-1 text-left" onClick={() => togglePropostaExpandida(p.id)}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">{p.numero}</span>
                                  {i === 0 && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">mais recente</span>}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  {new Date(p.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  {' · '}{p.vendedorNome}
                                  {p.frete && ` · ${p.frete}`}
                                  {p.pagamento && ` · ${p.pagamento}`}
                                  {' · '}{(p.itens || []).length} item(ns)
                                  {' · '}<span className="text-[10px]">{expandida ? '▲ recolher' : '▼ ver itens'}</span>
                                </p>
                              </button>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <p className="text-sm font-bold text-gray-900">R$ {(p.totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <button
                                  onClick={() => gerarPropostaPDF(c, p.itens, p.observacoes, p.vendedorNome, p.numero, { tipoFrete: (p.frete as 'CIF' | 'FOB' | '') || '', formaPagamento: p.pagamento, dataLancamento: p.criadoEm })}
                                  className="px-2 py-1 text-[10px] bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap"
                                  title="Baixar PDF"
                                >⬇ PDF</button>
                              </div>
                            </div>
                            {expandida && (
                              <div className="px-4 pb-3 space-y-1">
                                <div className="rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                                  {(p.itens || []).map((it, j) => (
                                    <div key={j} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                      <span className="text-gray-800 flex-1 truncate">{it.nomeProduto}</span>
                                      <span className="text-gray-500 mx-3">{it.quantidade} {it.unidade}</span>
                                      <span className="text-gray-900 font-medium">R$ {(it.preco * it.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                  ))}
                                </div>
                                {p.observacoes && <p className="text-[11px] text-gray-500 italic">{p.observacoes}</p>}
                              </div>
                            )}
                          </div>
                        )
                      })}
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
              { tipo: 'whatsapp', label: 'WhatsApp',  icon: <WhatsAppIcon variant="outline" className="h-4 w-4" /> },
              { tipo: 'proposta', label: 'Proposta',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
              { tipo: 'reuniao',  label: 'Reunião',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
              { tipo: 'visita',   label: 'Visita',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
            ] as const
            const isNota = panelAtividadeTipo === 'nota'
            const semTipo = !panelAtividadeTipo
            const canalDiretoUi = (['ligacao', 'whatsapp', 'email', 'visita', 'reuniao'] as string[]).includes(panelAtividadeTipo as string)
            const precisaTipoPrevisto = !isNota && !canalDiretoUi
            const tipoPrevistoOk = !precisaTipoPrevisto || !!panelTarefaTipo
            const seletorTipoPrevisto = precisaTipoPrevisto ? (
              <div className="flex-1 min-w-[210px]">
                <label className="block text-xs text-gray-500 mb-1">Tipo previsto da tarefa *</label>
                <div className="flex flex-wrap gap-1.5">
                  {CANAIS_TAREFA.map(canal => (
                    <button
                      key={canal}
                      type="button"
                      onClick={() => setPanelTarefaTipo(canal)}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold ${panelTarefaTipo === canal ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300'}`}
                    >
                      {CANAL_LABEL[canal]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null
            return (
              <div className="bg-white rounded-apple border border-gray-200 shadow-sm overflow-hidden">
                {/* Abas de tipo */}
                <div className="flex flex-wrap border-b border-gray-200 bg-gray-50">
                  {TIPOS_ATIV.map(({ tipo, label, icon }) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => {
                        setPanelAtividadeTipo(panelAtividadeTipo === tipo ? '' : tipo as Interacao['tipo'])
                      }}
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
                  <div className="relative">
                    <textarea
                      value={panelAtividadeDesc}
                      onChange={(e) => setPanelAtividadeDesc(e.target.value)}
                      placeholder={
                        semTipo ? 'Selecione o tipo da tarefa acima e descreva o que precisa ser feito...'
                        : isNota ? 'Digite sua nota...'
                        : `Descreva a ${tipoInteracaoLabel[panelAtividadeTipo as string] || panelAtividadeTipo || 'atividade'}...`
                      }
                      onFocus={() => setPanelAtividadeFocused(true)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      rows={2}
                    />
                    <button
                      type="button"
                      onClick={() => panelAnexoRef.current?.click()}
                      className="absolute bottom-2 right-2 p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                      title="Anexar arquivo"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    </button>
                    <input
                      ref={panelAnexoRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => setPanelAnexo(e.target.files?.[0] || null)}
                    />
                  </div>
                  {panelAnexo && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-apple text-xs text-primary-700">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      <span className="truncate flex-1">{panelAnexo.name}</span>
                      <button type="button" onClick={() => { setPanelAnexo(null); if (panelAnexoRef.current) panelAnexoRef.current.value = '' }} className="text-primary-400 hover:text-red-500 ml-1">✕</button>
                    </div>
                  )}
                  {/* Prazo + Hora + Responsável: visível quando textarea focado */}
                  {!semTipo && (panelAtividadeFocused || panelAtividadeDesc.trim().length > 0) && (
                    <div className="flex flex-wrap gap-3 items-end">
                      {!isNota && (
                        <div className="flex-1 min-w-[120px]">
                          <label className="block text-xs text-gray-500 mb-1">Prazo</label>
                          <input type="date" value={panelAtividadePrazo} onChange={(e) => setPanelAtividadePrazo(e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer" />
                        </div>
                      )}
                      {!isNota && (
                        <div className="flex-1 min-w-[130px]">
                          <label className="block text-xs text-gray-500 mb-1">Horário</label>
                          <TimePicker5Min value={panelAtividadeHora} onChange={setPanelAtividadeHora} ariaLabelPrefix="Horário da atividade" />
                        </div>
                      )}
                      {seletorTipoPrevisto}
                      {!isNota && (
                        <div className="flex-1 min-w-[150px]">
                          <label className="block text-xs text-gray-500 mb-1">Objetivo *</label>
                          <select
                            value={panelAtividadeObjetivo}
                            onChange={(e) => setPanelAtividadeObjetivo(e.target.value as ObjetivoTarefa)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                          >
                            {OBJETIVOS_TAREFA.map(o => <option key={o} value={o}>{OBJETIVO_LABEL[o]}</option>)}
                          </select>
                        </div>
                      )}
                      {!isNota && (
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-xs text-gray-500 mb-1">Responsável</label>
                          <select
                            value={panelResponsavelId}
                            onChange={(e) => setPanelResponsavelId(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                          >
                            {vendedores.filter(v => v.ativo).map(v => (
                              <option key={v.id} value={v.id}>{v.nome}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <button
                        onClick={handleRegistrarAtividade}
                        disabled={!panelAtividadeDesc.trim() || !tipoPrevistoOk}
                        className="px-5 py-2 bg-primary-600 text-white rounded-apple text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isNota ? 'Salvar Nota' : 'Salvar Tarefa'}
                      </button>
                    </div>
                  )}
                  {semTipo && (panelAtividadeFocused || panelAtividadeDesc.trim().length > 0) && (
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-xs text-gray-500 mb-1">Prazo</label>
                        <input type="date" value={panelAtividadePrazo} onChange={(e) => setPanelAtividadePrazo(e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer" />
                      </div>
                      <div className="flex-1 min-w-[130px]">
                        <label className="block text-xs text-gray-500 mb-1">Horário</label>
                        <TimePicker5Min value={panelAtividadeHora} onChange={setPanelAtividadeHora} ariaLabelPrefix="Horário da tarefa" />
                      </div>
                      {seletorTipoPrevisto}
                      <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs text-gray-500 mb-1">Objetivo *</label>
                        <select
                          value={panelAtividadeObjetivo}
                          onChange={(e) => setPanelAtividadeObjetivo(e.target.value as ObjetivoTarefa)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                        >
                          {OBJETIVOS_TAREFA.map(o => <option key={o} value={o}>{OBJETIVO_LABEL[o]}</option>)}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs text-gray-500 mb-1">Responsável</label>
                        <select
                          value={panelResponsavelId}
                          onChange={(e) => setPanelResponsavelId(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                        >
                          {vendedores.filter(v => v.ativo).map(v => (
                            <option key={v.id} value={v.id}>{v.nome}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={handleRegistrarAtividade}
                        disabled={!panelAtividadeDesc.trim() || !tipoPrevistoOk}
                        className="px-5 py-2 bg-primary-600 text-white rounded-apple text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Salvar Tarefa
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* === MODAL EDITAR ATIVIDADE === */}
          {editingInter && (
            <div className="bg-white rounded-apple border border-primary-200 shadow-md p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">✏️ Editar atividade</h3>
                <button onClick={() => setEditingInter(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
              {/* Abas de tipo */}
              <div className="flex flex-wrap gap-1 border border-gray-200 rounded-apple p-1 bg-gray-50">
                {(['nota','email','ligacao','whatsapp','proposta','reuniao','visita'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditingInter(prev => prev ? { ...prev, tipo: t === 'visita' || t === 'proposta' ? 'nota' : t } : prev)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                      editingInter.tipo === (t === 'visita' || t === 'proposta' ? 'nota' : t)
                        ? 'bg-white shadow text-primary-700 border border-primary-200'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {({ nota: 'Nota', email: 'E-mail', ligacao: 'Ligação', whatsapp: 'WhatsApp', proposta: 'Proposta', reuniao: 'Reunião', visita: 'Visita' })[t]}
                  </button>
                ))}
              </div>
              <textarea
                autoFocus
                value={editingInter.descricao}
                onChange={e => setEditingInter(prev => prev ? { ...prev, descricao: e.target.value } : prev)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                placeholder="Descrição da atividade..."
              />
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs text-gray-500 mb-1">Prazo</label>
                  <input type="date" value={editingInter.prazo}
                    onChange={e => setEditingInter(prev => prev ? { ...prev, prazo: e.target.value } : prev)}
                    onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer" />
                </div>
                <div className="flex-1 min-w-[100px]">
                  <label className="block text-xs text-gray-500 mb-1">Horário</label>
                  <input type="time" value={editingInter.hora}
                    onChange={e => setEditingInter(prev => prev ? { ...prev, hora: e.target.value } : prev)}
                    onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer" />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs text-gray-500 mb-1">Responsável</label>
                  <select
                    value={editingInter.responsavelId}
                    onChange={e => setEditingInter(prev => prev ? { ...prev, responsavelId: e.target.value === '' ? '' : Number(e.target.value) } : prev)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">{vendedores.find(v => v.id === (c.vendedorId || loggedUser?.id))?.nome || 'Padrão'}</option>
                    {vendedores.filter(v => v.ativo).map(v => (
                      <option key={v.id} value={v.id}>{v.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setEditingInter(null)} className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-apple text-sm font-medium hover:bg-gray-200 transition-colors">
                  Cancelar
                </button>
                <button
                  disabled={editingInterSaving}
                  onClick={async () => {
                    if (!editingInter) return
                    setEditingInterSaving(true)
                    try {
                      await db.updateInteracao(editingInter.id, {
                        tipo: editingInter.tipo,
                        descricao: editingInter.descricao,
                      })
                      setInteracoes(prev => prev.map(i => i.id === editingInter.id
                        ? { ...i, tipo: editingInter.tipo, descricao: editingInter.descricao }
                        : i
                      ))
                      // Atualizar tarefa vinculada se prazo/hora mudou
                      const tarefaV = clienteTarefas.find(t => {
                        const descMatch = (t.descricao || '').trim() === (interacoes.find(i => i.id === editingInter.id)?.descricao || '').trim()
                        return descMatch && descMatch
                      })
                      if (tarefaV && (editingInter.prazo || editingInter.hora)) {
                        const mudouPrazo = !!(editingInter.prazo && editingInter.prazo !== tarefaV.data)
                        if (mudouPrazo) {
                          showToast?.('error', 'Para alterar a data da tarefa, use o botão Reagendar (registra o histórico e exige justificativa acima de 15 dias).')
                          setEditingInterSaving(false)
                          return
                        }
                        const updates: Partial<Tarefa> = {}
                        if (editingInter.hora) updates.hora = editingInter.hora
                        if (editingInter.responsavelId) updates.vendedorId = Number(editingInter.responsavelId)
                        await db.updateTarefa(tarefaV.id, updates)
                        setTarefas(prev => prev.map(t => t.id === tarefaV.id ? { ...t, ...updates } : t))
                      }
                      setEditingInter(null)
                    } catch { } finally { setEditingInterSaving(false) }
                  }}
                  className="px-5 py-1.5 bg-primary-600 text-white rounded-apple text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {editingInterSaving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          )}

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
                    {(() => {
                      // 1-to-1 map: each task can only be claimed by one interação
                      const interacaoTarefaMap = new Map<number, typeof clienteTarefas[0]>()
                      const usedTaskIds = new Set<number>()
                      for (const inter of itens.filter(i => i.id > 0)) {
                        const t = clienteTarefas.find(t => {
                          if (usedTaskIds.has(t.id)) return false
                          const descMatch = (t.descricao || '').trim() === (inter.descricao || '').trim() && (inter.descricao || '').trim().length > 3
                          const tituloLower = (t.titulo || '').toLowerCase()
                          const assuntoLower = (inter.assunto || '').toLowerCase()
                          const assuntoMatch = assuntoLower.length > 5 && tituloLower.includes(assuntoLower.slice(0, 30))
                          return descMatch || assuntoMatch
                        })
                        if (t) { interacaoTarefaMap.set(inter.id, t); usedTaskIds.add(t.id) }
                      }
                      return itens.map(inter => {
                      const tipo = inter.tipo || 'nota'
                      const isPinned = pinnedInteracoes.includes(inter.id)
                      const isTaskItem = inter.id < 0 && inter.id > -10_000_000
                      const tarefaVinculada = isTaskItem ? clienteTarefas.find(t => t.id === Math.abs(inter.id)) : interacaoTarefaMap.get(inter.id)
                      const cor = isTaskItem ? { bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' } : (tipoInteracaoCor[tipo] || { bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' })
                      const criador = inter.automatico ? 'Automação' : (vendedor?.nome?.split(' ')[0] || '—')
                      const criadorIniciais = inter.automatico ? 'A' : (vendedor?.nome?.charAt(0) || '?').toUpperCase()
                      const responsavelVendedor = tarefaVinculada?.vendedorId
                        ? (vendedores.find(v => v.id === tarefaVinculada.vendedorId) || vendedor)
                        : vendedor
                      const respNome = responsavelVendedor?.nome?.split(' ')[0] || '—'
                      const respIni = (responsavelVendedor?.nome?.charAt(0) || '?').toUpperCase()
                      // Label real: para notas que são proposta/visita/tarefa genérica, extrair do assunto
                      const labelReal = (() => {
                        if (isTaskItem) return 'Tarefa'
                        if (inter.assunto === 'Mudança de etapa') return 'Mudança de etapa'
                        if (inter.assunto?.startsWith('Amostra - ')) return 'Amostra'
                        if (inter.assunto?.startsWith('Bonificação - ')) return 'Bonificação'
                        if (inter.assunto?.startsWith('Atividade (')) return 'Atividade'
                        if (tipo !== 'nota') return tipoInteracaoLabel[tipo] || tipo
                        const assunto = inter.assunto || ''
                        const prefixos = ['Tarefa Genérica', 'Proposta', 'Visita', 'Reunião', 'Ligação', 'E-mail', 'WhatsApp']
                        for (const p of prefixos) {
                          if (assunto.startsWith(p + ' - ') || assunto === p) return p
                        }
                        return tipoInteracaoLabel['nota']
                      })()
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
                        <div key={inter.id} className={`group rounded-2xl border overflow-hidden bg-white dark:bg-[#1C1C1E] shadow-apple-sm ${isPinned ? 'border-amber-300 ring-1 ring-amber-200/60' : 'border-gray-200'} hover:border-gray-300 transition-colors`}>

                          {/* CABEÇALHO LIMPO APPLE: indicador + tipo + ciclo + prazo */}
                          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#F5F5F7] dark:bg-[#2C2C30] flex items-center justify-center">
                                <span className={`w-2 h-2 rounded-full ${cor.dot}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[13px] font-semibold text-gray-900">{labelReal}</span>
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[#F5F5F7] dark:bg-[#2C2C30] text-gray-600 dark:text-gray-300 rounded-md tabular-nums">
                                    Ciclo {(inter as any).cicloOrigem || cicloPorCardId.get(inter.clienteId) || 1}
                                  </span>
                                  {inter.automatico && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[#F5F5F7] dark:bg-[#2C2C30] text-gray-500 rounded-md">Automático</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-400">Criada {fmtRelativo(inter.data)}</p>
                              </div>
                            </div>
                            {fmtPrazo && labelReal !== 'Nota' && (
                              <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                                <span
                                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full border tabular-nums ${
                                    tarefaVinculada?.status === 'concluida'
                                      ? 'bg-gray-50 text-gray-400 border-gray-200 line-through'
                                      : prazoVencido
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : 'bg-[#F5F5F7] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 border-transparent'
                                  }`}
                                  title={tarefaVinculada?.status === 'concluida' ? 'Tarefa concluída' : prazoVencido ? 'Vencida' : 'Prazo'}
                                >
                                  {fmtPrazo}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Descrição + Anexos embutidos */}
                          {(inter.descricao || tarefaVinculada?.conclusao || tarefaVinculada?.justificativaPrazoLongo || tarefaVinculada?.objetivo || tarefaVinculada?.canalUsado) && (
                            <div className="px-4 py-3 space-y-2">
                              {tarefaVinculada && (tarefaVinculada.objetivo || tarefaVinculada.canalUsado || tarefaVinculada.origem) && (
                                <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-gray-600">
                                  {tarefaVinculada.objetivo && (
                                    <span className="px-2 py-0.5 rounded-md bg-[#F5F5F7] dark:bg-[#2C2C30]">
                                      {OBJETIVO_LABEL[tarefaVinculada.objetivo] || tarefaVinculada.objetivo}
                                    </span>
                                  )}
                                  {tarefaVinculada.canalUsado && (
                                    <span className="px-2 py-0.5 rounded-md bg-[#F5F5F7] dark:bg-[#2C2C30]">
                                      Canal: {CANAL_LABEL[tarefaVinculada.canalUsado] || tarefaVinculada.canalUsado}
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 rounded-md bg-[#F5F5F7] dark:bg-[#2C2C30] text-gray-500">
                                    {inferirOrigemTarefa(tarefaVinculada) === 'automatica' ? 'Automática' : 'Manual'}
                                  </span>
                                </div>
                              )}
                              {inter.descricao && (() => {
                                const urls = (inter.descricao.match(/https?:\/\/[^\s)]+/g) || []).filter(u =>
                                  /\.(pdf|png|jpe?g|webp|xlsx?|csv|docx?|zip)(\?|$)/i.test(u) || u.includes('/storage/v1/object/')
                                )
                                return (
                                  <>
                                    <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-line">{inter.descricao}</p>
                                    {urls.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 pt-1">
                                        {urls.map((u, idx) => (
                                          <a
                                            key={idx}
                                            href={u}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#F5F5F7] text-primary-700 rounded-lg hover:bg-gray-200"
                                          >
                                            Abrir anexo {urls.length > 1 ? idx + 1 : ''}
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                              {tarefaVinculada?.justificativaPrazoLongo && (
                                <div className="rounded-lg border-l-2 border-l-orange-400 bg-orange-50/50 dark:bg-orange-500/10 px-3 py-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 mb-0.5">Justificativa de prazo longo</p>
                                  <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-line">{tarefaVinculada.justificativaPrazoLongo}</p>
                                </div>
                              )}
                              {tarefaVinculada?.conclusao && (
                                <div className="rounded-lg border-l-2 border-l-emerald-500 bg-[#F7F9F8] dark:bg-emerald-500/10 px-3 py-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-0.5">Conclusão</p>
                                  <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-line">{tarefaVinculada.conclusao}</p>
                                  {tarefaVinculada.concluidaEm && (
                                    <p className="mt-1 text-[10px] font-medium text-gray-500 tabular-nums">Concluída em {new Date(tarefaVinculada.concluidaEm).toLocaleString('pt-BR')}{tarefaVinculada.concluidaPor ? ` por ${tarefaVinculada.concluidaPor}` : ''}</p>
                                  )}
                                  {(() => {
                                    const iaInfo = obterClassificacaoTarefaIA(tarefaVinculada)
                                    if (!iaInfo) return null
                                    const cfgIA = CLASSIFICACAO_IA_CONFIG[iaInfo.classificacao]
                                    return (
                                      <p className={`mt-1.5 text-[11px] border rounded px-2 py-1 ${cfgIA.cor}`}>
                                        <strong>{cfgIA.label}:</strong> {iaInfo.motivo}
                                      </p>
                                    )
                                  })()}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Gravação de ligação */}
                          {inter.tipo === 'ligacao' && (() => {
                            const tInter = new Date(inter.data).getTime()
                            const gravacao = gravacoes.reduce((best, g) => {
                              const diff = Math.abs(new Date(g.created_at).getTime() - tInter)
                              return diff < 24 * 3600 * 1000 && (!best || diff < best.diff) ? { g, diff } : best
                            }, null as { g: any, diff: number } | null)?.g
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
                              {!inter.automatico && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (inter.id < 0 && tarefaVinculada) {
                                      handleEditarTarefa(tarefaVinculada)
                                      return
                                    }
                                    setEditingInter({
                                      id: inter.id,
                                      tipo: inter.tipo,
                                      descricao: inter.descricao || '',
                                      prazo: tarefaVinculada?.data || new Date().toISOString().split('T')[0],
                                      hora: tarefaVinculada?.hora || currentTimeHHMM(),
                                      responsavelId: tarefaVinculada?.vendedorId || '',
                                    })
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 transition-colors opacity-0 group-hover:opacity-100"
                                  title="Editar atividade"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  Editar
                                </button>
                              )}
                              {labelReal !== 'Nota' && (() => {
                                const temTarefaPendente = tarefaVinculada?.status === 'pendente'
                                const jaFinalizada = tarefaVinculada?.status === 'concluida'
                                const semTarefa = !tarefaVinculada
                                const ativo = temTarefaPendente
                                return (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (!ativo) return
                                        setFinalizandoInteracaoId(inter.id)
                                        setFinalizandoObs('')
                                        setReagendandoInteracaoId(null)
                                      }}
                                      disabled={!ativo}
                                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors opacity-0 group-hover:opacity-100 ${
                                        finalizandoInteracaoId === inter.id
                                          ? 'border-green-300 bg-green-100 text-green-700 cursor-pointer'
                                          : ativo
                                            ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer'
                                            : 'border-gray-200 bg-gray-50 text-gray-400 cursor-default'
                                      }`}
                                      title={jaFinalizada ? 'Já finalizada' : semTarefa ? 'Sem tarefa vinculada' : 'Finalizar tarefa'}
                                    >
                                      {jaFinalizada ? '✓ Finalizada' : '✓ Finalizar'}
                                    </button>
                                    {ativo && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setReagendandoInteracaoId(inter.id)
                                          setReagendandoMotivo('')
                                          setReagendandoData(tarefaVinculada!.data)
                                          setReagendandoHora(tarefaVinculada!.hora || '')
                                          setFinalizandoInteracaoId(null)
                                        }}
                                        className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors opacity-0 group-hover:opacity-100 ${
                                          reagendandoInteracaoId === inter.id
                                            ? 'border-orange-300 bg-orange-100 text-orange-700'
                                            : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 cursor-pointer'
                                        }`}
                                        title="Reagendar tarefa"
                                      >
                                        ↺ Reagendar
                                      </button>
                                    )}
                                  </>
                                )
                              })()}
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
                              {isGerente && isTaskItem && onDeleteTarefa && (
                                <button
                                  onClick={() => {
                                    const tarefaId = Math.abs(inter.id)
                                    if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
                                      onDeleteTarefa(tarefaId)
                                    }
                                  }}
                                  className="flex-shrink-0 p-1 rounded-full text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all"
                                  title="Excluir tarefa"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Finalização disciplinada: canal, conclusão e próximo passo (quando necessário) */}
                          {finalizandoInteracaoId === inter.id && tarefaVinculada && (
                            <div className="mx-3 mb-3">
                              <FinalizarTarefaInline
                                tarefa={tarefaVinculada}
                                outraTarefaAberta={clienteJaTemOutraTarefaAberta(tarefaVinculada, tarefas, clientesParaCalculo)}
                                cliente={c}
                                produtosCatalogo={produtos}
                                exigeProdutosInteresse={ehTarefaIncluirProdutos(tarefaVinculada, parametros.tarefasPadraoCadastro?.incluirProdutos) && !temJustificativaAtiva(c, 'produtos_interesse', clientesParaCalculo)}
                                vendedorNome={loggedUser?.nome || 'Vendedor'}
                                onConfirm={(input) => handleFinalizarTarefaComProximoPasso(tarefaVinculada, input)}
                                onCancel={() => { setFinalizandoInteracaoId(null); setFinalizandoObs('') }}
                              />
                            </div>
                          )}
                          {/* Painel de reagendamento */}
                          {reagendandoInteracaoId === inter.id && (
                            <div className="mx-3 mb-3 p-3 bg-orange-50 border border-orange-100 rounded-xl space-y-2">
                              <p className="text-xs font-semibold text-orange-700">↺ Reagendar tarefa</p>
                              <textarea
                                value={reagendandoMotivo}
                                onChange={e => setReagendandoMotivo(e.target.value)}
                                rows={2}
                                placeholder="Motivo/justificativa do reagendamento (ex: cliente não atendeu)"
                                className="w-full text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 placeholder:text-gray-400"
                              />
                              <div className="flex items-center gap-2 flex-wrap">
                                <input type="date" value={reagendandoData} onChange={e => setReagendandoData(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white cursor-pointer" />
                                <TimePicker5Min value={reagendandoHora} onChange={setReagendandoHora} ariaLabelPrefix="Horário reagendamento" />
                                <button
                                  disabled={!reagendandoMotivo.trim()}
                                  onClick={async () => {
                                    if (!reagendandoMotivo.trim()) return
                                    const horaNorm = reagendandoHora ? arredondarHora5Min(reagendandoHora) : tarefaVinculada!.hora
                                    if (isDataHoraNoPassado(reagendandoData, horaNorm)) {
                                      showToast?.('error', 'Não é permitido reagendar tarefa para data ou horário no passado.')
                                      return
                                    }
                                    const mudouData = reagendandoData !== tarefaVinculada!.data
                                    const reagendamento = {
                                      dataOriginal: tarefaVinculada!.data,
                                      horaOriginal: tarefaVinculada!.hora,
                                      motivo: reagendandoMotivo.trim(),
                                      reagendadoEm: new Date().toISOString(),
                                      alteradoPor: loggedUser?.nome || 'Vendedor',
                                    }
                                    const prazoLongo = exigeJustificativaPrazoLongo(reagendandoData)
                                    const updates = {
                                      data: reagendandoData,
                                      hora: horaNorm,
                                      status: 'pendente' as const,
                                      reagendamentos: mudouData ? [...(tarefaVinculada!.reagendamentos || []), reagendamento] : (tarefaVinculada!.reagendamentos || []),
                                      justificativaPrazoLongo: prazoLongo ? reagendandoMotivo.trim() : undefined,
                                    }
                                    await db.updateTarefa(tarefaVinculada!.id, updates)
                                    setTarefas(prev => prev.map(t => t.id === tarefaVinculada!.id ? { ...t, ...updates } : t))
                                    setReagendandoInteracaoId(null)
                                  }}
                                  className="px-3 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                                >
                                  Confirmar
                                </button>
                                <button onClick={() => setReagendandoInteracaoId(null)} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                      })
                    })()}
                  </div>
                )}
              </div>
            )
          })()}

          {/* === TIMELINE (collapsible) === */}

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

          {/* === WHATSAPP MODAL (disponível em todas as abas do card) === */}
          {showWhatsApp && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowWhatsApp(false)}>
              <div
                ref={whatsAppRef}
                className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-2xl border border-black/[0.08] dark:border-white/[0.10] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/95 dark:bg-[#1C1C1E]/95">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-sm font-semibold tracking-tight text-gray-900">WhatsApp — {c.razaoSocial}</p>
                      {(c.whatsapp || c.contatoCelular || c.contatoTelefone) && (
                        <p className="text-xs text-gray-500 tabular-nums">{c.whatsapp || c.contatoCelular || c.contatoTelefone}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowWhatsApp(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
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
          onSaved={async (g) => {
            const gravRow = {
              id: g.id,
              cliente_id: c.id,
              numero_telefone: g.numeroTelefone,
              duracao_segundos: g.duracaoSegundos,
              arquivo_url: g.arquivoUrl,
              arquivo_path: g.arquivoPath,
              tamanho_bytes: g.tamanhoBytes,
              notas: g.notas,
              created_at: g.createdAt,
            }
            setGravacoes(prev => [gravRow, ...prev])
            try {
              const dur = `${Math.floor(g.duracaoSegundos / 60)}:${String(g.duracaoSegundos % 60).padStart(2, '0')}`
              const savedI = await db.insertInteracao({
                clienteId: c.id,
                tipo: 'ligacao',
                data: g.createdAt || new Date().toISOString(),
                assunto: `Ligação - ${c.razaoSocial}`,
                descricao: `Ligação gravada para ${g.numeroTelefone} (duração ${dur} min)${g.notas ? ` — ${g.notas}` : ''}`,
                automatico: false,
              })
              setInteracoes(prev => [savedI, ...prev])
              const hoje = new Date().toISOString().split('T')[0]
              await db.updateCliente(c.id, { ultimaInteracao: hoje })
              setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, ultimaInteracao: hoje } : cl))
            } catch (err) {
              logger.error('Erro ao registrar ligação no histórico:', err)
            }
          }}
          onTranscribed={(gravacaoId, texto) =>
            setTranscricoes(prev => ({ ...prev, [gravacaoId]: texto }))
          }
        />
      )}

      {/* Modal Editar Proposta */}
      {showEditProposta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">📝 {ultimaProposta ? 'Editar Proposta' : 'Nova Proposta'}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{ultimaProposta ? `${ultimaProposta.numero} · ${new Date(ultimaProposta.criadoEm).toLocaleDateString('pt-BR')}` : 'Itens, frete e pagamento são exigidos pelo botão "Ganhou"'}</p>
              </div>
              <button onClick={() => { setShowEditProposta(false); setEditPropostaProdSearch('') }} className="p-1.5 hover:bg-gray-100 rounded-lg"><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Frete */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Tipo de Frete</p>
                <select
                  aria-label="Tipo de frete da proposta"
                  value={editPropostaFrete}
                  onChange={e => setEditPropostaFrete(e.target.value as 'CIF' | 'FOB')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Selecionar —</option>
                  {editPropostaFrete && !fretesAtivos.some(f => f.valor === editPropostaFrete) && (
                    <option value={editPropostaFrete}>{editPropostaFrete} (desativado)</option>
                  )}
                  {fretesAtivos.map(frt => (
                    <option key={frt.id} value={frt.valor}>{frt.label}</option>
                  ))}
                </select>
              </div>

              {/* Pagamento */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Forma de Pagamento</p>
                <select value={editPropostaPagamento} onChange={e => setEditPropostaPagamento(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {editPropostaPagamento && !prazosAtivos.some(p => p.valor === editPropostaPagamento) && (
                    <option value={editPropostaPagamento}>{editPropostaPagamento} (desativado)</option>
                  )}
                  {prazosAtivos.map(opt => (
                    <option key={opt.id} value={opt.valor}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Itens */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Itens da Proposta</p>
                <div className="space-y-2">
                  {editPropostaItens.map((item, idx) => (
                    <div key={item.produtoId} className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 bg-gray-50 rounded-apple border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.nomeProduto}</p>
                        <p className="text-[10px] text-gray-400">KG</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex flex-col items-center gap-0.5">
                          <label className={`text-[9px] ${item.sku?.trim() ? 'text-gray-400' : 'text-red-500 font-semibold'}`}>SKU</label>
                          <input
                            type="text"
                            value={item.sku || ''}
                            onChange={e => setEditPropostaItens(prev => prev.map((it, i) => i === idx ? { ...it, sku: e.target.value } : it))}
                            placeholder="SKU"
                            className={`w-20 px-2 py-1 border rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400 ${item.sku?.trim() ? 'border-gray-300' : 'border-red-300 bg-red-50'}`}
                          />
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <label className="text-[9px] text-gray-400">Qtd</label>
                          <input
                            type="number" min={0.01} step={0.01}
                            value={item.quantidade}
                            onChange={e => setEditPropostaItens(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: Math.max(0.01, parseFloat(e.target.value) || 0.01) } : it))}
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
                  if (editPropostaLockRef.current || editPropostaSaving) return
                  editPropostaLockRef.current = true
                  setEditPropostaSaving(true)
                  try {
                    const itensSnapshot = editPropostaItens.map(i => ({ ...i }))
                    const obsSnapshot = editPropostaObs
                    const pgtoSnapshot = editPropostaPagamento
                    const freteSnapshot = editPropostaFrete
                    const total = itensSnapshot.reduce((s, i) => s + i.preco * i.quantidade, 0)
                    const numero = `PROP-${Date.now().toString().slice(-6)}`
                    // PRIORIDADE 1: salvar a proposta no banco PRIMEIRO; PDF vem em etapa separada depois
                    const saved = await savePropostaHistorico({
                      numero, clienteId: c.id, vendedorNome: loggedUser?.nome || 'Vendedor',
                      itens: itensSnapshot, observacoes: obsSnapshot,
                      frete: freteSnapshot || undefined, pagamento: pgtoSnapshot || undefined,
                      totalValor: total, criadoEm: new Date().toISOString(),
                    })
                    setUltimaProposta(saved)
                    setTodasPropostas(prev => prev.some(x => x.id === saved.id) ? prev : [saved, ...prev])
                    setShowEditProposta(false)
                    setEditPropostaProdSearch('')
                    showToast?.('success', `Proposta ${numero} salva com sucesso!`)
                    try {
                      await gerarPropostaPDF(c, itensSnapshot, obsSnapshot, loggedUser?.nome || 'Vendedor', numero, { formaPagamento: pgtoSnapshot, tipoFrete: freteSnapshot as 'CIF' | 'FOB' | '' })
                    } catch {
                      showToast?.('error', `Proposta ${numero} foi salva com sucesso, mas não foi possível abrir o PDF agora. Use o botão Baixar PDF no card.`)
                    }
                  } catch {
                    showToast?.('error', 'Não foi possível salvar a proposta. Verifique sua conexão e tente novamente.')
                  } finally {
                    editPropostaLockRef.current = false
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

      {/* Modal: Editar Pedido (antes de integrar ao Omie) */}
      {editPedido && (() => {
        const totalEdit = editPedidoItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
        const ehBonificacao = editPedido.tipo === 'bonificacao'
        const valido = editPedidoItens.length > 0
          && editPedidoItens.every(i => i.quantidade > 0 && (ehBonificacao || i.preco > 0))
          && editPedidoFrete !== ''
          && editPedidoPagamento.trim() !== ''
          && editPedidoObs.trim() !== ''
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" onClick={() => !editPedidoSaving && setEditPedido(null)}>
            <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">✏️ Editar Pedido {editPedido.numero}</h2>
              <p className="text-xs text-gray-500 mb-4">Edição disponível enquanto o pedido não foi integrado ao Omie. Após a aprovação, use o cancelamento.</p>

              <label className="block text-sm font-medium text-gray-700 mb-1">Itens</label>
              <div className="border border-gray-200 rounded-apple divide-y divide-gray-100 mb-2">
                {editPedidoItens.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="flex-1 text-xs text-gray-800 truncate" title={item.nomeProduto}>{item.nomeProduto}</span>
                    <input type="number" min={1} value={item.quantidade}
                      onChange={e => setEditPedidoItens(prev => prev.map((x, i) => i === idx ? { ...x, quantidade: Math.max(1, Number(e.target.value) || 0) } : x))}
                      className="w-16 px-1.5 py-1 text-xs border border-gray-300 rounded text-right" title="Quantidade" />
                    <span className="text-[10px] text-gray-400">×</span>
                    <input type="number" min={0} step={0.01} value={item.preco} disabled={ehBonificacao}
                      onChange={e => setEditPedidoItens(prev => prev.map((x, i) => i === idx ? { ...x, preco: Math.max(0, Number(e.target.value) || 0) } : x))}
                      className="w-20 px-1.5 py-1 text-xs border border-gray-300 rounded text-right disabled:bg-gray-50" title="Preço unitário" />
                    <button onClick={() => setEditPedidoItens(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700 text-sm font-bold" title="Remover item">×</button>
                  </div>
                ))}
                {editPedidoItens.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Sem itens — adicione um produto abaixo.</p>}
              </div>
              <div className="flex gap-2 mb-4">
                <select value={editPedidoProdutoSel} onChange={e => setEditPedidoProdutoSel(e.target.value ? Number(e.target.value) : '')}
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-apple">
                  <option value="">Adicionar produto…</option>
                  {(produtos || []).filter(pr => !editPedidoItens.some(i => i.produtoId === pr.id)).map(pr => (
                    <option key={pr.id} value={pr.id}>{pr.nome}{pr.sku ? ` (${pr.sku})` : ''}</option>
                  ))}
                </select>
                <button
                  disabled={!editPedidoProdutoSel}
                  onClick={() => {
                    const pr = (produtos || []).find(x => x.id === Number(editPedidoProdutoSel))
                    if (!pr) return
                    setEditPedidoItens(prev => [...prev, { produtoId: pr.id, nomeProduto: pr.nome, sku: pr.sku || '', unidade: pr.unidade || 'un', preco: ehBonificacao ? 0 : (pr.preco || 0), quantidade: 1 }])
                    setEditPedidoProdutoSel('')
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 border border-gray-300 rounded-apple hover:bg-gray-200 disabled:opacity-50"
                >+ Item</button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
                  <select value={editPedidoPagamento} onChange={e => setEditPedidoPagamento(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-apple">
                    {editPedidoPagamento && !prazosAtivos.some(p => p.valor === editPedidoPagamento) && (
                      <option value={editPedidoPagamento}>{editPedidoPagamento} (desativado)</option>
                    )}
                    {prazosAtivos.map(o => (
                      <option key={o.id} value={o.valor}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frete</label>
                  <select value={editPedidoFrete} onChange={e => setEditPedidoFrete(e.target.value as 'CIF' | 'FOB' | 'VISITA')}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-apple">
                    <option value="">Selecione…</option>
                    {editPedidoFrete && !fretesAtivos.some(f => f.valor === editPedidoFrete) && (
                      <option value={editPedidoFrete}>{editPedidoFrete} (desativado)</option>
                    )}
                    {fretesAtivos.map(frt => (
                      <option key={frt.id} value={frt.valor}>{frt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-1">Observações <span className="text-red-500">*</span></label>
              <textarea value={editPedidoObs} onChange={e => setEditPedidoObs(e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4 text-sm resize-none" />

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {ehBonificacao ? 'Amostra/bonificação' : `Total: R$ ${totalEdit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setEditPedido(null)} disabled={editPedidoSaving}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Voltar</button>
                  <button
                    disabled={!valido || editPedidoSaving || !onEditarPedido}
                    onClick={async () => {
                      if (!onEditarPedido) { addNotificacao('error', 'Erro', 'Função de edição não disponível.', c.id); return }
                      setEditPedidoSaving(true)
                      const ehReenvioRecusado = editPedido.status === 'cancelado'
                      try {
                        await onEditarPedido(editPedido.id, {
                          observacoes: editPedidoObs.trim(),
                          formaPagamento: editPedidoPagamento,
                          tipoFrete: editPedidoFrete || null,
                          itens: editPedidoItens,
                          totalValor: ehBonificacao ? 0 : totalEdit,
                          reenviar: ehReenvioRecusado,
                        })
                        if (ehReenvioRecusado) {
                          try {
                            await db.updateCliente(c.id, { statusFollowUp: 'aguardando_aprovacao_gerente' })
                            setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, statusFollowUp: 'aguardando_aprovacao_gerente' } : cl))
                          } catch { /* non-critical */ }
                          addNotificacao('success', 'Pedido reenviado', `Pedido ${editPedido.numero} corrigido e reenviado para aprovação.`, c.id)
                          showToast?.('success', `Pedido ${editPedido.numero} reenviado para aprovação!`)
                        } else {
                          addNotificacao('success', 'Pedido atualizado', `Pedido ${editPedido.numero} salvo.`, c.id)
                          showToast?.('success', `Pedido ${editPedido.numero} atualizado!`)
                        }
                        setEditPedido(null)
                      } catch (err) {
                        logger.error('Erro ao editar pedido:', err)
                        addNotificacao('error', 'Erro', 'Falha ao salvar o pedido. Tente novamente.', c.id)
                      } finally {
                        setEditPedidoSaving(false)
                      }
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-apple hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editPedidoSaving ? '⏳ Salvando...' : editPedido.status === 'cancelado' ? '📤 Salvar e Reenviar' : 'Salvar alterações'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal: Avaliação por Item de Amostra */}
      {showAvaliarAmostra && (() => {
        const pedidoAmostra = (todosPedidos || []).find(p => p.clienteId === c.id && p.tipo === 'bonificacao')
        const itens = pedidoAmostra?.itens || []
        const todosAvaliados = itens.length > 0 && itens.every((_, idx) => avaliacaoItens[idx]?.aprovado !== null && avaliacaoItens[idx]?.aprovado !== undefined)
        const todosAprovados = itens.every((_, idx) => avaliacaoItens[idx]?.aprovado === true)
        const algumReprovado = itens.some((_, idx) => avaliacaoItens[idx]?.aprovado === false)
        const reprovadoSemMotivo = itens.some((_, idx) => avaliacaoItens[idx]?.aprovado === false && !avaliacaoItens[idx]?.motivo?.trim())

        const criarNovoCicloEmProposta = async () => {
          // Novo ciclo agora é criado automaticamente pelo moverCliente centralizado
          // quando resultadoAmostra === 'aprovada' e destino é 'proposta'
        }

        const handleConfirmar = async () => {
          const hoje = new Date().toISOString().split('T')[0]
          const nomesAprovados = new Set(itens.filter((_, idx) => avaliacaoItens[idx]?.aprovado === true).map(i => i.nomeProduto))
          const nomesReprovados = itens.filter((_, idx) => avaliacaoItens[idx]?.aprovado === false).map(i => i.nomeProduto)
          const denegadosAtuais = (c.produtosDenegados || []).filter(n => !nomesAprovados.has(n))
          const novosDenegados = Array.from(new Set([...denegadosAtuais, ...nomesReprovados]))
          const novosMotivos = itens
            .map((item, idx) => avaliacaoItens[idx]?.aprovado === false
              ? `${item.nomeProduto}: ${avaliacaoItens[idx]?.motivo || ''}`
              : null
            )
            .filter((m): m is string => m !== null)
          const motivoReprovacaoAnterior = c.motivoReprovacao || ''
          const motivosReprovados = motivoReprovacaoAnterior
            ? [motivoReprovacaoAnterior, ...novosMotivos].filter(Boolean).join('; ')
            : novosMotivos.join('; ')
          const algumAprovado = nomesAprovados.size > 0
          const extras: Partial<Cliente> = {
            resultadoAmostra: algumAprovado ? 'aprovada' : 'reprovada',
            dataResultadoAmostra: hoje,
            produtosDenegados: novosDenegados,
            ...(novosMotivos.length > 0 ? { motivoReprovacao: motivosReprovados } : {}),
          }
          try {
            // Matriz oficial: após registrar o resultado por item, o card de Amostra é ENCERRADO
            // (a venda segue pelo card de Proposta existente; se não existir, abre um em Proposta).
            await onMoverCliente(c.id, 'amostra_perdida', extras)
            await db.updateCliente(c.id, extras)
            setClientes(prev => prev.map(cli => cli.id === c.id ? { ...cli, ...extras } : cli))
            const listaAtual = todosClientes || []
            const cardComercial = listaAtual.find(cl => !cl.arquivadoDuplicata && cl.id !== c.id && ['proposta', 'negociacao'].includes(cl.etapa) && mesmaEmpresaNoFunil(cl, c))
            if (cardComercial) {
              const syncExtras: Partial<Cliente> = {
                produtosDenegados: novosDenegados,
                ...(novosMotivos.length > 0 ? { motivoReprovacao: motivosReprovados } : {}),
              }
              await db.updateCliente(cardComercial.id, syncExtras)
              setClientes(prev => prev.map(cli => cli.id === cardComercial.id ? { ...cli, ...syncExtras } : cli))
            } else if (onCriarNovoCiclo && !existeCardAtivoNoFunil(listaAtual, c, ['proposta', 'negociacao'])) {
              await onCriarNovoCiclo({ ...c, etapa: 'amostra_perdida' }, { produtosDenegados: novosDenegados }, 'proposta')
            }
          } catch (err) {
            logger.error('Erro ao salvar avaliação da amostra:', err)
          }
          setShowAvaliarAmostra(false)
          onClose()
        }

        return (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4" onClick={() => setShowAvaliarAmostra(false)}>
            <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">🧪 Resultado da Amostra por Item</h2>
                <p className="text-sm text-gray-500 mt-0.5">{c.razaoSocial} — Classifique cada produto como Aprovado ou Reprovado</p>
              </div>

              {itens.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <p>Nenhum item encontrado no pedido de amostra.</p>
                  <p className="text-xs mt-1">Registre o resultado geral para encerrar o card de Amostra (a venda segue em Proposta).</p>
                  <div className="flex gap-3 justify-center mt-4">
                    <button onClick={async () => { const hoje = new Date().toISOString().split('T')[0]; await onMoverCliente(c.id, 'amostra_perdida', { resultadoAmostra: 'aprovada', dataResultadoAmostra: hoje }); setShowAvaliarAmostra(false); onClose() }} className="px-4 py-2 bg-green-600 text-white rounded-apple text-sm hover:bg-green-700">✅ Homologado</button>
                    <button onClick={async () => { await onMoverCliente(c.id, 'amostra_perdida', { resultadoAmostra: 'reprovada', dataResultadoAmostra: new Date().toISOString().split('T')[0] }); setShowAvaliarAmostra(false); onClose() }} className="px-4 py-2 bg-red-600 text-white rounded-apple text-sm hover:bg-red-700">🚫 Reprovado</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {itens.map((item, idx) => {
                    const av = avaliacaoItens[idx] || { aprovado: null, motivo: '' }
                    return (
                      <div key={idx} className={`rounded-apple border p-3 space-y-2 transition-colors ${av.aprovado === true ? 'border-green-300 bg-green-50' : av.aprovado === false ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                            <p className="text-xs text-gray-500">{item.quantidade} KG</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => setAvaliacaoItens(prev => ({ ...prev, [idx]: { aprovado: true, motivo: '' } }))}
                              className={`px-3 py-1 rounded-apple text-xs font-medium border transition-colors ${av.aprovado === true ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}`}
                            >✅ Aprovado</button>
                            <button
                              onClick={() => setAvaliacaoItens(prev => ({ ...prev, [idx]: { ...prev[idx], aprovado: false, motivo: prev[idx]?.motivo || '' } }))}
                              className={`px-3 py-1 rounded-apple text-xs font-medium border transition-colors ${av.aprovado === false ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-300 hover:bg-red-50'}`}
                            >🚫 Reprovado</button>
                          </div>
                        </div>
                        {av.aprovado === false && (
                          <input
                            type="text"
                            value={av.motivo}
                            onChange={e => setAvaliacaoItens(prev => ({ ...prev, [idx]: { ...prev[idx], motivo: e.target.value } }))}
                            placeholder="Motivo da reprovação (obrigatório)..."
                            className="w-full px-2 py-1.5 border border-red-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
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
                        ? '✅ Todos os itens homologados — card de Amostra será encerrado e a venda segue pelo card de Proposta.'
                        : algumReprovado && !todosAprovados
                          ? '⚠️ Resultado misto registrado por item (homologados + reprovados) — card de Amostra será encerrado e a venda segue em Proposta.'
                          : '🚫 Todos os itens reprovados — registrados no cadastro e card de Amostra encerrado.'}
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

      {showCadastroCompleto && (
        <CadastroCompletoModal
          cliente={c}
          clientes={clientesParaCalculo}
          camposObrigatorios={(parametros.camposCadastroObrigatorios || []) as any}
          loggedUser={loggedUser}
          onClose={() => setShowCadastroCompleto(false)}
          onSave={salvarCadastroCompleto}
        />
      )}

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
