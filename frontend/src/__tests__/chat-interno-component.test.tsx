import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ============================================================
// Mocks
// ============================================================
vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}))

const mockFetchChat = vi.fn().mockResolvedValue([])
const mockInsertChat = vi.fn().mockResolvedValue({ id: 1, senderId: 1, receiverId: 2, content: 'Oi', readAt: null, createdAt: new Date().toISOString() })
const mockMarkRead = vi.fn().mockResolvedValue(undefined)
const mockUnreadCounts = vi.fn().mockResolvedValue({})

vi.mock('../lib/database', () => ({
  fetchChatMensagens: (...args: any[]) => mockFetchChat(...args),
  insertChatMensagem: (...args: any[]) => mockInsertChat(...args),
  markChatMensagensRead: (...args: any[]) => mockMarkRead(...args),
  fetchUnreadCounts: (...args: any[]) => mockUnreadCounts(...args),
}))

import ChatInterno from '../components/ChatInterno'
import type { Vendedor } from '../types'

// ============================================================
// Test data
// ============================================================
const gerente: Vendedor = {
  id: 1, nome: 'Rafael Gerente', email: 'rafael@mfparis.com.br',
  telefone: '(31) 9999-0000', cargo: 'gerente', avatar: 'RG',
  ativo: true, metaVendas: 500000, metaLeads: 50, metaConversao: 0.3, usuario: 'rafael',
}
const vendedor: Vendedor = {
  id: 2, nome: 'Maria Vendedora', email: 'maria@mfparis.com.br',
  telefone: '(31) 9888-0000', cargo: 'vendedor', avatar: 'MV',
  ativo: true, metaVendas: 200000, metaLeads: 20, metaConversao: 0.25, usuario: 'maria',
}
const vendedorInativo: Vendedor = {
  id: 3, nome: 'João Inativo', email: 'joao@mfparis.com.br',
  telefone: '', cargo: 'vendedor', avatar: 'JI',
  ativo: false, metaVendas: 0, metaLeads: 0, metaConversao: 0, usuario: 'joao',
}

function renderChat(loggedUser = gerente, vendedores = [vendedor], onClose = vi.fn(), onUnreadChange = vi.fn()) {
  return render(
    <ChatInterno
      loggedUser={loggedUser}
      vendedores={vendedores}
      onClose={onClose}
      onUnreadChange={onUnreadChange}
    />
  )
}

// ============================================================
// Tests: ChatInterno component
// ============================================================

describe('ChatInterno — renderização', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFetchChat.mockResolvedValue([]); mockUnreadCounts.mockResolvedValue({}) })

  it('exibe header "Chat Interno"', () => {
    renderChat()
    expect(screen.getByText('Chat Interno')).toBeInTheDocument()
  })

  it('exibe o card de Suporte', () => {
    renderChat()
    expect(screen.getByText('Suporte')).toBeInTheDocument()
  })

  it('exibe vendedores ativos na lista de contatos', () => {
    renderChat(gerente, [vendedor, vendedorInativo])
    expect(screen.getByText('Maria')).toBeInTheDocument()
  })

  it('NÃO exibe vendedores inativos', () => {
    renderChat(gerente, [vendedor, vendedorInativo])
    expect(screen.queryByText('João')).not.toBeInTheDocument()
  })

  it('NÃO exibe o próprio loggedUser na lista de contatos (apenas no rodapé)', () => {
    renderChat(gerente, [gerente, vendedor])
    // 'Rafael' aparece no rodapé mas NÃO como botão de contato na lista
    const rafaelBtns = screen.queryAllByRole('button').filter(b => b.textContent?.includes('Rafael') && b.textContent?.includes('Gerente'))
    expect(rafaelBtns).toHaveLength(0)
  })

  it('exibe nome do usuário logado no rodapé da lista', () => {
    renderChat()
    // Rafael aparece no rodapé (não como botão de contato)
    expect(screen.getByText('Rafael')).toBeInTheDocument()
  })

  it('chama onClose ao clicar no botão X', () => {
    const onClose = vi.fn()
    renderChat(gerente, [vendedor], onClose)
    const buttons = screen.getAllByRole('button')
    // X button is the first button in the header (index 0 in the rendered list)
    // It's the only button that triggers onClose in the header row
    // Find by clicking each until onClose is called
    for (const btn of buttons) {
      fireEvent.click(btn)
      if (onClose.mock.calls.length > 0) break
    }
    expect(onClose).toHaveBeenCalled()
  })

  it('exibe mensagem de "Selecione um contato" antes de selecionar', () => {
    renderChat()
    expect(screen.getByText(/selecione um contato/i)).toBeInTheDocument()
  })
})

