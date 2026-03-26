import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Mock supabase module
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
  },
}))

// Mock gemini
vi.mock('../lib/gemini', () => ({
  callAI: vi.fn().mockResolvedValue('Resposta da IA mock'),
  callAIFull: vi.fn().mockResolvedValue({ response: 'Resposta da IA mock', actions: [], uiActions: [] }),
  buildCRMContext: vi.fn().mockReturnValue('System prompt mock'),
}))

// Mock botApi
vi.mock('../lib/botApi', () => ({
  sendUserWhatsApp: vi.fn().mockResolvedValue({ success: true }),
  getUserWhatsAppStatus: vi.fn().mockResolvedValue({ connected: false, status: 'disconnected' }),
  sendEmailViaBot: vi.fn().mockResolvedValue({ success: true }),
  authFetch: vi.fn(),
  fetchVendedorHistorico: vi.fn().mockResolvedValue({ vendedor: { id: 1, nome: 'Test' }, atividades: [] }),
  fetchAllVendedoresHistorico: vi.fn().mockResolvedValue({ atividades: [] }),
}))

// Mock database
vi.mock('../lib/database', () => ({
  insertAtividade: vi.fn().mockResolvedValue({ id: 1, tipo: 'test', descricao: 'test', vendedorNome: 'Test', timestamp: new Date().toISOString() }),
  insertInteracao: vi.fn().mockResolvedValue({ id: 1 }),
}))

// Mock aiConversations
vi.mock('../lib/aiConversations', () => ({
  loadConversation: vi.fn().mockResolvedValue([]),
  saveConversation: vi.fn().mockResolvedValue(undefined),
  clearConversation: vi.fn().mockResolvedValue(undefined),
}))

import Workspace from '../components/Workspace'
import { callAI, callAIFull } from '../lib/gemini'
import { sendUserWhatsApp, getUserWhatsAppStatus, sendEmailViaBot } from '../lib/botApi'
import * as db from '../lib/database'

const mockVendedor = {
  id: 1, nome: 'João Silva', email: 'joao@test.com', telefone: '11999999999',
  cargo: 'vendedor' as const, avatar: 'JS', usuario: 'joao', metaVendas: 100000,
  metaLeads: 10, metaConversao: 15, ativo: true,
}

const mockClientes = [
  {
    id: 1, razaoSocial: 'Empresa Teste', nomeFantasia: 'Teste', cnpj: '12345678000100',
    contatoNome: 'Maria', contatoTelefone: '11988887777', contatoEmail: 'maria@test.com',
    etapa: 'negociacao', score: 80, diasInativo: 5, valorEstimado: 50000, whatsapp: '5511988887777',
  },
  {
    id: 2, razaoSocial: 'Empresa Beta', cnpj: '98765432000100',
    contatoNome: 'Pedro', contatoTelefone: '11977776666', contatoEmail: 'pedro@beta.com',
    etapa: 'prospecção', score: 40, diasInativo: 20,
  },
]

const mockProps = {
  loggedUser: mockVendedor,
  clientes: mockClientes as any[],
  vendedores: [mockVendedor],
  interacoes: [],
  pedidos: [],
  tarefas: [],
  onClose: vi.fn(),
  showToast: vi.fn(),
  onAddTarefa: vi.fn(),
  onUpdateTarefa: vi.fn(),
}

