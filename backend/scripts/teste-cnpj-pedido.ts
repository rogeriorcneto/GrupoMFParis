import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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
  console.log('=== TESTE REAL: Pedido com CNPJ ===\n')

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: GERENTE_EMAIL,
    password: GERENTE_SENHA,
  })
  if (authErr || !authData.session) {
    console.error('❌ Login falhou:', authErr?.message)
    process.exit(1)
  }
  const token = authData.session.access_token
  console.log('✅ Login OK\n')

  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('id, nome, cargo')
    .eq('auth_id', authData.user.id)
    .single()
  if (!vendedor) {
    console.error('❌ Vendedor nao encontrado')
    process.exit(1)
  }
  console.log(`✅ Gerente: ${vendedor.nome} (id=${vendedor.id})\n`)

  // Usar cliente CNPJ existente com omie_codigo
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj, omie_codigo')
    .eq('id', 22693)
    .single()
  if (!cliente) {
    console.error('❌ Cliente CNPJ nao encontrado')
    process.exit(1)
  }
  console.log(`✅ Cliente CNPJ: ${cliente.razao_social} (id=${cliente.id}, cnpj=${cliente.cnpj}, omie_codigo=${cliente.omie_codigo || 'vazio'})\n`)

  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, preco, unidade, sku, omie_codigo, peso_kg')
    .eq('ativo', true)
    .not('omie_codigo', 'is', null)
    .limit(5)
  if (!produtos || produtos.length === 0) {
    console.error('❌ Nenhum produto com codigo Omie encontrado')
    process.exit(1)
  }
  const produto = produtos[0]
  console.log(`✅ Produto: ${produto.nome} (omie_codigo=${produto.omie_codigo}, peso_kg=${produto.peso_kg || 'null'})\n`)

  // Criar pedido
  const numeroPedido = `TESTE-CNPJ-${Date.now()}`
  const agora = new Date().toISOString()
  const precoTeste = 2.00
  const quantidadeTeste = 75
  const totalValor = precoTeste * quantidadeTeste

  const { data: pedidoRow, error: pedidoErr } = await supabase
    .from('pedidos')
    .insert({
      numero: numeroPedido,
      cliente_id: cliente.id,
      vendedor_id: vendedor.id,
      observacoes: 'Pedido de teste automatizado — CNPJ',
      status: 'enviado',
      total_valor: totalValor,
      data_criacao: agora,
      data_envio: agora,
      tipo: 'venda',
      forma_pagamento: '30/60/90 dias',
      tipo_frete: 'CIF',
    })
    .select('id')
    .single()
  if (pedidoErr || !pedidoRow) {
    console.error('❌ Erro ao criar pedido:', pedidoErr?.message)
    process.exit(1)
  }
  const pedidoId = pedidoRow.id

  await supabase.from('itens_pedido').insert({
    pedido_id: pedidoId,
    produto_id: produto.id,
    nome_produto: produto.nome,
    sku: produto.sku || '',
    unidade: produto.unidade || 'UN',
    preco: precoTeste,
    quantidade: quantidadeTeste,
  })
  console.log(`✅ Pedido criado: #${numeroPedido} (id=${pedidoId}, total=${totalValor})\n`)

  // Aprovar com Tabela A
  console.log('Aprovando pedido com Tabela A...')
  const aprovarRes = await authFetch(token, `/api/pedidos/${pedidoId}/aprovar`, {
    method: 'POST',
    body: JSON.stringify({ tabela: 'A' }),
  })
  console.log(`   Status: ${aprovarRes.status}`)
  console.log(`   Resposta:`, JSON.stringify(aprovarRes.body, null, 2))
  if (!aprovarRes.body?.success) {
    console.error('❌ Falha na aprovacao')
    process.exit(1)
  }
  console.log('✅ Pedido aprovado e enviado ao Omie em background\n')

  console.log('Aguardando processamento Omie (20s)...')
  await new Promise(r => setTimeout(r, 20000))

  const { data: pedidoFinal, error: finalErr } = await supabase
    .from('pedidos')
    .select('id, numero, status, omie_codigo, omie_numero, omie_status, omie_erro')
    .eq('id', pedidoId)
    .single()
  console.log('error:', finalErr?.message)
  console.log('   Pedido no CRM:', pedidoFinal)

  if (pedidoFinal?.omie_codigo) {
    const consultaRes = await authFetch(token, '/api/omie/call', {
      method: 'POST',
      body: JSON.stringify({
        group: 'vendas',
        module: 'pedidos',
        action: 'consultar',
        params: { codigo_pedido: parseInt(pedidoFinal.omie_codigo) },
      }),
    })
    console.log('\n=== DETALHES DO PEDIDO NO OMIE ===')
    console.log(`   Status consulta: ${consultaRes.status}`)
    if (consultaRes.body?.data?.pedido_venda_produto) {
      const p = consultaRes.body.data.pedido_venda_produto
      console.log(`   Cliente Omie: ${p.cabecalho?.codigo_cliente}`)
      console.log(`   Tabela preco (item): ${p.det?.[0]?.produto?.codigo_tabela_preco}`)
      console.log(`   Peso liquido: ${p.frete?.peso_liquido}`)
      console.log(`   Peso bruto: ${p.frete?.peso_bruto}`)
      console.log(`   Volumes: ${p.frete?.quantidade_volumes}`)
      console.log(`   Parcelas:`, JSON.stringify(p.lista_parcelas?.parcela?.map((x: any) => ({ n: x.numero_parcela, v: x.valor, d: x.data_vencimento })) || []))
    }
  }

  console.log('\n=== FIM DO TESTE ===')
  await supabase.auth.signOut()
  process.exit(0)
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
