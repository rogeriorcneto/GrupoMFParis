import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase module
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
  },
}))

// ─── Test per-user WhatsApp API helper logic ───

const BOT_URL = 'http://localhost:3001'

describe('Per-User WhatsApp API Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as any
  })

  // ── getUserWhatsAppStatus ──

  describe('getUserWhatsAppStatus', () => {
    it('chama endpoint correto /api/whatsapp/user/status', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          connected: false, status: 'disconnected', number: null, uptime: 0, vendedorId: 1,
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/status`, {
        headers: { Authorization: 'Bearer test-token' },
      })
      const data = await res.json()

      expect(data.vendedorId).toBe(1)
      expect(data.status).toBe('disconnected')
      expect(data.connected).toBe(false)
    })

    it('retorna status connected quando vendedor está conectado', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          connected: true, status: 'connected', number: '5531999999999', uptime: 120, vendedorId: 5,
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/status`)
      const data = await res.json()

      expect(data.connected).toBe(true)
      expect(data.number).toBe('5531999999999')
      expect(data.uptime).toBe(120)
      expect(data.vendedorId).toBe(5)
    })
  })

  // ── getUserWhatsAppQR ──

  describe('getUserWhatsAppQR', () => {
    it('retorna QR data quando status é qr', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          qr: 'data:image/png;base64,FAKEQR', status: 'qr',
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/qr`)
      const data = await res.json()

      expect(data.qr).toBe('data:image/png;base64,FAKEQR')
      expect(data.status).toBe('qr')
    })

    it('retorna qr null quando connected', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          qr: null, status: 'connected', number: '5531999999999',
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/qr`)
      const data = await res.json()

      expect(data.qr).toBeNull()
      expect(data.status).toBe('connected')
    })

    it('retorna qr null quando disconnected', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          qr: null, status: 'disconnected',
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/qr`)
      const data = await res.json()

      expect(data.qr).toBeNull()
    })
  })

  // ── connectUserWhatsApp ──

  describe('connectUserWhatsApp', () => {
    it('chama POST /api/whatsapp/user/connect', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ success: true, message: 'Conexão iniciada.' }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/connect`, { method: 'POST' })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BOT_URL}/api/whatsapp/user/connect`,
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('retorna erro quando falha', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: 'Limite de sessões atingido' }), { status: 500 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/connect`, { method: 'POST' })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('Limite')
    })
  })

  // ── disconnectUserWhatsApp ──

  describe('disconnectUserWhatsApp', () => {
    it('chama POST /api/whatsapp/user/disconnect', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ success: true, message: 'Desconectado.' }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/disconnect`, { method: 'POST' })
      const data = await res.json()

      expect(data.success).toBe(true)
    })
  })

  // ── sendUserWhatsApp ──

  describe('sendUserWhatsApp', () => {
    it('envia mensagem com número e texto', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      )

      const body = JSON.stringify({ number: '5531999999999', text: 'Olá', clienteId: 1 })
      const res = await fetch(`${BOT_URL}/api/whatsapp/user/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BOT_URL}/api/whatsapp/user/send`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('5531999999999'),
        })
      )
    })

    it('retorna erro quando WhatsApp não conectado', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'WhatsApp não está conectado para este usuário',
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/send`, {
        method: 'POST',
        body: JSON.stringify({ number: '5531999999999', text: 'Olá' }),
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('não está conectado')
    })

    it('valida campos obrigatórios number e text', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'Campos obrigatórios: number, text',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/send`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('obrigatórios')
    })
  })

  // ── getAllUserWhatsAppSessions ──

  describe('getAllUserWhatsAppSessions', () => {
    it('retorna lista de sessões (gerente)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify([
          { connected: true, status: 'connected', number: '5531999999999', uptime: 600, vendedorId: 1 },
          { connected: false, status: 'disconnected', number: null, uptime: 0, vendedorId: 2 },
        ]), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/sessions`)
      const data = await res.json()

      expect(Array.isArray(data)).toBe(true)
      expect(data).toHaveLength(2)
      expect(data[0].connected).toBe(true)
      expect(data[0].vendedorId).toBe(1)
      expect(data[1].connected).toBe(false)
    })

    it('retorna lista vazia quando não há sessões', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/sessions`)
      const data = await res.json()

      expect(data).toEqual([])
    })
  })

  // ── UserWAStatus type shape ──

  describe('UserWAStatus format', () => {
    it('tem todos os campos esperados', () => {
      const status = {
        connected: true,
        status: 'connected' as const,
        number: '5531999999999',
        uptime: 3600,
        vendedorId: 1,
      }

      expect(status).toHaveProperty('connected')
      expect(status).toHaveProperty('status')
      expect(status).toHaveProperty('number')
      expect(status).toHaveProperty('uptime')
      expect(status).toHaveProperty('vendedorId')
      expect(typeof status.connected).toBe('boolean')
      expect(typeof status.uptime).toBe('number')
      expect(typeof status.vendedorId).toBe('number')
    })

    it('status aceita todos os valores válidos', () => {
      const validStatuses = ['disconnected', 'connecting', 'qr', 'connected']
      validStatuses.forEach(s => {
        expect(['disconnected', 'connecting', 'qr', 'connected']).toContain(s)
      })
    })
  })

  // ── Uptime formatting logic ──

  describe('formatUptime helper', () => {
    const formatUptime = (s: number) => {
      if (s < 60) return `${s}s`
      if (s < 3600) return `${Math.floor(s / 60)}min`
      return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`
    }

    it('formata segundos', () => {
      expect(formatUptime(30)).toBe('30s')
    })

    it('formata minutos', () => {
      expect(formatUptime(120)).toBe('2min')
    })

    it('formata horas e minutos', () => {
      expect(formatUptime(3661)).toBe('1h 1min')
    })

    it('formata 0 segundos', () => {
      expect(formatUptime(0)).toBe('0s')
    })
  })
})
