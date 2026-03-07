import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../database.js', () => ({
  fetchClientes: vi.fn(),
  fetchClientesByVendedor: vi.fn(),
  fetchClienteById: vi.fn(),
  fetchClientesByIds: vi.fn(),
  searchClientes: vi.fn(),
  fetchProdutosAtivos: vi.fn(),
  insertPedido: vi.fn(),
  insertAtividade: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { startCreateSale, handleCreateSaleStep } from '../handlers/vendas.js'
import { createSession, deleteSession, getSession, updateSession } from '../session.js'
import * as db from '../database.js'
import type { Vendedor, Cliente, Produto } from '../database.js'

const vendedor: Vendedor = {
  id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '',
  cargo: 'vendedor', avatar: '', metaVendas: 50000, metaLeads: 0, metaConversao: 0, ativo: true,
}

const gerente: Vendedor = {
  id: 2, nome: 'Carlos', email: 'carlos@test.com', telefone: '',
  cargo: 'gerente', avatar: '', metaVendas: 100000, metaLeads: 0, metaConversao: 0, ativo: true,
}

const PHONE = '5531900000077'

function makeCliente(id: number, etapa = 'prospecção'): Cliente {
  return {
    id, razaoSocial: `Cliente ${id}`, cnpj: `0000000000${id}`, contatoNome: `Contato ${id}`,
    contatoTelefone: '31999990000', contatoEmail: `c${id}@test.com`, etapa,
    score: 50, valorEstimado: 5000, vendedorId: 1,
  } as Cliente
}

function makeProduto(id: number, categoria = 'sacaria'): Produto {
  return {
    id, nome: `Produto ${id}`, descricao: `Desc ${id}`, categoria,
    preco: id * 100, unidade: 'kg', sku: `SKU-${id}`, ativo: true,
  }
}

