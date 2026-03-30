import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: GERENTE_EMAIL,
    password: GERENTE_SENHA,
  })

  if (authErr || !authData.session) {
    throw new Error(`Login falhou: ${authErr?.message || 'sem sessão'}`)
  }

  const token = authData.session.access_token

  const { data: produtos, error } = await supabase
    .from('produtos')
    .select('id, nome, omie_codigo')
    .not('omie_codigo', 'is', null)
    .order('id', { ascending: true })
    .limit(200)

  if (error) throw error

  if (!produtos || produtos.length === 0) {
    console.log('Nenhum produto com omie_codigo no CRM.')
    return
  }

  const ignoredCodes = new Set(['9624149052'])

  for (const p of produtos) {
    const code = String(p.omie_codigo || '').trim()
    if (!code || ignoredCodes.has(code)) continue

    const resp = await fetch(`${BACKEND_URL}/api/omie/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        group: 'vendas',
        module: 'produtos',
        action: 'consultar',
        params: { codigo_produto: Number(code) },
      }),
    })

    const json: any = await resp.json()
    if (resp.ok && json?.success) {
      const desc = json?.data?.descricao || ''
      console.log(JSON.stringify({ id: p.id, nome: p.nome, omie_codigo: code, descricao_omie: desc }, null, 2))
      return
    }
  }

  console.log('Nenhum omie_codigo válido encontrado (exceto o produto de teste ignorado).')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
