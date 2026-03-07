import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('config.ts — env helpers', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    // Set minimum required env vars
    process.env.SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('CONFIG loads SUPABASE_URL and SUPABASE_ANON_KEY from env', async () => {
    const { CONFIG } = await import('../config.js')
    expect(CONFIG.supabaseUrl).toBe('http://localhost:54321')
    expect(CONFIG.supabaseAnonKey).toBe('test-anon-key')
  })

  it('CONFIG parses PORT as integer', async () => {
    process.env.PORT = '5555'
    const { CONFIG } = await import('../config.js')
    expect(CONFIG.port).toBe(5555)
  })

  it('CONFIG reads PORT env var', async () => {
    process.env.PORT = '4000'
    const { CONFIG } = await import('../config.js')
    expect(CONFIG.port).toBe(4000)
  })

  it('CONFIG.emailConfigured is true when host/user/pass set', async () => {
    process.env.EMAIL_HOST = 'smtp.test.com'
    process.env.EMAIL_USER = 'user@test.com'
    process.env.EMAIL_PASS = 'pass123'
    const { CONFIG } = await import('../config.js')
    expect(CONFIG.emailConfigured).toBe(true)
  })

  it('CONFIG.emailConfigured is false when host is missing', async () => {
    delete process.env.EMAIL_HOST
    process.env.EMAIL_USER = 'user@test.com'
    process.env.EMAIL_PASS = 'pass123'
    const { CONFIG } = await import('../config.js')
    expect(CONFIG.emailConfigured).toBe(false)
  })

  it('supabaseServiceRoleKey falls back to anonKey when not set', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { CONFIG } = await import('../config.js')
    expect(CONFIG.supabaseServiceRoleKey).toBe(CONFIG.supabaseAnonKey)
  })

  it('CORS_ORIGINS splits comma-separated values', async () => {
    process.env.CORS_ORIGINS = 'http://a.com, http://b.com'
    const { CONFIG } = await import('../config.js')
    expect(CONFIG.corsOrigins).toEqual(['http://a.com', 'http://b.com'])
  })
})
