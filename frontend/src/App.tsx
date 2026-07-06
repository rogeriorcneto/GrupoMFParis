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
import { useVersionCheck } from './hooks/useVersionCheck'
import ClientePanel from './components/ClientePanel'
import { useAutoRules } from './hooks/useAutoRules'
import { useDarkMode } from './hooks/useDarkMode'
import { useClienteForm } from './hooks/useClienteForm'
import { useFunilActions } from './hooks/useFunilActions'
import { logger } from './utils/logger'
import { disconnectUserWhatsApp } from './lib/botApi'
import LoginScreen from './components/LoginScreen'
import Sidebar, { viewsPermitidas } from './components/Sidebar'
import TopBar from './components/TopBar'
import Toast from './components/Toast'
import ClienteFormModal from './components/ClienteFormModal'
import AIModal from './components/AIModal'
import FunilModals from './components/FunilModals'
import AppRouter, { PersistentViews } from './components/AppRouter'
import GlobalSearch from './components/GlobalSearch'
import ChatInterno from './components/ChatInterno'

// ── Active-time tracker ─────────────────────────────────────────────────────
// Stores accumulated active seconds in localStorage.
// crm_active_secs_<id>  = total seconds accumulated so far (string number)
// crm_segment_start_<id> = ISO timestamp when current visible segment started

let _activeTimerId: number | null = null
let _activeVendedorId: number | null = null

function _flushSegment(id: number) {
  const segKey = `crm_segment_start_${id}`
  const secsKey = `crm_active_secs_${id}`
  const segStart = localStorage.getItem(segKey)
  if (segStart) {
    const elapsed = Math.floor((Date.now() - new Date(segStart).getTime()) / 1000)
    const prev = parseInt(localStorage.getItem(secsKey) || '0', 10)
    localStorage.setItem(secsKey, String(prev + elapsed))
    localStorage.removeItem(segKey)
  }
}

function _startSegment(id: number) {
  localStorage.setItem(`crm_segment_start_${id}`, new Date().toISOString())
}

