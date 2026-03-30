import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function testarEndpointSimples() {
  console.log('=== TESTE ENDPOINT SIMPLES ===')
  
  try {
    // Login
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'rafael@mfparis.com.br',
      password: 'MFParis2024!',
    })
    
    const token = authData.session.access_token
    console.log('✅ Login OK')

    // Testar endpoint de status do Omie (mais simples)
    const response = await fetch('https://grupomfparis-production.up.railway.app/api/omie/status', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    
    const result = await response.json()
    console.log(`Status: ${response.status}`)
    console.log('Resposta:', JSON.stringify(result, null, 2))
    
  } catch (err: any) {
    console.error('❌ Erro:', err.message)
  }
}

testarEndpointSimples()
