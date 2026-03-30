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
    console.error('Login falhou:', authErr?.message)
    process.exit(1)
  }

  const token = authData.session.access_token

  const payloads = [
    {
      group: 'vendas',
      module: 'produtos',
      action: 'listar',
      params: { pagina: 1, registros_por_pagina: 200, filtrar_apenas_descricao: 'gourmet' },
    },
    {
      group: 'vendas',
      module: 'produtos',
      action: 'listar',
      params: { pagina: 1, registros_por_pagina: 200 },
    },
  ]

  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i]
    const res = await fetch(`${BACKEND_URL}/api/omie/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(p),
    })
    const body: any = await res.json()
    console.log(`\n=== Consulta ${i + 1} | HTTP ${res.status} ===`)
    if (!body?.success) {
      console.log(JSON.stringify(body, null, 2))
      continue
    }

    const produtos = body?.data?.produto_servico_cadastro || []
    const filtrados = produtos.filter((x: any) => {
      const d = String(x?.descricao || '').toLowerCase()
      const c = String(x?.codigo || '').toLowerCase()
      return d.includes('gourmet') || c.includes('1210001')
    })

    console.log(`total retornado: ${produtos.length}`)
    console.log(`filtrados gourmet/1210001: ${filtrados.length}`)
    for (const f of filtrados.slice(0, 20)) {
      console.log(JSON.stringify({
        codigo_produto: f.codigo_produto,
        codigo: f.codigo,
        descricao: f.descricao,
        codigo_integracao: f.codigo_produto_integracao,
      }))
    }
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
