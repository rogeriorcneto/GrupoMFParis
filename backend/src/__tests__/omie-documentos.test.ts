import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Supabase chain mock — pedidos + vendedores
// ============================================================
const db: Record<string, any> = {
  pedido_row: { id: 10, omie_codigo: 9680000000, omie_numero: '000000000000001', vendedor_id: 5 },
  vendedor_row: { id: 5, cargo: 'vendedor' },
}

function thenable(result: any) {
  return { then: (resolve: any) => Promise.resolve(resolve(result)) }
}

function chainFor(table: string): any {
  const q: any = {}
  for (const m of ['select', 'not', 'in', 'eq', 'ilike', 'order', 'limit']) {
    q[m] = vi.fn(() => q)
  }
  q.then = (resolve: any) => Promise.resolve(resolve({ data: [], error: null }))
  q.maybeSingle = vi.fn(async () => {
    if (table === 'pedidos') return { data: db.pedido_row, error: null }
    if (table === 'vendedores') return { data: db.vendedor_row, error: null }
    return { data: null, error: null }
  })
  q.single = vi.fn(async () => ({ data: null, error: null }))
  return q
}

const mockFrom = vi.fn((table: string) => ({
  select: vi.fn(() => chainFor(table)),
  update: vi.fn(() => chainFor(table)),
  insert: vi.fn(() => thenable({ error: null })),
}))

vi.mock('../supabase.js', () => ({ supabase: { from: (t: string) => mockFrom(t) } }))
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() } }))

const mockOmieCall = vi.fn()
vi.mock('../omie/client.js', () => ({
  omieCall: (...args: any[]) => mockOmieCall(...args),
  getOmieCredentials: vi.fn().mockResolvedValue({ appKey: 'k', appSecret: 's' }),
  getOmieEmpresas: vi.fn().mockResolvedValue([{ appKey: 'k', appSecret: 's' }]),
}))

import { obterDocumentosPedido, obterXmlNfePedido, PedidoDocsError } from '../omie/documentos.js'

const AUTH_USER = 'auth-user-vendedor-5'

