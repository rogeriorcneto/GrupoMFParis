import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Supabase chain mock — thenable flexível por tabela
// ============================================================
const db: Record<string, any> = {
  pedidos_list: [],
  clientes_row: null,
  cliente_full: { razao_social: 'CLIENTE TESTE' },
  tarefas_existentes: [],
}
const inserted: Record<string, any[]> = { notificacoes: [], tarefas: [] }
const updates: { table: string; data: any; id: any }[] = []

function thenable(result: any) {
  return { then: (resolve: any) => Promise.resolve(resolve(result)) }
}

function chainFor(table: string): any {
  const q: any = {}
  const resolveList = () => {
    if (table === 'pedidos') return { data: db.pedidos_list, error: null }
    if (table === 'tarefas') return { data: db.tarefas_existentes, error: null }
    return { data: [], error: null }
  }
  for (const m of ['select', 'not', 'in', 'eq', 'ilike', 'order', 'limit']) {
    q[m] = vi.fn(() => q)
  }
  q.then = (resolve: any) => Promise.resolve(resolve(resolveList()))
  q.maybeSingle = vi.fn(async () => {
    if (table === 'clientes') return { data: db.clientes_row, error: null }
    return { data: null, error: null }
  })
  q.single = vi.fn(async () => {
    if (table === 'clientes') return { data: db.cliente_full, error: null }
    return { data: null, error: null }
  })
  return q
}

const mockFrom = vi.fn((table: string) => ({
  select: vi.fn(() => chainFor(table)),
  update: vi.fn((data: any) => {
    const q = chainFor(table)
    q.eq = vi.fn((_col: string, id: any) => { updates.push({ table, data, id }); return thenable({ error: null }) })
    return q
  }),
  insert: vi.fn((row: any) => {
    inserted[table] = inserted[table] || []
    inserted[table].push(row)
    return thenable({ error: null })
  }),
}))

vi.mock('../supabase.js', () => ({ supabase: { from: (t: string) => mockFrom(t) } }))
vi.mock('../config-store.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ omieAppKey: 'ENC:k', omieAppSecret: 'ENC:s', omieEmpresas: [] }),
}))
vi.mock('../crypto.js', () => ({
  encrypt: (t: string) => `ENC:${t}`,
  decrypt: (t: string) => (t.startsWith('ENC:') ? t.slice(4) : t),
}))
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() } }))

const mockOmieCall = vi.fn()
vi.mock('../omie/client.js', () => ({
  omieCall: (...args: any[]) => mockOmieCall(...args),
  getOmieCredentials: vi.fn().mockResolvedValue({ appKey: 'k', appSecret: 's' }),
  getOmieEmpresas: vi.fn().mockResolvedValue([{ appKey: 'k', appSecret: 's' }]),
}))

import { syncOmieLogistics } from '../omie/sync-logistics.js'

function omiePedido(etapa: string, extras: any = {}) {
  return {
    cabecalho: {
      codigo_pedido: 9680000000, numero_pedido: '1', etapa,
      codigo_pedido_integracao: 'CRM-PED-1', data_previsao: '01/03/2026', ...extras.cabecalho,
    },
    infoCadastro: { nNumeroNF: 1234, dDataFaturamento: '10/02/2026', ...extras.infoCadastro },
    transporte: { codigo_rastreio: 'BR12345', ...extras.transporte },
  }
}

function pedidoRow(extra: any = {}) {
  return { id: 1, numero: 'P-1', cliente_id: 10, tipo: 'venda', status: 'confirmado', omie_codigo: 9680000000, omie_numero: 1, omie_status: 'enviado', ...extra }
}

