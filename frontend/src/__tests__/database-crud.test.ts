import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock chain factory
function mockChain(resolveData: any = null, resolveError: any = null) {
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
    range: vi.fn().mockResolvedValue({ data: Array.isArray(resolveData) ? resolveData : [], error: resolveError }),
    single: vi.fn().mockResolvedValue({ data: resolveData, error: resolveError }),
  }
  return chain
}

// Track from() calls and return appropriate chains
const tableChains: Record<string, any> = {}
const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (tableChains[table]) return tableChains[table]
  return mockChain()
})

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'uid' }, session: {} }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid', email: 'test@test.com' } }, error: null }),
    },
  },
}))

// Need to also mock createClient for createVendedorWithAuth
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'new-uid' } }, error: null }),
    },
  }),
}))

import * as db from '../lib/database'
import { supabase } from '../lib/supabase'

describe('database.ts — Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(tableChains).forEach(k => delete tableChains[k])
  })

  it('signIn chama supabase.auth.signInWithPassword', async () => {
    await db.signIn('test@test.com', 'password')
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@test.com',
      password: 'password',
    })
  })

  it('signIn lança erro quando falha', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' } as any,
    })
    await expect(db.signIn('wrong@test.com', 'wrong')).rejects.toThrow()
  })

  it('signOut chama supabase.auth.signOut', async () => {
    await db.signOut()
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('getSession retorna session', async () => {
    const session = await db.getSession()
    expect(session).toEqual({ access_token: 'tok' })
  })

  it('getLoggedVendedor retorna vendedor do auth user', async () => {
    const vendedorRow = {
      id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '', cargo: 'gerente',
      avatar: 'R', meta_vendas: 500000, meta_leads: 50, meta_conversao: 0.3, ativo: true,
    }
    tableChains['vendedores'] = mockChain(vendedorRow)

    const v = await db.getLoggedVendedor()
    expect(v).not.toBeNull()
    expect(v?.nome).toBe('Rafael')
    expect(v?.cargo).toBe('gerente')
  })

  it('getLoggedVendedor retorna null se sem user', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: null,
    } as any)
    const v = await db.getLoggedVendedor()
    expect(v).toBeNull()
  })
})

describe('database.ts — Vendedores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(tableChains).forEach(k => delete tableChains[k])
  })

  it('fetchVendedores mapeia rows para Vendedor[]', async () => {
    const rows = [
      { id: 1, nome: 'Ana', email: 'ana@test.com', telefone: '', cargo: 'vendedor', avatar: 'A', meta_vendas: 100000, meta_leads: 20, meta_conversao: 0.2, ativo: true },
      { id: 2, nome: 'Bruno', email: 'bruno@test.com', telefone: '', cargo: 'sdr', avatar: 'B', meta_vendas: 50000, meta_leads: 30, meta_conversao: 0.1, ativo: true },
    ]
    const chain = mockChain(rows)
    // Override order to return the resolved array directly
    chain.order.mockResolvedValue({ data: rows, error: null })
    tableChains['vendedores'] = chain

    const vendedores = await db.fetchVendedores()
    expect(vendedores).toHaveLength(2)
    expect(vendedores[0].nome).toBe('Ana')
    expect(vendedores[1].cargo).toBe('sdr')
  })

  it('insertVendedor insere e retorna Vendedor', async () => {
    const newRow = { id: 5, nome: 'Carlos', email: 'carlos@test.com', telefone: '', cargo: 'vendedor', avatar: 'C', meta_vendas: 0, meta_leads: 0, meta_conversao: 0, ativo: true }
    const chain = mockChain(newRow)
    tableChains['vendedores'] = chain

    const v = await db.insertVendedor({
      nome: 'Carlos', email: 'carlos@test.com', telefone: '', cargo: 'vendedor',
      avatar: 'C', metaVendas: 0, metaLeads: 0, metaConversao: 0, ativo: true, usuario: 'carlos@test.com',
    })
    expect(v.id).toBe(5)
    expect(v.nome).toBe('Carlos')
    expect(chain.insert).toHaveBeenCalled()
  })

  it('updateVendedor chama update com campos corretos', async () => {
    const chain = mockChain()
    chain.eq.mockResolvedValue({ error: null })
    tableChains['vendedores'] = chain

    await db.updateVendedor(1, { nome: 'Novo Nome', metaVendas: 200000 })
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Novo Nome',
      meta_vendas: 200000,
    }))
    expect(chain.eq).toHaveBeenCalledWith('id', 1)
  })
})

