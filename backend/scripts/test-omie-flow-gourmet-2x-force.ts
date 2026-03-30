import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'
const TARGET_PRODUCT_NAME = 'OKEY LAC GOURMET 25KG'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log('=== TESTE FORÇADO 2x COM OKEY LAC GOURMET 25KG (1210001) ===')

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: GERENTE_EMAIL,
    password: GERENTE_SENHA,
  })

  if (authErr || !authData.session) {
    console.error('❌ Erro no login:', authErr?.message)
    process.exit(1)
  }

  const token = authData.session.access_token

  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('id, nome')
    .eq('auth_id', authData.user.id)
    .single()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj')
    .not('cnpj', 'is', null)
    .limit(1)

  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, preco, unidade, sku, omie_codigo')
    .ilike('nome', '%OKEY LAC GOURMET 25KG%')
    .gt('preco', 0)
    .order('id', { ascending: true })
    .limit(1)

  if (!vendedor || !clientes?.length || !produtos?.length) {
    console.error('❌ Dados necessários não encontrados (vendedor/cliente/produto)')
    process.exit(1)
  }

  const cliente = clientes[0]
  const produto = produtos[0]

  console.log(`✅ Produto usado: ${produto.nome} (id=${produto.id}, omie_codigo=${produto.omie_codigo})`)

  for (let i = 1; i <= 2; i++) {
    const numeroPedido = `TESTE-GOURMET-FORCE-${Date.now()}-${i}`
    const agora = new Date().toISOString()

    const { data: pedidoRow, error: pedidoErr } = await supabase
      .from('pedidos')
      .insert({
        numero: numeroPedido,
        cliente_id: cliente.id,
        vendedor_id: vendedor.id,
        observacoes: `Tentativa ${i}/2 com ${TARGET_PRODUCT_NAME}`,
        status: 'enviado',
        total_valor: Number(produto.preco) * 2,
        data_criacao: agora,
        data_envio: agora,
        tipo: 'venda',
        forma_pagamento: '30 dias',
        tipo_frete: 'CIF',
      })
      .select('id')
      .single()

    if (pedidoErr || !pedidoRow) {
      console.log(`\n[${i}/2] ❌ Erro ao criar pedido: ${pedidoErr?.message}`)
      continue
    }

    const pedidoId = pedidoRow.id

    const { error: itemErr } = await supabase.from('itens_pedido').insert({
      pedido_id: pedidoId,
      produto_id: produto.id,
      nome_produto: produto.nome,
      sku: produto.sku || '',
      unidade: produto.unidade || 'UN',
      preco: Number(produto.preco),
      quantidade: 2,
    })

    if (itemErr) {
      console.log(`\n[${i}/2] ❌ Erro ao inserir item: ${itemErr.message}`)
      continue
    }

    const res = await fetch(`${BACKEND_URL}/api/pedidos/${pedidoId}/aprovar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    const body: any = await res.json()

    const { data: pedidoFinal } = await supabase
      .from('pedidos')
      .select('id, status, omie_codigo, omie_numero, omie_status, omie_erro')
      .eq('id', pedidoId)
      .single()

    console.log(`\n[${i}/2] Pedido ${pedidoId}`)
    console.log(`HTTP ${res.status}`)
    console.log(JSON.stringify(body, null, 2))
    console.log('Final banco:', JSON.stringify(pedidoFinal, null, 2))
  }

  await supabase.auth.signOut()
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
