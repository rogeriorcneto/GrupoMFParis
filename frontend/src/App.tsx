import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  HomeIcon,
  FunnelIcon,
  UserGroupIcon,
  ChartBarIcon,
  PaperAirplaneIcon,
  MapIcon,
  MagnifyingGlassIcon,
  BellIcon,
  XMarkIcon,
  SparklesIcon,
  SunIcon,
  MoonIcon,
  DocumentTextIcon,
  CubeIcon,
  ShoppingCartIcon
} from '@heroicons/react/24/outline'
import type {
  ViewType, Cliente, FormData, Interacao, DragItem, AICommand,
  Notificacao, Atividade, Template, Produto, DashboardMetrics,
  TemplateMsg, Cadencia, Campanha, JobAutomacao, Tarefa,
  Vendedor, Pedido, HistoricoEtapa
} from './types'
import {
  DashboardView, FunilView, ClientesView, TarefasView,
  ProspeccaoView, AutomacoesView, MapaView, SocialSearchView,
  IntegracoesView, VendedoresView, RelatoriosView, TemplatesView,
  ProdutosView, PedidosView
} from './components/views'
import { supabase } from './lib/supabase'
import * as db from './lib/database'

function App() {
  const [loggedUser, setLoggedUser] = useState<Vendedor | null>(null)
  const [loginUsuario, setLoginUsuario] = useState('')
  const [loginSenha, setLoginSenha] = useState('')
  const [loginError, setLoginError] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [toastMsg, setToastMsg] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null)

  const showToast = (tipo: 'success' | 'error', texto: string) => {
    setToastMsg({ tipo, texto })
    setTimeout(() => setToastMsg(null), 4000)
  }

  const [darkMode, setDarkMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])

  const [activeView, setActiveView] = useState<ViewType>('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null)
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [aiCommands, setAICommands] = useState<AICommand[]>([])
  const [aiCommand, setAICommand] = useState('')
  const [aiResponse, setAIResponse] = useState('')
  const [isAILoading, setIsAILoading] = useState(false)
  const [templatesMsgs, setTemplatesMsgs] = useState<TemplateMsg[]>([])
  const [cadencias, setCadencias] = useState<Cadencia[]>([])
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [jobs, setJobs] = useState<JobAutomacao[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])

  // Carregar todos os dados do Supabase após autenticação
  const loadAllData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [
        clientesData, interacoesData, tarefasData, produtosData,
        pedidosData, vendedoresData, atividadesData, templatesData,
        templatesMsgsData, cadenciasData, campanhasData, jobsData
      ] = await Promise.all([
        db.fetchClientes(),
        db.fetchInteracoes(),
        db.fetchTarefas(),
        db.fetchProdutos(),
        db.fetchPedidos(),
        db.fetchVendedores(),
        db.fetchAtividades(),
        db.fetchTemplates(),
        db.fetchTemplateMsgs(),
        db.fetchCadencias(),
        db.fetchCampanhas(),
        db.fetchJobs(),
      ])
      setClientes(clientesData)
      setInteracoes(interacoesData)
      setTarefas(tarefasData)
      setProdutos(produtosData)
      setPedidos(pedidosData)
      setVendedores(vendedoresData)
      setAtividades(atividadesData)
      setTemplates(templatesData)
      setTemplatesMsgs(templatesMsgsData)
      setCadencias(cadenciasData)
      setCampanhas(campanhasData)
      setJobs(jobsData)
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Verificar sessão existente ao montar o componente
  useEffect(() => {
    const checkSession = async () => {
      try {
        const vendedor = await db.getLoggedVendedor()
        if (vendedor) {
          setLoggedUser(vendedor)
          await loadAllData()
        }
      } catch {
        // Sem sessão ativa, mostra login
      } finally {
        setAuthChecked(true)
        setIsLoading(false)
      }
    }
    checkSession()

    // Escutar mudanças de auth (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setLoggedUser(null)
        setClientes([])
        setInteracoes([])
        setTarefas([])
        setProdutos([])
        setPedidos([])
        setVendedores([])
        setAtividades([])
        setTemplates([])
        setTemplatesMsgs([])
        setCadencias([])
        setCampanhas([])
        setJobs([])
      }
    })

    return () => subscription.unsubscribe()
  }, [loadAllData])

  const [showMotivoPerda, setShowMotivoPerda] = useState(false)
  const [motivoPerdaTexto, setMotivoPerdaTexto] = useState('')
  const [categoriaPerdaSel, setCategoriaPerdaSel] = useState<Cliente['categoriaPerda']>('outro')
  const [pendingDrop, setPendingDrop] = useState<{ e: React.DragEvent, toStage: string } | null>(null)
  const [showModalAmostra, setShowModalAmostra] = useState(false)
  const [modalAmostraData, setModalAmostraData] = useState(new Date().toISOString().split('T')[0])
  const [showModalProposta, setShowModalProposta] = useState(false)
  const [modalPropostaValor, setModalPropostaValor] = useState('')
  const [selectedClientePanel, setSelectedClientePanel] = useState<Cliente | null>(null)
  const [panelAtividadeTipo, setPanelAtividadeTipo] = useState<Interacao['tipo'] | ''>('')
  const [panelAtividadeDesc, setPanelAtividadeDesc] = useState('')
  const [panelNota, setPanelNota] = useState('')
  const [panelNovaTarefa, setPanelNovaTarefa] = useState(false)
  const [panelTarefaTitulo, setPanelTarefaTitulo] = useState('')
  const [panelTarefaData, setPanelTarefaData] = useState(new Date().toISOString().split('T')[0])
  const [panelTarefaTipo, setPanelTarefaTipo] = useState<Tarefa['tipo']>('follow-up')
  const [panelTarefaPrioridade, setPanelTarefaPrioridade] = useState<Tarefa['prioridade']>('media')
  const [panelTab, setPanelTab] = useState<'info' | 'atividades' | 'tarefas'>('info')
  const [transicaoInvalida, setTransicaoInvalida] = useState('')

  // Recalculate diasInativo based on ultimaInteracao and persist
  useEffect(() => {
    const hoje = new Date()
    const changedIds: { id: number; diasInativo: number }[] = []
    const updated = clientes.map(c => {
      if (!c.ultimaInteracao) return c
      const dias = Math.floor((hoje.getTime() - new Date(c.ultimaInteracao).getTime()) / 86400000)
      if (dias !== (c.diasInativo || 0)) {
        changedIds.push({ id: c.id, diasInativo: dias })
        return { ...c, diasInativo: dias }
      }
      return c
    })
    if (changedIds.length > 0) {
      setClientes(updated)
      const persistDias = async () => {
        for (const { id, diasInativo } of changedIds) {
          try { await db.updateCliente(id, { diasInativo }) } catch (err) { console.error('Erro ao persistir diasInativo:', err) }
        }
      }
      persistDias()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Generate notifications from data (limited to 20, prioritized)
  const notifGenRef = useRef<string>('')
  useEffect(() => {
    const key = `${clientes.length}-${tarefas.length}-${vendedores.length}`
    if (notifGenRef.current === key) return
    notifGenRef.current = key

    const novas: Notificacao[] = []
    let nId = 1
    // Prazos vencidos (alta prioridade)
    clientes.forEach(c => {
      if (c.etapa === 'amostra' && c.dataEntradaEtapa) {
        const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
        if (dias >= 30) {
          novas.push({ id: nId++, tipo: 'error', titulo: '🔴 Prazo vencido (Amostra)', mensagem: `${c.razaoSocial} está há ${dias} dias na Amostra (prazo: 30d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        } else if (dias >= 25) {
          novas.push({ id: nId++, tipo: 'warning', titulo: '⚠️ Prazo vencendo (Amostra)', mensagem: `${c.razaoSocial} está há ${dias} dias na Amostra (prazo: 30d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        }
      }
      if (c.etapa === 'homologado' && c.dataEntradaEtapa) {
        const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
        if (dias >= 75) {
          novas.push({ id: nId++, tipo: 'error', titulo: '🔴 Prazo vencido (Homologado)', mensagem: `${c.razaoSocial} está há ${dias} dias em Homologado (prazo: 75d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        } else if (dias >= 60) {
          novas.push({ id: nId++, tipo: 'warning', titulo: '⚠️ Prazo vencendo (Homologado)', mensagem: `${c.razaoSocial} está há ${dias} dias em Homologado (prazo: 75d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        }
      }
    })
    // Meta em risco
    vendedores.forEach(v => {
      const clientesV = clientes.filter(c => c.vendedorId === v.id)
      const valorPipeline = clientesV.reduce((s, c) => s + (c.valorEstimado || 0), 0)
      if (valorPipeline < v.metaVendas * 0.5 && v.ativo) {
        novas.push({ id: nId++, tipo: 'error', titulo: 'Meta em risco', mensagem: `${v.nome} está abaixo de 50% da meta de vendas`, timestamp: new Date().toISOString(), lida: false })
      }
    })
    // Clientes inativos (top 10 mais inativos)
    clientes.filter(c => (c.diasInativo || 0) > 10).sort((a, b) => (b.diasInativo || 0) - (a.diasInativo || 0)).slice(0, 10).forEach(c => {
      novas.push({ id: nId++, tipo: 'warning', titulo: 'Cliente inativo', mensagem: `${c.razaoSocial} está inativo há ${c.diasInativo} dias`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
    })
    setNotificacoes(novas.slice(0, 20))
  }, [clientes, tarefas, vendedores])

  // Item 2: Movimentação automática pelo sistema (prazos vencidos)
  const autoMoveRef = useRef(false)
  useEffect(() => {
    if (autoMoveRef.current) return
    const now = Date.now()
    const clientesParaMover: { id: number; dias: number; etapa: string }[] = []
    clientes.forEach(c => {
      if (!c.dataEntradaEtapa) return
      const dias = Math.floor((now - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
      if (c.etapa === 'amostra' && dias > 30) clientesParaMover.push({ id: c.id, dias, etapa: 'amostra' })
      if (c.etapa === 'homologado' && dias > 75) clientesParaMover.push({ id: c.id, dias, etapa: 'homologado' })
      if (c.etapa === 'negociacao' && dias > 45) clientesParaMover.push({ id: c.id, dias, etapa: 'negociacao' })
    })
    if (clientesParaMover.length > 0) {
      autoMoveRef.current = true
      const nowStr = new Date().toISOString()
      // Update local state immediately
      setClientes(prev => prev.map(c => {
        const match = clientesParaMover.find(m => m.id === c.id)
        if (!match) return c
        const hist: HistoricoEtapa = { etapa: 'perdido', data: nowStr, de: c.etapa }
        return {
          ...c, etapa: 'perdido', etapaAnterior: c.etapa, dataEntradaEtapa: nowStr,
          historicoEtapas: [...(c.historicoEtapas || []), hist],
          categoriaPerda: 'sem_resposta' as const, dataPerda: nowStr.split('T')[0],
          motivoPerda: `[Sistema] Prazo de ${match.etapa === 'amostra' ? '30' : match.etapa === 'negociacao' ? '45' : '75'} dias na etapa "${match.etapa === 'amostra' ? 'Amostra' : match.etapa === 'negociacao' ? 'Negociação' : 'Homologado'}" vencido — movido automaticamente`
        }
      }))
      // Persist each auto-move to Supabase
      const persistAutoMoves = async () => {
        for (const m of clientesParaMover) {
          const cl = clientes.find(c => c.id === m.id)
          const fromStage = cl?.etapa || m.etapa
          const motivo = `[Sistema] Prazo de ${m.etapa === 'amostra' ? '30' : m.etapa === 'negociacao' ? '45' : '75'} dias na etapa "${m.etapa === 'amostra' ? 'Amostra' : m.etapa === 'negociacao' ? 'Negociação' : 'Homologado'}" vencido — movido automaticamente`
          try {
            await db.updateCliente(m.id, {
              etapa: 'perdido', etapaAnterior: fromStage, dataEntradaEtapa: nowStr,
              categoriaPerda: 'sem_resposta', dataPerda: nowStr.split('T')[0], motivoPerda: motivo
            })
            await db.insertHistoricoEtapa(m.id, { etapa: 'perdido', data: nowStr, de: fromStage })
            const savedAtiv = await db.insertAtividade({
              tipo: 'moveu',
              descricao: `${cl?.razaoSocial} movido para Perdido automaticamente (prazo ${m.etapa === 'amostra' ? '30d' : m.etapa === 'negociacao' ? '45d' : '75d'} vencido)`,
              vendedorNome: 'Sistema', timestamp: nowStr
            })
            setAtividades(prev => [savedAtiv, ...prev])
          } catch (err) { console.error('Erro auto-move Supabase:', err) }
          addNotificacao('error', 'Movido automaticamente', `${cl?.razaoSocial} → Perdido (prazo ${m.dias}d vencido)`, m.id)
        }
      }
      persistAutoMoves()
      setTimeout(() => { autoMoveRef.current = false }, 500)
    }
  }, [clientes])

  // Item 4: Score dinâmico — recalcula automaticamente e persiste
  useEffect(() => {
    const baseEtapa: Record<string, number> = { 'prospecção': 10, 'amostra': 25, 'homologado': 50, 'negociacao': 70, 'pos_venda': 90, 'perdido': 5 }
    const changedIds: { id: number; score: number }[] = []
    const updated = clientes.map(c => {
      const base = baseEtapa[c.etapa] || 10
      const bonusValor = Math.min((c.valorEstimado || 0) / 10000, 15)
      const qtdInteracoes = interacoes.filter(i => i.clienteId === c.id).length
      const bonusInteracoes = Math.min(qtdInteracoes * 3, 15)
      const penalidade = Math.min((c.diasInativo || 0) * 0.5, 20)
      const newScore = Math.max(0, Math.min(100, Math.round(base + bonusValor + bonusInteracoes - penalidade)))
      if (c.score !== newScore) { changedIds.push({ id: c.id, score: newScore }); return { ...c, score: newScore } }
      return c
    })
    if (changedIds.length > 0) {
      setClientes(updated)
      // Persist scores to Supabase in background
      const persistScores = async () => {
        for (const { id, score } of changedIds) {
          try { await db.updateCliente(id, { score }) } catch (err) { console.error('Erro ao persistir score:', err) }
        }
      }
      persistScores()
    }
  }, [interacoes])

  const [formData, setFormData] = useState<FormData>({
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    contatoNome: '',
    contatoTelefone: '',
    contatoEmail: '',
    endereco: '',
    valorEstimado: '',
    produtosInteresse: '',
    vendedorId: ''
  })

  // Dashboard Metrics Calculation
  const calculateDashboardMetrics = (): DashboardMetrics => {
    const totalLeads = clientes.length
    const leadsAtivos = clientes.filter(c => (c.diasInativo || 0) <= 15).length
    const leadsNovosHoje = clientes.filter(c => {
      const hoje = new Date().toISOString().split('T')[0]
      return c.ultimaInteracao === hoje
    }).length
    const interacoesHoje = interacoes.filter(c => {
      const hoje = new Date().toISOString().split('T')[0]
      return c.data.startsWith(hoje)
    }).length
    const valorTotal = clientes.reduce((sum, c) => sum + (c.valorEstimado || 0), 0)
    const ticketMedio = totalLeads > 0 ? valorTotal / totalLeads : 0
    const taxaConversao = totalLeads > 0 ? (clientes.filter(c => c.etapa === 'pos_venda').length / totalLeads) * 100 : 0

    return {
      totalLeads,
      leadsAtivos,
      taxaConversao,
      valorTotal,
      ticketMedio,
      leadsNovosHoje,
      interacoesHoje
    }
  }

  // Notification System
  const addNotificacao = (tipo: Notificacao['tipo'], titulo: string, mensagem: string, clienteId?: number) => {
    const novaNotificacao: Notificacao = {
      id: Date.now(),
      tipo,
      titulo,
      mensagem,
      timestamp: new Date().toLocaleString('pt-BR'),
      lida: false,
      clienteId
    }
    setNotificacoes(prev => [novaNotificacao, ...prev.slice(0, 9)])
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setNotificacoes(prev => prev.map(n => 
        n.id === novaNotificacao.id ? { ...n, lida: true } : n
      ))
    }, 5000)
  }

  // AI Command Processing
  const processAICommand = async (command: string) => {
    setIsAILoading(true)
    
    // Simulate AI processing
    setTimeout(() => {
      let response = ''
      
      if (command.toLowerCase().includes('leads inativos')) {
        const inativos = clientes.filter(c => (c.diasInativo || 0) > 30)
        response = `Encontrei ${inativos.length} leads inativos há mais de 30 dias:\n\n${inativos.map(c => 
          `• ${c.razaoSocial} - ${c.diasInativo} dias sem contato (${c.contatoEmail})`
        ).join('\n')}\n\nDeseja que eu envie um follow-up automático para todos?`
      } else if (command.toLowerCase().includes('follow-up')) {
        response = 'Follow-ups agendados com sucesso! 3 emails serão enviados hoje e 2 amanhã. Usarei templates personalizados para cada cliente.'
      } else if (command.toLowerCase().includes('priorizar')) {
        const top = clientes.filter(c => c.etapa !== 'perdido').sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3)
        response = top.length ? `Clientes priorizados por score:\n\n${top.map((c, i) => `${i+1}. ${c.razaoSocial} (Score: ${c.score || 0}) - ${c.etapa}`).join('\n')}\n\nFoco de hoje: ${top[0].razaoSocial}` : 'Nenhum cliente cadastrado ainda. Adicione clientes para priorizar.'
      } else if (command.toLowerCase().includes('relatório')) {
        const total = clientes.length
        const ativos = clientes.filter(c => (c.diasInativo || 0) <= 15).length
        const conversao = clientes.filter(c => c.etapa === 'pos_venda').length
        response = total > 0 ? `📊 Relatório Semanal:\n\n• Total leads: ${total}\n• Leads ativos: ${ativos}\n• Taxa ativação: ${((ativos/total) * 100).toFixed(1)}%\n• Conversões: ${conversao}\n• Ticket médio: R$ ${(clientes.reduce((sum, c) => sum + (c.valorEstimado || 0), 0) / total).toFixed(2)}` : 'Nenhum cliente cadastrado ainda. Adicione clientes para gerar relatórios.'
      } else {
        response = 'Entendido! Posso ajudar com:\n\n• 📋 Listar leads inativos\n• 📤 Enviar follow-ups\n• 🎯 Priorizar clientes\n• 📊 Gerar relatórios\n• 🔍 Buscar clientes\n\nO que você precisa?'
      }
      
      const newCommand: AICommand = {
        id: Date.now().toString(),
        command,
        response,
        timestamp: new Date().toLocaleString('pt-BR')
      }
      
      setAICommands(prev => [newCommand, ...prev.slice(0, 9)])
      setAIResponse(response)
      setIsAILoading(false)
    }, 1500)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const produtosArray = formData.produtosInteresse 
      ? formData.produtosInteresse.split(',').map(p => p.trim()).filter(p => p)
      : []
    const { vendedorId: vIdStr, valorEstimado: vEstStr, produtosInteresse: _pi, ...restForm } = formData
    
    try {
      if (editingCliente) {
        const updatedFields: Partial<Cliente> = {
          ...restForm,
          valorEstimado: vEstStr ? parseFloat(vEstStr) : undefined,
          vendedorId: vIdStr ? Number(vIdStr) : undefined,
          produtosInteresse: produtosArray
        }
        await db.updateCliente(editingCliente.id, updatedFields)
        setClientes(prev => prev.map(c => c.id === editingCliente.id ? { ...c, ...updatedFields } : c))
        
        const savedI = await db.insertInteracao({
          clienteId: editingCliente.id, tipo: 'email', data: new Date().toISOString(),
          assunto: 'Dados atualizados', descricao: `Cliente atualizado: ${formData.razaoSocial}`, automatico: false
        })
        setInteracoes(prev => [savedI, ...prev])
        setEditingCliente(null)
        showToast('success', `Cliente "${formData.razaoSocial}" atualizado com sucesso!`)
      } else {
        const savedC = await db.insertCliente({
          ...restForm, etapa: 'prospecção',
          valorEstimado: vEstStr ? parseFloat(vEstStr) : undefined,
          vendedorId: vIdStr ? Number(vIdStr) : undefined,
          produtosInteresse: produtosArray,
          ultimaInteracao: new Date().toISOString().split('T')[0], diasInativo: 0
        } as Omit<Cliente, 'id'>)
        setClientes(prev => [...prev, savedC])
        
        const savedI = await db.insertInteracao({
          clienteId: savedC.id, tipo: 'email', data: new Date().toISOString(),
          assunto: 'Bem-vindo!', descricao: `Novo cliente cadastrado: ${formData.razaoSocial}`, automatico: true
        })
        setInteracoes(prev => [savedI, ...prev])
        showToast('success', `Cliente "${formData.razaoSocial}" cadastrado com sucesso!`)
      }
    } catch (err) { console.error('Erro ao salvar cliente:', err); showToast('error', 'Erro ao salvar cliente. Tente novamente.') }
    
    setFormData({ razaoSocial: '', nomeFantasia: '', cnpj: '', contatoNome: '', contatoTelefone: '', contatoEmail: '', endereco: '', valorEstimado: '', produtosInteresse: '', vendedorId: '' })
    setShowModal(false)
  }

  const handleEditCliente = (cliente: Cliente) => {
    setEditingCliente(cliente)
    setFormData({
      razaoSocial: cliente.razaoSocial,
      nomeFantasia: cliente.nomeFantasia || '',
      cnpj: cliente.cnpj,
      contatoNome: cliente.contatoNome,
      contatoTelefone: cliente.contatoTelefone,
      contatoEmail: cliente.contatoEmail,
      endereco: cliente.endereco || '',
      valorEstimado: cliente.valorEstimado?.toString() || '',
      produtosInteresse: cliente.produtosInteresse?.join(', ') || '',
      vendedorId: cliente.vendedorId?.toString() || ''
    })
    setShowModal(true)
  }

  const handleQuickAction = async (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => {
    const assunto = tipo === 'propaganda' ? `Propaganda - ${canal.toUpperCase()}` : `Contato - ${canal.toUpperCase()}`
    const descricao = tipo === 'propaganda'
      ? `Envio de propaganda automatizada para ${cliente.razaoSocial}`
      : `Ação de contato iniciada com ${cliente.razaoSocial}`

    try {
      const savedI = await db.insertInteracao({
        clienteId: cliente.id, tipo: canal, data: new Date().toISOString(), assunto, descricao, automatico: true
      })
      setInteracoes(prev => [savedI, ...prev])
      const hoje = new Date().toISOString().split('T')[0]
      await db.updateCliente(cliente.id, { ultimaInteracao: hoje })
      setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, ultimaInteracao: hoje } : c))
    } catch (err) { console.error('Erro quickAction:', err) }
    addNotificacao('success', 'Automação executada', `${assunto}: ${cliente.razaoSocial}`, cliente.id)
  }

  const scheduleJob = async (job: Omit<JobAutomacao, 'id' | 'status'>) => {
    try {
      const savedJob = await db.insertJob({ ...job, status: 'pendente' })
      setJobs(prev => [savedJob, ...prev])
      const cliente = clientes.find(c => c.id === job.clienteId)
      if (cliente) addNotificacao('info', 'Job agendado', `Agendado ${job.canal.toUpperCase()} para ${cliente.razaoSocial}`, cliente.id)
    } catch (err) { console.error('Erro ao agendar job:', err) }
  }

  const runJobNow = async (jobId: number) => {
    try {
      await db.updateJobStatus(jobId, 'enviado')
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'enviado' } : j))
    } catch (err) { console.error('Erro ao executar job:', err) }
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    const cliente = clientes.find(c => c.id === job.clienteId)
    if (!cliente) return
    handleQuickAction(cliente, job.canal, job.tipo)
  }

  const startCampanha = async (campanhaId: number) => {
    const campanha = campanhas.find(c => c.id === campanhaId)
    if (!campanha) return
    const cadencia = cadencias.find(c => c.id === campanha.cadenciaId)
    if (!cadencia) return

    const audience = clientes.filter(c => {
      if (campanha.etapa && c.etapa !== campanha.etapa) return false
      if (campanha.minScore !== undefined && (c.score || 0) < campanha.minScore) return false
      if (campanha.diasInativoMin !== undefined && (c.diasInativo || 0) < campanha.diasInativoMin) return false
      return true
    })

    const now = new Date()
    for (const step of cadencia.steps) {
      for (const cliente of audience) {
        const dt = new Date(now)
        dt.setDate(dt.getDate() + step.delayDias)
        await scheduleJob({
          clienteId: cliente.id, canal: step.canal, tipo: 'propaganda',
          agendadoPara: dt.toISOString(), templateId: step.templateId, campanhaId: campanha.id
        })
      }
    }

    try {
      await db.updateCampanhaStatus(campanhaId, 'ativa')
    } catch (err) { console.error('Erro ao ativar campanha:', err) }
    setCampanhas(prev => prev.map(c => c.id === campanhaId ? { ...c, status: 'ativa' } : c))
    addNotificacao('success', 'Campanha ativada', `${campanha.nome} iniciada para ${audience.length} leads`)
  }

  const handleDragStart = (e: React.DragEvent, cliente: Cliente, fromStage: string) => {
    setDraggedItem({ cliente, fromStage })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const transicoesPermitidas: Record<string, string[]> = {
    'prospecção': ['amostra', 'perdido'],
    'amostra': ['homologado', 'perdido'],
    'homologado': ['negociacao', 'perdido'],
    'negociacao': ['pos_venda', 'homologado', 'perdido'],
    'pos_venda': ['negociacao'],
    'perdido': ['prospecção']
  }
  const stageLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }

  const moverCliente = async (clienteId: number, toStage: string, extras: Partial<Cliente> = {}) => {
    const now = new Date().toISOString()
    const cliente = clientes.find(c => c.id === clienteId)
    const fromStage = cliente?.etapa || ''

    // Update local state immediately (optimistic)
    setClientes(prev => prev.map(c => {
      if (c.id !== clienteId) return c
      const hist: HistoricoEtapa = { etapa: toStage, data: now, de: c.etapa }
      return { ...c, etapa: toStage, etapaAnterior: c.etapa, dataEntradaEtapa: now, historicoEtapas: [...(c.historicoEtapas || []), hist], ...extras }
    }))

    // Persist to Supabase
    try {
      await db.updateCliente(clienteId, { etapa: toStage, etapaAnterior: fromStage, dataEntradaEtapa: now, ...extras })
      await db.insertHistoricoEtapa(clienteId, { etapa: toStage, data: now, de: fromStage })
      const savedAtiv = await db.insertAtividade({ tipo: 'moveu', descricao: `${cliente?.razaoSocial} movido para ${stageLabels[toStage] || toStage}`, vendedorNome: loggedUser?.nome || 'Sistema', timestamp: now })
      setAtividades(prev => [savedAtiv, ...prev])
    } catch (err) { console.error('Erro ao mover cliente:', err) }

    // Item 3: Tarefas automáticas ao mover etapa
    const nome = cliente?.razaoSocial || 'Cliente'
    const dataDaqui = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().split('T')[0]
    const tarefaDefs: Omit<Tarefa, 'id'>[] = []
    if (toStage === 'amostra') {
      tarefaDefs.push({ titulo: `Follow-up amostra — ${nome}`, descricao: 'Verificar se o cliente recebeu e analisou a amostra', data: dataDaqui(15), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId })
      tarefaDefs.push({ titulo: `Cobrar resposta amostra — ${nome}`, descricao: 'Prazo de 30 dias se aproximando. Cobrar retorno urgente.', data: dataDaqui(25), hora: '09:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta', clienteId })
    }
    if (toStage === 'homologado') {
      tarefaDefs.push({ titulo: `Agendar reunião 1º pedido — ${nome}`, descricao: 'Cliente homologado. Agendar reunião para fechar primeiro pedido.', data: dataDaqui(30), hora: '14:00', tipo: 'reuniao', status: 'pendente', prioridade: 'alta', clienteId })
      tarefaDefs.push({ titulo: `Verificar prazo 75d — ${nome}`, descricao: 'Verificar se o cliente vai fazer pedido antes do prazo de 75 dias.', data: dataDaqui(60), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId })
    }
    if (toStage === 'negociacao') {
      tarefaDefs.push({ titulo: `Cobrar resposta proposta — ${nome}`, descricao: 'Verificar retorno da proposta comercial enviada.', data: dataDaqui(7), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta', clienteId })
    }
    if (toStage === 'pos_venda') {
      tarefaDefs.push({ titulo: `Confirmar entrega — ${nome}`, descricao: 'Confirmar que o pedido foi entregue corretamente.', data: dataDaqui(10), hora: '11:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId })
      tarefaDefs.push({ titulo: `Pós-venda: satisfação — ${nome}`, descricao: 'Pesquisa de satisfação e abrir porta para próximo pedido.', data: dataDaqui(20), hora: '14:00', tipo: 'email', status: 'pendente', prioridade: 'media', clienteId })
    }
    if (tarefaDefs.length > 0) {
      try {
        const savedTarefas = await Promise.all(tarefaDefs.map(t => db.insertTarefa(t)))
        setTarefas(prev => [...savedTarefas, ...prev])
      } catch (err) { console.error('Erro ao criar tarefas automáticas:', err) }
    }
  }

  const handleDrop = (e: React.DragEvent, toStage: string) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.fromStage === toStage) { setDraggedItem(null); return }

    const permitidas = transicoesPermitidas[draggedItem.fromStage] || []
    if (!permitidas.includes(toStage)) {
      setTransicaoInvalida(`Não é possível mover de "${stageLabels[draggedItem.fromStage]}" para "${stageLabels[toStage]}". Transições permitidas: ${permitidas.map(s => stageLabels[s]).join(', ')}`)
      setTimeout(() => setTransicaoInvalida(''), 4000)
      setDraggedItem(null)
      return
    }

    if (toStage === 'perdido') {
      setPendingDrop({ e, toStage })
      setShowMotivoPerda(true)
      return
    }
    if (toStage === 'amostra') {
      setPendingDrop({ e, toStage })
      setModalAmostraData(new Date().toISOString().split('T')[0])
      setShowModalAmostra(true)
      return
    }
    if (toStage === 'negociacao') {
      setPendingDrop({ e, toStage })
      setModalPropostaValor(draggedItem.cliente.valorEstimado?.toString() || '')
      setShowModalProposta(true)
      return
    }

    const extras: Partial<Cliente> = {}
    if (toStage === 'homologado') { extras.dataHomologacao = new Date().toISOString().split('T')[0]; extras.statusAmostra = 'aprovada' }
    if (toStage === 'pos_venda') { extras.statusEntrega = 'preparando'; extras.dataUltimoPedido = new Date().toISOString().split('T')[0] }
    if (toStage === 'prospecção') { extras.motivoPerda = undefined; extras.categoriaPerda = undefined; extras.dataPerda = undefined }

    moverCliente(draggedItem.cliente.id, toStage, extras)
    setDraggedItem(null)
  }

  const confirmPerda = () => {
    if (draggedItem) {
      moverCliente(draggedItem.cliente.id, 'perdido', {
        motivoPerda: motivoPerdaTexto.trim() || `Perdido por: ${categoriaPerdaSel}`,
        categoriaPerda: categoriaPerdaSel || 'outro',
        dataPerda: new Date().toISOString().split('T')[0]
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowMotivoPerda(false); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro')
  }

  const confirmAmostra = () => {
    if (draggedItem) {
      moverCliente(draggedItem.cliente.id, 'amostra', {
        dataEnvioAmostra: modalAmostraData,
        statusAmostra: 'enviada'
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowModalAmostra(false)
  }

  const confirmProposta = () => {
    if (draggedItem) {
      moverCliente(draggedItem.cliente.id, 'negociacao', {
        valorProposta: Number(modalPropostaValor) || draggedItem.cliente.valorEstimado || 0,
        dataProposta: new Date().toISOString().split('T')[0]
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowModalProposta(false); setModalPropostaValor('')
  }

  const openModal = () => {
    setEditingCliente(null)
    setFormData({
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      contatoNome: '',
      contatoTelefone: '',
      contatoEmail: '',
      endereco: '',
      valorEstimado: '',
      produtosInteresse: '',
      vendedorId: ''
    })
    setShowModal(true)
  }

  const viewsPermitidas: Record<Vendedor['cargo'], ViewType[]> = {
    gerente: ['dashboard', 'funil', 'clientes', 'automacoes', 'mapa', 'prospeccao', 'tarefas', 'social', 'integracoes', 'equipe', 'relatorios', 'templates', 'produtos', 'pedidos'],
    vendedor: ['funil', 'clientes', 'mapa', 'tarefas', 'produtos', 'templates', 'pedidos'],
    sdr: ['funil', 'clientes', 'mapa', 'prospeccao', 'tarefas', 'templates', 'pedidos'],
  }

  const renderContent = () => {
    const dashboardMetrics = calculateDashboardMetrics()
    switch (activeView) {
      case 'dashboard':
        return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} loggedUser={loggedUser} />
      case 'funil':
        return <FunilView 
          clientes={clientes}
          vendedores={vendedores}
          interacoes={interacoes}
          loggedUser={loggedUser}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onQuickAction={handleQuickAction}
          onClickCliente={(c) => setSelectedClientePanel(c)}
          isGerente={loggedUser?.cargo === 'gerente'}
          onImportNegocios={async (updates, novos) => {
            try {
              // Atualizar clientes existentes no Supabase
              for (const { clienteId, changes } of updates) {
                await db.updateCliente(clienteId, changes)
                setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, ...changes } : c))
              }
              // Criar novos clientes
              for (const novo of novos) {
                const saved = await db.insertCliente(novo as Omit<Cliente, 'id'>)
                setClientes(prev => [...prev, saved])
              }
              showToast('success', `Funil atualizado: ${updates.length} atualizados, ${novos.length} novos`)
            } catch (err) {
              console.error('Erro ao importar negócios:', err)
              showToast('error', 'Erro ao importar negócios. Verifique o CSV.')
            }
          }}
        />
      case 'clientes':
        return <ClientesView 
          clientes={clientes} 
          vendedores={vendedores}
          onNewCliente={openModal}
          onEditCliente={handleEditCliente}
          onImportClientes={async (novos) => {
            try {
              const saved = await db.insertClientesBatch(novos as Omit<Cliente, 'id'>[])
              setClientes(prev => [...prev, ...saved])
              showToast('success', `${saved.length} cliente(s) importado(s) com sucesso!`)
            } catch (err) { console.error('Erro ao importar:', err); showToast('error', 'Erro ao importar clientes. Verifique o CSV.') }
          }}
          onDeleteCliente={async (id) => {
            try {
              await db.deleteCliente(id)
              setClientes(prev => prev.filter(c => c.id !== id))
              setInteracoes(prev => prev.filter(i => i.clienteId !== id))
              setTarefas(prev => prev.filter(t => t.clienteId !== id))
              showToast('success', 'Cliente excluído com sucesso')
            } catch (err) { console.error('Erro ao deletar cliente:', err); showToast('error', 'Erro ao excluir cliente. Tente novamente.') }
          }}
          onDeleteAll={async () => {
            try {
              await db.deleteAllClientes()
              setClientes([])
              setInteracoes([])
              setTarefas(prev => prev.filter(t => !t.clienteId))
              showToast('success', 'Todos os clientes foram apagados com sucesso!')
            } catch (err) { console.error('Erro ao apagar todos:', err); showToast('error', 'Erro ao apagar clientes. Tente novamente.'); throw err }
          }}
        />
      case 'automacoes':
        return <AutomacoesView clientes={clientes} onAction={handleQuickAction} />
      case 'mapa':
        return <MapaView clientes={clientes} />
      case 'prospeccao':
        return (
          <ProspeccaoView
            clientes={clientes}
            interacoes={interacoes}
            templates={templatesMsgs}
            cadencias={cadencias}
            campanhas={campanhas}
            jobs={jobs}
            onQuickAction={handleQuickAction}
            onStartCampanha={startCampanha}
            onRunJobNow={runJobNow}
            onCreateTemplate={async (t: TemplateMsg) => {
              try {
                const saved = await db.insertTemplateMsg(t)
                setTemplatesMsgs(prev => [saved, ...prev])
              } catch (err) { console.error('Erro ao criar template msg:', err) }
            }}
            onCreateCampanha={async (c: Campanha) => {
              try {
                const saved = await db.insertCampanha(c)
                setCampanhas(prev => [saved, ...prev])
              } catch (err) { console.error('Erro ao criar campanha:', err) }
            }}
          />
        )
      case 'tarefas':
        return <TarefasView tarefas={tarefas} clientes={clientes} vendedores={vendedores} loggedUser={loggedUser}
          onUpdateTarefa={async (t) => {
            try {
              await db.updateTarefa(t.id, t)
              setTarefas(prev => prev.map(x => x.id === t.id ? t : x))
            } catch (err) { console.error('Erro ao atualizar tarefa:', err) }
          }}
          onAddTarefa={async (t) => {
            try {
              const saved = await db.insertTarefa(t)
              setTarefas(prev => [saved, ...prev])
            } catch (err) { console.error('Erro ao criar tarefa:', err) }
          }}
          onImportTarefas={async (novas) => {
            try {
              const saved = await db.insertTarefasBatch(novas)
              setTarefas(prev => [...saved, ...prev])
              showToast('success', `${saved.length} tarefa(s) importada(s) com sucesso!`)
            } catch (err) { console.error('Erro ao importar tarefas:', err); showToast('error', 'Erro ao importar tarefas. Verifique o CSV.') }
          }}
        />
      case 'social':
        return <SocialSearchView onAddLead={async (nome, telefone, endereco) => {
          try {
            const saved = await db.insertCliente({
              razaoSocial: nome, cnpj: '', contatoNome: '', contatoTelefone: telefone, contatoEmail: '', endereco, etapa: 'prospecção', ultimaInteracao: new Date().toISOString().split('T')[0], diasInativo: 0, score: 20
            } as Omit<Cliente, 'id'>)
            setClientes(prev => [...prev, saved])
          } catch (err) { console.error('Erro ao add lead social:', err) }
        }} />
      case 'integracoes':
        return <IntegracoesView />
      case 'equipe':
        return <VendedoresView vendedores={vendedores} clientes={clientes}
          onAddVendedor={async (email, senha, vendedorData) => {
            try {
              const saved = await db.createVendedorWithAuth(email, senha, vendedorData)
              setVendedores(prev => [...prev, saved])
              addNotificacao('success', 'Vendedor cadastrado', `${vendedorData.nome} já pode fazer login com ${email}`)
              showToast('success', `Vendedor "${vendedorData.nome}" cadastrado com sucesso!`)
            } catch (err: any) {
              console.error('Erro ao adicionar vendedor:', err)
              showToast('error', err?.message || 'Erro ao cadastrar vendedor')
              throw err // Re-throw para o VendedoresView exibir o erro
            }
          }}
          onUpdateVendedor={async (v) => {
            try {
              await db.updateVendedor(v.id, v)
              setVendedores(prev => prev.map(x => x.id === v.id ? v : x))
            } catch (err) { console.error('Erro ao atualizar vendedor:', err) }
          }}
        />
      case 'relatorios':
        return <RelatoriosView clientes={clientes} vendedores={vendedores} interacoes={interacoes} produtos={produtos} />
      case 'templates':
        return <TemplatesView templates={templates}
          onAdd={async (t) => {
            try {
              const saved = await db.insertTemplate(t)
              setTemplates(prev => [...prev, saved])
            } catch (err) { console.error('Erro ao criar template:', err) }
          }}
          onDelete={async (id) => {
            try {
              await db.deleteTemplate(id)
              setTemplates(prev => prev.filter(t => t.id !== id))
            } catch (err) { console.error('Erro ao deletar template:', err) }
          }}
        />
      case 'produtos':
        return <ProdutosView produtos={produtos}
          onAdd={async (p) => {
            try {
              const saved = await db.insertProduto(p)
              setProdutos(prev => [...prev, saved])
              showToast('success', `Produto "${p.nome}" cadastrado!`)
            } catch (err) { console.error('Erro ao adicionar produto:', err); showToast('error', 'Erro ao salvar produto. Tente novamente.') }
          }}
          onUpdate={async (p) => {
            try {
              await db.updateProduto(p.id, p)
              setProdutos(prev => prev.map(x => x.id === p.id ? p : x))
            } catch (err) { console.error('Erro ao atualizar produto:', err) }
          }}
          onDelete={async (id) => {
            try {
              await db.deleteProduto(id)
              setProdutos(prev => prev.filter(p => p.id !== id))
            } catch (err) { console.error('Erro ao deletar produto:', err) }
          }}
          isGerente={loggedUser?.cargo === 'gerente'}
        />
      case 'pedidos':
        return <PedidosView pedidos={pedidos} clientes={clientes} produtos={produtos} vendedores={vendedores} loggedUser={loggedUser!}
          onAddPedido={async (p) => {
            try {
              const saved = await db.insertPedido(p)
              setPedidos(prev => [...prev, saved])
              showToast('success', `Pedido ${p.numero} salvo com sucesso!`)
            } catch (err) { console.error('Erro ao criar pedido:', err); showToast('error', 'Erro ao salvar pedido. Tente novamente.') }
          }}
          onUpdatePedido={async (p) => {
            try {
              await db.updatePedidoStatus(p.id, p.status)
              setPedidos(prev => prev.map(x => x.id === p.id ? p : x))
            } catch (err) { console.error('Erro ao atualizar pedido:', err) }
          }}
        />
      default:
        return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} loggedUser={loggedUser} />
    }
  }

  const handleLogin = async () => {
    setLoginError('')
    try {
      await db.signIn(loginUsuario.trim(), loginSenha)
      const vendedor = await db.getLoggedVendedor()
      if (vendedor) {
        setLoggedUser(vendedor)
        await loadAllData()
        setActiveView(viewsPermitidas[vendedor.cargo][0])
        setLoginUsuario('')
        setLoginSenha('')
      } else {
        setLoginError('Usuário não encontrado na equipe')
      }
    } catch (err: any) {
      setLoginError(err?.message === 'Invalid login credentials' ? 'Email ou senha inválidos' : (err?.message || 'Erro ao fazer login'))
    }
  }

  // Tela de loading enquanto verifica sessão
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-lg mx-auto flex items-center justify-center mb-4 animate-pulse p-2">
            <img src="/Logo_MFParis.jpg" alt="GMF" className="w-full h-full object-contain rounded-xl" />
          </div>
          <p className="text-primary-200 mt-4">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!loggedUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-white rounded-2xl shadow-lg mx-auto flex items-center justify-center mb-4 p-2">
              <img src="/Logo_MFParis.jpg" alt="Grupo MF Paris" className="w-full h-full object-contain rounded-xl" />
            </div>
            <h1 className="text-3xl font-bold text-white">Grupo MF Paris</h1>
            <p className="text-primary-200 mt-2">CRM de Vendas</p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">Entrar no sistema</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={loginUsuario}
                  onChange={(e) => setLoginUsuario(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input
                  type="password"
                  value={loginSenha}
                  onChange={(e) => setLoginSenha(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Digite sua senha"
                  className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900"
                />
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-200 rounded-apple p-3 text-sm text-red-700 text-center">
                  {loginError}
                </div>
              )}

              <button
                onClick={handleLogin}
                className="w-full py-3 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm font-semibold text-base"
              >
                Entrar
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">Use o email e senha cadastrados pelo administrador.</p>
            </div>
          </div>

          <p className="text-center text-primary-200 text-xs mt-6">© 2026 Grupo MF Paris — CRM de Vendas</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen flex ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r flex flex-col`}>
        {/* Logo */}
        <div className={`h-16 flex items-center justify-between px-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <img src="/Logo_MFParis.jpg" alt="GMF Paris" className="h-10 w-10 rounded-full object-cover" />
            <h1 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Grupo MF Paris</h1>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-gray-400 hover:text-gray-600 rounded-apple">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {([
            { id: 'dashboard', icon: HomeIcon, label: 'Visão Geral' },
            { id: 'funil', icon: FunnelIcon, label: 'Funil' },
            { id: 'clientes', icon: UserGroupIcon, label: 'Clientes' },
            { id: 'pedidos', icon: ShoppingCartIcon, label: 'Pedidos' },
            { id: 'tarefas', icon: ChartBarIcon, label: 'Tarefas' },
            { id: 'mapa', icon: MapIcon, label: 'Mapa' },
            { id: 'produtos', icon: CubeIcon, label: 'Produtos' },
            { id: 'templates', icon: DocumentTextIcon, label: 'Templates' },
            { id: 'automacoes', icon: PaperAirplaneIcon, label: 'Automações' },
            { id: 'prospeccao', icon: MagnifyingGlassIcon, label: 'Prospecção' },
            { id: 'social', icon: MagnifyingGlassIcon, label: 'Busca Social' },
            { id: 'integracoes', icon: SparklesIcon, label: 'Integrações' },
            { id: 'equipe', icon: UserGroupIcon, label: 'Equipe' },
            { id: 'relatorios', icon: ChartBarIcon, label: 'Relatórios' },
          ] as { id: ViewType; icon: React.ElementType; label: string }[])
            .filter(item => viewsPermitidas[loggedUser.cargo].includes(item.id))
            .map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveView(item.id); setSidebarOpen(false) }}
                className={`
                  w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-apple transition-all duration-200
                  ${activeView === item.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.label}
              </button>
            ))}

          {/* Separador e Assistente IA — só para gerente */}
          {loggedUser.cargo === 'gerente' && (
          <div className="border-t border-gray-200 pt-4 mt-2">
            <button
              onClick={() => { setShowAIModal(true); setSidebarOpen(false) }}
              className="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-apple bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-apple-sm"
            >
              <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
              </svg>
              Assistente IA
            </button>
          </div>
          )}

          {/* Placeholder invisível para manter estrutura quando não é gerente */}
          {loggedUser.cargo !== 'gerente' && (
          <div className="border-t border-gray-200 pt-4 mt-2">
            <p className="text-xs text-gray-400 text-center px-2">Logado como <span className="font-medium text-gray-600">{loggedUser.cargo === 'sdr' ? 'SDR' : 'Vendedor'}</span></p>
          </div>
          )}

        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-primary-700">{loggedUser.avatar}</span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">{loggedUser.nome}</p>
                <p className="text-xs text-gray-500">{loggedUser.cargo === 'gerente' ? 'Gerente' : loggedUser.cargo === 'sdr' ? 'SDR' : 'Vendedor'}</p>
              </div>
            </div>
            <button
              onClick={async () => { await db.signOut(); setLoggedUser(null) }}
              className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              title="Sair"
            >
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className={`h-14 sm:h-16 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b flex items-center justify-between px-3 sm:px-6`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-apple transition-colors"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            </button>
            <h2 className={`text-base sm:text-lg font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {activeView === 'dashboard' && 'Visão Geral'}
              {activeView === 'funil' && 'Funil de Vendas'}
              {activeView === 'clientes' && 'Clientes'}
              {activeView === 'automacoes' && 'Automações de Vendas'}
              {activeView === 'mapa' && 'Mapa de Leads'}
              {activeView === 'prospeccao' && 'Prospecção'}
              {activeView === 'tarefas' && 'Tarefas e Agenda'}
              {activeView === 'social' && 'Busca por Redes Sociais'}
              {activeView === 'integracoes' && 'Integrações'}
              {activeView === 'equipe' && 'Equipe de Vendas'}
              {activeView === 'relatorios' && 'Relatórios e Gráficos'}
              {activeView === 'templates' && 'Templates de Mensagens'}
              {activeView === 'produtos' && 'Catálogo de Produtos'}
              {activeView === 'pedidos' && 'Lançamento de Pedidos'}
            </h2>
          </div>
          
          <div className="flex items-center space-x-1 sm:space-x-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-apple hover:bg-gray-100"
              title={darkMode ? 'Modo claro' : 'Modo escuro'}
            >
              {darkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-apple hover:bg-gray-100 relative"
              >
                <BellIcon className="h-5 w-5" />
                {notificacoes.filter(n => !n.lida).length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {notificacoes.filter(n => !n.lida).length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-white rounded-apple shadow-apple border border-gray-200 z-50 max-h-[70vh] overflow-y-auto">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Notificações</h3>
                    <button onClick={() => setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))} className="text-xs text-primary-600 hover:text-primary-800">Marcar todas como lidas</button>
                  </div>
                  {notificacoes.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Nenhuma notificação</div>
                  ) : (
                    notificacoes.map(n => (
                      <div key={n.id} className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!n.lida ? 'bg-blue-50' : ''}`} onClick={() => setNotificacoes(prev => prev.map(x => x.id === n.id ? { ...x, lida: true } : x))}>
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.tipo === 'warning' ? 'bg-yellow-500' : n.tipo === 'error' ? 'bg-red-500' : n.tipo === 'success' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{n.titulo}</p>
                            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.mensagem}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-3 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-gray-500">Carregando dados...</p>
              </div>
            </div>
          ) : renderContent()}
        </div>
      </div>

      {/* Modal Novo Cliente */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-white rounded-apple shadow-apple border border-gray-200 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Razão Social *
                    </label>
                    <input
                      type="text"
                      name="razaoSocial"
                      value={formData.razaoSocial}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Ex: Supermercado BH Ltda"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome Fantasia
                    </label>
                    <input
                      type="text"
                      name="nomeFantasia"
                      value={formData.nomeFantasia}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Ex: Nome Fantasia"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CNPJ *
                    </label>
                    <input
                      type="text"
                      name="cnpj"
                      value={formData.cnpj}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="00.000.000/0000-00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome do Contato *
                    </label>
                    <input
                      type="text"
                      name="contatoNome"
                      value={formData.contatoNome}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="João Silva"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telefone *
                    </label>
                    <input
                      type="tel"
                      name="contatoTelefone"
                      value={formData.contatoTelefone}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      E-mail *
                    </label>
                    <input
                      type="email"
                      name="contatoEmail"
                      value={formData.contatoEmail}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="email@empresa.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Endereço
                    </label>
                    <input
                      type="text"
                      name="endereco"
                      value={formData.endereco}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Rua, número, bairro, cidade - UF"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valor Estimado (R$)
                    </label>
                    <input
                      type="number"
                      name="valorEstimado"
                      value={formData.valorEstimado}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="0,00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Produtos de Interesse
                    </label>
                    <div className="border border-gray-300 rounded-apple p-3 max-h-40 overflow-y-auto space-y-1">
                      {produtos.filter(p => p.ativo).map(p => {
                        const selected = formData.produtosInteresse.split(',').map(s => s.trim()).filter(Boolean)
                        const isChecked = selected.includes(p.nome)
                        return (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const updated = isChecked
                                  ? selected.filter(s => s !== p.nome)
                                  : [...selected, p.nome]
                                setFormData(prev => ({ ...prev, produtosInteresse: updated.join(', ') }))
                              }}
                              className="w-4 h-4 text-primary-600 rounded"
                            />
                            <span className="text-sm text-gray-700">{p.nome}</span>
                            <span className="text-xs text-gray-400 ml-auto">R$ {p.preco.toFixed(2).replace('.', ',')}/{p.unidade}</span>
                          </label>
                        )
                      })}
                      {produtos.filter(p => p.ativo).length === 0 && <p className="text-xs text-gray-400">Nenhum produto cadastrado</p>}
                    </div>
                    {formData.produtosInteresse && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {formData.produtosInteresse.split(',').map(s => s.trim()).filter(Boolean).map(name => (
                          <span key={name} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-700 rounded-full border border-primary-200 flex items-center gap-1">
                            {name}
                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, produtosInteresse: prev.produtosInteresse.split(',').map(s => s.trim()).filter(s => s && s !== name).join(', ') }))} className="text-primary-400 hover:text-primary-700">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vendedor Responsável
                    </label>
                    <select
                      name="vendedorId"
                      value={formData.vendedorId || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="">Sem vendedor</option>
                      {vendedores.filter(v => v.ativo).map(v => (
                        <option key={v.id} value={v.id}>{v.nome} ({v.cargo === 'gerente' ? 'Gerente' : v.cargo === 'sdr' ? 'SDR' : 'Vendedor'})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 transition-colors duration-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm"
                  >
                    Salvar Cliente
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showAIModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm"
              onClick={() => setShowAIModal(false)}
            />

            <div className="relative w-full max-w-2xl bg-white rounded-apple shadow-apple border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Assistente Virtual IA</h2>
                <button
                  onClick={() => setShowAIModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="px-6 py-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Comando (em português natural)
                    </label>
                    <textarea
                      value={aiCommand}
                      onChange={(e) => setAICommand(e.target.value)}
                      placeholder="Ex: Lista leads inativos dos últimos 30 dias"
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                    <button
                      onClick={() => processAICommand(aiCommand)}
                      disabled={!aiCommand.trim() || isAILoading}
                      className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm flex items-center justify-center"
                    >
                      {isAILoading ? 'Processando...' : 'Enviar Comando'}
                    </button>

                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Comandos Rápidos:</p>
                      <div className="space-y-2">
                        <button
                          onClick={() => setAICommand('Listar leads inativos dos últimos 30 dias')}
                          className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                        >
                          Leads inativos (30 dias)
                        </button>
                        <button
                          onClick={() => setAICommand('Enviar follow-up automático para leads inativos')}
                          className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                        >
                          Follow-up automático
                        </button>
                        <button
                          onClick={() => setAICommand('Priorizar clientes por score')}
                          className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                        >
                          Priorizar clientes
                        </button>
                        <button
                          onClick={() => setAICommand('Gerar relatório semanal de vendas')}
                          className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                        >
                          Relatório semanal
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Resposta da IA
                    </label>
                    {aiResponse && (
                      <div className="bg-gray-50 rounded-apple p-4 border border-gray-200">
                        <div className="whitespace-pre-wrap text-sm text-gray-800">{aiResponse}</div>
                      </div>
                    )}

                    {aiCommands.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Histórico:</p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {aiCommands.map((cmd) => (
                            <div key={cmd.id} className="bg-white border border-gray-200 rounded-apple p-3">
                              <div className="text-xs text-gray-500 mb-1">{cmd.timestamp}</div>
                              <div className="text-sm font-medium text-gray-900 mb-1">{cmd.command}</div>
                              <div className="text-sm text-gray-700">{cmd.response}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Painel lateral do cliente */}
      {selectedClientePanel && (() => {
        const c = clientes.find(x => x.id === selectedClientePanel.id) || selectedClientePanel
        const vendedor = vendedores.find(v => v.id === c.vendedorId)
        const diasNaEtapa = c.dataEntradaEtapa ? Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000) : 0
        const etapaLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }
        const etapaCores: Record<string, string> = { 'prospecção': 'bg-blue-100 text-blue-800', 'amostra': 'bg-yellow-100 text-yellow-800', 'homologado': 'bg-green-100 text-green-800', 'negociacao': 'bg-purple-100 text-purple-800', 'pos_venda': 'bg-pink-100 text-pink-800', 'perdido': 'bg-red-100 text-red-800' }
        const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
        const clienteInteracoes = interacoes.filter(i => i.clienteId === c.id).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
        const clienteTarefas = tarefas.filter(t => t.clienteId === c.id).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
        const tipoInteracaoIcon: Record<string, string> = { email: '📧', whatsapp: '💬', ligacao: '📞', reuniao: '🤝', instagram: '📸', linkedin: '💼' }
        const tipoInteracaoLabel: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', ligacao: 'Ligação', reuniao: 'Reunião', instagram: 'Instagram', linkedin: 'LinkedIn' }

        const handleRegistrarAtividade = async () => {
          if (!panelAtividadeTipo || !panelAtividadeDesc.trim()) return
          try {
            const savedI = await db.insertInteracao({
              clienteId: c.id, tipo: panelAtividadeTipo, data: new Date().toISOString(),
              assunto: `${tipoInteracaoLabel[panelAtividadeTipo]} - ${c.razaoSocial}`,
              descricao: panelAtividadeDesc.trim(), automatico: false
            })
            setInteracoes(prev => [savedI, ...prev])
            const hoje = new Date().toISOString().split('T')[0]
            await db.updateCliente(c.id, { ultimaInteracao: hoje })
            setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, ultimaInteracao: hoje } : cl))
          } catch (err) { console.error('Erro ao registrar atividade:', err) }
          setPanelAtividadeTipo('')
          setPanelAtividadeDesc('')
          addNotificacao('success', 'Atividade registrada', `${tipoInteracaoLabel[panelAtividadeTipo]}: ${c.razaoSocial}`, c.id)
        }

        const handleSalvarNota = async () => {
          if (!panelNota.trim()) return
          try {
            const savedI = await db.insertInteracao({
              clienteId: c.id, tipo: 'email', data: new Date().toISOString(),
              assunto: `📝 Observação - ${c.razaoSocial}`, descricao: panelNota.trim(), automatico: false
            })
            setInteracoes(prev => [savedI, ...prev])
            const hoje = new Date().toISOString().split('T')[0]
            await db.updateCliente(c.id, { ultimaInteracao: hoje })
            setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, ultimaInteracao: hoje } : cl))
          } catch (err) { console.error('Erro ao salvar nota:', err) }
          setPanelNota('')
          addNotificacao('success', 'Observação salva', c.razaoSocial, c.id)
        }

        const handleCriarTarefa = async () => {
          if (!panelTarefaTitulo.trim()) return
          try {
            const saved = await db.insertTarefa({
              titulo: panelTarefaTitulo.trim(), data: panelTarefaData,
              tipo: panelTarefaTipo, status: 'pendente', prioridade: panelTarefaPrioridade, clienteId: c.id
            })
            setTarefas(prev => [saved, ...prev])
          } catch (err) { console.error('Erro ao criar tarefa:', err) }
          setPanelTarefaTitulo('')
          setPanelNovaTarefa(false)
          addNotificacao('success', 'Tarefa criada', `${panelTarefaTitulo.trim()} - ${c.razaoSocial}`, c.id)
        }

        return (
          <div className="fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black bg-opacity-30" onClick={() => setSelectedClientePanel(null)} />
            <div className="relative w-full sm:max-w-xl bg-white shadow-2xl overflow-y-auto animate-slide-in-right">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
                <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 truncate">{c.razaoSocial}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${etapaCores[c.etapa] || 'bg-gray-100 text-gray-800'}`}>{etapaLabels[c.etapa] || c.etapa}</span>
                      <span className="text-xs text-gray-500">Há {diasNaEtapa}d nesta etapa</span>
                      {c.score !== undefined && <span className="text-xs font-bold text-gray-600 ml-auto">Score: {c.score}</span>}
                    </div>
                  </div>
                  <button onClick={() => setSelectedClientePanel(null)} className="p-2 hover:bg-gray-100 rounded-apple ml-2"><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-t border-gray-100">
                  {([['info', '📋 Info'], ['atividades', '📞 Atividades'], ['tarefas', '✅ Tarefas']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setPanelTab(key)} className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${panelTab === key ? 'text-primary-700 border-b-2 border-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>{label} {key === 'atividades' && clienteInteracoes.length > 0 ? `(${clienteInteracoes.length})` : ''}{key === 'tarefas' && clienteTarefas.length > 0 ? `(${clienteTarefas.length})` : ''}</button>
                  ))}
                </div>
              </div>

              <div className="px-4 sm:px-6 py-5 space-y-5">

                {/* === ABA INFO === */}
                {panelTab === 'info' && (
                  <>
                    {/* Contato */}
                    <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">📇 Contato</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><p className="text-xs text-gray-500">Nome</p><p className="font-medium text-gray-900">{c.contatoNome}</p></div>
                        <div><p className="text-xs text-gray-500">CNPJ</p><p className="font-medium text-gray-900">{c.cnpj}</p></div>
                        <div><p className="text-xs text-gray-500">Telefone</p><p className="font-medium text-gray-900">{c.contatoTelefone}</p></div>
                        <div><p className="text-xs text-gray-500">Email</p><p className="font-medium text-gray-900 truncate">{c.contatoEmail}</p></div>
                      </div>
                      {c.endereco && <div><p className="text-xs text-gray-500">Endereço</p><p className="text-sm text-gray-900">{c.endereco}</p></div>}
                    </div>

                    {/* Dados comerciais */}
                    <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">💼 Dados Comerciais</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {c.valorEstimado && <div><p className="text-xs text-gray-500">Valor estimado</p><p className="font-bold text-primary-600">R$ {c.valorEstimado.toLocaleString('pt-BR')}</p></div>}
                        {vendedor && <div><p className="text-xs text-gray-500">Vendedor</p><p className="font-medium text-gray-900">{vendedor.nome}</p></div>}
                        {c.valorProposta && <div><p className="text-xs text-gray-500">Valor proposta</p><p className="font-bold text-purple-700">R$ {c.valorProposta.toLocaleString('pt-BR')}</p></div>}
                        {c.dataProposta && <div><p className="text-xs text-gray-500">Data proposta</p><p className="text-gray-900">{new Date(c.dataProposta).toLocaleDateString('pt-BR')}</p></div>}
                      </div>
                      {c.produtosInteresse && c.produtosInteresse.length > 0 && (
                        <div><p className="text-xs text-gray-500 mb-1">Produtos de interesse</p><div className="flex flex-wrap gap-1">{c.produtosInteresse.map(p => <span key={p} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-700 rounded-full border border-primary-100">{p}</span>)}</div></div>
                      )}
                    </div>

                    {/* Info da etapa atual */}
                    <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">📊 Info da Etapa</h3>
                      {c.etapa === 'amostra' && (
                        <div className="space-y-1 text-sm">
                          {c.dataEnvioAmostra && <p className="text-gray-700">📦 Amostra enviada em: <span className="font-medium">{new Date(c.dataEnvioAmostra).toLocaleDateString('pt-BR')}</span></p>}
                          {c.statusAmostra && <p className="text-gray-700">Status: <span className="font-medium">{({ enviada: '📤 Enviada', aguardando_resposta: '⏳ Aguardando', aprovada: '✅ Aprovada', rejeitada: '❌ Rejeitada' })[c.statusAmostra]}</span></p>}
                          <p className="text-gray-700">Prazo: <span className="font-medium">{Math.max(30 - (c.dataEnvioAmostra ? Math.floor((Date.now() - new Date(c.dataEnvioAmostra).getTime()) / 86400000) : 0), 0)} dias restantes</span></p>
                        </div>
                      )}
                      {c.etapa === 'homologado' && (
                        <div className="space-y-1 text-sm">
                          {c.dataHomologacao && <p className="text-gray-700">✅ Homologado em: <span className="font-medium">{new Date(c.dataHomologacao).toLocaleDateString('pt-BR')}</span></p>}
                          {c.proximoPedidoPrevisto && <p className="text-gray-700">🛒 Próximo pedido: <span className="font-medium">{new Date(c.proximoPedidoPrevisto).toLocaleDateString('pt-BR')}</span></p>}
                          <p className="text-gray-700">Prazo: <span className="font-medium">{Math.max(75 - (c.dataHomologacao ? Math.floor((Date.now() - new Date(c.dataHomologacao).getTime()) / 86400000) : 0), 0)} dias restantes</span></p>
                        </div>
                      )}
                      {c.etapa === 'negociacao' && (
                        <div className="space-y-1 text-sm">
                          {c.valorProposta && <p className="text-gray-700">💰 Proposta: <span className="font-bold">R$ {c.valorProposta.toLocaleString('pt-BR')}</span></p>}
                          {c.dataProposta && <p className="text-gray-700">📅 Enviada em: <span className="font-medium">{new Date(c.dataProposta).toLocaleDateString('pt-BR')}</span></p>}
                        </div>
                      )}
                      {c.etapa === 'pos_venda' && (
                        <div className="space-y-1 text-sm">
                          {c.statusEntrega && <p className="text-gray-700">Status: <span className="font-medium">{({ preparando: '📋 Preparando', enviado: '🚚 Enviado', entregue: '✅ Entregue' })[c.statusEntrega]}</span></p>}
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

                    {/* Timeline */}
                    {c.historicoEtapas && c.historicoEtapas.length > 0 && (
                      <div className="bg-gray-50 rounded-apple border border-gray-200 p-4">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">🗺️ Jornada no Funil</h3>
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

                    {/* Ações rápidas */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">⚡ Ações Rápidas</h3>
                      <div className="flex flex-wrap gap-2">
                        {c.etapa !== 'perdido' && (
                          <button onClick={() => { handleEditCliente(c); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-apple hover:bg-gray-50">✏️ Editar</button>
                        )}
                        {c.etapa === 'prospecção' && (
                          <button onClick={() => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: 'prospecção' }); setPendingDrop({ e: fakeE, toStage: 'amostra' }); setModalAmostraData(new Date().toISOString().split('T')[0]); setShowModalAmostra(true); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded-apple hover:bg-yellow-700">📦 Enviar Amostra</button>
                        )}
                        {c.etapa === 'amostra' && (
                          <button onClick={() => { moverCliente(c.id, 'homologado', { dataHomologacao: new Date().toISOString().split('T')[0], statusAmostra: 'aprovada' }); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700">✅ Homologar</button>
                        )}
                        {c.etapa === 'homologado' && (
                          <button onClick={() => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: 'homologado' }); setPendingDrop({ e: fakeE, toStage: 'negociacao' }); setModalPropostaValor(c.valorEstimado?.toString() || ''); setShowModalProposta(true); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-apple hover:bg-purple-700">💰 Negociar</button>
                        )}
                        {c.etapa === 'negociacao' && (
                          <>
                            <button onClick={() => { moverCliente(c.id, 'pos_venda', { statusEntrega: 'preparando', dataUltimoPedido: new Date().toISOString().split('T')[0] }); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700">🎉 Ganhou</button>
                            <button onClick={() => { moverCliente(c.id, 'homologado', {}); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-apple hover:bg-gray-300">↩ Voltou p/ Homologado</button>
                          </>
                        )}
                        {c.etapa !== 'perdido' && (
                          <button onClick={() => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: c.etapa }); setPendingDrop({ e: fakeE, toStage: 'perdido' }); setShowMotivoPerda(true); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-apple hover:bg-red-100">❌ Perdido</button>
                        )}
                        {c.etapa === 'perdido' && (
                          <button onClick={() => { moverCliente(c.id, 'prospecção', { motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined }); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-apple hover:bg-blue-700">🔄 Reativar</button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* === ABA ATIVIDADES === */}
                {panelTab === 'atividades' && (
                  <>
                    {/* Registrar Atividade */}
                    <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-900">📞 Registrar Atividade</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {([['ligacao', '📞', 'Ligação'], ['whatsapp', '💬', 'WhatsApp'], ['email', '📧', 'Email'], ['reuniao', '🤝', 'Reunião'], ['instagram', '📸', 'Instagram'], ['linkedin', '💼', 'LinkedIn']] as const).map(([tipo, icon, label]) => (
                          <button key={tipo} onClick={() => setPanelAtividadeTipo(panelAtividadeTipo === tipo ? '' : tipo)} className={`flex flex-col items-center gap-1 p-2 rounded-apple text-xs font-medium transition-all ${panelAtividadeTipo === tipo ? 'bg-primary-100 border-2 border-primary-500 text-primary-700 shadow-sm' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
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
                          <button onClick={handleRegistrarAtividade} disabled={!panelAtividadeDesc.trim()} className="w-full px-4 py-2 bg-primary-600 text-white rounded-apple text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                            ✅ Registrar {tipoInteracaoLabel[panelAtividadeTipo]}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Observação rápida */}
                    <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">📝 Observação Rápida</h3>
                      <textarea
                        value={panelNota}
                        onChange={(e) => setPanelNota(e.target.value)}
                        placeholder="Escreva uma nota ou observação sobre este cliente..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white"
                        rows={2}
                      />
                      <button onClick={handleSalvarNota} disabled={!panelNota.trim()} className="px-4 py-1.5 bg-gray-800 text-white rounded-apple text-xs font-medium hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        💾 Salvar Observação
                      </button>
                    </div>

                    {/* Histórico de interações */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">🕐 Histórico de Interações ({clienteInteracoes.length})</h3>
                      {clienteInteracoes.length === 0 ? (
                        <div className="bg-gray-50 rounded-apple border border-gray-200 p-6 text-center">
                          <p className="text-sm text-gray-500">Nenhuma interação registrada ainda.</p>
                          <p className="text-xs text-gray-400 mt-1">Use os botões acima para registrar a primeira atividade!</p>
                        </div>
                      ) : (
                        <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
                          {clienteInteracoes.slice(0, 15).map((inter) => (
                            <div key={inter.id} className="relative">
                              <div className={`absolute -left-[1.3rem] w-3 h-3 rounded-full ${inter.automatico ? 'bg-gray-400' : 'bg-primary-500'}`} />
                              <div className="ml-2 bg-white rounded-apple border border-gray-200 p-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-900">{tipoInteracaoIcon[inter.tipo] || '📋'} {inter.assunto}</span>
                                  {inter.automatico && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full">Auto</span>}
                                </div>
                                <p className="text-xs text-gray-600 mt-1">{inter.descricao}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{new Date(inter.data).toLocaleDateString('pt-BR')} às {new Date(inter.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                          ))}
                          {clienteInteracoes.length > 15 && <p className="text-xs text-gray-400 text-center">... e mais {clienteInteracoes.length - 15} interações</p>}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* === ABA TAREFAS === */}
                {panelTab === 'tarefas' && (
                  <>
                    {/* Botão nova tarefa */}
                    {!panelNovaTarefa ? (
                      <button onClick={() => setPanelNovaTarefa(true)} className="w-full px-4 py-3 bg-primary-50 border-2 border-dashed border-primary-300 rounded-apple text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors">
                        ➕ Nova Tarefa para {c.razaoSocial}
                      </button>
                    ) : (
                      <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">📋 Nova Tarefa</h3>
                        <input
                          type="text"
                          value={panelTarefaTitulo}
                          onChange={(e) => setPanelTarefaTitulo(e.target.value)}
                          placeholder="Título da tarefa... ex: Ligar para confirmar pedido"
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Data</label>
                            <input type="date" value={panelTarefaData} onChange={(e) => setPanelTarefaData(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                            <select value={panelTarefaTipo} onChange={(e) => setPanelTarefaTipo(e.target.value as Tarefa['tipo'])} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                              <option value="follow-up">Follow-up</option>
                              <option value="ligacao">Ligação</option>
                              <option value="email">Email</option>
                              <option value="whatsapp">WhatsApp</option>
                              <option value="reuniao">Reunião</option>
                              <option value="outro">Outro</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Prioridade</label>
                            <select value={panelTarefaPrioridade} onChange={(e) => setPanelTarefaPrioridade(e.target.value as Tarefa['prioridade'])} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                              <option value="alta">Alta</option>
                              <option value="media">Média</option>
                              <option value="baixa">Baixa</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleCriarTarefa} disabled={!panelTarefaTitulo.trim()} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-apple text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">✅ Criar Tarefa</button>
                          <button onClick={() => setPanelNovaTarefa(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-apple text-sm font-medium hover:bg-gray-200">Cancelar</button>
                        </div>
                      </div>
                    )}

                    {/* Lista de tarefas */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">📋 Tarefas do Cliente ({clienteTarefas.length})</h3>
                      {clienteTarefas.length === 0 ? (
                        <div className="bg-gray-50 rounded-apple border border-gray-200 p-6 text-center">
                          <p className="text-sm text-gray-500">Nenhuma tarefa vinculada a este cliente.</p>
                          <p className="text-xs text-gray-400 mt-1">Crie a primeira tarefa acima!</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {clienteTarefas.map((t) => (
                            <div key={t.id} className={`bg-white rounded-apple border p-3 ${t.status === 'concluida' ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                              <div className="flex items-start gap-2">
                                <button onClick={async () => { const newStatus = t.status === 'concluida' ? 'pendente' : 'concluida'; try { await db.updateTarefa(t.id, { status: newStatus }); } catch (err) { console.error('Erro toggle tarefa:', err) } setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x)) }} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${t.status === 'concluida' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-primary-500'}`}>
                                  {t.status === 'concluida' && <span className="text-xs">✓</span>}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${t.status === 'concluida' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{t.titulo}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-[10px] text-gray-400">{new Date(t.data).toLocaleDateString('pt-BR')}</span>
                                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${t.prioridade === 'alta' ? 'bg-red-100 text-red-700' : t.prioridade === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{t.prioridade}</span>
                                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded-full">{t.tipo}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

              </div>
            </div>
          </div>
        )
      })()}

      {/* Toast transição inválida */}
      {transicaoInvalida && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-5 py-3 rounded-apple shadow-apple-lg max-w-md animate-pulse">
          <p className="text-sm font-medium">⛔ {transicaoInvalida}</p>
        </div>
      )}

      {/* Modal Motivo de Perda */}
      {showMotivoPerda && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">❌ Marcar como Perdido</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                { key: 'preco', label: '💲 Preço', color: 'yellow' },
                { key: 'prazo', label: '⏰ Prazo', color: 'orange' },
                { key: 'qualidade', label: '⭐ Qualidade', color: 'blue' },
                { key: 'concorrencia', label: '🏁 Concorrência', color: 'red' },
                { key: 'sem_resposta', label: '📵 Sem resposta', color: 'gray' },
                { key: 'outro', label: '📝 Outro', color: 'purple' },
              ] as { key: NonNullable<Cliente['categoriaPerda']>; label: string; color: string }[]).map(cat => (
                <button key={cat.key} onClick={() => setCategoriaPerdaSel(cat.key)}
                  className={`px-2 py-2 text-xs font-medium rounded-apple border-2 transition-all ${categoriaPerdaSel === cat.key ? `border-${cat.color}-500 bg-${cat.color}-50 text-${cat.color}-800` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >{cat.label}</button>
              ))}
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da perda <span className="text-red-500">*</span></label>
            <textarea value={motivoPerdaTexto} onChange={(e) => setMotivoPerdaTexto(e.target.value)} rows={2} placeholder="Descreva o motivo da perda... (obrigatório)" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm resize-none" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowMotivoPerda(false); setDraggedItem(null); setPendingDrop(null); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro') }} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmPerda} disabled={!categoriaPerdaSel || !motivoPerdaTexto.trim()} className="px-4 py-2 bg-red-600 text-white rounded-apple hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">Confirmar Perda</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Envio de Amostra */}
      {showModalAmostra && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">📦 Enviar Amostra</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de envio da amostra</label>
            <input type="date" value={modalAmostraData} onChange={(e) => setModalAmostraData(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2 text-sm" />
            <p className="text-xs text-gray-500 mb-4">O prazo de 30 dias para resposta começará a contar a partir desta data.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowModalAmostra(false); setDraggedItem(null); setPendingDrop(null) }} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmAmostra} className="px-4 py-2 bg-yellow-600 text-white rounded-apple hover:bg-yellow-700 text-sm font-medium">Confirmar Envio</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast global de feedback */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-apple shadow-apple-lg max-w-sm animate-slide-in-right ${toastMsg.tipo === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          <div className="flex items-center gap-2">
            <span>{toastMsg.tipo === 'success' ? '✅' : '❌'}</span>
            <p className="text-sm font-medium">{toastMsg.texto}</p>
          </div>
        </div>
      )}

      {/* Modal Valor da Proposta */}
      {showModalProposta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">💰 Nova Negociação</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor da proposta (R$)</label>
            <input type="number" value={modalPropostaValor} onChange={(e) => setModalPropostaValor(e.target.value)} placeholder="Ex: 150000" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowModalProposta(false); setDraggedItem(null); setPendingDrop(null); setModalPropostaValor('') }} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmProposta} className="px-4 py-2 bg-purple-600 text-white rounded-apple hover:bg-purple-700 text-sm font-medium">Iniciar Negociação</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// All view components are imported from ./components/views/

export default App
