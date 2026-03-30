import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function criarProdutoTeste() {
  console.log('🧪 CRIANDO PRODUTO DE TESTE NO OMIE')
  
  try {
    // Login
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'rafael@mfparis.com.br',
      password: 'MFParis2024!',
    })
    
    const token = authData.session.access_token
    console.log('✅ Login OK')

    // Criar produto de teste
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
          codigo_produto_integracao: 'CRM-TESTE-001',
          descricao: 'PRODUTO TESTE CRM',
          preco_venda: 100.00,
          unidade: 'UN',
          ncm: '21069090',
          cfop_interno: '5101',
          tipo: 'P',
          situacao: 'A'
        }
      })
    })
    
    const result = await response.json()
    console.log(`Status: ${response.status}`)
    console.log('Resposta:', JSON.stringify(result, null, 2))
    
    if (result.success) {
      console.log('✅ Produto criado com sucesso!')
      console.log(`Código: ${result.data.codigo_produto}`)
      
      // Verificar se aparece na lista
      console.log('\n🔍 Verificando se aparece na lista...')
      
      const response2 = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          group: 'vendas',
          module: 'produtos',
          action: 'listar',
          params: {
            pagina: 1,
            registros_por_pagina: 50
          }
        })
      })
      
      const result2 = await response2.json()
      console.log(`\nStatus: ${response2.status}`)
      
      if (result2.success) {
        const produtos = result2.data?.produto_servico_cadastro || []
        console.log(`📦 Encontrados ${produtos.length} produtos no Omie`)
        
        if (produtos.length > 0) {
          console.log('\n📋 Produtos encontrados:')
          produtos.forEach((p: any) => {
            console.log(`  • ${p.codigo_produto}: ${p.descricao}`)
          })
        }
      }
    } else {
      console.log('❌ Erro ao criar produto:', result.error)
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

criarProdutoTeste()
