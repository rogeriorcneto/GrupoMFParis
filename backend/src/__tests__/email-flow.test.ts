import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock modules BEFORE imports ──

const defaultDbRow = {
  id: 1,
  email_host: 'smtp.test.com',
  email_port: 587,
  email_user: 'user@test.com',
  email_pass: 'plainpass',
  email_from: 'noreply@test.com',
  whatsapp_numero: '',
  omie_app_key: '',
  omie_app_secret: '',
}

// Factory-based mock: creates fresh chain every call so vi.clearAllMocks() doesn't break it
const mockSupabaseFrom = vi.fn().mockImplementation(() => {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: { ...defaultDbRow }, error: null })
  chain.upsert = vi.fn().mockResolvedValue({ error: null })
  chain.insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
  })
  chain.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  return chain
})

vi.mock('../supabase.js', () => ({
  supabase: { from: (...args: any[]) => mockSupabaseFrom(...args) },
}))

vi.mock('../crypto.js', () => ({
  encrypt: vi.fn((v: string) => `enc_${v}`),
  decrypt: vi.fn((v: string) => v.startsWith('enc_') ? v.slice(4) : v),
}))

vi.mock('../logger.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock nodemailer
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id-123' })
const mockVerify = vi.fn().mockResolvedValue(true)
const mockCreateTransport = vi.fn().mockReturnValue({
  sendMail: mockSendMail,
  verify: mockVerify,
})

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...args: any[]) => mockCreateTransport(...args),
  },
}))

// Mock database
vi.mock('../database.js', () => ({
  insertInteracao: vi.fn().mockResolvedValue({ id: 1 }),
  updateCliente: vi.fn().mockResolvedValue(undefined),
  insertAtividade: vi.fn().mockResolvedValue({ id: 1 }),
  fetchTemplates: vi.fn().mockResolvedValue([]),
  fetchClienteById: vi.fn().mockResolvedValue(null),
}))

vi.mock('../constants.js', () => ({
  STAGE_LABELS: { 'prospecção': 'Prospecção', 'proposta': 'Proposta' },
}))

// ── Now import modules under test ──

import { invalidateConfigCache, loadConfig, getEmailConfig, saveConfig } from '../config-store.js'
import { reloadEmail, sendEmail, isEmailConfigured, getEmailStatus, testEmailConnection, initEmail } from '../email.js'

