import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before imports
vi.mock('../omie/client.js', () => ({
  omieCall: vi.fn(),
  omieCallAllPages: vi.fn(),
  testOmieConnection: vi.fn().mockResolvedValue({ success: true, empresa: 'Test' }),
  getOmieCredentials: vi.fn().mockResolvedValue({ appKey: 'k', appSecret: 's' }),
}))

vi.mock('../omie/sync.js', () => ({
  getSyncDiff: vi.fn().mockResolvedValue({ novos: [], atualizados: [], semAlteracao: [] }),
  syncPullClientes: vi.fn().mockResolvedValue({ inseridos: 0, atualizados: 0, erros: [] }),
  syncPushClientes: vi.fn().mockResolvedValue({ enviados: 0, erros: [] }),
}))

vi.mock('../omie/sync-logistics.js', () => ({
  syncOmieLogistics: vi.fn().mockResolvedValue({ atualizados: 0, semPedido: 0, erros: [] }),
}))

vi.mock('../omie/pedidos.js', () => ({
  listarPedidosOmieAcompanhamento: vi.fn().mockResolvedValue([]),
  consultarEntregaOmie: vi.fn().mockResolvedValue({
    etapa: '50', dataPrevisao: '15/03/2025', codigoRastreio: '', nf: '1234', dataFaturamento: '10/03/2025', statusDescricao: 'Faturar',
  }),
  obterResumoFinanceiro: vi.fn().mockResolvedValue({
    totalReceber: 1000, totalPagar: 500, saldo: 500, titulosVencidos: 0, titulosAVencer: 2, contasReceber: [], contasPagar: [],
  }),
}))

vi.mock('../config-store.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ omieAppKey: 'ENC:k', omieAppSecret: 'ENC:s' }),
  saveConfig: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../crypto.js', () => ({
  encrypt: (t: string) => `ENC:${t}`,
  decrypt: (t: string) => t.startsWith('ENC:') ? t.slice(4) : t,
}))

vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}))

import { omieRouter } from '../routes/omie.js'
import { listarPedidosOmieAcompanhamento, consultarEntregaOmie, obterResumoFinanceiro } from '../omie/pedidos.js'
import { syncOmieLogistics } from '../omie/sync-logistics.js'
import express from 'express'
import request from 'supertest'

// Create test app
function createApp() {
  const app = express()
  app.use(express.json())
  // Skip auth for tests
  app.use('/api/omie', (req: any, _res, next) => {
    req.userId = 'test-user'
    req.supabase = {}
    next()
  }, omieRouter)
  return app
}

describe('Omie Routes', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  // ─── GET /pedidos/acompanhamento ───

  describe('GET /api/omie/pedidos/acompanhamento', () => {
    it('retorna 200 com lista de pedidos', async () => {
      const mockData = [
        { pedidoId: 1, numero: 'PED-001', clienteNome: 'Teste', statusOmie: 'faturado', valor: 1000 },
      ]
      vi.mocked(listarPedidosOmieAcompanhamento).mockResolvedValue(mockData as any)

      const res = await request(app).get('/api/omie/pedidos/acompanhamento')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual(mockData)
    })

    it('retorna 500 quando função lança erro', async () => {
      vi.mocked(listarPedidosOmieAcompanhamento).mockRejectedValue(new Error('Credenciais Omie não configuradas'))

      const res = await request(app).get('/api/omie/pedidos/acompanhamento')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('Credenciais')
    })
  })

  // ─── POST /pedidos/:id/consultar-entrega ───

  describe('POST /api/omie/pedidos/:id/consultar-entrega', () => {
    it('retorna 200 com dados de entrega', async () => {
      const res = await request(app).post('/api/omie/pedidos/1/consultar-entrega')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.etapa).toBe('50')
      expect(res.body.data.nf).toBe('1234')
    })

    it('retorna 400 para ID inválido', async () => {
      const res = await request(app).post('/api/omie/pedidos/abc/consultar-entrega')

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('ID inválido')
    })

    it('retorna 500 quando pedido não encontrado', async () => {
      vi.mocked(consultarEntregaOmie).mockRejectedValue(new Error('Pedido 999 não tem código Omie'))

      const res = await request(app).post('/api/omie/pedidos/999/consultar-entrega')

      expect(res.status).toBe(500)
      expect(res.body.error).toContain('não tem código Omie')
    })
  })

  // ─── GET /financeiro/resumo ───

  describe('GET /api/omie/financeiro/resumo', () => {
    it('retorna 200 com resumo financeiro', async () => {
      const res = await request(app).get('/api/omie/financeiro/resumo')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.totalReceber).toBe(1000)
      expect(res.body.data.totalPagar).toBe(500)
      expect(res.body.data.saldo).toBe(500)
    })

    it('retorna 500 quando financeiro falha', async () => {
      vi.mocked(obterResumoFinanceiro).mockRejectedValue(new Error('Credenciais Omie não configuradas'))

      const res = await request(app).get('/api/omie/financeiro/resumo')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  // ─── GET /config ───

  describe('GET /api/omie/config', () => {
    it('retorna configuração mascarada', async () => {
      const res = await request(app).get('/api/omie/config')

      expect(res.status).toBe(200)
      expect(res.body.configured).toBe(true)
    })
  })

  // ─── GET /status ───

  describe('GET /api/omie/status', () => {
    it('retorna status da conexão Omie', async () => {
      const res = await request(app).get('/api/omie/status')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.empresa).toBe('Test')
    })
  })

  // ─── GET /modules ───

  describe('GET /api/omie/modules', () => {
    it('retorna lista de módulos', async () => {
      const res = await request(app).get('/api/omie/modules')

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('geral')
      expect(res.body).toHaveProperty('crm')
      expect(res.body).toHaveProperty('financas')
    })
  })

  // ─── POST /call ───

  describe('POST /api/omie/call', () => {
    it('retorna 400 quando faltam parâmetros', async () => {
      const res = await request(app)
        .post('/api/omie/call')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('obrigatórios')
    })

    it('retorna 400 para módulo inexistente', async () => {
      const res = await request(app)
        .post('/api/omie/call')
        .send({ group: 'inexistente', module: 'xxx', action: 'listar' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('não encontrado')
    })
  })

  // ─── POST /sync/logistics ───

  describe('POST /api/omie/sync/logistics', () => {
    it('retorna resultado do sync logístico', async () => {
      const res = await request(app).post('/api/omie/sync/logistics')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual({ atualizados: 0, semPedido: 0, erros: [] })
    })

    it('retorna 500 quando sync falha', async () => {
      vi.mocked(syncOmieLogistics).mockRejectedValue(new Error('Sync failed'))

      const res = await request(app).post('/api/omie/sync/logistics')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })
})
