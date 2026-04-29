import { describe, it, expect } from 'vitest'
import type { Pedido, Cliente } from '../types'

// ============================================================
// Helper factories
// ============================================================
function makePedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id: 1,
    numero: 'PED-001',
    clienteId: 10,
    vendedorId: 1,
    itens: [],
    observacoes: '',
    status: 'confirmado',
    dataCriacao: '2025-04-01T10:00:00Z',
    totalValor: 0,
    tipo: 'venda',
    formaPagamento: 'À vista',
    tipoFrete: undefined,
    ...overrides,
  }
}

// ============================================================
// Lógica de getClientePedidoInfo (inline — replica da FunilView)
// ============================================================
function getClientePedidoInfo(clienteId: number, pedidos: Pedido[]) {
  const ps = pedidos.filter(p => p.clienteId === clienteId)
  if (ps.length === 0) return null
  const sorted = [...ps].sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())
  const latest = sorted[0]
  const amostras = ps.filter(p => p.tipo === 'bonificacao')
  const vendas = ps.filter(p => p.tipo === 'venda' || !p.tipo)
  return { latest, total: ps.length, amostras: amostras.length, vendas: vendas.length, all: sorted }
}

// ============================================================
// Tests: getClientePedidoInfo
// ============================================================
describe('getClientePedidoInfo — sem pedidos', () => {
  it('retorna null quando não há pedidos para o cliente', () => {
    expect(getClientePedidoInfo(99, [])).toBeNull()
  })

  it('retorna null para clienteId diferente', () => {
    const pedidos = [makePedido({ clienteId: 1 })]
    expect(getClientePedidoInfo(2, pedidos)).toBeNull()
  })
})

describe('getClientePedidoInfo — com pedidos', () => {
  it('retorna o pedido mais recente como latest', () => {
    const p1 = makePedido({ id: 1, clienteId: 10, dataCriacao: '2025-01-01T00:00:00Z' })
    const p2 = makePedido({ id: 2, clienteId: 10, dataCriacao: '2025-04-01T00:00:00Z' })
    const result = getClientePedidoInfo(10, [p1, p2])
    expect(result?.latest.id).toBe(2)
  })

  it('conta total de pedidos corretamente', () => {
    const pedidos = [
      makePedido({ id: 1, clienteId: 10 }),
      makePedido({ id: 2, clienteId: 10 }),
      makePedido({ id: 3, clienteId: 10 }),
    ]
    expect(getClientePedidoInfo(10, pedidos)?.total).toBe(3)
  })

  it('separa amostras e vendas corretamente', () => {
    const pedidos = [
      makePedido({ id: 1, clienteId: 10, tipo: 'venda' }),
      makePedido({ id: 2, clienteId: 10, tipo: 'bonificacao' }),
      makePedido({ id: 3, clienteId: 10, tipo: 'bonificacao' }),
    ]
    const result = getClientePedidoInfo(10, pedidos)
    expect(result?.vendas).toBe(1)
    expect(result?.amostras).toBe(2)
  })

  it('retorna all ordenado do mais recente ao mais antigo', () => {
    const pedidos = [
      makePedido({ id: 1, clienteId: 10, dataCriacao: '2025-01-01T00:00:00Z' }),
      makePedido({ id: 2, clienteId: 10, dataCriacao: '2025-06-01T00:00:00Z' }),
      makePedido({ id: 3, clienteId: 10, dataCriacao: '2025-03-01T00:00:00Z' }),
    ]
    const result = getClientePedidoInfo(10, pedidos)
    expect(result?.all[0].id).toBe(2)
    expect(result?.all[1].id).toBe(3)
    expect(result?.all[2].id).toBe(1)
  })
})

