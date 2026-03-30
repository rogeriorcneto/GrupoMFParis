import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function testarComParametrosDiferentes() {
  console.log('🔍 TESTANDO COM PARÂMETROS DIFERENTES')
  
  try {
    // Login
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'rafael@mfparis.com.br',
      password: 'MFParis2024!',
    })
    
    const token = authData.session.access_token
    console.log('✅ Login OK')

    // Teste 1: Sem parâmetros de filtro
    console.log('\n1️⃣ TESTE: Sem filtros')
    const response1 = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
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
    
    const result1 = await response1.json()
    console.log(`Status: ${response1.status}`)
    if (result1.success) {
      const produtos = result1.data?.produto_servico_cadastro || []
      const total = result1.data?.total_de_registros || 0
      console.log(`✅ Encontrados ${produtos.length} produtos (total: ${total})`)
      
      if (produtos.length > 0) {
        console.log('\n📋 Produtos:')
        produtos.slice(0, 10).forEach((p: any) => {
          console.log(`  • ${p.codigo_produto}: ${p.descricao}`)
        })
      }
    } else {
      console.log('❌ Erro:', result1.error)
    }

    // Teste 2: Tentar página 2
    console.log('\n2️⃣ TESTE: Página 2')
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
          pagina: 2,
          registros_por_pagina: 50
        }
      })
    })
    
    const result2 = await response2.json()
    if (result2.success) {
      const produtos = result2.data?.produto_servico_cadastro || []
      console.log(`✅ Página 2: ${produtos.length} produtos`)
    }

    // Teste 3: Tentar buscar um produto específico pelo código
    console.log('\n3️⃣ TESTE: Consultar produto específico (1210001)')
    const response3 = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        group: 'vendas',
        module: 'produtos',
        action: 'consultar',
        params: {
          codigo_produto: 1210001
        }
      })
    })
    
    const result3 = await response3.json()
    console.log(`Status: ${response3.status}`)
    if (result3.success) {
      console.log('✅ Produto encontrado:', result3.data?.descricao)
    } else {
      console.log('❌ Erro:', result3.error)
    }

    // Teste 4: Tentar com apenas_importado_api = N
    console.log('\n4️⃣ TESTE: Com apenas_importado_api = N')
    const response4 = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
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
          registros_por_pagina: 100,
          apenas_importado_api: 'N'
        }
      })
    })
    
    const result4 = await response4.json()
    if (result4.success) {
      const produtos = result4.data?.produto_servico_cadastro || []
      console.log(`✅ Com apenas_importado_api: ${produtos.length} produtos`)
    } else {
      console.log('❌ Erro:', result4.error)
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

testarComParametrosDiferentes()
