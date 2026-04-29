import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mock do Supabase — padrão do projeto
// ============================================================
function mockChain(resolveData: any = null, resolveError: any = null) {
  const resolved = { data: Array.isArray(resolveData) ? resolveData : (resolveData ? [resolveData] : []), error: resolveError }
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: Array.isArray(resolveData) ? resolveData?.[0] ?? null : resolveData, error: resolveError }),
  }
  // limit() resolves; when no limit(), select() also resolves (PromiseLike)
  chain.limit.mockResolvedValue(resolved)
  // Make chain itself thenable so awaiting the builder (without .limit) resolves
  chain.then = (resolve: any) => Promise.resolve(resolved).then(resolve)
  return chain
}

const mockFrom = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}))

import * as db from '../lib/database'

// ============================================================
// Tests: Chat Interno — database helpers
// ============================================================

describe('Chat Interno — fetchChatMensagens', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retorna mensagens mapeadas corretamente do DB', async () => {
    const rows = [
      { id: 1, sender_id: 1, receiver_id: 2, content: 'Olá!', read_at: null, created_at: '2025-04-29T10:00:00Z' },
      { id: 2, sender_id: 2, receiver_id: 1, content: 'Tudo bem?', read_at: '2025-04-29T10:01:00Z', created_at: '2025-04-29T10:01:00Z' },
    ]
    mockFrom.mockReturnValue(mockChain(rows))

    const result = await db.fetchChatMensagens(1, 2)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 1, senderId: 1, receiverId: 2, content: 'Olá!', readAt: null })
    expect(result[1]).toMatchObject({ id: 2, senderId: 2, receiverId: 1, content: 'Tudo bem?', readAt: '2025-04-29T10:01:00Z' })
  })

  it('retorna array vazio quando não há mensagens', async () => {
    mockFrom.mockReturnValue(mockChain([]))
    const result = await db.fetchChatMensagens(1, 2)
    expect(result).toEqual([])
  })

  it('lança erro quando Supabase retorna erro', async () => {
    const chain = mockChain(null, { message: 'DB error' })
    mockFrom.mockReturnValue(chain)
    await expect(db.fetchChatMensagens(1, 2)).rejects.toMatchObject({ message: 'DB error' })
  })

  it('chama .or() com filtro de par correto', async () => {
    const chain = mockChain([])
    mockFrom.mockReturnValue(chain)
    await db.fetchChatMensagens(3, 7)
    expect(chain.or).toHaveBeenCalledWith(
      expect.stringContaining('sender_id.eq.3')
    )
    expect(chain.or).toHaveBeenCalledWith(
      expect.stringContaining('receiver_id.eq.7')
    )
  })

  it('ordena por created_at ascendente', async () => {
    const chain = mockChain([])
    mockFrom.mockReturnValue(chain)
    await db.fetchChatMensagens(1, 2)
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true })
  })
})

describe('Chat Interno — insertChatMensagem', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('insere mensagem e retorna objeto mapeado', async () => {
    const row = { id: 10, sender_id: 1, receiver_id: 2, content: 'Mensagem nova', read_at: null, created_at: '2025-04-29T11:00:00Z' }
    mockFrom.mockReturnValue(mockChain(row))

    const result = await db.insertChatMensagem(1, 2, 'Mensagem nova')
    expect(result).toMatchObject({ id: 10, senderId: 1, receiverId: 2, content: 'Mensagem nova', readAt: null })
  })

  it('lança erro quando insert falha', async () => {
    const chain = mockChain(null, { message: 'Insert failed' })
    mockFrom.mockReturnValue(chain)
    await expect(db.insertChatMensagem(1, 2, 'teste')).rejects.toMatchObject({ message: 'Insert failed' })
  })

  it('chama from("chat_mensagens")', async () => {
    mockFrom.mockReturnValue(mockChain({ id: 1, sender_id: 1, receiver_id: 2, content: 'x', read_at: null, created_at: '2025-01-01' }))
    await db.insertChatMensagem(1, 2, 'x')
    expect(mockFrom).toHaveBeenCalledWith('chat_mensagens')
  })
})

describe('Chat Interno — markChatMensagensRead', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('chama update com read_at no receiver correto', async () => {
    const chain = mockChain()
    mockFrom.mockReturnValue(chain)
    await db.markChatMensagensRead(2, 1)
    expect(chain.update).toHaveBeenCalledWith({ read_at: expect.any(String) })
    expect(chain.eq).toHaveBeenCalledWith('receiver_id', 2)
    expect(chain.eq).toHaveBeenCalledWith('sender_id', 1)
  })

  it('não lança exceção quando não há mensagens para marcar', async () => {
    mockFrom.mockReturnValue(mockChain())
    await expect(db.markChatMensagensRead(1, 2)).resolves.toBeUndefined()
  })
})

describe('Chat Interno — fetchUnreadCounts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('agrupa contagem por sender_id', async () => {
    const rows = [
      { sender_id: 3 },
      { sender_id: 3 },
      { sender_id: 5 },
    ]
    mockFrom.mockReturnValue(mockChain(rows))
    const counts = await db.fetchUnreadCounts(1)
    expect(counts).toEqual({ 3: 2, 5: 1 })
  })

  it('retorna objeto vazio quando não há não-lidas', async () => {
    mockFrom.mockReturnValue(mockChain([]))
    const counts = await db.fetchUnreadCounts(1)
    expect(counts).toEqual({})
  })

  it('retorna objeto vazio quando Supabase retorna erro (non-critical)', async () => {
    const chain = mockChain(null, { message: 'error' })
    mockFrom.mockReturnValue(chain)
    const counts = await db.fetchUnreadCounts(1)
    expect(counts).toEqual({})
  })

  it('filtra por receiver_id correto', async () => {
    const chain = mockChain([])
    mockFrom.mockReturnValue(chain)
    await db.fetchUnreadCounts(42)
    expect(chain.eq).toHaveBeenCalledWith('receiver_id', 42)
  })

  it('filtra apenas mensagens com read_at null', async () => {
    const chain = mockChain([])
    mockFrom.mockReturnValue(chain)
    await db.fetchUnreadCounts(1)
    expect(chain.is).toHaveBeenCalledWith('read_at', null)
  })
})

// ============================================================
// Tests: ChatMensagem type mapping
// ============================================================

describe('ChatMensagem — mapeamento de campos', () => {
  it('mapeia snake_case → camelCase corretamente', async () => {
    const row = {
      id: 99,
      sender_id: 10,
      receiver_id: 20,
      content: 'Hello world',
      read_at: '2025-04-29T12:00:00Z',
      created_at: '2025-04-29T11:59:00Z',
    }
    mockFrom.mockReturnValue(mockChain([row]))
    const result = await db.fetchChatMensagens(10, 20)
    const msg = result[0]
    expect(msg.id).toBe(99)
    expect(msg.senderId).toBe(10)
    expect(msg.receiverId).toBe(20)
    expect(msg.content).toBe('Hello world')
    expect(msg.readAt).toBe('2025-04-29T12:00:00Z')
    expect(msg.createdAt).toBe('2025-04-29T11:59:00Z')
  })

  it('read_at null se não lida', async () => {
    const row = { id: 1, sender_id: 1, receiver_id: 2, content: 'x', read_at: null, created_at: '2025-01-01' }
    mockFrom.mockReturnValue(mockChain([row]))
    const result = await db.fetchChatMensagens(1, 2)
    expect(result[0].readAt).toBeNull()
  })
})
