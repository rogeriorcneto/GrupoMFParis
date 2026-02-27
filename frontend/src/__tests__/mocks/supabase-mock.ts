import { vi } from 'vitest'

/**
 * Factory para criar mock completo do Supabase client.
 * Cada query builder retorna um chainable mock.
 */
export function createSupabaseMock() {
  const queryBuilder = () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: undefined, // prevent accidental awaiting of chain
    }
    // Make terminal methods return promises
    chain.select.mockReturnValue(chain)
    chain.insert.mockReturnValue(chain)
    chain.update.mockReturnValue(chain)
    chain.delete.mockReturnValue(chain)
    return chain
  }

  const mockFrom = vi.fn().mockImplementation(() => queryBuilder())

  const mockSupabase = {
    from: mockFrom,
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'test-uid' }, session: { access_token: 'test-token' } }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'new-uid' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-uid', email: 'test@test.com' } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
  }

  return { mockSupabase, mockFrom, queryBuilder }
}

/**
 * Helper: configura o mock do from() para retornar dados específicos
 * para uma tabela quando .select() é chamado.
 */
export function mockTableSelect(mockFrom: ReturnType<typeof vi.fn>, table: string, data: any[], error: any = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockImplementation(() => Promise.resolve({ data, error })),
    single: vi.fn().mockResolvedValue({ data: data[0] || null, error }),
  }
  // Chain all methods
  Object.values(chain).forEach(fn => {
    if (typeof fn === 'function' && fn !== chain.range && fn !== chain.single) {
      fn.mockReturnValue(chain)
    }
  })

  mockFrom.mockImplementation((t: string) => {
    if (t === table) return chain
    // Default empty chain for other tables
    const defaultChain: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    Object.values(defaultChain).forEach(fn => {
      if (typeof fn === 'function' && fn !== defaultChain.range && fn !== defaultChain.single) {
        (fn as any).mockReturnValue(defaultChain)
      }
    })
    return defaultChain
  })

  return chain
}

// Sample test data factories
export const sampleVendedor = (overrides = {}) => ({
  id: 1,
  nome: 'Rafael Gerente',
  email: 'rafael@mfparis.com.br',
  telefone: '(31) 99999-0000',
  cargo: 'gerente' as const,
  avatar: 'RG',
  metaVendas: 500000,
  metaLeads: 50,
  metaConversao: 0.3,
  ativo: true,
  usuario: 'rafael@mfparis.com.br',
  ...overrides,
})

export const sampleCliente = (overrides = {}) => ({
  id: 1,
  razaoSocial: 'Empresa Teste LTDA',
  nomeFantasia: 'Empresa Teste',
  cnpj: '12.345.678/0001-95',
  contatoNome: 'João Silva',
  contatoTelefone: '(31) 99999-1234',
  contatoEmail: 'joao@empresa.com',
  endereco: 'Rua ABC, 123',
  etapa: 'prospecção' as const,
  vendedorId: 1,
  score: 50,
  valorEstimado: 100000,
  produtosInteresse: ['Sacaria'],
  ultimaInteracao: '2025-02-01',
  diasInativo: 5,
  historicoEtapas: [],
  ...overrides,
})

export const sampleInteracao = (overrides = {}) => ({
  id: 1,
  clienteId: 1,
  tipo: 'email' as const,
  assunto: 'Contato inicial',
  descricao: 'Primeiro contato com o cliente',
  data: '2025-02-01T10:00:00Z',
  automatico: false,
  ...overrides,
})

export const sampleTarefa = (overrides = {}) => ({
  id: 1,
  titulo: 'Follow-up cliente',
  descricao: 'Ligar para confirmar interesse',
  data: '2025-02-15',
  hora: '10:00',
  tipo: 'ligacao' as const,
  status: 'pendente' as const,
  prioridade: 'media' as const,
  clienteId: 1,
  vendedorId: 1,
  ...overrides,
})
