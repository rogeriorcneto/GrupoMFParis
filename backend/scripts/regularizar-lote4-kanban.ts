import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const LOTE = [
  { empresa: 'ATLANTICA', principal: 23627, excedentes: [22760, 23320, 23843] },
  { empresa: 'CAZARINE', principal: 23557, excedentes: [22762, 22791, 22792, 23554] },
  { empresa: 'SUMMERLAND', principal: 23635, excedentes: [23503, 23736, 23917, 23924] },
]
const MOTIVO = 'Regularização funil lote 4 (2026-11-02): duplicata; dono = vendedor que cadastrou primeiro'
async function estado(ids: number[]) {
  const { data: cls } = await supabase.from('clientes').select('id, etapa, arquivado_duplicata').in('id', ids)
  const { data: peds } = await supabase.from('pedidos').select('cliente_id, status').in('cliente_id', ids)
  const pm = new Map<number, string[]>(); (peds || []).forEach(p => { const a = pm.get(p.cliente_id) || []; a.push(p.status); pm.set(p.cliente_id, a) })
  return { map: new Map((cls || []).map(c => [c.id, c as any])), pm }
}
async function main() {
  const todos = LOTE.flatMap(g => [g.principal, ...g.excedentes])
  const { map, pm } = await estado(todos)
  let ok = true
  for (const g of LOTE) for (const id of [g.principal, ...g.excedentes]) {
    const c = map.get(id)
    if (!c || c.arquivado_duplicata) { console.log(`${g.empresa} ${id}: problema`); ok = false }
    if (id !== g.principal && (pm.get(id) || []).some(s => s !== 'cancelado')) { console.log(`${g.empresa} ${id}: PEDIDO ATIVO`); ok = false }
  }
  if (!ok) { console.log('ABORTADO'); return }
  for (const g of LOTE) {
    const { data, error } = await supabase.rpc('arquivar_duplicatas_funil', { p_principal: g.principal, p_excedentes: g.excedentes, p_motivo: `${MOTIVO} (${g.principal})` })
    console.log(`${g.empresa}: ${error ? 'FALHOU — ' + error.message : (data?.length ?? 0) + ' arquivado(s) → ' + g.principal}`)
  }
  const dep = await estado(todos)
  for (const g of LOTE) console.log(`  ${g.empresa} principal ${g.principal}:${dep.map.get(g.principal)?.etapa} | exc ${g.excedentes.map(id => `${id}:${dep.map.get(id)?.arquivado_duplicata}`).join(' ')}`)
}
main().catch(e => { console.error(e.message || e); process.exit(1) })
