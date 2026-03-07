import { supabase } from './supabase'

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

type Channel = 'assistente' | 'workspace'

/**
 * Load saved conversation for the logged-in user + channel.
 * Returns empty array if no conversation found.
 */
export async function loadConversation(channel: Channel): Promise<StoredMessage[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('user_id', user.id)
    .eq('channel', channel)
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

/**
 * Save conversation for the logged-in user + channel.
 * Uses upsert — creates or updates.
 */
export async function saveConversation(channel: Channel, messages: StoredMessage[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Keep only last 100 messages to avoid bloating
  const trimmed = messages.slice(-100)

  await supabase
    .from('ai_conversations')
    .upsert({
      user_id: user.id,
      channel,
      messages: trimmed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,channel' })
}

/**
 * Clear conversation for the logged-in user + channel.
 */
export async function clearConversation(channel: Channel): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('ai_conversations')
    .delete()
    .eq('user_id', user.id)
    .eq('channel', channel)
}
