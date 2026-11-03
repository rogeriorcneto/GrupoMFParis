import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'rafael@mfparis.com.br',
    password: 'MFParis2024!',
  })
  if (authErr || !authData.session) {
    console.error('login err', authErr?.message)
    process.exit(1)
  }

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
  })

  const { data, error } = await authed
    .from('produtos')
    .select('id, nome, sku, omie_codigo, unidade, preco, peso_kg, ativo')
    .order('id')
    .limit(20)

  console.log('error:', error?.message)
  console.log('total:', data?.length)
  console.log(JSON.stringify(data, null, 2))
}

main()
