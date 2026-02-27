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
export async function useSupabaseAuthState(): Promise<{
  state: AuthenticationState
  saveCreds: () => Promise<void>
  clearSession: () => Promise<void>
}> {
  // ── Helpers ──────────────────────────────────────────────────────────────

  async function readData(key: string): Promise<any> {
    const { data, error } = await supabase
      .from('whatsapp_session')
      .select('value')
      .eq('key', key)
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
      .upsert({ key, value: serialized, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) log.error({ error, key }, 'Erro ao salvar sessão WA no Supabase')
  }

  async function removeData(key: string): Promise<void> {
    await supabase.from('whatsapp_session').delete().eq('key', key)
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
      .neq('key', '__placeholder__') // delete all rows
    if (error) log.error({ error }, 'Erro ao limpar sessão WA do Supabase')
    else log.info('🗑️ Sessão WhatsApp removida do Supabase')
  }

  return {
    state: { creds, keys },
    saveCreds,
    clearSession,
  }
}
