import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  ViewType, Cliente, Interacao,
  Notificacao, Atividade, Template, Produto, DashboardMetrics,
  TemplateMsg, Cadencia, Campanha, JobAutomacao, Tarefa,
  Vendedor, Pedido
} from './types'
import { supabase } from './lib/supabase'
import * as db from './lib/database'
import { useNotificacoes } from './hooks/useNotificacoes'
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription'
import ClientePanel from './components/ClientePanel'
import { useAutoRules } from './hooks/useAutoRules'
import { useClienteForm } from './hooks/useClienteForm'
import { useFunilActions } from './hooks/useFunilActions'
import { logger } from './utils/logger'
import LoginScreen from './components/LoginScreen'
import Sidebar, { viewsPermitidas } from './components/Sidebar'
import TopBar from './components/TopBar'
import Toast from './components/Toast'
import ClienteFormModal from './components/ClienteFormModal'
import AIModal from './components/AIModal'
import FunilModals from './components/FunilModals'
import AppRouter from './components/AppRouter'
import GlobalSearch from './components/GlobalSearch'

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
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [dbNotificacoes, setDbNotificacoes] = useState<Notificacao[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowGlobalSearch(v => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const [activeView, setActiveView] = useState<ViewType>('dashboard')
  const [showAIModal, setShowAIModal] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [templatesMsgs, setTemplatesMsgs] = useState<TemplateMsg[]>([])
  const [cadencias, setCadencias] = useState<Cadencia[]>([])
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [jobs, setJobs] = useState<JobAutomacao[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])

  // Carregar dados essenciais do Supabase após autenticação (core)
  const loadAllData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [
        clientesData, interacoesData, tarefasData, produtosData,
        pedidosData, vendedoresData, notificacoesData
      ] = await Promise.all([
        db.fetchClientes(),
        db.fetchInteracoes(),
        db.fetchTarefas(),
        db.fetchProdutos(),
        db.fetchPedidos(),
        db.fetchVendedores(),
        db.fetchNotificacoes(),
      ])
      setClientes(clientesData)
      setInteracoes(interacoesData)
      setTarefas(tarefasData)
      setProdutos(produtosData)
      setPedidos(pedidosData)
      setVendedores(vendedoresData)
      setDbNotificacoes(notificacoesData)
    } catch (err) {
      logger.error('Erro ao carregar dados:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Lazy load de datasets secundários (carregados quando a view é acessada)
  const secondaryLoaded = useRef<Set<string>>(new Set())
  const loadSecondaryForView = useCallback(async (view: ViewType) => {
    const needs: Record<string, ViewType[]> = {
      atividades: ['dashboard'],
      templates: ['templates'],
      templatesMsgs: ['prospeccao'],
      cadencias: ['prospeccao'],
      campanhas: ['prospeccao'],
      jobs: ['prospeccao'],
    }
    const toLoad: Promise<void>[] = []
    for (const [key, views] of Object.entries(needs)) {
      if (views.includes(view) && !secondaryLoaded.current.has(key)) {
        secondaryLoaded.current.add(key)
        if (key === 'atividades') toLoad.push(db.fetchAtividades().then(d => setAtividades(d)))
        if (key === 'templates') toLoad.push(db.fetchTemplates().then(d => setTemplates(d)))
        if (key === 'templatesMsgs') toLoad.push(db.fetchTemplateMsgs().then(d => setTemplatesMsgs(d)))
        if (key === 'cadencias') toLoad.push(db.fetchCadencias().then(d => setCadencias(d)))
        if (key === 'campanhas') toLoad.push(db.fetchCampanhas().then(d => setCampanhas(d)))
        if (key === 'jobs') toLoad.push(db.fetchJobs().then(d => setJobs(d)))
      }
    }
    if (toLoad.length > 0) {
      try { await Promise.all(toLoad) } catch (err) { logger.error('Erro lazy-load:', err) }
    }
  }, [])

  // Lazy-load dados secundários quando a view muda
  useEffect(() => {
    if (loggedUser && activeView) loadSecondaryForView(activeView)
  }, [activeView, loggedUser, loadSecondaryForView])

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
        secondaryLoaded.current.clear()
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

  useRealtimeSubscription<any>('pedidos', useCallback((payload) => {
    if (payload.eventType === 'INSERT') {
      const newP = db.pedidoFromDb(payload.new)
      setPedidos(prev => prev.some(p => p.id === newP.id) ? prev : [...prev, newP])
      if (newP.status === 'enviado' && loggedUser?.cargo === 'gerente') {
        addNotificacao('warning', '📦 Novo pedido aguardando aprovação', `Pedido #${newP.numero} foi enviado para aprovação`, newP.clienteId ?? undefined)
      }
    } else if (payload.eventType === 'UPDATE') {
      const updP = db.pedidoFromDb(payload.new)
      setPedidos(prev => prev.map(p => p.id === updP.id ? updP : p))
      if (updP.status === 'confirmado' && loggedUser?.cargo !== 'gerente') {
        addNotificacao('success', '✅ Pedido aprovado!', `Pedido #${updP.numero} foi aprovado pelo gerente`)
      }
    } else if (payload.eventType === 'DELETE') {
      setPedidos(prev => prev.filter(p => p.id !== payload.old.id))
    }
  }, [loggedUser, addNotificacao]), isLoggedIn)

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

  // Tela de loading ou login
  if (!authChecked || !loggedUser) {
    return (
      <LoginScreen
        authChecked={authChecked}
        loginUsuario={loginUsuario} setLoginUsuario={setLoginUsuario}
        loginSenha={loginSenha} setLoginSenha={setLoginSenha}
        loginError={loginError} loginLoading={loginLoading}
        handleLogin={handleLogin}
      />
    )
  }

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <Sidebar
        activeView={activeView} setActiveView={setActiveView}
        loggedUser={loggedUser} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        onOpenAI={() => setShowAIModal(true)}
        onSignOut={async () => { await db.signOut(); setLoggedUser(null) }}
        pendingAprovacoes={loggedUser.cargo === 'gerente' ? pedidos.filter(p => p.status === 'enviado').length : 0}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <TopBar
          activeView={activeView} setSidebarOpen={setSidebarOpen}
          notificacoes={notificacoes} showNotifications={showNotifications}
          setShowNotifications={setShowNotifications} markAllRead={markAllRead} markRead={markRead}
          onOpenSearch={() => setShowGlobalSearch(true)}
        />

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-3 sm:p-6 pb-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-gray-500">Carregando dados...</p>
              </div>
            </div>
          ) : (
            <AppRouter
              activeView={activeView} loggedUser={loggedUser}
              clientes={clientes} interacoes={interacoes} vendedores={vendedores}
              tarefas={tarefas} atividades={atividades} templates={templates}
              templatesMsgs={templatesMsgs} cadencias={cadencias} campanhas={campanhas}
              jobs={jobs} produtos={produtos} pedidos={pedidos} dashboardMetrics={dashboardMetrics}
              setClientes={setClientes} setInteracoes={setInteracoes} setVendedores={setVendedores}
              setTarefas={setTarefas} setTemplates={setTemplates} setTemplatesMsgs={setTemplatesMsgs}
              setCampanhas={setCampanhas} setProdutos={setProdutos} setPedidos={setPedidos}
              showToast={showToast} openModal={openModal} handleEditCliente={handleEditCliente}
              handleDragStart={handleDragStart} handleDragOver={handleDragOver} handleDrop={handleDrop}
              handleQuickAction={handleQuickAction} setSelectedClientePanel={setSelectedClientePanel}
              moverCliente={moverCliente}
              startCampanha={startCampanha} runJobNow={runJobNow} addNotificacao={addNotificacao}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-2 flex items-center justify-center">
          <p className="text-[11px] text-gray-400 text-center">
            Desenvolvido por{' '}
            <span className="font-semibold text-gray-600">Rogério Cassiano</span>
            {' '}·{' '}
            <span className="text-gray-500">Software Engineer — Especialista em Inteligência Artificial</span>
          </p>
        </div>
      </div>

      {/* Modal Novo Cliente */}
      <ClienteFormModal
        showModal={showModal} setShowModal={setShowModal}
        editingCliente={editingCliente} formData={formData} setFormData={setFormData}
        handleInputChange={handleInputChange} handleSubmit={handleSubmit}
        isSaving={isSaving} isLoadingCep={isLoadingCep} isLoadingCnpj={isLoadingCnpj}
        buscarCep={buscarCep} buscarCnpj={buscarCnpj}
        produtos={produtos} vendedores={vendedores}
      />

      {/* Modal Assistente IA */}
      <AIModal show={showAIModal} onClose={() => setShowAIModal(false)} clientes={clientes} pedidos={pedidos} vendedores={vendedores} interacoes={interacoes} />

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

      {/* Modais do Funil (Perda, Amostra, Proposta) */}
      <FunilModals
        showMotivoPerda={showMotivoPerda} setShowMotivoPerda={setShowMotivoPerda}
        motivoPerdaTexto={motivoPerdaTexto} setMotivoPerdaTexto={setMotivoPerdaTexto}
        categoriaPerdaSel={categoriaPerdaSel} setCategoriaPerdaSel={setCategoriaPerdaSel}
        confirmPerda={confirmPerda}
        showModalAmostra={showModalAmostra} setShowModalAmostra={setShowModalAmostra}
        modalAmostraData={modalAmostraData} setModalAmostraData={setModalAmostraData}
        confirmAmostra={confirmAmostra}
        showModalProposta={showModalProposta} setShowModalProposta={setShowModalProposta}
        modalPropostaValor={modalPropostaValor} setModalPropostaValor={setModalPropostaValor}
        confirmProposta={confirmProposta}
        draggedItem={draggedItem} setDraggedItem={setDraggedItem} setPendingDrop={setPendingDrop}
        loggedUser={loggedUser}
      />

      {/* Busca Global */}
      <GlobalSearch
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        clientes={clientes}
        tarefas={tarefas}
        pedidos={pedidos}
        onSelectCliente={(c) => { setSelectedClientePanel(c); setShowGlobalSearch(false) }}
        onNavigate={(view) => { setActiveView(view); setShowGlobalSearch(false) }}
      />

      {/* Toast global de feedback */}
      <Toast toastMsg={toastMsg} />
    </div>
  )
}

// All view components are imported from ./components/views/

export default App
