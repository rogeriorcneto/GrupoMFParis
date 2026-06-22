/**
 * Diagnóstico: lista os pedidos mais recentes e seus status,
 * para descobrir por que não aparecem na tela de Aprovação.
 *
 * Uso: railway run npx tsx scripts/diagnostico-pedidos-recentes.ts
 */

import { supabase } from '../src/supabase.js'

const V = '\x1b[32m', R = '\x1b[31m', A = '\x1b[33m', C = '\x1b[36m', RST = '\x1b[0m', B = '\x1b[1m'
const titulo = (m: string) => console.log(`\n${B}${A}══ ${m} ══${RST}\n`)

async function main() {
  titulo('15 pedidos mais recentes (todos os status)')
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, numero, cliente_id, status, tipo, total_valor, omie_codigo, omie_erro, data_criacao')
    .order('id', { ascending: false })
    .limit(15)

  if (error) { console.error(`${R}Erro:${RST}`, error.message); process.exit(1) }

  console.log(`${'ID'.padEnd(6)} ${'NUMERO'.padEnd(16)} ${'CLI'.padEnd(7)} ${'STATUS'.padEnd(24)} ${'TIPO'.padEnd(12)} ${'VALOR'.padEnd(10)} OMIE`)
  console.log('─'.repeat(95))
  for (const p of pedidos || []) {
    const omie = p.omie_codigo ? `${V}${p.omie_codigo}${RST}` : (p.omie_erro ? `${R}ERRO${RST}` : '-')
    const statusColor = p.status === 'enviado' ? A : (p.status === 'confirmado' ? V : C)
    console.log(
      `${String(p.id).padEnd(6)} ${(p.numero || '').padEnd(16)} ${String(p.cliente_id).padEnd(7)} ${statusColor}${(p.status || '').padEnd(24)}${RST} ${(p.tipo || '').padEnd(12)} ${String(p.total_valor || 0).padEnd(10)} ${omie}`
    )
  }

  // Contagem por status
  titulo('Contagem por status')
  const { data: todos } = await supabase.from('pedidos').select('status')
  const contagem: Record<string, number> = {}
  for (const p of todos || []) contagem[p.status || 'null'] = (contagem[p.status || 'null'] || 0) + 1
  for (const [st, n] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
    const cor = st === 'enviado' ? A : st === 'confirmado' ? V : C
    console.log(`  ${cor}${st.padEnd(28)}${RST} ${n}`)
  }

  // Pedidos status 'enviado' (deveriam aparecer na aprovação)
  titulo("Pedidos com status 'enviado' (deveriam estar na Aprovação)")
  const { data: enviados } = await supabase
    .from('pedidos')
    .select('id, numero, cliente_id, vendedor_id, total_valor, data_criacao')
    .eq('status', 'enviado')
    .order('id', { ascending: false })
  if (!enviados || enviados.length === 0) {
    console.log(`${R}  NENHUM pedido com status 'enviado'.${RST}`)
    console.log(`${A}  → Por isso a tela de Aprovação está vazia.${RST}`)
  } else {
    for (const p of enviados) {
      console.log(`  #${p.id} ${p.numero} | cliente ${p.cliente_id} | vendedor ${p.vendedor_id} | R$ ${p.total_valor}`)
    }
  }

  console.log()
  process.exit(0)
}

main().catch(e => { console.error(`${R}Erro fatal:${RST}`, e); process.exit(1) })
