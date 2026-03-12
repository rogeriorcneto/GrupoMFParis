/**
 * Funções de validação e formatação — extraídas do App.tsx para serem testáveis.
 */

export function formatCNPJ(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/**
 * Normaliza número de telefone para formato WhatsApp brasileiro: 55 + DDD + número (10-11 dígitos)
 * Exemplos:
 *   (11) 98765-4321  → 5511987654321
 *   11987654321       → 5511987654321
 *   5511987654321     → 5511987654321
 *   +55 11 98765-4321 → 5511987654321
 *   011987654321      → 5511987654321
 */
export function formatBrazilianPhone(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (!d) return ''

  // Remove leading '+' artifacts (already stripped by \D)
  // Remove leading '0' (trunk prefix for landline calls)
  if (d.startsWith('0') && !d.startsWith('00')) {
    d = d.slice(1)
  }

  // If starts with 55 and has 12-13 digits → already has country code
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) {
    return d
  }

  // If 10-11 digits (DDD + number) → add 55
  if (d.length >= 10 && d.length <= 11) {
    return `55${d}`
  }

  // If 8-9 digits (no DDD) — can't determine DDD, return as-is with 55
  // This is a fallback; ideally the number should have DDD
  if (d.length >= 8 && d.length <= 9) {
    return `55${d}`
  }

  // Already formatted or unknown format — return as-is
  return d
}

export function formatTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function validarCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false
  const calc = (len: number) => {
    const pesos = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]
    let soma = 0
    for (let i = 0; i < len; i++) soma += Number(d[i]) * pesos[i]
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function calcularScore(
  etapa: string,
  valorEstimado: number,
  qtdInteracoes: number,
  diasInativo: number
): number {
  const baseEtapa: Record<string, number> = {
    'prospecção': 10, 'amostra': 25, 'proposta': 40,
    'negociacao': 60, 'follow_up': 80, 'inativo': 10, 'lead': 5, 'amostra_perdida': 15, 'perdido': 5
  }
  const base = baseEtapa[etapa] || 10
  const bonusValor = Math.min(valorEstimado / 10000, 15)
  const bonusInteracoes = Math.min(qtdInteracoes * 3, 15)
  const penalidade = Math.min(diasInativo * 0.5, 20)
  return Math.max(0, Math.min(100, Math.round(base + bonusValor + bonusInteracoes - penalidade)))
}