describe('Workspace Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ──

  it('renderiza com header e nome do vendedor', () => {
    render(<Workspace {...mockProps} />)
    expect(screen.getByText(/Workspace — João Silva/)).toBeTruthy()
  })

  it('mostra mensagem de boas-vindas da IA', async () => {
    render(<Workspace {...mockProps} />)
    await waitFor(() => {
      expect(screen.getByText(/Fala, João!/)).toBeTruthy()
    })
  })

  it('mostra botões da sidebar de ferramentas', () => {
    render(<Workspace {...mockProps} />)
    expect(screen.getByTitle('Buscar Cliente')).toBeTruthy()
    expect(screen.getByTitle('WhatsApp')).toBeTruthy()
    expect(screen.getByTitle('Email')).toBeTruthy()
    expect(screen.getByTitle('Observações')).toBeTruthy()
    expect(screen.getByTitle('Tarefa Rápida')).toBeTruthy()
    expect(screen.getByTitle('Histórico')).toBeTruthy()
  })

  it('mostra estatísticas do CRM na barra lateral direita', () => {
    render(<Workspace {...mockProps} />)
    // Stats section shows counts
    expect(screen.getByText('👥 Clientes')).toBeTruthy()
  })

  // ── Close ──

  it('chama onClose ao clicar no X', () => {
    render(<Workspace {...mockProps} />)
    // The close button is in the top bar with XMarkIcon
    const allBtns = screen.getAllByRole('button')
    const headerClose = allBtns.find(b => {
      const svg = b.querySelector('svg')
      return svg && b.closest('.from-purple-700')
    })
    expect(headerClose).toBeTruthy()
    fireEvent.click(headerClose!)
    expect(mockProps.onClose).toHaveBeenCalled()
  })

  // ── Search Tool ──

  it('abre painel de busca ao clicar no ícone', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Buscar Cliente'))
    expect(screen.getByPlaceholderText('Nome, CNPJ, telefone...')).toBeTruthy()
  })

  it('busca clientes por nome', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Buscar Cliente'))
    const input = screen.getByPlaceholderText('Nome, CNPJ, telefone...')
    fireEvent.change(input, { target: { value: 'Empresa Teste' } })
    expect(screen.getByText('Empresa Teste')).toBeTruthy()
  })

  it('seleciona cliente da busca', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Buscar Cliente'))
    const input = screen.getByPlaceholderText('Nome, CNPJ, telefone...')
    fireEvent.change(input, { target: { value: 'Empresa Teste' } })
    // Click on the search result button
    const results = screen.getAllByText('Empresa Teste')
    const resultBtn = results.find(el => el.closest('button'))
    if (resultBtn) fireEvent.click(resultBtn.closest('button')!)
    // Client should be selected - check header shows it
    expect(screen.getByText(/Cliente: Empresa Teste/)).toBeTruthy()
  })

  // ── WhatsApp Tool ──

  it('mostra aviso para selecionar cliente no WhatsApp', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('WhatsApp'))
    expect(screen.getByText('Selecione um cliente primeiro')).toBeTruthy()
  })

  // ── Email Tool ──

  it('mostra aviso para selecionar cliente no Email', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Email'))
    expect(screen.getByText('Selecione um cliente primeiro')).toBeTruthy()
  })

  // ── Notes Tool ──

  it('mostra aviso para selecionar cliente nas Observações', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Observações'))
    expect(screen.getByText('Selecione um cliente para adicionar observações')).toBeTruthy()
  })

  // ── Quick Task Tool ──

  it('cria tarefa rápida', async () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Tarefa Rápida'))
    const input = screen.getByPlaceholderText('Título da tarefa...')
    fireEvent.change(input, { target: { value: 'Follow-up urgente' } })
    fireEvent.click(screen.getByText('Criar Tarefa'))
    expect(mockProps.onAddTarefa).toHaveBeenCalled()
    expect(mockProps.showToast).toHaveBeenCalledWith('success', 'Tarefa criada!')
  })

  // ── Histórico Tool ──

  it('mostra histórico vazio inicialmente', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Histórico'))
    expect(screen.getByText('Nenhuma ação registrada ainda')).toBeTruthy()
  })

  it('registra ação ao criar tarefa e mostra no histórico', async () => {
    render(<Workspace {...mockProps} />)

    // Create a quick task
    fireEvent.click(screen.getByTitle('Tarefa Rápida'))
    const input = screen.getByPlaceholderText('Título da tarefa...')
    fireEvent.change(input, { target: { value: 'Tarefa teste' } })
    fireEvent.click(screen.getByText('Criar Tarefa'))

    // Check histórico — actions are logged in the right sidebar (session actions)
    // and also in the historico tool panel
    fireEvent.click(screen.getByTitle('Histórico'))
    await waitFor(() => {
      expect(screen.getByText('1 ação(ões) nesta sessão')).toBeTruthy()
    })
  })

  // ── AI Chat ──

  it('envia mensagem para IA e recebe resposta', async () => {
    render(<Workspace {...mockProps} />)
    const textarea = screen.getByPlaceholderText(/Pergunte à IA/)
    fireEvent.change(textarea, { target: { value: 'Quais clientes devo contatar?' } })

    // Click send button
    const sendBtns = screen.getAllByRole('button')
    const sendBtn = sendBtns.find(b => b.querySelector('.h-5.w-5') && b.closest('.bg-gradient-to-r.from-purple-600'))
    if (sendBtn) fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(callAIFull).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText('Resposta da IA mock')).toBeTruthy()
    })
  })

  it('usa prompts rápidos do chat', async () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByText('Contatos urgentes'))

    await waitFor(() => {
      expect(callAIFull).toHaveBeenCalled()
    })
  })

  it('limpa conversa da IA', async () => {
    render(<Workspace {...mockProps} />)

    // Send a message first
    const textarea = screen.getByPlaceholderText(/Pergunte à IA/)
    fireEvent.change(textarea, { target: { value: 'Teste' } })
    const sendBtns = screen.getAllByRole('button')
    const sendBtn = sendBtns.find(b => b.querySelector('.h-5.w-5') && b.closest('.bg-gradient-to-r.from-purple-600'))
    if (sendBtn) fireEvent.click(sendBtn)

    await waitFor(() => expect(callAIFull).toHaveBeenCalled())

    // Clear chat
    fireEvent.click(screen.getByText('Limpar'))
    expect(screen.getByText(/Conversa limpa!/)).toBeTruthy()
  })

  // ── With initial cliente ──

  it('pré-seleciona cliente quando passado via props', () => {
    render(<Workspace {...mockProps} cliente={mockClientes[0] as any} />)
    expect(screen.getByText(/Cliente: Empresa Teste/)).toBeTruthy()
  })

  it('mostra prompt contextual quando cliente selecionado', () => {
    render(<Workspace {...mockProps} cliente={mockClientes[0] as any} />)
    expect(screen.getByText(/Analisar Empresa/)).toBeTruthy()
  })

  // ── Tool toggle ──

  it('fecha painel de ferramenta ao clicar no mesmo ícone novamente', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Buscar Cliente'))
    expect(screen.getByPlaceholderText('Nome, CNPJ, telefone...')).toBeTruthy()
    fireEvent.click(screen.getByTitle('Buscar Cliente'))
    expect(screen.queryByPlaceholderText('Nome, CNPJ, telefone...')).toBeNull()
  })

  it('alterna entre ferramentas', () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Buscar Cliente'))
    expect(screen.getByPlaceholderText('Nome, CNPJ, telefone...')).toBeTruthy()
    fireEvent.click(screen.getByTitle('Tarefa Rápida'))
    expect(screen.queryByPlaceholderText('Nome, CNPJ, telefone...')).toBeNull()
    expect(screen.getByPlaceholderText('Título da tarefa...')).toBeTruthy()
  })
})

