import { createClient } from '@supabase/supabase-js'
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const MOTIVO = 'Regularização funil lote 5 (2026-11-02): correção de etapa + duplicatas'

// A) card com amostra (pedido bonificacao) -> amostra ; manter comercial ; arquivar extras
const A: { e: string; amostra: number; statusAmostra: string; manter: number; arquivar: number[] }[] = [
  { e: 'ACAI BH', amostra: 22616, statusAmostra: 'coletada', manter: 23589, arquivar: [23245] },
  { e: 'ALESSANDRA', amostra: 23360, statusAmostra: 'coletada', manter: 24061, arquivar: [] },
  { e: 'AMERIPAN', amostra: 18785, statusAmostra: 'entregue', manter: 23886, arquivar: [22862] },
  { e: 'CANADENSE', amostra: 22672, statusAmostra: 'coletada', manter: 23905, arquivar: [] },
  { e: 'CASA DOCE', amostra: 22549, statusAmostra: 'entregue', manter: 23595, arquivar: [23251] },
  { e: 'CRIARPAN', amostra: 18789, statusAmostra: 'liberada', manter: 23887, arquivar: [] },
  { e: 'DAIANE', amostra: 23358, statusAmostra: 'coletada', manter: 24059, arquivar: [] },
  { e: 'DIST ACAI BRASIL', amostra: 22573, statusAmostra: 'entregue', manter: 23596, arquivar: [23258] },
  { e: 'DNA ACAI', amostra: 22498, statusAmostra: 'coletada', manter: 23590, arquivar: [23246] },
  { e: 'DORIVALI', amostra: 22531, statusAmostra: 'entregue', manter: 23900, arquivar: [22871] },
  { e: 'DOVO', amostra: 23356, statusAmostra: 'coletada', manter: 24057, arquivar: [] },
  { e: 'FARIA', amostra: 22630, statusAmostra: 'entregue', manter: 23591, arquivar: [23244] },
  { e: 'FERPEREZ', amostra: 18780, statusAmostra: 'entregue', manter: 23885, arquivar: [22874] },
  { e: 'GAPAN', amostra: 18791, statusAmostra: 'entregue', manter: 23888, arquivar: [22863] },
  { e: 'GELANDO SERRA', amostra: 22589, statusAmostra: 'liberada', manter: 23597, arquivar: [23253] },
  { e: 'GRUPO THE BEST', amostra: 22383, statusAmostra: 'coletada', manter: 22696, arquivar: [] },
  { e: 'IRMAOS HENDGES', amostra: 23285, statusAmostra: 'coletada', manter: 23910, arquivar: [] },
  { e: 'JAPAN', amostra: 23314, statusAmostra: 'coletada', manter: 23911, arquivar: [] },
  { e: 'JULIA VITORIA', amostra: 22623, statusAmostra: 'coletada', manter: 23601, arquivar: [23256] },
  { e: 'LIMA BULLA', amostra: 23316, statusAmostra: 'coletada', manter: 23912, arquivar: [] },
  { e: 'LUNAR', amostra: 18813, statusAmostra: 'coletada', manter: 23891, arquivar: [] },
  { e: 'MACPAN', amostra: 18772, statusAmostra: 'entregue', manter: 23883, arquivar: [] },
  { e: 'S A V FRATELLI', amostra: 22666, statusAmostra: 'entregue', manter: 23903, arquivar: [22880] },
  { e: 'SANTINA', amostra: 18701, statusAmostra: 'entregue', manter: 23724, arquivar: [23292] },
  { e: 'SIRLEI', amostra: 23355, statusAmostra: 'coletada', manter: 24056, arquivar: [] },
  { e: 'GELLIN', amostra: 23359, statusAmostra: 'coletada', manter: 24060, arquivar: [] },
  { e: 'GLORIA', amostra: 23357, statusAmostra: 'coletada', manter: 24058, arquivar: [] },
  { e: 'SUMMER SHAKE', amostra: 22611, statusAmostra: 'entregue', manter: 23600, arquivar: [23257] },
  { e: 'SVP', amostra: 22504, statusAmostra: 'entregue', manter: 23899, arquivar: [22872] },
  { e: 'ACAIZINHO', amostra: 18339, statusAmostra: 'entregue', manter: 18596, arquivar: [] },
]
// B) vendas confirmadas/enviadas -> follow_up ; manter ; arquivar
const B: { e: string; followup: number; manter: number; arquivar: number[] }[] = [
  { e: 'JOARLEY', followup: 22424, manter: 22856, arquivar: [] },
  { e: 'C G SANTANA', followup: 24010, manter: 24008, arquivar: [23977] },
  { e: 'CPF TESTE', followup: 23654, manter: 23648, arquivar: [23649, 23651, 23655, 23656] },
]
const WILIAM = 6

async function main() {
  const now = new Date().toISOString()
  for (const g of A) {
    const { error: e1 } = await s.rpc('mover_cliente_atomico', { p_cliente_id: g.amostra, p_etapa: 'amostra', p_etapa_anterior: 'proposta', p_data_entrada_etapa: now, p_extras: { status_amostra: g.statusAmostra } })
    if (e1) { console.log(`${g.e} ${g.amostra} ->amostra FALHOU: ${e1.message}`); continue }
    if (g.arquivar.length) {
      const { error: e2 } = await s.rpc('arquivar_duplicatas_funil', { p_principal: g.manter, p_excedentes: g.arquivar, p_motivo: `${MOTIVO} (${g.manter})` })
      if (e2) console.log(`${g.e} arquivar ${g.arquivar} FALHOU: ${e2.message}`)
    }
    console.log(`${g.e}: ${g.amostra}->amostra(${g.statusAmostra}) manter=${g.manter} arq=[${g.arquivar}]`)
  }
  for (const g of B) {
    const { error: e1 } = await s.rpc('mover_cliente_atomico', { p_cliente_id: g.followup, p_etapa: 'follow_up', p_etapa_anterior: 'negociacao', p_data_entrada_etapa: now, p_extras: {} })
    if (e1) { console.log(`${g.e} ${g.followup} ->follow_up FALHOU: ${e1.message}`); continue }
    if (g.arquivar.length) {
      const { error: e2 } = await s.rpc('arquivar_duplicatas_funil', { p_principal: g.manter, p_excedentes: g.arquivar, p_motivo: `${MOTIVO} (${g.manter})` })
      if (e2) console.log(`${g.e} arquivar ${g.arquivar} FALHOU: ${e2.message}`)
    }
    console.log(`${g.e}: ${g.followup}->follow_up manter=${g.manter} arq=[${g.arquivar}]`)
  }
  const { error: eV } = await s.from('clientes').update({ vendedor_id: WILIAM }).eq('id', 18596)
  console.log(`ACAIZINHO 18596 vendedor->Wiliam: ${eV ? 'FALHOU ' + eV.message : 'OK'}`)

  // verificação final
  const todos = [...A.flatMap(g => [g.amostra, g.manter, ...g.arquivar]), ...B.flatMap(g => [g.followup, g.manter, ...g.arquivar])]
  const { data: cls } = await s.from('clientes').select('id, etapa, arquivado_duplicata').in('id', todos)
  const bad = (cls || []).filter(c => !c.arquivado_duplicata && ['proposta', 'negociacao'].includes(c.etapa))
  const grupos = new Map<string, number[]>()
  for (const c of bad) { /* só conta por grupo já mapeado acima */ }
  console.log(`\nVERIFICAÇÃO: cards comerciais restantes não-arquivados no lote: ${bad.length} (esperado = ${A.length + B.length})`)
}
main().catch(e => { console.error(e.message || e); process.exit(1) })
