import { describe, it, expect } from 'vitest'
import { formatCNPJ, formatTelefone, validarCNPJ, calcularScore } from '../utils/validators'

describe('formatCNPJ', () => {
  it('formata CNPJ completo', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('formata parcial — só 2 dígitos', () => {
    expect(formatCNPJ('11')).toBe('11')
  })

  it('formata parcial — 5 dígitos', () => {
    expect(formatCNPJ('11222')).toBe('11.222')
  })

  it('formata parcial — 8 dígitos', () => {
    expect(formatCNPJ('11222333')).toBe('11.222.333')
  })

  it('remove caracteres não numéricos', () => {
    expect(formatCNPJ('11.222.333/0001-81')).toBe('11.222.333/0001-81')
  })

  it('limita a 14 dígitos', () => {
    expect(formatCNPJ('1122233300018199999')).toBe('11.222.333/0001-81')
  })

  it('retorna vazio para vazio', () => {
    expect(formatCNPJ('')).toBe('')
  })
})

describe('formatTelefone', () => {
  it('formata celular completo (11 dígitos)', () => {
    expect(formatTelefone('31999887766')).toBe('(31) 99988-7766')
  })

  it('formata fixo (10 dígitos)', () => {
    expect(formatTelefone('3133224455')).toBe('(31) 33224-455')
  })

  it('formata parcial — DDD', () => {
    expect(formatTelefone('31')).toBe('(31')
  })

  it('formata parcial — DDD + início', () => {
    expect(formatTelefone('31999')).toBe('(31) 999')
  })

  it('retorna vazio para vazio', () => {
    expect(formatTelefone('')).toBe('')
  })

  it('remove caracteres não numéricos', () => {
    expect(formatTelefone('(31) 99988-7766')).toBe('(31) 99988-7766')
  })
})

describe('validarCNPJ', () => {
  it('aceita CNPJ válido', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true)
  })

  it('aceita CNPJ válido sem formatação', () => {
    expect(validarCNPJ('11222333000181')).toBe(true)
  })

  it('rejeita CNPJ com todos dígitos iguais', () => {
    expect(validarCNPJ('11111111111111')).toBe(false)
    expect(validarCNPJ('00000000000000')).toBe(false)
  })

  it('rejeita CNPJ curto', () => {
    expect(validarCNPJ('1234')).toBe(false)
  })

  it('rejeita CNPJ com dígitos verificadores errados', () => {
    expect(validarCNPJ('11222333000182')).toBe(false)
  })

  it('rejeita vazio', () => {
    expect(validarCNPJ('')).toBe(false)
  })
})

describe('calcularScore', () => {
  it('calcula score base por etapa', () => {
    expect(calcularScore('prospecção', 0, 0, 0)).toBe(10)
    expect(calcularScore('amostra', 0, 0, 0)).toBe(25)
    expect(calcularScore('homologado', 0, 0, 0)).toBe(50)
    expect(calcularScore('negociacao', 0, 0, 0)).toBe(70)
    expect(calcularScore('pos_venda', 0, 0, 0)).toBe(90)
    expect(calcularScore('perdido', 0, 0, 0)).toBe(5)
  })

  it('aplica bônus por valor estimado (max 15)', () => {
    // 150000 / 10000 = 15 (max)
    expect(calcularScore('prospecção', 150000, 0, 0)).toBe(25)
    // 200000 / 10000 = 20 → capped at 15
    expect(calcularScore('prospecção', 200000, 0, 0)).toBe(25)
  })

  it('aplica bônus por interações (max 15)', () => {
    // 5 * 3 = 15 (max)
    expect(calcularScore('prospecção', 0, 5, 0)).toBe(25)
    // 10 * 3 = 30 → capped at 15
    expect(calcularScore('prospecção', 0, 10, 0)).toBe(25)
  })

  it('aplica penalidade por inatividade (max 20)', () => {
    // 20 * 0.5 = 10
    expect(calcularScore('prospecção', 0, 0, 20)).toBe(0)
    // 40 * 0.5 = 20 (max) → 10 - 20 = -10 → clamped to 0
    expect(calcularScore('prospecção', 0, 0, 40)).toBe(0)
  })

  it('nunca ultrapassa 100', () => {
    expect(calcularScore('pos_venda', 200000, 10, 0)).toBe(100)
  })

  it('nunca fica abaixo de 0', () => {
    expect(calcularScore('perdido', 0, 0, 100)).toBe(0)
  })

  it('calcula score combinado corretamente', () => {
    // homologado(50) + valor 50000(5) + 3 inter(9) - 10 dias(5) = 59
    expect(calcularScore('homologado', 50000, 3, 10)).toBe(59)
  })
})
