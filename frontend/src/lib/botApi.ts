import { supabase } from './supabase'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

/** Fetch with Supabase auth token attached */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    throw new Error('Não autenticado')
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    if (res.status === 403) throw new Error('FORBIDDEN')
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

/** Send a WhatsApp message via backend */
export async function sendWhatsApp(number: string, text: string, clienteId?: number, vendedorNome?: string, vendedorId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text, clienteId, vendedorNome, vendedorId }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão com o bot' }
  }
}

/** Fetch WhatsApp message history */
export async function fetchWhatsAppMessages(params: { numero?: string; clienteId?: number; limit?: number }): Promise<any[]> {
  try {
    const query = new URLSearchParams()
    if (params.clienteId) query.set('clienteId', String(params.clienteId))
    else if (params.numero) query.set('numero', params.numero)
    if (params.limit) query.set('limit', String(params.limit))
    const res = await authFetch(`${BOT_URL}/api/whatsapp/messages?${query.toString()}`)
    return await res.json()
  } catch {
    return []
  }
}

/** Send an email via backend */
export async function sendEmailViaBot(to: string, subject: string, body: string, clienteId?: number, vendedorNome?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body, clienteId, vendedorNome }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão com o bot' }
  }
}

// ─── Per-User WhatsApp (cada vendedor conecta seu próprio WA) ───

export interface UserWAStatus {
  connected: boolean
  status: 'disconnected' | 'connecting' | 'qr' | 'connected'
  number: string | null
  uptime: number
  vendedorId: number
}

/** Get the logged user's WhatsApp connection status */
export async function getUserWhatsAppStatus(): Promise<UserWAStatus> {
  const res = await authFetch(`${BOT_URL}/api/whatsapp/user/status`)
  return await res.json()
}

/** Get the logged user's WhatsApp QR code (if available) */
export async function getUserWhatsAppQR(): Promise<{ qr: string | null; status: string; number?: string }> {
  const res = await authFetch(`${BOT_URL}/api/whatsapp/user/qr`)
  return await res.json()
}

/** Connect the logged user's WhatsApp */
export async function connectUserWhatsApp(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/connect`, { method: 'POST' })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao conectar' }
  }
}

/** Disconnect the logged user's WhatsApp */
export async function disconnectUserWhatsApp(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/disconnect`, { method: 'POST' })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao desconectar' }
  }
}

/** Send a WhatsApp message via the logged user's own WhatsApp session */
export async function sendUserWhatsApp(
  number: string, text: string, clienteId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text, clienteId }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão' }
  }
}

/** Get all user WhatsApp sessions (gerente only) */
export async function getAllUserWhatsAppSessions(): Promise<UserWAStatus[]> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/sessions`)
    return await res.json()
  } catch {
    return []
  }
}

// ── Vendedor Histórico (gerente) ──

export interface VendedorHistoricoItem {
  id: number
  tipo: string
  descricao: string
  vendedorNome: string
  timestamp: string
}

export async function fetchVendedorHistorico(vendedorId: number, limit = 200): Promise<{ vendedor: { id: number; nome: string }; atividades: VendedorHistoricoItem[] }> {
  const res = await authFetch(`${BOT_URL}/api/vendedor/${vendedorId}/historico?limit=${limit}`)
  if (!res.ok) throw new Error('Erro ao buscar histórico')
  return await res.json()
}

export async function fetchAllVendedoresHistorico(limit = 500): Promise<{ atividades: VendedorHistoricoItem[] }> {
  const res = await authFetch(`${BOT_URL}/api/vendedores/historico?limit=${limit}`)
  if (!res.ok) throw new Error('Erro ao buscar histórico geral')
  return await res.json()
}

// ─── Omie Pedido Integration ───

export interface OmieApprovalResult {
  success: boolean
  pedido_aprovado: boolean
  omie: {
    success: boolean
    error?: string
    omie_codigo?: string
  }
}

/** Aprovar pedido e enviar automaticamente ao Omie */
export async function aprovarPedidoComOmie(pedidoId: number): Promise<OmieApprovalResult> {
  const res = await authFetch(`${BOT_URL}/api/pedidos/${pedidoId}/aprovar`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
  return await res.json()
}

/** Enviar pedido manualmente ao Omie (já aprovado) */
export async function enviarPedidoOmie(pedidoId: number): Promise<{ success: boolean; omie?: any; error?: string }> {
  const res = await authFetch(`${BOT_URL}/api/pedidos/${pedidoId}/enviar-omie`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
  return await res.json()
}

/** Consultar status do pedido no Omie */
export async function consultarStatusOmie(pedidoId: number): Promise<{ success: boolean; status?: any; error?: string }> {
  const res = await authFetch(`${BOT_URL}/api/pedidos/${pedidoId}/status-omie`)
  return await res.json()
}

// ─── Bulk Dispatch (disparo em massa) ───

export interface BulkTarget {
  clienteId: number
  to: string
}

export interface BulkStatus {
  batchId: string
  canal: 'email' | 'whatsapp'
  total: number
  sent: number
  failed: number
  errors: Array<{ clienteId: number; to: string; error: string }>
  status: 'running' | 'done' | 'cancelled'
  startedAt: string
  finishedAt?: string
}

/** Start a bulk email/whatsapp dispatch */
export async function startBulkSend(params: {
  canal: 'email' | 'whatsapp'
  subject?: string
  body?: string
  templateId?: number
  targets: BulkTarget[]
  vendedorNome: string
  delayMs?: number
}): Promise<{ success: boolean; batchId?: string; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/bulk/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão' }
  }
}

/** Poll batch status */
export async function getBulkStatus(batchId: string): Promise<BulkStatus | null> {
  try {
    const res = await authFetch(`${BOT_URL}/api/bulk/status/${batchId}`)
    return await res.json()
  } catch {
    return null
  }
}

/** Get all batch history */
export async function getBulkBatches(): Promise<BulkStatus[]> {
  try {
    const res = await authFetch(`${BOT_URL}/api/bulk/batches`)
    return await res.json()
  } catch {
    return []
  }
}

/** Cancel a running batch */
export async function cancelBulkBatch(batchId: string): Promise<{ success: boolean }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/bulk/cancel/${batchId}`, { method: 'POST' })
    return await res.json()
  } catch {
    return { success: false }
  }
}

/** Get bot URL for direct use */
export { BOT_URL }