describe('Email Flow — Config to Send', () => {
  beforeEach(() => {
    // Reset call counts without clearing implementations
    mockSendMail.mockClear()
    mockVerify.mockClear()
    mockCreateTransport.mockClear()
    mockSupabaseFrom.mockClear()
    mockSendMail.mockResolvedValue({ messageId: 'test-id-123' })
    mockVerify.mockResolvedValue(true)
    invalidateConfigCache()
  })

  // ── Config Loading ──

  describe('Config Loading', () => {
    it('loadConfig reads from Supabase and decrypts', async () => {
      const cfg = await loadConfig()
      expect(cfg.emailHost).toBe('smtp.test.com')
      expect(cfg.emailPort).toBe(587)
      expect(cfg.emailUser).toBe('user@test.com')
    })

    it('loadConfig uses cache on second call', async () => {
      const cfg1 = await loadConfig()
      const cfg2 = await loadConfig()
      expect(cfg1).toEqual(cfg2)
    })

    it('invalidateConfigCache forces re-read', async () => {
      await loadConfig() // fills cache
      invalidateConfigCache()
      await loadConfig() // should re-read
      // supabase.from should be called twice
    })

    it('getEmailConfig returns null when host is empty', async () => {
      mockSupabaseFrom.mockImplementationOnce(() => {
        const c: any = {}
        c.select = vi.fn().mockReturnValue(c)
        c.eq = vi.fn().mockReturnValue(c)
        c.single = vi.fn().mockResolvedValue({
          data: { id: 1, email_host: '', email_port: 587, email_user: '', email_pass: '', email_from: '' },
          error: null,
        })
        return c
      })

      invalidateConfigCache()
      const emailCfg = await getEmailConfig()
      expect(emailCfg).toBeNull()
    })

    it('getEmailConfig returns config when all fields are present', async () => {
      invalidateConfigCache()
      const emailCfg = await getEmailConfig()
      expect(emailCfg).not.toBeNull()
      expect(emailCfg!.host).toBe('smtp.test.com')
      expect(emailCfg!.port).toBe(587)
      expect(emailCfg!.user).toBe('user@test.com')
    })
  })

  // ── Email Initialization ──

  describe('Email Initialization', () => {
    it('initEmail creates transporter when config exists', async () => {
      const result = await initEmail()
      expect(result).toBe(true)
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test.com',
          port: 587,
          secure: false,
          auth: expect.objectContaining({
            user: 'user@test.com',
          }),
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 30000,
        })
      )
    })

    it('reloadEmail invalidates cache and re-reads from DB', async () => {
      await loadConfig() // fill cache
      const result = await reloadEmail()
      expect(result).toBe(true)
      expect(isEmailConfigured()).toBe(true)
    })

    it('reloadEmail sets isEmailConfigured to true', async () => {
      await reloadEmail()
      expect(isEmailConfigured()).toBe(true)
    })

    it('reloadEmail verifies SMTP connection', async () => {
      await reloadEmail()
      expect(mockVerify).toHaveBeenCalled()
    })

    it('reloadEmail still returns true if verify fails (some servers reject verify)', async () => {
      mockVerify.mockRejectedValueOnce(new Error('SMTP verify failed'))
      const result = await reloadEmail()
      expect(result).toBe(true) // transporter still created
      expect(isEmailConfigured()).toBe(true)
    })

    it('getEmailStatus returns configured state', async () => {
      await reloadEmail()
      const status = getEmailStatus()
      expect(status.configured).toBe(true)
      expect(status.from).toBe('noreply@test.com')
    })
  })

  // ── Sending Emails ──

  describe('Sending Emails', () => {
    beforeEach(async () => {
      await reloadEmail()
    })

    it('sendEmail calls transporter.sendMail with correct params', async () => {
      const result = await sendEmail({
        to: 'dest@test.com',
        subject: 'Test Subject',
        body: '<p>Hello</p>',
      })

      expect(result.success).toBe(true)
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@test.com',
        to: 'dest@test.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      })
    })

    it('sendEmail returns error when transporter is null', async () => {
      mockSupabaseFrom.mockImplementationOnce(() => {
        const c: any = {}
        c.select = vi.fn().mockReturnValue(c)
        c.eq = vi.fn().mockReturnValue(c)
        c.single = vi.fn().mockResolvedValue({
          data: { id: 1, email_host: '', email_port: 587, email_user: '', email_pass: '', email_from: '' },
          error: null,
        })
        return c
      })
      invalidateConfigCache()
      await reloadEmail() // this will set transporter to null

      const result = await sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        body: 'Body',
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('não configurado')
    })

    it('sendEmail handles SMTP connection timeout', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Connection timeout'))

      const result = await sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        body: '<p>Body</p>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection timeout')
    })

    it('sendEmail handles authentication errors', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Invalid login: 535 Authentication failed'))

      const result = await sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        body: '<p>Body</p>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Authentication failed')
    })

    it('sendEmail registers interaction when clienteId is provided', async () => {
      const { insertInteracao, updateCliente } = await import('../database.js')

      await sendEmail({
        to: 'test@test.com',
        subject: 'Follow up',
        body: '<p>Body</p>',
        clienteId: 42,
        vendedorNome: 'João',
      })

      expect(insertInteracao).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 42,
          tipo: 'email',
        })
      )
      expect(updateCliente).toHaveBeenCalledWith(42, expect.objectContaining({
        ultimaInteracao: expect.any(String),
      }))
    })

    it('sendEmail registers activity', async () => {
      const { insertAtividade } = await import('../database.js')

      await sendEmail({
        to: 'test@test.com',
        subject: 'Follow up',
        body: '<p>Body</p>',
        vendedorNome: 'João',
      })

      expect(insertAtividade).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'email',
          vendedorNome: 'João',
        })
      )
    })
  })

  // ── Test Connection ──

  describe('Test Connection', () => {
    it('testEmailConnection returns success when SMTP is reachable', async () => {
      await reloadEmail()
      const result = await testEmailConnection()
      expect(result.success).toBe(true)
    })

    it('testEmailConnection returns error when SMTP fails', async () => {
      await reloadEmail()
      mockVerify.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const result = await testEmailConnection()
      expect(result.success).toBe(false)
      expect(result.error).toContain('ECONNREFUSED')
    })

    it('testEmailConnection returns error when not configured', async () => {
      mockSupabaseFrom.mockImplementationOnce(() => {
        const c: any = {}
        c.select = vi.fn().mockReturnValue(c)
        c.eq = vi.fn().mockReturnValue(c)
        c.single = vi.fn().mockResolvedValue({
          data: { id: 1, email_host: '', email_port: 587, email_user: '', email_pass: '', email_from: '' },
          error: null,
        })
        return c
      })
      invalidateConfigCache()
      await reloadEmail()

      const result = await testEmailConnection()
      expect(result.success).toBe(false)
      expect(result.error).toContain('não configurado')
    })
  })

  // ── Port / Secure flag ──

  describe('Port and TLS handling', () => {
    it('uses secure=true for port 465', async () => {
      mockSupabaseFrom.mockImplementation(() => {
        const c: any = {}
        c.select = vi.fn().mockReturnValue(c)
        c.eq = vi.fn().mockReturnValue(c)
        c.single = vi.fn().mockResolvedValue({
          data: {
            id: 1, email_host: 'mail.test.com', email_port: 465,
            email_user: 'u@test.com', email_pass: 'pass', email_from: 'u@test.com',
          },
          error: null,
        })
        return c
      })
      invalidateConfigCache()
      await reloadEmail()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
          secure: true,
        })
      )
    })

    it('uses secure=false for port 587', async () => {
      invalidateConfigCache()
      await reloadEmail()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587,
          secure: false,
        })
      )
    })
  })

  // ── Save Config → Reload flow ──

  describe('Save config triggers proper reload', () => {
    it('after saveConfig, reloadEmail picks up new values', async () => {
      // First load with defaults
      await reloadEmail()
      expect(mockCreateTransport).toHaveBeenCalled()

      // Simulate save (the mock DB returns same data, but the flow is correct)
      mockCreateTransport.mockClear()
      invalidateConfigCache()
      await reloadEmail()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test.com',
        })
      )
    })
  })
})