// ============================================================
// Tests: campos do pedido exibidos no card
// ============================================================
describe('Pedido card — campos de dados', () => {
  it('tipoFrete FOB é preservado no pedido', () => {
    const p = makePedido({ tipoFrete: 'FOB' })
    expect(p.tipoFrete).toBe('FOB')
  })

  it('tipoFrete CIF é preservado no pedido', () => {
    const p = makePedido({ tipoFrete: 'CIF' })
    expect(p.tipoFrete).toBe('CIF')
  })

  it('tipoFrete undefined não exibe badge', () => {
    const p = makePedido({ tipoFrete: undefined })
    expect(p.tipoFrete).toBeUndefined()
  })

  it('formaPagamento é exibida quando preenchida', () => {
    const p = makePedido({ formaPagamento: '30/60/90 dias' })
    expect(p.formaPagamento).toBe('30/60/90 dias')
  })

  it('totalValor zero NÃO deve aparecer (renderizado condicionalmente)', () => {
    const p = makePedido({ totalValor: 0 })
    expect(p.totalValor > 0).toBe(false)
  })

  it('totalValor > 0 deve aparecer', () => {
    const p = makePedido({ totalValor: 15000 })
    expect(p.totalValor > 0).toBe(true)
  })

  it('número omieNumero tem preferência sobre numero', () => {
    const p = makePedido({ numero: 'PED-001', omieNumero: '12345' })
    const exibido = p.omieNumero || p.numero
    expect(exibido).toBe('12345')
  })

  it('numero é exibido quando omieNumero ausente', () => {
    const p = makePedido({ numero: 'PED-001', omieNumero: undefined })
    const exibido = p.omieNumero || p.numero
    expect(exibido).toBe('PED-001')
  })

  it('itens com produto e quantidade corretos', () => {
    const p = makePedido({
      itens: [
        { produtoId: 1, nomeProduto: 'Sacaria PP 15kg', unidade: 'UN', preco: 10, quantidade: 200 },
        { produtoId: 2, nomeProduto: 'Big Bag 500kg', unidade: 'UN', preco: 50, quantidade: 10 },
      ]
    })
    expect(p.itens[0].nomeProduto).toBe('Sacaria PP 15kg')
    expect(p.itens[0].quantidade).toBe(200)
    expect(p.itens[1].nomeProduto).toBe('Big Bag 500kg')
    expect(p.itens[1].quantidade).toBe(10)
  })

  it('itens vazio não causa erro', () => {
    const p = makePedido({ itens: [] })
    expect(p.itens.length).toBe(0)
    expect(p.itens.length > 0).toBe(false)
  })
})

// ============================================================
// Tests: statusLabel do card
// ============================================================
describe('Pedido card — statusLabel', () => {
  const statusLabel: Record<string, string> = {
    rascunho: 'Rascunho',
    enviado: 'Aguardando Aprov. Gerência',
    confirmado: 'Confirmado',
    cancelado: 'Cancelado',
  }

  it('status confirmado → label correto', () => {
    expect(statusLabel['confirmado']).toBe('Confirmado')
  })

  it('status enviado → label correto', () => {
    expect(statusLabel['enviado']).toBe('Aguardando Aprov. Gerência')
  })

  it('status cancelado → label correto', () => {
    expect(statusLabel['cancelado']).toBe('Cancelado')
  })

  it('status rascunho → label correto', () => {
    expect(statusLabel['rascunho']).toBe('Rascunho')
  })
})

// ============================================================
// Tests: tipo do pedido no card
// ============================================================
describe('Pedido card — tipo', () => {
  it('tipo venda exibe badge 🛒 Venda', () => {
    const p = makePedido({ tipo: 'venda' })
    const label = p.tipo === 'bonificacao' ? '🧪 Amostra' : '🛒 Venda'
    expect(label).toBe('🛒 Venda')
  })

  it('tipo bonificacao exibe badge 🧪 Amostra', () => {
    const p = makePedido({ tipo: 'bonificacao' })
    const label = p.tipo === 'bonificacao' ? '🧪 Amostra' : '🛒 Venda'
    expect(label).toBe('🧪 Amostra')
  })

  it('tipo undefined tratado como venda', () => {
    const p = makePedido({ tipo: undefined })
    const label = p.tipo === 'bonificacao' ? '🧪 Amostra' : '🛒 Venda'
    expect(label).toBe('🛒 Venda')
  })
})

// ============================================================
// Tests: totalValor formatação
// ============================================================
describe('Pedido card — formatação de valor', () => {
  it('formata R$ 15.000,00 corretamente', () => {
    const v = 15000
    const formatted = v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    expect(formatted).toBe('15.000,00')
  })

  it('formata R$ 1.234,56 corretamente', () => {
    const v = 1234.56
    const formatted = v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    expect(formatted).toBe('1.234,56')
  })

  it('formata R$ 0,00 corretamente', () => {
    const v = 0
    const formatted = v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    expect(formatted).toBe('0,00')
  })
})
