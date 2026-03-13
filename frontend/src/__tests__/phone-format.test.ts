import { describe, it, expect } from 'vitest'
import { formatBrazilianPhone } from '../utils/validators'

// ══════════════════════════════════════════════════════════════════════
// formatBrazilianPhone (frontend) — mesma lógica do backend
// ══════════════════════════════════════════════════════════════════════

describe('formatBrazilianPhone (frontend)', () => {

  // ─── Celular com DDD ───

  it('(31) 99228-2602 → 5531992282602', () => {
    expect(formatBrazilianPhone('(31) 99228-2602')).toBe('5531992282602')
  })

  it('31992282602 → 5531992282602', () => {
    expect(formatBrazilianPhone('31992282602')).toBe('5531992282602')
  })

  it('(11) 98765-4321 → 5511987654321', () => {
    expect(formatBrazilianPhone('(11) 98765-4321')).toBe('5511987654321')
  })

  // ─── Já com +55 ───

  it('+55 31 99228-2602 → 5531992282602', () => {
    expect(formatBrazilianPhone('+55 31 99228-2602')).toBe('5531992282602')
  })

  it('5531992282602 (13 dígitos) → 5531992282602', () => {
    expect(formatBrazilianPhone('5531992282602')).toBe('5531992282602')
  })

  // ─── Fixo ───

  it('(31) 3333-4444 → 553133334444', () => {
    expect(formatBrazilianPhone('(31) 3333-4444')).toBe('553133334444')
  })

  // ─── Prefixo 0 ───

  it('031992282602 → 5531992282602', () => {
    expect(formatBrazilianPhone('031992282602')).toBe('5531992282602')
  })

  // ─── Vazios ───

  it('string vazia → vazio', () => {
    expect(formatBrazilianPhone('')).toBe('')
  })

  it('sem dígitos → vazio', () => {
    expect(formatBrazilianPhone('abc')).toBe('')
  })

  // ─── Caracteres especiais ───

  it('+55 (31) 9.9228-2602 → 5531992282602', () => {
    expect(formatBrazilianPhone('+55 (31) 9.9228-2602')).toBe('5531992282602')
  })
})

// ══════════════════════════════════════════════════════════════════════
// Validação de formato para tel: e wa.me links
// ══════════════════════════════════════════════════════════════════════

describe('Formato correto para tel: e wa.me', () => {

  it('tel: deve ter formato +55XXXXXXXXXXX', () => {
    const phone = '(31) 99228-2602'
    const formatted = formatBrazilianPhone(phone)
    const telHref = `tel:+${formatted}`
    expect(telHref).toBe('tel:+5531992282602')
    expect(telHref).toMatch(/^tel:\+55\d{10,11}$/)
  })

  it('wa.me deve ter formato 55XXXXXXXXXXX (sem +)', () => {
    const phone = '(31) 99228-2602'
    const formatted = formatBrazilianPhone(phone)
    const waUrl = `https://wa.me/${formatted}`
    expect(waUrl).toBe('https://wa.me/5531992282602')
    expect(waUrl).toMatch(/^https:\/\/wa\.me\/55\d{10,11}$/)
  })

  it('número já com 55 gera links corretos', () => {
    const phone = '5531992282602'
    const formatted = formatBrazilianPhone(phone)
    expect(`tel:+${formatted}`).toBe('tel:+5531992282602')
    expect(`https://wa.me/${formatted}`).toBe('https://wa.me/5531992282602')
  })

  it('número com +55 gera links corretos', () => {
    const phone = '+55 31 99228-2602'
    const formatted = formatBrazilianPhone(phone)
    expect(`tel:+${formatted}`).toBe('tel:+5531992282602')
    expect(`https://wa.me/${formatted}`).toBe('https://wa.me/5531992282602')
  })

  it('nunca gera tel: sem código de país', () => {
    const phones = [
      '(31) 99228-2602',
      '31992282602',
      '+55 31 99228-2602',
      '5531992282602',
      '031992282602',
    ]
    for (const phone of phones) {
      const formatted = formatBrazilianPhone(phone)
      const tel = `tel:+${formatted}`
      // Deve sempre começar com tel:+55
      expect(tel).toMatch(/^tel:\+55/)
    }
  })

  it('nunca gera wa.me sem código de país', () => {
    const phones = [
      '(31) 99228-2602',
      '31992282602',
      '+55 31 99228-2602',
      '5531992282602',
    ]
    for (const phone of phones) {
      const formatted = formatBrazilianPhone(phone)
      // Deve sempre começar com 55
      expect(formatted).toMatch(/^55/)
    }
  })
})
