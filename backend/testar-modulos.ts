import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function testarModuloGeral() {
  console.log('🔍 TESTANDO MÓDULO GERAL.PRODUTOS (que funcionava antes)')
  
  try {
    // Login
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'rafael@mfparis.com.br',
      password: 'MFParis2024!',
    })
    
    const token = authData.session.access_token
    console.log('✅ Login OK')

    // Testar com geral.produtos usando ListarProdutos
    console.log('\n1️⃣ TESTE: geral.produtos / ListarProdutos')
    const response1 = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        group: 'geral',
        module: 'produtos',
        action: 'ListarProdutos',
        params: {
          pagina: 1,
          registros_por_pagina: 100
        }
      })
    })
    
    const result1 = await response1.json()
    console.log(`Status: ${response1.status}`)
    if (result1.success) {
      const produtos = result1.data?.produto_servico_cadastro || []
      console.log(`✅ Encontrados ${produtos.length} produtos`)
      if (produtos.length > 0) {
        console.log('\n📋 Primeiros 5 produtos:')
        produtos.slice(0, 5).forEach((p: any) => {
          console.log(`  • ${p.codigo_produto}: ${p.descricao}`)
        })
      }
    } else {
      console.log('❌ Erro:', result1.error)
    }

    // Testar com geral.produtos usando listar
    console.log('\n2️⃣ TESTE: geral.produtos / listar')
    const response2 = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        group: 'geral',
        module: 'produtos',
        action: 'listar',
        params: {
          pagina: 1,
          registros_por_pagina: 100
        }
      })
    })
    
    const result2 = await response2.json()
    console.log(`Status: ${response2.status}`)
    if (result2.success) {
      const produtos = result2.data?.produto_servico_cadastro || []
      console.log(`✅ Encontrados ${produtos.length} produtos`)
    } else {
      console.log('❌ Erro:', result2.error)
    }

    // Testar com vendas.produtos
    console.log('\n3️⃣ TESTE: vendas.produtos / listar')
    const response3 = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
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
          registros_por_pagina: 100
        }
      })
    })
    
    const result3 = await response3.json()
    console.log(`Status: ${response3.status}`)
    if (result3.success) {
      const produtos = result3.data?.produto_servico_cadastro || []
      console.log(`✅ Encontrados ${produtos.length} produtos`)
    } else {
      console.log('❌ Erro:', result3.error)
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

testarModuloGeral()
