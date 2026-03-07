import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../database.js', () => ({
  fetchClientes: vi.fn(),
  fetchClientesByVendedor: vi.fn(),
  fetchClienteById: vi.fn(),
  fetchClientesByIds: vi.fn(),
  searchClientes: vi.fn(),
  insertCliente: vi.fn(),
  insertInteracao: vi.fn(),
  insertAtividade: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import {
  handleListClientes,
  handleClientListNavigation,
  startCreateClient,
  handleCreateClientStep,
  startSearch,
  handleSearch,
} from '../handlers/clientes.js'
import { createSession, deleteSession, getSession, updateSession } from '../session.js'
import * as db from '../database.js'
import type { Vendedor, Cliente } from '../database.js'

const vendedor: Vendedor = {
  id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '',
  cargo: 'vendedor', avatar: '', metaVendas: 50000, metaLeads: 0, metaConversao: 0, ativo: true,
}

const gerente: Vendedor = {
  id: 2, nome: 'Carlos', email: 'carlos@test.com', telefone: '',
  cargo: 'gerente', avatar: '', metaVendas: 100000, metaLeads: 0, metaConversao: 0, ativo: true,
}

const PHONE = '5531900000099'

function makeCliente(id: number, etapa = 'prospecção', vendedorId = 1): Cliente {
  return {
    id, razaoSocial: `Cliente ${id}`, cnpj: `0000000000${id}`, contatoNome: `Contato ${id}`,
    contatoTelefone: '31999990000', contatoEmail: `c${id}@test.com`, etapa,
    score: id * 10, valorEstimado: id * 1000, vendedorId, diasInativo: 0,
  } as Cliente
}

