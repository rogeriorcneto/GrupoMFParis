import { describe, it, expect } from 'vitest'
import { calcScore, getClientsToAutoMove, calcDiasInativo, autoMovePrazos } from '../utils/business-rules'
import type { Cliente } from '../types'

function makeCliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 1,
    razaoSocial: 'Empresa Teste',
    cnpj: '',
    contatoNome: '',
    contatoTelefone: '',
    contatoEmail: '',
    etapa: 'prospecção',
    vendedorId: 1,
    score: 50,
    diasInativo: 0,
    historicoEtapas: [],
    ...overrides,
  }
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

// ─── calcScore ───

describe('calcScore', () => {
  it('retorna base 10 para prospecção sem bônus', () => {
    expect(calcScore('prospecção', undefined, 0, 0)).toBe(10)
  })

  it('retorna base 80 para follow_up sem bônus', () => {
    expect(calcScore('follow_up', undefined, 0, 0)).toBe(80)
  })

  it('retorna base 5 para perdido', () => {
    expect(calcScore('perdido', undefined, 0, 0)).toBe(5)
  })

  it('adiciona bônus de valor (max 15)', () => {
    // 150000 / 10000 = 15 (max)
    expect(calcScore('prospecção', 150000, 0, 0)).toBe(25) // 10 + 15
    // 50000 / 10000 = 5
    expect(calcScore('prospecção', 50000, 0, 0)).toBe(15) // 10 + 5
  })

  it('adiciona bônus de interações (max 15)', () => {
    // 5 interações * 3 = 15 (max)
    expect(calcScore('prospecção', undefined, 5, 0)).toBe(25) // 10 + 15
    // 2 interações * 3 = 6
    expect(calcScore('prospecção', undefined, 2, 0)).toBe(16) // 10 + 6
  })

  it('subtrai penalidade por inatividade (max 20)', () => {
    // 40 dias * 0.5 = 20 (max)
    expect(calcScore('prospecção', undefined, 0, 40)).toBe(0) // max(0, 10 - 20)
    // 10 dias * 0.5 = 5
    expect(calcScore('prospecção', undefined, 0, 10)).toBe(5) // 10 - 5
  })

  it('nunca excede 100', () => {
    // follow_up(80) + valor(15) + interações(15) = 110 → clamped to 100
    expect(calcScore('follow_up', 200000, 10, 0)).toBe(100)
  })

  it('nunca fica abaixo de 0', () => {
    // perdido(5) - penalidade(20) = -15 → clamped to 0
    expect(calcScore('perdido', undefined, 0, 50)).toBe(0)
  })

  it('combina todos os fatores corretamente', () => {
    // proposta(40) + valor(10) + interações(9) - penalidade(5) = 54
    expect(calcScore('proposta', 100000, 3, 10)).toBe(54)
  })

  it('etapa desconhecida usa base 10', () => {
    expect(calcScore('etapa_fake', undefined, 0, 0)).toBe(10)
  })
})

// ─── autoMovePrazos ───

describe('autoMovePrazos', () => {
  it('amostra tem prazo 45d com destino perdido', () => {
    expect(autoMovePrazos['amostra']).toEqual({ dias: 45, destino: 'perdido' })
  })

  it('proposta tem prazo 60d com destino inativo', () => {
    expect(autoMovePrazos['proposta']).toEqual({ dias: 60, destino: 'inativo' })
  })

  it('negociacao tem prazo 45d com destino perdido', () => {
    expect(autoMovePrazos['negociacao']).toEqual({ dias: 45, destino: 'perdido' })
  })

  it('follow_up tem prazo 60d com destino perdido', () => {
    expect(autoMovePrazos['follow_up']).toEqual({ dias: 60, destino: 'perdido' })
  })

  it('prospecção não tem prazo', () => {
    expect(autoMovePrazos['prospecção']).toBeUndefined()
  })
})

// ─── getClientsToAutoMove ───

describe('getClientsToAutoMove', () => {
  it('detecta amostra expirada (>45d)', () => {
    const clientes = [makeCliente({ id: 1, etapa: 'amostra', dataEntradaEtapa: daysAgo(46) })]
    const result = getClientsToAutoMove(clientes, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(result[0].etapa).toBe('amostra')
  })

  it('não detecta amostra dentro do prazo', () => {
    const clientes = [makeCliente({ id: 1, etapa: 'amostra', dataEntradaEtapa: daysAgo(30) })]
    expect(getClientsToAutoMove(clientes, new Set())).toHaveLength(0)
  })

  it('detecta proposta expirada (>60d)', () => {
    const clientes = [makeCliente({ id: 1, etapa: 'proposta', dataEntradaEtapa: daysAgo(61) })]
    const result = getClientsToAutoMove(clientes, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].etapa).toBe('proposta')
  })

  it('detecta negociacao expirada (>45d)', () => {
    const clientes = [makeCliente({ id: 1, etapa: 'negociacao', dataEntradaEtapa: daysAgo(46) })]
    const result = getClientsToAutoMove(clientes, new Set())
    expect(result).toHaveLength(1)
    expect(result[0].etapa).toBe('negociacao')
  })

  it('ignora clientes já marcados (alreadyMovedIds)', () => {
    const clientes = [makeCliente({ id: 1, etapa: 'amostra', dataEntradaEtapa: daysAgo(46) })]
    expect(getClientsToAutoMove(clientes, new Set([1]))).toHaveLength(0)
  })

  it('ignora clientes em perdido', () => {
    const clientes = [makeCliente({ id: 1, etapa: 'perdido', dataEntradaEtapa: daysAgo(100) })]
    expect(getClientsToAutoMove(clientes, new Set())).toHaveLength(0)
  })

  it('ignora prospecção (sem prazo)', () => {
    const clientes = [
      makeCliente({ id: 1, etapa: 'prospecção', dataEntradaEtapa: daysAgo(200) }),
    ]
    expect(getClientsToAutoMove(clientes, new Set())).toHaveLength(0)
  })

  it('ignora clientes sem dataEntradaEtapa', () => {
    const clientes = [makeCliente({ id: 1, etapa: 'amostra', dataEntradaEtapa: undefined })]
    expect(getClientsToAutoMove(clientes, new Set())).toHaveLength(0)
  })

  it('detecta múltiplos clientes expirados', () => {
    const clientes = [
      makeCliente({ id: 1, etapa: 'amostra', dataEntradaEtapa: daysAgo(46) }),
      makeCliente({ id: 2, etapa: 'negociacao', dataEntradaEtapa: daysAgo(46) }),
      makeCliente({ id: 3, etapa: 'proposta', dataEntradaEtapa: daysAgo(10) }), // dentro do prazo
    ]
    const result = getClientsToAutoMove(clientes, new Set())
    expect(result).toHaveLength(2)
    expect(result.map(r => r.id)).toContain(1)
    expect(result.map(r => r.id)).toContain(2)
  })
})

// ─── calcDiasInativo ───

describe('calcDiasInativo', () => {
  it('retorna null para undefined', () => {
    expect(calcDiasInativo(undefined)).toBeNull()
  })

  it('retorna 0 para data de hoje', () => {
    expect(calcDiasInativo(new Date().toISOString())).toBe(0)
  })

  it('retorna número correto de dias', () => {
    const result = calcDiasInativo(daysAgo(10))
    expect(result).toBeGreaterThanOrEqual(9)
    expect(result).toBeLessThanOrEqual(11)
  })

  it('retorna dias para data antiga', () => {
    const result = calcDiasInativo(daysAgo(100))
    expect(result).toBeGreaterThanOrEqual(99)
    expect(result).toBeLessThanOrEqual(101)
  })
})
