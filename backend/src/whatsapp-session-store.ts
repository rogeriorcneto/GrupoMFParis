import type { AuthenticationState, SignalDataTypeMap } from 'baileys'
import { BufferJSON, initAuthCreds } from 'baileys'
import { supabase } from './supabase.js'
import { log } from './logger.js'

/**
 * Supabase-backed auth state for Baileys.
 * Persists WhatsApp session in the `whatsapp_session` table so it survives
 * Railway restarts and container replacements.
 *
 * Drop-in replacement for useMultiFileAuthState().
 */
export async function useSupabaseAuthState(prefix = 'bot', options?: { fresh?: boolean }): Promise<{
  state: AuthenticationState
  saveCreds: () => Promise<void>
  clearSession: () => Promise<void>
  saveLidMap: (map: Map<string, string>) => Promise<void>
  loadLidMap: () => Promise<Map<string, string>>
}> {
  // Prefix all keys so each session (bot, user_1, user_2, ...) is isolated
  const pfx = (key: string) => `${prefix}:${key}`

  // ── Helpers ──────────────────────────────────────────────────────────────

  // ── Cache em memória por sessão (elimina dezenas de round-trips HTTP sequenciais no Signal durante sendMessage) ──
  const memCache = new Map<string, any>()

  async function readData(key: string): Promise<any> {
    if (memCache.has(key)) return memCache.get(key)
    const { data, error } = await supabase
      .from('whatsapp_session')
      .select('value')
      .eq('key', pfx(key))
      .maybeSingle()
    if (error || !data) return null
    try {
      const parsed = JSON.parse(data.value, BufferJSON.reviver)
      memCache.set(key, parsed)
      return parsed
    } catch {
      return null
    }
  }

  async function readManyData(keysToRead: string[]): Promise<Record<string, any>> {
    const out: Record<string, any> = {}
    const missing: string[] = []
    for (const k of keysToRead) {
      if (memCache.has(k)) {
        const cached = memCache.get(k)
        if (cached !== null && cached !== undefined) out[k] = cached
      } else {
        missing.push(k)
      }
    }
    if (missing.length === 0) return out

    const CHUNK = 100
    for (let i = 0; i < missing.length; i += CHUNK) {
      const slice = missing.slice(i, i + CHUNK)
      const prefixed = slice.map(pfx)
      const { data, error } = await supabase
        .from('whatsapp_session')
        .select('key, value')
        .in('key', prefixed)
      if (error || !data) continue
      const foundPrefixed = new Set<string>()
      for (const row of data) {
        foundPrefixed.add(row.key)
        const shortKey = row.key.slice(prefix.length + 1)
        try {
          const parsed = JSON.parse(row.value, BufferJSON.reviver)
          memCache.set(shortKey, parsed)
          if (parsed !== null && parsed !== undefined) out[shortKey] = parsed
        } catch {
          // ignore malformed
        }
      }
      for (const shortKey of slice) {
        if (!foundPrefixed.has(pfx(shortKey))) {
          memCache.set(shortKey, null)
        }
      }
    }
    return out
  }

  async function writeData(key: string, value: any): Promise<void> {
    memCache.set(key, value)
    const serialized = JSON.stringify(value, BufferJSON.replacer)
    const { error } = await supabase
      .from('whatsapp_session')
      .upsert({ key: pfx(key), value: serialized, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) log.error({ error, key: pfx(key) }, 'Erro ao salvar sessão WA no Supabase')
  }

  async function removeData(key: string): Promise<void> {
    memCache.delete(key)
    await supabase.from('whatsapp_session').delete().eq('key', pfx(key))
  }

  // ── Creds ─────────────────────────────────────────────────────────────────

  const creds = options?.fresh ? initAuthCreds() : ((await readData('creds')) ?? initAuthCreds())

  // ── Keys (Signal Protocol — leitura e escrita em lote) ─────────────────────

  const keys: AuthenticationState['keys'] = {
    get: async (type, ids) => {
      const data: Record<string, SignalDataTypeMap[typeof type]> = {}
      if (!ids || ids.length === 0) return data
      const keyNames = ids.map(id => `key_${type}_${id}`)
      const loaded = await readManyData(keyNames)
      for (const id of ids) {
        const val = loaded[`key_${type}_${id}`]
        if (val) data[id] = val
      }
      return data
    },
    set: async (data) => {
      const nowISO = new Date().toISOString()
      const upserts: { key: string; value: string; updated_at: string }[] = []
      const deletes: string[] = []
      for (const [type, typeData] of Object.entries(data)) {
        for (const [id, value] of Object.entries(typeData as any)) {
          const shortKey = `key_${type}_${id}`
          if (value) {
            memCache.set(shortKey, value)
            upserts.push({
              key: pfx(shortKey),
              value: JSON.stringify(value, BufferJSON.replacer),
              updated_at: nowISO,
            })
          } else {
            memCache.delete(shortKey)
            deletes.push(pfx(shortKey))
          }
        }
      }
      const ops: Promise<any>[] = []
      for (let i = 0; i < upserts.length; i += 100) {
        const chunk = upserts.slice(i, i + 100)
        ops.push(
          Promise.resolve(
            supabase.from('whatsapp_session').upsert(chunk, { onConflict: 'key' })
          ).then(({ error }) => {
            if (error) log.error({ error }, 'Erro em upsert batch de chaves WA')
          })
        )
      }
      for (let i = 0; i < deletes.length; i += 100) {
        const chunk = deletes.slice(i, i + 100)
        ops.push(Promise.resolve(supabase.from('whatsapp_session').delete().in('key', chunk)))
      }
      if (ops.length > 0) await Promise.all(ops)
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

  // ── LID map persistence (survives reconnects) ─────────────────────────────

  const LID_MAP_KEY = 'lid_map'

  const saveLidMap = async (map: Map<string, string>) => {
    const obj = Object.fromEntries(map.entries())
    await writeData(LID_MAP_KEY, obj)
  }

  const loadLidMap = async (): Promise<Map<string, string>> => {
    const data = await readData(LID_MAP_KEY)
    if (data && typeof data === 'object') {
      return new Map(Object.entries(data))
    }
    return new Map()
  }

  return {
    state: { creds, keys },
    saveCreds,
    clearSession,
    saveLidMap,
    loadLidMap,
  }
}
