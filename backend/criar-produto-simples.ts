import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function criarProdutoSimples() {
  console.log('🧪 CRIANDO PRODUTO SIMPLES NO OMIE')
  
  try {
    // Login
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'rafael@mfparis.com.br',
      password: 'MFParis2024!',
    })
    
    const token = authData.session.access_token
    console.log('✅ Login OK')

    // Criar produto simples
    const response = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        group: 'vendas',
        module: 'produtos',
        action: 'incluir',
        params: {
          codigo: 'CRM-TESTE-001',
          codigo_produto_integracao: 'CRM-TESTE-001',
          descricao: 'PRODUTO TESTE CRM',
          unidade: 'UN',
          ncm: '21069090'
        }
      })
    })
    
    const result = await response.json()
    console.log(`Status: ${response.status}`)
    console.log('Resposta:', JSON.stringify(result, null, 2))
    
    if (result.success) {
      console.log('✅ Produto criado com sucesso!')
      console.log(`Código: ${result.data.codigo_produto}`)
      
      // Agora testar o fluxo do pedido com este produto
      console.log('\n🚀 TESTANDO FLUXO DO PEDIDO COM O PRODUTO CRIADO...')
      
      // Atualizar um produto no CRM com este código
      const { data: produtosCRM } = await supabase
        .from('produtos')
        .select('id, nome')
        .limit(1)
      
      if (produtosCRM && produtosCRM.length > 0) {
        const produtoCRM = produtosCRM[0]
        console.log(`Atualizando produto CRM: ${produtoCRM.nome}`)
        
        await supabase
          .from('produtos')
          .update({ omie_codigo: String(result.data.codigo_produto) })
          .eq('id', produtoCRM.id)
        
        console.log(`✅ Produto CRM atualizado com código Omie: ${result.data.codigo_produto}`)
        
        // Criar pedido de teste
        const { data: pedido } = await supabase
          .from('pedidos')
          .insert({
            numero: `TESTE-OMIE-${Date.now()}`,
            cliente_id: 11649, // PRIME DISTRIBUIDORA LTDA
            vendedor_id: 1, // Rafael
            observacoes: 'Pedido teste com produto Omie real',
            status: 'enviado',
            total_valor: 100.00,
            data_criacao: new Date().toISOString(),
            tipo: 'venda'
          })
          .select('id')
          .single()
        
        if (pedido) {
          // Inserir item
          await supabase
            .from('itens_pedido')
            .insert({
              pedido_id: pedido.id,
              produto_id: produtoCRM.id,
              nome_produto: produtoCRM.nome,
              sku: '',
              unidade: 'UN',
              preco: 100.00,
              quantidade: 1
            })
          
          console.log(`✅ Pedido criado: ID ${pedido.id}`)
          
          // Aprovar pedido
          const response2 = await fetch(`https://grupomfparis-production.up.railway.app/api/pedidos/${pedido.id}/aprovar`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            }
          })
          
          const result2 = await response2.json()
          console.log(`\nStatus aprovação: ${response2.status}`)
          console.log('Resposta:', JSON.stringify(result2, null, 2))
        }
      }
    } else {
      console.log('❌ Erro ao criar produto:', result.error)
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

criarProdutoSimples()
