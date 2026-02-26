/**
 * Script para criar a tabela bot_config no Supabase.
 * Usa a API do Supabase com autenticação de usuário.
 * 
 * Uso: npx tsx scripts/create-config-table.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_ANON_KEY!

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  console.log('🔧 Verificando se tabela bot_config existe...')
  
  // Tentar ler — se funcionar, tabela já existe
  const { error: readError } = await supabase.from('bot_config').select('id').limit(1)
  
  if (!readError) {
    console.log('✅ Tabela bot_config já existe!')
    return
  }
  
  if (readError.code === '42P01' || readError.message?.includes('does not exist') || readError.message?.includes('relation')) {
    console.log('📝 Tabela não existe. Criando...')
    console.log('')
    console.log('⚠️  AÇÃO NECESSÁRIA:')
    console.log('   Abra o Supabase Dashboard → SQL Editor')
    console.log('   URL: https://supabase.com/dashboard/project/zeaeppmnetdhzwwdydmq/sql')
    console.log('')
    console.log('   Cole e execute o seguinte SQL:')
    console.log('')
    console.log(`
CREATE TABLE IF NOT EXISTS bot_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email_host text DEFAULT '',
  email_port integer DEFAULT 587,
  email_user text DEFAULT '',
  email_pass text DEFAULT '',
  email_from text DEFAULT '',
  whatsapp_numero text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

INSERT INTO bot_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_bot_config" ON bot_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_update_bot_config" ON bot_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_insert_bot_config" ON bot_config FOR INSERT TO authenticated WITH CHECK (true);
`)
    console.log('')
    console.log('   Depois de executar, rode este script novamente para verificar.')
  } else {
    console.log('❌ Erro inesperado:', readError.message)
  }
}

main().catch(console.error)
