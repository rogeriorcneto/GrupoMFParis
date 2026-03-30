import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log('=== TESTE FLUXO COMPLETO (PRODUTO NÃO-TESTE) ===\n')

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: GERENTE_EMAIL,
    password: GERENTE_SENHA,
  })

  if (authErr || !authData.session) {
    console.error('❌ Erro no login:', authErr?.message)
    process.exit(1)
  }

  const token = authData.session.access_token
  console.log('✅ Login OK\n')

  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('id, nome')
    .eq('auth_id', authData.user.id)
    .single()

  if (!vendedor) {
    console.error('❌ Vendedor não encontrado')
    process.exit(1)
  }

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj')
    .not('cnpj', 'is', null)
    .limit(1)

  if (!clientes || clientes.length === 0) {
    console.error('❌ Nenhum cliente com CNPJ encontrado')
    process.exit(1)
  }

  const cliente = clientes[0]

  const TEST_PRODUCT_CODE = '9624149052'
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, preco, unidade, sku, omie_codigo')
    .not('omie_codigo', 'is', null)
    .neq('omie_codigo', TEST_PRODUCT_CODE)
    .limit(30)

  if (!produtos || produtos.length === 0) {
    console.error('❌ Nenhum produto não-teste com omie_codigo encontrado no CRM')
    process.exit(1)
  }

  let produtoEscolhido: any = null

  for (const p of produtos) {
    const consultRes = await fetch(`${BACKEND_URL}/api/omie/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        group: 'vendas',
        module: 'produtos',
        action: 'consultar',
        params: {
          codigo_produto: Number(p.omie_codigo),
        },
      }),
    })

    const consultBody: any = await consultRes.json()
    if (consultRes.ok && consultBody?.success) {
      produtoEscolhido = p
      break
    }
  }

  if (!produtoEscolhido) {
    console.error('❌ Nenhum produto não-teste válido no Omie foi encontrado')
    process.exit(1)
  }

  console.log(`✅ Produto NÃO-TESTE escolhido: ${produtoEscolhido.nome} (id=${produtoEscolhido.id}, omie_codigo=${produtoEscolhido.omie_codigo})\n`)

  const numeroPedido = `TESTE-NT-${Date.now()}`
  const agora = new Date().toISOString()

  const { data: pedidoRow, error: pedidoErr } = await supabase
    .from('pedidos')
    .insert({
      numero: numeroPedido,
      cliente_id: cliente.id,
      vendedor_id: vendedor.id,
      observacoes: 'Pedido de teste com produto não-teste Omie',
      status: 'enviado',
      total_valor: Number(produtoEscolhido.preco) * 2,
      data_criacao: agora,
      data_envio: agora,
      tipo: 'venda',
      forma_pagamento: '30 dias',
      tipo_frete: 'CIF',
    })
    .select('id')
    .single()

  if (pedidoErr || !pedidoRow) {
    console.error('❌ Erro ao criar pedido:', pedidoErr?.message)
    process.exit(1)
  }

  const pedidoId = pedidoRow.id

  const { error: itemErr } = await supabase.from('itens_pedido').insert({
    pedido_id: pedidoId,
    produto_id: produtoEscolhido.id,
    nome_produto: produtoEscolhido.nome,
    sku: produtoEscolhido.sku || '',
    unidade: produtoEscolhido.unidade || 'UN',
    preco: produtoEscolhido.preco,
    quantidade: 2,
  })

  if (itemErr) {
    console.error('❌ Erro ao inserir item:', itemErr.message)
    process.exit(1)
  }

  const res = await fetch(`${BACKEND_URL}/api/pedidos/${pedidoId}/aprovar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  const body: any = await res.json()
  console.log(`HTTP ${res.status}`)
  console.log(JSON.stringify(body, null, 2))

  const { data: pedidoFinal } = await supabase
    .from('pedidos')
    .select('id, status, omie_codigo, omie_numero, omie_status, omie_erro')
    .eq('id', pedidoId)
    .single()

  console.log('\n=== RESULTADO FINAL ===')
  console.log(`Pedido ID: ${pedidoId}`)
  console.log(`Status: ${pedidoFinal?.status || '(vazio)'}`)
  console.log(`Omie Código: ${pedidoFinal?.omie_codigo || '(vazio)'}`)
  console.log(`Omie Número: ${pedidoFinal?.omie_numero || '(vazio)'}`)
  console.log(`Omie Status: ${pedidoFinal?.omie_status || '(vazio)'}`)
  if (pedidoFinal?.omie_erro) console.log(`Omie Erro: ${pedidoFinal.omie_erro}`)

  await supabase.auth.signOut()
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
