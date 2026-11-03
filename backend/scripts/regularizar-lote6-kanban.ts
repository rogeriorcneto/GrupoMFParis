import { createClient } from '@supabase/supabase-js'
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const MOTIVO = 'Regularização funil lote 6 (2026-11-02): identidade confirmada por código Omie'
async function main() {
  const now = new Date().toISOString()
  // ALLPAN: card com bonificacao confirmada -> amostra
  const { error: e1 } = await s.rpc('mover_cliente_atomico', { p_cliente_id: 18779, p_etapa: 'amostra', p_etapa_anterior: 'proposta', p_data_entrada_etapa: now, p_extras: { status_amostra: 'entregue' } })
  console.log('ALLPAN 18779 ->amostra:', e1 ? 'FALHOU ' + e1.message : 'OK')
  const lotes = [
    { e: 'ALLPAN', p: 23884, x: [22853] },
    { e: 'CASA DA PANIFICACAO', p: 23897, x: [22267, 23250] },
    { e: 'MIRA', p: 23902, x: [22659] },
    { e: 'LAZAROTO', p: 23599, x: [22596, 23255] },
  ]
  for (const g of lotes) {
    const { error } = await s.rpc('arquivar_duplicatas_funil', { p_principal: g.p, p_excedentes: g.x, p_motivo: `${MOTIVO} (${g.p})` })
    console.log(`${g.e}: ${error ? 'FALHOU — ' + error.message : 'arquivado(s) → ' + g.p}`)
  }
  const { data } = await s.from('clientes').select('id, etapa, arquivado_duplicata').in('id', [18779, 23884, 22853, 23897, 22267, 23250, 23902, 22659, 23599, 22596, 23255])
  console.log(JSON.stringify(data))
}
main().catch(e => { console.error(e.message || e); process.exit(1) })
