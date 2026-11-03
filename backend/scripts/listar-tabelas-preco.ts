import { createClient } from '@supabase/supabase-js'

const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'

async function authFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function main() {
  const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email: GERENTE_EMAIL, password: GERENTE_SENHA })
  if (authErr || !authData.session) { console.error('login err', authErr?.message); process.exit(1) }
  const token = authData.session.access_token

  const res = await authFetch(token, '/api/omie/tabelas-preco')
  console.log('Status:', res.status)
  console.log(JSON.stringify(res.body, null, 2))
}

main()