function startActiveTimer(vendedorId: number) {
  if (_activeTimerId !== null) stopActiveTimer()
  _activeVendedorId = vendedorId

  // Reset daily if needed (clear if last reset was a different calendar day)
  const dayKey = `crm_active_day_${vendedorId}`
  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(dayKey) !== today) {
    localStorage.removeItem(`crm_active_secs_${vendedorId}`)
    localStorage.removeItem(`crm_segment_start_${vendedorId}`)
    localStorage.setItem(dayKey, today)
  }

  // Start first segment if page is currently visible
  if (!document.hidden) _startSegment(vendedorId)

  const onVisibility = () => {
    if (!_activeVendedorId) return
    if (document.hidden) _flushSegment(_activeVendedorId)
    else _startSegment(_activeVendedorId)
  }
  document.addEventListener('visibilitychange', onVisibility)

  // Flush every 10s as a safety net (e.g. before browser kills the page)
  _activeTimerId = window.setInterval(() => {
    if (_activeVendedorId && !document.hidden) {
      _flushSegment(_activeVendedorId)
      _startSegment(_activeVendedorId)
    }
  }, 10_000)

  // Store cleanup so stopActiveTimer can remove the listener
  ;(startActiveTimer as any)._cleanup = () => {
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

function stopActiveTimer() {
  if (_activeVendedorId) _flushSegment(_activeVendedorId)
  if (_activeTimerId !== null) { clearInterval(_activeTimerId); _activeTimerId = null }
  if (typeof (startActiveTimer as any)._cleanup === 'function') {
    ;(startActiveTimer as any)._cleanup()
    ;(startActiveTimer as any)._cleanup = null
  }
  _activeVendedorId = null
}
// ────────────────────────────────────────────────────────────────────────────

function App({ preloadedUser }: { preloadedUser?: Vendedor | null } = {}) {
  // preloadedUser === undefined: não fornecido, verificar sessão normalmente
  // preloadedUser === Vendedor: sessão já verificada pelo Shell, pular checkSession
  // preloadedUser === null: Shell tentou mas não achou, verificar sessão normalmente
  const hasPreloaded = preloadedUser != null && preloadedUser !== undefined
  const { newVersionAvailable, reloadApp } = useVersionCheck()
  const { dark, toggleDark } = useDarkMode()
  const [loggedUser, setLoggedUser] = useState<Vendedor | null>(hasPreloaded ? preloadedUser! : null)
  const [loginUsuario, setLoginUsuario] = useState('')
  const [loginSenha, setLoginSenha] = useState('')
  const [loginError, setLoginError] = useState('')
  const [authChecked, setAuthChecked] = useState(hasPreloaded)
  const [isLoading, setIsLoading] = useState(!hasPreloaded)
  const [toastMsg, setToastMsg] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null)

  const showToast = (tipo: 'success' | 'error', texto: string) => {
    setToastMsg({ tipo, texto })
    setTimeout(() => setToastMsg(null), 4000)
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0)
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
  // Não bloqueia UI: cada fetch atualiza seu próprio estado conforme chega.
  const loadAllData = useCallback(async () => {
    setIsLoading(false) // garante que a tela esteja liberada
    // Disparar em paralelo, sem await sequencial — cada um atualiza sua slice ao retornar
    db.fetchClientes().then(setClientes).catch(err => logger.error('clientes:', err))
    db.fetchInteracoes().then(setInteracoes).catch(err => logger.error('interacoes:', err))
    db.fetchTarefas().then(setTarefas).catch(err => logger.error('tarefas:', err))
    db.fetchProdutos().then(setProdutos).catch(err => logger.error('produtos:', err))
    db.fetchPedidos().then(setPedidos).catch(err => logger.error('pedidos:', err))
    db.fetchVendedores().then(setVendedores).catch(err => logger.error('vendedores:', err))
    db.fetchNotificacoes().then(setDbNotificacoes).catch(err => logger.error('notificacoes:', err))
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
  // Se preloadedUser é um Vendedor real, sessão já está verificada — pular checkSession
  useEffect(() => {
    if (hasPreloaded) {
      // Sessão já verificada pelo Shell — carregar dados diretamente
      loadAllData().catch(err => logger.error('Erro loadAllData:', err))
      startActiveTimer(preloadedUser!.id)
      return
    }

    // Timeout de segurança: se em 8s não terminou, libera a tela mesmo assim
    const safetyTimeout = setTimeout(() => {
      setAuthChecked(true)
      setIsLoading(false)
    }, 8000)

    const checkSession = async () => {
      try {
        const vendedor = await db.getLoggedVendedor()
        if (vendedor) {
          setLoggedUser(vendedor)
          setAuthChecked(true)
          setIsLoading(false)
          clearTimeout(safetyTimeout)
          loadAllData().catch(err => logger.error('Erro loadAllData:', err))
          startActiveTimer(vendedor.id)
        }
      } catch {
        // Sem sessão ativa, mostra login
      } finally {
        setAuthChecked(true)
        setIsLoading(false)
        clearTimeout(safetyTimeout)
      }
    }
    checkSession()

    // Desconectar WhatsApp ao fechar/recarregar a página
    const handleBeforeUnload = () => {
      const token = sessionStorage.getItem('wa_auth_token')
      if (token) {
        const url = `${(import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'}/api/whatsapp/user/disconnect`
        // fetch com keepalive envia mesmo ao fechar a aba (suporta headers)
        fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{}',
          keepalive: true,
        }).catch(() => {})
        sessionStorage.removeItem('wa_auth_token')
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Se é um novo carregamento de página (sem flag de sessão), desconectar sessão WA anterior
    if (!sessionStorage.getItem('wa_page_alive')) {
      sessionStorage.setItem('wa_page_alive', '1')
      // Desconectar sessão antiga (se existir) ao abrir nova aba/página
      disconnectUserWhatsApp().catch(() => {})
    }

    // Escutar mudanças de auth (login/logout/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // Retry getSession once — Supabase can fire SIGNED_OUT on transient
        // token refresh failures (network blip) even when the session is still valid
        try {
          await new Promise(r => setTimeout(r, 500))
          const { data: { session: retrySession } } = await supabase.auth.getSession()
          if (retrySession?.user) {
            // Session still valid — this was a transient refresh failure, ignore
            return
          }
        } catch { /* session truly invalid, proceed with logout */ }

        // Desconectar WhatsApp ao fazer logout
        try { await disconnectUserWhatsApp() } catch { /* ignore */ }
        sessionStorage.removeItem('wa_auth_token')
        sessionStorage.removeItem('wa_page_alive')
        // Clear session timer on logout
        stopActiveTimer()
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith('crm_active_'))
        allKeys.forEach(k => localStorage.removeItem(k))
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

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
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
      setTarefas(prev => {
        if (prev.some(t => t.id === newT.id)) return prev
        const withoutTemp = prev.filter(t => {
          const tempId = t.id > 1_000_000_000_000
          const sameTask = t.clienteId === newT.clienteId
            && t.titulo === newT.titulo
            && (t.descricao || '') === (newT.descricao || '')
            && t.data === newT.data
            && t.status === newT.status
          return !(tempId && sameTask)
        })
        return [newT, ...withoutTemp]
      })
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
  useAutoRules({ clientes, setClientes, interacoes, vendedores, loggedUser, pedidos, setAtividades, addNotificacao })

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

  const [isNovoCiclo, setIsNovoCiclo] = React.useState(false)

  const handleNovoCiclo = React.useCallback((cliente: Cliente) => {
    const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any
    setDraggedItem({ cliente, fromStage: 'follow_up' })
    setPendingDrop({ e: fakeE, toStage: 'negociacao' })
    setModalPropostaValor('')
    setIsNovoCiclo(true)
    setShowModalProposta(true)
  }, [setDraggedItem, setPendingDrop, setModalPropostaValor, setShowModalProposta])

  // Dashboard Metrics Calculation (memoized)
  const dashboardMetrics = useMemo((): DashboardMetrics => {
    const totalLeads = clientes.length
    const leadsAtivos = clientes.filter(c => (c.diasInativo || 0) <= 15).length
    const hoje = new Date().toISOString().split('T')[0]
    const leadsNovosHoje = clientes.filter(c => c.dataEntradaEtapa?.startsWith(hoje)).length
    const interacoesHoje = interacoes.filter(c => c.data.startsWith(hoje)).length
    const valorTotal = clientes.reduce((sum, c) => sum + (c.valorEstimado || 0), 0)
    const ticketMedio = totalLeads > 0 ? valorTotal / totalLeads : 0
    const taxaConversao = totalLeads > 0 ? (clientes.filter(c => c.etapa === 'follow_up').length / totalLeads) * 100 : 0

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
        startActiveTimer(vendedor.id)
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
    <div className="h-screen flex bg-gray-50 dark:bg-gray-950">
      {/* Sidebar backdrop (todas as telas) */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <Sidebar
        activeView={activeView} setActiveView={setActiveView}
        loggedUser={loggedUser} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        onOpenAI={() => setShowAIModal(true)}
        onSignOut={async () => {
          try { await disconnectUserWhatsApp() } catch { /* ignore */ }
          sessionStorage.removeItem('wa_auth_token')
          sessionStorage.removeItem('wa_page_alive')
          await db.signOut()
          setLoggedUser(null)
        }}
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
          dark={dark} onToggleDark={toggleDark}
        />

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-3 sm:p-6 pb-0 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-gray-500">Carregando dados...</p>
              </div>
            </div>
          ) : (
            <>
              <AppRouter
                activeView={activeView} loggedUser={loggedUser}
                clientes={clientes} interacoes={interacoes} vendedores={vendedores}
                tarefas={tarefas} atividades={atividades} templates={templates}
                templatesMsgs={templatesMsgs} cadencias={cadencias} campanhas={campanhas}
                jobs={jobs} produtos={produtos} pedidos={pedidos} dashboardMetrics={dashboardMetrics}
                setClientes={setClientes} setInteracoes={setInteracoes} setVendedores={setVendedores}
                setTarefas={setTarefas} setTemplates={setTemplates} setTemplatesMsgs={setTemplatesMsgs}
                setCampanhas={setCampanhas} setProdutos={setProdutos} setPedidos={setPedidos}
                showToast={showToast} openModal={openModal}
                openModalComDados={(dados) => {
                  setFormData(prev => ({
                    ...prev,
                    razaoSocial: dados.razaoSocial ?? '',
                    cnpj: dados.cnpj ?? '',
                    enderecoCidade: dados.enderecoCidade ?? '',
                    enderecoEstado: dados.enderecoEstado ?? '',
                  }))
                  openModal()
                }}
                handleEditCliente={handleEditCliente}
                handleDragStart={handleDragStart} handleDragOver={handleDragOver} handleDrop={handleDrop}
                handleQuickAction={handleQuickAction} setSelectedClientePanel={setSelectedClientePanel}
                moverCliente={moverCliente}
                startCampanha={startCampanha} runJobNow={runJobNow} addNotificacao={addNotificacao}
                onNovoCiclo={handleNovoCiclo}
                onVerNoFunil={(c) => { setActiveView('funil'); setSelectedClientePanel(c) }}
              />
              <PersistentViews
                activeView={activeView}
                pedidos={pedidos}
                clientes={clientes}
                vendedores={vendedores}
                loggedUser={loggedUser}
              />
            </>
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
          clientes={clientes} pedidos={pedidos}
          loggedUser={loggedUser}
          onClickNegocio={(c) => { setShowModal(false); setSelectedClientePanel(c) }}
          onInativarCliente={async (clienteId, motivo) => {
            await moverCliente(clienteId, 'inativo', {
              motivoInativacao: motivo,
              dataInativacao: new Date().toISOString(),
              inativadoPor: loggedUser?.id,
              inativadoPorAbandono: false,
              statusCliente: 'inativo',
            })
            showToast('success', 'Cliente inativado com sucesso!')
          }}
          onReativarCliente={async (clienteId) => {
            const c = clientes.find(x => x.id === clienteId)
            const etapaAnterior = c?.etapaAnterior || 'prospecção'
            await moverCliente(clienteId, etapaAnterior, {
              motivoInativacao: undefined,
              dataInativacao: undefined,
              inativadoPor: undefined,
              inativadoPorAbandono: undefined,
              statusCliente: 'ativo',
            })
            showToast('success', 'Cliente reativado com sucesso!')
          }}
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
            onTriggerNegociacao={(c) => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: 'proposta' }); setPendingDrop({ e: fakeE, toStage: 'negociacao' }); setModalPropostaValor(c.valorEstimado?.toString() || ''); setShowModalProposta(true) }}
            onTriggerPerda={(c) => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: c.etapa }); setPendingDrop({ e: fakeE, toStage: 'perdido' }); setShowMotivoPerda(true) }}
            setInteracoes={setInteracoes}
            setClientes={setClientes}
            setTarefas={setTarefas}
            addNotificacao={addNotificacao}
            produtos={produtos}
            pedidos={pedidos}
            onAddPedido={async (p) => {
              const saved = await db.insertPedido(p)
              setPedidos(prev => [...prev, saved])
            }}
            onSolicitarCancelamentoPedido={async (pedidoId, motivo) => {
              await db.solicitarCancelamentoPedido(pedidoId, motivo)
              setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, status: 'cancelamento_solicitado', motivoRecusa: motivo } : p))
            }}
            onVerTarefas={() => {
              setActiveView('tarefas')
              setSelectedClientePanel(null)
            }}
            onVerNoFunil={(cli) => {
              setActiveView('funil')
              setSelectedClientePanel(cli)
            }}
            onExcluirCliente={async (cli) => {
              try {
                await db.deleteCliente(cli.id)
                setClientes(prev => prev.filter(x => x.id !== cli.id))
                setInteracoes(prev => prev.filter(i => i.clienteId !== cli.id))
                setTarefas(prev => prev.filter(t => t.clienteId !== cli.id))
                showToast('success', 'Empresa excluída.')
              } catch (err) {
                logger.error('Erro ao excluir cliente:', err)
                showToast('error', 'Erro ao excluir empresa.')
              }
            }}
            onReativarCliente={async (cli) => {
              const etapaAnterior = cli.etapaAnterior || 'prospecção'
              await moverCliente(cli.id, etapaAnterior, {
                motivoInativacao: undefined,
                dataInativacao: undefined,
                inativadoPor: undefined,
                inativadoPorAbandono: undefined,
                statusCliente: 'ativo',
              })
              showToast('success', 'Cliente reativado com sucesso!')
            }}
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
          produtos={produtos}
          clientes={clientes}
          onAddPedido={async (p) => {
            const saved = await db.insertPedido(p)
            setPedidos(prev => [...prev, saved])
          }}
          showToast={showToast}
          isNovoCiclo={isNovoCiclo}
          onCloseNovoCiclo={() => { setIsNovoCiclo(false); setDraggedItem(null); setPendingDrop(null) }}
          onClickCliente={handleEditCliente}
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

        {/* Chat Interno — Painel flutuante */}
        {showChat && loggedUser && (
          <ChatInterno
            loggedUser={loggedUser}
            vendedores={vendedores}
            onClose={() => setShowChat(false)}
            onUnreadChange={setChatUnreadTotal}
          />
        )}

        {/* Chat Interno — Botão flutuante */}
        {loggedUser && (
          <button
            onClick={() => setShowChat(v => !v)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            title="Chat interno da equipe"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
            {chatUnreadTotal > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm">
                {chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}
              </span>
            )}
          </button>
        )}

        {/* Toast global de feedback */}
        <Toast toastMsg={toastMsg} />

        {/* Banner de nova versão disponível */}
        {newVersionAvailable && (
          <div className="fixed bottom-4 right-4 z-50 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-apple shadow-2xl max-w-md animate-slide-in-right">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-2xl">🎉</div>
              <div className="flex-1">
                <p className="font-semibold text-sm mb-1">Nova versão disponível!</p>
                <p className="text-xs text-white/90 mb-3">Uma atualização do CRM está pronta. Recarregue a página para obter as últimas melhorias.</p>
                <button
                  onClick={reloadApp}
                  className="w-full px-4 py-2 bg-white text-blue-600 rounded-apple text-sm font-semibold hover:bg-blue-50 transition-colors"
                >
                  🔄 Recarregar Agora
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}

// All view components are imported from ./components/views/

export default App