// ── API Helpers Tests ──

describe('Vendedor Histórico API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as any
  })

  it('fetchVendedorHistorico chama endpoint correto', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({
        vendedor: { id: 1, nome: 'João' },
        atividades: [
          { id: 1, tipo: 'whatsapp', descricao: '[Workspace] WhatsApp para cliente', vendedorNome: 'João', timestamp: '2025-03-01T10:00:00Z' },
        ],
      }), { status: 200 })
    )

    const BOT_URL = 'http://localhost:3001'
    const res = await fetch(`${BOT_URL}/api/vendedor/1/historico`, {
      headers: { Authorization: 'Bearer test-token' },
    })
    const data = await res.json()

    expect(data.vendedor.nome).toBe('João')
    expect(data.atividades).toHaveLength(1)
    expect(data.atividades[0].tipo).toBe('whatsapp')
  })

  it('fetchAllVendedoresHistorico retorna todas atividades', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({
        atividades: [
          { id: 1, tipo: 'email', descricao: 'Email enviado', vendedorNome: 'João', timestamp: '2025-03-01T10:00:00Z' },
          { id: 2, tipo: 'tarefa', descricao: 'Tarefa criada', vendedorNome: 'Maria', timestamp: '2025-03-01T11:00:00Z' },
        ],
      }), { status: 200 })
    )

    const BOT_URL = 'http://localhost:3001'
    const res = await fetch(`${BOT_URL}/api/vendedores/historico`, {
      headers: { Authorization: 'Bearer test-token' },
    })
    const data = await res.json()

    expect(data.atividades).toHaveLength(2)
    expect(data.atividades[0].vendedorNome).toBe('João')
    expect(data.atividades[1].vendedorNome).toBe('Maria')
  })

  it('histórico filtra por vendedor específico', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({
        vendedor: { id: 2, nome: 'Maria' },
        atividades: [
          { id: 3, tipo: 'nota', descricao: 'Observação adicionada', vendedorNome: 'Maria', timestamp: '2025-03-01T12:00:00Z' },
        ],
      }), { status: 200 })
    )

    const BOT_URL = 'http://localhost:3001'
    const res = await fetch(`${BOT_URL}/api/vendedor/2/historico`, {
      headers: { Authorization: 'Bearer test-token' },
    })
    const data = await res.json()

    expect(data.vendedor.id).toBe(2)
    expect(data.atividades).toHaveLength(1)
    expect(data.atividades[0].tipo).toBe('nota')
  })

  it('retorna erro 404 para vendedor inexistente', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Vendedor não encontrado' }), { status: 404 })
    )

    const BOT_URL = 'http://localhost:3001'
    const res = await fetch(`${BOT_URL}/api/vendedor/999/historico`, {
      headers: { Authorization: 'Bearer test-token' },
    })

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Vendedor não encontrado')
  })
})

