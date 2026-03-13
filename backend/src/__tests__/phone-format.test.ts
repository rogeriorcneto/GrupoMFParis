import { describe, it, expect } from 'vitest'
import { formatBrazilianPhone, generateBrazilianPhoneVariations } from '../whatsapp-multi.js'

// ══════════════════════════════════════════════════════════════════════
// formatBrazilianPhone — normalização de números brasileiros
// ══════════════════════════════════════════════════════════════════════

describe('formatBrazilianPhone', () => {

  // ─── Celular com DDD (formato mais comum) ───

  it('formata (31) 99228-2602 → 5531992282602', () => {
    expect(formatBrazilianPhone('(31) 99228-2602')).toBe('5531992282602')
  })

  it('formata 31992282602 (11 dígitos) → 5531992282602', () => {
    expect(formatBrazilianPhone('31992282602')).toBe('5531992282602')
  })

  it('formata 31 99228-2602 → 5531992282602', () => {
    expect(formatBrazilianPhone('31 99228-2602')).toBe('5531992282602')
  })

  it('formata (11) 98765-4321 → 5511987654321', () => {
    expect(formatBrazilianPhone('(11) 98765-4321')).toBe('5511987654321')
  })

  it('formata 11987654321 → 5511987654321', () => {
    expect(formatBrazilianPhone('11987654321')).toBe('5511987654321')
  })

  // ─── Já com código de país 55 ───

  it('mantém 5531992282602 (13 dígitos) inalterado', () => {
    expect(formatBrazilianPhone('5531992282602')).toBe('5531992282602')
  })

  it('formata +55 31 99228-2602 → 5531992282602', () => {
    expect(formatBrazilianPhone('+55 31 99228-2602')).toBe('5531992282602')
  })

  it('formata +55 (31) 99228-2602 → 5531992282602', () => {
    expect(formatBrazilianPhone('+55 (31) 99228-2602')).toBe('5531992282602')
  })

  it('mantém 5511987654321 inalterado', () => {
    expect(formatBrazilianPhone('5511987654321')).toBe('5511987654321')
  })

  // ─── Telefone fixo com DDD (10 dígitos) ───

  it('formata (31) 3333-4444 → 553133334444', () => {
    expect(formatBrazilianPhone('(31) 3333-4444')).toBe('553133334444')
  })

  it('formata 3133334444 (10 dígitos) → 553133334444', () => {
    expect(formatBrazilianPhone('3133334444')).toBe('553133334444')
  })

  it('mantém 553133334444 (12 dígitos, fixo) inalterado', () => {
    expect(formatBrazilianPhone('553133334444')).toBe('553133334444')
  })

  // ─── Prefixo de tronco (0XX) ───

  it('remove 0 inicial: 031992282602 → 5531992282602', () => {
    expect(formatBrazilianPhone('031992282602')).toBe('5531992282602')
  })

  it('remove 0 inicial: 011987654321 → 5511987654321', () => {
    expect(formatBrazilianPhone('011987654321')).toBe('5511987654321')
  })

  // ─── Número curto sem DDD (fallback) ───

  it('fallback: 92282602 (8 dígitos) → 5592282602', () => {
    expect(formatBrazilianPhone('92282602')).toBe('5592282602')
  })

  it('fallback: 992282602 (9 dígitos) → 55992282602', () => {
    expect(formatBrazilianPhone('992282602')).toBe('55992282602')
  })

  // ─── Casos de borda ───

  it('retorna vazio para string vazia', () => {
    expect(formatBrazilianPhone('')).toBe('')
  })

  it('retorna vazio para string sem dígitos', () => {
    expect(formatBrazilianPhone('abc')).toBe('')
  })

  it('retorna vazio para string com só espaços', () => {
    expect(formatBrazilianPhone('   ')).toBe('')
  })

  it('lida com número com muitos caracteres especiais', () => {
    expect(formatBrazilianPhone('+55 (31) 9.9228-2602')).toBe('5531992282602')
  })

  it('não remove 00 internacional no início', () => {
    // 00 é prefixo internacional, não tronco
    const result = formatBrazilianPhone('005531992282602')
    // 15 dígitos → cai no fallback "return as-is"
    expect(result).toBe('005531992282602')
  })
})

