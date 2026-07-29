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

/** Fetch WhatsApp chat messages from in-memory Baileys cache (real-time + history) */
export async function fetchWhatsAppChatMessages(params: { jid?: string; numero?: string; limit?: number }): Promise<any[]> {
  try {
    const query = new URLSearchParams()
    if (params.jid) query.set('jid', params.jid)
    else if (params.numero) query.set('numero', params.numero)
    if (params.limit) query.set('limit', String(params.limit))
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/chat-messages?${query.toString()}`)
    return await res.json()
  } catch {
    return []
  }
}

/** Fetch AI context data (WhatsApp msgs, calls, products, tasks) */
export interface AIContextData {
  whatsappMessages: { numero: string; mensagem: string; direcao: string; created_at: string }[]
  callRecordings: { id: number; cliente_id: number | null; numero_telefone: string; duracao_segundos: number; notas: string | null; tipo_chamada: string; transcricao: string | null; created_at: string }[]
  produtos: { nome: string; sku: string; categoria: string; preco: number; unidade: string; estoque: number | null; ativo: boolean; omie_codigo: string | null }[]
  tarefas: { titulo: string; descricao: string; prioridade: string; status: string; data_vencimento: string | null; created_at: string }[]
}

export async function fetchAIContextData(): Promise<AIContextData> {
  try {
    const res = await authFetch(`${BOT_URL}/api/ai/data`)
    return await res.json()
  } catch {
    return { whatsappMessages: [], callRecordings: [], produtos: [], tarefas: [] }
  }
}

/** Transcribe a call recording via Gemini AI */
export async function transcribeCallRecording(callId: number): Promise<{ success: boolean; transcription?: string; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/ai/transcribe/${callId}`, { method: 'POST' })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão' }
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

export interface InboxEmailItem {
  id: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  bodyText: string
  unread: boolean
}

/** Fetch inbox emails related to a client email */
export async function fetchEmailInbox(clienteEmail: string, limit = 30): Promise<{ success: boolean; data?: InboxEmailItem[]; error?: string }> {
  try {
    const query = new URLSearchParams({ clienteEmail, limit: String(limit) })
    const res = await authFetch(`${BOT_URL}/api/email/inbox?${query.toString()}`)
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão com inbox de email' }
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

/** Verifica se um número existe no WhatsApp */
export async function checkWhatsAppNumber(
  number: string
): Promise<{ exists: boolean; jid?: string; number?: string; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/check-number`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number }),
    })
    return await res.json()
  } catch (err: any) {
    return { exists: false, error: err?.message || 'Erro de conexão' }
  }
}

/** Validar todos os contatos do CRM no WhatsApp (em lote) */
export async function validateWhatsAppContacts(): Promise<{
  total: number; valid: number; invalid: number; errors: number;
  details: Array<{ clienteId: number; nome: string; number: string; valid: boolean; jid?: string }>
}> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/validate-contacts`, {
      method: 'POST',
    })
    return await res.json()
  } catch (err: any) {
    throw new Error(err?.message || 'Erro de conexão')
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

/** Fetch WhatsApp contacts from the logged user's session */
export interface WAContactItem {
  jid: string
  name: string
  number: string
  notify?: string
  lastMsgTimestamp?: number
  unreadCount?: number
}

export async function getUserWhatsAppContacts(): Promise<WAContactItem[]> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/contacts`)
    return await res.json()
  } catch {
    return []
  }
}

/** Send audio via the logged user's WhatsApp */
export async function sendUserWhatsAppAudio(
  number: string, audioBase64: string, mimetype?: string, clienteId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/send-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, audioBase64, mimetype, clienteId }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão' }
  }
}

/** Send image via the logged user's WhatsApp */
export async function sendUserWhatsAppImage(
  number: string, imageBase64: string, mimetype?: string, caption?: string, clienteId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/send-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, imageBase64, mimetype, caption, clienteId }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão' }
  }
}

/** Query CRM AI from vendedor's WhatsApp chat panel */
export async function queryWhatsAppAI(
  message: string, history?: { role: string; content: string }[]
): Promise<{ success: boolean; reply?: string; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/user/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão' }
  }
}

export async function suggestSalesMessage(params: {
  canal: 'email' | 'whatsapp' | 'texto'
  text?: string
  instruction?: string
  clienteNome?: string
  empresaNome?: string
  vendedorNome?: string
}): Promise<{ success: boolean; suggestion?: string; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/ai/suggest-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao gerar sugestão da IA' }
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

/** Atualiza email (login) e/ou senha de um vendedor. Somente gerente. */
export async function updateVendedorCredentials(
  vendedorId: number,
  updates: { email?: string; senha?: string }
): Promise<{ success: boolean; error?: string }> {
  const res = await authFetch(`${BOT_URL}/api/vendedores/${vendedorId}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Erro ao atualizar credenciais')
  return data
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
    pending?: boolean
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

/** Cancelar pedido no CRM e no Omie */
export async function cancelarPedidoOmie(pedidoId: number, motivo?: string): Promise<{ success: boolean; omie?: any; error?: string }> {
  const res = await authFetch(`${BOT_URL}/api/pedidos/${pedidoId}/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo: motivo || 'Cancelado pelo usuário' }),
  })
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

// ─── Google Maps Prospecção ───

export interface GooglePlace {
  place_id: string
  name: string
  vicinity?: string
  formatted_address?: string
  geometry: {
    location: { lat: number; lng: number }
  }
  rating?: number
  user_ratings_total?: number
  types?: string[]
  business_status?: string
  formatted_phone_number?: string
  international_phone_number?: string
  website?: string
}

export interface ProspecaoSearchResult {
  results: GooglePlace[]
  next_page_token?: string
  status: string
}

/** Buscar empresas no Google Maps (Places API) */
export async function buscarEmpresasGoogleMaps(
  query: string,
  location?: { lat: number; lng: number },
  radius?: number,
  tipo?: string
): Promise<ProspecaoSearchResult & { error?: string }> {
  try {
    const params = new URLSearchParams()
    params.set('query', query)
    if (location) {
      params.set('location', `${location.lat},${location.lng}`)
      params.set('radius', String(radius || 5000))
    }
    if (tipo) params.set('type', tipo)

    const res = await authFetch(`${BOT_URL}/api/maps/buscar?${params.toString()}`)
    return await res.json()
  } catch (err: any) {
    return { results: [], status: 'ERROR', error: err.message }
  }
}

/** Obter detalhes completos de um lugar */
export async function obterDetalhesLugar(placeId: string): Promise<GooglePlace & { error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/maps/detalhes?placeId=${encodeURIComponent(placeId)}`)
    return await res.json()
  } catch (err: any) {
    return { place_id: placeId, name: '', geometry: { location: { lat: 0, lng: 0 } }, error: err.message }
  }
}

/** Importar lugar como lead no CRM */
export async function importarLugarComoLead(
  place: GooglePlace,
  vendedorId?: number
): Promise<{ success: boolean; clienteId?: number; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/maps/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place, vendedorId }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/** Busca dados de CNPJ via backend (proxy server-side para evitar CORS) */
export async function fetchCnpjViaBackend(cnpj: string): Promise<any | null> {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return null
  try {
    const res = await authFetch(`${BOT_URL}/api/cnpj/${digits}`)
    return await res.json()
  } catch {
    return null
  }
}

/** Envia um batimento de tempo de tela (1 minuto ativo) */
export async function sendTempoTelaBeat(
  vendedorId: number,
  inicio: string,
  fim: string,
  duracaoSegundos: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/tempo-tela/beat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendedorId, inicio, fim, duracaoSegundos }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao enviar batimento' }
  }
}

