import { supabase } from '../src/supabase.js'

async function main() {
  const { data: p } = await supabase.from('pedidos').select('*').eq('id', 813).single()
  console.log('PEDIDO:', JSON.stringify(p, null, 2))
  const { data: itens } = await supabase.from('itens_pedido').select('*').eq('pedido_id', 813)
  console.log('ITENS:', JSON.stringify(itens, null, 2))
  if (p?.cliente_id) {
    const { data: c } = await supabase.from('clientes').select('id, razao_social, cnpj, cpf, omie_codigo, etapa').eq('id', p.cliente_id)
    console.log('CLIENTE:', JSON.stringify(c, null, 2))
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
