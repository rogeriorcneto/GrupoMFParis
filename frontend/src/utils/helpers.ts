import type { Cliente } from '../types'

// Unified Lead Scoring Algorithm
export function calculateLeadScore(cliente: Cliente, interacoesCount: number = 0): number {
  let score = 0

  // Score base por etapa (40%)
  const etapaScores: Record<string, number> = {
    'prospecção': 20,
    'amostra': 40,
    'homologado': 60,
    'negociacao': 80,
    'pos_venda': 100
  }
  score += etapaScores[cliente.etapa] || 0

  // Score por valor estimado (30%)
  if (cliente.valorEstimado) {
    if (cliente.valorEstimado > 100000) score += 30
    else if (cliente.valorEstimado > 50000) score += 20
    else if (cliente.valorEstimado > 20000) score += 10
  }

  // Score por engajamento / inatividade (20%)
  if (cliente.diasInativo !== undefined) {
    if (cliente.diasInativo <= 7) score += 20
    else if (cliente.diasInativo <= 15) score += 15
    else if (cliente.diasInativo <= 30) score += 10
    else if (cliente.diasInativo > 30) score -= 10
  }

  // Score por produtos de interesse (10%)
  if (cliente.produtosInteresse && cliente.produtosInteresse.length > 0) {
    score += Math.min(cliente.produtosInteresse.length * 2, 10)
  }

  // Bonus por volume de interações
  if (interacoesCount >= 5) score += 5
  else if (interacoesCount >= 2) score += 2

  return Math.max(0, Math.min(100, score))
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
