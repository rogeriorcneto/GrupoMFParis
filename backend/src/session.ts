import type { Vendedor } from './database.js'

// ============================================
// State machine para conversas WhatsApp
// ============================================

export type BotState =
  | 'idle'
  | 'logged_in'
  | 'creating_client'
  | 'creating_sale'
  | 'searching_client'
  | 'viewing_client_list'

export type CreateClientStep = 'razaoSocial' | 'cnpj' | 'contatoNome' | 'contatoTelefone' | 'contatoEmail' | 'confirm'
export type CreateSaleStep = 'selectClient' | 'selectProduct' | 'addMore' | 'observacoes' | 'confirm'

export interface CreateClientData {
  step: CreateClientStep
  razaoSocial?: string
  cnpj?: string
  contatoNome?: string
  contatoTelefone?: string
  contatoEmail?: string
}

export interface CreateSaleData {
  step: CreateSaleStep
  clienteId?: number
  clienteNome?: string
  itens: Array<{ produtoId: number; nomeProduto: string; unidade: string; sku?: string; preco: number; quantidade: number }>
  observacoes?: string
}

export interface UserSession {
  vendedor: Vendedor
  state: BotState
  createClientData?: CreateClientData
  createSaleData?: CreateSaleData
  clientListPage?: number
  clientListIds?: number[]
  lastActivity: number
}

// Map: whatsapp number (e.g. "5531999991234") → session
const sessions = new Map<string, UserSession>()

const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000 // 24 horas

export function getSession(whatsappNumber: string): UserSession | null {
  const session = sessions.get(whatsappNumber)
  if (!session) return null
  if (Date.now() - session.lastActivity > SESSION_TIMEOUT_MS) {
    sessions.delete(whatsappNumber)
    return null
  }
  session.lastActivity = Date.now()
  return session
}

export function createSession(whatsappNumber: string, vendedor: Vendedor): UserSession {
  const session: UserSession = {
    vendedor,
    state: 'logged_in',
    lastActivity: Date.now(),
  }
  sessions.set(whatsappNumber, session)
  return session
}

export function deleteSession(whatsappNumber: string): void {
  sessions.delete(whatsappNumber)
}

export function updateSession(whatsappNumber: string, updates: Partial<UserSession>): UserSession | null {
  const session = sessions.get(whatsappNumber)
  if (!session) return null
  Object.assign(session, updates, { lastActivity: Date.now() })
  return session
}

export function getActiveSessions(): number {
  // Cleanup expired sessions
  const now = Date.now()
  for (const [key, session] of sessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      sessions.delete(key)
    }
  }
  return sessions.size
}
