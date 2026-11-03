import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// Lote 2 aprovado (2026-11-02): regra "vendedor que cadastrou primeiro mantém"
const LOTE: { empresa: string; principal: number; excedentes: number[] }[] = [
  { empresa: 'BERNARDO NERY', principal: 24048, excedentes: [24046] },
  { empresa: 'ACAI D PARA', principal: 23531, excedentes: [23430, 23567] },
  { empresa: 'ACAI DIVINO', principal: 23610, excedentes: [23478, 23480] },
  { empresa: 'DMS', principal: 24016, excedentes: [23563] },
  { empresa: 'FLORENCO', principal: 23667, excedentes: [23653] },
  { empresa: 'MAX COMERCIO', principal: 23963, excedentes: [23958] },
  { empresa: 'R S TOLEDO', principal: 23986, excedentes: [23975] },
  { empresa: 'XODO DE MINAS', principal: 23746, excedentes: [22746] },
  { empresa: 'CAMILA RODRIGUES', principal: 23331, excedentes: [23862] },
  { empresa: 'CCM', principal: 23440, excedentes: [23442, 23738] },
  { empresa: 'DISTRIPANI', principal: 23493, excedentes: [23949] },
  { empresa: 'SILVANIA', principal: 22851, excedentes: [23732] },
  { empresa: 'ITAVALE', principal: 23361, excedentes: [23742, 23745, 23762] },
  { empresa: 'GENIVAL', principal: 23551, excedentes: [23782, 23876, 23965] },
  { empresa: 'SCHIMINI', principal: 23400, excedentes: [23594, 23631, 23954] },
  { empresa: 'IND SORVETES', principal: 23864, excedentes: [23865, 23880] },
]
const MOTIVO = 'Regularização funil lote 2 (2026-11-02): duplicata; dono = vendedor que cadastrou primeiro'
const WILIAM_ID = 6

async function estadoAtual(ids: number[]) {
  const { data: cls } = await supabase.from('clientes')
    .select('id, etapa, vendedor_id, arquivado_duplicata').in('id', ids)
  const { data: peds } = await supabase.from('pedidos').select('cliente_id, status').in('cliente_id', ids)
  const map = new Map((cls || []).map(c => [c.id, c as any]))
  const pm = new Map<number, string[]>(); (peds || []).forEach(p => { const a = pm.get(p.cliente_id) || []; a.push(p.status); pm.set(p.cliente_id, a) })
  return { map, pm }
}

async function main() {
  const todos = LOTE.flatMap(g => [g.principal, ...g.excedentes])
  const { map, pm } = await estadoAtual(todos)
  let ok = true
  console.log('=== VERIFICAÇÃO ===')
  for (const g of LOTE) {
    for (const id of [g.principal, ...g.excedentes]) {
      const c = map.get(id)
      if (!c) { console.log(`  ${g.empresa} ${id}: NÃO ENCONTRADO`); ok = false; continue }
      const ativos = (pm.get(id) || []).filter(s => s !== 'cancelado')
      if (id !== g.principal && ativos.length) { console.log(`  ${g.empresa} ${id}: EXCEDENTE COM PEDIDO ATIVO [${ativos}]`); ok = false }
      if (c.arquivado_duplicata) { console.log(`  ${g.empresa} ${id}: já arquivado`); ok = false }
    }
  }
  if (!ok || !process.argv.includes('--executar')) {
    console.log(ok ? 'Tudo OK — use --executar' : 'ABORTADO')
    return
  }
  console.log('\n=== EXECUTANDO ===')
  for (const g of LOTE) {
    const { data, error } = await supabase.rpc('arquivar_duplicatas_funil', {
      p_principal: g.principal, p_excedentes: g.excedentes, p_motivo: `${MOTIVO} (${g.principal})`,
    })
    console.log(`  ${g.empresa}: ${error ? 'FALHOU — ' + error.message : (data?.length ?? 0) + ' arquivado(s)'}`)
  }
  // Dono original Wiliam no principal do IND SORVETES (correção de carteira aprovada)
  const { error: eV } = await supabase.from('clientes').update({ vendedor_id: WILIAM_ID }).eq('id', 23864)
  console.log(`  IND SORVETES 23864 vendedor→Wiliam: ${eV ? 'FALHOU — ' + eV.message : 'OK'}`)

  const dep = await estadoAtual(todos)
  console.log('\n=== RESULTADO ===')
  for (const g of LOTE) {
    const p = dep.map.get(g.principal)
    const st = g.excedentes.map(id => `${id}:${dep.map.get(id)?.arquivado_duplicata}`).join(' ')
    console.log(`  ${g.empresa} ${g.principal}:${p?.etapa}/v${p?.vendedor_id} | ${st}`)
  }
}
main().catch(e => { console.error(e.message || e); process.exit(1) })
