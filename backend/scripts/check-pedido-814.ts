import { supabase } from '../src/supabase.js'

async function main() {
  const { data: p } = await supabase.from('pedidos').select('id, numero, cliente_id, status, omie_codigo, omie_numero, omie_erro').eq('id', 814).single()
  console.log('PEDIDO:', JSON.stringify(p))
  if (p?.cliente_id) {
    const { data: c } = await supabase.from('clientes').select('id, razao_social, cnpj, omie_codigo, etapa, novo_ciclo').eq('id', p.cliente_id)
    console.log('CLIENTE:', JSON.stringify(c))
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