function mockDocFlow(nfe: any = {}) {
  mockOmieCall.mockImplementation((_endpoint: string, call: string) => {
    if (call === 'ObterPedVenda') return Promise.resolve({ cPdfPed: 'https://cdn.omie/pedido.pdf', cNumPed: '12686' })
    if (call === 'ListarDocumentos') {
      return Promise.resolve({
        documentosEncontrados: [{
          nIdNF: 9722256618, nNumero: 12570, cSerie: '803', nValor: 5962,
          nChave: '31260933174960000127558030000125701143906521', dEmissao: '10/10/2026',
        }],
      })
    }
    if (call === 'ObterNfe') {
      return Promise.resolve({
        cPdf: 'https://click.omie.com/pdfnfe-x', cLinkPortal: 'https://click.omie.com/portal',
        cXmlNfe: '&lt;?xml version=&quot;1.0&quot;?&gt;&lt;nfeProc&gt;&lt;NFe&gt;ok&lt;/NFe&gt;&lt;/nfeProc&gt;',
        ...nfe,
      })
    }
    return Promise.reject(new Error('call inesperada'))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.pedido_row = { id: 10, omie_codigo: 9680000000, omie_numero: '000000000000001', vendedor_id: 5 }
  db.vendedor_row = { id: 5, cargo: 'vendedor' }
})

describe('obterDocumentosPedido', () => {
  it('pedido faturado → retorna PDF do pedido + NF-e completa', async () => {
    mockDocFlow()
    const r = await obterDocumentosPedido(10, AUTH_USER)
    expect(r.pdfPedido).toContain('pedido.pdf')
    expect(r.nfe).not.toBeNull()
    expect(r.nfe!.numero).toBe('12570')
    expect(r.nfe!.serie).toBe('803')
    expect(r.nfe!.chave).toHaveLength(44)
    expect(r.nfe!.valor).toBe(5962)
    expect(r.nfe!.emissao).toBe('10/10/2026')
    expect(r.nfe!.pdfDanfe).toContain('pdfnfe')
    expect(r.nfe!.linkPortal).toContain('click.omie')
    expect(r.nfe!.xml).toContain('&lt;')
  })

  it('pedido sem NF → pdfPedido presente, nfe = null', async () => {
    mockOmieCall.mockImplementation((_e: string, call: string) => {
      if (call === 'ObterPedVenda') return Promise.resolve({ cPdfPed: 'https://cdn.omie/p.pdf' })
      if (call === 'ListarDocumentos') return Promise.reject(new Error('Não existem registros para a página [1]!'))
      return Promise.reject(new Error('call inesperada'))
    })
    const r = await obterDocumentosPedido(10, AUTH_USER)
    expect(r.pdfPedido).toContain('p.pdf')
    expect(r.nfe).toBeNull()
  })

  it('ListarDocumentos retorna array vazio → nfe = null', async () => {
    mockOmieCall.mockImplementation((_e: string, call: string) => {
      if (call === 'ObterPedVenda') return Promise.resolve({ cPdfPed: 'x' })
      if (call === 'ListarDocumentos') return Promise.resolve({ documentosEncontrados: [] })
      return Promise.reject(new Error('call inesperada'))
    })
    const r = await obterDocumentosPedido(10, AUTH_USER)
    expect(r.nfe).toBeNull()
  })

  it('pedido sem omie_codigo → erro 400', async () => {
    db.pedido_row = { id: 10, omie_codigo: null, omie_numero: null, vendedor_id: 5 }
    await expect(obterDocumentosPedido(10, AUTH_USER)).rejects.toMatchObject({ status: 400 })
  })

  it('pedido inexistente no CRM → erro 404', async () => {
    db.pedido_row = null
    await expect(obterDocumentosPedido(999, AUTH_USER)).rejects.toMatchObject({ status: 404 })
  })

  it('pedido não encontrado em nenhuma empresa Omie → erro 404', async () => {
    mockOmieCall.mockRejectedValue(new Error('Pedido não cadastrado'))
    await expect(obterDocumentosPedido(10, AUTH_USER)).rejects.toMatchObject({ status: 404 })
  })

  it('ObterNfe falha → retorna NF com dados do ListarDocumentos, sem pdfDanfe', async () => {
    mockOmieCall.mockImplementation((_e: string, call: string) => {
      if (call === 'ObterPedVenda') return Promise.resolve({ cPdfPed: 'x' })
      if (call === 'ListarDocumentos') {
        return Promise.resolve({ documentosEncontrados: [{ nIdNF: 1, nNumero: 9, cSerie: '1', nChave: 'K'.repeat(44), cXml: '&lt;xml&gt;' }] })
      }
      if (call === 'ObterNfe') return Promise.reject(new Error('NF-e não localizada'))
      return Promise.reject(new Error('call inesperada'))
    })
    const r = await obterDocumentosPedido(10, AUTH_USER)
    expect(r.nfe!.numero).toBe('9')
    expect(r.nfe!.pdfDanfe).toBeNull()
    expect(r.nfe!.xml).toBe('&lt;xml&gt;')
  })

  it('multi-empresa: pedido só existe na 2ª credencial', async () => {
    const { getOmieEmpresas } = await import('../omie/client.js')
    ;(getOmieEmpresas as any).mockResolvedValueOnce([{ appKey: 'a', appSecret: 'a' }, { appKey: 'b', appSecret: 'b' }])
    let pdfCalls = 0
    mockOmieCall.mockImplementation((_e: string, call: string, _p: any, opts: any) => {
      if (call === 'ObterPedVenda') {
        pdfCalls++
        if (opts?.credentials?.appKey === 'a') return Promise.reject(new Error('Pedido não cadastrado'))
        return Promise.resolve({ cPdfPed: 'https://cdn.omie/b.pdf' })
      }
      if (call === 'ListarDocumentos') return Promise.resolve({ documentosEncontrados: [] })
      return Promise.reject(new Error('call inesperada'))
    })
    const r = await obterDocumentosPedido(10, AUTH_USER)
    expect(pdfCalls).toBe(2)
    expect(r.pdfPedido).toContain('b.pdf')
  })

  it('vendedor sem permissão (pedido de outro vendedor) → 403', async () => {
    db.vendedor_row = { id: 99, cargo: 'vendedor' } // pedido é do vendedor 5
    await expect(obterDocumentosPedido(10, AUTH_USER)).rejects.toMatchObject({ status: 403 })
  })

  it('gerente acessa pedido de qualquer vendedor', async () => {
    db.vendedor_row = { id: 1, cargo: 'gerente' }
    mockDocFlow()
    const r = await obterDocumentosPedido(10, AUTH_USER)
    expect(r.pdfPedido).toContain('pedido.pdf')
  })
})

describe('obterXmlNfePedido', () => {
  it('retorna XML desescapado + chave', async () => {
    mockDocFlow()
    const { xml, chave } = await obterXmlNfePedido(10, AUTH_USER)
    expect(chave).toBe('31260933174960000127558030000125701143906521')
    expect(xml.startsWith('<?xml version="1.0"?>')).toBe(true)
    expect(xml).toContain('<nfeProc>')
    expect(xml).not.toContain('&lt;')
    expect(xml).not.toContain('&quot;')
    expect(xml).not.toContain('&amp;')
  })

  it('decodifica todas as entidades comuns', async () => {
    mockDocFlow({ cXmlNfe: '&lt;a b=&quot;x&quot;&gt;A&amp;B &#233;&lt;/a&gt;' })
    const { xml } = await obterXmlNfePedido(10, AUTH_USER)
    expect(xml).toBe('<a b="x">A&B é</a>')
  })

  it('sem NF emitida → erro 404', async () => {
    mockOmieCall.mockImplementation((_e: string, call: string) => {
      if (call === 'ObterPedVenda') return Promise.resolve({ cPdfPed: 'x' })
      if (call === 'ListarDocumentos') return Promise.reject(new Error('Não existem registros'))
      return Promise.reject(new Error('call inesperada'))
    })
    await expect(obterXmlNfePedido(10, AUTH_USER)).rejects.toMatchObject({ status: 404 })
  })
})
