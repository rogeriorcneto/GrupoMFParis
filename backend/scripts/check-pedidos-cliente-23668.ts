import { supabase } from '../src/supabase.js'

async function main() {
  const { data } = await supabase
    .from('pedidos')
    .select('id, numero, cliente_id, status, tipo, total_valor, omie_codigo, omie_numero, omie_erro, data_criacao')
    .eq('cliente_id', 23668)
    .order('id', { ascending: false })
  console.log(JSON.stringify(data, null, 2))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
