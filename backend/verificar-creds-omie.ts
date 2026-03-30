import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function verificarCredenciaisOmie() {
  console.log('🔍 VERIFICANDO CREDENCIAIS OMIE NO BACKEND')
  
  try {
    // Login
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'rafael@mfparis.com.br',
      password: 'MFParis2024!',
    })
    
    const token = authData.session.access_token
    console.log('✅ Login OK')

    // Verificar status das credenciais
    const response = await fetch('https://grupomfparis-production.up.railway.app/api/omie/status', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    
    const result = await response.json()
    console.log(`Status: ${response.status}`)
    console.log('Resposta:', JSON.stringify(result, null, 2))
    
    // Se tiver credenciais, tentar listar produtos com parâmetros diferentes
    if (result.success) {
      console.log('\n🔍 TENTANDO LISTAR PRODUTOS COM OUTROS PARÂMETROS...')
      
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
            registros_por_pagina: 100
          }
        })
      })
      
      const result2 = await response2.json()
      console.log(`\nStatus: ${response2.status}`)
      
      if (result2.success) {
        const produtos = result2.data?.produto_servico_cadastro || []
        console.log(`📦 Encontrados ${produtos.length} produtos no Omie`)
        
        if (produtos.length > 0) {
          console.log('\n📋 Primeiros 5 produtos:')
          produtos.slice(0, 5).forEach((p: any) => {
            console.log(`  • ${p.codigo_produto}: ${p.descricao}`)
          })
        }
      } else {
        console.log('❌ Erro ao listar produtos:', result2.error)
      }
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

verificarCredenciaisOmie()