describe('handlers/vendas', () => {
  beforeEach(() => {
    deleteSession(PHONE)
    vi.clearAllMocks()
  })

  // ─── startCreateSale ───

  describe('startCreateSale', () => {
    it('sem clientes ativos retorna aviso + menu', async () => {
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await startCreateSale(PHONE, session)
      expect(reply).toContain('não tem clientes ativos')
      expect(reply).toContain('Menu Principal')
    })

    it('com clientes ativos mostra lista de seleção', async () => {
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue([makeCliente(1), makeCliente(2)])
      const session = createSession(PHONE, vendedor)
      const reply = await startCreateSale(PHONE, session)
      expect(reply).toContain('Nova Venda')
      expect(reply).toContain('Cliente 1')
      expect(reply).toContain('Cliente 2')
      const s = getSession(PHONE)!
      expect(s.state).toBe('creating_sale')
      expect(s.createSaleData?.step).toBe('selectClient')
    })

    it('exclui clientes perdidos da seleção', async () => {
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue([
        makeCliente(1), makeCliente(2, 'perdido'), makeCliente(3),
      ])
      const session = createSession(PHONE, vendedor)
      const reply = await startCreateSale(PHONE, session)
      expect(reply).toContain('Cliente 1')
      expect(reply).toContain('Cliente 3')
      expect(reply).not.toContain('Cliente 2')
    })

    it('gerente busca todos os clientes', async () => {
      vi.mocked(db.fetchClientes).mockResolvedValue([makeCliente(1)])
      const session = createSession(PHONE, gerente)
      await startCreateSale(PHONE, session)
      expect(db.fetchClientes).toHaveBeenCalled()
    })

    it('paginação com muitos clientes', async () => {
      const clientes = Array.from({ length: 20 }, (_, i) => makeCliente(i + 1))
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
      const session = createSession(PHONE, vendedor)
      const reply = await startCreateSale(PHONE, session)
      expect(reply).toContain('Página 1/')
      expect(reply).toContain('20 clientes')
    })
  })

  // ─── handleCreateSaleStep ───

  describe('handleCreateSaleStep', () => {
    it('cancelar em qualquer step volta ao menu', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectClient', itens: [] }
      const reply = await handleCreateSaleStep(PHONE, session, 'cancelar')
      expect(reply).toContain('cancelada')
      expect(reply).toContain('Menu Principal')
      const s = getSession(PHONE)!
      expect(s.state).toBe('logged_in')
    })

    // ─── selectClient ───

    it('selectClient: "+" avança página', async () => {
      const clientes = Array.from({ length: 20 }, (_, i) => makeCliente(i + 1))
      vi.mocked(db.fetchClientesByIds).mockResolvedValue(clientes)
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectClient', itens: [] }
      session.clientListIds = clientes.map(c => c.id)
      session.clientListPage = 0
      const reply = await handleCreateSaleStep(PHONE, session, '+')
      expect(reply).toContain('Página 2/')
    })

    it('selectClient: "+" na última página retorna aviso', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectClient', itens: [] }
      session.clientListIds = [1, 2, 3]
      session.clientListPage = 0
      const reply = await handleCreateSaleStep(PHONE, session, '+')
      expect(reply).toContain('última página')
    })

    it('selectClient: "-" na primeira página retorna aviso', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectClient', itens: [] }
      session.clientListIds = [1, 2]
      session.clientListPage = 0
      const reply = await handleCreateSaleStep(PHONE, session, '-')
      expect(reply).toContain('primeira página')
    })

    it('selectClient: "buscar" sem termo retorna aviso', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectClient', itens: [] }
      session.clientListIds = [1]
      const reply = await handleCreateSaleStep(PHONE, session, 'buscar ')
      expect(reply).toContain('buscar [nome]')
    })

    it('selectClient: "buscar XYZ" filtra clientes', async () => {
      vi.mocked(db.searchClientes).mockResolvedValue([makeCliente(5)])
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectClient', itens: [] }
      session.clientListIds = [1, 2, 3]
      const reply = await handleCreateSaleStep(PHONE, session, 'buscar XYZ')
      expect(db.searchClientes).toHaveBeenCalledWith('XYZ', 1)
      expect(reply).toContain('Cliente 5')
    })

    it('selectClient: número válido avança para selectProduct', async () => {
      vi.mocked(db.fetchClienteById).mockResolvedValue(makeCliente(1))
      vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([makeProduto(1)])
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectClient', itens: [] }
      session.clientListIds = [1]
      const reply = await handleCreateSaleStep(PHONE, session, '1')
      expect(reply).toContain('Catálogo')
      const s = getSession(PHONE)!
      expect(s.createSaleData?.step).toBe('selectProduct')
      expect(s.createSaleData?.clienteId).toBe(1)
    })

    it('selectClient: número inválido retorna aviso', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectClient', itens: [] }
      session.clientListIds = [1, 2]
      const reply = await handleCreateSaleStep(PHONE, session, '99')
      expect(reply).toContain('inválido')
    })

    // ─── selectProduct ───

    it('selectProduct: formato inválido retorna aviso', async () => {
      vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([makeProduto(1)])
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectProduct', itens: [], productIndexMap: [1] }
      const reply = await handleCreateSaleStep(PHONE, session, 'abc')
      expect(reply).toContain('Formato')
    })

    it('selectProduct: produto e quantidade válidos adiciona item', async () => {
      vi.mocked(db.fetchProdutosAtivos).mockResolvedValue([makeProduto(1)])
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = { step: 'selectProduct', itens: [], productIndexMap: [1] }
      const reply = await handleCreateSaleStep(PHONE, session, '1 50')
      expect(reply).toContain('50x Produto 1')
      expect(reply).toContain('Total')
      const s = getSession(PHONE)!
      expect(s.createSaleData?.step).toBe('addMore')
      expect(s.createSaleData?.itens.length).toBe(1)
    })

    // ─── addMore ───

    it('addMore: "finalizar" avança para observacoes', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = {
        step: 'addMore', itens: [{ produtoId: 1, nomeProduto: 'P1', unidade: 'kg', preco: 100, quantidade: 10 }],
      }
      const reply = await handleCreateSaleStep(PHONE, session, 'finalizar')
      expect(reply).toContain('Observações')
      const s = getSession(PHONE)!
      expect(s.createSaleData?.step).toBe('observacoes')
    })

    it('addMore: "f" também finaliza', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = {
        step: 'addMore', itens: [{ produtoId: 1, nomeProduto: 'P1', unidade: 'kg', preco: 100, quantidade: 10 }],
      }
      const reply = await handleCreateSaleStep(PHONE, session, 'f')
      expect(reply).toContain('Observações')
    })

    // ─── observacoes ───

    it('observacoes: "pular" avança para confirm', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = {
        step: 'observacoes', clienteNome: 'Test',
        itens: [{ produtoId: 1, nomeProduto: 'P1', unidade: 'kg', preco: 100, quantidade: 10 }],
      }
      const reply = await handleCreateSaleStep(PHONE, session, 'pular')
      expect(reply).toContain('Confirme o pedido')
      const s = getSession(PHONE)!
      expect(s.createSaleData?.step).toBe('confirm')
      expect(s.createSaleData?.observacoes).toBe('')
    })

    it('observacoes: texto salva observações', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = {
        step: 'observacoes', clienteNome: 'Test',
        itens: [{ produtoId: 1, nomeProduto: 'P1', unidade: 'kg', preco: 100, quantidade: 10 }],
      }
      const reply = await handleCreateSaleStep(PHONE, session, 'Entregar pela manhã')
      expect(reply).toContain('Entregar pela manhã')
      expect(reply).toContain('Confirme o pedido')
    })

    // ─── confirm ───

    it('confirm "sim" salva pedido como rascunho', async () => {
      vi.mocked(db.insertPedido).mockResolvedValue({
        id: 1, numero: 'PED-001', clienteId: 1, vendedorId: 1,
        itens: [], observacoes: '', status: 'rascunho', dataCriacao: '', totalValor: 1000,
      } as any)
      vi.mocked(db.insertAtividade).mockResolvedValue(undefined)
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = {
        step: 'confirm', clienteId: 1, clienteNome: 'Test',
        itens: [{ produtoId: 1, nomeProduto: 'P1', unidade: 'kg', preco: 100, quantidade: 10 }],
      }
      const reply = await handleCreateSaleStep(PHONE, session, 'sim')
      expect(reply).toContain('Pedido')
      expect(reply).toContain('criado')
      expect(reply).toContain('Rascunho')
      expect(db.insertPedido).toHaveBeenCalled()
      expect(db.insertAtividade).toHaveBeenCalled()
    })

    it('confirm "enviar" salva pedido como enviado', async () => {
      vi.mocked(db.insertPedido).mockResolvedValue({
        id: 1, numero: 'PED-001', clienteId: 1, vendedorId: 1,
        itens: [], observacoes: '', status: 'enviado', dataCriacao: '', totalValor: 1000,
      } as any)
      vi.mocked(db.insertAtividade).mockResolvedValue(undefined)
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = {
        step: 'confirm', clienteId: 1, clienteNome: 'Test',
        itens: [{ produtoId: 1, nomeProduto: 'P1', unidade: 'kg', preco: 100, quantidade: 10 }],
      }
      const reply = await handleCreateSaleStep(PHONE, session, 'enviar')
      expect(reply).toContain('Enviado')
    })

    it('confirm com erro no DB retorna erro', async () => {
      vi.mocked(db.insertPedido).mockRejectedValue(new Error('DB fail'))
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = {
        step: 'confirm', clienteId: 1, clienteNome: 'Test',
        itens: [{ produtoId: 1, nomeProduto: 'P1', unidade: 'kg', preco: 100, quantidade: 10 }],
      }
      const reply = await handleCreateSaleStep(PHONE, session, 'sim')
      expect(reply).toContain('Erro')
    })

    it('confirm com texto aleatório cancela', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_sale'
      session.createSaleData = {
        step: 'confirm', clienteId: 1, clienteNome: 'Test',
        itens: [{ produtoId: 1, nomeProduto: 'P1', unidade: 'kg', preco: 100, quantidade: 10 }],
      }
      const reply = await handleCreateSaleStep(PHONE, session, 'não')
      expect(reply).toContain('cancelada')
    })
  })
})
