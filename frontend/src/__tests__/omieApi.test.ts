import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import {
  omieGetConfig,
  omieSaveConfig,
  omieGetStatus,
  omieGetModules,
  omieApiCall,
  omieApiCallAll,
  omieSyncDiff,
  omieSyncPull,
  omieSyncPush,
} from '../lib/omieApi'

function mockOk(data: any) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

describe('omieApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-stub fetch for each test (clearAllMocks resets it)
    mockFetch.mockReset()
  })

  describe('omieGetConfig', () => {
    it('fetches GET /api/omie/config with auth header', async () => {
      mockOk({ configured: true, appKey: 'k', appSecret: 's' })
      const result = await omieGetConfig()
      expect(result.configured).toBe(true)
      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/omie/config')
      expect(opts.headers?.Authorization).toBe('Bearer test-token')
    })
  })

  describe('omieSaveConfig', () => {
    it('sends POST with appKey and appSecret', async () => {
      mockOk({ success: true, empresa: 'Test Corp' })
      const result = await omieSaveConfig('mykey', 'mysecret')
      expect(result.success).toBe(true)
      expect(result.empresa).toBe('Test Corp')
      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.method).toBe('POST')
      const body = JSON.parse(opts.body)
      expect(body.appKey).toBe('mykey')
      expect(body.appSecret).toBe('mysecret')
    })
  })

  describe('omieGetStatus', () => {
    it('fetches GET /api/omie/status', async () => {
      mockOk({ success: true, empresa: 'Empresa X' })
      const result = await omieGetStatus()
      expect(result.success).toBe(true)
      expect(result.empresa).toBe('Empresa X')
    })
  })

  describe('omieGetModules', () => {
    it('fetches GET /api/omie/modules', async () => {
      const modules = { geral: [{ key: 'clientes', label: 'Clientes', description: '', methods: [] }] }
      mockOk(modules)
      const result = await omieGetModules()
      expect(result.geral).toHaveLength(1)
      expect(result.geral[0].key).toBe('clientes')
    })
  })

  describe('omieApiCall', () => {
    it('sends POST with group, module, action, params', async () => {
      mockOk({ success: true, data: { clientes: [] } })
      const result = await omieApiCall('geral', 'clientes', 'ListarClientes', { pagina: 1 })
      expect(result.success).toBe(true)
      const [, opts] = mockFetch.mock.calls[0]
      const body = JSON.parse(opts.body)
      expect(body.group).toBe('geral')
      expect(body.module).toBe('clientes')
      expect(body.action).toBe('ListarClientes')
      expect(body.params.pagina).toBe(1)
    })
  })

  describe('omieApiCallAll', () => {
    it('sends POST with resultKey for pagination', async () => {
      mockOk({ success: true, data: [{ id: 1 }], total: 1 })
      const result = await omieApiCallAll('geral', 'clientes', 'ListarClientes', 'clientes_cadastro')
      expect(result.total).toBe(1)
      const [, opts] = mockFetch.mock.calls[0]
      const body = JSON.parse(opts.body)
      expect(body.resultKey).toBe('clientes_cadastro')
    })
  })

  describe('omieSyncDiff', () => {
    it('sends POST /api/omie/sync/diff', async () => {
      mockOk({ success: true, data: { novos: [], atualizados: [], semAlteracao: [], totalOmie: 10, totalCrm: 5 } })
      const result = await omieSyncDiff()
      expect(result.success).toBe(true)
      expect(result.data?.totalOmie).toBe(10)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/sync/diff')
      expect(opts.method).toBe('POST')
    })
  })

  describe('omieSyncPull', () => {
    it('sends POST with vendedorIdPadrao', async () => {
      mockOk({ success: true, data: { inseridos: 3, atualizados: 1, erros: [] } })
      const result = await omieSyncPull(5)
      expect(result.data?.inseridos).toBe(3)
      const [, opts] = mockFetch.mock.calls[0]
      const body = JSON.parse(opts.body)
      expect(body.vendedorIdPadrao).toBe(5)
    })
  })

  describe('omieSyncPush', () => {
    it('sends POST /api/omie/sync/push', async () => {
      mockOk({ success: true, data: { enviados: 2, erros: [] } })
      const result = await omieSyncPush()
      expect(result.data?.enviados).toBe(2)
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/sync/push')
    })
  })
})
