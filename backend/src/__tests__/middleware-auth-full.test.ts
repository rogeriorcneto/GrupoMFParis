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

// Track createClient calls — use vi.hoisted to avoid TDZ issue
const { mockGetUser, mockCreateClient } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockCreateClient = vi.fn().mockReturnValue({
    auth: { getUser: mockGetUser },
    from: vi.fn(),
  })
  return { mockGetUser, mockCreateClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: any[]) => mockCreateClient(...args),
}))

import { requireAuth, requireGerente } from '../middleware/auth.js'

// Helper: mock Express req/res/next
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

    it('chama next() e attach userId/userEmail quando token válido', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'uid-123', email: 'rafael@mfparis.com.br' } },
        error: null,
      })

      const { req, res, next } = createMockReqRes({ authorization: 'Bearer valid-token-new' })
      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.userId).toBe('uid-123')
      expect(req.userEmail).toBe('rafael@mfparis.com.br')
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

      // Verify createClient was called with the user's token in the headers
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

      // Reset getUser call count
      const callsBefore = mockGetUser.mock.calls.length

      const { req: req2, res: res2, next: next2 } = createMockReqRes({ authorization: `Bearer ${token}` })
      await requireAuth(req2, res2, next2)
      expect(next2).toHaveBeenCalled()

      // getUser should NOT be called again (cache hit)
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
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { cargo: 'vendedor' }, error: null }),
          }),
        }),
      })

      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-vendedor'
      req.supabase = { from: mockFrom }

      await requireGerente(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('gerente') })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('chama next() quando vendedor é gerente', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { cargo: 'gerente' }, error: null }),
          }),
        }),
      })

      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-gerente-new'
      req.supabase = { from: mockFrom }

      await requireGerente(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('retorna 403 quando vendedor não encontrado no DB', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      })

      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-missing'
      req.supabase = { from: mockFrom }

      await requireGerente(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('retorna 403 para cargo sdr', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { cargo: 'sdr' }, error: null }),
          }),
        }),
      })

      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-sdr'
      req.supabase = { from: mockFrom }

      await requireGerente(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('usa per-request supabase client quando disponível', async () => {
      const customFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { cargo: 'gerente' }, error: null }),
          }),
        }),
      })

      const { req, res, next } = createMockReqRes()
      req.userId = 'uid-custom-client'
      req.supabase = { from: customFrom }

      await requireGerente(req, res, next)
      expect(customFrom).toHaveBeenCalledWith('vendedores')
      expect(next).toHaveBeenCalled()
    })

    it('usa cargo cache na segunda chamada', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { cargo: 'gerente' }, error: null }),
          }),
        }),
      })

      const userId = 'uid-cache-gerente-' + Date.now()

      const { req: req1, res: res1, next: next1 } = createMockReqRes()
      req1.userId = userId
      req1.supabase = { from: mockFrom }
      await requireGerente(req1, res1, next1)
      expect(next1).toHaveBeenCalled()

      const callsBefore = mockFrom.mock.calls.length

      const { req: req2, res: res2, next: next2 } = createMockReqRes()
      req2.userId = userId
      req2.supabase = { from: mockFrom }
      await requireGerente(req2, res2, next2)
      expect(next2).toHaveBeenCalled()

      // DB should NOT be queried again (cache hit)
      expect(mockFrom.mock.calls.length).toBe(callsBefore)
    })
  })
})