// ══════════════════════════════════════════════════════════════════════
// generateBrazilianPhoneVariations — variações do 9º dígito
// ══════════════════════════════════════════════════════════════════════

describe('generateBrazilianPhoneVariations', () => {

  it('celular COM 9º dígito → gera variação SEM', () => {
    const variations = generateBrazilianPhoneVariations('5531992282602')
    expect(variations).toContain('5531992282602')  // original
    expect(variations).toContain('553192282602')   // sem 9º dígito
    expect(variations).toHaveLength(2)
  })

  it('celular SEM 9º dígito → gera variação COM', () => {
    const variations = generateBrazilianPhoneVariations('553192282602')
    expect(variations).toContain('553192282602')   // original
    expect(variations).toContain('5531992282602')  // com 9º dígito
    expect(variations).toHaveLength(2)
  })

  it('telefone fixo → não gera variações', () => {
    const variations = generateBrazilianPhoneVariations('553133334444')
    expect(variations).toEqual(['553133334444'])
    expect(variations).toHaveLength(1)
  })

  it('número curto → não gera variações', () => {
    const variations = generateBrazilianPhoneVariations('5592282602')
    expect(variations).toEqual(['5592282602'])
    expect(variations).toHaveLength(1)
  })

  it('número sem 55 → não gera variações', () => {
    const variations = generateBrazilianPhoneVariations('31992282602')
    expect(variations).toEqual(['31992282602'])
    expect(variations).toHaveLength(1)
  })

  it('SP celular COM 9º dígito → gera variação SEM', () => {
    const variations = generateBrazilianPhoneVariations('5511987654321')
    expect(variations).toContain('5511987654321')  // original (13 dígitos)
    expect(variations).toContain('551187654321')   // sem 9º dígito (12 dígitos)
    expect(variations).toHaveLength(2)
  })

  it('SP celular SEM 9º dígito → gera variação COM', () => {
    const variations = generateBrazilianPhoneVariations('551187654321')
    expect(variations).toContain('551187654321')   // original
    expect(variations).toContain('5511987654321')  // com 9
    expect(variations).toHaveLength(2)
  })
})

// ══════════════════════════════════════════════════════════════════════
// Integração: formatBrazilianPhone + variações
// ══════════════════════════════════════════════════════════════════════

describe('formatBrazilianPhone + variações (integração)', () => {

  it('(31) 99228-2602 → formata + gera variação sem 9', () => {
    const formatted = formatBrazilianPhone('(31) 99228-2602')
    const variations = generateBrazilianPhoneVariations(formatted)
    expect(formatted).toBe('5531992282602')
    expect(variations).toContain('5531992282602')
    expect(variations).toContain('553192282602')
  })

  it('+55 11 98765-4321 → formata + gera variação sem 9', () => {
    const formatted = formatBrazilianPhone('+55 11 98765-4321')
    const variations = generateBrazilianPhoneVariations(formatted)
    expect(formatted).toBe('5511987654321')
    expect(variations).toContain('5511987654321')
    expect(variations).toContain('551187654321')
  })

  it('(31) 3333-4444 (fixo) → formata + SEM variação extra', () => {
    const formatted = formatBrazilianPhone('(31) 3333-4444')
    const variations = generateBrazilianPhoneVariations(formatted)
    expect(formatted).toBe('553133334444')
    expect(variations).toHaveLength(1)
  })

  it('031992282602 → remove 0, formata, gera variações', () => {
    const formatted = formatBrazilianPhone('031992282602')
    const variations = generateBrazilianPhoneVariations(formatted)
    expect(formatted).toBe('5531992282602')
    expect(variations).toHaveLength(2)
  })
})