describe('ChatInterno — seleção de contato', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFetchChat.mockResolvedValue([]); mockUnreadCounts.mockResolvedValue({}) })

  it('ao clicar em contato, chama fetchChatMensagens', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => expect(mockFetchChat).toHaveBeenCalledWith(gerente.id, vendedor.id))
  })

  it('ao clicar em contato, chama markChatMensagensRead', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith(gerente.id, vendedor.id))
  })

  it('ao selecionar Suporte, exibe mensagem de email', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Suporte'))
    await waitFor(() => expect(screen.getByText(/suporte@gmfparis\.com\.br/i)).toBeInTheDocument())
  })

  it('ao selecionar Suporte, NÃO mostra input de texto', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Suporte'))
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/mensagem/i)).not.toBeInTheDocument()
    })
  })
})

describe('ChatInterno — exibição de mensagens', () => {
  beforeEach(() => { vi.clearAllMocks(); mockUnreadCounts.mockResolvedValue({}) })

  it('exibe mensagens carregadas do DB', async () => {
    mockFetchChat.mockResolvedValue([
      { id: 1, senderId: 1, receiverId: 2, content: 'Bom dia!', readAt: null, createdAt: new Date().toISOString() },
      { id: 2, senderId: 2, receiverId: 1, content: 'Bom dia para você!', readAt: null, createdAt: new Date().toISOString() },
    ])
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => expect(screen.getByText('Bom dia!')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Bom dia para você!')).toBeInTheDocument())
  })

  it('exibe texto "Nenhuma mensagem ainda" quando conversa vazia', async () => {
    mockFetchChat.mockResolvedValue([])
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => expect(screen.getByText(/nenhuma mensagem ainda/i)).toBeInTheDocument())
  })
})

describe('ChatInterno — envio de mensagens', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFetchChat.mockResolvedValue([]); mockUnreadCounts.mockResolvedValue({}) })

  it('input de texto aparece após selecionar contato', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => expect(screen.getByPlaceholderText(/mensagem para maria/i)).toBeInTheDocument())
  })

  it('botão enviar está desabilitado com input vazio', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const sendBtn = btns.find(b => b.getAttribute('disabled') !== null && b.querySelector('svg'))
      expect(sendBtn).toBeTruthy()
    })
  })

  it('ao pressionar Enter com texto, chama insertChatMensagem', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => screen.getByPlaceholderText(/mensagem para maria/i))
    const input = screen.getByPlaceholderText(/mensagem para maria/i)
    fireEvent.change(input, { target: { value: 'Olá!' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(mockInsertChat).toHaveBeenCalledWith(gerente.id, vendedor.id, 'Olá!'))
  })

  it('limpa o input após enviar', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => screen.getByPlaceholderText(/mensagem para maria/i))
    const input = screen.getByPlaceholderText(/mensagem para maria/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Teste' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('Shift+Enter NÃO envia a mensagem', async () => {
    renderChat()
    fireEvent.click(screen.getByText('Maria'))
    await waitFor(() => screen.getByPlaceholderText(/mensagem para maria/i))
    const input = screen.getByPlaceholderText(/mensagem para maria/i)
    fireEvent.change(input, { target: { value: 'Linha 1' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(mockInsertChat).not.toHaveBeenCalled()
  })
})

describe('ChatInterno — badge de não-lidas', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFetchChat.mockResolvedValue([]) })

  it('chama onUnreadChange com total de não-lidas', async () => {
    mockUnreadCounts.mockResolvedValue({ 2: 3, 5: 1 })
    const onUnreadChange = vi.fn()
    renderChat(gerente, [vendedor], vi.fn(), onUnreadChange)
    await waitFor(() => expect(onUnreadChange).toHaveBeenCalledWith(4))
  })

  it('chama onUnreadChange(0) quando não há não-lidas', async () => {
    mockUnreadCounts.mockResolvedValue({})
    const onUnreadChange = vi.fn()
    renderChat(gerente, [vendedor], vi.fn(), onUnreadChange)
    await waitFor(() => expect(onUnreadChange).toHaveBeenCalledWith(0))
  })

  it('exibe badge na lista quando há mensagens não-lidas do contato', async () => {
    mockUnreadCounts.mockResolvedValue({ 2: 5 })
    renderChat()
    await waitFor(() => {
      const badges = screen.getAllByText('5')
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })
  })
})
