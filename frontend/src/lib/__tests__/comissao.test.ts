import { describe, it, expect } from 'vitest'
import { calcularComissao, percentualVigente, campoComissao, type ComissaoProduto, type ComissaoLogEntry } from '../comissao'

const rows: ComissaoProduto[] = [
  { produtoId: 1, pctAClt: 2, pctBClt: 1.5, pctARca: 3, pctBRca: 2.5 },
  { produtoId: 2, pctAClt: null, pctBClt: null, pctARca: null, pctBRca: null },
]

const vend = (id: number, tipoComissao: 'clt' | 'rca' | null) =>
  ({ id, tipoComissao, nome: 'V', email: '', telefone: '', cargo: 'vendedor', avatar: '', metaVendas: 0, metaLeads: 0, metaConversao: 0, ativo: true, usuario: '' } as any)

const ped = (over: any) => ({
  id: 10, numero: 'PED-1', vendedorId: 1, status: 'confirmado', tabelaPreco: 'A',
  dataAprovacao: '2026-11-10T12:00:00Z', dataCriacao: '2026-11-10T12:00:00Z',
  itens: [{ produtoId: 1, nomeProduto: 'P1', preco: 100, quantidade: 10 }],
  ...over,
} as any)

describe('campoComissao', () => {
  it('mapeia tabela+tipo', () => {
    expect(campoComissao('A', 'clt')).toBe('pct_a_clt')
    expect(campoComissao('B', 'rca')).toBe('pct_b_rca')
    expect(campoComissao(undefined, 'clt')).toBe('pct_a_clt')
    expect(campoComissao('A', undefined)).toBeNull()
  })
})

describe('percentualVigente', () => {
  const log: ComissaoLogEntry[] = [
    { produtoId: 1, campo: 'pct_a_clt', valorAntigo: null, valorNovo: 2, alteradoPor: 'r', alteradoEm: '2026-11-05T10:00:00Z' },
    { produtoId: 1, campo: 'pct_a_clt', valorAntigo: 2, valorNovo: 4, alteradoPor: 'r', alteradoEm: '2026-11-15T10:00:00Z' },
  ]
  const map = new Map(rows.map(r => [r.produtoId, { ...r, pctAClt: 4 }]))

  it('pedido aprovado ANTES da mudanca usa percentual antigo', () => {
    expect(percentualVigente(1, 'pct_a_clt', new Date('2026-11-10T12:00:00Z'), map, log)).toBe(2)
  })
  it('pedido aprovado DEPOIS da mudanca usa percentual novo', () => {
    expect(percentualVigente(1, 'pct_a_clt', new Date('2026-11-20T12:00:00Z'), map, log)).toBe(4)
  })
  it('sem log posterior usa valor atual', () => {
    expect(percentualVigente(1, 'pct_b_clt', new Date('2026-11-10T12:00:00Z'), map, log)).toBe(1.5)
  })
})

describe('calcularComissao', () => {
  it('CLT tabela A: valor x pct_a_clt', () => {
    const r = calcularComissao([ped({})], [vend(1, 'clt')], rows, [])
    expect(r.total).toBe(20)
    expect(r.itens[0].pct).toBe(2)
  })
  it('RCA tabela A usa pct_a_rca', () => {
    const r = calcularComissao([ped({})], [vend(1, 'rca')], rows, [])
    expect(r.total).toBe(30)
  })
  it('tabela B usa coluna B', () => {
    const r = calcularComissao([ped({ tabelaPreco: 'B' })], [vend(1, 'clt')], rows, [])
    expect(r.total).toBe(15)
  })
  it('produto sem percentual entra como 0 e e reportado', () => {
    const r = calcularComissao([ped({ itens: [{ produtoId: 2, nomeProduto: 'P2', preco: 100, quantidade: 10 }] })], [vend(1, 'clt')], rows, [])
    expect(r.total).toBe(0)
    expect(r.produtosSemPercentual).toContain(2)
  })
  it('vendedor sem tipo reportado', () => {
    const r = calcularComissao([ped({})], [vend(1, null)], rows, [])
    expect(r.total).toBe(0)
    expect(r.pedidosSemTipoVendedor).toContain('PED-1')
  })
  it('ignora nao confirmados e fora do periodo', () => {
    const r = calcularComissao([ped({ status: 'pendente' }), ped({ id: 11, dataAprovacao: '2025-01-01T00:00:00Z' })], [vend(1, 'clt')], rows, [],
      new Date('2026-11-01'), new Date('2026-11-30'))
    expect(r.total).toBe(0)
  })
  it('vigencia historica antes/depois da mudanca', () => {
    const log: ComissaoLogEntry[] = [
      { produtoId: 1, campo: 'pct_a_clt', valorAntigo: null, valorNovo: 2, alteradoPor: 'r', alteradoEm: '2026-11-05T10:00:00Z' },
      { produtoId: 1, campo: 'pct_a_clt', valorAntigo: 2, valorNovo: 4, alteradoPor: 'r', alteradoEm: '2026-11-15T10:00:00Z' },
    ]
    const rowsAtuais = rows.map(r => r.produtoId === 1 ? { ...r, pctAClt: 4 } : r)
    const antes = ped({ id: 20, dataAprovacao: '2026-11-10T12:00:00Z' })
    const depois = ped({ id: 21, dataAprovacao: '2026-11-20T12:00:00Z' })
    const r = calcularComissao([antes, depois], [vend(1, 'clt')], rowsAtuais, log)
    expect(r.itens.find(i => i.pedidoId === 20)?.pct).toBe(2)
    expect(r.itens.find(i => i.pedidoId === 21)?.pct).toBe(4)
    expect(r.total).toBe(60)
  })
})
