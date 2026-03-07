import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys'
import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys'
import { supabase } from './supabase.js'
import { log } from './logger.js'

/**
 * Supabase-backed auth state for Baileys.
 * Persists WhatsApp session in the `whatsapp_session` table so it survives
 * Railway restarts and container replacements.
 *
 * Drop-in replacement for useMultiFileAuthState().
 */
export async function useSupabaseAuthState(prefix = 'bot'): Promise<{
  state: AuthenticationState
  saveCreds: () => Promise<void>
  clearSession: () => Promise<void>
}> {
  // Prefix all keys so each session (bot, user_1, user_2, ...) is isolated
  const pfx = (key: string) => `${prefix}:${key}`

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function readData(key: string): Promise<any> {
    const { data, error } = await supabase
      .from('whatsapp_session')
      .select('value')
      .eq('key', pfx(key))
      .single()
    if (error || !data) return null
    try {
      return JSON.parse(data.value, BufferJSON.reviver)
    } catch {
      return null
    }
  }

  async function writeData(key: string, value: any): Promise<void> {
    const serialized = JSON.stringify(value, BufferJSON.replacer)
    const { error } = await supabase
      .from('whatsapp_session')
      .upsert({ key: pfx(key), value: serialized, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) log.error({ error, key: pfx(key) }, 'Erro ao salvar sessão WA no Supabase')
  }

  async function removeData(key: string): Promise<void> {
    await supabase.from('whatsapp_session').delete().eq('key', pfx(key))
  }

  // ── Creds ─────────────────────────────────────────────────────────────────

  const creds = (await readData('creds')) ?? initAuthCreds()

  // ── Keys (Signal Protocol) ────────────────────────────────────────────────

  const keys: AuthenticationState['keys'] = {
    get: async (type, ids) => {
      const data: Record<string, SignalDataTypeMap[typeof type]> = {}
      for (const id of ids) {
        const key = `key_${type}_${id}`
        const value = await readData(key)
        if (value) data[id] = value
      }
      return data
    },
    set: async (data) => {
      const writes: Promise<void>[] = []
      for (const [type, typeData] of Object.entries(data)) {
        for (const [id, value] of Object.entries(typeData as any)) {
          const key = `key_${type}_${id}`
          if (value) {
            writes.push(writeData(key, value))
          } else {
            writes.push(removeData(key))
          }
        }
      }
      await Promise.all(writes)
    },
  }

  // ── saveCreds ─────────────────────────────────────────────────────────────

  const saveCreds = async () => {
    await writeData('creds', creds)
  }

  // ── clearSession (usado no disconnect) ────────────────────────────────────

  const clearSession = async () => {
    const { error } = await supabase
      .from('whatsapp_session')
      .delete()
      .like('key', `${prefix}:%`)
    if (error) log.error({ error }, `Erro ao limpar sessão WA (${prefix}) do Supabase`)
    else log.info(`🗑️ Sessão WhatsApp (${prefix}) removida do Supabase`)
  }

  return {
    state: { creds, keys },
    saveCreds,
    clearSession,
  }
}
