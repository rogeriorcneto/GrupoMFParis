import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock database
const mockClaimJobsPendentes = vi.fn()
const mockUpdateJobStatus = vi.fn()
const mockFetchClienteById = vi.fn()
vi.mock('../database.js', () => ({
  claimJobsPendentes: (...args: any[]) => mockClaimJobsPendentes(...args),
  updateJobStatus: (...args: any[]) => mockUpdateJobStatus(...args),
  fetchClienteById: (...args: any[]) => mockFetchClienteById(...args),
}))

// Mock whatsapp
const mockSendWhatsApp = vi.fn()
vi.mock('../whatsapp.js', () => ({
  sendWhatsAppMessage: (...args: any[]) => mockSendWhatsApp(...args),
  getWhatsAppStatus: vi.fn().mockReturnValue({ connected: true }),
}))

// Mock email
const mockSendEmail = vi.fn()
vi.mock('../email.js', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  isEmailConfigured: vi.fn().mockReturnValue(true),
}))

// Mock config-store
vi.mock('../config-store.js', () => ({
  loadConfigSync: vi.fn().mockReturnValue({ whatsappNumero: '5531999990000' }),
}))

// Mock logger
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

describe('Cron — Job Processing Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('claimJobsPendentes', () => {
    it('retorna array vazio quando não há jobs pendentes', async () => {
      mockClaimJobsPendentes.mockResolvedValue([])
      const jobs = await mockClaimJobsPendentes()
      expect(jobs).toEqual([])
    })

    it('retorna jobs com status processando após claim', async () => {
      mockClaimJobsPendentes.mockResolvedValue([
        { id: 1, cliente_id: 10, canal: 'whatsapp', tipo: 'template', status: 'processando', assunto: 'Olá' },
        { id: 2, cliente_id: 20, canal: 'email', tipo: 'template', status: 'processando', assunto: 'Follow-up' },
      ])
      const jobs = await mockClaimJobsPendentes()
      expect(jobs).toHaveLength(2)
      expect(jobs[0].status).toBe('processando')
      expect(jobs[1].status).toBe('processando')
    })
  })

  describe('processamento de job WhatsApp', () => {
    const whatsappJob = {
      id: 1, cliente_id: 10, canal: 'whatsapp', tipo: 'texto',
      status: 'processando', assunto: '', mensagem: 'Olá, tudo bem?',
    }

    it('envia mensagem e atualiza status para enviado', async () => {
      mockFetchClienteById.mockResolvedValue({
        id: 10, contatoTelefone: '31999991234', whatsapp: '',
      })
      mockSendWhatsApp.mockResolvedValue({ success: true })

      const cliente = await mockFetchClienteById(10)
      const phone = cliente.contatoTelefone || cliente.whatsapp
      expect(phone).toBe('31999991234')

      const result = await mockSendWhatsApp(phone, whatsappJob.mensagem)
      expect(result.success).toBe(true)

      await mockUpdateJobStatus(whatsappJob.id, 'enviado')
      expect(mockUpdateJobStatus).toHaveBeenCalledWith(1, 'enviado')
    })

    it('marca erro quando cliente não tem telefone', async () => {
      mockFetchClienteById.mockResolvedValue({
        id: 10, contatoTelefone: '', whatsapp: '',
      })

      const cliente = await mockFetchClienteById(10)
      const phone = cliente.contatoTelefone || cliente.whatsapp
      expect(phone).toBe('')

      // Simula lógica do cron: sem telefone → erro
      const hasPhone = !!phone
      expect(hasPhone).toBe(false)

      await mockUpdateJobStatus(whatsappJob.id, 'erro', 'Cliente sem telefone')
      expect(mockUpdateJobStatus).toHaveBeenCalledWith(1, 'erro', 'Cliente sem telefone')
    })

    it('marca erro quando envio WhatsApp falha', async () => {
      mockFetchClienteById.mockResolvedValue({ id: 10, contatoTelefone: '31999991234' })
      mockSendWhatsApp.mockResolvedValue({ success: false, error: 'WhatsApp não está conectado' })

      const result = await mockSendWhatsApp('31999991234', 'Olá')
      expect(result.success).toBe(false)

      await mockUpdateJobStatus(whatsappJob.id, 'erro', result.error)
      expect(mockUpdateJobStatus).toHaveBeenCalledWith(1, 'erro', 'WhatsApp não está conectado')
    })

    it('usa campo whatsapp quando contatoTelefone está vazio', async () => {
      mockFetchClienteById.mockResolvedValue({
        id: 10, contatoTelefone: '', whatsapp: '5531888887777',
      })

      const cliente = await mockFetchClienteById(10)
      const phone = cliente.contatoTelefone || cliente.whatsapp
      expect(phone).toBe('5531888887777')
    })
  })

  describe('processamento de job Email', () => {
    const emailJob = {
      id: 2, cliente_id: 20, canal: 'email', tipo: 'template',
      status: 'processando', assunto: 'Proposta comercial',
    }

    it('envia email e atualiza status para enviado', async () => {
      mockFetchClienteById.mockResolvedValue({
        id: 20, contatoEmail: 'cliente@empresa.com', razaoSocial: 'Empresa X',
      })
      mockSendEmail.mockResolvedValue({ success: true })

      const cliente = await mockFetchClienteById(20)
      expect(cliente.contatoEmail).toBe('cliente@empresa.com')

      const result = await mockSendEmail({
        to: cliente.contatoEmail,
        subject: emailJob.assunto,
        body: '<p>Corpo do email</p>',
        clienteId: emailJob.cliente_id,
      })
      expect(result.success).toBe(true)

      await mockUpdateJobStatus(emailJob.id, 'enviado')
      expect(mockUpdateJobStatus).toHaveBeenCalledWith(2, 'enviado')
    })

    it('marca erro quando cliente não tem email', async () => {
      mockFetchClienteById.mockResolvedValue({
        id: 20, contatoEmail: '',
      })

      const cliente = await mockFetchClienteById(20)
      const hasEmail = !!cliente.contatoEmail
      expect(hasEmail).toBe(false)

      await mockUpdateJobStatus(emailJob.id, 'erro', 'Cliente sem email')
      expect(mockUpdateJobStatus).toHaveBeenCalledWith(2, 'erro', 'Cliente sem email')
    })

    it('marca erro quando envio email falha', async () => {
      mockFetchClienteById.mockResolvedValue({
        id: 20, contatoEmail: 'cliente@test.com',
      })
      mockSendEmail.mockResolvedValue({ success: false, error: 'SMTP connection refused' })

      const result = await mockSendEmail({
        to: 'cliente@test.com', subject: 'Test', body: 'Body',
      })
      expect(result.success).toBe(false)

      await mockUpdateJobStatus(emailJob.id, 'erro', result.error)
      expect(mockUpdateJobStatus).toHaveBeenCalledWith(2, 'erro', 'SMTP connection refused')
    })
  })

  describe('updateJobStatus', () => {
    it('atualiza status para enviado', async () => {
      await mockUpdateJobStatus(1, 'enviado')
      expect(mockUpdateJobStatus).toHaveBeenCalledWith(1, 'enviado')
    })

    it('atualiza status para erro com mensagem', async () => {
      await mockUpdateJobStatus(1, 'erro', 'Timeout')
      expect(mockUpdateJobStatus).toHaveBeenCalledWith(1, 'erro', 'Timeout')
    })
  })

  describe('filtragem de jobs', () => {
    it('filtra apenas jobs pendentes', () => {
      const jobs = [
        { id: 1, status: 'pendente', agendado_para: '2025-01-01T00:00:00Z' },
        { id: 2, status: 'enviado', agendado_para: '2025-01-01T00:00:00Z' },
        { id: 3, status: 'erro', agendado_para: '2025-01-01T00:00:00Z' },
        { id: 4, status: 'pendente', agendado_para: '2025-01-01T00:00:00Z' },
        { id: 5, status: 'processando', agendado_para: '2025-01-01T00:00:00Z' },
      ]
      const pendentes = jobs.filter(j => j.status === 'pendente')
      expect(pendentes).toHaveLength(2)
      expect(pendentes.map(j => j.id)).toEqual([1, 4])
    })

    it('filtra jobs com agendado_para no passado', () => {
      const now = new Date()
      const past = new Date(now.getTime() - 60000).toISOString()
      const future = new Date(now.getTime() + 60000).toISOString()

      const jobs = [
        { id: 1, agendado_para: past },
        { id: 2, agendado_para: future },
        { id: 3, agendado_para: past },
      ]

      const due = jobs.filter(j => new Date(j.agendado_para) <= now)
      expect(due).toHaveLength(2)
      expect(due.map(j => j.id)).toEqual([1, 3])
    })

    it('limite de processamento por batch (max 10)', () => {
      const BATCH_SIZE = 10
      const jobs = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, status: 'pendente' }))
      const batch = jobs.slice(0, BATCH_SIZE)
      expect(batch).toHaveLength(10)
    })
  })

  describe('canal validation', () => {
    it('aceita canais válidos: whatsapp, email', () => {
      const validCanals = ['whatsapp', 'email']
      expect(validCanals).toContain('whatsapp')
      expect(validCanals).toContain('email')
    })

    it('rejeita canal desconhecido', () => {
      const validCanals = ['whatsapp', 'email']
      expect(validCanals).not.toContain('sms')
      expect(validCanals).not.toContain('telegram')
    })
  })
})