describe('database.ts — Clientes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(tableChains).forEach(k => delete tableChains[k])
  })

  it('insertCliente insere e retorna Cliente mapeado', async () => {
    const returnRow = {
      id: 42, razao_social: 'Nova Empresa', cnpj: '12.345.678/0001-95',
      contato_nome: 'João', contato_telefone: '(31) 99999-0000', contato_email: 'joao@test.com',
      etapa: 'prospecção', vendedor_id: 1, score: 0, dias_inativo: 0,
      produtos_interesse: [], valor_estimado: 50000,
    }
    const chain = mockChain(returnRow)
    tableChains['clientes'] = chain

    const c = await db.insertCliente({
      razaoSocial: 'Nova Empresa', cnpj: '12.345.678/0001-95',
      contatoNome: 'João', contatoTelefone: '(31) 99999-0000', contatoEmail: 'joao@test.com',
      etapa: 'prospecção', vendedorId: 1,
    } as any)

    expect(c.id).toBe(42)
    expect(c.razaoSocial).toBe('Nova Empresa')
    expect(chain.insert).toHaveBeenCalled()
  })

  it('updateCliente chama update com campos mapeados para snake_case', async () => {
    const chain = mockChain()
    chain.eq.mockResolvedValue({ error: null })
    tableChains['clientes'] = chain

    await db.updateCliente(1, { etapa: 'amostra', valorEstimado: 150000, diasInativo: 10 })

    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      etapa: 'amostra',
      valor_estimado: 150000,
      dias_inativo: 10,
      updated_at: expect.any(String),
    }))
  })

  it('deleteCliente deleta dados relacionados em cascata', async () => {
    const chain = mockChain()
    chain.eq.mockResolvedValue({ data: [], error: null })
    // Para todas as tabelas (historico, interacoes, tarefas, pedidos, clientes)
    mockFrom.mockReturnValue(chain)

    await db.deleteCliente(99)

    // Should call from() for multiple tables
    expect(mockFrom).toHaveBeenCalledWith('historico_etapas')
    expect(mockFrom).toHaveBeenCalledWith('interacoes')
    expect(mockFrom).toHaveBeenCalledWith('tarefas')
    expect(mockFrom).toHaveBeenCalledWith('clientes')
  })

  it('insertHistoricoEtapa insere com campos corretos', async () => {
    const chain = mockChain()
    chain.insert.mockResolvedValue({ error: null })
    tableChains['historico_etapas'] = chain
    mockFrom.mockImplementation((t: string) => tableChains[t] || mockChain())

    await db.insertHistoricoEtapa(1, { etapa: 'amostra', data: '2025-02-01T10:00:00Z', de: 'prospecção' })

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      cliente_id: 1,
      etapa: 'amostra',
      etapa_anterior: 'prospecção',
    }))
  })
})

describe('database.ts — Interações', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(tableChains).forEach(k => delete tableChains[k])
  })

  it('insertInteracao insere e retorna Interacao mapeada', async () => {
    const returnRow = {
      id: 100, cliente_id: 1, tipo: 'email', assunto: 'Teste', descricao: 'Desc',
      created_at: '2025-02-01T10:00:00Z', automatico: false,
    }
    const chain = mockChain(returnRow)
    tableChains['interacoes'] = chain

    const i = await db.insertInteracao({
      clienteId: 1, tipo: 'email', assunto: 'Teste', descricao: 'Desc',
      data: '2025-02-01', automatico: false,
    })

    expect(i.id).toBe(100)
    expect(i.clienteId).toBe(1)
    expect(i.tipo).toBe('email')
  })
})

describe('database.ts — Tarefas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(tableChains).forEach(k => delete tableChains[k])
  })

  it('insertTarefa insere e retorna Tarefa mapeada', async () => {
    const returnRow = {
      id: 50, titulo: 'Follow-up', descricao: '', data: '2025-02-15', hora: '10:00',
      tipo: 'ligacao', status: 'pendente', prioridade: 'media', cliente_id: 1, vendedor_id: 1,
    }
    const chain = mockChain(returnRow)
    tableChains['tarefas'] = chain

    const t = await db.insertTarefa({
      titulo: 'Follow-up', descricao: '', data: '2025-02-15', hora: '10:00',
      tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId: 1, vendedorId: 1,
    })

    expect(t.id).toBe(50)
    expect(t.titulo).toBe('Follow-up')
    expect(t.clienteId).toBe(1)
  })

  it('updateTarefa chama update com campos mapeados', async () => {
    const chain = mockChain()
    chain.eq.mockResolvedValue({ error: null })
    tableChains['tarefas'] = chain
    mockFrom.mockImplementation((t: string) => tableChains[t] || mockChain())

    await db.updateTarefa(50, { status: 'concluida', prioridade: 'alta' })

    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'concluida',
      prioridade: 'alta',
    }))
  })

  it('deleteTarefa chama delete com eq correto', async () => {
    const chain = mockChain()
    chain.eq.mockResolvedValue({ error: null })
    tableChains['tarefas'] = chain
    mockFrom.mockImplementation((t: string) => tableChains[t] || mockChain())

    await db.deleteTarefa(50)

    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 50)
  })
})

