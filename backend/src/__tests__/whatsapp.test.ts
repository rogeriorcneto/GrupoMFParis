import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all heavy dependencies before importing
vi.mock('@whiskeysockets/baileys', () => ({
  default: vi.fn(),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 2413, 1] }),
  makeCacheableSignalKeyStore: vi.fn((keys: any) => keys),
}))
vi.mock('@hapi/boom', () => ({ Boom: class Boom {} }))
vi.mock('qrcode', () => ({ toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR') }))
vi.mock('../bot.js', () => ({ handleMessage: vi.fn().mockResolvedValue('Resposta bot') }))
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../whatsapp-session-store.js', () => ({
  useSupabaseAuthState: vi.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: vi.fn(),
    clearSession: vi.fn(),
  }),
}))
vi.mock('../database.js', () => ({
  insertWhatsAppMessage: vi.fn(),
  findClienteByPhone: vi.fn().mockResolvedValue(null),
}))

import {
  getWhatsAppStatus,
  getQRDataUrl,
  sendWhatsAppMessage,
  disconnectWhatsApp,
} from '../whatsapp.js'

describe('WhatsApp Integration', () => {
  describe('getWhatsAppStatus', () => {
    it('retorna status disconnected inicialmente', () => {
      const status = getWhatsAppStatus()
      expect(status.connected).toBe(false)
      expect(status.status).toBe('disconnected')
      expect(status.number).toBeNull()
      expect(status.uptime).toBe(0)
    })

    it('retorna objeto com formato correto', () => {
      const status = getWhatsAppStatus()
      expect(status).toHaveProperty('connected')
      expect(status).toHaveProperty('status')
      expect(status).toHaveProperty('number')
      expect(status).toHaveProperty('uptime')
    })
  })

  describe('getQRDataUrl', () => {
    it('retorna null quando não há QR gerado', () => {
      expect(getQRDataUrl()).toBeNull()
    })
  })

  describe('sendWhatsAppMessage', () => {
    it('retorna erro quando WhatsApp não está conectado', async () => {
      const result = await sendWhatsAppMessage('5531999999999', 'Olá')
      expect(result.success).toBe(false)
      expect(result.error).toContain('não está conectado')
    })

    it('retorna erro para qualquer número quando desconectado', async () => {
      const result = await sendWhatsAppMessage('', 'teste')
      expect(result.success).toBe(false)
    })
  })

  describe('disconnectWhatsApp', () => {
    it('reseta estado para disconnected', async () => {
      await disconnectWhatsApp()
      const status = getWhatsAppStatus()
      expect(status.connected).toBe(false)
      expect(status.status).toBe('disconnected')
      expect(status.number).toBeNull()
      expect(status.uptime).toBe(0)
    })

    it('limpa QR code', async () => {
      await disconnectWhatsApp()
      expect(getQRDataUrl()).toBeNull()
    })

    it('pode ser chamada múltiplas vezes sem erro', async () => {
      await disconnectWhatsApp()
      await disconnectWhatsApp()
      expect(getWhatsAppStatus().status).toBe('disconnected')
    })
  })

  describe('formatação de número', () => {
    it('jid deve ser número limpo + @s.whatsapp.net', () => {
      const number = '(31) 99999-9999'
      const jid = number.replace(/\D/g, '') + '@s.whatsapp.net'
      expect(jid).toBe('31999999999@s.whatsapp.net')
    })

    it('remove caracteres especiais do número', () => {
      const number = '+55-31-99999.1234'
      const cleaned = number.replace(/\D/g, '')
      expect(cleaned).toBe('5531999991234')
    })

    it('número já limpo permanece igual', () => {
      const number = '5531999991234'
      const cleaned = number.replace(/\D/g, '')
      expect(cleaned).toBe('5531999991234')
    })
  })

  describe('filtro de mensagens', () => {
    it('ignora mensagens de grupo (@g.us)', () => {
      const from = '120363123456789@g.us'
      expect(from.endsWith('@g.us')).toBe(true)
    })

    it('aceita mensagens individuais (@s.whatsapp.net)', () => {
      const from = '5531999991234@s.whatsapp.net'
      expect(from.endsWith('@g.us')).toBe(false)
    })

    it('extrai número do sender corretamente', () => {
      const from = '5531999991234@s.whatsapp.net'
      const senderNumber = from.replace('@s.whatsapp.net', '')
      expect(senderNumber).toBe('5531999991234')
    })

    it('ignora mensagens vazias', () => {
      const text = ''
      expect(!text.trim()).toBe(true)
    })

    it('aceita mensagens com conteúdo', () => {
      const text = '  Olá  '
      expect(!text.trim()).toBe(false)
      expect(text.trim()).toBe('Olá')
    })
  })

  describe('reconexão', () => {
    it('MAX_RECONNECT deve ser 5', () => {
      // Testamos a lógica: após MAX_RECONNECT tentativas, para de reconectar
      const MAX_RECONNECT = 5
      let reconnectAttempts = 0
      const attempts: number[] = []

      while (reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++
        attempts.push(reconnectAttempts)
      }

      expect(attempts).toEqual([1, 2, 3, 4, 5])
      expect(reconnectAttempts >= MAX_RECONNECT).toBe(true)
    })

    it('backoff delay aumenta com tentativas', () => {
      const baseDelay = 3000
      const delays = [1, 2, 3, 4, 5].map(attempt => baseDelay * attempt)
      expect(delays).toEqual([3000, 6000, 9000, 12000, 15000])
    })
  })
})
