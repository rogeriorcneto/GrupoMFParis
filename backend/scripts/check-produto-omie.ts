import { createClient } from '@supabase/supabase-js'

const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'

async function main() {
  const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email: GERENTE_EMAIL, password: GERENTE_SENHA })
  if (authErr || !authData.session) { console.error('login err', authErr?.message); process.exit(1) }
  const token = authData.session.access_token

  const codigo = process.argv[2] || '2071047807'
  const res = await fetch(`${BACKEND_URL}/api/omie/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      group: 'vendas', module: 'produtos', action: 'consultar',
      params: { codigo_produto: Number(codigo) },
    }),
  })
  const body = await res.json()
  console.log('Status:', res.status)
  const p = body?.data || body
  console.log(JSON.stringify({
    codigo: p.codigo_produto, descricao: p.descricao, unidade: p.unidade,
    peso_liq: p.peso_liq, peso_bruto: p.peso_bruto,
    altura: p.altura, largura: p.largura, profundidade: p.profundidade,
  }, null, 2))
}
main()
