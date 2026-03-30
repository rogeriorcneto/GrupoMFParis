import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function callOmie(token: string, payload: any) {
  const res = await fetch(`${BACKEND_URL}/api/omie/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const body: any = await res.json()
  return { status: res.status, body }
}

function extractList(data: any): any[] {
  if (!data) return []
  const keys = ['produto_servico_cadastro', 'produtos', 'produto', 'lista_produtos', 'itens']
  for (const k of keys) {
    if (Array.isArray(data[k])) return data[k]
  }
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) return v as any[]
  }
  return []
}

async function main() {
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: 'rafael@mfparis.com.br',
    password: 'MFParis2024!',
  })
  if (error || !authData.session) throw new Error(error?.message || 'login sem sessão')
  const token = authData.session.access_token

  const tests = [
    {
      name: 'vendas.produtos.listar',
      payload: { group: 'vendas', module: 'produtos', action: 'listar', params: { pagina: 1, registros_por_pagina: 200 } },
    },
    {
      name: 'compras.produtos.listar',
      payload: { group: 'compras', module: 'produtos', action: 'listar', params: { pagina: 1, registros_por_pagina: 200 } },
    },
    {
      name: 'vendas.produtos.consultar(codigo_produto=1210001)',
      payload: { group: 'vendas', module: 'produtos', action: 'consultar', params: { codigo_produto: 1210001 } },
    },
    {
      name: 'vendas.produtos.consultar(codigo=1210001)',
      payload: { group: 'vendas', module: 'produtos', action: 'consultar', params: { codigo: '1210001' } },
    },
  ]

  for (const t of tests) {
    const r = await callOmie(token, t.payload)
    console.log(`\n=== ${t.name} ===`)
    console.log(`HTTP ${r.status} | success=${Boolean(r.body?.success)}`)
    if (!r.body?.success) {
      console.log(`error=${r.body?.error || 'sem erro estruturado'}`)
      continue
    }

    const list = extractList(r.body.data)
    console.log(`items=${list.length}`)
    if (list.length > 0) {
      const first = list[0]
      console.log(`first.codigo_produto=${first?.codigo_produto ?? ''} | first.codigo=${first?.codigo ?? ''} | first.descricao=${first?.descricao ?? ''}`)
    } else if (r.body?.data) {
      console.log(JSON.stringify(r.body.data, null, 2))
    }
  }

  await supabase.auth.signOut()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
