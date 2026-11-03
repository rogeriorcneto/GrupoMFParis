/**
 * Teste real: cliente CPF + cadastro automatico Omie + peso + tabela B
 * Rodar: npx tsx scripts/teste-cpf-peso-tabela.ts
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'
const CPF_TESTE = '11682464660'

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
  console.log('=== TESTE REAL: CPF + cadastro automatico + peso + tabela B ===\n')

  // 1. Login
  console.log('1. Login como gerente...')
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

  // Cliente autenticado para queries no Supabase (RLS exige usuario logado)
  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  // 2. Buscar gerente
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

  // 3. Criar cliente de teste com CPF
  console.log('2. Criando cliente de teste com CPF...')
  const nomeCliente = `Teste Pessoa Fisica ${Date.now()}`
  const { data: clienteRow, error: clienteErr } = await supabase
    .from('clientes')
    .insert({
      razao_social: nomeCliente,
      cpf: CPF_TESTE,
      cnpj: '',
      contato_nome: 'Teste Devin',
      contato_email: `${CPF_TESTE}@semcontato.grupoparis.com.br`,
      contato_telefone: '(11) 99999-9999',
      endereco: 'Rua Teste, 123, Centro, Sao Paulo, SP, CEP 01001000',
      endereco_rua: 'Rua Teste',
      endereco_numero: '123',
      endereco_bairro: 'Centro',
      endereco_cidade: 'Sao Paulo',
      endereco_estado: 'SP',
      endereco_cep: '01001-000',
      etapa: 'prospecção',
      vendedor_id: vendedor.id,
      status_cliente: 'ativo',
    })
    .select('id, razao_social, cpf, omie_codigo')
    .single()

  if (clienteErr || !clienteRow) {
    console.error('❌ Erro ao criar cliente:', clienteErr?.message)
    process.exit(1)
  }
  const clienteId = clienteRow.id
  console.log(`✅ Cliente criado: id=${clienteId}, nome=${clienteRow.razao_social}, cpf=${clienteRow.cpf}, omie_codigo=${clienteRow.omie_codigo || '(vazio)'}\n`)

  // 4. Sincronizar cliente com Omie (simula o que o form faz automaticamente)
  console.log('3. Enviando cliente ao Omie (cadastro automatico)...')
  const syncRes = await authFetch(token, `/api/omie/sync/cliente/${clienteId}`, { method: 'POST' })
  console.log(`   Status: ${syncRes.status}`)
  console.log(`   Resposta:`, JSON.stringify(syncRes.body, null, 2))
  if (!syncRes.body?.success) {
    console.error('❌ Falha no cadastro automatico do cliente no Omie')
    process.exit(1)
  }
  console.log('✅ Cliente sincronizado com Omie\n')

  // Verificar omie_codigo salvo
  const { data: clienteAtualizado } = await supabase
    .from('clientes')
    .select('id, omie_codigo')
    .eq('id', clienteId)
    .single()
  console.log(`   omie_codigo no CRM apos sync: ${clienteAtualizado?.omie_codigo || '(vazio)'}\n`)

  // 5. Mover cliente para negociacao e proposta (simula funil)
  console.log('4. Movendo cliente pelo funil (prospecção -> negociacao -> proposta)...')
  await supabase.from('clientes').update({ etapa: 'negociacao', data_entrada_etapa: new Date().toISOString() }).eq('id', clienteId)
  await supabase.from('clientes').update({ etapa: 'proposta', data_entrada_etapa: new Date().toISOString(), valor_proposta: 1500.00, data_proposta: new Date().toISOString().split('T')[0] }).eq('id', clienteId)
  console.log('✅ Cliente em proposta\n')

  // 6. Buscar produto com codigo Omie
  console.log('5. Buscando produto com codigo Omie...')
  const { data: produtos } = await authed
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
  console.log(`✅ Produto: ${produto.nome} (omie_codigo=${produto.omie_codigo}, preco=${produto.preco}, unidade=${produto.unidade}, peso_kg=${produto.peso_kg || 'null'})\n`)

  // 7. Criar pedido de teste
  console.log('6. Criando pedido de teste...')
  const numeroPedido = `TESTE-CPF-${Date.now()}`
  const agora = new Date().toISOString()
  const precoTeste = 2.00
  const quantidadeTeste = 75
  const totalValor = precoTeste * quantidadeTeste
  const { data: pedidoRow, error: pedidoErr } = await authed
    .from('pedidos')
    .insert({
      numero: numeroPedido,
      cliente_id: clienteId,
      vendedor_id: vendedor.id,
      observacoes: 'Pedido de teste automatizado — CPF, peso e Tabela B',
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

  // Inserir itens
  const { error: itemErr } = await authed.from('itens_pedido').insert({
    pedido_id: pedidoId,
    produto_id: produto.id,
    nome_produto: produto.nome,
    sku: produto.sku || '',
    unidade: produto.unidade || 'UN',
    preco: precoTeste,
    quantidade: quantidadeTeste,
  })
  if (itemErr) {
    console.error('⚠️ Erro ao inserir item:', itemErr.message)
  }
  console.log(`✅ Pedido criado: #${numeroPedido} (id=${pedidoId}, total=${totalValor})\n`)

  // 8. Aprovar pedido com Tabela B
  console.log('7. Aprovando pedido com Tabela B...')
  const aprovarRes = await authFetch(token, `/api/pedidos/${pedidoId}/aprovar`, {
    method: 'POST',
    body: JSON.stringify({ tabela: 'B' }),
  })
  console.log(`   Status: ${aprovarRes.status}`)
  console.log(`   Resposta:`, JSON.stringify(aprovarRes.body, null, 2))
  if (!aprovarRes.body?.success) {
    console.error('❌ Falha na aprovacao')
    process.exit(1)
  }
  console.log('✅ Pedido aprovado e enviado ao Omie em background\n')

  // 9. Aguardar e verificar resultado no Omie
  console.log('8. Aguardando processamento Omie (20s)...')
  await new Promise(r => setTimeout(r, 20000))

  const { data: pedidoFinal, error: pedidoFinalErr } = await supabase
    .from('pedidos')
    .select('id, numero, status, omie_codigo, omie_numero, omie_status, omie_erro')
    .eq('id', pedidoId)
    .single()
  if (pedidoFinalErr) console.log('   Erro ao buscar pedido final:', pedidoFinalErr.message)
  console.log('   Pedido no CRM:', pedidoFinal)

  if (!pedidoFinal?.omie_codigo && !pedidoFinal?.omie_numero) {
    console.error('❌ Pedido ainda nao tem codigo Omie. Verifique omie_erro:', pedidoFinal?.omie_erro)
    // Mesmo com falha, continuamos para verificar o cliente
  }

  // 10. Consultar pedido no Omie diretamente
  if (pedidoFinal?.omie_codigo) {
    console.log('\n9. Consultando detalhes do pedido no Omie...')
    const consultaRes = await authFetch(token, '/api/omie/call', {
      method: 'POST',
      body: JSON.stringify({
        group: 'vendas',
        module: 'pedidos',
        action: 'consultar',
        params: { codigo_pedido: parseInt(pedidoFinal.omie_codigo) },
      }),
    })
    console.log(`   Status: ${consultaRes.status}`)
    console.log(`   Resposta:`, JSON.stringify(consultaRes.body, null, 2))

    if (consultaRes.body?.data?.pedido_venda_produto) {
      const pedidoOmie = consultaRes.body.data.pedido_venda_produto
      console.log('\n=== VERIFICACAO DO PEDIDO NO OMIE ===')
      console.log(`   Cliente: ${pedidoOmie.cabecalho?.codigo_cliente}`)
      console.log(`   Tabela preco: ${pedidoOmie.informacoes_adicionais?.codigo_tabela_preco}`)
      console.log(`   Peso liquido: ${pedidoOmie.peso_liquido}`)
      console.log(`   Peso bruto: ${pedidoOmie.peso_bruto}`)
      console.log(`   Volumes: ${pedidoOmie.quantidade_volumes}`)
      console.log(`   Parcelas: ${JSON.stringify(pedidoOmie.lista_parcelas?.parcela || pedidoOmie.cabecalho?.codigo_parcela)}`)
      console.log(`   Frete: ${pedidoOmie.frete?.tipo_frete}`)
    }
  }

  // 11. Verificar cliente no Omie
  console.log('\n10. Consultando cliente no Omie...')
  const clienteOmieRes = await authFetch(token, '/api/omie/call', {
    method: 'POST',
    body: JSON.stringify({
      group: 'geral',
      module: 'clientes',
      action: 'listar',
      params: { pagina: 1, registros_por_pagina: 5, clientesFiltro: { cnpj_cpf: CPF_TESTE } },
    }),
  })
  console.log(`   Status: ${clienteOmieRes.status}`)
  console.log(`   Clientes encontrados:`, JSON.stringify(clienteOmieRes.body?.data?.clientes_cadastro?.map((c: any) => ({ codigo: c.codigo_cliente_omie, nome: c.razao_social, cnpj_cpf: c.cnpj_cpf })) || [], null, 2))

  console.log('\n=== FIM DO TESTE ===')
  await supabase.auth.signOut()
  process.exit(0)
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
