/**
 * Diagnóstico: propostas_historico do cliente BATISTELLI (10600)
 * Uso: railway run npx tsx scripts/diagnostico-propostas.ts
 */
import { supabase } from '../src/supabase.js'

const V = '\x1b[32m', R = '\x1b[31m', A = '\x1b[33m', RST = '\x1b[0m', B = '\x1b[1m'
const titulo = (m: string) => console.log(`\n${B}${A}══ ${m} ══${RST}\n`)

async function main() {
  titulo('Tabela "propostas" — 10 mais recentes (geral)')
  const { data: props, error } = await supabase
    .from('propostas')
    .select('id, numero, cliente_id, itens, total_valor, criado_em')
    .order('id', { ascending: false })
    .limit(10)

  if (error) {
    console.error(`${R}Erro ao buscar propostas:${RST}`, error.message)
    console.log(`${A}→ Se a tabela 'propostas' não existe, o "Ganhou" nunca cria pedido.${RST}`)
  } else if (!props || props.length === 0) {
    console.log(`${R}A tabela 'propostas' existe mas está VAZIA.${RST}`)
    console.log(`${A}→ Por isso o botão "Ganhou" não cria pedido (ultimaProposta = null).${RST}`)
  } else {
    for (const p of props) {
      const itens = Array.isArray(p.itens) ? p.itens : (p.itens ? JSON.parse(p.itens) : [])
      console.log(`  #${p.id} ${p.numero} | cliente ${p.cliente_id} | itens: ${itens.length} | total: R$ ${p.total_valor} | ${p.criado_em || ''}`)
    }
  }

  titulo('Vendedores (cargo) — para checar auto-aprovação de gerente')
  const { data: vends } = await supabase.from('vendedores').select('id, nome, cargo').limit(20)
  for (const v of vends || []) console.log(`  #${v.id} ${(v.nome || '').padEnd(25)} cargo: ${v.cargo}`)

  console.log()
  process.exit(0)
}

main().catch(e => { console.error(`${R}Erro fatal:${RST}`, e); process.exit(1) })
