import React, { useState, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { Cliente, Interacao, Tarefa, Vendedor, Produto, Pedido, ItemPedido } from '../types'
import * as db from '../lib/database'
import { sendEmailViaBot } from '../lib/botApi'
import { logger } from '../utils/logger'
import { formatCNPJ } from '../utils/validators'
import WhatsAppUserPanel from './WhatsAppUserPanel'
import CallRecorder from './CallRecorder'

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
  onAddPedido?: (p: Omit<Pedido, 'id'>) => Promise<void>
}

const etapaLabels: Record<string, string> = { 'lead': 'Leads', 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'amostra_perdida': 'Amostra Perdida', 'proposta': 'Proposta', 'negociacao': 'Negociação', 'follow_up': 'Follow-up', 'inativo': 'Clientes Inativos', 'perdido': 'Perdido' }
const etapaCores: Record<string, string> = { 'lead': 'bg-emerald-100 text-emerald-800', 'prospecção': 'bg-sky-100 text-sky-800', 'amostra': 'bg-amber-100 text-amber-800', 'amostra_perdida': 'bg-orange-100 text-orange-800', 'proposta': 'bg-indigo-100 text-indigo-800', 'negociacao': 'bg-purple-100 text-purple-800', 'follow_up': 'bg-blue-100 text-blue-800', 'inativo': 'bg-gray-200 text-gray-700', 'perdido': 'bg-red-100 text-red-800' }
const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
const tipoInteracaoIcon: Record<string, string> = { email: '📧', whatsapp: '💬', ligacao: '📞', reuniao: '🤝', instagram: '📸', linkedin: '💼', nota: '📝' }
const tipoInteracaoLabel: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', ligacao: 'Ligação', reuniao: 'Reunião', instagram: 'Instagram', linkedin: 'LinkedIn', nota: 'Observação' }

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
  produtos, onAddPedido
}: ClientePanelProps) {
  const notasEmpresa = React.useMemo(() => parseNotasEmpresa(c.notas), [c.notas])
  const [panelAtividadeTipo, setPanelAtividadeTipo] = useState<Interacao['tipo'] | ''>('')
  const [panelAtividadeDesc, setPanelAtividadeDesc] = useState('')
  const [panelAtividadePrazo, setPanelAtividadePrazo] = useState(new Date().toISOString().split('T')[0])
  const [panelAtividadeHora, setPanelAtividadeHora] = useState(currentTimeHHMM())
  const [panelContatoSetor, setPanelContatoSetor] = useState(notasEmpresa.setor)
  const [panelInfoAdicional, setPanelInfoAdicional] = useState(notasEmpresa.info)
  const [panelRedesSociais, setPanelRedesSociais] = useState(c.redesSociais || '')
  const [pinnedInteracoes, setPinnedInteracoes] = useState<number[]>([])
  const [panelNovaTarefa, setPanelNovaTarefa] = useState(false)
  const [panelTarefaTitulo, setPanelTarefaTitulo] = useState('')
  const [panelTarefaData, setPanelTarefaData] = useState(new Date().toISOString().split('T')[0])
  const [panelTarefaHora, setPanelTarefaHora] = useState('')
  const [panelTarefaTipo, setPanelTarefaTipo] = useState<Tarefa['tipo']>('follow-up')
  const [panelTarefaPrioridade, setPanelTarefaPrioridade] = useState<Tarefa['prioridade']>('media')
  const [showCallRecorder, setShowCallRecorder] = useState(false)

  // Pedido rápido state
  const [showPedido, setShowPedido] = useState(false)
  const [pedidoTipo, setPedidoTipo] = useState<'venda' | 'bonificacao'>('venda')
  const [pedidoFrete, setPedidoFrete] = useState<'CIF' | 'FOB' | ''>('')
  const [pedidoItens, setPedidoItens] = useState<ItemPedido[]>([])
  const [pedidoObs, setPedidoObs] = useState('')
  const [pedidoSaving, setPedidoSaving] = useState(false)
  const [pedidoSearch, setPedidoSearch] = useState('')
  const [pedidoFormaPagamento, setPedidoFormaPagamento] = useState('À vista')

  // Collapsible sections
  const [showTimeline, setShowTimeline] = useState(false)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [showEmail, setShowEmail] = useState(false)

  // Email inline state
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)

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
    if (!panelAtividadeTipo || !panelAtividadeDesc.trim() || !panelAtividadePrazo || !panelAtividadeHora) return
    try {
      const savedI = await db.insertInteracao({
        clienteId: c.id, tipo: panelAtividadeTipo, data: new Date().toISOString(),
        assunto: `${tipoInteracaoLabel[panelAtividadeTipo]} - ${c.razaoSocial}`,
        descricao: panelAtividadeDesc.trim(), automatico: false
      })
      setInteracoes(prev => [savedI, ...prev])

      const tarefaTipo: Tarefa['tipo'] =
        panelAtividadeTipo === 'email' || panelAtividadeTipo === 'whatsapp' || panelAtividadeTipo === 'ligacao' || panelAtividadeTipo === 'reuniao'
          ? panelAtividadeTipo
          : panelAtividadeTipo === 'linkedin'
            ? 'follow-up'
            : 'outro'

      const savedT = await db.insertTarefa({
        titulo: `Retorno: ${tipoInteracaoLabel[panelAtividadeTipo]} - ${c.razaoSocial}`,
        descricao: panelAtividadeDesc.trim(),
        data: panelAtividadePrazo,
        hora: panelAtividadeHora,
        tipo: tarefaTipo,
        status: 'pendente',
        prioridade: 'media',
        clienteId: c.id,
        vendedorId: c.vendedorId || loggedUser?.id,
      })
      setTarefas(prev => [savedT, ...prev])

      const hoje = new Date().toISOString().split('T')[0]
      await db.updateCliente(c.id, { ultimaInteracao: hoje })
      setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, ultimaInteracao: hoje } : cl))
    } catch (err) { logger.error('Erro ao registrar atividade:', err) }
    setPanelAtividadeTipo('')
    setPanelAtividadeDesc('')
    addNotificacao('success', 'Atividade registrada', `${tipoInteracaoLabel[panelAtividadeTipo]}: ${c.razaoSocial} (prazo ${new Date(panelAtividadePrazo).toLocaleDateString('pt-BR')} às ${panelAtividadeHora})`, c.id)
  }

  const handleSalvarDadosEmpresa = async () => {
    const notas = composeNotasEmpresa(panelContatoSetor, panelInfoAdicional)
    try {
      await db.updateCliente(c.id, {
        redesSociais: panelRedesSociais.trim() || undefined,
        notas: notas || undefined,
      })
      setClientes(prev => prev.map(cl => cl.id === c.id ? {
        ...cl,
        redesSociais: panelRedesSociais.trim() || undefined,
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
      setPedidoItens([]); setPedidoObs(''); setPedidoFrete(''); setPedidoTipo('venda'); setPedidoFormaPagamento('À vista'); setShowPedido(false)
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
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{c.razaoSocial}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${etapaCores[c.etapa] || 'bg-gray-100 text-gray-800'}`}>{etapaLabels[c.etapa] || c.etapa}</span>
              <span className="text-xs text-gray-500">Há {diasNaEtapa}d nesta etapa</span>
              {c.score !== undefined && <span className="text-xs font-bold text-gray-600 ml-auto">Score: {c.score}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-apple ml-2"><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
        </div>

        <div className="px-4 sm:px-6 py-4 h-[calc(100dvh-84px)] sm:h-[calc(100%-84px)] overflow-y-auto lg:overflow-hidden">
          <div className="lg:h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="space-y-4 lg:col-span-5 xl:col-span-4 lg:overflow-y-auto lg:pr-1">

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

            {/* Botões de ação de contato */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
              {phone && (
                <a href={`tel:+55${phone}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-apple text-xs font-medium hover:bg-green-700 transition-colors">
                  📞 Ligar
                </a>
              )}
              {c.contatoEmail && (
                <button onClick={() => { setShowEmail(true); setTimeout(() => emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-apple text-xs font-medium hover:bg-blue-700 transition-colors">
                  📧 Email
                </button>
              )}
              {phone && (
                <button onClick={() => { setShowWhatsApp(true); setTimeout(() => whatsAppRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-apple text-xs font-medium hover:bg-emerald-700 transition-colors">
                  💬 WhatsApp
                </button>
              )}
            </div>
          </div>

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
          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">🌐 Redes sociais e informações adicionais</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Redes sociais</label>
              <input
                type="text"
                value={panelRedesSociais}
                onChange={(e) => setPanelRedesSociais(e.target.value)}
                placeholder="Instagram, LinkedIn, site, etc"
                className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
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

          {/* === AÇÕES RÁPIDAS === */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">⚡ Ações Rápidas</h3>
            <div className="flex flex-wrap gap-1.5">
              {c.etapa !== 'perdido' && (
                <button onClick={() => { onEditCliente(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-apple hover:bg-gray-50">✏️ Editar</button>
              )}
              {c.etapa === 'prospecção' && (
                <button onClick={() => { onTriggerAmostra(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded-apple hover:bg-yellow-700">📦 Enviar Amostra</button>
              )}
              {c.etapa === 'amostra' && (
                <button onClick={() => { onMoverCliente(c.id, 'proposta', { resultadoAmostra: 'aprovada' }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700">✅ Aprovar Amostra</button>
              )}
              {c.etapa === 'proposta' && (
                <button onClick={() => { onTriggerNegociacao(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-apple hover:bg-purple-700">💰 Negociar</button>
              )}
              {c.etapa === 'negociacao' && (
                <>
                  <button onClick={() => { onMoverCliente(c.id, 'follow_up', { statusFollowUp: 'pedido_aprovado', dataUltimoPedido: new Date().toISOString().split('T')[0] }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700">🎉 Ganhou</button>
                  <button onClick={() => { onMoverCliente(c.id, 'proposta', {}); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-apple hover:bg-gray-300">↩ Voltou p/ Proposta</button>
                </>
              )}
              {c.etapa !== 'perdido' && (
                <button onClick={() => { onTriggerPerda(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-apple hover:bg-red-100">❌ Perdido</button>
              )}
              {c.etapa === 'lead' && (
                <button onClick={() => { onMoverCliente(c.id, 'prospecção'); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-sky-600 text-white rounded-apple hover:bg-sky-700">🔎 Enviar para Prospecção</button>
              )}
              {c.etapa === 'amostra_perdida' && (c.tentativaAmostra || 0) < 2 && (
                <button onClick={() => { onTriggerAmostra(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-apple hover:bg-amber-700">🔄 2ª Tentativa Amostra</button>
              )}
              {(c.etapa === 'inativo' || c.etapa === 'perdido') && (
                <button onClick={() => { onMoverCliente(c.id, 'prospecção', { motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-apple hover:bg-blue-700">🔄 Reativar</button>
              )}
            </div>
          </div>

          </div>

          <div className="space-y-4 lg:col-span-7 xl:col-span-8 lg:overflow-y-auto lg:pl-1">

          {/* === REGISTRAR ATIVIDADE === */}
          <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">📞 Registrar Atividade</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {([['ligacao', '📞', 'Ligação'], ['whatsapp', '💬', 'WhatsApp'], ['email', '📧', 'Email'], ['reuniao', '🤝', 'Reunião'], ['linkedin', '💼', 'LinkedIn']] as const).map(([tipo, icon, label]) => (
                <button key={tipo} onClick={() => {
                  setPanelAtividadeTipo(panelAtividadeTipo === tipo ? '' : tipo)
                  if (tipo === 'email' && c.contatoEmail) { setShowEmail(true); setTimeout(() => emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }
                  if (tipo === 'whatsapp' && phone) { setShowWhatsApp(true); setTimeout(() => whatsAppRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }
                }} className={`flex flex-col items-center gap-1 p-2 rounded-apple text-xs font-medium transition-all ${panelAtividadeTipo === tipo ? 'bg-primary-100 border-2 border-primary-500 text-primary-700 shadow-sm' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                  <span className="text-lg">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {panelAtividadeTipo && (
              <div className="space-y-2">
                <textarea
                  value={panelAtividadeDesc}
                  onChange={(e) => setPanelAtividadeDesc(e.target.value)}
                  placeholder={`Descreva a ${tipoInteracaoLabel[panelAtividadeTipo] || 'atividade'}...`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  rows={3}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Prazo da tarefa *</label>
                    <input
                      type="date"
                      value={panelAtividadePrazo}
                      onChange={(e) => setPanelAtividadePrazo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Horário *</label>
                    <input
                      type="time"
                      value={panelAtividadeHora}
                      onChange={(e) => setPanelAtividadeHora(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <button onClick={handleRegistrarAtividade} disabled={!panelAtividadeDesc.trim() || !panelAtividadePrazo || !panelAtividadeHora} className="w-full px-4 py-2 bg-primary-600 text-white rounded-apple text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  ✅ Registrar {tipoInteracaoLabel[panelAtividadeTipo]}
                </button>
              </div>
            )}
          </div>

          {/* === TAREFAS === */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">✅ Tarefas ({clienteTarefas.length})</h3>
              {!panelNovaTarefa && (
                <button onClick={() => setPanelNovaTarefa(true)} className="px-2 py-1 text-xs font-medium text-primary-700 bg-primary-50 rounded-apple hover:bg-primary-100 transition-colors">
                  ➕ Nova
                </button>
              )}
            </div>
            {panelNovaTarefa && (
              <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
                <input type="text" value={panelTarefaTitulo} onChange={(e) => setPanelTarefaTitulo(e.target.value)} placeholder="Título da tarefa... ex: Ligar para confirmar pedido" className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Data</label>
                    <input type="date" value={panelTarefaData} onChange={(e) => setPanelTarefaData(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Horário</label>
                    <input type="time" value={panelTarefaHora} onChange={(e) => setPanelTarefaHora(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                    <select value={panelTarefaTipo} onChange={(e) => setPanelTarefaTipo(e.target.value as Tarefa['tipo'])} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="follow-up">Follow-up</option><option value="ligacao">Ligação</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="reuniao">Reunião</option><option value="outro">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Prioridade</label>
                    <select value={panelTarefaPrioridade} onChange={(e) => setPanelTarefaPrioridade(e.target.value as Tarefa['prioridade'])} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCriarTarefa} disabled={!panelTarefaTitulo.trim() || !panelTarefaData || !panelTarefaHora} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-apple text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">✅ Criar Tarefa</button>
                  <button onClick={() => setPanelNovaTarefa(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-apple text-sm font-medium hover:bg-gray-200">Cancelar</button>
                </div>
              </div>
            )}
            {clienteTarefas.length > 0 && (
              <div className="space-y-2">
                {clienteTarefas.slice(0, 5).map((t) => (
                  <div key={t.id} className={`bg-white rounded-apple border p-3 ${t.status === 'concluida' ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                    <div className="flex items-start gap-2">
                      <button onClick={async () => { const ns = t.status === 'concluida' ? 'pendente' : 'concluida'; try { await db.updateTarefa(t.id, { status: ns }); } catch (err) { logger.error('Erro toggle tarefa:', err) } setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns } : x)) }} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${t.status === 'concluida' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-primary-500'}`}>
                        {t.status === 'concluida' && <span className="text-xs">✓</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${t.status === 'concluida' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{t.titulo}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] text-gray-400">{new Date(t.data).toLocaleDateString('pt-BR')}{t.hora ? ` às ${t.hora}` : ''}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${t.prioridade === 'alta' ? 'bg-red-100 text-red-700' : t.prioridade === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{t.prioridade}</span>
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded-full">{t.tipo}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {clienteTarefas.length > 5 && <p className="text-xs text-gray-400 text-center">... e mais {clienteTarefas.length - 5} tarefas</p>}
              </div>
            )}
          </div>

          {/* === PEDIDO RÁPIDO === */}
          {onAddPedido && produtos && produtos.length > 0 && (
            <div className="space-y-3">
              <button onClick={() => setShowPedido(!showPedido)} className="w-full flex items-center justify-between px-4 py-3 bg-primary-50 border-2 border-primary-200 rounded-apple text-sm font-semibold text-primary-700 hover:bg-primary-100 transition-colors">
                <span>📦 {showPedido ? 'Fechar Pedido' : 'Novo Pedido de Venda / Amostra'}</span>
                <span className="text-lg">{showPedido ? '▲' : '▼'}</span>
              </button>
              {showPedido && (
                <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
                  <div className="flex gap-2">
                    <button onClick={() => setPedidoTipo('venda')} className={`flex-1 py-2 px-3 rounded-apple text-xs font-medium border-2 transition-colors ${pedidoTipo === 'venda' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>💰 Venda</button>
                    <button onClick={() => setPedidoTipo('bonificacao')} className={`flex-1 py-2 px-3 rounded-apple text-xs font-medium border-2 transition-colors ${pedidoTipo === 'bonificacao' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>🎁 Bonificação</button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setPedidoFrete('CIF')} className={`flex-1 py-2 px-3 rounded-apple text-xs font-medium border-2 transition-colors ${pedidoFrete === 'CIF' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>📦 CIF (Entrega)</button>
                    <button onClick={() => setPedidoFrete('FOB')} className={`flex-1 py-2 px-3 rounded-apple text-xs font-medium border-2 transition-colors ${pedidoFrete === 'FOB' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>🏭 FOB (Retirada)</button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">💳 Forma de Pagamento</label>
                    <select value={pedidoFormaPagamento} onChange={(e) => setPedidoFormaPagamento(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="À vista">À vista</option>
                      <option value="7 dias">7 dias</option>
                      <option value="14 dias">14 dias</option>
                      <option value="21 dias">21 dias</option>
                      <option value="28 dias">28 dias</option>
                      <option value="30 dias">30 dias</option>
                      <option value="45 dias">45 dias</option>
                      <option value="60 dias">60 dias</option>
                    </select>
                  </div>
                  <input type="text" placeholder="Buscar produto..." value={pedidoSearch} onChange={e => setPedidoSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredProdutos.slice(0, 20).map(p => {
                      const qtd = pedidoItens.find(i => i.produtoId === p.id)?.quantidade || 0
                      return (
                        <div key={p.id} className={`flex items-center gap-2 p-2 rounded-apple border ${qtd > 0 ? 'border-primary-300 bg-primary-50' : 'border-gray-100'}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{p.nome}</p>
                            <p className="text-[10px] text-gray-500">Unidade: {p.unidade.toUpperCase()}</p>
                          </div>
                          {qtd > 0 ? (
                            <div className="flex flex-col items-end gap-1">
                              {pedidoTipo === 'venda' && (
                                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                  <span>R$</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={pedidoItens.find(i => i.produtoId === p.id)?.preco || 0}
                                    onChange={e => setPedidoItemPreco(p.id, parseFloat(e.target.value))}
                                    onFocus={e => e.target.select()}
                                    className="w-16 px-1 py-0.5 border border-gray-300 rounded text-[10px] text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                                  />
                                  <span>/{p.unidade.toUpperCase()}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                              <button onClick={() => setPedidoItemQtd(p, qtd - 1)} className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-xs font-bold">−</button>
                              <span className="w-8 text-center text-xs font-bold">{qtd}</span>
                              <button onClick={() => setPedidoItemQtd(p, qtd + 1)} className="w-6 h-6 rounded-full bg-primary-600 hover:bg-primary-700 flex items-center justify-center text-white text-xs font-bold">+</button>
                              <span className="text-[9px] text-gray-400">(Quilo(s))</span>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setPedidoItemQtd(p, 1)} className="px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white text-[10px] font-medium rounded-apple">+ Add</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <textarea value={pedidoObs} onChange={e => setPedidoObs(e.target.value)} placeholder="Observações..." rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                  {pedidoItens.length > 0 && (
                    <div className="flex items-center justify-between text-sm font-bold text-gray-900 pt-2 border-t">
                      <span>{pedidoItens.reduce((s, i) => s + i.quantidade, 0)} kg</span>
                      <span>{pedidoTipo === 'venda' ? `R$ ${pedidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Amostra sem valor'}</span>
                    </div>
                  )}
                  <button onClick={handleEnviarPedido} disabled={pedidoItens.length === 0 || !pedidoFrete || pedidoSaving} className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-apple text-sm transition-colors">
                    {pedidoSaving ? '⏳ Enviando...' : (pedidoTipo === 'venda' ? `📤 Enviar Pedido — R$ ${pedidoTotal.toFixed(2)}` : '📤 Enviar Amostra')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* === HISTÓRICO DE INTERAÇÕES === */}
          {clienteInteracoes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">🕐 Histórico ({clienteInteracoes.length})</h3>
              <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
                {clienteInteracoesOrdenadas.slice(0, 10).map((inter) => (
                  <div key={inter.id} className="relative">
                    <div className={`absolute -left-[1.3rem] w-3 h-3 rounded-full ${inter.automatico ? 'bg-gray-400' : 'bg-primary-500'}`} />
                    <div className="ml-2 bg-white rounded-apple border border-gray-200 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{tipoInteracaoIcon[inter.tipo] || '📋'} {inter.assunto}</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleTogglePinInteracao(inter.id)} className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${pinnedInteracoes.includes(inter.id) ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                            {pinnedInteracoes.includes(inter.id) ? '📌 Fixado' : '📍 Fixar'}
                          </button>
                          {inter.automatico && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full">Auto</span>}
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{inter.descricao}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(inter.data).toLocaleDateString('pt-BR')} às {new Date(inter.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
                {clienteInteracoes.length > 10 && <p className="text-xs text-gray-400 text-center">... e mais {clienteInteracoes.length - 10} interações</p>}
              </div>
            </div>
          )}

          {/* === TIMELINE (collapsible) === */}
          {c.historicoEtapas && c.historicoEtapas.length > 0 && (
            <div className="bg-gray-50 rounded-apple border border-gray-200">
              <button onClick={() => setShowTimeline(!showTimeline)} className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors rounded-apple">
                <span>🗺️ Jornada no Funil ({c.historicoEtapas.length} etapas)</span>
                <span>{showTimeline ? '▲' : '▼'}</span>
              </button>
              {showTimeline && (
                <div className="px-4 pb-4">
                  <div className="relative pl-4 border-l-2 border-gray-300 space-y-3">
                    {c.historicoEtapas.map((h, i) => (
                      <div key={i} className="relative">
                        <div className={`absolute -left-[1.3rem] w-3 h-3 rounded-full ${i === c.historicoEtapas!.length - 1 ? 'bg-primary-600 ring-2 ring-primary-200' : 'bg-gray-400'}`} />
                        <div className="ml-2">
                          <p className="text-sm font-medium text-gray-900">{etapaLabels[h.etapa] || h.etapa}</p>
                          <p className="text-xs text-gray-500">{new Date(h.data).toLocaleDateString('pt-BR')} {h.de && `← ${etapaLabels[h.de] || h.de}`}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === WHATSAPP (collapsible) === */}
          <div ref={whatsAppRef} className="bg-gray-50 rounded-apple border border-gray-200">
            <button onClick={() => setShowWhatsApp(!showWhatsApp)} className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors rounded-apple">
              <span>📱 WhatsApp Chat</span>
              <span>{showWhatsApp ? '▲' : '▼'}</span>
            </button>
            {showWhatsApp && (
              <div className="px-4 pb-4">
                <WhatsAppUserPanel
                  loggedUser={loggedUser}
                  cliente={c}
                  showToast={(tipo, texto) => addNotificacao(tipo === 'success' ? 'success' : 'error', tipo === 'success' ? 'WhatsApp' : 'Erro WhatsApp', texto, c.id)}
                  compact
                />
              </div>
            )}
          </div>

          {/* === EMAIL (collapsible) === */}
          <div ref={emailRef} className="bg-gray-50 rounded-apple border border-gray-200">
            <button onClick={() => setShowEmail(!showEmail)} className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors rounded-apple">
              <span>📧 Email</span>
              <span>{showEmail ? '▲' : '▼'}</span>
            </button>
            {showEmail && (
              <div className="px-4 pb-4 space-y-3">
                {!c.contatoEmail ? (
                  <div className="text-center py-4">
                    <p className="text-2xl mb-2">📭</p>
                    <p className="text-sm text-gray-600">Sem email cadastrado</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-apple p-2.5">
                      <p className="text-xs text-blue-700">Email enviado via SMTP do CRM para <strong>{c.contatoEmail}</strong></p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Assunto *</label>
                      <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder={`Contato - ${c.razaoSocial}`} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Mensagem *</label>
                      <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5} placeholder={`Olá ${c.contatoNome || ''},\n\n\n\nAtenciosamente,\n${loggedUser?.nome || ''}\nGrupo MF Paris`} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>
                    <button
                      onClick={async () => {
                        if (!emailSubject.trim() || !emailBody.trim()) return
                        setEmailSending(true)
                        try {
                          const result = await sendEmailViaBot(c.contatoEmail!, emailSubject.trim(), emailBody.trim(), c.id, loggedUser?.nome)
                          if (result.success) {
                            addNotificacao('success', 'Email enviado', `Email enviado para ${c.contatoEmail}`, c.id)
                            setEmailSubject(''); setEmailBody('')
                          } else {
                            addNotificacao('error', 'Erro Email', result.error || 'Falha ao enviar email', c.id)
                          }
                        } catch (err: any) {
                          addNotificacao('error', 'Erro Email', err?.message || 'Erro desconhecido', c.id)
                        }
                        setEmailSending(false)
                      }}
                      disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-apple transition-colors"
                    >
                      {emailSending ? '⏳ Enviando...' : '📧 Enviar Email'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

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
    </div>
  )
}
