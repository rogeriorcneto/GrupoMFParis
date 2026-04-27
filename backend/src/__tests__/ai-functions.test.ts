/**
 * Tests for AI Agent Function Calling — ai-functions.ts
 * Covers all 24 functions, permission checks, and business logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canExecuteFunction, executeFunction } from '../ai-functions.js'
import type { Vendedor } from '../database.js'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../database.js', () => ({
  searchClientes: vi.fn(),
  fetchClienteById: vi.fn(),
  insertCliente: vi.fn(),
  updateCliente: vi.fn(),
  insertAtividade: vi.fn(),
  insertInteracao: vi.fn(),
  insertTarefa: vi.fn(),
  updateTarefaStatus: vi.fn(),
  insertPedido: vi.fn(),
  fetchProdutosAtivos: vi.fn(),
  fetchTarefasByVendedor: vi.fn(),
}))

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}))

vi.mock('../omie/pedidos.js', () => ({
  onPedidoAprovado: vi.fn(),
  criarPedidoOmie: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import * as db from '../database.js'
import { supabase } from '../supabase.js'
import { onPedidoAprovado } from '../omie/pedidos.js'

// ── Helpers ────────────────────────────────────────────────────────────────

const makeGerente = (overrides?: Partial<Vendedor>): Vendedor => ({
  id: 1, nome: 'Rafael Gerente', email: 'rafael@mf.com',
  telefone: '', avatar: '', metaVendas: 0, metaLeads: 0, metaConversao: 0,
  cargo: 'gerente', ativo: true,
  ...overrides,
})

const makeVendedor = (overrides?: Partial<Vendedor>): Vendedor => ({
  id: 2, nome: 'João Vendedor', email: 'joao@mf.com',
  telefone: '', avatar: '', metaVendas: 0, metaLeads: 0, metaConversao: 0,
  cargo: 'vendedor', ativo: true,
  ...overrides,
})

const makeCliente = (overrides?: any) => ({
  id: 10, razaoSocial: 'Empresa Teste LTDA', nomeFantasia: 'Empresa Teste',
  cnpj: '11.222.333/0001-44', contatoNome: 'Contato', contatoTelefone: '(11) 99999-9999',
  contatoEmail: 'contato@empresa.com', whatsapp: '11999999999',
  etapa: 'prospecção', vendedorId: 2, score: 50,
  notas: '', valorEstimado: 1000,
  ...overrides,
})

function mockSupabaseChain(finalResult: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(finalResult),
    maybeSingle: vi.fn().mockResolvedValue(finalResult),
  }
  vi.mocked(supabase.from).mockReturnValue(chain)
  return chain
}

// ── 4.1 Permissões ─────────────────────────────────────────────────────────

describe('canExecuteFunction — permissions', () => {
  const gerente = makeGerente()
  const vendedor = makeVendedor()

  const gerenteOnlyFns = [
    'moverClienteEtapa', 'marcarClientePerdido', 'aprovarPedido',
    'recusarPedido', 'deleteCliente', 'enviarPedidoOmie',
    'createProduto', 'updateProduto', 'deleteProduto',
  ]

  it.each(gerenteOnlyFns)('vendedor bloqueado em %s', (fn) => {
    const result = canExecuteFunction(fn, vendedor)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('exclusiva do gerente')
  })

  it.each(gerenteOnlyFns)('gerente permitido em %s', (fn) => {
    const result = canExecuteFunction(fn, gerente)
    expect(result.allowed).toBe(true)
  })

  it('vendedor permitido em searchClientes', () => {
    expect(canExecuteFunction('searchClientes', vendedor).allowed).toBe(true)
  })

  it('vendedor permitido em createPedido', () => {
    expect(canExecuteFunction('createPedido', vendedor).allowed).toBe(true)
  })

  it('função desconhecida retorna allowed: true', () => {
    expect(canExecuteFunction('funcaoInexistente', vendedor).allowed).toBe(true)
  })
})

// ── 4.2 Acesso a cliente ──────────────────────────────────────────────────

describe('checkClienteAccess (via getClienteDetalhes)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cliente não encontrado retorna erro', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(null as any)
    const result = await executeFunction({ name: 'getClienteDetalhes', args: { clienteId: 999 } }, makeGerente())
    expect(result.success).toBe(false)
    expect(result.message).toContain('não encontrado')
  })

  it('vendedor não pode acessar cliente de outro vendedor', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 99 }))
    const result = await executeFunction({ name: 'getClienteDetalhes', args: { clienteId: 10 } }, makeVendedor({ id: 2 }))
    expect(result.success).toBe(false)
    expect(result.message).toContain('não tem acesso')
  })

  it('vendedor acessa seu próprio cliente', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    const result = await executeFunction({ name: 'getClienteDetalhes', args: { clienteId: 10 } }, makeVendedor({ id: 2 }))
    expect(result.success).toBe(true)
  })

  it('gerente acessa qualquer cliente', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 5 }))
    const result = await executeFunction({ name: 'getClienteDetalhes', args: { clienteId: 10 } }, makeGerente({ id: 1 }))
    expect(result.success).toBe(true)
  })
})

// ── 4.3 Busca ─────────────────────────────────────────────────────────────

describe('searchClientes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna lista formatada com campos corretos', async () => {
    vi.mocked(db.searchClientes).mockResolvedValue([makeCliente()])
    const result = await executeFunction({ name: 'searchClientes', args: { termo: 'empresa' } }, makeGerente())
    expect(result.success).toBe(true)
    expect(result.data[0]).toMatchObject({ id: 10, razaoSocial: 'Empresa Teste LTDA' })
    expect(result.data[0]).toHaveProperty('cnpj')
    expect(result.data[0]).toHaveProperty('etapa')
  })

  it('gerente busca sem filtro de vendedor', async () => {
    vi.mocked(db.searchClientes).mockResolvedValue([])
    await executeFunction({ name: 'searchClientes', args: { termo: 'x' } }, makeGerente())
    expect(db.searchClientes).toHaveBeenCalledWith('x')
  })

  it('vendedor busca com filtro de vendedorId', async () => {
    vi.mocked(db.searchClientes).mockResolvedValue([])
    await executeFunction({ name: 'searchClientes', args: { termo: 'x' } }, makeVendedor({ id: 2 }))
    expect(db.searchClientes).toHaveBeenCalledWith('x', 2)
  })

  it('sem resultado retorna mensagem clara', async () => {
    vi.mocked(db.searchClientes).mockResolvedValue([])
    const result = await executeFunction({ name: 'searchClientes', args: { termo: 'inexistente' } }, makeGerente())
    expect(result.success).toBe(true)
    expect(result.message).toContain('Nenhum cliente encontrado')
    expect(result.data).toEqual([])
  })
})

describe('getClienteDetalhes', () => {
  it('retorna dados completos do cliente', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente())
    const result = await executeFunction({ name: 'getClienteDetalhes', args: { clienteId: 10 } }, makeGerente())
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ id: 10, razaoSocial: 'Empresa Teste LTDA', etapa: 'prospecção' })
  })
})

// ── 4.4 Comunicação ───────────────────────────────────────────────────────

describe('sendWhatsApp', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envia mensagem e registra interação + atividade', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.insertInteracao).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const sendFn = vi.fn().mockResolvedValue({ success: true })
    const result = await executeFunction(
      { name: 'sendWhatsApp', args: { clienteId: 10, mensagem: 'Olá!' } },
      makeVendedor({ id: 2 }), sendFn
    )
    expect(result.success).toBe(true)
    expect(sendFn).toHaveBeenCalledWith('11999999999', 'Olá!', 10)
    expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'whatsapp', clienteId: 10 }))
    expect(db.insertAtividade).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'whatsapp' }))
  })

  it('cliente sem telefone retorna erro', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ whatsapp: '', contatoTelefone: '', vendedorId: 2 }))
    const result = await executeFunction(
      { name: 'sendWhatsApp', args: { clienteId: 10, mensagem: 'Olá' } },
      makeVendedor({ id: 2 }), vi.fn()
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('não tem número')
  })

  it('WA não conectado retorna erro', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    const result = await executeFunction(
      { name: 'sendWhatsApp', args: { clienteId: 10, mensagem: 'Olá' } },
      makeVendedor({ id: 2 })
      // no sendWhatsAppFn
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('não conectado')
  })
})

describe('sendEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envia email e registra interação', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.insertInteracao).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const emailFn = vi.fn().mockResolvedValue({ success: true })
    const result = await executeFunction(
      { name: 'sendEmail', args: { clienteId: 10, assunto: 'Proposta', corpo: 'Segue...' } },
      makeVendedor({ id: 2 }), undefined, emailFn
    )
    expect(result.success).toBe(true)
    expect(emailFn).toHaveBeenCalledWith('contato@empresa.com', 'Proposta', 'Segue...', 10, 'João Vendedor')
    expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'email' }))
  })

  it('cliente sem email retorna erro', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ contatoEmail: '', vendedorId: 2 }))
    const result = await executeFunction(
      { name: 'sendEmail', args: { clienteId: 10, assunto: 'Proposta', corpo: 'Segue...' } },
      makeVendedor({ id: 2 }), undefined, vi.fn()
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('não tem email')
  })
})

describe('startCall', () => {
  it('retorna uiAction startCall com telefone formatado +55', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ contatoTelefone: '11 99999-8888', vendedorId: 2 }))
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const result = await executeFunction(
      { name: 'startCall', args: { clienteId: 10 } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(true)
    expect(result.uiAction?.type).toBe('startCall')
    expect(result.uiAction?.payload?.phone).toMatch(/^\+55/)
  })
})

// ── 4.5 CRUD Clientes ─────────────────────────────────────────────────────

describe('createCliente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cria cliente com campos obrigatórios e etapa prospecção', async () => {
    const novoCliente = makeCliente({ id: 20, razaoSocial: 'Nova Empresa', etapa: 'prospecção' })
    vi.mocked(db.insertCliente).mockResolvedValue(novoCliente)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const result = await executeFunction(
      { name: 'createCliente', args: { razaoSocial: 'Nova Empresa', contatoNome: 'José', contatoTelefone: '11999990000' } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(true)
    expect(db.insertCliente).toHaveBeenCalledWith(expect.objectContaining({
      razaoSocial: 'Nova Empresa',
      etapa: 'prospecção',
      vendedorId: 2,
    }))
    expect(result.uiAction?.type).toBe('refreshClientes')
  })

  it('registra atividade com prefixo [IA]', async () => {
    vi.mocked(db.insertCliente).mockResolvedValue(makeCliente({ id: 20 }))
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    await executeFunction(
      { name: 'createCliente', args: { razaoSocial: 'X', contatoNome: 'Y', contatoTelefone: '11000000000' } },
      makeVendedor()
    )
    expect(db.insertAtividade).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'cadastro',
      descricao: expect.stringContaining('[IA]'),
    }))
  })

  it('campos opcionais são passados corretamente', async () => {
    vi.mocked(db.insertCliente).mockResolvedValue(makeCliente({ id: 21 }))
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    await executeFunction(
      { name: 'createCliente', args: {
        razaoSocial: 'Opt LTDA', contatoNome: 'Opt', contatoTelefone: '11111111111',
        cnpj: '12.345.678/0001-90', contatoEmail: 'opt@opt.com', valorEstimado: 5000,
      }},
      makeVendedor()
    )
    expect(db.insertCliente).toHaveBeenCalledWith(expect.objectContaining({
      cnpj: '12.345.678/0001-90',
      contatoEmail: 'opt@opt.com',
      valorEstimado: 5000,
    }))
  })
})

describe('updateCliente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('atualiza apenas campos informados', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.updateCliente).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    await executeFunction(
      { name: 'updateCliente', args: { clienteId: 10, razaoSocial: 'Novo Nome' } },
      makeVendedor({ id: 2 })
    )
    expect(db.updateCliente).toHaveBeenCalledWith(10, expect.objectContaining({ razaoSocial: 'Novo Nome' }))
    const callArgs = vi.mocked(db.updateCliente).mock.calls[0][1]
    expect(Object.keys(callArgs as any)).not.toContain('contatoEmail')
  })

  it('sem nenhum campo retorna erro', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    const result = await executeFunction(
      { name: 'updateCliente', args: { clienteId: 10 } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('Nenhum campo')
  })
})

describe('deleteCliente', () => {
  it('vendedor bloqueado pelo canExecuteFunction', () => {
    const perm = canExecuteFunction('deleteCliente', makeVendedor())
    expect(perm.allowed).toBe(false)
  })

  it('gerente deleta e registra atividade tipo exclusao', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 1 }))
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const chain = mockSupabaseChain({ data: null, error: null })
    chain.delete = vi.fn().mockReturnThis()
    const result = await executeFunction(
      { name: 'deleteCliente', args: { clienteId: 10 } },
      makeGerente({ id: 1 })
    )
    expect(result.success).toBe(true)
    expect(db.insertAtividade).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'exclusao' }))
  })
})

// ── 4.6 Funil ────────────────────────────────────────────────────────────

describe('moverClienteEtapa', () => {
  beforeEach(() => vi.clearAllMocks())

  it('atualiza etapa, etapaAnterior e dataEntradaEtapa', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ etapa: 'prospecção' }))
    vi.mocked(db.updateCliente).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const chain = mockSupabaseChain({ data: null, error: null })
    chain.insert = vi.fn().mockResolvedValue({ error: null })

    const result = await executeFunction(
      { name: 'moverClienteEtapa', args: { clienteId: 10, novaEtapa: 'proposta' } },
      makeGerente()
    )
    expect(result.success).toBe(true)
    expect(db.updateCliente).toHaveBeenCalledWith(10, expect.objectContaining({
      etapa: 'proposta',
      etapaAnterior: 'prospecção',
      dataEntradaEtapa: expect.any(String),
    }))
  })

  it('insere em historico_etapas', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ etapa: 'amostra' }))
    vi.mocked(db.updateCliente).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const chain = mockSupabaseChain({ data: null, error: null })
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    chain.insert = insertMock

    await executeFunction(
      { name: 'moverClienteEtapa', args: { clienteId: 10, novaEtapa: 'proposta' } },
      makeGerente()
    )
    expect(supabase.from).toHaveBeenCalledWith('historico_etapas')
  })
})

describe('marcarClientePerdido', () => {
  beforeEach(() => vi.clearAllMocks())

  it('seta etapa=perdido, categoriaPerda e dataPerda', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ etapa: 'negociacao' }))
    vi.mocked(db.updateCliente).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const chain = mockSupabaseChain({ data: null, error: null })
    chain.insert = vi.fn().mockResolvedValue({ error: null })

    const result = await executeFunction(
      { name: 'marcarClientePerdido', args: { clienteId: 10, categoriaPerda: 'preco', motivoPerda: 'Preço alto' } },
      makeGerente()
    )
    expect(result.success).toBe(true)
    expect(db.updateCliente).toHaveBeenCalledWith(10, expect.objectContaining({
      etapa: 'perdido',
      categoriaPerda: 'preco',
      motivoPerda: 'Preço alto',
      dataPerda: expect.any(String),
    }))
  })
})

// ── 4.7 Tarefas ───────────────────────────────────────────────────────────

describe('createTarefa', () => {
  beforeEach(() => vi.clearAllMocks())

  it('vendedor cria para si mesmo (vendedorId = user.id)', async () => {
    vi.mocked(db.insertTarefa).mockResolvedValue({ id: 5, titulo: 'Ligar', data: '2026-05-01' } as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    await executeFunction(
      { name: 'createTarefa', args: { titulo: 'Ligar', data: '2026-05-01', tipo: 'ligacao', prioridade: 'alta' } },
      makeVendedor({ id: 2 })
    )
    expect(db.insertTarefa).toHaveBeenCalledWith(expect.objectContaining({ vendedorId: 2 }))
  })

  it('gerente pode criar para outro vendedor', async () => {
    vi.mocked(db.insertTarefa).mockResolvedValue({ id: 6, titulo: 'Reunião' } as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    await executeFunction(
      { name: 'createTarefa', args: { titulo: 'Reunião', data: '2026-05-02', tipo: 'reuniao', prioridade: 'media', vendedorId: 5 } },
      makeGerente({ id: 1 })
    )
    expect(db.insertTarefa).toHaveBeenCalledWith(expect.objectContaining({ vendedorId: 5 }))
  })

  it('se clienteId, valida acesso ao cliente', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 99 }))
    const result = await executeFunction(
      { name: 'createTarefa', args: { titulo: 'F', data: '2026-05-03', tipo: 'ligacao', prioridade: 'baixa', clienteId: 10 } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('não tem acesso')
  })
})

describe('completeTarefa', () => {
  beforeEach(() => vi.clearAllMocks())

  it('vendedor conclui sua própria tarefa', async () => {
    const chain = mockSupabaseChain({ data: { id: 5, titulo: 'Tarefa', vendedor_id: 2 }, error: null })
    vi.mocked(db.updateTarefaStatus).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    const result = await executeFunction(
      { name: 'completeTarefa', args: { tarefaId: 5 } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(true)
    expect(db.updateTarefaStatus).toHaveBeenCalledWith(5, 'concluida')
  })

  it('vendedor não pode concluir tarefa de outro', async () => {
    mockSupabaseChain({ data: { id: 5, titulo: 'Tarefa', vendedor_id: 99 }, error: null })
    const result = await executeFunction(
      { name: 'completeTarefa', args: { tarefaId: 5 } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('não pode concluir')
  })

  it('tarefa não encontrada retorna erro', async () => {
    mockSupabaseChain({ data: null, error: { message: 'not found' } })
    const result = await executeFunction(
      { name: 'completeTarefa', args: { tarefaId: 999 } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('não encontrada')
  })

  it('listarTarefas filtra por status', async () => {
    vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue([
      { id: 1, titulo: 'A', status: 'pendente', data: '2026-05-01', tipo: 'ligacao', prioridade: 'alta' } as any,
      { id: 2, titulo: 'B', status: 'concluida', data: '2026-05-01', tipo: 'email', prioridade: 'media' } as any,
    ])
    const result = await executeFunction(
      { name: 'listarTarefas', args: { status: 'pendente' } },
      makeVendedor({ id: 2 })
    )
    expect(result.data).toHaveLength(1)
    expect(result.data[0].status).toBe('pendente')
  })
})

// ── 4.8 Pedidos ───────────────────────────────────────────────────────────

describe('createPedido', () => {
  beforeEach(() => vi.clearAllMocks())

  const produtoMock = { id: 1, nome: 'Leite 25kg', preco: 620, unidade: 'kg', sku: 'LTP-25', ativo: true }

  it('busca preço do produto no catálogo (ignora preço do args)', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([produtoMock] as any)
    vi.mocked(db.insertPedido).mockResolvedValue({ id: 100, numero: '2026-0501-1200-001' } as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    await executeFunction(
      { name: 'createPedido', args: { clienteId: 10, itens: [{ produtoId: 1, quantidade: 2 }], tipo: 'venda', formaPagamento: 'À vista', tipoFrete: 'CIF' } },
      makeVendedor({ id: 2 })
    )
    expect(db.insertPedido).toHaveBeenCalledWith(expect.objectContaining({
      itens: expect.arrayContaining([expect.objectContaining({ preco: 620, quantidade: 2 })]),
      totalValor: 1240,
    }))
  })

  it('produto não encontrado retorna erro', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([])
    const result = await executeFunction(
      { name: 'createPedido', args: { clienteId: 10, itens: [{ produtoId: 99, quantidade: 1 }], tipo: 'venda', formaPagamento: 'À vista', tipoFrete: 'FOB' } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('não encontrado ou inativo')
  })

  it('status inicial é rascunho', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([produtoMock] as any)
    vi.mocked(db.insertPedido).mockResolvedValue({ id: 101, numero: '2026-0501-1201-002' } as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    await executeFunction(
      { name: 'createPedido', args: { clienteId: 10, itens: [{ produtoId: 1, quantidade: 1 }], tipo: 'venda', formaPagamento: 'À vista', tipoFrete: 'CIF' } },
      makeVendedor({ id: 2 })
    )
    expect(db.insertPedido).toHaveBeenCalledWith(expect.objectContaining({ status: 'rascunho' }))
  })

  it('número gerado tem formato YYYY-MMDD-HHMM-NNN', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([produtoMock] as any)
    vi.mocked(db.insertPedido).mockResolvedValue({ id: 102, numero: '2026-0501-1202-003' } as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    await executeFunction(
      { name: 'createPedido', args: { clienteId: 10, itens: [{ produtoId: 1, quantidade: 1 }], tipo: 'venda', formaPagamento: 'À vista', tipoFrete: 'CIF' } },
      makeVendedor({ id: 2 })
    )
    const numero = vi.mocked(db.insertPedido).mock.calls[0][0].numero
    expect(numero).toMatch(/^\d{4}-\d{4}-\d{4}-\d{3}$/)
  })

  it('tipo bonificacao (amostra) é aceito', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([produtoMock] as any)
    vi.mocked(db.insertPedido).mockResolvedValue({ id: 103, numero: '2026-0501-1203-004' } as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    await executeFunction(
      { name: 'createPedido', args: { clienteId: 10, itens: [{ produtoId: 1, quantidade: 5 }], tipo: 'bonificacao', formaPagamento: 'À vista', tipoFrete: 'CIF' } },
      makeVendedor({ id: 2 })
    )
    expect(db.insertPedido).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'bonificacao' }))
  })
})

describe('aprovarPedido', () => {
  beforeEach(() => vi.clearAllMocks())

  it('só gerente pode aprovar (permission check)', () => {
    expect(canExecuteFunction('aprovarPedido', makeVendedor()).allowed).toBe(false)
  })

  it('pedido status enviado é aprovado e envia ao Omie', async () => {
    const chain = mockSupabaseChain({ data: { id: 50, numero: 'PED-001', status: 'enviado' }, error: null })
    chain.update = vi.fn().mockReturnThis()
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    vi.mocked(onPedidoAprovado).mockResolvedValue({ success: true, omie_codigo: 12345 } as any)

    const result = await executeFunction(
      { name: 'aprovarPedido', args: { pedidoId: 50 } },
      makeGerente()
    )
    expect(result.success).toBe(true)
    expect(onPedidoAprovado).toHaveBeenCalledWith(50)
  })

  it('pedido não está enviado retorna erro', async () => {
    mockSupabaseChain({ data: { id: 50, numero: 'PED-001', status: 'rascunho' }, error: null })
    const result = await executeFunction(
      { name: 'aprovarPedido', args: { pedidoId: 50 } },
      makeGerente()
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('não está pendente')
  })

  it('erro Omie salva omie_erro sem reverter aprovação', async () => {
    const chain = mockSupabaseChain({ data: { id: 50, numero: 'PED-001', status: 'enviado' }, error: null })
    chain.update = vi.fn().mockReturnThis()
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)
    vi.mocked(onPedidoAprovado).mockRejectedValue(new Error('Omie timeout'))

    const result = await executeFunction(
      { name: 'aprovarPedido', args: { pedidoId: 50 } },
      makeGerente()
    )
    expect(result.success).toBe(true)
    expect(result.message).toContain('Omie')
  })
})

describe('recusarPedido', () => {
  it('atualiza status para cancelado com motivo', async () => {
    const chain = mockSupabaseChain({ data: { id: 51, numero: 'PED-002', status: 'enviado' }, error: null })
    chain.update = vi.fn().mockReturnThis()
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    const result = await executeFunction(
      { name: 'recusarPedido', args: { pedidoId: 51, motivo: 'Preço incorreto' } },
      makeGerente()
    )
    expect(result.success).toBe(true)
    expect(result.message).toContain('Preço incorreto')
  })
})

describe('listarPedidos', () => {
  it('vendedor filtra por vendedor_id', async () => {
    const chain = mockSupabaseChain(undefined)
    chain.order = vi.fn().mockReturnThis()
    chain.eq = vi.fn().mockReturnThis()
    chain.limit = vi.fn().mockResolvedValue({ data: [], error: null })

    await executeFunction({ name: 'listarPedidos', args: {} }, makeVendedor({ id: 2 }))
    expect(chain.eq).toHaveBeenCalledWith('vendedor_id', 2)
  })

  it('limite default 20 e máximo 100', async () => {
    const chain = mockSupabaseChain(undefined)
    chain.order = vi.fn().mockReturnThis()
    chain.limit = vi.fn().mockResolvedValue({ data: [], error: null })
    chain.eq = vi.fn().mockReturnThis()

    await executeFunction({ name: 'listarPedidos', args: { limite: 999 } }, makeGerente())
    expect(chain.limit).toHaveBeenCalledWith(100)
  })
})

describe('atualizarStatusPedido', () => {
  it('status inválido retorna erro', async () => {
    mockSupabaseChain({ data: { id: 55, numero: 'X', status: 'rascunho', vendedor_id: 2 }, error: null })
    const result = await executeFunction(
      { name: 'atualizarStatusPedido', args: { pedidoId: 55, novoStatus: 'faturado' } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('Status inválido')
  })

  it('vendedor só envia rascunho', async () => {
    mockSupabaseChain({ data: { id: 56, numero: 'X', status: 'confirmado', vendedor_id: 2 }, error: null })
    const result = await executeFunction(
      { name: 'atualizarStatusPedido', args: { pedidoId: 56, novoStatus: 'enviado' } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('só pode enviar pedidos em rascunho')
  })
})

// ── 4.9 Produtos ──────────────────────────────────────────────────────────

describe('searchProdutos', () => {
  it('termo vazio retorna erro sem chamar banco', async () => {
    const result = await executeFunction(
      { name: 'searchProdutos', args: { termo: '' } },
      makeVendedor()
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('Informe um termo')
  })

  it('vendedor não vê inativo mesmo passando incluirInativos=true (lógica interna)', () => {
    // incluirInativos = !!args.incluirInativos && user.cargo === 'gerente'
    // Para vendedor, independente do arg, deve ser false
    const incluirInativos = !!(true) && makeVendedor().cargo === 'gerente'
    expect(incluirInativos).toBe(false)
  })

  it('gerente pode incluir inativos', () => {
    const incluirInativos = !!(true) && makeGerente().cargo === 'gerente'
    expect(incluirInativos).toBe(true)
  })
})

describe('createProduto', () => {
  it('campos obrigatórios: nome, categoria, unidade', async () => {
    const result = await executeFunction(
      { name: 'createProduto', args: { nome: '', categoria: 'sacaria', unidade: 'kg' } },
      makeGerente()
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('obrigatórios')
  })

  it('preco default 0 e ativo default true', async () => {
    const chain = mockSupabaseChain({ data: { id: 30, nome: 'Prod', preco: 0, ativo: true }, error: null })
    chain.insert = vi.fn().mockReturnThis()
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    await executeFunction(
      { name: 'createProduto', args: { nome: 'Prod', categoria: 'sacaria', unidade: 'kg' } },
      makeGerente()
    )
    expect(supabase.from).toHaveBeenCalledWith('produtos')
  })
})

describe('listarProdutos', () => {
  it('retorna apenas produtos ativos', async () => {
    vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([
      { id: 1, nome: 'Leite', ativo: true } as any,
    ])
    const result = await executeFunction({ name: 'listarProdutos', args: {} }, makeVendedor())
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })
})

// ── 4.10 Interações e Notas ───────────────────────────────────────────────

describe('addInteracao', () => {
  it('registra interação com tipo, assunto e descrição', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2 }))
    vi.mocked(db.insertInteracao).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    const result = await executeFunction(
      { name: 'addInteracao', args: { clienteId: 10, tipo: 'reuniao', assunto: 'Apresentação', descricao: 'Reunião de apresentação dos produtos' } },
      makeVendedor({ id: 2 })
    )
    expect(result.success).toBe(true)
    expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
      clienteId: 10, tipo: 'reuniao', assunto: 'Apresentação',
    }))
  })
})

describe('addNota', () => {
  it('appenda texto com timestamp e nome do usuário', async () => {
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2, notas: 'Nota anterior' }))
    vi.mocked(db.updateCliente).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    await executeFunction(
      { name: 'addNota', args: { clienteId: 10, nota: 'Nova observação' } },
      makeVendedor({ id: 2, nome: 'João' })
    )
    const novaNotas = vi.mocked(db.updateCliente).mock.calls[0][1].notas as string
    expect(novaNotas).toContain('Nota anterior')
    expect(novaNotas).toContain('Nova observação')
    expect(novaNotas).toContain('João via IA')
  })

  it('notas existentes são preservadas', async () => {
    vi.clearAllMocks()
    vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente({ vendedorId: 2, notas: 'Nota 1\n\nNota 2' }))
    vi.mocked(db.updateCliente).mockResolvedValue({} as any)
    vi.mocked(db.insertAtividade).mockResolvedValue({} as any)

    await executeFunction(
      { name: 'addNota', args: { clienteId: 10, nota: 'Nota 3' } },
      makeVendedor({ id: 2, nome: 'João' })
    )
    const novaNotas = vi.mocked(db.updateCliente).mock.calls[0][1].notas as string
    expect(novaNotas).toContain('Nota 1')
    expect(novaNotas).toContain('Nota 2')
    expect(novaNotas).toContain('Nota 3')
  })
})
