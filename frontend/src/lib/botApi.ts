import { supabase } from './supabase'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3001'

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
export async function sendWhatsApp(number: string, text: string, clienteId?: number, vendedorNome?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BOT_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text, clienteId, vendedorNome }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão com o bot' }
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

/** Get bot URL for direct use */
export { BOT_URL }
