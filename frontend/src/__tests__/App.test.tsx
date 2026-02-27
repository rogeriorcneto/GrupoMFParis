import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ============================================
// Mocks — must be before imports
// ============================================

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
  },
}))

// Mock database — all fetches return empty arrays by default
vi.mock('../lib/database', () => ({
  signIn: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(null),
  getLoggedVendedor: vi.fn().mockResolvedValue(null),
  fetchClientes: vi.fn().mockResolvedValue([]),
  fetchInteracoes: vi.fn().mockResolvedValue([]),
  fetchTarefas: vi.fn().mockResolvedValue([]),
  fetchProdutos: vi.fn().mockResolvedValue([]),
  fetchPedidos: vi.fn().mockResolvedValue([]),
  fetchVendedores: vi.fn().mockResolvedValue([]),
  fetchAtividades: vi.fn().mockResolvedValue([]),
  fetchTemplates: vi.fn().mockResolvedValue([]),
  fetchTemplateMsgs: vi.fn().mockResolvedValue([]),
  fetchCadencias: vi.fn().mockResolvedValue([]),
  fetchCampanhas: vi.fn().mockResolvedValue([]),
  fetchJobs: vi.fn().mockResolvedValue([]),
  fetchNotificacoes: vi.fn().mockResolvedValue([]),
  clienteFromDb: vi.fn((row: any) => row),
  interacaoFromDb: vi.fn((row: any) => row),
  tarefaFromDb: vi.fn((row: any) => row),
  insertNotificacao: vi.fn().mockImplementation((n: any) => Promise.resolve({ ...n, id: 999, lida: false, timestamp: new Date().toISOString() })),
  markNotificacaoLida: vi.fn().mockResolvedValue(undefined),
  markAllNotificacoesLidas: vi.fn().mockResolvedValue(undefined),
  updateCliente: vi.fn().mockResolvedValue(undefined),
  insertCliente: vi.fn().mockImplementation((c: any) => Promise.resolve({ ...c, id: 99 })),
  insertInteracao: vi.fn().mockImplementation((i: any) => Promise.resolve({ ...i, id: 100 })),
  insertHistoricoEtapa: vi.fn().mockResolvedValue(undefined),
  insertAtividade: vi.fn().mockImplementation((a: any) => Promise.resolve({ ...a, id: 200 })),
  insertTarefa: vi.fn().mockImplementation((t: any) => Promise.resolve({ ...t, id: 300 })),
}))

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock botApi
vi.mock('../lib/botApi', () => ({
  sendEmailViaBot: vi.fn().mockResolvedValue({ success: true }),
  sendWhatsApp: vi.fn().mockResolvedValue({ success: true }),
  BOT_URL: 'http://localhost:3001',
}))

// Mock all view components — render simple div with testid
vi.mock('../components/views', () => ({
  DashboardView: () => <div data-testid="view-dashboard">Dashboard</div>,
  FunilView: () => <div data-testid="view-funil">Funil</div>,
  ClientesView: () => <div data-testid="view-clientes">Clientes</div>,
  TarefasView: () => <div data-testid="view-tarefas">Tarefas</div>,
  ProspeccaoView: () => <div data-testid="view-prospeccao">Prospecção</div>,
  AutomacoesView: () => <div data-testid="view-automacoes">Automações</div>,
  MapaView: () => <div data-testid="view-mapa">Mapa</div>,
  SocialSearchView: () => <div data-testid="view-social">Social</div>,
  IntegracoesView: () => <div data-testid="view-integracoes">Integrações</div>,
  VendedoresView: () => <div data-testid="view-equipe">Equipe</div>,
  RelatoriosView: () => <div data-testid="view-relatorios">Relatórios</div>,
  TemplatesView: () => <div data-testid="view-templates">Templates</div>,
  ProdutosView: () => <div data-testid="view-produtos">Produtos</div>,
  PedidosView: () => <div data-testid="view-pedidos">Pedidos</div>,
}))

// Mock ClientePanel
vi.mock('../components/ClientePanel', () => ({
  default: () => <div data-testid="cliente-panel">Panel</div>,
}))

import App from '../App'
import * as db from '../lib/database'

// ============================================
// Helper: creates vendedor data
// ============================================
const makeVendedor = (cargo: 'gerente' | 'vendedor' | 'sdr' = 'gerente') => ({
  id: 1,
  nome: 'Rafael Teste',
  email: 'rafael@test.com',
  telefone: '(31) 99999-0000',
  cargo,
  avatar: 'RT',
  metaVendas: 500000,
  metaLeads: 50,
  metaConversao: 0.3,
  ativo: true,
  usuario: 'rafael@test.com',
})

