import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock database before importing bot
vi.mock('../database.js', () => ({
  signIn: vi.fn(),
  getVendedorByAuthId: vi.fn(),
  fetchClientes: vi.fn().mockResolvedValue([]),
  fetchClientesByVendedor: vi.fn().mockResolvedValue([]),
  fetchClienteById: vi.fn(),
  fetchClientesByIds: vi.fn().mockResolvedValue([]),
  fetchTarefasByVendedor: vi.fn().mockResolvedValue([]),
  searchClientes: vi.fn().mockResolvedValue([]),
  insertCliente: vi.fn(),
  insertInteracao: vi.fn(),
  insertAtividade: vi.fn(),
  insertPedido: vi.fn(),
  fetchProdutosAtivos: vi.fn().mockResolvedValue([]),
  updateTarefaStatus: vi.fn(),
}))

import { handleMessage } from '../bot.js'
import { createSession, deleteSession, getSession } from '../session.js'
import type { Vendedor } from '../database.js'

const vendedor: Vendedor = {
  id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '',
  cargo: 'vendedor', avatar: '', metaVendas: 50000, metaLeads: 0, metaConversao: 0, ativo: true,
}

const PHONE = '5531900000001'

describe('handleMessage', () => {
  beforeEach(() => {
    deleteSession(PHONE)
  })

  // ─── Sem sessão ───

  it('sem sessão: retorna welcome text', async () => {
    const reply = await handleMessage(PHONE, 'oi')
    expect(reply).toContain('Bem-vindo')
    expect(reply).toContain('login')
  })

  it('sem sessão: "login" sem credenciais retorna formato', async () => {
    const reply = await handleMessage(PHONE, 'login')
    // "login" without space after is not "login " prefix, so returns welcome
    expect(reply).toContain('Bem-vindo')
  })

  // ─── Com sessão ───

  it('com sessão: "menu" retorna menu principal', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, 'menu')
    expect(reply).toContain('Menu Principal')
    // deve resetar state para logged_in
    const s = getSession(PHONE)
    expect(s!.state).toBe('logged_in')
  })

  it('com sessão: "m" retorna menu (atalho)', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, 'm')
    expect(reply).toContain('Menu Principal')
  })

  it('com sessão: "0" faz logout', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, '0')
    expect(reply).toContain('Até logo')
    expect(getSession(PHONE)).toBeNull()
  })

  it('com sessão: "sair" faz logout', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, 'sair')
    expect(reply).toContain('Até logo')
  })

  it('com sessão: "logout" faz logout', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, 'logout')
    expect(reply).toContain('Até logo')
  })

  // ─── Menu commands ───

  it('"1" lista clientes', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, '1')
    // Retorna lista vazia ou lista de clientes
    expect(reply).toContain('clientes')
  })

  it('"2" inicia cadastro de cliente', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, '2')
    expect(reply).toContain('Novo Cliente')
    expect(reply).toContain('Razão Social')
    const s = getSession(PHONE)
    expect(s!.state).toBe('creating_client')
  })

  it('"4" lista tarefas', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, '4')
    // Sem tarefas pendentes
    expect(reply).toContain('tarefa')
  })

  it('"5" mostra pipeline', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, '5')
    expect(reply.toLowerCase()).toContain('pipeline')
  })

  it('"6" inicia busca', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, '6')
    expect(reply).toContain('nome')
    const s = getSession(PHONE)
    expect(s!.state).toBe('searching_client')
  })

  it('comando desconhecido retorna erro + menu', async () => {
    createSession(PHONE, vendedor)
    const reply = await handleMessage(PHONE, 'xyz123')
    expect(reply).toContain('Não entendi')
    expect(reply).toContain('Menu Principal')
  })

  // ─── Rate limiting ───

  it('bloqueia após 30 mensagens por minuto', async () => {
    createSession(PHONE, vendedor)
    // Enviar 30 mensagens rapidamente
    for (let i = 0; i < 30; i++) {
      await handleMessage(PHONE, 'menu')
    }
    // A 31ª deve ser bloqueada
    const reply = await handleMessage(PHONE, 'menu')
    expect(reply).toContain('Muitas mensagens')
  })
})