describe('handlers/clientes', () => {
  beforeEach(() => {
    deleteSession(PHONE)
    vi.clearAllMocks()
  })

  // ─── handleListClientes ───

  describe('handleListClientes', () => {
    it('sem clientes ativos retorna mensagem + menu', async () => {
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await handleListClientes(PHONE, session)
      expect(reply).toContain('não tem clientes ativos')
      expect(reply).toContain('Menu Principal')
    })

    it('lista clientes ativos (exclui perdidos)', async () => {
      const clientes = [makeCliente(1), makeCliente(2, 'perdido'), makeCliente(3, 'amostra')]
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
      const session = createSession(PHONE, vendedor)
      const reply = await handleListClientes(PHONE, session)
      expect(reply).toContain('2 ativos')
      expect(reply).toContain('Cliente 1')
      expect(reply).toContain('Cliente 3')
      expect(reply).not.toContain('Cliente 2')
    })

    it('gerente busca todos os clientes', async () => {
      vi.mocked(db.fetchClientes).mockResolvedValue([makeCliente(1)])
      const session = createSession(PHONE, gerente)
      await handleListClientes(PHONE, session)
      expect(db.fetchClientes).toHaveBeenCalled()
      expect(db.fetchClientesByVendedor).not.toHaveBeenCalled()
    })

    it('vendedor busca apenas seus clientes', async () => {
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue([makeCliente(1)])
      const session = createSession(PHONE, vendedor)
      await handleListClientes(PHONE, session)
      expect(db.fetchClientesByVendedor).toHaveBeenCalledWith(1)
      expect(db.fetchClientes).not.toHaveBeenCalled()
    })

    it('paginação com 15 clientes mostra 10 na primeira página', async () => {
      const clientes = Array.from({ length: 15 }, (_, i) => makeCliente(i + 1))
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
      const session = createSession(PHONE, vendedor)
      const reply = await handleListClientes(PHONE, session)
      expect(reply).toContain('15 ativos')
      expect(reply).toContain('Página 1/2')
      expect(reply).toContain('*+*')
      expect(reply).toContain('Cliente 1')
      expect(reply).toContain('Cliente 10')
      expect(reply).not.toContain('Cliente 11')
    })

    it('segunda página mostra clientes 11-15', async () => {
      const clientes = Array.from({ length: 15 }, (_, i) => makeCliente(i + 1))
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
      const session = createSession(PHONE, vendedor)
      session.clientListPage = 1
      const reply = await handleListClientes(PHONE, session)
      expect(reply).toContain('Página 2/2')
      expect(reply).toContain('*-*')
      expect(reply).toContain('Cliente 11')
      expect(reply).toContain('Cliente 15')
    })

    it('seta state viewing_client_list e salva IDs', async () => {
      const clientes = [makeCliente(1), makeCliente(3)]
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
      const session = createSession(PHONE, vendedor)
      await handleListClientes(PHONE, session)
      const s = getSession(PHONE)!
      expect(s.state).toBe('viewing_client_list')
      expect(s.clientListIds).toEqual([1, 3])
      expect(s.listType).toBe('clientes')
    })
  })

  // ─── handleClientListNavigation ───

  describe('handleClientListNavigation', () => {
    it('"+" avança para próxima página', async () => {
      const clientes = Array.from({ length: 15 }, (_, i) => makeCliente(i + 1))
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
      const session = createSession(PHONE, vendedor)
      session.clientListIds = clientes.map(c => c.id)
      session.clientListPage = 0
      const reply = await handleClientListNavigation(PHONE, session, '+')
      expect(reply).toContain('Página 2/2')
    })

    it('"+" na última página retorna aviso', async () => {
      const session = createSession(PHONE, vendedor)
      session.clientListIds = Array.from({ length: 5 }, (_, i) => i + 1)
      session.clientListPage = 0
      const reply = await handleClientListNavigation(PHONE, session, '+')
      expect(reply).toContain('última página')
    })

    it('"-" volta para página anterior', async () => {
      const clientes = Array.from({ length: 15 }, (_, i) => makeCliente(i + 1))
      vi.mocked(db.fetchClientesByVendedor).mockResolvedValue(clientes)
      const session = createSession(PHONE, vendedor)
      session.clientListIds = clientes.map(c => c.id)
      session.clientListPage = 1
      const reply = await handleClientListNavigation(PHONE, session, '-')
      expect(reply).toContain('Página 1/2')
    })

    it('"-" na primeira página retorna aviso', async () => {
      const session = createSession(PHONE, vendedor)
      session.clientListIds = Array.from({ length: 15 }, (_, i) => i + 1)
      session.clientListPage = 0
      const reply = await handleClientListNavigation(PHONE, session, '-')
      expect(reply).toContain('primeira página')
    })

    it('número válido mostra detalhes do cliente', async () => {
      const cliente = makeCliente(42, 'amostra')
      vi.mocked(db.fetchClienteById).mockResolvedValue(cliente)
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [42]
      const reply = await handleClientListNavigation(PHONE, session, '1')
      expect(reply).toContain('Cliente 42')
      expect(reply).toContain('Amostra')
    })

    it('número inválido retorna opção inválida + menu', async () => {
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [1, 2]
      const reply = await handleClientListNavigation(PHONE, session, '99')
      expect(reply).toContain('Opção inválida')
      expect(reply).toContain('Menu Principal')
    })

    it('texto não numérico retorna opção inválida', async () => {
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [1]
      const reply = await handleClientListNavigation(PHONE, session, 'abc')
      expect(reply).toContain('Opção inválida')
    })

    it('vendedor não vê cliente de outro vendedor', async () => {
      const cliente = makeCliente(10, 'prospecção', 999)
      vi.mocked(db.fetchClienteById).mockResolvedValue(cliente)
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [10]
      const reply = await handleClientListNavigation(PHONE, session, '1')
      expect(reply).toContain('não encontrado')
    })

    it('gerente vê qualquer cliente', async () => {
      const cliente = makeCliente(10, 'prospecção', 999)
      vi.mocked(db.fetchClienteById).mockResolvedValue(cliente)
      const session = createSession(PHONE, gerente)
      session.clientListIds = [10]
      const reply = await handleClientListNavigation(PHONE, session, '1')
      expect(reply).toContain('Cliente 10')
    })
  })

  // ─── startCreateClient ───

  describe('startCreateClient', () => {
    it('seta state creating_client e retorna prompt razão social', () => {
      createSession(PHONE, vendedor)
      const reply = startCreateClient(PHONE)
      expect(reply).toContain('Novo Cliente')
      expect(reply).toContain('Razão Social')
      const s = getSession(PHONE)!
      expect(s.state).toBe('creating_client')
      expect(s.createClientData?.step).toBe('razaoSocial')
    })
  })

  // ─── handleCreateClientStep ───

  describe('handleCreateClientStep', () => {
    function sessionWithStep(step: string) {
      const session = createSession(PHONE, vendedor)
      session.state = 'creating_client'
      session.createClientData = { step: step as any }
      updateSession(PHONE, { createClientData: session.createClientData })
      return session
    }

    it('cancelar em qualquer step volta ao menu', async () => {
      const session = sessionWithStep('cnpj')
      const reply = await handleCreateClientStep(PHONE, session, 'cancelar')
      expect(reply).toContain('cancelado')
      expect(reply).toContain('Menu Principal')
    })

    it('step razaoSocial → cnpj', async () => {
      const session = sessionWithStep('razaoSocial')
      const reply = await handleCreateClientStep(PHONE, session, 'Empresa XYZ')
      expect(reply).toContain('CNPJ')
      const s = getSession(PHONE)!
      expect(s.createClientData?.razaoSocial).toBe('Empresa XYZ')
      expect(s.createClientData?.step).toBe('cnpj')
    })

    it('step cnpj com "pular" → contatoNome', async () => {
      const session = sessionWithStep('cnpj')
      session.createClientData!.razaoSocial = 'Test'
      const reply = await handleCreateClientStep(PHONE, session, 'pular')
      expect(reply).toContain('contato')
      const s = getSession(PHONE)!
      expect(s.createClientData?.cnpj).toBe('')
      expect(s.createClientData?.step).toBe('contatoNome')
    })

    it('step cnpj com valor → contatoNome', async () => {
      const session = sessionWithStep('cnpj')
      const reply = await handleCreateClientStep(PHONE, session, '12345678000100')
      expect(reply).toContain('contato')
      const s = getSession(PHONE)!
      expect(s.createClientData?.cnpj).toBe('12345678000100')
    })

    it('step contatoNome → contatoTelefone', async () => {
      const session = sessionWithStep('contatoNome')
      const reply = await handleCreateClientStep(PHONE, session, 'João Silva')
      expect(reply).toContain('Telefone')
      const s = getSession(PHONE)!
      expect(s.createClientData?.contatoNome).toBe('João Silva')
    })

    it('step contatoTelefone → contatoEmail', async () => {
      const session = sessionWithStep('contatoTelefone')
      const reply = await handleCreateClientStep(PHONE, session, '31999990000')
      expect(reply).toContain('Email')
      const s = getSession(PHONE)!
      expect(s.createClientData?.contatoTelefone).toBe('31999990000')
    })

    it('step contatoEmail → confirm (mostra resumo)', async () => {
      const session = sessionWithStep('contatoEmail')
      session.createClientData!.razaoSocial = 'Empresa XYZ'
      session.createClientData!.cnpj = '12345678000100'
      session.createClientData!.contatoNome = 'João'
      session.createClientData!.contatoTelefone = '31999990000'
      const reply = await handleCreateClientStep(PHONE, session, 'joao@test.com')
      expect(reply).toContain('Confirme os dados')
      expect(reply).toContain('Empresa XYZ')
      expect(reply).toContain('12345678000100')
      expect(reply).toContain('João')
      expect(reply).toContain('joao@test.com')
      expect(reply).toContain('sim')
    })

    it('step contatoEmail com "pular" → confirm sem email', async () => {
      const session = sessionWithStep('contatoEmail')
      session.createClientData!.razaoSocial = 'Test'
      session.createClientData!.contatoNome = 'A'
      session.createClientData!.contatoTelefone = '1'
      const reply = await handleCreateClientStep(PHONE, session, 'pular')
      expect(reply).toContain('Confirme os dados')
      expect(reply).toContain('—')
    })

    it('confirm "sim" salva cliente e retorna sucesso', async () => {
      vi.mocked(db.insertCliente).mockResolvedValue(makeCliente(99))
      vi.mocked(db.insertInteracao).mockResolvedValue(undefined)
      vi.mocked(db.insertAtividade).mockResolvedValue(undefined)
      const session = sessionWithStep('confirm')
      session.createClientData!.razaoSocial = 'Nova Empresa'
      session.createClientData!.cnpj = '111'
      session.createClientData!.contatoNome = 'Contato'
      session.createClientData!.contatoTelefone = '31999'
      session.createClientData!.contatoEmail = 'x@test.com'
      const reply = await handleCreateClientStep(PHONE, session, 'sim')
      expect(reply).toContain('Cliente cadastrado')
      expect(db.insertCliente).toHaveBeenCalled()
      expect(db.insertInteracao).toHaveBeenCalled()
      expect(db.insertAtividade).toHaveBeenCalled()
      const s = getSession(PHONE)!
      expect(s.state).toBe('logged_in')
    })

    it('confirm "não" cancela', async () => {
      const session = sessionWithStep('confirm')
      session.createClientData!.razaoSocial = 'Test'
      const reply = await handleCreateClientStep(PHONE, session, 'não')
      expect(reply).toContain('cancelado')
    })

    it('confirm com erro no DB retorna erro', async () => {
      vi.mocked(db.insertCliente).mockRejectedValue(new Error('DB error'))
      const session = sessionWithStep('confirm')
      session.createClientData!.razaoSocial = 'Test'
      const reply = await handleCreateClientStep(PHONE, session, 'sim')
      expect(reply).toContain('Erro ao cadastrar')
    })
  })

  // ─── startSearch / handleSearch ───

  describe('startSearch', () => {
    it('seta state searching_client e retorna prompt', () => {
      createSession(PHONE, vendedor)
      const reply = startSearch(PHONE)
      expect(reply).toContain('nome')
      expect(reply).toContain('CNPJ')
      const s = getSession(PHONE)!
      expect(s.state).toBe('searching_client')
    })
  })

  describe('handleSearch', () => {
    it('sem resultados retorna mensagem vazia + menu', async () => {
      vi.mocked(db.searchClientes).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await handleSearch(PHONE, session, 'inexistente')
      expect(reply).toContain('Nenhum resultado')
      expect(reply).toContain('inexistente')
    })

    it('com resultados lista clientes encontrados', async () => {
      vi.mocked(db.searchClientes).mockResolvedValue([makeCliente(5), makeCliente(8)])
      const session = createSession(PHONE, vendedor)
      const reply = await handleSearch(PHONE, session, 'test')
      expect(reply).toContain('Resultados')
      expect(reply).toContain('Cliente 5')
      expect(reply).toContain('Cliente 8')
    })

    it('vendedor busca com filtro de vendedorId', async () => {
      vi.mocked(db.searchClientes).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      await handleSearch(PHONE, session, 'test')
      expect(db.searchClientes).toHaveBeenCalledWith('test', 1)
    })

    it('gerente busca sem filtro de vendedorId', async () => {
      vi.mocked(db.searchClientes).mockResolvedValue([])
      const session = createSession(PHONE, gerente)
      await handleSearch(PHONE, session, 'test')
      expect(db.searchClientes).toHaveBeenCalledWith('test', undefined)
    })

    it('resultados salvam IDs para seleção posterior', async () => {
      vi.mocked(db.searchClientes).mockResolvedValue([makeCliente(3), makeCliente(7)])
      const session = createSession(PHONE, vendedor)
      await handleSearch(PHONE, session, 'test')
      const s = getSession(PHONE)!
      expect(s.state).toBe('viewing_client_list')
      expect(s.clientListIds).toEqual([3, 7])
    })
  })
})
