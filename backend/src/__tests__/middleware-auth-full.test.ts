import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock config
vi.mock('../config.js', () => ({
  CONFIG: {
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon-key',
  },
}))

// Mock logger
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

// Hoisted mocks for @supabase/supabase-js AND ../supabase.js (serviceSupabase)
const { mockGetUser, mockCreateClient, mockMaybeSingle, mockServiceFrom } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockCreateClient = vi.fn().mockReturnValue({
    auth: { getUser: mockGetUser },
    from: vi.fn(),
  })
  const mockMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: 1, nome: 'Rafael', email: 'rafael@mfparis.com.br', cargo: 'gerente', ativo: true },
    error: null,
  })
  const mockServiceFrom = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      }),
    }),
  }))
  return { mockGetUser, mockCreateClient, mockMaybeSingle, mockServiceFrom }
})

vi.mock('../supabase.js', () => ({
  supabase: { from: (...args: any[]) => mockServiceFrom(...args) },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: any[]) => mockCreateClient(...args),
}))

import { requireAuth, requireGerente } from '../middleware/auth.js'

function createMockReqRes(headers: Record<string, string> = {}) {
  const req: any = { headers }
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  const next = vi.fn()
  return { req, res, next }
}

describe('Auth Middleware — Full Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle.mockResolvedValue({
      data: { id: 1, nome: 'Rafael', email: 'rafael@mfparis.com.br', cargo: 'gerente', ativo: true },
      error: null,
    })
  })

  describe('requireAuth', () => {
    it('retorna 401 sem header Authorization', async () => {
      const { req, res, next } = createMockReqRes()
      await requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('não fornecido') })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('retorna 401 com header sem Bearer prefix', async () => {
      const { req, res, next } = createMockReqRes({ authorization: 'Basic abc123' })
      await requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })

    it('retorna 401 quando token é inválido', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid') })
      const { req, res, next } = createMockReqRes({ authorization: 'Bearer bad-token' })
      await requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('inválido') })
      )
    })

    it('bloqueia imediatamente (403) vendedor desativado (ativo = false)', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'uid-demitido', email: 'vendas07@mfparis.com.br' } },
        error: null,
      })
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: 11, nome: 'Vendas 05', email: 'vendas07@mfparis.com.br', cargo: 'vendedor', ativo: false },
        error: null,
      })

      const { req, res, next } = createMockReqRes({ authorization: 'Bearer inactive-token' })
      await requireAuth(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('desativada') })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('chama next() e attach userId/userEmail/vendedor quando token válido e ativo', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'uid-123', email: 'rafael@mfparis.com.br' } },
        error: null,
      })

      const { req, res, next } = createMockReqRes({ authorization: 'Bearer valid-token-new' })
      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.userId).toBe('uid-123')
      expect(req.userEmail).toBe('rafael@mfparis.com.br')
      expect(req.vendedor?.ativo).toBe(true)
    })

    it('cria per-request Supabase client com token do usuário', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'uid-456', email: 'test@test.com' } },
        error: null,
      })

      const { req, res, next } = createMockReqRes({ authorization: 'Bearer per-req-token' })
      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.supabase).toBeDefined()

      const lastCall = mockCreateClient.mock.calls[mockCreateClient.mock.calls.length - 1]
      expect(lastCall[0]).toBe('https://test.supabase.co')
      expect(lastCall[1]).toBe('test-anon-key')
      expect(lastCall[2].global.headers.Authorization).toBe('Bearer per-req-token')
    })

    it('usa cache na segunda chamada com mesmo token', async () => {
      const token = 'cached-token-' + Date.now()
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'uid-cache', email: 'cache@test.com' } },
        error: null,
      })

      const { req: req1, res: res1, next: next1 } = createMockReqRes({ authorization: `Bearer ${token}` })
      await requireAuth(req1, res1, next1)
      expect(next1).toHaveBeenCalled()

      const callsBefore = mockGetUser.mock.calls.length

      const { req: req2, res: res2, next: next2 } = createMockReqRes({ authorization: `Bearer ${token}` })
      await requireAuth(req2, res2, next2)
      expect(next2).toHaveBeenCalled()

      expect(mockGetUser.mock.calls.length).toBe(callsBefore)
      expect(req2.userId).toBe('uid-cache')
    })

    it('retorna 401 quando getUser lança exceção', async () => {
      mockGetUser.mockRejectedValueOnce(new Error('Network error'))
      const { req, res, next } = createMockReqRes({ authorization: 'Bearer error-token' })
      await requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('requireGerente', () => {
    it('retorna 401 sem userId no request', async () => {
      const { req, res, next } = createMockReqRes()
      await requireGerente(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })

    it('retorna 403 quando vendedor não é gerente', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: 6, nome: 'Wiliam', email: 'w@x.com', cargo: 'vendedor', ativo: true },
        error: null,
      })
      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-vendedor'

      await requireGerente(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('gerente') })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('chama next() quando vendedor é gerente ativo', async () => {
      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-gerente-new'
      req.vendedor = { id: 1, nome: 'Rafael', email: 'r@x.com', cargo: 'gerente', ativo: true }

      await requireGerente(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('retorna 403 quando vendedor não encontrado no DB', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-missing'

      await requireGerente(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('retorna 403 para cargo sdr', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: 14, nome: 'SDR', email: 's@x.com', cargo: 'sdr', ativo: true },
        error: null,
      })
      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-sdr'

      await requireGerente(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })
})
