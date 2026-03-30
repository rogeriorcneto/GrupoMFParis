import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://zeaeppmnetdhzwwdydmq.supabase.co',
  'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
)

async function main() {
  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, omie_codigo, preco, unidade, sku')
    .ilike('nome', '%gourmet%')
    .order('id', { ascending: true })

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  console.log(JSON.stringify(data || [], null, 2))
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
