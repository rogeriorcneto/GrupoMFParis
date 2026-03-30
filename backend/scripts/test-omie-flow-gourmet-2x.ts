import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'
const TARGET_OMIE_CODE = '1210001'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function aprovarPedido(token: string, pedidoId: number) {
  const res = await fetch(`${BACKEND_URL}/api/pedidos/${pedidoId}/aprovar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const body: any = await res.json()
  return { status: res.status, body }
}

async function validarProdutoNoOmie(token: string, codigoOmie: string) {
  const res = await fetch(`${BACKEND_URL}/api/omie/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      group: 'vendas',
      module: 'produtos',
      action: 'consultar',
      params: { codigo_produto: Number(codigoOmie) },
    }),
  })

  const body: any = await res.json()
  return { status: res.status, body }
}

async function main() {
  console.log('=== TESTE 2x COM PRODUTO ESPECÍFICO OMIE 1210001 ===\n')

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: GERENTE_EMAIL,
    password: GERENTE_SENHA,
  })
  if (authErr || !authData.session) {
    console.error('❌ Login falhou:', authErr?.message)
    process.exit(1)
  }
  const token = authData.session.access_token
  console.log('✅ Login OK')

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

  const { data: produtosAlvo, error: produtosErr } = await supabase
    .from('produtos')
    .select('id, nome, preco, unidade, sku, omie_codigo')
    .eq('omie_codigo', TARGET_OMIE_CODE)
    .order('id', { ascending: true })
    .limit(1)

  if (produtosErr || !produtosAlvo || produtosAlvo.length === 0) {
    console.error(`❌ Produto com omie_codigo ${TARGET_OMIE_CODE} não encontrado no CRM`)
    process.exit(1)
  }

  const produto = produtosAlvo[0]

  console.log(`✅ Produto alvo no CRM: ${produto.nome} (id=${produto.id}, omie_codigo=${produto.omie_codigo})`)

  const valid = await validarProdutoNoOmie(token, TARGET_OMIE_CODE)
  console.log(`✅ Validação no Omie (consultar ${TARGET_OMIE_CODE}): HTTP ${valid.status}`)
  if (!valid.body?.success) {
    console.log('❌ Omie não confirmou o produto alvo:')
    console.log(JSON.stringify(valid.body, null, 2))
    process.exit(1)
  }

  const resultados: Array<any> = []

  for (let i = 1; i <= 2; i++) {
    const numeroPedido = `TESTE-GOURMET-${Date.now()}-${i}`
    const agora = new Date().toISOString()

    const { data: pedidoRow, error: pedidoErr } = await supabase
      .from('pedidos')
      .insert({
        numero: numeroPedido,
        cliente_id: cliente.id,
        vendedor_id: vendedor.id,
        observacoes: `Teste ${i}/2 com OKEY LAC GOURMET 25KG (1210001)`,
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
      console.log(`❌ [${i}/2] erro ao criar pedido: ${pedidoErr?.message}`)
      continue
    }

    const pedidoId = pedidoRow.id

    const { error: itemErr } = await supabase
      .from('itens_pedido')
      .insert({
        pedido_id: pedidoId,
        produto_id: produto.id,
        nome_produto: produto.nome,
        sku: produto.sku || '',
        unidade: produto.unidade || 'UN',
        preco: Number(produto.preco),
        quantidade: 2,
      })

    if (itemErr) {
      console.log(`❌ [${i}/2] erro ao inserir item no pedido ${pedidoId}: ${itemErr.message}`)
      continue
    }

    const aprovacao = await aprovarPedido(token, pedidoId)

    const { data: pedidoFinal } = await supabase
      .from('pedidos')
      .select('id, numero, status, omie_codigo, omie_numero, omie_status, omie_erro')
      .eq('id', pedidoId)
      .single()

    resultados.push({
      tentativa: i,
      pedido_id: pedidoId,
      http_status: aprovacao.status,
      aprovacao: aprovacao.body,
      final: pedidoFinal,
    })
  }

  console.log('\n=== RESULTADO CONSOLIDADO ===')
  for (const r of resultados) {
    console.log(`\n[${r.tentativa}/2] Pedido ${r.pedido_id}`)
    console.log(`HTTP: ${r.http_status}`)
    console.log(`Aprovação success: ${Boolean(r.aprovacao?.success)}`)
    console.log(`Omie success: ${Boolean(r.aprovacao?.omie?.success)}`)
    console.log(`Omie retorno código: ${r.aprovacao?.omie?.omie_codigo || '(vazio)'}`)
    console.log(`Status final: ${r.final?.status || '(vazio)'}`)
    console.log(`Omie código final: ${r.final?.omie_codigo || '(vazio)'}`)
    console.log(`Omie número final: ${r.final?.omie_numero || '(vazio)'}`)
    console.log(`Omie status final: ${r.final?.omie_status || '(vazio)'}`)
    if (r.final?.omie_erro) console.log(`Omie erro final: ${r.final.omie_erro}`)
  }

  await supabase.auth.signOut()
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
