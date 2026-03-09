import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import {
  omieGetPedidosAcompanhamento,
  omieConsultarEntrega,
  omieGetFinanceiroResumo,
  omieSyncLogistics,
} from '../lib/omieApi'

function mockOk(data: any) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

describe('Omie API Extended', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── omieGetPedidosAcompanhamento ───

  describe('omieGetPedidosAcompanhamento', () => {
    it('chama GET /api/omie/pedidos/acompanhamento', async () => {
      mockOk({ success: true, data: [{ pedidoId: 1, numero: 'PED-001' }] })

      const result = await omieGetPedidosAcompanhamento()

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data![0].numero).toBe('PED-001')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('/api/omie/pedidos/acompanhamento')
    })

    it('retorna erro quando API falha', async () => {
      mockOk({ success: false, error: 'Credenciais não configuradas' })

      const result = await omieGetPedidosAcompanhamento()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Credenciais')
    })
  })

  // ─── omieConsultarEntrega ───

  describe('omieConsultarEntrega', () => {
    it('chama POST /api/omie/pedidos/:id/consultar-entrega', async () => {
      mockOk({
        success: true,
        data: { etapa: '50', nf: '1234', codigoRastreio: 'BR123', dataPrevisao: '15/03/2025', dataFaturamento: '10/03/2025', statusDescricao: 'Faturar' },
      })

      const result = await omieConsultarEntrega(42)

      expect(result.success).toBe(true)
      expect(result.data!.etapa).toBe('50')
      expect(result.data!.nf).toBe('1234')
      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('/api/omie/pedidos/42/consultar-entrega')
    })

    it('envia POST method', async () => {
      mockOk({ success: true, data: {} })

      await omieConsultarEntrega(1)

      const options = mockFetch.mock.calls[0][1]
      expect(options.method).toBe('POST')
    })
  })

  // ─── omieGetFinanceiroResumo ───

  describe('omieGetFinanceiroResumo', () => {
    it('chama GET /api/omie/financeiro/resumo', async () => {
      mockOk({
        success: true,
        data: { totalReceber: 5000, totalPagar: 2000, saldo: 3000, titulosVencidos: 1, titulosAVencer: 3, contasReceber: [], contasPagar: [] },
      })

      const result = await omieGetFinanceiroResumo()

      expect(result.success).toBe(true)
      expect(result.data!.totalReceber).toBe(5000)
      expect(result.data!.saldo).toBe(3000)
      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('/api/omie/financeiro/resumo')
    })

    it('retorna dados de títulos', async () => {
      mockOk({
        success: true,
        data: { totalReceber: 0, totalPagar: 0, saldo: 0, titulosVencidos: 5, titulosAVencer: 10, contasReceber: [{ id: 1 }], contasPagar: [{ id: 2 }] },
      })

      const result = await omieGetFinanceiroResumo()

      expect(result.data!.titulosVencidos).toBe(5)
      expect(result.data!.titulosAVencer).toBe(10)
      expect(result.data!.contasReceber).toHaveLength(1)
      expect(result.data!.contasPagar).toHaveLength(1)
    })
  })

  // ─── omieSyncLogistics ───

  describe('omieSyncLogistics', () => {
    it('chama POST /api/omie/sync/logistics', async () => {
      mockOk({ success: true, data: { atualizados: 3, semPedido: 1, erros: [] } })

      const result = await omieSyncLogistics()

      expect(result.success).toBe(true)
      expect(result.data!.atualizados).toBe(3)
      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('/api/omie/sync/logistics')
    })

    it('envia POST method', async () => {
      mockOk({ success: true, data: {} })

      await omieSyncLogistics()

      const options = mockFetch.mock.calls[0][1]
      expect(options.method).toBe('POST')
    })
  })
})
