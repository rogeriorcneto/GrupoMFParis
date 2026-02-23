import type { Cliente } from '../types'

// Unified Lead Scoring Algorithm — mirrors App.tsx useEffect (lines 340-351)
export function calculateLeadScore(cliente: Cliente, interacoesCount: number = 0): number {
  const baseEtapa: Record<string, number> = {
    'prospecção': 10,
    'amostra': 25,
    'homologado': 50,
    'negociacao': 70,
    'pos_venda': 90,
    'perdido': 5
  }
  const base = baseEtapa[cliente.etapa] || 10
  const bonusValor = Math.min((cliente.valorEstimado || 0) / 10000, 15)
  const bonusInteracoes = Math.min(interacoesCount * 3, 15)
  const penalidade = Math.min((cliente.diasInativo || 0) * 0.5, 20)
  return Math.max(0, Math.min(100, Math.round(base + bonusValor + bonusInteracoes - penalidade)))
}

// Date helper: days since a given ISO date string
export function diasDesde(dateStr?: string): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

// Today's date in YYYY-MM-DD format
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// Generate a unique ID (better than plain Date.now())
let _idCounter = 0
export function generateId(): number {
  _idCounter++
  return Date.now() * 100 + (_idCounter % 100)
}