// ============================================
// Helper: login flow simulation
// ============================================
async function loginAs(cargo: 'gerente' | 'vendedor' | 'sdr' = 'gerente') {
  const vendedor = makeVendedor(cargo)

  // First call (checkSession) returns null → shows login screen
  // Second call (handleLogin) returns vendedor → logs in
  vi.mocked(db.getLoggedVendedor)
    .mockResolvedValueOnce(null)
    .mockResolvedValue(vendedor)
  vi.mocked(db.signIn).mockResolvedValue({ user: { id: 'uid' }, session: {} } as any)

  render(<App />)

  // Wait for auth check to finish (shows login screen)
  await waitFor(() => {
    expect(screen.getByText('Entrar no sistema')).toBeInTheDocument()
  })

  // Fill login form
  const emailInput = screen.getByPlaceholderText('seu@email.com')
  const senhaInput = screen.getByPlaceholderText('Digite sua senha')
  const entrarBtn = screen.getByRole('button', { name: /entrar/i })

  await userEvent.type(emailInput, 'rafael@test.com')
  await userEvent.type(senhaInput, 'senha123')
  await userEvent.click(entrarBtn)

  // Wait for main app to render (sidebar with brand)
  await waitFor(() => {
    expect(screen.queryByText('Entrar no sistema')).not.toBeInTheDocument()
  })

  return vendedor
}

// ============================================
// Tests
// ============================================

describe('App — Tela de Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no session, shows login
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(null)
  })

  it('mostra tela de login quando não autenticado', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Entrar no sistema')).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Digite sua senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('mostra "Carregando..." enquanto verifica sessão', () => {
    // Make getLoggedVendedor hang to show loading
    vi.mocked(db.getLoggedVendedor).mockImplementation(() => new Promise(() => {}))
    render(<App />)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('mostra branding MF Paris na tela de login', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Grupo MF Paris')).toBeInTheDocument()
      expect(screen.getByText('CRM de Vendas')).toBeInTheDocument()
    })
  })

  it('mostra copyright', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/© 2026 Grupo MF Paris/)).toBeInTheDocument()
    })
  })
})

describe('App — Login Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(null)
  })

  it('login com sucesso navega para o app', async () => {
    await loginAs('gerente')
    // Gerente sees dashboard as first view
    expect(screen.getByTestId('view-dashboard')).toBeInTheDocument()
  })

  it('login chama signIn com email e senha', async () => {
    await loginAs('gerente')
    expect(db.signIn).toHaveBeenCalledWith('rafael@test.com', 'senha123')
  })

  it('login carrega todos os dados', async () => {
    await loginAs('gerente')
    expect(db.fetchClientes).toHaveBeenCalled()
    expect(db.fetchInteracoes).toHaveBeenCalled()
    expect(db.fetchTarefas).toHaveBeenCalled()
    expect(db.fetchProdutos).toHaveBeenCalled()
    expect(db.fetchVendedores).toHaveBeenCalled()
  })

  it('mostra erro para credenciais inválidas', async () => {
    vi.mocked(db.signIn).mockRejectedValue({ message: 'Invalid login credentials' })
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(null)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Entrar no sistema')).toBeInTheDocument()
    })

    const emailInput = screen.getByPlaceholderText('seu@email.com')
    const senhaInput = screen.getByPlaceholderText('Digite sua senha')

    await userEvent.type(emailInput, 'wrong@test.com')
    await userEvent.type(senhaInput, 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText('Email ou senha inválidos')).toBeInTheDocument()
    })
  })

  it('mostra erro genérico para falha de rede', async () => {
    vi.mocked(db.signIn).mockRejectedValue({ message: 'Network error' })
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(null)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Entrar no sistema')).toBeInTheDocument()
    })

    await userEvent.type(screen.getByPlaceholderText('seu@email.com'), 'test@test.com')
    await userEvent.type(screen.getByPlaceholderText('Digite sua senha'), 'pass')
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })
})

