/**
 * Fix pontual: atualiza statusAmostra para 'liberada' nos clientes
 * em etapa 'amostra' com pedido bonificacao 'confirmado' — corrige
 * os que ficaram presos em 'solicitada' por causa do timeout de aprovação.
 *
 * Uso: railway run npx tsx scripts/fix-status-amostra.ts
 */
import { supabase } from '../src/supabase.js'

const V = '\x1b[32m', R = '\x1b[31m', A = '\x1b[33m', RST = '\x1b[0m', B = '\x1b[1m'

async function main() {
  console.log(`\n${B}${A}Fix: statusAmostra 'solicitada' → 'liberada' para pedidos aprovados${RST}\n`)

  // Busca pedidos de bonificação confirmados
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, cliente_id, numero, status, tipo')
    .eq('tipo', 'bonificacao')
    .eq('status', 'confirmado')

  if (error) { console.error(`${R}Erro:${RST}`, error.message); process.exit(1) }

  let corrigidos = 0
  for (const p of pedidos || []) {
    const { data: cli } = await supabase
      .from('clientes')
      .select('id, razao_social, etapa, status_amostra')
      .eq('id', p.cliente_id)
      .single()

    if (!cli) continue
    if (cli.etapa !== 'amostra' && cli.etapa !== 'amostra_perdida') continue
    if (cli.status_amostra === 'liberada' || cli.status_amostra === 'aprovada') continue

    console.log(`  ${A}Corrigindo${RST} cliente #${cli.id} ${cli.razao_social} | etapa: ${cli.etapa} | status_amostra: ${cli.status_amostra || 'null'} | pedido: ${p.numero}`)
    const { error: upErr } = await supabase
      .from('clientes')
      .update({ status_amostra: 'liberada' })
      .eq('id', cli.id)
    if (upErr) console.log(`    ${R}Erro:${RST} ${upErr.message}`)
    else { console.log(`    ${V}→ status_amostra = 'liberada'${RST}`); corrigidos++ }
  }

  if (corrigidos === 0) console.log(`${A}Nenhum cliente precisava correção.${RST}`)
  else console.log(`\n${V}${corrigidos} cliente(s) corrigido(s).${RST}`)
  process.exit(0)
}

main().catch(e => { console.error(`${R}Erro fatal:${RST}`, e); process.exit(1) })
