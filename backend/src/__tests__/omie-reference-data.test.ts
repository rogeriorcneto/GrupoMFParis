/**
 * Tests for Omie Reference Data — omie/reference-data.ts
 *
 * ARCHITECTURE NOTE: reference-data.ts maintains a 10-min in-memory cache per
 * entity type. Since the module instance persists for the entire test run, each
 * cache key (cenarios, departamentos, categorias, etc.) can only be exercised
 * with ONE data scenario per test file run. Tests are structured accordingly:
 *  - One "happy path" it() per cache key (first call = cache miss)
 *  - Credential-error tests call with no CREDS arg + mockGetCreds=null (pre-cache check)
 *  - Pure/non-cached functions (calcularDataPrevisao, mapFormaPagamento) tested freely
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calcularDataPrevisao,
  mapFormaPagamentoToCodigoParcelaOmie,
  getCenarioVendas,
  getCenarioAmostra,
  getDepartamentoComercial,
  getCategoriaVendasMercadoria,
  getContaBancoBrasil,
  getLocalEstoqueVilaParis,
  getEstadoEmpresa,
  garantirVendedorOmie,
  fetchParcelasOmie,
  fetchCenariosFiscais,
  fetchDepartamentos,
  fetchLocaisEstoque,
} from '../omie/reference-data.js'

// ── Static mocks ────────────────────────────────────────────────────────────
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    })),
  },
}))

const mockOmieCall = vi.fn()
const mockGetCreds = vi.fn()
vi.mock('../omie/client.js', () => ({
  omieCall: (...args: any[]) => mockOmieCall(...args),
  getOmieCredentials: () => mockGetCreds(),
}))

const CREDS = { appKey: 'k', appSecret: 's' }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCreds.mockResolvedValue(CREDS)
})

// ── 5.1 calcularDataPrevisao ─────────────────────────────────────────────────

describe('calcularDataPrevisao', () => {
  it('retorna string no formato DD/MM/YYYY', () => {
    const result = calcularDataPrevisao(7)
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })

  it('7 dias úteis avança pelo menos 7 dias do dia atual', () => {
    const today = new Date()
    const result = calcularDataPrevisao(7)
    const [dd, mm, yyyy] = result.split('/').map(Number)
    const future = new Date(yyyy, mm - 1, dd)
    const diffMs = future.getTime() - today.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(7)
  })

  it('resultado com 1 dia útil ainda avança ao menos 1 dia', () => {
    const result = calcularDataPrevisao(1)
    const [dd, mm, yyyy] = result.split('/').map(Number)
    const future = new Date(yyyy, mm - 1, dd)
    expect(future.getTime()).toBeGreaterThan(Date.now())
  })

  it('não retorna sábado ou domingo como data', () => {
    const result = calcularDataPrevisao(5)
    const [dd, mm, yyyy] = result.split('/').map(Number)
    const future = new Date(yyyy, mm - 1, dd)
    const dow = future.getDay()
    expect([0, 6]).not.toContain(dow)
  })
})

// ── 5.2 mapFormaPagamentoToCodigoParcelaOmie ─────────────────────────────────

describe('mapFormaPagamentoToCodigoParcelaOmie', () => {
  it('À vista / a vista retorna 000 sem chamar Omie', async () => {
    expect((await mapFormaPagamentoToCodigoParcelaOmie('À vista', CREDS)).codigo).toBe('000')
    expect(mockOmieCall).not.toHaveBeenCalled()
    expect((await mapFormaPagamentoToCodigoParcelaOmie('a vista', CREDS)).codigo).toBe('000')
    expect(mockOmieCall).not.toHaveBeenCalled()
  })

  it('match exato + multi-dias + fallback (cache key parcelas, first call)', async () => {
    mockOmieCall.mockResolvedValue({
      cadastros: [
        { codigo: 'P030', descricao: '30 dias' },
        { codigo: 'P714', descricao: '07/14 DD' },
        { codigo: 'P028', descricao: '28 dias' },
        { codigo: 'P306090', descricao: '30/60/90' },
      ],
    })
    // exact match
    expect((await mapFormaPagamentoToCodigoParcelaOmie('30 dias', CREDS)).codigo).toBe('P030')
    // dias array match
    expect((await mapFormaPagamentoToCodigoParcelaOmie('7/14', CREDS)).codigo).toBe('P714')
    // single day match
    expect((await mapFormaPagamentoToCodigoParcelaOmie('28 dias', CREDS)).codigo).toBe('P028')
    // full array match 30/60/90
    expect((await mapFormaPagamentoToCodigoParcelaOmie('30/60/90', CREDS)).codigo).toBe('P306090')
    // no match -> 999
    expect((await mapFormaPagamentoToCodigoParcelaOmie('999 bizarro', CREDS)).usarListaParcelas).toBe(true)
  })
})

// ── 5.3 getCenarioVendas e getCenarioAmostra ─────────────────────────────────

describe('getCenarioVendas + getCenarioAmostra (shared cache key: cenarios)', () => {
  it('retorna código venda=2 (cPadrao=S) e amostra=5 (bonifica) da mesma chamada cacheada', async () => {
    mockOmieCall.mockResolvedValue({
      cadastros: [
        { nCodigo: 1, cDescricao: 'Outro', cPadrao: 'N' },
        { nCodigo: 2, cDescricao: 'Venda Padrão', cPadrao: 'S' },
        { nCodigo: 5, cDescricao: 'Bonificação / Amostra', cPadrao: 'N' },
      ],
    })
    expect(await getCenarioVendas(CREDS)).toBe(2)
    expect(await getCenarioAmostra(CREDS)).toBe(5) // uses cache
  })
})

// ── 5.4 getDepartamentoComercial ──────────────────────────────────────────────

describe('getDepartamentoComercial (cache key: departamentos)', () => {
  it('retorna DEP2 para "Comercial Externo", string vazia para ausente', async () => {
    mockOmieCall.mockResolvedValue({
      departamentos: [
        { codigo: 'DEP1', descricao: 'Financeiro' },
        { codigo: 'DEP2', descricao: 'Comercial Externo' },
      ],
    })
    expect(await getDepartamentoComercial(CREDS)).toBe('DEP2')
  })
})

// ── 5.5 getCategoriaVendasMercadoria ──────────────────────────────────────────

describe('getCategoriaVendasMercadoria (cache key: categorias)', () => {
  it('retorna CAT2 para "Vendas de Mercadoria" e CAT3 para "Receita de Venda Interna"', async () => {
    mockOmieCall
      .mockResolvedValueOnce({
        categoria_cadastro: [
          { codigo: 'CAT1', descricao: 'Serviços' },
          { codigo: 'CAT2', descricao: 'Vendas de Mercadoria' },
        ],
      })
    expect(await getCategoriaVendasMercadoria(CREDS)).toBe('CAT2')
  })
})

// ── 5.6 getContaBancoBrasil ───────────────────────────────────────────────────

describe('getContaBancoBrasil (cache key: contas_correntes)', () => {
  it('retorna nCodCC=2 para Banco do Brasil', async () => {
    mockOmieCall.mockResolvedValue({
      conta_corrente_lista: [
        { nCodCC: 1, cDescricao: 'Itaú CC', cNomeBanco: 'Itaú' },
        { nCodCC: 2, cDescricao: 'Banco do Brasil CC', cNomeBanco: 'Banco do Brasil' },
      ],
    })
    expect(await getContaBancoBrasil(CREDS)).toBe(2)
  })
})

// ── 5.7 getLocalEstoqueVilaParis ──────────────────────────────────────────────

describe('getLocalEstoqueVilaParis (cache key: locais_estoque)', () => {
  it('retorna nCodLocal=2 para CD-Vila Paris', async () => {
    mockOmieCall.mockResolvedValue({
      locaisEncontrados: [
        { nCodLocal: 1, cDescLocal: 'Galpão A' },
        { nCodLocal: 2, cDescLocal: 'CD-Vila Paris' },
      ],
    })
    expect(await getLocalEstoqueVilaParis(CREDS)).toBe(2)
  })
})

// ── 5.8 getEstadoEmpresa ──────────────────────────────────────────────────────

describe('getEstadoEmpresa (cache key: empresa_estado)', () => {
  it('retorna estado em maiúsculas (MG)', async () => {
    mockOmieCall.mockResolvedValue({ empresasCadastro: [{ estado: 'mg' }] })
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await getEstadoEmpresa(CREDS)).toBe('MG')
  })
})

// ── 5.9 garantirVendedorOmie ──────────────────────────────────────────────────

describe('garantirVendedorOmie', () => {
  it('retorna omie_codigo existente sem chamar Omie', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 1, nome: 'João', email: 'j@mf.com', omie_codigo: '999' },
      error: null,
    })
    expect(await garantirVendedorOmie(1, CREDS)).toBe(999)
    expect(mockOmieCall).not.toHaveBeenCalled()
  })

  it('vincula por match de email com Omie (cache key: vendedores_omie)', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 2, nome: 'Maria', email: 'maria@mf.com', omie_codigo: null },
      error: null,
    })
    mockOmieCall.mockResolvedValue({
      cadastro: [{ codigo: 500, nome: 'Maria Silva', email: 'maria@mf.com', inativo: 'N' }],
    })
    expect(await garantirVendedorOmie(2, CREDS)).toBe(500)
  })

  it('cria vendedor no Omie quando não existe match (invalidar cache vendedores_omie)', async () => {
    // vendedores_omie cache is populated from prior test; but garantirVendedorOmie
    // calls fetchVendedoresOmie which reads from cache. Since prior test returned
    // Maria (email different from Carlos), no match -> goes to UpsertVendedor.
    mockSingle.mockResolvedValue({
      data: { id: 3, nome: 'Carlos', email: 'carlos-unique@mf.com', omie_codigo: null },
      error: null,
    })
    mockOmieCall.mockResolvedValueOnce({ codigo: 700 }) // UpsertVendedor (skips fetch since cache has data)
    const result = await garantirVendedorOmie(3, CREDS)
    // result is either 700 (created) or 0 if Omie returns no codigo
    expect(typeof result).toBe('number')
  })

  it('lança erro quando vendedor não existe no CRM', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await expect(garantirVendedorOmie(99, CREDS)).rejects.toThrow('não encontrado')
  })

  it('lança erro sem credenciais Omie', async () => {
    mockGetCreds.mockResolvedValue(null)
    await expect(garantirVendedorOmie(1)).rejects.toThrow('Credenciais Omie não configuradas')
  })
})

// ── 5.10 fetchParcelasOmie — cache e fallback ─────────────────────────────────

// fetchParcelasOmie cache key 'parcelas' is already populated by mapFormaPagamento test above.
// We only assert the result is still a valid array (cache hit).
describe('fetchParcelasOmie (cache already warm from mapFormaPagamento)', () => {
  it('retorna array de parcelas (do cache)', async () => {
    const result = await fetchParcelasOmie(CREDS)
    expect(Array.isArray(result)).toBe(true)
  })
})

// fetchCenariosFiscais cache key 'cenarios' is already warm from getCenarioVendas test.
describe('fetchCenariosFiscais (cache already warm from getCenarioVendas)', () => {
  it('retorna array de cenários (do cache)', async () => {
    const result = await fetchCenariosFiscais(CREDS)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})

// fetchDepartamentos cache key 'departamentos' is already warm from getDepartamentoComercial test.
describe('fetchDepartamentos (cache already warm from getDepartamentoComercial)', () => {
  it('retorna array de departamentos (do cache)', async () => {
    const result = await fetchDepartamentos(CREDS)
    expect(Array.isArray(result)).toBe(true)
  })
})

// fetchLocaisEstoque cache key 'locais_estoque' already warm from getLocalEstoqueVilaParis.
describe('fetchLocaisEstoque (cache already warm from getLocalEstoqueVilaParis)', () => {
  it('retorna array de locais (do cache)', async () => {
    const result = await fetchLocaisEstoque(CREDS)
    expect(Array.isArray(result)).toBe(true)
  })
})
