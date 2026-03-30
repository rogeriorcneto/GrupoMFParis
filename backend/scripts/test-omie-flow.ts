/**
 * Script de teste: Fluxo completo pedido → aprovação → Omie
 * Rodar: npx tsx scripts/test-omie-flow.ts
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log('=== TESTE FLUXO COMPLETO: Pedido → Aprovação → Omie ===\n')

  // 1. Login como gerente
  console.log('1. Fazendo login como gerente...')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: GERENTE_EMAIL,
    password: GERENTE_SENHA,
  })
  if (authErr || !authData.session) {
    console.error('❌ Erro no login:', authErr?.message)
    process.exit(1)
  }
  const token = authData.session.access_token
  console.log('✅ Login OK — Token obtido\n')

  // 2. Buscar vendedor (gerente) para usar como vendedor_id
  console.log('2. Buscando dados do gerente...')
  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('id, nome, cargo')
    .eq('auth_id', authData.user.id)
    .single()
  if (!vendedor) {
    console.error('❌ Vendedor não encontrado')
    process.exit(1)
  }
  console.log(`✅ Gerente: ${vendedor.nome} (id=${vendedor.id}, cargo=${vendedor.cargo})\n`)

  // 3. Buscar um cliente existente
  console.log('3. Buscando cliente para teste...')
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj')
    .not('cnpj', 'is', null)
    .limit(5)
  if (!clientes || clientes.length === 0) {
    console.error('❌ Nenhum cliente com CNPJ encontrado')
    process.exit(1)
  }
  const cliente = clientes[0]
  console.log(`✅ Cliente: ${cliente.razao_social} (id=${cliente.id}, CNPJ=${cliente.cnpj})\n`)

  // 4. Buscar um produto existente
  console.log('4. Buscando produto para teste...')
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, preco, unidade, sku')
    .limit(5)
  if (!produtos || produtos.length === 0) {
    console.error('❌ Nenhum produto encontrado')
    process.exit(1)
  }
  const produto = produtos[0]
  console.log(`✅ Produto: ${produto.nome} (id=${produto.id}, preço=${produto.preco}, unidade=${produto.unidade})\n`)

  // 5. Criar pedido de teste (insert direto para evitar problemas de cast no RPC)
  console.log('5. Criando pedido de teste...')
  const numeroPedido = `TESTE-${Date.now()}`
  const agora = new Date().toISOString()
  const { data: pedidoRow, error: pedidoErr } = await supabase
    .from('pedidos')
    .insert({
      numero: numeroPedido,
      cliente_id: cliente.id,
      vendedor_id: vendedor.id,
      observacoes: 'Pedido de teste automatizado — fluxo Omie',
      status: 'enviado',
      total_valor: produto.preco * 2,
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

  // Inserir item do pedido
  const { error: itemErr } = await supabase.from('itens_pedido').insert({
    pedido_id: pedidoId,
    produto_id: produto.id,
    nome_produto: produto.nome,
    sku: produto.sku || '',
    unidade: produto.unidade || 'UN',
    preco: produto.preco,
    quantidade: 2,
  })
  if (itemErr) {
    console.error('⚠️ Erro ao inserir item:', itemErr.message)
  }
  console.log(`✅ Pedido criado: #${numeroPedido} (id=${pedidoId}, status=enviado)\n`)

  // 6. Aprovar pedido via API do backend (que automaticamente envia ao Omie)
  console.log('6. Aprovando pedido via backend (+ envio automático ao Omie)...')
  console.log(`   POST ${BACKEND_URL}/api/pedidos/${pedidoId}/aprovar`)
  try {
    const res = await fetch(`${BACKEND_URL}/api/pedidos/${pedidoId}/aprovar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    const body = await res.json()
    console.log(`   Status HTTP: ${res.status}`)
    console.log(`   Resposta:`, JSON.stringify(body, null, 2))

    if (body.success) {
      console.log('\n🎉 SUCESSO! Pedido aprovado e enviado ao Omie!')
      if (body.omie?.omie_codigo) {
        console.log(`   Código Omie: ${body.omie.omie_codigo}`)
      }
      if (body.omie?.error) {
        console.log(`   ⚠️ Omie retornou erro: ${body.omie.error}`)
      }
    } else {
      console.log('\n❌ Falha na aprovação:', body.error)
    }
  } catch (err: any) {
    console.error('❌ Erro na chamada HTTP:', err.message)
  }

  // 7. Verificar status final do pedido
  console.log('\n7. Verificando status final do pedido no banco...')
  const { data: pedidoFinal } = await supabase
    .from('pedidos')
    .select('id, numero, status, omie_codigo, omie_numero, omie_status, omie_erro, forma_pagamento, tipo_frete, tipo')
    .eq('id', pedidoId)
    .single()
  if (pedidoFinal) {
    console.log(`   Status: ${pedidoFinal.status}`)
    console.log(`   Omie Código: ${pedidoFinal.omie_codigo || '(vazio)'}`)
    console.log(`   Omie Número: ${pedidoFinal.omie_numero || '(vazio)'}`)
    console.log(`   Omie Status: ${pedidoFinal.omie_status || '(vazio)'}`)
  }

  console.log('\n=== FIM DO TESTE ===')
  await supabase.auth.signOut()
  process.exit(0)
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
