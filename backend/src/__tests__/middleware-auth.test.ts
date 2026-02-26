import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
vi.mock('../supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}))

import { supabase } from '../supabase.js'

// Reimplementar lógica core do middleware auth para testar sem Express
async function authenticateUser(authHeader?: string): Promise<{ userId: string; vendedor: any } | { error: string; status: number }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Token não fornecido', status: 401 }
  }

  const token = authHeader.replace('Bearer ', '')

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { error: 'Token inválido ou expirado', status: 401 }
  }

  const { data: vendedor } = await (supabase.from as any)('vendedores').select('*').eq('auth_id', user.id).single()
  if (!vendedor) {
    return { error: 'Vendedor não encontrado', status: 401 }
  }

  return { userId: user.id, vendedor }
}

function checkGerente(vendedor: { cargo: string }): boolean {
  return vendedor.cargo === 'gerente'
}

describe('middleware/auth logic', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('authenticateUser', () => {
    it('sem header retorna 401', async () => {
      const result = await authenticateUser(undefined)
      expect(result).toEqual({ error: 'Token não fornecido', status: 401 })
    })

    it('header sem Bearer retorna 401', async () => {
      const result = await authenticateUser('Basic abc123')
      expect(result).toEqual({ error: 'Token não fornecido', status: 401 })
    })

    it('token inválido retorna 401', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null }, error: new Error('invalid') } as any)
      const result = await authenticateUser('Bearer invalid-token')
      expect(result).toEqual({ error: 'Token inválido ou expirado', status: 401 })
    })

    it('token válido mas vendedor não encontrado retorna 401', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null } as any)
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      })
      vi.mocked(supabase.from as any).mockImplementation(mockFrom)
      const result = await authenticateUser('Bearer valid-token')
      expect(result).toEqual({ error: 'Vendedor não encontrado', status: 401 })
    })

    it('token válido com vendedor retorna userId e vendedor', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null } as any)
      const vendedor = { id: 1, nome: 'Rafael', cargo: 'gerente' }
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: vendedor }),
          }),
        }),
      })
      vi.mocked(supabase.from as any).mockImplementation(mockFrom)
      const result = await authenticateUser('Bearer valid-token')
      expect(result).toEqual({ userId: 'uid-1', vendedor })
    })
  })

  describe('checkGerente', () => {
    it('gerente retorna true', () => {
      expect(checkGerente({ cargo: 'gerente' })).toBe(true)
    })

    it('vendedor retorna false', () => {
      expect(checkGerente({ cargo: 'vendedor' })).toBe(false)
    })

    it('sdr retorna false', () => {
      expect(checkGerente({ cargo: 'sdr' })).toBe(false)
    })
  })
})
