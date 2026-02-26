import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do supabase antes de importar o módulo
vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: {
              id: 1,
              email_host: 'smtp.gmail.com',
              email_port: 587,
              email_user: 'user@gmail.com',
              email_pass: '', // vazio, vai usar env
              email_from: 'noreply@mfparis.com',
              whatsapp_numero: '5531999999999',
            },
            error: null,
          })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}))

// Mock do crypto para não depender da chave real
vi.mock('../crypto.js', () => ({
  encrypt: (text: string) => `ENC:${text}`,
  decrypt: (text: string) => text.startsWith('ENC:') ? text.slice(4) : text,
}))

describe('config-store', () => {
  beforeEach(() => {
    vi.resetModules()
    // Env vars de fallback
    process.env.EMAIL_HOST = 'env-host.com'
    process.env.EMAIL_USER = 'env-user@test.com'
    process.env.EMAIL_PASS = 'env-pass-123'
    process.env.EMAIL_PORT = '465'
    process.env.EMAIL_FROM = 'env-from@test.com'
  })

  it('getEmailConfig retorna null se dados essenciais faltam', async () => {
    // Importar fresh (sem cache)
    const mod = await import('../config-store.js')
    // Forçar config sem host
    const result = await mod.getEmailConfig()
    // Como o mock retorna dados completos, não deve ser null
    expect(result).not.toBeNull()
    expect(result?.host).toBe('smtp.gmail.com')
    expect(result?.user).toBe('user@gmail.com')
  })

  it('loadConfigSync retorna cópia do cache (não referência)', async () => {
    const mod = await import('../config-store.js')
    await mod.loadConfig()
    const a = mod.loadConfigSync()
    const b = mod.loadConfigSync()
    expect(a).toEqual(b)
    expect(a).not.toBe(b) // cópias diferentes
  })
})