describe('syncOmieLogistics (por pedido)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.pedidos_list = []
    db.clientes_row = { id: 10, etapa: 'follow_up', status_follow_up: 'pedido_aprovado', status_amostra: null, omie_status_logistico: null, omie_codigo_rastreio: null, omie_nota_fiscal: null, omie_data_faturamento: null, vendedor_id: 5 }
    db.tarefas_existentes = []
    inserted.notificacoes = []
    inserted.tarefas = []
    updates.length = 0
    mockOmieCall.mockResolvedValue(omiePedido('80'))
  })

  it('sem pedidos vinculados retorna zeros', async () => {
    const r = await syncOmieLogistics()
    expect(r).toEqual({ atualizados: 0, semPedidoOmie: 0, naoEncontrados: 0, erros: [] })
    expect(mockOmieCall).not.toHaveBeenCalled()
  })

  it('pedido venda etapa 80 → omie_status=entregue + status_follow_up=entregue', async () => {
    db.pedidos_list = [pedidoRow()]
    const r = await syncOmieLogistics()
    expect(r.atualizados).toBe(1)
    expect(updates.find(u => u.table === 'pedidos' && u.data.omie_status === 'entregue')).toBeTruthy()
    const cu = updates.find(u => u.table === 'clientes')
    expect(cu?.data.status_follow_up).toBe('entregue')
    expect(cu?.data.omie_status_logistico).toBe('80')
    expect(cu?.data.omie_nota_fiscal).toBe('1234')
    expect(cu?.data.omie_codigo_rastreio).toBe('BR12345')
    expect(cu?.data.omie_data_faturamento).toBe('2026-02-10')
    expect(cu?.data.data_entrega_prevista).toBe('2026-03-01')
  })

  it('etapa 70 → expedido; 20 → em_producao; 50 → faturado; 10 → pedido_aprovado', async () => {
    for (const [etapa, esperado] of [['70', 'expedido'], ['20', 'em_producao'], ['50', 'faturado'], ['10', 'pedido_aprovado']] as const) {
      updates.length = 0
      mockOmieCall.mockResolvedValue(omiePedido(etapa))
      db.pedidos_list = [pedidoRow()]
      db.clientes_row = { ...db.clientes_row, status_follow_up: null }
      await syncOmieLogistics()
      expect(updates.find(u => u.table === 'pedidos')?.data.omie_status).toBe(esperado)
      expect(updates.find(u => u.table === 'clientes')?.data.status_follow_up).toBe(esperado)
    }
  })

  it('bonificação em card de amostra atualiza status_amostra (não follow_up)', async () => {
    db.pedidos_list = [pedidoRow({ tipo: 'bonificacao' })]
    db.clientes_row = { ...db.clientes_row, etapa: 'amostra', status_amostra: 'liberada' }
    await syncOmieLogistics()
    const cu = updates.find(u => u.table === 'clientes')
    expect(cu?.data.status_amostra).toBe('entregue')
    expect(cu?.data.status_follow_up).toBeUndefined()
  })

  it('etapa cancelada (00) marca pedido e card como cancelado', async () => {
    mockOmieCall.mockResolvedValue(omiePedido('00'))
    db.pedidos_list = [pedidoRow()]
    await syncOmieLogistics()
    const pu = updates.find(u => u.table === 'pedidos')
    expect(pu?.data.omie_status).toBe('cancelado')
    expect(pu?.data.status).toBe('cancelado')
    const cu = updates.find(u => u.table === 'clientes')
    expect(cu?.data.status_follow_up).toBe('cancelado')
  })

  it('infoCadastro.cancelado=S com etapa normal (60) também marca cancelado', async () => {
    // Caso real: pedido faturado (etapa 60) depois cancelado — Omie mantém a
    // etapa e sinaliza só em infoCadastro.cancelado.
    mockOmieCall.mockResolvedValue(omiePedido('60', { infoCadastro: { cancelado: 'S' } }))
    db.pedidos_list = [pedidoRow({ omie_status: 'faturado' })]
    db.clientes_row = { ...db.clientes_row, status_follow_up: 'faturado' }
    await syncOmieLogistics()
    const pu = updates.find(u => u.table === 'pedidos')
    expect(pu?.data.omie_status).toBe('cancelado')
    expect(pu?.data.status).toBe('cancelado')
    expect(updates.find(u => u.table === 'clientes')?.data.status_follow_up).toBe('cancelado')
  })

  it('pedido não encontrado em nenhuma empresa → naoEncontrados', async () => {
    mockOmieCall.mockRejectedValue(new Error('Pedido não cadastrado'))
    db.pedidos_list = [pedidoRow()]
    const r = await syncOmieLogistics()
    expect(r.naoEncontrados).toBe(1)
    // marca o pedido como nao_encontrado para sair da fila (evita erro repetido/loop de bloqueio Omie)
    expect(updates.find(u => u.table === 'pedidos')?.data.omie_status).toBe('nao_encontrado')
  })

  it('erro transitório (não "não cadastrado") não marca nem sai da fila', async () => {
    mockOmieCall.mockRejectedValue(new Error('Omie bloqueou requisições por excesso de erros'))
    db.pedidos_list = [pedidoRow()]
    const r = await syncOmieLogistics()
    expect(r.naoEncontrados).toBe(0)
    expect(r.erros).toHaveLength(1)
    expect(updates.filter(u => u.table === 'pedidos')).toHaveLength(0)
  })

  it('sem mudança de status não insere notificação/tarefa (idempotente)', async () => {
    mockOmieCall.mockResolvedValue(omiePedido('80'))
    db.pedidos_list = [pedidoRow({ omie_status: 'entregue' })]
    db.clientes_row = { ...db.clientes_row, status_follow_up: 'entregue', omie_status_logistico: '80', omie_codigo_rastreio: 'BR12345', omie_nota_fiscal: '1234', omie_data_faturamento: '10/02/2026' }
    await syncOmieLogistics()
    expect(inserted.notificacoes).toHaveLength(0)
    expect(inserted.tarefas).toHaveLength(0)
  })

  it('entregue cria notificação + tarefa de satisfação uma única vez', async () => {
    db.pedidos_list = [pedidoRow()]
    await syncOmieLogistics()
    expect(inserted.notificacoes).toHaveLength(1)
    expect(inserted.tarefas).toHaveLength(1)
    expect(inserted.tarefas[0].titulo).toContain('Coletar satisfação')
    expect(inserted.tarefas[0].vendedor_id).toBe(5)
    expect(inserted.notificacoes[0].vendedor_id).toBe(5)
  })

  it('tarefa de satisfação não duplica quando já existe pendente', async () => {
    db.tarefas_existentes = [{ id: 99 }]
    db.pedidos_list = [pedidoRow()]
    await syncOmieLogistics()
    expect(inserted.tarefas).toHaveLength(0)
  })
})
