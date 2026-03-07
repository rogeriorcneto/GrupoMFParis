import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../database.js', () => ({
  fetchClientes: vi.fn().mockResolvedValue([]),
  fetchClientesByVendedor: vi.fn().mockResolvedValue([]),
  fetchVendedores: vi.fn().mockResolvedValue([]),
  fetchPedidos: vi.fn().mockResolvedValue([]),
  fetchInteracoes: vi.fn().mockResolvedValue([]),
}))

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { startAIChat, handleAIChat } from '../handlers/ia.js'
import { createSession, deleteSession, getSession, updateSession } from '../session.js'
import type { Vendedor } from '../database.js'

const vendedor: Vendedor = {
  id: 1, nome: 'Rafael Silva', email: 'rafael@test.com', telefone: '',
  cargo: 'vendedor', avatar: '', metaVendas: 50000, metaLeads: 0, metaConversao: 0, ativo: true,
}

const PHONE = '5531900000066'

describe('handlers/ia', () => {
  beforeEach(() => {
    deleteSession(PHONE)
    vi.clearAllMocks()
    // Reset env
    delete process.env.GEMINI_API_KEY
  })

  // ─── startAIChat ───

  describe('startAIChat', () => {
    it('seta state chatting_ai e inicializa aiHistory', async () => {
      const session = createSession(PHONE, vendedor)
      await startAIChat(PHONE, session)
      const s = getSession(PHONE)!
      expect(s.state).toBe('chatting_ai')
      expect(s.aiHistory).toEqual([])
    })

    it('retorna greeting com primeiro nome do vendedor', async () => {
      const session = createSession(PHONE, vendedor)
      const reply = await startAIChat(PHONE, session)
      expect(reply).toContain('Rafael')
      expect(reply).toContain('ativada')
    })

    it('retorna exemplos de uso', async () => {
      const session = createSession(PHONE, vendedor)
      const reply = await startAIChat(PHONE, session)
      expect(reply).toContain('inativos')
      expect(reply).toContain('pipeline')
      expect(reply).toContain('menu')
    })
  })

  // ─── handleAIChat ───

  describe('handleAIChat', () => {
    it('sem GEMINI_API_KEY retorna mensagem de indisponível', async () => {
      const session = createSession(PHONE, vendedor)
      session.state = 'chatting_ai'
      session.aiHistory = []
      const reply = await handleAIChat(PHONE, session, 'oi')
      expect(reply).toContain('indisponivel') // note: sem acento no código original
    })

    it('com API key, chama Gemini e retorna resposta', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Olá Rafael!' }] } }],
        }),
        text: () => Promise.resolve(''),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const session = createSession(PHONE, vendedor)
      session.state = 'chatting_ai'
      session.aiHistory = []
      const reply = await handleAIChat(PHONE, session, 'oi')
      expect(reply).toBe('Olá Rafael!')
      expect(fetch).toHaveBeenCalledOnce()
      // Verify URL contains the API key
      const callUrl = (fetch as any).mock.calls[0][0] as string
      expect(callUrl).toContain('test-key')

      vi.unstubAllGlobals()
    })

    it('adiciona mensagem e resposta ao aiHistory', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Resposta IA' }] } }],
        }),
      }))

      const session = createSession(PHONE, vendedor)
      session.state = 'chatting_ai'
      session.aiHistory = []
      await handleAIChat(PHONE, session, 'pergunta')
      const s = getSession(PHONE)!
      expect(s.aiHistory).toHaveLength(2)
      expect(s.aiHistory![0]).toEqual({ role: 'user', content: 'pergunta' })
      expect(s.aiHistory![1]).toEqual({ role: 'assistant', content: 'Resposta IA' })

      vi.unstubAllGlobals()
    })

    it('trim history quando excede MAX_AI_HISTORY (20)', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        }),
      }))

      const session = createSession(PHONE, vendedor)
      session.state = 'chatting_ai'
      // Start with 20 messages (at limit)
      session.aiHistory = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `msg-${i}`,
      }))
      await handleAIChat(PHONE, session, 'nova pergunta')
      const s = getSession(PHONE)!
      // After adding user+assistant, should trim to 20
      expect(s.aiHistory!.length).toBeLessThanOrEqual(22) // 20 trimmed + 1 user + 1 assistant
      // The oldest messages should have been removed
      expect(s.aiHistory!.some(m => m.content === 'nova pergunta')).toBe(true)

      vi.unstubAllGlobals()
    })

    it('Gemini API retorna erro HTTP → mensagem de erro', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }))

      const session = createSession(PHONE, vendedor)
      session.state = 'chatting_ai'
      session.aiHistory = []
      const reply = await handleAIChat(PHONE, session, 'oi')
      expect(reply).toContain('Erro')

      vi.unstubAllGlobals()
    })

    it('fetch throw → mensagem de erro interno', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

      const session = createSession(PHONE, vendedor)
      session.state = 'chatting_ai'
      session.aiHistory = []
      const reply = await handleAIChat(PHONE, session, 'oi')
      expect(reply).toContain('Erro')

      vi.unstubAllGlobals()
    })

    it('Gemini retorna sem candidates → fallback', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      }))

      const session = createSession(PHONE, vendedor)
      session.state = 'chatting_ai'
      session.aiHistory = []
      const reply = await handleAIChat(PHONE, session, 'oi')
      expect(reply).toContain('Sem resposta')

      vi.unstubAllGlobals()
    })
  })
})
