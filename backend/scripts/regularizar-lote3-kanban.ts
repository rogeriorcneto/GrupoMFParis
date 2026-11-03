import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const LOTE: { empresa: string; principal: number; excedentes: number[] }[] = [
  { empresa: 'BERSAGLIO', principal: 23889, excedentes: [18809, 23259] },
  { empresa: 'C DO FERMENTO', principal: 23890, excedentes: [18812] },
  { empresa: 'CASA REAL', principal: 23908, excedentes: [23236] },
  { empresa: 'CENTRO COMERCIAL', principal: 23906, excedentes: [22677] },
  { empresa: 'MATHESCH', principal: 23894, excedentes: [22263, 23252] },
  { empresa: 'CUNHAPAN', principal: 23895, excedentes: [22264, 23248] },
  { empresa: 'DA NOSSA', principal: 23896, excedentes: [22265, 23249] },
  { empresa: 'GESB', principal: 23892, excedentes: [22260, 23243] },
  { empresa: 'GOLD', principal: 23909, excedentes: [23264] },
  { empresa: 'MARIMEL', principal: 23901, excedentes: [22569, 23315] },
  { empresa: 'MESTRE DO SABOR', principal: 23559, excedentes: [22592, 23238] },
  { empresa: 'OESTEPAN', principal: 23893, excedentes: [22262, 23260] },
  { empresa: 'P E M', principal: 23907, excedentes: [22681] },
  { empresa: 'PERGELATI', principal: 23598, excedentes: [22593, 23254] },
  { empresa: 'PRODUPAN', principal: 23898, excedentes: [22269, 23247] },
  { empresa: 'ROSANGELA', principal: 23723, excedentes: [18670, 23268] },
  { empresa: 'T T F', principal: 23904, excedentes: [22671] },
  { empresa: 'ERLAN', principal: 24029, excedentes: [23581, 24028] },
  { empresa: 'J D A ROCHA', principal: 23939, excedentes: [23470, 23612, 23956] },
  { empresa: 'SABV', principal: 24055, excedentes: [23354] },
  { empresa: 'SORVDOCE', principal: 23235, excedentes: [23608, 23676] },
]
const MOTIVO = 'Regularização funil lote 3 (2026-11-02): duplicata; dono = vendedor que cadastrou primeiro'

async function estadoAtual(ids: number[]) {
  const { data: cls } = await supabase.from('clientes').select('id, etapa, vendedor_id, arquivado_duplicata').in('id', ids)
  const { data: peds } = await supabase.from('pedidos').select('cliente_id, status').in('cliente_id', ids)
  const map = new Map((cls || []).map(c => [c.id, c as any]))
  const pm = new Map<number, string[]>(); (peds || []).forEach(p => { const a = pm.get(p.cliente_id) || []; a.push(p.status); pm.set(p.cliente_id, a) })
  return { map, pm }
}

async function main() {
  const todos = LOTE.flatMap(g => [g.principal, ...g.excedentes])
  const { map, pm } = await estadoAtual(todos)
  let ok = true
  for (const g of LOTE) {
    for (const id of [g.principal, ...g.excedentes]) {
      const c = map.get(id)
      if (!c) { console.log(`  ${g.empresa} ${id}: NÃO ENCONTRADO`); ok = false; continue }
      const ativos = (pm.get(id) || []).filter(s => s !== 'cancelado')
      if (id !== g.principal && ativos.length) { console.log(`  ${g.empresa} ${id}: EXCEDENTE COM PEDIDO ATIVO [${ativos}]`); ok = false }
      if (c.arquivado_duplicata) { console.log(`  ${g.empresa} ${id}: já arquivado`); ok = false }
    }
    const pp = map.get(g.principal)
    if (pp && (pm.get(g.principal) || []).some(s => s !== 'cancelado')) {
      console.log(`  ${g.empresa} ${g.principal}: PRINCIPAL COM PEDIDO ATIVO [${(pm.get(g.principal) || []).filter(s => s !== 'cancelado')}]`)
    }
  }
  if (!ok || !process.argv.includes('--executar')) { console.log(ok ? 'Tudo OK — use --executar' : 'ABORTADO'); return }
  console.log('\n=== EXECUTANDO ===')
  for (const g of LOTE) {
    const { data, error } = await supabase.rpc('arquivar_duplicatas_funil', {
      p_principal: g.principal, p_excedentes: g.excedentes, p_motivo: `${MOTIVO} (${g.principal})`,
    })
    console.log(`  ${g.empresa}: ${error ? 'FALHOU — ' + error.message : (data?.length ?? 0) + ' arquivado(s)'}`)
  }
  const dep = await estadoAtual(todos)
  console.log('\n=== RESULTADO ===')
  for (const g of LOTE) {
    const p = dep.map.get(g.principal)
    const st = g.excedentes.map(id => `${id}:${dep.map.get(id)?.arquivado_duplicata}`).join(' ')
    console.log(`  ${g.empresa} ${g.principal}:${p?.etapa}/v${p?.vendedor_id} | ${st}`)
  }
}
main().catch(e => { console.error(e.message || e); process.exit(1) })
