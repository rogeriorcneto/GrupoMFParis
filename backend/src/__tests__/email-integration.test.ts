import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock nodemailer
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
const mockVerify = vi.fn().mockResolvedValue(true)
const mockCreateTransport = vi.fn().mockReturnValue({
  sendMail: mockSendMail,
  verify: mockVerify,
})
vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: any[]) => mockCreateTransport(...args) },
}))

// Mock database
vi.mock('../database.js', () => ({
  insertInteracao: vi.fn().mockResolvedValue({}),
  insertAtividade: vi.fn().mockResolvedValue({}),
  updateCliente: vi.fn().mockResolvedValue({}),
  fetchTemplates: vi.fn().mockResolvedValue([
    { id: 1, nome: 'Boas-vindas', assunto: 'Olá {nome}', corpo: '<p>Bem-vindo {nome} da {empresa}!</p>' },
    { id: 2, nome: 'Follow-up', assunto: 'Follow-up {empresa}', corpo: '<p>Olá {nome}, tudo bem?</p>' },
  ]),
  fetchClienteById: vi.fn().mockResolvedValue({
    id: 10, razaoSocial: 'MF Paris', contatoNome: 'Rafael',
    etapa: 'negociacao', valorEstimado: 15000,
  }),
}))

// Mock config-store
vi.mock('../config-store.js', () => ({
  getEmailConfig: vi.fn().mockResolvedValue({
    host: 'smtp.gmail.com', port: 587,
    user: 'user@gmail.com', pass: 'secret123',
    from: 'noreply@mfparis.com',
  }),
  invalidateConfigCache: vi.fn(),
}))

// Mock constants
vi.mock('../constants.js', () => ({
  STAGE_LABELS: {
    prospecção: 'Prospecção', amostra: 'Amostra', homologado: 'Homologado',
    negociacao: 'Negociação', pos_venda: 'Pós-Venda', perdido: 'Perdido',
  },
}))

vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { reloadEmail, getEmailStatus, sendEmail, sendTemplateEmail, testEmailConnection, isEmailConfigured } from '../email.js'
import * as db from '../database.js'

describe('Email Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('reloadEmail', () => {
    it('configura transporter com credenciais do config-store', async () => {
      const result = await reloadEmail()
      expect(result).toBe(true)
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: 'user@gmail.com', pass: 'secret123' },
        })
      )
    })

    it('retorna false quando config está vazia', async () => {
      const { getEmailConfig } = await import('../config-store.js')
      vi.mocked(getEmailConfig).mockResolvedValueOnce(null)
      const result = await reloadEmail()
      expect(result).toBe(false)
    })

    it('usa secure=true para porta 465', async () => {
      const { getEmailConfig } = await import('../config-store.js')
      vi.mocked(getEmailConfig).mockResolvedValueOnce({
        host: 'smtp.gmail.com', port: 465,
        user: 'user@gmail.com', pass: 'secret', from: 'noreply@test.com',
      })
      await reloadEmail()
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true })
      )
    })
  })

  describe('getEmailStatus', () => {
    it('retorna configured=true após reload', async () => {
      await reloadEmail()
      const status = getEmailStatus()
      expect(status.configured).toBe(true)
      expect(status.from).toBe('noreply@mfparis.com')
    })
  })

  describe('isEmailConfigured', () => {
    it('retorna true após reload com config válida', async () => {
      await reloadEmail()
      expect(isEmailConfigured()).toBe(true)
    })
  })

  describe('sendEmail', () => {
    beforeEach(async () => {
      await reloadEmail()
    })

    it('envia email com sucesso', async () => {
      const result = await sendEmail({
        to: 'cliente@test.com', subject: 'Teste', body: '<p>Olá</p>',
      })
      expect(result.success).toBe(true)
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@mfparis.com',
        to: 'cliente@test.com',
        subject: 'Teste',
        html: '<p>Olá</p>',
      })
    })

    it('registra interação quando clienteId fornecido', async () => {
      await sendEmail({
        to: 'c@test.com', subject: 'Test', body: 'Body', clienteId: 5,
      })
      expect(db.insertInteracao).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: 5, tipo: 'email' })
      )
      expect(db.updateCliente).toHaveBeenCalledWith(5, expect.any(Object))
    })

    it('registra atividade com nome do vendedor', async () => {
      await sendEmail({
        to: 'c@test.com', subject: 'Test', body: 'Body', vendedorNome: 'Rafael',
      })
      expect(db.insertAtividade).toHaveBeenCalledWith(
        expect.objectContaining({ vendedorNome: 'Rafael' })
      )
    })

    it('registra atividade como "Sistema" sem vendedorNome', async () => {
      await sendEmail({ to: 'c@test.com', subject: 'Test', body: 'Body' })
      expect(db.insertAtividade).toHaveBeenCalledWith(
        expect.objectContaining({ vendedorNome: 'Sistema' })
      )
    })

    it('retorna erro quando sendMail falha', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'))
      const result = await sendEmail({ to: 'c@test.com', subject: 'T', body: 'B' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('SMTP connection failed')
    })

    it('retorna erro quando não configurado', async () => {
      const { getEmailConfig } = await import('../config-store.js')
      vi.mocked(getEmailConfig).mockResolvedValueOnce(null)
      await reloadEmail()
      const result = await sendEmail({ to: 'c@test.com', subject: 'T', body: 'B' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('não configurado')
    })
  })

  describe('sendTemplateEmail', () => {
    beforeEach(async () => {
      // Ensure email is configured
      const { getEmailConfig } = await import('../config-store.js')
      vi.mocked(getEmailConfig).mockResolvedValue({
        host: 'smtp.gmail.com', port: 587,
        user: 'user@gmail.com', pass: 'secret123', from: 'noreply@mfparis.com',
      })
      await reloadEmail()
    })

    it('substitui variáveis no template e envia', async () => {
      const result = await sendTemplateEmail({
        templateId: 1, to: 'cliente@test.com',
        clienteId: 10, vendedorNome: 'Rafael',
      })
      expect(result.success).toBe(true)
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Olá Rafael',
          html: '<p>Bem-vindo Rafael da MF Paris!</p>',
        })
      )
    })

    it('retorna erro quando template não encontrado', async () => {
      const result = await sendTemplateEmail({
        templateId: 999, to: 'c@test.com', clienteId: 10, vendedorNome: 'R',
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Template não encontrado')
    })

    it('retorna erro quando cliente não encontrado', async () => {
      vi.mocked(db.fetchClienteById).mockResolvedValueOnce(null)
      const result = await sendTemplateEmail({
        templateId: 1, to: 'c@test.com', clienteId: 999, vendedorNome: 'R',
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Cliente não encontrado')
    })
  })

  describe('testEmailConnection', () => {
    it('retorna success quando verify OK', async () => {
      await reloadEmail()
      const result = await testEmailConnection()
      expect(result.success).toBe(true)
      expect(mockVerify).toHaveBeenCalled()
    })

    it('retorna erro quando verify falha', async () => {
      await reloadEmail()
      mockVerify.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const result = await testEmailConnection()
      expect(result.success).toBe(false)
      expect(result.error).toContain('ECONNREFUSED')
    })

    it('retorna erro quando não configurado', async () => {
      const { getEmailConfig } = await import('../config-store.js')
      vi.mocked(getEmailConfig).mockResolvedValueOnce(null)
      await reloadEmail()
      const result = await testEmailConnection()
      expect(result.success).toBe(false)
      expect(result.error).toContain('não configurado')
    })
  })
})
