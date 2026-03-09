import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockSelect = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockNot = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockIn = vi.fn()

const mockFrom = vi.fn().mockReturnValue({
  select: mockSelect.mockReturnValue({
    eq: mockEq.mockReturnValue({
      single: mockSingle,
    }),
    not: mockNot.mockReturnValue({
      order: mockOrder.mockReturnValue({
        limit: mockLimit,
      }),
    }),
    in: mockIn,
  }),
  update: mockUpdate.mockReturnValue({
    eq: mockEq,
  }),
})

vi.mock('../supabase.js', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}))

// Mock config-store
vi.mock('../config-store.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    omieAppKey: 'ENC:test-key',
    omieAppSecret: 'ENC:test-secret',
  }),
}))

// Mock crypto
vi.mock('../crypto.js', () => ({
  encrypt: (text: string) => `ENC:${text}`,
  decrypt: (text: string) => text.startsWith('ENC:') ? text.slice(4) : text,
}))

// Mock logger
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

// Mock omie client
const mockOmieCall = vi.fn()
const mockGetCreds = vi.fn()

vi.mock('../omie/client.js', () => ({
  omieCall: (...args: any[]) => mockOmieCall(...args),
  getOmieCredentials: () => mockGetCreds(),
}))

import {
  consultarEntregaOmie,
  listarPedidosOmieAcompanhamento,
  obterResumoFinanceiro,
  criarPedidoOmie,
  consultarPedidoOmie,
  onPedidoAprovado,
} from '../omie/pedidos.js'

describe('Omie Pedidos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCreds.mockResolvedValue({ appKey: 'test-key', appSecret: 'test-secret' })
  })

  // ─── consultarEntregaOmie ───

  describe('consultarEntregaOmie', () => {
    it('retorna dados de entrega quando pedido tem omie_codigo', async () => {
      mockSingle.mockResolvedValue({ data: { omie_codigo: '12345' }, error: null })
      mockOmieCall.mockResolvedValue({
        cabecalho: { etapa: '50', data_previsao: '15/03/2025', descricao_etapa: 'Faturar' },
        infoCadastro: { nNumeroNF: 1234, dDataFaturamento: '10/03/2025' },
        transporte: { codigo_rastreio: 'BR123456789' },
      })

      const result = await consultarEntregaOmie(1)

      expect(result.etapa).toBe('50')
      expect(result.dataPrevisao).toBe('15/03/2025')
      expect(result.nf).toBe('1234')
      expect(result.codigoRastreio).toBe('BR123456789')
      expect(result.dataFaturamento).toBe('10/03/2025')
      expect(result.statusDescricao).toBe('Faturar')
    })

    it('lança erro quando pedido não tem omie_codigo', async () => {
      mockSingle.mockResolvedValue({ data: { omie_codigo: null }, error: null })
      await expect(consultarEntregaOmie(99)).rejects.toThrow('não tem código Omie')
    })

    it('lança erro sem credenciais', async () => {
      mockGetCreds.mockResolvedValue(null)
      await expect(consultarEntregaOmie(1)).rejects.toThrow('Credenciais Omie não configuradas')
    })

    it('retorna campos vazios quando Omie retorna dados parciais', async () => {
      mockSingle.mockResolvedValue({ data: { omie_codigo: '12345' }, error: null })
      mockOmieCall.mockResolvedValue({})

      const result = await consultarEntregaOmie(1)
      expect(result.etapa).toBe('')
      expect(result.nf).toBe('')
      expect(result.codigoRastreio).toBe('')
    })
  })

  // ─── consultarPedidoOmie ───

  describe('consultarPedidoOmie', () => {
    it('consulta status do pedido no Omie', async () => {
      mockSingle.mockResolvedValue({ data: { omie_codigo: '999' }, error: null })
      mockOmieCall.mockResolvedValue({ etapa: '50', descricao: 'Faturado' })

      const result = await consultarPedidoOmie(1)
      expect(result).toEqual({ etapa: '50', descricao: 'Faturado' })
      expect(mockOmieCall).toHaveBeenCalledWith(
        '/produtos/pedido/',
        'StatusPedido',
        [{ codigo_pedido: 999 }],
        expect.any(Object)
      )
    })

    it('erro sem omie_codigo', async () => {
      mockSingle.mockResolvedValue({ data: null, error: null })
      await expect(consultarPedidoOmie(1)).rejects.toThrow('não tem código Omie')
    })
  })

  // ─── onPedidoAprovado ───

  describe('onPedidoAprovado', () => {
    it('retorna success false quando criarPedidoOmie falha', async () => {
      // Make criarPedidoOmie fail by not having a pedido
      mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

      const result = await onPedidoAprovado(999)
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  // ─── obterResumoFinanceiro ───

  describe('obterResumoFinanceiro', () => {
    it('retorna resumo financeiro com dados do Omie', async () => {
      mockOmieCall
        .mockResolvedValueOnce({
          conta_receber_cadastro: [
            { valor_documento: 1000, data_vencimento: '2099-01-01', status_titulo: 'ABERTO' },
            { valor_documento: 500, data_vencimento: '2020-01-01', status_titulo: 'ABERTO' },
          ],
        })
        .mockResolvedValueOnce({
          conta_pagar_cadastro: [
            { valor_documento: 300, data_vencimento: '2099-06-01', status_titulo: 'ABERTO' },
          ],
        })

      const result = await obterResumoFinanceiro()

      expect(result.totalReceber).toBe(1500)
      expect(result.totalPagar).toBe(300)
      expect(result.saldo).toBe(1200)
      expect(result.titulosVencidos).toBe(1)
      expect(result.titulosAVencer).toBe(1)
      expect(result.contasReceber).toHaveLength(2)
      expect(result.contasPagar).toHaveLength(1)
    })

    it('lida com erro nas chamadas Omie (catch fallback)', async () => {
      mockOmieCall
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))

      const result = await obterResumoFinanceiro()
      expect(result.totalReceber).toBe(0)
      expect(result.totalPagar).toBe(0)
      expect(result.saldo).toBe(0)
    })

    it('erro sem credenciais', async () => {
      mockGetCreds.mockResolvedValue(null)
      await expect(obterResumoFinanceiro()).rejects.toThrow('Credenciais Omie não configuradas')
    })

    it('retorna listas vazias quando Omie não tem dados', async () => {
      mockOmieCall
        .mockResolvedValueOnce({ conta_receber_cadastro: [] })
        .mockResolvedValueOnce({ conta_pagar_cadastro: [] })

      const result = await obterResumoFinanceiro()
      expect(result.totalReceber).toBe(0)
      expect(result.totalPagar).toBe(0)
      expect(result.contasReceber).toHaveLength(0)
      expect(result.contasPagar).toHaveLength(0)
    })
  })

  // ─── listarPedidosOmieAcompanhamento ───

  describe('listarPedidosOmieAcompanhamento', () => {
    it('retorna lista vazia quando não há pedidos com omie_codigo', async () => {
      mockLimit.mockResolvedValue({ data: [], error: null })

      const result = await listarPedidosOmieAcompanhamento()
      expect(result).toEqual([])
    })

    it('erro sem credenciais', async () => {
      mockGetCreds.mockResolvedValue(null)
      await expect(listarPedidosOmieAcompanhamento()).rejects.toThrow('Credenciais Omie não configuradas')
    })

    it('lança erro quando supabase retorna erro', async () => {
      mockLimit.mockResolvedValue({ data: null, error: { message: 'DB error' } })

      await expect(listarPedidosOmieAcompanhamento()).rejects.toThrow('DB error')
    })
  })
})
