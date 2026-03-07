import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../database.js', () => ({
  fetchTarefasByVendedor: vi.fn(),
  fetchClientesByIds: vi.fn(),
  updateTarefaStatus: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { handleTarefas, handleTarefaConcluir } from '../handlers/tarefas.js'
import { createSession, deleteSession, getSession } from '../session.js'
import * as db from '../database.js'
import type { Vendedor, Tarefa, Cliente } from '../database.js'

const vendedor: Vendedor = {
  id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '',
  cargo: 'vendedor', avatar: '', metaVendas: 50000, metaLeads: 0, metaConversao: 0, ativo: true,
}

const PHONE = '5531900000088'

function makeTarefa(id: number, data: string, status: 'pendente' | 'concluida' = 'pendente', clienteId?: number): Tarefa {
  return {
    id, titulo: `Tarefa ${id}`, descricao: `Desc ${id}`, data, hora: '10:00',
    tipo: 'ligacao', status, prioridade: 'media', clienteId, vendedorId: 1,
  }
}

function makeCliente(id: number): Cliente {
  return {
    id, razaoSocial: `Cliente ${id}`, cnpj: '', contatoNome: '', contatoTelefone: '',
    contatoEmail: '', etapa: 'prospecção',
  } as Cliente
}

// Helper: date strings relative to today
const today = new Date().toISOString().split('T')[0]
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

describe('handlers/tarefas', () => {
  beforeEach(() => {
    deleteSession(PHONE)
    vi.clearAllMocks()
  })

  // ─── handleTarefas ───

  describe('handleTarefas', () => {
    it('sem tarefas pendentes retorna mensagem positiva + menu', async () => {
      vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await handleTarefas(PHONE, session)
      expect(reply).toContain('Nenhuma tarefa pendente')
      expect(reply).toContain('Menu Principal')
    })

    it('tarefas concluídas não aparecem', async () => {
      vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue([
        makeTarefa(1, today, 'concluida'),
      ])
      vi.mocked(db.fetchClientesByIds).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await handleTarefas(PHONE, session)
      expect(reply).toContain('Nenhuma tarefa pendente')
    })

    it('mostra tarefas atrasadas com indicador vermelho', async () => {
      vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue([
        makeTarefa(1, twoDaysAgo, 'pendente'),
      ])
      vi.mocked(db.fetchClientesByIds).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await handleTarefas(PHONE, session)
      expect(reply).toContain('Atrasadas')
      expect(reply).toContain('Tarefa 1')
      expect(reply).toContain('atrás')
    })

    it('mostra tarefas de hoje', async () => {
      vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue([
        makeTarefa(2, today, 'pendente'),
      ])
      vi.mocked(db.fetchClientesByIds).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await handleTarefas(PHONE, session)
      expect(reply).toContain('Hoje')
      expect(reply).toContain('Tarefa 2')
    })

    it('mostra tarefas futuras (máx 5)', async () => {
      const futuras = Array.from({ length: 8 }, (_, i) =>
        makeTarefa(i + 10, nextWeek, 'pendente')
      )
      vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue(futuras)
      vi.mocked(db.fetchClientesByIds).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await handleTarefas(PHONE, session)
      expect(reply).toContain('Próximas')
      // Mostra max 5 futuras
      expect(reply).toContain('Tarefa 10')
      expect(reply).toContain('Tarefa 14')
      expect(reply).not.toContain('Tarefa 15')
    })

    it('carrega nomes de clientes em batch', async () => {
      vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue([
        makeTarefa(1, today, 'pendente', 10),
        makeTarefa(2, today, 'pendente', 20),
      ])
      vi.mocked(db.fetchClientesByIds).mockResolvedValue([makeCliente(10), makeCliente(20)])
      const session = createSession(PHONE, vendedor)
      const reply = await handleTarefas(PHONE, session)
      expect(db.fetchClientesByIds).toHaveBeenCalledWith([10, 20])
      expect(reply).toContain('Cliente 10')
      expect(reply).toContain('Cliente 20')
    })

    it('resumo mostra contagem de atrasadas, hoje e próximas', async () => {
      vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue([
        makeTarefa(1, yesterday, 'pendente'),
        makeTarefa(2, today, 'pendente'),
        makeTarefa(3, tomorrow, 'pendente'),
      ])
      vi.mocked(db.fetchClientesByIds).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      const reply = await handleTarefas(PHONE, session)
      expect(reply).toContain('Atrasadas: 1')
      expect(reply).toContain('Hoje: 1')
      expect(reply).toContain('Próximas: 1')
    })

    it('salva IDs e seta state viewing_client_list com listType tarefas', async () => {
      vi.mocked(db.fetchTarefasByVendedor).mockResolvedValue([
        makeTarefa(5, today, 'pendente'),
        makeTarefa(8, tomorrow, 'pendente'),
      ])
      vi.mocked(db.fetchClientesByIds).mockResolvedValue([])
      const session = createSession(PHONE, vendedor)
      await handleTarefas(PHONE, session)
      const s = getSession(PHONE)!
      expect(s.state).toBe('viewing_client_list')
      expect(s.listType).toBe('tarefas')
      expect(s.clientListIds).toEqual([5, 8])
    })
  })

  // ─── handleTarefaConcluir ───

  describe('handleTarefaConcluir', () => {
    it('número válido marca tarefa como concluída', async () => {
      vi.mocked(db.updateTarefaStatus).mockResolvedValue(undefined)
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [5, 8, 12]
      const reply = await handleTarefaConcluir(PHONE, session, '2')
      expect(reply).toContain('concluída')
      expect(reply).toContain('#2')
      expect(db.updateTarefaStatus).toHaveBeenCalledWith(8, 'concluida')
      const s = getSession(PHONE)!
      expect(s.state).toBe('logged_in')
    })

    it('número inválido (NaN) retorna erro', async () => {
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [5]
      const reply = await handleTarefaConcluir(PHONE, session, 'abc')
      expect(reply).toContain('inválido')
      expect(reply).toContain('Menu Principal')
    })

    it('número fora do range retorna erro', async () => {
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [5, 8]
      const reply = await handleTarefaConcluir(PHONE, session, '99')
      expect(reply).toContain('inválido')
    })

    it('número 0 retorna erro', async () => {
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [5]
      const reply = await handleTarefaConcluir(PHONE, session, '0')
      expect(reply).toContain('inválido')
    })

    it('erro no DB retorna mensagem de erro', async () => {
      vi.mocked(db.updateTarefaStatus).mockRejectedValue(new Error('DB error'))
      const session = createSession(PHONE, vendedor)
      session.clientListIds = [5]
      const reply = await handleTarefaConcluir(PHONE, session, '1')
      expect(reply).toContain('Erro')
    })
  })
})
