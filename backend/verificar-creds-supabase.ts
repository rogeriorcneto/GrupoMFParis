import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function verificarCredenciaisSupabase() {
  console.log('🔍 VERIFICANDO CREDENCIAIS NO SUPABASE')
  
  try {
    // Verificar credenciais na tabela bot_config
    const { data, error } = await supabase
      .from('bot_config')
      .select('omie_app_key, omie_app_secret')
      .eq('id', 1)
      .single()
    
    if (error) {
      console.log('❌ Erro ao buscar credenciais:', error.message)
      return
    }
    
    if (!data) {
      console.log('❌ Nenhuma configuração encontrada no bot_config')
      return
    }
    
    console.log('📋 Credenciais encontradas:')
    console.log(`  App Key: ${data.omie_app_key ? data.omie_app_key.substring(0, 10) + '...' : 'VAZIO'}`)
    console.log(`  App Secret: ${data.omie_app_secret ? data.omie_app_secret.substring(0, 10) + '...' : 'VAZIO'}`)
    
    if (!data.omie_app_key || !data.omie_app_secret) {
      console.log('❌ Credenciais incompletas!')
      return
    }
    
    console.log('\n✅ Credenciais configuradas no Supabase')
    
    // Agora testar diretamente com as credenciais do Supabase
    console.log('\n🔍 TESTANDO OMIE DIRETAMENTE COM AS CREDENCIAIS DO SUPABASE...')
    
    // Fazer chamada direta ao Omie (sem passar pelo backend)
    const omieUrl = 'https://app.omie.com.br/api/v1/geral/produtos/'
    const params = {
      call: 'ListarProdutos',
      param: [{
        pagina: 1,
        registros_por_pagina: 50
      }]
    }
    
    const response = await fetch(omieUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_key: data.omie_app_key,
        app_secret: data.omie_app_secret,
        ...params
      })
    })
    
    const result = await response.json()
    console.log(`\nStatus Omie: ${response.status}`)
    
    if (response.ok) {
      const produtos = result.produto_servico_cadastro || []
      console.log(`✅ Encontrados ${produtos.length} produtos diretamente no Omie`)
      
      if (produtos.length > 0) {
        console.log('\n📋 Primeiros 10 produtos:')
        produtos.slice(0, 10).forEach((p: any) => {
          console.log(`  • ${p.codigo_produto}: ${p.descricao}`)
        })
      }
    } else {
      console.log('❌ Erro Omie:', result.faultstring || JSON.stringify(result))
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

verificarCredenciaisSupabase()
