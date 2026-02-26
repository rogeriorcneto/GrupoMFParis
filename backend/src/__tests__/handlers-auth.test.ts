import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../database.js', () => ({
  signIn: vi.fn(),
  getVendedorByAuthId: vi.fn(),
}))

import { handleLogin, handleLogout, getMenuText, getWelcomeText } from '../handlers/auth.js'
import { createSession, deleteSession, getSession } from '../session.js'
import * as db from '../database.js'

const PHONE = '5531900000010'

const vendedor = {
  id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '',
  cargo: 'gerente' as const, avatar: '', metaVendas: 50000, metaLeads: 0, metaConversao: 0, ativo: true,
}

describe('handlers/auth', () => {
  beforeEach(() => {
    deleteSession(PHONE)
    vi.clearAllMocks()
  })

  describe('handleLogin', () => {
    it('formato errado (sem email/senha) retorna instrução', async () => {
      const reply = await handleLogin(PHONE, 'login')
      expect(reply).toContain('Formato')
    })

    it('formato errado (só email) retorna instrução', async () => {
      const reply = await handleLogin(PHONE, 'login email@test.com')
      expect(reply).toContain('Formato')
    })

    it('credenciais inválidas retorna erro', async () => {
      vi.mocked(db.signIn).mockRejectedValue(new Error('Invalid login credentials'))
      const reply = await handleLogin(PHONE, 'login wrong@test.com wrongpass')
      expect(reply).toContain('Email ou senha inválidos')
    })

    it('usuário não encontrado na equipe retorna erro', async () => {
      vi.mocked(db.signIn).mockResolvedValue({ user: { id: 'uid-1' } } as any)
      vi.mocked(db.getVendedorByAuthId).mockResolvedValue(null)
      const reply = await handleLogin(PHONE, 'login test@test.com pass123')
      expect(reply).toContain('não encontrado na equipe')
    })

    it('vendedor inativo retorna erro', async () => {
      vi.mocked(db.signIn).mockResolvedValue({ user: { id: 'uid-1' } } as any)
      vi.mocked(db.getVendedorByAuthId).mockResolvedValue({ ...vendedor, ativo: false })
      const reply = await handleLogin(PHONE, 'login test@test.com pass123')
      expect(reply).toContain('desativada')
    })

    it('login OK cria sessão e retorna menu', async () => {
      vi.mocked(db.signIn).mockResolvedValue({ user: { id: 'uid-1' } } as any)
      vi.mocked(db.getVendedorByAuthId).mockResolvedValue(vendedor)
      const reply = await handleLogin(PHONE, 'login rafael@test.com pass123')
      expect(reply).toContain('Olá')
      expect(reply).toContain('Rafael')
      expect(reply).toContain('Gerente')
      expect(reply).toContain('Menu Principal')
      const s = getSession(PHONE)
      expect(s).not.toBeNull()
      expect(s!.vendedor.id).toBe(1)
    })

    it('login com senha com espaços funciona', async () => {
      vi.mocked(db.signIn).mockResolvedValue({ user: { id: 'uid-1' } } as any)
      vi.mocked(db.getVendedorByAuthId).mockResolvedValue(vendedor)
      const reply = await handleLogin(PHONE, 'login rafael@test.com minha senha com espaços')
      expect(db.signIn).toHaveBeenCalledWith('rafael@test.com', 'minha senha com espaços')
    })

    it('erro genérico retorna mensagem de erro', async () => {
      vi.mocked(db.signIn).mockRejectedValue(new Error('Network error'))
      const reply = await handleLogin(PHONE, 'login test@test.com pass')
      expect(reply).toContain('Erro ao fazer login')
    })
  })

  describe('handleLogout', () => {
    it('sem sessão retorna aviso', () => {
      const reply = handleLogout(PHONE)
      expect(reply).toContain('não está logado')
    })

    it('com sessão remove e retorna despedida', () => {
      createSession(PHONE, vendedor)
      const reply = handleLogout(PHONE)
      expect(reply).toContain('Até logo')
      expect(reply).toContain('Rafael')
      expect(getSession(PHONE)).toBeNull()
    })
  })

  describe('getMenuText', () => {
    it('contém todas as opções do menu', () => {
      const text = getMenuText()
      expect(text).toContain('Menu Principal')
      expect(text).toContain('Meus clientes')
      expect(text).toContain('Novo cliente')
      expect(text).toContain('Registrar venda')
      expect(text).toContain('Minhas tarefas')
      expect(text).toContain('Meu pipeline')
      expect(text).toContain('Buscar cliente')
      expect(text).toContain('Sair')
    })
  })

  describe('getWelcomeText', () => {
    it('contém instruções de login', () => {
      const text = getWelcomeText()
      expect(text).toContain('Bem-vindo')
      expect(text).toContain('login')
    })
  })
})
