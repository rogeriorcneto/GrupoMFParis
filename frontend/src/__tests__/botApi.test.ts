import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase module
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}))

import { supabase } from '../lib/supabase'

// Reimplementamos a lógica core de authFetch para testar sem dependência de network
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Não autenticado. Faça login novamente.')
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/json')
  const res = await fetch(url, { ...options, headers })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  if (res.status === 403) throw new Error('FORBIDDEN')
  return res
}

describe('authFetch logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as any
  })

  it('sem token dispara erro "Não autenticado"', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as any)
    await expect(authFetch('/api/test')).rejects.toThrow('Não autenticado')
  })

  it('com token faz fetch com Authorization header', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'my-token' } }, error: null,
    } as any)
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('ok', { status: 200 }))

    await authFetch('http://localhost:3001/api/test')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/test',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
    const callHeaders = (vi.mocked(globalThis.fetch).mock.calls[0][1] as any).headers as Headers
    expect(callHeaders.get('Authorization')).toBe('Bearer my-token')
  })

  it('401 dispara erro AUTH_EXPIRED', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token' } }, error: null,
    } as any)
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    await expect(authFetch('/api/test')).rejects.toThrow('AUTH_EXPIRED')
  })

  it('403 dispara erro FORBIDDEN', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token' } }, error: null,
    } as any)
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('Forbidden', { status: 403 }))
    await expect(authFetch('/api/test')).rejects.toThrow('FORBIDDEN')
  })

  it('200 retorna response normalmente', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token' } }, error: null,
    } as any)
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    const res = await authFetch('/api/test')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
