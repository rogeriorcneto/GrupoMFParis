import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  }
  return { mockSupabase }
})

vi.mock('../supabase.js', () => ({
  supabase: mockSupabase,
}))

import { fetchAtividadesByVendedor, fetchAllAtividades, insertAtividade } from '../database.js'

describe('Vendedor Histórico — Database Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset chain
    mockSupabase.from.mockReturnThis()
    mockSupabase.select.mockReturnThis()
    mockSupabase.insert.mockReturnThis()
    mockSupabase.eq.mockReturnThis()
    mockSupabase.order.mockReturnThis()
    mockSupabase.limit.mockReturnThis()
  })

  // ── fetchAtividadesByVendedor ──

  describe('fetchAtividadesByVendedor', () => {
    it('retorna atividades filtradas por nome do vendedor', async () => {
      const mockData = [
        { id: 1, tipo: 'whatsapp', descricao: '[Workspace] WhatsApp para Cliente X', vendedor_nome: 'João Silva', created_at: '2025-03-01T10:00:00Z' },
        { id: 2, tipo: 'email', descricao: '[Workspace] Email para Cliente Y', vendedor_nome: 'João Silva', created_at: '2025-03-01T11:00:00Z' },
      ]
      mockSupabase.limit.mockResolvedValueOnce({ data: mockData, error: null })

      const result = await fetchAtividadesByVendedor('João Silva')

      expect(mockSupabase.from).toHaveBeenCalledWith('atividades')
      expect(mockSupabase.eq).toHaveBeenCalledWith('vendedor_nome', 'João Silva')
      expect(result).toHaveLength(2)
      expect(result[0].tipo).toBe('whatsapp')
      expect(result[0].vendedorNome).toBe('João Silva')
      expect(result[1].tipo).toBe('email')
    })

    it('retorna array vazio quando vendedor não tem atividades', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null })

      const result = await fetchAtividadesByVendedor('Vendedor Novo')

      expect(result).toHaveLength(0)
    })

    it('respeita o limite de registros', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null })

      await fetchAtividadesByVendedor('João Silva', 50)

      expect(mockSupabase.limit).toHaveBeenCalledWith(50)
    })

    it('usa limite padrão de 200', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null })

      await fetchAtividadesByVendedor('João Silva')

      expect(mockSupabase.limit).toHaveBeenCalledWith(200)
    })

    it('ordena por created_at descendente', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null })

      await fetchAtividadesByVendedor('João Silva')

      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('trata vendedor_nome null como "Sistema"', async () => {
      const mockData = [
        { id: 1, tipo: 'sistema', descricao: 'Ação automática', vendedor_nome: null, created_at: '2025-03-01T10:00:00Z' },
      ]
      mockSupabase.limit.mockResolvedValueOnce({ data: mockData, error: null })

      const result = await fetchAtividadesByVendedor('Sistema')

      expect(result[0].vendedorNome).toBe('Sistema')
    })

    it('lança erro quando supabase retorna erro', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

      await expect(fetchAtividadesByVendedor('João')).rejects.toThrow()
    })

    it('mapeia campos corretamente do DB para interface', async () => {
      const mockData = [
        { id: 42, tipo: 'ia', descricao: '[Workspace] Pergunta IA: análise', vendedor_nome: 'Maria', created_at: '2025-03-01T15:30:00Z' },
      ]
      mockSupabase.limit.mockResolvedValueOnce({ data: mockData, error: null })

      const result = await fetchAtividadesByVendedor('Maria')

      expect(result[0]).toEqual({
        id: 42,
        tipo: 'ia',
        descricao: '[Workspace] Pergunta IA: análise',
        vendedorNome: 'Maria',
        timestamp: '2025-03-01T15:30:00Z',
      })
    })
  })

  // ── fetchAllAtividades ──

  describe('fetchAllAtividades', () => {
    it('retorna todas as atividades sem filtro', async () => {
      const mockData = [
        { id: 1, tipo: 'whatsapp', descricao: 'WA João', vendedor_nome: 'João', created_at: '2025-03-01T10:00:00Z' },
        { id: 2, tipo: 'email', descricao: 'Email Maria', vendedor_nome: 'Maria', created_at: '2025-03-01T11:00:00Z' },
        { id: 3, tipo: 'tarefa', descricao: 'Tarefa Pedro', vendedor_nome: 'Pedro', created_at: '2025-03-01T12:00:00Z' },
      ]
      mockSupabase.limit.mockResolvedValueOnce({ data: mockData, error: null })

      const result = await fetchAllAtividades()

      expect(mockSupabase.from).toHaveBeenCalledWith('atividades')
      expect(result).toHaveLength(3)
      expect(result[0].vendedorNome).toBe('João')
      expect(result[1].vendedorNome).toBe('Maria')
      expect(result[2].vendedorNome).toBe('Pedro')
    })

    it('usa limite padrão de 500', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null })

      await fetchAllAtividades()

      expect(mockSupabase.limit).toHaveBeenCalledWith(500)
    })

    it('aceita limite customizado', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null })

      await fetchAllAtividades(100)

      expect(mockSupabase.limit).toHaveBeenCalledWith(100)
    })

    it('lança erro quando supabase falha', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: null, error: { message: 'Connection failed' } })

      await expect(fetchAllAtividades()).rejects.toThrow()
    })

    it('trata data null como array vazio', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: null, error: null })

      const result = await fetchAllAtividades()

      expect(result).toHaveLength(0)
    })
  })

  // ── insertAtividade ──

  describe('insertAtividade', () => {
    it('insere atividade com campos corretos', async () => {
      mockSupabase.insert.mockResolvedValueOnce({ error: null })

      await insertAtividade({
        tipo: 'whatsapp',
        descricao: '[Workspace] WhatsApp para Cliente X',
        vendedorNome: 'João Silva',
      })

      expect(mockSupabase.from).toHaveBeenCalledWith('atividades')
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        tipo: 'whatsapp',
        descricao: '[Workspace] WhatsApp para Cliente X',
        vendedor_nome: 'João Silva',
      })
    })

    it('lança erro quando insert falha', async () => {
      mockSupabase.insert.mockResolvedValueOnce({ error: { message: 'Insert failed' } })

      await expect(insertAtividade({
        tipo: 'email',
        descricao: 'test',
        vendedorNome: 'Test',
      })).rejects.toThrow()
    })
  })

  // ── Workspace activity types ──

  describe('Tipos de atividade do Workspace', () => {
    it('suporta tipo whatsapp', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{ id: 1, tipo: 'whatsapp', descricao: '[Workspace] Msg WA', vendedor_nome: 'V1', created_at: '2025-01-01T00:00:00Z' }],
        error: null,
      })
      const r = await fetchAtividadesByVendedor('V1')
      expect(r[0].tipo).toBe('whatsapp')
    })

    it('suporta tipo email', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{ id: 2, tipo: 'email', descricao: '[Workspace] Email', vendedor_nome: 'V1', created_at: '2025-01-01T00:00:00Z' }],
        error: null,
      })
      const r = await fetchAtividadesByVendedor('V1')
      expect(r[0].tipo).toBe('email')
    })

    it('suporta tipo nota', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{ id: 3, tipo: 'nota', descricao: '[Workspace] Observação', vendedor_nome: 'V1', created_at: '2025-01-01T00:00:00Z' }],
        error: null,
      })
      const r = await fetchAtividadesByVendedor('V1')
      expect(r[0].tipo).toBe('nota')
    })

    it('suporta tipo tarefa', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{ id: 4, tipo: 'tarefa', descricao: '[Workspace] Tarefa criada', vendedor_nome: 'V1', created_at: '2025-01-01T00:00:00Z' }],
        error: null,
      })
      const r = await fetchAtividadesByVendedor('V1')
      expect(r[0].tipo).toBe('tarefa')
    })

    it('suporta tipo ia', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{ id: 5, tipo: 'ia', descricao: '[Workspace] Pergunta IA', vendedor_nome: 'V1', created_at: '2025-01-01T00:00:00Z' }],
        error: null,
      })
      const r = await fetchAtividadesByVendedor('V1')
      expect(r[0].tipo).toBe('ia')
    })
  })
})