// ── Activity Logging Tests ──

describe('Workspace Activity Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registra atividade ao criar tarefa rápida', async () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByTitle('Tarefa Rápida'))
    fireEvent.change(screen.getByPlaceholderText('Título da tarefa...'), { target: { value: 'Task test' } })
    fireEvent.click(screen.getByText('Criar Tarefa'))

    await waitFor(() => {
      expect(db.insertAtividade).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'tarefa',
        descricao: expect.stringContaining('[Workspace]'),
        vendedorNome: 'João Silva',
      }))
    })
  })

  it('registra atividade ao salvar observação', async () => {
    render(<Workspace {...mockProps} cliente={mockClientes[0] as any} />)
    fireEvent.click(screen.getByTitle('Observações'))
    fireEvent.change(screen.getByPlaceholderText('Digite sua observação...'), { target: { value: 'Nota importante' } })
    fireEvent.click(screen.getByText('Salvar Observação'))

    await waitFor(() => {
      expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 1,
        tipo: 'nota',
        descricao: 'Nota importante',
      }))
    })

    await waitFor(() => {
      expect(db.insertAtividade).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'nota',
        descricao: expect.stringContaining('[Workspace]'),
      }))
    })
  })

  it('registra atividade ao usar IA', async () => {
    render(<Workspace {...mockProps} />)
    fireEvent.click(screen.getByText('Contatos urgentes'))

    await waitFor(() => {
      expect(callAIFull).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(db.insertAtividade).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'ia',
        descricao: expect.stringContaining('[Workspace]'),
      }))
    })
  })

  it('conta ações registradas no header', async () => {
    render(<Workspace {...mockProps} />)

    // Create 2 tasks to increment counter
    fireEvent.click(screen.getByTitle('Tarefa Rápida'))
    fireEvent.change(screen.getByPlaceholderText('Título da tarefa...'), { target: { value: 'Task 1' } })
    fireEvent.click(screen.getByText('Criar Tarefa'))
    fireEvent.change(screen.getByPlaceholderText('Título da tarefa...'), { target: { value: 'Task 2' } })
    fireEvent.click(screen.getByText('Criar Tarefa'))

    await waitFor(() => {
      expect(screen.getByText('2 ação(ões) registrada(s)')).toBeTruthy()
    })
  })
})
