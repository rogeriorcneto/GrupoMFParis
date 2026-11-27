import { describe, it, expect } from 'vitest'
import type { Cliente, Pedido } from '../../types'
import {
  calcularClientesSemNegociacao30d,
  calcularNegociacoesVendedor,
  classificarAlertaSaidaCarteira,
  dataSaidaDaCarteira,
  decisaoDesarmaAlerta,
  diasRestantesNaCarteira,
  ultimaDataEmNegociacao,
} from '../indicadores-negociacao'

function card(parcial: Partial<Cliente>): Cliente {
  return {
    id: 1,
    razaoSocial: 'Empresa Teste',
    cnpj: '',
    contatoNome: '',
    contatoTelefone: '',
    contatoEmail: '',
    etapa: 'prospecção',
    ...parcial,
  } as Cliente
}

function pedido(parcial: Partial<Pedido>): Pedido {
  return {
    id: 1,
    numero: 'PED-1',
    clienteId: 1,
    vendedorId: 1,
    itens: [],
    observacoes: '',
    status: 'confirmado',
    dataCriacao: '2025-01-10',
    totalValor: 100,
    ...parcial,
  } as Pedido
}

describe('ultimaDataEmNegociacao', () => {
  it('retorna null quando nunca esteve em negociação', () => {
    expect(ultimaDataEmNegociacao([card({ historicoEtapas: [{ etapa: 'proposta', data: '2025-01-01' }] })])).toBeNull()
    expect(ultimaDataEmNegociacao([card({})])).toBeNull()
  })

  it('usa o historico de etapas e pega a mais recente entre vários cards', () => {
    const cards = [
      card({ id: 1, historicoEtapas: [{ etapa: 'negociacao', data: '2025-01-05T10:00:00' }] }),
      card({ id: 2, historicoEtapas: [{ etapa: 'negociacao', data: '2025-02-10' }, { etapa: 'proposta', data: '2025-03-01' }] }),
    ]
    expect(ultimaDataEmNegociacao(cards)).toBe('2025-02-10')
  })

  it('considera dataEntradaEtapa quando o card está em negociação agora', () => {
    const c = card({ etapa: 'negociacao', dataEntradaEtapa: '2025-03-15T09:00:00', historicoEtapas: [] })
    expect(ultimaDataEmNegociacao([c])).toBe('2025-03-15')
  })
})

describe('calcularNegociacoesVendedor (Item 17)', () => {
  const periodo = { inicio: '2025-02-01', fim: '2025-02-28' }
  const clientes = [
    card({ id: 1, vendedorId: 1, etapa: 'negociacao' }),
    card({ id: 2, vendedorId: 1, etapa: 'negociacao' }),
    card({ id: 3, vendedorId: 2, etapa: 'negociacao' }),
    card({ id: 4, vendedorId: 1, etapa: 'perdido', dataPerda: '2025-02-10', categoriaPerda: 'preco' }),
    card({ id: 5, vendedorId: 1, etapa: 'perdido', dataPerda: '2025-02-20', categoriaPerda: 'preco' }),
    card({ id: 6, vendedorId: 1, etapa: 'perdido', dataPerda: '2025-01-15', categoriaPerda: 'prazo' }), // fora do período
    card({ id: 7, vendedorId: 1, etapa: 'perdido', dataPerda: '2025-02-05' }), // sem categoria -> outro
    card({ id: 8, vendedorId: 1, etapa: 'negociacao', arquivadoDuplicata: true }), // arquivado não conta
  ]
  const pedidos = [
    pedido({ id: 1, vendedorId: 1, dataAprovacao: '2025-02-11' }),
    pedido({ id: 2, vendedorId: 1, dataAprovacao: '2025-01-11' }), // fora do período
    pedido({ id: 3, vendedorId: 1, dataAprovacao: '2025-02-15', tipo: 'bonificacao' }), // bonificação não conta
    pedido({ id: 4, vendedorId: 2, dataAprovacao: '2025-02-12' }),
    pedido({ id: 5, vendedorId: 1, status: 'enviado', dataAprovacao: '2025-02-12' }), // não confirmado
  ]

  it('conta abertas apenas do vendedor, sem arquivados', () => {
    const r = calcularNegociacoesVendedor(clientes, pedidos, periodo, 1)
    expect(r.abertas.map(c => c.id)).toEqual([1, 2])
  })

  it('conta ganhas no período (confirmados, sem bonificação)', () => {
    const r = calcularNegociacoesVendedor(clientes, pedidos, periodo, 1)
    expect(r.ganhas.map(p => p.id)).toEqual([1])
  })

  it('conta perdidas no período com motivos agregados e ordenados', () => {
    const r = calcularNegociacoesVendedor(clientes, pedidos, periodo, 1)
    expect(r.perdidas.map(c => c.id).sort()).toEqual([4, 5, 7])
    expect(r.motivosPerda[0].key).toBe('preco')
    expect(r.motivosPerda[0].cards.length).toBe(2)
    expect(r.motivosPerda[0].label).toBe('Preço')
    expect(r.motivosPerda[1].key).toBe('outro')
    expect(r.motivosPerda[1].cards.length).toBe(1)
  })

  it('sem vendedorId agrega a equipe inteira', () => {
    const r = calcularNegociacoesVendedor(clientes, pedidos, periodo)
    expect(r.abertas.length).toBe(3)
    expect(r.ganhas.length).toBe(2)
  })

  it('usa dataEntradaEtapa como fallback da data de perda', () => {
    const cs = [card({ id: 9, vendedorId: 1, etapa: 'perdido', dataEntradaEtapa: '2025-02-08' })]
    const r = calcularNegociacoesVendedor(cs, [], periodo, 1)
    expect(r.perdidas.length).toBe(1)
  })
})

