import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  DocumentTextIcon,
  CubeIcon,
  ShoppingCartIcon,
} from '@heroicons/react/24/outline'
import type {
  ViewType, Cliente, Interacao, AICommand,
  Notificacao, Atividade, Template, Produto, DashboardMetrics,
  TemplateMsg, Cadencia, Campanha, JobAutomacao, Tarefa,
  Vendedor, Pedido
} from './types'
import {
  DashboardView, FunilView, ClientesView, TarefasView,
  ProspeccaoView, AutomacoesView, MapaView, SocialSearchView,
  IntegracoesView, VendedoresView, RelatoriosView, TemplatesView,
  ProdutosView, PedidosView
} from './components/views'
import { supabase } from './lib/supabase'
import * as db from './lib/database'
import { useNotificacoes } from './hooks/useNotificacoes'
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription'
import ClientePanel from './components/ClientePanel'
import { useAutoRules } from './hooks/useAutoRules'
import { useClienteForm } from './hooks/useClienteForm'
import { useFunilActions } from './hooks/useFunilActions'
import { logger } from './utils/logger'

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

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [dbNotificacoes, setDbNotificacoes] = useState<Notificacao[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])

  const [activeView, setActiveView] = useState<ViewType>('dashboard')
  const [showAIModal, setShowAIModal] = useState(false)
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
        templatesMsgsData, cadenciasData, campanhasData, jobsData,
        notificacoesData
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
        db.fetchNotificacoes(),
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
      setDbNotificacoes(notificacoesData)
    } catch (err) {
      logger.error('Erro ao carregar dados:', err)
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

  // Realtime: auto-sync clientes, interacoes, tarefas from other users
  const isLoggedIn = !!loggedUser
  useRealtimeSubscription<any>('clientes', useCallback((payload) => {
    if (payload.eventType === 'INSERT') {
      // Only add if not already in local state (avoids duplicates from own inserts)
      setClientes(prev => prev.some(c => c.id === payload.new.id) ? prev : [...prev, db.clienteFromDb(payload.new)])
    } else if (payload.eventType === 'UPDATE') {
      setClientes(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...db.clienteFromDb(payload.new), historicoEtapas: c.historicoEtapas } : c))
    } else if (payload.eventType === 'DELETE') {
      setClientes(prev => prev.filter(c => c.id !== payload.old.id))
    }
  }, []), isLoggedIn)

  useRealtimeSubscription<any>('interacoes', useCallback((payload) => {
    if (payload.eventType === 'INSERT') {
      const newI = db.interacaoFromDb(payload.new)
      setInteracoes(prev => prev.some(i => i.id === newI.id) ? prev : [newI, ...prev])
    }
  }, []), isLoggedIn)

  useRealtimeSubscription<any>('tarefas', useCallback((payload) => {
    if (payload.eventType === 'INSERT') {
      const newT = db.tarefaFromDb(payload.new)
      setTarefas(prev => prev.some(t => t.id === newT.id) ? prev : [newT, ...prev])
    } else if (payload.eventType === 'UPDATE') {
      setTarefas(prev => prev.map(t => t.id === payload.new.id ? db.tarefaFromDb(payload.new) : t))
    } else if (payload.eventType === 'DELETE') {
      setTarefas(prev => prev.filter(t => t.id !== payload.old.id))
    }
  }, []), isLoggedIn)

  // Notification system — hook handles auto-generation + Supabase persistence
  const { notificacoes, addNotificacao, markAllRead, markRead } = useNotificacoes(clientes, tarefas, vendedores, dbNotificacoes)

  // Auto business rules: diasInativo recalc, orphan fix, auto-move, score calc
  useAutoRules({ clientes, setClientes, interacoes, vendedores, loggedUser, setAtividades, addNotificacao })

  // Client form state + handlers
  const {
    formData, setFormData, editingCliente, isSaving,
    showModal, setShowModal, handleInputChange, handleSubmit,
    handleEditCliente, openModal,
    isLoadingCep, isLoadingCnpj, buscarCep, buscarCnpj,
  } = useClienteForm({ loggedUser, setClientes, setInteracoes, showToast })

  // Funnel actions: drag/drop, mover, modals, quick actions, campaigns
  const {
    draggedItem, setDraggedItem,
    handleDragStart, handleDragOver, handleDrop,
    moverCliente, handleQuickAction, scheduleJob, runJobNow, startCampanha,
    showMotivoPerda, setShowMotivoPerda, motivoPerdaTexto, setMotivoPerdaTexto,
    categoriaPerdaSel, setCategoriaPerdaSel, confirmPerda,
    showModalAmostra, setShowModalAmostra, modalAmostraData, setModalAmostraData, confirmAmostra,
    showModalProposta, setShowModalProposta, modalPropostaValor, setModalPropostaValor, confirmProposta,
    selectedClientePanel, setSelectedClientePanel,
    transicaoInvalida, pendingDrop, setPendingDrop,
  } = useFunilActions({
    clientes, setClientes, interacoes, setInteracoes, loggedUser,
    setAtividades, addNotificacao, jobs, setJobs, campanhas, setCampanhas,
    cadencias, tarefas, setTarefas, loadAllData
  })

  // Dashboard Metrics Calculation (memoized)
  const dashboardMetrics = useMemo((): DashboardMetrics => {
    const totalLeads = clientes.length
    const leadsAtivos = clientes.filter(c => (c.diasInativo || 0) <= 15).length
    const hoje = new Date().toISOString().split('T')[0]
    const leadsNovosHoje = clientes.filter(c => c.dataEntradaEtapa?.startsWith(hoje)).length
    const interacoesHoje = interacoes.filter(c => c.data.startsWith(hoje)).length
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
  }, [clientes, interacoes])

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


  const viewsPermitidas: Record<Vendedor['cargo'], ViewType[]> = {
    gerente: ['dashboard', 'funil', 'clientes', 'automacoes', 'mapa', 'prospeccao', 'tarefas', 'social', 'integracoes', 'equipe', 'relatorios', 'templates', 'produtos', 'pedidos'],
    vendedor: ['funil', 'clientes', 'mapa', 'tarefas', 'produtos', 'templates', 'pedidos'],
    sdr: ['funil', 'clientes', 'mapa', 'prospeccao', 'tarefas', 'templates', 'pedidos'],
  }

  const renderContent = () => {
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
              // Criar novos clientes em batch (auto-atribuir ao vendedor logado)
              if (novos.length > 0) {
                const comVendedor = novos.map(c => ({ ...c, vendedorId: c.vendedorId || loggedUser?.id }))
                const savedNovos = await db.insertClientesBatch(comVendedor as Omit<Cliente, 'id'>[])
                setClientes(prev => [...prev, ...savedNovos])
              }
              showToast('success', `Funil atualizado: ${updates.length} atualizados, ${novos.length} novos`)
            } catch (err) {
              logger.error('Erro ao importar negócios:', err)
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
              const comVendedor = novos.map(c => ({ ...c, vendedorId: c.vendedorId || loggedUser?.id }))
              const saved = await db.insertClientesBatch(comVendedor as Omit<Cliente, 'id'>[])
              setClientes(prev => [...prev, ...saved])
              showToast('success', `${saved.length} cliente(s) importado(s) com sucesso!`)
            } catch (err) { logger.error('Erro ao importar:', err); showToast('error', 'Erro ao importar clientes. Verifique o CSV.') }
          }}
          onDeleteCliente={async (id) => {
            try {
              await db.deleteCliente(id)
              setClientes(prev => prev.filter(c => c.id !== id))
              setInteracoes(prev => prev.filter(i => i.clienteId !== id))
              setTarefas(prev => prev.filter(t => t.clienteId !== id))
              showToast('success', 'Cliente excluído com sucesso')
            } catch (err) { logger.error('Erro ao deletar cliente:', err); showToast('error', 'Erro ao excluir cliente. Tente novamente.') }
          }}
          onDeleteAll={async () => {
            try {
              await db.deleteAllClientes()
              setClientes([])
              setInteracoes([])
              setTarefas(prev => prev.filter(t => !t.clienteId))
              showToast('success', 'Todos os clientes foram apagados com sucesso!')
            } catch (err) { logger.error('Erro ao apagar todos:', err); showToast('error', 'Erro ao apagar clientes. Tente novamente.'); throw err }
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
              } catch (err) { logger.error('Erro ao criar template msg:', err) }
            }}
            onCreateCampanha={async (c: Campanha) => {
              try {
                const saved = await db.insertCampanha(c)
                setCampanhas(prev => [saved, ...prev])
              } catch (err) { logger.error('Erro ao criar campanha:', err) }
            }}
          />
        )
      case 'tarefas':
        return <TarefasView tarefas={tarefas} clientes={clientes} vendedores={vendedores} loggedUser={loggedUser}
          onUpdateTarefa={async (t) => {
            try {
              await db.updateTarefa(t.id, t)
              setTarefas(prev => prev.map(x => x.id === t.id ? t : x))
            } catch (err) { logger.error('Erro ao atualizar tarefa:', err) }
          }}
          onAddTarefa={async (t) => {
            try {
              const saved = await db.insertTarefa(t)
              setTarefas(prev => [saved, ...prev])
            } catch (err) { logger.error('Erro ao criar tarefa:', err) }
          }}
          onImportTarefas={async (novas) => {
            try {
              const saved = await db.insertTarefasBatch(novas)
              setTarefas(prev => [...saved, ...prev])
              showToast('success', `${saved.length} tarefa(s) importada(s) com sucesso!`)
            } catch (err) { logger.error('Erro ao importar tarefas:', err); showToast('error', 'Erro ao importar tarefas. Verifique o CSV.') }
          }}
        />
      case 'social':
        return <SocialSearchView onAddLead={async (nome, telefone, endereco) => {
          try {
            const saved = await db.insertCliente({
              razaoSocial: nome, cnpj: '', contatoNome: '', contatoTelefone: telefone, contatoEmail: '', endereco, etapa: 'prospecção', ultimaInteracao: new Date().toISOString().split('T')[0], diasInativo: 0, score: 20, vendedorId: loggedUser?.id
            } as Omit<Cliente, 'id'>)
            setClientes(prev => [...prev, saved])
          } catch (err) { logger.error('Erro ao add lead social:', err) }
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
              logger.error('Erro ao adicionar vendedor:', err)
              showToast('error', err?.message || 'Erro ao cadastrar vendedor')
              throw err // Re-throw para o VendedoresView exibir o erro
            }
          }}
          onUpdateVendedor={async (v) => {
            try {
              await db.updateVendedor(v.id, v)
              setVendedores(prev => prev.map(x => x.id === v.id ? v : x))
            } catch (err) { logger.error('Erro ao atualizar vendedor:', err) }
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
            } catch (err) { logger.error('Erro ao criar template:', err) }
          }}
          onDelete={async (id) => {
            try {
              await db.deleteTemplate(id)
              setTemplates(prev => prev.filter(t => t.id !== id))
            } catch (err) { logger.error('Erro ao deletar template:', err) }
          }}
        />
      case 'produtos':
        return <ProdutosView produtos={produtos}
          onAdd={async (p) => {
            try {
              const saved = await db.insertProduto(p)
              setProdutos(prev => [...prev, saved])
              showToast('success', `Produto "${p.nome}" cadastrado!`)
            } catch (err) { logger.error('Erro ao adicionar produto:', err); showToast('error', 'Erro ao salvar produto. Tente novamente.') }
          }}
          onUpdate={async (p) => {
            try {
              await db.updateProduto(p.id, p)
              setProdutos(prev => prev.map(x => x.id === p.id ? p : x))
            } catch (err) { logger.error('Erro ao atualizar produto:', err) }
          }}
          onDelete={async (id) => {
            try {
              await db.deleteProduto(id)
              setProdutos(prev => prev.filter(p => p.id !== id))
            } catch (err) { logger.error('Erro ao deletar produto:', err) }
          }}
          isGerente={loggedUser?.cargo === 'gerente'}
        />
      case 'pedidos':
        return <PedidosView pedidos={pedidos} clientes={clientes} produtos={produtos} vendedores={vendedores} loggedUser={loggedUser || { id: 0, nome: 'Sistema', email: '', cargo: 'vendedor', ativo: true, metaVendas: 0, metaLeads: 0, metaConversao: 0 } as Vendedor}
          onAddPedido={async (p) => {
            try {
              const saved = await db.insertPedido(p)
              setPedidos(prev => [...prev, saved])
              showToast('success', `Pedido ${p.numero} salvo com sucesso!`)
            } catch (err) { logger.error('Erro ao criar pedido:', err); showToast('error', 'Erro ao salvar pedido. Tente novamente.') }
          }}
          onUpdatePedido={async (p) => {
            try {
              await db.updatePedidoStatus(p.id, p.status)
              setPedidos(prev => prev.map(x => x.id === p.id ? p : x))
            } catch (err) { logger.error('Erro ao atualizar pedido:', err) }
          }}
        />
      default:
        return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} loggedUser={loggedUser} />
    }
  }

  const [loginLoading, setLoginLoading] = useState(false)
  const handleLogin = async () => {
    if (loginLoading) return
    setLoginError('')
    setLoginLoading(true)
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
    } finally {
      setLoginLoading(false)
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
                disabled={loginLoading}
                className="w-full py-3 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm font-semibold text-base disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loginLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Entrando...
                  </span>
                ) : 'Entrar'}
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
    <div className="h-screen flex bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} bg-white border-gray-200 border-r flex flex-col`}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <img src="/Logo_MFParis.jpg" alt="GMF Paris" className="h-10 w-10 rounded-full object-cover" />
            <h1 className="text-lg font-bold text-gray-900">Grupo MF Paris</h1>
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
        <div className="h-14 sm:h-16 bg-white border-gray-200 border-b flex items-center justify-between px-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-apple transition-colors"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            </button>
            <h2 className="text-base sm:text-lg font-semibold truncate text-gray-900">
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
                    <button onClick={() => markAllRead()} className="text-xs text-primary-600 hover:text-primary-800">Marcar todas como lidas</button>
                  </div>
                  {notificacoes.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Nenhuma notificação</div>
                  ) : (
                    notificacoes.map(n => (
                      <div key={n.id} className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!n.lida ? 'bg-blue-50' : ''}`} onClick={() => markRead(n.id)}>
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
                <div className="space-y-5">

                  {/* ── Empresa ── */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Empresa</p>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ</label>
                          <div className="flex gap-1">
                            <input type="text" name="cnpj" value={formData.cnpj} onChange={handleInputChange}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              placeholder="00.000.000/0000-00" />
                            <button type="button" onClick={() => buscarCnpj(formData.cnpj)}
                              disabled={isLoadingCnpj}
                              className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-xs font-medium disabled:opacity-50 whitespace-nowrap">
                              {isLoadingCnpj ? '⏳' : '🔍 Buscar'}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Razão Social *</label>
                        <input type="text" name="razaoSocial" value={formData.razaoSocial} onChange={handleInputChange} required
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Ex: Supermercado BH Ltda" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nome Fantasia</label>
                        <input type="text" name="nomeFantasia" value={formData.nomeFantasia} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Ex: Mercadão BH" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">CNAE Primário</label>
                        <input type="text" name="cnaePrimario" value={formData.cnaePrimario} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Ex: 4711-3/02 - Comércio varejista de mercadorias" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">CNAE Secundário</label>
                        <input type="text" name="cnaeSecundario" value={formData.cnaeSecundario} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Preenchido automaticamente pelo CNPJ" />
                      </div>
                    </div>
                  </div>

                  {/* ── Contato ── */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contato</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nome do Contato</label>
                        <input type="text" name="contatoNome" value={formData.contatoNome} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="João Silva" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Celular</label>
                          <input type="tel" name="contatoCelular" value={formData.contatoCelular} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="(00) 99999-0000" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Telefone Fixo</label>
                          <input type="tel" name="contatoTelefoneFixo" value={formData.contatoTelefoneFixo} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="(00) 3333-0000" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp / Telefone Principal</label>
                        <input type="tel" name="contatoTelefone" value={formData.contatoTelefone} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="(00) 99999-0000" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                        <input type="email" name="contatoEmail" value={formData.contatoEmail} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="email@empresa.com" />
                      </div>
                    </div>
                  </div>

                  {/* ── Endereço ── */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Endereço</p>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="w-36">
                          <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
                          <div className="flex gap-1">
                            <input type="text" name="enderecoCep" value={formData.enderecoCep} onChange={handleInputChange}
                              onBlur={() => buscarCep(formData.enderecoCep)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              placeholder="00000-000" maxLength={9} />
                            {isLoadingCep && <span className="text-xs text-gray-400 self-center">⏳</span>}
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Rua / Logradouro</label>
                          <input type="text" name="enderecoRua" value={formData.enderecoRua} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="Rua das Flores" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Número</label>
                          <input type="text" name="enderecoNumero" value={formData.enderecoNumero} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="100" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Complemento</label>
                          <input type="text" name="enderecoComplemento" value={formData.enderecoComplemento} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="Sala 2, Apto 301..." />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
                          <input type="text" name="enderecoBairro" value={formData.enderecoBairro} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="Centro" />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
                          <input type="text" name="enderecoCidade" value={formData.enderecoCidade} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="Belo Horizonte" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                          <input type="text" name="enderecoEstado" value={formData.enderecoEstado} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="MG" maxLength={2} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Produtos de Interesse ── */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Produtos de Interesse</p>
                    <div className="border border-gray-300 rounded-apple overflow-hidden">
                      {produtos.filter(p => p.ativo).length === 0 && (
                        <p className="text-xs text-gray-400 p-3">Nenhum produto cadastrado</p>
                      )}
                      {produtos.filter(p => p.ativo).map(p => {
                        const selected = formData.produtosInteresse.split(',').map(s => s.trim()).filter(Boolean)
                        const isChecked = selected.includes(p.nome)
                        const qty = formData.produtosQuantidades?.[p.nome] || 1
                        return (
                          <div key={p.id} className={`px-3 py-2 border-b border-gray-100 last:border-b-0 ${isChecked ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                            <div className="flex items-center gap-2">
                              <input type="checkbox" checked={isChecked}
                                onChange={() => {
                                  const updated = isChecked
                                    ? selected.filter(s => s !== p.nome)
                                    : [...selected, p.nome]
                                  setFormData(prev => ({ ...prev, produtosInteresse: updated.join(', ') }))
                                }}
                                className="w-4 h-4 text-primary-600 rounded flex-shrink-0" />
                              <span className="text-sm text-gray-800 flex-1">{p.nome}</span>
                              <span className="text-xs text-gray-400">R$ {p.preco.toFixed(2).replace('.', ',')}/{p.unidade}</span>
                            </div>
                            {isChecked && (
                              <div className="flex items-center gap-2 mt-2 ml-6">
                                <label className="text-xs text-gray-500">Qtd:</label>
                                <div className="flex items-center border border-gray-300 rounded-apple overflow-hidden">
                                  <button type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, produtosQuantidades: { ...prev.produtosQuantidades, [p.nome]: Math.max(1, (prev.produtosQuantidades?.[p.nome] || 1) - 1) } }))}
                                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold">−</button>
                                  <input type="number" min={1} value={qty}
                                    onChange={(e) => setFormData(prev => ({ ...prev, produtosQuantidades: { ...prev.produtosQuantidades, [p.nome]: Math.max(1, parseInt(e.target.value) || 1) } }))}
                                    className="w-12 text-center text-sm py-0.5 border-x border-gray-300 focus:outline-none" />
                                  <button type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, produtosQuantidades: { ...prev.produtosQuantidades, [p.nome]: (prev.produtosQuantidades?.[p.nome] || 1) + 1 } }))}
                                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold">+</button>
                                </div>
                                <span className="text-xs text-primary-600 font-medium">
                                  = R$ {(p.preco * qty).toFixed(2).replace('.', ',')}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Vendedor ── */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor Responsável</label>
                    <select name="vendedorId" value={formData.vendedorId || ''} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
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
                    disabled={isSaving}
                    className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar Cliente'}
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
      {selectedClientePanel && (
        <ClientePanel
          cliente={clientes.find(x => x.id === selectedClientePanel.id) || selectedClientePanel}
          interacoes={interacoes}
          tarefas={tarefas}
          vendedores={vendedores}
          loggedUser={loggedUser}
          onClose={() => setSelectedClientePanel(null)}
          onEditCliente={handleEditCliente}
          onMoverCliente={moverCliente}
          onTriggerAmostra={(c) => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: 'prospecção' }); setPendingDrop({ e: fakeE, toStage: 'amostra' }); setModalAmostraData(new Date().toISOString().split('T')[0]); setShowModalAmostra(true) }}
          onTriggerNegociacao={(c) => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: 'homologado' }); setPendingDrop({ e: fakeE, toStage: 'negociacao' }); setModalPropostaValor(c.valorEstimado?.toString() || ''); setShowModalProposta(true) }}
          onTriggerPerda={(c) => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: c.etapa }); setPendingDrop({ e: fakeE, toStage: 'perdido' }); setShowMotivoPerda(true) }}
          setInteracoes={setInteracoes}
          setClientes={setClientes}
          setTarefas={setTarefas}
          addNotificacao={addNotificacao}
        />
      )}

      {/* Toast transição inválida */}
      {transicaoInvalida && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-5 py-3 rounded-apple shadow-apple-lg max-w-md animate-pulse">
          <p className="text-sm font-medium">⛔ {transicaoInvalida}</p>
        </div>
      )}

      {/* Modal Motivo de Perda */}
      {showMotivoPerda && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowMotivoPerda(false); setDraggedItem(null); setPendingDrop(null); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro') }}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">❌ Marcar como Perdido</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                { key: 'preco', label: '💲 Preço', active: 'border-yellow-500 bg-yellow-50 text-yellow-800' },
                { key: 'prazo', label: '⏰ Prazo', active: 'border-orange-500 bg-orange-50 text-orange-800' },
                { key: 'qualidade', label: '⭐ Qualidade', active: 'border-blue-500 bg-blue-50 text-blue-800' },
                { key: 'concorrencia', label: '🏁 Concorrência', active: 'border-red-500 bg-red-50 text-red-800' },
                { key: 'sem_resposta', label: '📵 Sem resposta', active: 'border-gray-500 bg-gray-50 text-gray-800' },
                { key: 'outro', label: '📝 Outro', active: 'border-purple-500 bg-purple-50 text-purple-800' },
              ] as { key: NonNullable<Cliente['categoriaPerda']>; label: string; active: string }[]).map(cat => (
                <button key={cat.key} onClick={() => setCategoriaPerdaSel(cat.key)}
                  className={`px-2 py-2 text-xs font-medium rounded-apple border-2 transition-all ${categoriaPerdaSel === cat.key ? cat.active : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowModalAmostra(false); setDraggedItem(null); setPendingDrop(null) }}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowModalProposta(false); setDraggedItem(null); setPendingDrop(null); setModalPropostaValor('') }}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
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