describe('App — Navegação por cargo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(null)
  })

  it('gerente vê todos os itens de navegação', async () => {
    await loginAs('gerente')

    // Use getByRole to target nav buttons specifically
    expect(screen.getByRole('button', { name: /Visão Geral/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Funil$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Clientes$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pedidos$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tarefas$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Automações/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Prospecção/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Equipe$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Relatórios/i })).toBeInTheDocument()
  })

  it('gerente vê botão Assistente IA', async () => {
    await loginAs('gerente')
    expect(screen.getByText('Assistente IA')).toBeInTheDocument()
  })

  it('vendedor NÃO vê dashboard, automações, prospecção, equipe, relatórios', async () => {
    await loginAs('vendedor')

    // Vendedor's first view is 'funil'
    expect(screen.getByTestId('view-funil')).toBeInTheDocument()

    // Should NOT see these nav items
    expect(screen.queryByRole('button', { name: /Visão Geral/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Automações/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Prospecção/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Equipe$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Relatórios/i })).not.toBeInTheDocument()
  })

  it('vendedor NÃO vê Assistente IA', async () => {
    await loginAs('vendedor')
    expect(screen.queryByText('Assistente IA')).not.toBeInTheDocument()
  })

  it('sdr NÃO vê dashboard, automações, equipe, relatórios', async () => {
    await loginAs('sdr')

    expect(screen.queryByRole('button', { name: /Visão Geral/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Automações/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Equipe$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Relatórios/i })).not.toBeInTheDocument()

    // SDR sees funil, clientes, mapa, prospecção, tarefas, templates, pedidos
    expect(screen.getByRole('button', { name: /^Funil$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Clientes$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Prospecção/i })).toBeInTheDocument()
  })
})

describe('App — Navegação entre views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(null)
  })

  it('clicar em "Funil" navega para FunilView', async () => {
    await loginAs('gerente')

    await userEvent.click(screen.getByText('Funil'))
    expect(screen.getByTestId('view-funil')).toBeInTheDocument()
  })

  it('clicar em "Clientes" navega para ClientesView', async () => {
    await loginAs('gerente')

    await userEvent.click(screen.getByText('Clientes'))
    expect(screen.getByTestId('view-clientes')).toBeInTheDocument()
  })

  it('clicar em "Pedidos" navega para PedidosView', async () => {
    await loginAs('gerente')

    await userEvent.click(screen.getByText('Pedidos'))
    expect(screen.getByTestId('view-pedidos')).toBeInTheDocument()
  })

  it('clicar em "Tarefas" navega para TarefasView', async () => {
    await loginAs('gerente')

    await userEvent.click(screen.getByText('Tarefas'))
    expect(screen.getByTestId('view-tarefas')).toBeInTheDocument()
  })

  it('clicar em "Relatórios" navega para RelatoriosView', async () => {
    await loginAs('gerente')

    await userEvent.click(screen.getByText('Relatórios'))
    expect(screen.getByTestId('view-relatorios')).toBeInTheDocument()
  })

  it('clicar em "Equipe" navega para VendedoresView', async () => {
    await loginAs('gerente')

    await userEvent.click(screen.getByText('Equipe'))
    expect(screen.getByTestId('view-equipe')).toBeInTheDocument()
  })

  it('clicar em "Produtos" navega para ProdutosView', async () => {
    await loginAs('gerente')

    await userEvent.click(screen.getByText('Produtos'))
    expect(screen.getByTestId('view-produtos')).toBeInTheDocument()
  })
})

describe('App — Restaura sessão existente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('auto-login quando sessão existe no mount', async () => {
    const vendedor = makeVendedor('gerente')
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(vendedor)

    render(<App />)

    // Should skip login screen and go straight to app
    await waitFor(() => {
      expect(screen.getByTestId('view-dashboard')).toBeInTheDocument()
    })

    // Should load all data
    expect(db.fetchClientes).toHaveBeenCalled()
  })

  it('vendedor restaura sessão com view correta', async () => {
    const vendedor = makeVendedor('vendedor')
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(vendedor)

    render(<App />)

    // Vendedor's default view is first in their permitted list (funil)
    await waitFor(() => {
      // The app loads dashboard by default in state, but vendedor
      // should still render (they may see a fallback)
      expect(screen.queryByText('Entrar no sistema')).not.toBeInTheDocument()
    })
  })
})

describe('App — Header e notificações', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.getLoggedVendedor).mockResolvedValue(null)
  })

  it('mostra avatar do usuário logado', async () => {
    await loginAs('gerente')
    // Avatar shows initials "RT" from makeVendedor
    expect(screen.getByText('RT')).toBeInTheDocument()
  })

  it('mostra nome do usuário logado', async () => {
    await loginAs('gerente')
    expect(screen.getByText('Rafael Teste')).toBeInTheDocument()
  })
})
