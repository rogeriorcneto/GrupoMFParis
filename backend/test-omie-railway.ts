import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testarFluxoOmieNoRailway() {
  console.log('=== TESTE FLUXO OMIE NO RAILWAY ===')
  
  try {
    // 1. Login como gerente
    console.log('1. Fazendo login como gerente...')
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: GERENTE_EMAIL,
      password: GERENTE_SENHA,
    })
    
    if (authErr || !authData.session) {
      console.error('❌ Erro no login:', authErr?.message)
      return
    }
    
    const token = authData.session.access_token
    console.log('✅ Login OK — Token obtido')

    // 2. Testar endpoint do Omie no Railway
    console.log('2. Testando endpoint Omie no Railway...')
    
    const response = await fetch(`${BACKEND_URL}/api/omie/test-flow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({})
    })
    
    const result = await response.json()
    console.log(`Status HTTP: ${response.status}`)
    console.log('Resposta:', JSON.stringify(result, null, 2))
    
    if (result.success) {
      console.log('\n🎉 SUCESSO! Teste Omie passou!')
      console.log('✅ Credenciais Omie configuradas')
      console.log('✅ Conexão Omie funcionando')
      console.log('✅ Produto encontrado no Omie')
      
      if (result.data?.produto) {
        console.log(`📦 Produto testado: ${result.data.produto.nome}`)
        console.log(`📋 Código Omie: ${result.data.produto.omie_codigo}`)
      }
      
      if (result.data?.omie) {
        console.log(`🏭 Nome no Omie: ${result.data.omie.nome}`)
        console.log(`💰 Preço no Omie: ${result.data.omie.preco}`)
      }
    } else {
      console.log('\n❌ Falha no teste Omie:')
      console.log('Erro:', result.error)
      
      if (result.error.includes('Credenciais Omie não configuradas')) {
        console.log('\n💡 Solução: Configure as credenciais Omie no CRM')
        console.log('   1. Vá em: Integracoes → Omie ERP')
        console.log('   2. Preencha App Key e App Secret')
        console.log('   3. Salve e teste novamente')
      }
    }
    
    console.log('\n=== FIM DO TESTE ===')
    
    // Logout
    await supabase.auth.signOut()
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

testarFluxoOmieNoRailway()