export interface TempoTelaRelatorioItem {
  vendedorId: number
  nome: string
  totalSegundos: number
}

export interface TempoTelaRelatorioResponse {
  periodo: { dataInicio: string; dataFim: string }
  relatorio: TempoTelaRelatorioItem[]
}

/** Busca relatório de tempo de tela (gerente) */
export async function fetchTempoTelaRelatorio(
  dataInicio: string,
  dataFim: string
): Promise<TempoTelaRelatorioResponse & { error?: string }> {
  try {
    const res = await authFetch(
      `${BOT_URL}/api/tempo-tela/relatorio?dataInicio=${encodeURIComponent(dataInicio)}&dataFim=${encodeURIComponent(dataFim)}`
    )
    return await res.json()
  } catch (err: any) {
    return { periodo: { dataInicio, dataFim }, relatorio: [], error: err?.message || 'Erro ao buscar relatório' }
  }
}

export interface RoleplayMsg { role: 'user' | 'assistant'; content: string; ts: number }
export interface RoleplaySession {
  id: string
  modulo: string
  perfilId: string
  msgs: RoleplayMsg[]
  duracao: number
  nota: number | null
  feedback: string
  createdAt: string
}

/** Salva uma sessão de roleplay no backend */
export async function saveRoleplaySession(
  vendedorId: number,
  sessao: RoleplaySession,
  perfilNome?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const feedbackParsed = (() => {
      try { return JSON.parse(sessao.feedback) } catch { return sessao.feedback }
    })()
    const res = await authFetch(`${BOT_URL}/api/roleplay/sessao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendedorId,
        modulo: sessao.modulo,
        perfilId: sessao.perfilId,
        perfilNome: perfilNome || sessao.perfilId,
        mensagens: sessao.msgs,
        duracaoSegundos: sessao.duracao,
        nota: sessao.nota,
        feedback: feedbackParsed,
      }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao salvar sessão' }
  }
}

/** Busca histórico de roleplay do vendedor */
export async function fetchRoleplayHistory(
  vendedorId: number
): Promise<{ sessoes: any[]; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/roleplay/historico?vendedorId=${encodeURIComponent(vendedorId)}`)
    return await res.json()
  } catch (err: any) {
    return { sessoes: [], error: err?.message || 'Erro ao buscar histórico' }
  }
}

/** Busca histórico de roleplay de todos os vendedores (gerente) */
export async function fetchRoleplayHistoryGerente(): Promise<{ sessoes: any[]; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/roleplay/historico/gerente`)
    return await res.json()
  } catch (err: any) {
    return { sessoes: [], error: err?.message || 'Erro ao buscar histórico' }
  }
}
