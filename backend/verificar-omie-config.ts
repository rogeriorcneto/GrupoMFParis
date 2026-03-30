import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function verificarCredenciais() {
  console.log('🔍 Verificando configuração Omie...')
  
  const { data: config, error } = await supabase
    .from('bot_config')
    .select('omie_app_key, omie_app_secret')
    .single()
  
  if (error) {
    console.error('❌ Erro ao buscar config:', error.message)
    return
  }
  
  if (config?.omie_app_key && config?.omie_app_secret) {
    console.log('✅ Credenciais Omie configuradas')
    console.log('  App Key:', config.omie_app_key ? '***' + config.omie_app_key.slice(-4) : 'NÃO')
    console.log('  App Secret:', config.omie_app_secret ? '***' + config.omie_app_secret.slice(-4) : 'NÃO')
  } else {
    console.log('❌ Credenciais Omie NÃO configuradas')
    console.log('  App Key:', config?.omie_app_key || 'NÃO')
    console.log('  App Secret:', config?.omie_app_secret || 'NÃO')
  }
}

verificarCredenciais()
