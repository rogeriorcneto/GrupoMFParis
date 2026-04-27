import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// Estado por referência — imune a clearAllMocks
const _st = {
  data: null as any,
  error: null as any,
}

vi.mock('../supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: _st.data, error: _st.error }),
        }),
      }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}))

vi.mock('../crypto.js', () => ({
  encrypt: (text: string) => `ENC:${text}`,
  decrypt: (text: string | undefined | null) => {
    if (!text) return ''
    return text.startsWith('ENC:') ? text.slice(4) : text
  },
}))

describe('config-store', () => {
  let mod: typeof import('../config-store.js')

  beforeAll(async () => {
    mod = await import('../config-store.js')
  })

  beforeEach(() => {
    mod.invalidateConfigCache()
    _st.data = {
      id: 1,
      email_host: 'smtp.gmail.com',
      email_port: 587,
      email_user: 'user@gmail.com',
      email_pass: 'ENC:senha123',
      email_from: 'noreply@mfparis.com',
      whatsapp_numero: '5531999999999',
    }
    _st.error = null
  })

  it('getEmailConfig retorna config quando mock retorna dados completos', async () => {
    const result = await mod.getEmailConfig()
    expect(result).not.toBeNull()
    expect(result?.host).toBe('smtp.gmail.com')
    expect(result?.user).toBe('user@gmail.com')
  })

  it('loadConfigSync retorna cópia do cache (não referência)', async () => {
    await mod.loadConfig()
    const a = mod.loadConfigSync()
    const b = mod.loadConfigSync()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})
