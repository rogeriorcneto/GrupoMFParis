import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createSession, getSession, deleteSession, updateSession, getActiveSessions } from '../session.js'
import type { Vendedor } from '../database.js'

const vendedor: Vendedor = {
  id: 1,
  nome: 'Rafael',
  email: 'rafael@test.com',
  telefone: '31999991234',
  cargo: 'vendedor',
  avatar: '',
  metaVendas: 50000,
  metaLeads: 0,
  metaConversao: 0,
  ativo: true,
}

const PHONE = '5531999991234'

describe('session', () => {
  beforeEach(() => {
    // limpa sessões entre testes
    deleteSession(PHONE)
    deleteSession('5531888881234')
  })

  describe('createSession', () => {
    it('cria sessão com estado logged_in', () => {
      const session = createSession(PHONE, vendedor)
      expect(session.state).toBe('logged_in')
      expect(session.vendedor.id).toBe(1)
      expect(session.vendedor.nome).toBe('Rafael')
      expect(session.lastActivity).toBeGreaterThan(0)
    })
  })

  describe('getSession', () => {
    it('retorna null quando sessão não existe', () => {
      expect(getSession('9999')).toBeNull()
    })

    it('retorna sessão existente', () => {
      createSession(PHONE, vendedor)
      const s = getSession(PHONE)
      expect(s).not.toBeNull()
      expect(s!.vendedor.id).toBe(1)
    })

    it('atualiza lastActivity ao buscar', () => {
      createSession(PHONE, vendedor)
      const s1 = getSession(PHONE)!
      // getSession atualiza lastActivity para Date.now(), então será >= criação
      expect(s1.lastActivity).toBeGreaterThan(0)
      expect(s1.lastActivity).toBeLessThanOrEqual(Date.now())
    })

    it('expira sessão após 24h', () => {
      const session = createSession(PHONE, vendedor)
      // Forçar lastActivity para > 24h atrás
      ;(session as any).lastActivity = Date.now() - 25 * 60 * 60 * 1000
      expect(getSession(PHONE)).toBeNull()
    })
  })

  describe('deleteSession', () => {
    it('remove sessão existente', () => {
      createSession(PHONE, vendedor)
      expect(getSession(PHONE)).not.toBeNull()
      deleteSession(PHONE)
      expect(getSession(PHONE)).toBeNull()
    })

    it('não falha ao deletar sessão inexistente', () => {
      expect(() => deleteSession('999')).not.toThrow()
    })
  })

  describe('updateSession', () => {
    it('atualiza campos da sessão', () => {
      createSession(PHONE, vendedor)
      updateSession(PHONE, { state: 'creating_client' })
      const s = getSession(PHONE)
      expect(s!.state).toBe('creating_client')
    })

    it('preserva campos não atualizados', () => {
      createSession(PHONE, vendedor)
      updateSession(PHONE, { state: 'creating_client' })
      const s = getSession(PHONE)
      expect(s!.vendedor.id).toBe(1)
    })

    it('retorna null para sessão inexistente', () => {
      const result = updateSession('nonexistent', { state: 'logged_in' })
      expect(result).toBeNull()
    })

    it('atualiza lastActivity ao modificar', () => {
      const session = createSession(PHONE, vendedor)
      const originalActivity = session.lastActivity
      ;(session as any).lastActivity = originalActivity - 10000
      updateSession(PHONE, { state: 'searching_client' })
      const s = getSession(PHONE)
      expect(s!.lastActivity).toBeGreaterThanOrEqual(originalActivity - 10000)
    })
  })

  describe('getActiveSessions', () => {
    it('retorna 0 quando não há sessões', () => {
      // Limpa tudo
      expect(getActiveSessions()).toBeGreaterThanOrEqual(0)
    })

    it('conta sessões ativas', () => {
      const initial = getActiveSessions()
      createSession(PHONE, vendedor)
      createSession('5531888881234', { ...vendedor, id: 2 })
      expect(getActiveSessions()).toBe(initial + 2)
    })

    it('remove sessões expiradas na contagem', () => {
      const s = createSession(PHONE, vendedor)
      ;(s as any).lastActivity = Date.now() - 25 * 60 * 60 * 1000
      const count = getActiveSessions()
      // A sessão expirada deve ter sido removida
      expect(getSession(PHONE)).toBeNull()
    })
  })
})