describe('calcularClientesSemNegociacao30d (Item 18)', () => {
  const hoje = '2025-03-31'
  const base = {
    vendedorId: 1,
    naCarteira: true,
    cardPrincipalId: 1,
  }

  it('inclui quem nunca esteve em negociação', () => {
    const r = calcularClientesSemNegociacao30d([
      { ...base, chave: 'a', cards: [card({ id: 1 })] },
    ], hoje)
    expect(r.length).toBe(1)
    expect(r[0].ultimaNegociacao).toBeNull()
    expect(r[0].diasSemNegociacao).toBeNull()
  })

  it('inclui negociação com mais de 30 dias e exclui recente', () => {
    const r = calcularClientesSemNegociacao30d([
      { ...base, chave: 'velha', cards: [card({ id: 1, historicoEtapas: [{ etapa: 'negociacao', data: '2025-02-15' }] })] },
      { ...base, chave: 'recente', cards: [card({ id: 2, historicoEtapas: [{ etapa: 'negociacao', data: '2025-03-10' }] })] },
    ], hoje)
    expect(r.length).toBe(1)
    expect(r[0].chave).toBe('velha')
    expect(r[0].diasSemNegociacao).toBe(44)
  })

  it('exatamente 30 dias NÃO entra (regra: mais de 30 dias)', () => {
    const r = calcularClientesSemNegociacao30d([
      { ...base, chave: 'limite', cards: [card({ id: 1, historicoEtapas: [{ etapa: 'negociacao', data: '2025-03-01' }] })] },
    ], hoje)
    expect(r.length).toBe(0)
  })

  it('ignora empresas fora da carteira ou sem vendedor', () => {
    const r = calcularClientesSemNegociacao30d([
      { ...base, chave: 'fora', naCarteira: false, cards: [card({ id: 1 })] },
      { ...base, chave: 'semvend', vendedorId: null, cards: [card({ id: 2 })] },
    ], hoje)
    expect(r.length).toBe(0)
  })

  it('ordena "nunca" primeiro, depois por mais dias', () => {
    const r = calcularClientesSemNegociacao30d([
      { ...base, chave: 'd40', cards: [card({ id: 1, historicoEtapas: [{ etapa: 'negociacao', data: '2025-02-19' }] })] },
      { ...base, chave: 'nunca', cards: [card({ id: 2 })] },
      { ...base, chave: 'd100', cards: [card({ id: 3, historicoEtapas: [{ etapa: 'negociacao', data: '2024-12-21' }] })] },
    ], hoje)
    expect(r.map(x => x.chave)).toEqual(['nunca', 'd100', 'd40'])
  })
})

describe('classificação 150/180 da saída da carteira (Item 21)', () => {
  it('classifica pré-alerta entre 150 e 180 dias', () => {
    expect(classificarAlertaSaidaCarteira(149)).toBeNull()
    expect(classificarAlertaSaidaCarteira(150)).toBe('pre_alerta')
    expect(classificarAlertaSaidaCarteira(180)).toBe('pre_alerta')
    expect(classificarAlertaSaidaCarteira(181)).toBe('saiu')
    expect(classificarAlertaSaidaCarteira(null)).toBeNull()
  })

  it('calcula dias restantes na carteira', () => {
    expect(diasRestantesNaCarteira(150)).toBe(31)
    expect(diasRestantesNaCarteira(180)).toBe(1)
    expect(diasRestantesNaCarteira(181)).toBe(0)
  })

  it('data de saída = última venda + 181 dias', () => {
    expect(dataSaidaDaCarteira('2025-01-01')).toBe('2025-07-01')
    expect(dataSaidaDaCarteira('2025-01-01T10:00:00')).toBe('2025-07-01')
  })

  it('decisão registrada depois da saída desarma o alerta; antes, não', () => {
    const decisoes = [{ cliente_id: 10, registrado_em: '2025-07-02T12:00:00' }]
    expect(decisaoDesarmaAlerta(decisoes, 10, '2025-07-01')).toBe(true)
    expect(decisaoDesarmaAlerta(decisoes, 10, '2025-07-03')).toBe(false)
    expect(decisaoDesarmaAlerta(decisoes, 11, '2025-07-01')).toBe(false)
    expect(decisaoDesarmaAlerta([], 10, '2025-07-01')).toBe(false)
  })

  it('decisão no mesmo dia da saída desarma (>=)', () => {
    const decisoes = [{ cliente_id: 10, registrado_em: '2025-07-01T08:00:00' }]
    expect(decisaoDesarmaAlerta(decisoes, 10, '2025-07-01')).toBe(true)
  })
})
