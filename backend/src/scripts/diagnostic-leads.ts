import { supabase } from '../supabase.js'

async function main() {
  const { count, error } = await supabase
    .from('leads_rf')
    .select('*', { count: 'exact', head: true })
  console.log(`Total de registros em leads_rf: ${count}`, error ? `erro: ${error.message}` : '')

  const { data, error: err2 } = await supabase
    .from('leads_rf')
    .select('cnpj, razao_social, cnae, uf, municipio, telefone, email')
    .limit(5)
  console.log('Primeiros 5 registros:', data, err2 ? `erro: ${err2.message}` : '')
}

main().catch((err) => { console.error(err); process.exit(1) })
