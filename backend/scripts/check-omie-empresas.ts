import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function main() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'rafael@mfparis.com.br',
    password: 'MFParis2024!',
  })
  const token = authData?.session?.access_token
  if (!token) { console.error('login failed'); process.exit(1) }

  const res = await fetch('https://grupomfparis-production.up.railway.app/api/omie/config/empresas', {
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log(JSON.stringify(await res.json(), null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
