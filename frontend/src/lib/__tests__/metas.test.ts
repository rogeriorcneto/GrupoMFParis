import { describe, it, expect } from 'vitest'
import {
  diasUteisMes,
  diasUteisNoPeriodo,
  diasUteisSemanaNoMes,
  metaSemanaProrrateada,
  diasUteisRestantesNoMes,
  diasUteisRestantesNaSemana,
  calcularRitmo,
  somaMetasEquipe,
  intervaloSemanaSegDom,
  vendidoPedidosPeriodo,
  volumeKgPedidos,
  type MetaVendedorMes,
} from '../metas'

// Datas reais de referência (novembro/2026):
// - nov/2026 começa num domingo e tem 21 dias úteis sem feriados
// - 20/11/2026 é sexta-feira (feriado de exemplo)
// - a semana 30/11 a 06/12/2026 vira o mês: só 30/11 (segunda) é dia útil de novembro

const FERIADO_20_NOV = [{ data: '2026-11-20', descricao: 'Consciência Negra' }]

describe('diasUteisMes', () => {
  it('novembro/2026 sem feriados tem 21 dias úteis', () => {
    expect(diasUteisMes(2026, 11, [])).toBe(21)
  })
  it('com feriado em sexta-feira cai para 20', () => {
    expect(diasUteisMes(2026, 11, FERIADO_20_NOV)).toBe(20)
  })
  it('feriado em fim de semana não altera a contagem', () => {
    expect(diasUteisMes(2026, 11, [{ data: '2026-11-15', descricao: 'domingo' }])).toBe(21)
  })
  it('dezembro/2026 sem feriados tem 23 dias úteis', () => {
    expect(diasUteisMes(2026, 12, [])).toBe(23)
  })
})

describe('intervaloSemanaSegDom', () => {
  it('semana vai de segunda a domingo', () => {
    expect(intervaloSemanaSegDom('2026-11-10')).toEqual({ segunda: '2026-11-09', domingo: '2026-11-15' })
  })
  it('domingo pertence à semana que começou na segunda anterior', () => {
    expect(intervaloSemanaSegDom('2026-11-15')).toEqual({ segunda: '2026-11-09', domingo: '2026-11-15' })
  })
  it('segunda é o primeiro dia da própria semana', () => {
    expect(intervaloSemanaSegDom('2026-11-30')).toEqual({ segunda: '2026-11-30', domingo: '2026-12-06' })
  })
})

describe('metaSemanaProrrateada', () => {
  it('semana inteira dentro do mês: 5 de 21 dias úteis', () => {
    // semana 09-15/11/2026, sem feriados: 5 dias úteis
    expect(metaSemanaProrrateada(210000, '2026-11-10', [])).toBeCloseTo(210000 * 5 / 21, 2)
  })
  it('semana que vira o mês divide os dias: só 30/11 conta para novembro', () => {
    // semana 30/11 a 06/12/2026: para a meta de NOVEMBRO contam apenas os dias
    // úteis que caem em novembro (30/11, segunda) = 1 dia útil de 21
    expect(diasUteisSemanaNoMes('2026-11-30', 2026, 11, [])).toBe(1)
    expect(metaSemanaProrrateada(210000, '2026-11-30', [])).toBeCloseTo(210000 * 1 / 21, 2)
  })
  it('a mesma semana vista por dezembro conta 4 dias úteis', () => {
    // para a meta de DEZEMBRO, a semana 30/11-06/12 tem 4 dias úteis (01-04/12) de 23
    expect(diasUteisSemanaNoMes('2026-12-03', 2026, 12, [])).toBe(4)
    expect(metaSemanaProrrateada(230000, '2026-12-03', [])).toBeCloseTo(230000 * 4 / 23, 2)
  })
  it('feriado na semana reduz a meta semanal', () => {
    // semana 16-22/11 com feriado 20/11 (sexta): 4 dias úteis de 20 no mês
    expect(metaSemanaProrrateada(200000, '2026-11-18', FERIADO_20_NOV)).toBeCloseTo(200000 * 4 / 20, 2)
  })
})

describe('diasUteisRestantes', () => {
  it('restam 15 dias úteis no mês a partir de 10/11/2026 (inclui o próprio dia)', () => {
    expect(diasUteisRestantesNoMes('2026-11-10', [])).toBe(15)
  })
  it('com feriado 20/11 restam 14', () => {
    expect(diasUteisRestantesNoMes('2026-11-10', FERIADO_20_NOV)).toBe(14)
  })
  it('no último dia útil do mês resta 1', () => {
    expect(diasUteisRestantesNoMes('2026-11-30', [])).toBe(1)
  })
  it('restam 4 dias úteis na semana de 10/11/2026 (terça a sexta)', () => {
    expect(diasUteisRestantesNaSemana('2026-11-10', [])).toBe(4)
  })
  it('no sábado não restam dias úteis na semana', () => {
    expect(diasUteisRestantesNaSemana('2026-11-14', [])).toBe(0)
  })
})

