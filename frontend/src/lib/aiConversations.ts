import { supabase } from './supabase'

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

export interface Conversation {
  id: string
  title: string
  messages: StoredMessage[]
  created_at: string
  updated_at: string
}

// ── Lista todas as conversas do usuário ──
export async function listConversations(): Promise<Conversation[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error || !data) return []

  return data.map(row => ({
    id: row.id,
    title: row.title || 'Conversa sem título',
    messages: Array.isArray(row.messages) ? row.messages : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

// ── Carrega uma conversa específica por ID ──
export async function loadConversation(id: string): Promise<StoredMessage[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('user_id', user.id)
    .eq('id', id)
    .single()

  if (error || !data) return []

  try {
    const messages = typeof data.messages === 'string'
      ? JSON.parse(data.messages)
      : data.messages
    return Array.isArray(messages) ? messages : []
  } catch {
    return []
  }
}

// ── Cria nova conversa, retorna o ID gerado ──
export async function createConversation(title: string, messages: StoredMessage[]): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({
      user_id: user.id,
      title,
      messages: messages.slice(-100),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) return null
  return data.id
}

// ── Salva (atualiza) mensagens e título de uma conversa existente ──
export async function saveConversation(id: string, messages: StoredMessage[], title?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const update: any = {
    messages: messages.slice(-100),
    updated_at: new Date().toISOString(),
  }
  if (title) update.title = title

  await supabase
    .from('ai_conversations')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
}

// ── Renomeia uma conversa ──
export async function renameConversation(id: string, title: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('ai_conversations')
    .update({ title })
    .eq('id', id)
    .eq('user_id', user.id)
}

// ── Deleta uma conversa ──
export async function deleteConversation(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('ai_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
}

// ── Compatibilidade com uso legado por channel (Workspace) ──
const LEGACY_CHANNEL_PREFIX = '__channel__'

export async function loadConversationByChannel(channel: string): Promise<StoredMessage[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('ai_conversations')
    .select('id, messages')
    .eq('user_id', user.id)
    .eq('title', LEGACY_CHANNEL_PREFIX + channel)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (!data) return []
  try {
    const messages = typeof data.messages === 'string' ? JSON.parse(data.messages) : data.messages
    return Array.isArray(messages) ? messages : []
  } catch { return [] }
}

export async function saveConversationByChannel(channel: string, messages: StoredMessage[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const title = LEGACY_CHANNEL_PREFIX + channel
  const { data: existing } = await supabase
    .from('ai_conversations')
    .select('id')
    .eq('user_id', user.id)
    .eq('title', title)
    .limit(1)
    .single()
  if (existing?.id) {
    await saveConversation(existing.id, messages)
  } else {
    await createConversation(title, messages)
  }
}

export async function clearConversationByChannel(channel: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const title = LEGACY_CHANNEL_PREFIX + channel
  await supabase.from('ai_conversations').delete().eq('user_id', user.id).eq('title', title)
}

// ── Gera título automático a partir da primeira mensagem do usuário ──
export function generateTitle(messages: StoredMessage[]): string {
  const first = messages.find(m => m.role === 'user')
  if (!first) return 'Nova conversa'
  const text = first.text.trim()
  return text.length > 50 ? text.slice(0, 50) + '…' : text
}
