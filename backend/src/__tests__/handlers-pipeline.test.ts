import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../database.js', () => ({
  fetchClientes: vi.fn(),
  fetchClientesByVendedor: vi.fn(),
}))

import { handlePipeline } from '../handlers/pipeline.js'
import * as db from '../database.js'
import type { Vendedor, Cliente } from '../database.js'

const vendedor: Vendedor = {
  id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '',
  cargo: 'vendedor', avatar: '', metaVendas: 100000, metaLeads: 0, metaConversao: 0, ativo: true,
}

const gerenteVendedor: Vendedor = { ...vendedor, cargo: 'gerente' }

function makeCliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 1, razaoSocial: 'Teste', cnpj: '', contatoNome: '', contatoTelefone: '', contatoEmail: '',
    etapa: 'prospecção', ...overrides,
  }
}

describe('handlePipeline', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sem clientes retorna mensagem vazia', async () => {
    vi.mocked(db.fetchClientesByVendedor).mockResolvedValue([])
    const session = { vendedor, state: 'logged_in' as const, lastActivity: Date.now() }
    const reply = await handlePipeline(session as any)
    expect(reply).toContain('Nenhum cliente')
  })

  it('vendedor busca apenas seus clientes', async () => {
    vi.mocked(db.fetchClientesByVendedor).mockResolvedValue([makeCliente()])
    const session = { vendedor, state: 'logged_in' as const, lastActivity: Date.now() }
    await handlePipeline(session as any)
    expect(db.fetchClientesByVendedor).toHaveBeenCalledWith(1)
    expect(db.fetchClientes).not.toHaveBeenCalled()
  })

  it('gerente busca todos os clientes', async () => {
    vi.mocked(db.fetchClientes).mockResolvedValue([makeCliente()])
    const session = { vendedor: gerenteVendedor, state: 'logged_in' as const, lastActivity: Date.now() }
    await handlePipeline(session as any)
    expect(db.fetchClientes).toHaveBeenCalled()
  })

  it('agrupa e exibe por etapa com valores', async () => {
    const clientes = [
      makeCliente({ id: 1, etapa: 'prospecção', valorEstimado: 10000 }),
      makeCliente({ id: 2, etapa: 'prospecção', valorEstimado: 20000 }),
      makeCliente({ id: 3, etapa: 'negociacao', valorEstimado: 50000 }),
      makeCliente({ id: 4, etapa: 'pos_venda', valorEstimado: 80000 }),
    ]
    vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
    const session = { vendedor, state: 'logged_in' as const, lastActivity: Date.now() }
    const reply = await handlePipeline(session as any)
    expect(reply).toContain('Prospecção')
    expect(reply).toContain('2')
    expect(reply).toContain('Negociação')
    expect(reply).toContain('Total pipeline')
  })

  it('calcula taxa de conversão', async () => {
    const clientes = [
      makeCliente({ id: 1, etapa: 'prospecção' }),
      makeCliente({ id: 2, etapa: 'pos_venda' }),
    ]
    vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
    const session = { vendedor, state: 'logged_in' as const, lastActivity: Date.now() }
    const reply = await handlePipeline(session as any)
    expect(reply).toContain('Taxa conversão')
    expect(reply).toContain('50')
  })

  it('mostra progresso da meta quando vendedor tem meta > 0', async () => {
    const clientes = [
      makeCliente({ id: 1, etapa: 'pos_venda', valorEstimado: 50000 }),
    ]
    vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
    const session = { vendedor: { ...vendedor, metaVendas: 100000 }, state: 'logged_in' as const, lastActivity: Date.now() }
    const reply = await handlePipeline(session as any)
    expect(reply).toContain('Meta vendas')
    expect(reply).toContain('50%')
  })
})