describe('calcularRitmo', () => {
  it('ritmo necessário = falta ÷ dias úteis restantes; semana = ritmo × dias úteis restantes da semana', () => {
    // hoje 10/11/2026 (terça): 15 dias úteis no mês, 4 na semana
    const r = calcularRitmo(150000, 50000, '2026-11-10', [])
    expect(r.faltaNoMes).toBe(100000)
    expect(r.diasUteisRestantesMes).toBe(15)
    expect(r.ritmoNecessario).toBeCloseTo(100000 / 15, 2)
    expect(r.diasUteisRestantesSemana).toBe(4)
    // paraEstaSemana usa o ritmo já arredondado em centavos (6666.67 × 4)
    expect(r.paraEstaSemana).toBeCloseTo(6666.67 * 4, 2)
    expect(r.noRitmo).toBe(false)
  })
  it('vendedor acima da meta fica "no ritmo"', () => {
    const r = calcularRitmo(150000, 160000, '2026-11-10', [])
    expect(r.faltaNoMes).toBeLessThanOrEqual(0)
    expect(r.noRitmo).toBe(true)
    expect(r.ritmoNecessario).toBe(0)
    expect(r.paraEstaSemana).toBe(0)
  })
  it('exatamente na meta também é "no ritmo"', () => {
    const r = calcularRitmo(150000, 150000, '2026-11-10', [])
    expect(r.noRitmo).toBe(true)
  })
  it('sem dias úteis restantes no mês, o ritmo é o próprio valor que falta', () => {
    // 28/11/2026 é sábado e 29/11 domingo: após 30/11 não há mais dias úteis,
    // mas em 28/11 ainda resta 30/11 (1 dia). Testando cenário de fim de mês:
    const r = calcularRitmo(150000, 100000, '2026-11-30', [])
    expect(r.diasUteisRestantesMes).toBe(1)
    expect(r.ritmoNecessario).toBe(50000)
  })
})

describe('somaMetasEquipe', () => {
  it('soma todas as colunas ignorando nulos', () => {
    const metas: MetaVendedorMes[] = [
      { vendedorId: 1, ano: 2026, mes: 11, metaFaturamento: 100000, metaVolumeKg: 500, metaVisitas: 20, metaPropostas: 10, metaNovosClientes: 4 },
      { vendedorId: 2, ano: 2026, mes: 11, metaFaturamento: 80000, metaVolumeKg: null, metaVisitas: 15, metaPropostas: null, metaNovosClientes: 2 },
      { vendedorId: 3, ano: 2026, mes: 11, metaFaturamento: null, metaVolumeKg: 300, metaVisitas: null, metaPropostas: 8, metaNovosClientes: null },
    ]
    const s = somaMetasEquipe(metas)
    expect(s.metaFaturamento).toBe(180000)
    expect(s.metaVolumeKg).toBe(800)
    expect(s.metaVisitas).toBe(35)
    expect(s.metaPropostas).toBe(18)
    expect(s.metaNovosClientes).toBe(6)
  })
  it('lista vazia soma zero', () => {
    const s = somaMetasEquipe([])
    expect(s.metaFaturamento).toBe(0)
  })
})

describe('vendidoPedidosPeriodo / volumeKgPedidos', () => {
  const ped = (over: any) => ({
    id: 1, numero: 'P1', clienteId: 1, vendedorId: 1, status: 'confirmado', tipo: 'venda',
    dataAprovacao: '2026-11-10T12:00:00', dataCriacao: '2026-11-09T12:00:00', totalValor: 1000,
    itens: [{ produtoId: 1, nomeProduto: 'A', preco: 100, quantidade: 10, unidade: 'kg' }],
    observacoes: '', ...over,
  } as any)

  it('soma só pedidos confirmados dentro do período, excluindo bonificação', () => {
    const pedidos = [
      ped({ id: 1 }),
      ped({ id: 2, status: 'enviado' }),
      ped({ id: 3, tipo: 'bonificacao' }),
      ped({ id: 4, dataAprovacao: '2026-10-31T12:00:00' }),
    ]
    expect(vendidoPedidosPeriodo(pedidos, '2026-11-01', '2026-11-30')).toBe(1000)
  })
  it('usa dataEnvioOmie como coalesce quando não há aprovação', () => {
    const p = ped({ dataAprovacao: undefined, dataEnvioOmie: '2026-11-05T10:00:00' })
    expect(vendidoPedidosPeriodo([p], '2026-11-01', '2026-11-30')).toBe(1000)
  })
  it('volume kg = quantidade × pesoKg do produto; produto sem peso entra como 0', () => {
    const produtos = new Map<number, any>([
      [1, { id: 1, pesoKg: 2.5 }],
      [2, { id: 2 }],
    ])
    const pedidos = [ped({
      itens: [
        { produtoId: 1, nomeProduto: 'A', preco: 100, quantidade: 10, unidade: 'kg' },
        { produtoId: 2, nomeProduto: 'B', preco: 100, quantidade: 5, unidade: 'kg' },
      ],
    })]
    expect(volumeKgPedidos(pedidos, produtos)).toBe(25)
  })
})

describe('diasUteisNoPeriodo', () => {
  it('conta inclusive os dois extremos', () => {
    expect(diasUteisNoPeriodo('2026-11-09', '2026-11-13', [])).toBe(5)
    expect(diasUteisNoPeriodo('2026-11-07', '2026-11-08', [])).toBe(0)
  })
})