describe('database.ts — Produtos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(tableChains).forEach(k => delete tableChains[k])
  })

  it('insertProduto insere e retorna Produto mapeado', async () => {
    const returnRow = {
      id: 10, nome: 'Sacaria PP', descricao: 'Saco de polipropileno', categoria: 'Sacaria',
      preco: 25.50, unidade: 'kg', foto: '', sku: 'SAC-001', estoque: 1000,
      peso_kg: 0.5, margem_lucro: 0.35, ativo: true, destaque: false, created_at: '2025-01-01',
    }
    const chain = mockChain(returnRow)
    tableChains['produtos'] = chain

    const p = await db.insertProduto({
      nome: 'Sacaria PP', descricao: 'Saco de polipropileno', categoria: 'Sacaria',
      preco: 25.50, unidade: 'kg', foto: '', sku: 'SAC-001', estoque: 1000,
      pesoKg: 0.5, margemLucro: 0.35, ativo: true, destaque: false,
    } as any)

    expect(p.id).toBe(10)
    expect(p.nome).toBe('Sacaria PP')
    expect(p.pesoKg).toBe(0.5)
  })

  it('updateProduto mapeia camelCase para snake_case', async () => {
    const chain = mockChain()
    chain.eq.mockResolvedValue({ error: null })
    tableChains['produtos'] = chain
    mockFrom.mockImplementation((t: string) => tableChains[t] || mockChain())

    await db.updateProduto(10, { nome: 'Novo Nome', preco: 30, pesoKg: 0.8, margemLucro: 0.4 })

    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Novo Nome',
      preco: 30,
      peso_kg: 0.8,
      margem_lucro: 0.4,
    }))
  })

  it('deleteProduto chama delete com eq correto', async () => {
    const chain = mockChain()
    chain.eq.mockResolvedValue({ error: null })
    tableChains['produtos'] = chain
    mockFrom.mockImplementation((t: string) => tableChains[t] || mockChain())

    await db.deleteProduto(10)

    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 10)
  })
})

describe('database.ts — Notificações', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(tableChains).forEach(k => delete tableChains[k])
  })

  it('insertNotificacao insere e retorna Notificacao mapeada', async () => {
    const returnRow = {
      id: 200, tipo: 'success', titulo: 'Teste', mensagem: 'Msg de teste',
      lida: false, cliente_id: 1, created_at: '2025-02-01T10:00:00Z',
    }
    const chain = mockChain(returnRow)
    tableChains['notificacoes'] = chain

    const n = await db.insertNotificacao({
      tipo: 'success', titulo: 'Teste', mensagem: 'Msg de teste', clienteId: 1,
    })

    expect(n.id).toBe(200)
    expect(n.titulo).toBe('Teste')
    expect(n.clienteId).toBe(1)
  })
})

describe('database.ts — Mappers (clienteToDb)', () => {
  it('clienteToDb mapeia camelCase para snake_case corretamente', async () => {
    // We test this indirectly through updateCliente
    const chain = mockChain()
    chain.eq.mockResolvedValue({ error: null })
    tableChains['clientes'] = chain
    mockFrom.mockImplementation((t: string) => tableChains[t] || mockChain())

    await db.updateCliente(1, {
      razaoSocial: 'Teste',
      nomeFantasia: 'Fantasia',
      contatoNome: 'João',
      vendedorId: 5,
      dataEntradaEtapa: '2025-02-01',
      dataEnvioAmostra: '2025-01-15',
      statusAmostra: 'aprovada',
      valorProposta: 150000,
      categoriaPerda: 'preco',
      origemLead: 'indicação',
    })

    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      razao_social: 'Teste',
      nome_fantasia: 'Fantasia',
      contato_nome: 'João',
      vendedor_id: 5,
      data_entrada_etapa: '2025-02-01',
      data_envio_amostra: '2025-01-15',
      status_amostra: 'aprovada',
      valor_proposta: 150000,
      categoria_perda: 'preco',
      origem_lead: 'indicação',
    }))
  })
})
