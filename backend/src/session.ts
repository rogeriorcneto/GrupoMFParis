import type { Vendedor } from './database.js'
import { supabase } from './supabase.js'
import { log } from './logger.js'

// ============================================
// State machine para conversas WhatsApp
// ============================================

// Persistência: as sessões viviam só num Map em memória — todo deploy do
// Railway zerava tudo e o vendedor tinha que mandar "login" de novo.
// Agora cada escrita replica pro KV (whatsapp_session) e o boot hidrata
// o Map; miss no cache tenta lazy-load do KV antes de pedir login.
const VEND_SESSION_PREFIX = 'bot_session:'
const SAC_SESSION_PREFIX = 'sac_session:'

function persistKey(prefix: string, num: string, value: unknown): void {
  void supabase
    .from('whatsapp_session')
    .upsert({ key: `${prefix}${num}`, value: value as any }, { onConflict: 'key' })
    .then(({ error }) => { if (error) log.warn({ key: `${prefix}${num}`, err: error.message }, '⚠️ falha ao persistir sessão do bot') }, () => {})
}

function persistDelete(prefix: string, num: string): void {
  void supabase
    .from('whatsapp_session')
    .delete()
    .eq('key', `${prefix}${num}`)
    .then(({ error }) => { if (error) log.warn({ key: `${prefix}${num}` }, '⚠️ falha ao apagar sessão do bot') }, () => {})
}

/** Hidrata o Map em memória a partir do KV — chamar uma vez no boot. */
export async function hydrateSessions(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_session')
      .select('key, value')
      .or(`key.like.${VEND_SESSION_PREFIX}%,key.like.${SAC_SESSION_PREFIX}%`)
    if (error) { log.warn({ err: error.message }, '⚠️ hydrateSessions: falha ao ler KV'); return }
    const now = Date.now()
    let vendedores = 0, sacs = 0
    for (const row of data || []) {
      if (row.key.startsWith(VEND_SESSION_PREFIX)) {
        const s = row.value as UserSession
        if (!s?.lastActivity || now - s.lastActivity > SESSION_TIMEOUT_MS) continue
        sessions.set(row.key.slice(VEND_SESSION_PREFIX.length), s)
        vendedores++
      } else {
        const s = row.value as SacSession
        if (!s?.lastActivity || now - s.lastActivity > SESSION_TIMEOUT_MS) continue
        sacSessions.set(row.key.slice(SAC_SESSION_PREFIX.length), s)
        sacs++
      }
    }
    if (vendedores + sacs > 0) log.info({ vendedores, sacs }, '💧 Sessões do bot hidratadas do KV')
  } catch (err: any) {
    log.warn({ err: err?.message }, '⚠️ hydrateSessions falhou')
  }
}

/** Lazy-load: cache deu miss → tenta o KV antes de considerar deslogado. */
async function loadFromKv<T>(prefix: string, num: string, target: Map<string, T & { lastActivity: number }>): Promise<(T & { lastActivity: number }) | null> {
  try {
    const { data } = await supabase.from('whatsapp_session').select('value').eq('key', `${prefix}${num}`).maybeSingle()
    const s = data?.value as (T & { lastActivity: number }) | undefined
    if (!s?.lastActivity || Date.now() - s.lastActivity > SESSION_TIMEOUT_MS) return null
    s.lastActivity = Date.now()
    target.set(num, s)
    return s
  } catch {
    return null
  }
}

export type BotState =
  | 'idle'
  | 'logged_in'
  | 'creating_client'
  | 'creating_sale'
  | 'searching_client'
  | 'viewing_client_list'
  | 'chatting_ai'

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
  productIndexMap?: number[]
}

export interface UserSession {
  vendedor: Vendedor
  state: BotState
  createClientData?: CreateClientData
  createSaleData?: CreateSaleData
  clientListPage?: number
  clientListIds?: number[]
  listType?: 'clientes' | 'tarefas'
  aiHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
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

/** getSession + fallback no KV (lazy-load) — usar nos pontos async (bot.ts). */
export async function getSessionAsync(whatsappNumber: string): Promise<UserSession | null> {
  const s = getSession(whatsappNumber)
  if (s) return s
  return loadFromKv<UserSession>(VEND_SESSION_PREFIX, whatsappNumber, sessions as any)
}

export function createSession(whatsappNumber: string, vendedor: Vendedor): UserSession {
  const session: UserSession = {
    vendedor,
    state: 'logged_in',
    lastActivity: Date.now(),
  }
  sessions.set(whatsappNumber, session)
  persistKey(VEND_SESSION_PREFIX, whatsappNumber, session)
  return session
}

export function deleteSession(whatsappNumber: string): void {
  sessions.delete(whatsappNumber)
  persistDelete(VEND_SESSION_PREFIX, whatsappNumber)
}

export function updateSession(whatsappNumber: string, updates: Partial<UserSession>): UserSession | null {
  const session = sessions.get(whatsappNumber)
  if (!session) return null
  Object.assign(session, updates, { lastActivity: Date.now() })
  persistKey(VEND_SESSION_PREFIX, whatsappNumber, session)
  return session
}

// ============================================
// Sessões SAC — clientes falando com o bot (item 7.2)
// Separadas das sessões de vendedor: sem acesso às funções do CRM.
// ============================================

export interface SacSession {
  clienteId: number
  clienteNome: string
  lastActivity: number
}

const sacSessions = new Map<string, SacSession>()

export function getSacSession(whatsappNumber: string): SacSession | null {
  const s = sacSessions.get(whatsappNumber)
  if (!s) return null
  if (Date.now() - s.lastActivity > SESSION_TIMEOUT_MS) {
    sacSessions.delete(whatsappNumber)
    return null
  }
  s.lastActivity = Date.now()
  return s
}

export async function getSacSessionAsync(whatsappNumber: string): Promise<SacSession | null> {
  const s = getSacSession(whatsappNumber)
  if (s) return s
  return loadFromKv<SacSession>(SAC_SESSION_PREFIX, whatsappNumber, sacSessions as any)
}

export function createSacSession(whatsappNumber: string, clienteId: number, clienteNome: string): SacSession {
  const s: SacSession = { clienteId, clienteNome, lastActivity: Date.now() }
  sacSessions.set(whatsappNumber, s)
  persistKey(SAC_SESSION_PREFIX, whatsappNumber, s)
  return s
}

export function deleteSacSession(whatsappNumber: string): void {
  sacSessions.delete(whatsappNumber)
  persistDelete(SAC_SESSION_PREFIX, whatsappNumber)
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
