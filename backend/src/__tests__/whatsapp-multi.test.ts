import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock all heavy dependencies before importing
vi.mock('baileys', () => ({
  default: vi.fn(),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 2413, 1] }),
  makeCacheableSignalKeyStore: vi.fn((keys: any) => keys),
}))
vi.mock('@hapi/boom', () => ({ Boom: class Boom {} }))
vi.mock('qrcode', () => ({ toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR') }))
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../whatsapp-session-store.js', () => ({
  useSupabaseAuthState: vi.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: vi.fn(),
    clearSession: vi.fn(),
    saveLidMap: vi.fn(),
    loadLidMap: vi.fn().mockResolvedValue(new Map()),
  }),
}))
vi.mock('../database.js', () => ({
  insertWhatsAppMessage: vi.fn(),
  findClienteByPhone: vi.fn().mockResolvedValue(null),
}))

import {
  getUserWhatsAppStatus,
  getUserQRDataUrl,
  sendUserWhatsAppMessage,
  disconnectUserWhatsApp,
  disconnectAllSessions,
  getAllUserSessions,
  getActiveSessionCount,
  startSessionCleanup,
  stopSessionCleanup,
} from '../whatsapp-multi.js'

describe('WhatsApp Multi-Session Manager', () => {
  beforeEach(async () => {
    // Clean up all sessions before each test
    await disconnectAllSessions()
    stopSessionCleanup()
  })

  afterEach(() => {
    stopSessionCleanup()
  })

  // ─── getUserWhatsAppStatus ───

  describe('getUserWhatsAppStatus', () => {
    it('retorna status disconnected para vendedor sem sessão', () => {
      const status = getUserWhatsAppStatus(999)
      expect(status.connected).toBe(false)
      expect(status.status).toBe('disconnected')
      expect(status.number).toBeNull()
      expect(status.uptime).toBe(0)
      expect(status.vendedorId).toBe(999)
    })

    it('retorna objeto com formato correto', () => {
      const status = getUserWhatsAppStatus(1)
      expect(status).toHaveProperty('connected')
      expect(status).toHaveProperty('status')
      expect(status).toHaveProperty('number')
      expect(status).toHaveProperty('uptime')
      expect(status).toHaveProperty('vendedorId')
    })

    it('vendedorId correto no retorno', () => {
      const status = getUserWhatsAppStatus(42)
      expect(status.vendedorId).toBe(42)
    })
  })

  // ─── getUserQRDataUrl ───

  describe('getUserQRDataUrl', () => {
    it('retorna null para vendedor sem sessão', () => {
      expect(getUserQRDataUrl(1)).toBeNull()
    })

    it('retorna null para vendedor inexistente', () => {
      expect(getUserQRDataUrl(999)).toBeNull()
    })
  })

  // ─── sendUserWhatsAppMessage ───

  describe('sendUserWhatsAppMessage', () => {
    it('retorna erro quando vendedor não tem sessão', async () => {
      const result = await sendUserWhatsAppMessage(1, '5531999999999', 'Olá')
      expect(result.success).toBe(false)
      expect(result.error).toContain('não está conectado')
    })

    it('retorna erro para vendedor sem sessão ativa', async () => {
      const result = await sendUserWhatsAppMessage(999, '5531999999999', 'test')
      expect(result.success).toBe(false)
    })

    it('mensagem de erro menciona usuário', async () => {
      const result = await sendUserWhatsAppMessage(5, '5531999999999', 'msg')
      expect(result.error).toBeDefined()
      expect(result.error).toContain('não está conectado')
    })
  })

  // ─── disconnectUserWhatsApp ───

  describe('disconnectUserWhatsApp', () => {
    it('não lança erro para vendedor sem sessão', async () => {
      await expect(disconnectUserWhatsApp(999)).resolves.toBeUndefined()
    })

    it('pode ser chamada múltiplas vezes sem erro', async () => {
      await disconnectUserWhatsApp(1)
      await disconnectUserWhatsApp(1)
      const status = getUserWhatsAppStatus(1)
      expect(status.status).toBe('disconnected')
    })

    it('limpa QR code após disconnect', async () => {
      await disconnectUserWhatsApp(1)
      expect(getUserQRDataUrl(1)).toBeNull()
    })
  })

  // ─── disconnectAllSessions ───

  describe('disconnectAllSessions', () => {
    it('não lança erro quando não há sessões', async () => {
      await expect(disconnectAllSessions()).resolves.toBeUndefined()
    })

    it('retorna lista vazia após desconectar tudo', async () => {
      await disconnectAllSessions()
      expect(getAllUserSessions()).toEqual([])
    })
  })

  // ─── getAllUserSessions ───

  describe('getAllUserSessions', () => {
    it('retorna array vazio quando não há sessões', () => {
      expect(getAllUserSessions()).toEqual([])
      expect(Array.isArray(getAllUserSessions())).toBe(true)
    })

    it('retorna array', () => {
      const sessions = getAllUserSessions()
      expect(Array.isArray(sessions)).toBe(true)
    })
  })

  // ─── getActiveSessionCount ───

  describe('getActiveSessionCount', () => {
    it('retorna 0 quando não há sessões ativas', () => {
      expect(getActiveSessionCount()).toBe(0)
    })

    it('retorna número', () => {
      expect(typeof getActiveSessionCount()).toBe('number')
    })
  })

  // ─── startSessionCleanup / stopSessionCleanup ───

  describe('session cleanup', () => {
    it('startSessionCleanup não lança erro', () => {
      expect(() => startSessionCleanup()).not.toThrow()
      stopSessionCleanup()
    })

    it('stopSessionCleanup não lança erro', () => {
      expect(() => stopSessionCleanup()).not.toThrow()
    })

    it('pode iniciar e parar cleanup múltiplas vezes', () => {
      startSessionCleanup()
      startSessionCleanup() // idempotent
      stopSessionCleanup()
      stopSessionCleanup() // idempotent
      expect(true).toBe(true)
    })
  })

  // ─── Isolamento de sessões ───

  describe('isolamento de sessões', () => {
    it('sessões de vendedores diferentes são independentes', () => {
      const s1 = getUserWhatsAppStatus(1)
      const s2 = getUserWhatsAppStatus(2)
      expect(s1.vendedorId).toBe(1)
      expect(s2.vendedorId).toBe(2)
      expect(s1.vendedorId).not.toBe(s2.vendedorId)
    })

    it('desconectar um vendedor não afeta outro', async () => {
      await disconnectUserWhatsApp(1)
      const s2 = getUserWhatsAppStatus(2)
      expect(s2.status).toBe('disconnected')
      expect(s2.vendedorId).toBe(2)
    })

    it('QR de vendedores diferentes são independentes', () => {
      expect(getUserQRDataUrl(1)).toBeNull()
      expect(getUserQRDataUrl(2)).toBeNull()
    })
  })

  // ─── Formato de número ───

  describe('formatação de número para envio', () => {
    it('remove caracteres especiais do número', () => {
      const number = '(31) 99999-9999'
      const jid = number.replace(/\D/g, '') + '@s.whatsapp.net'
      expect(jid).toBe('31999999999@s.whatsapp.net')
    })

    it('número com código de país', () => {
      const number = '+55-31-99999.1234'
      const cleaned = number.replace(/\D/g, '')
      expect(cleaned).toBe('5531999991234')
    })
  })
})
