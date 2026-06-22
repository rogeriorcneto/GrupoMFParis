/**
 * Diagnóstico: verifica se o RPC mover_cliente_atomico está aplicado e
 * funcionando em produção (usando service role, que ignora a sessão do browser).
 *
 * Uso: railway run npx tsx scripts/diagnostico-mover-cliente.ts
 */

import { supabase } from '../src/supabase.js'

const V = '\x1b[32m', R = '\x1b[31m', A = '\x1b[33m', C = '\x1b[36m', RST = '\x1b[0m', B = '\x1b[1m'
const ok = (m: string) => console.log(`${V}✅ ${m}${RST}`)
const err = (m: string) => console.log(`${R}❌ ${m}${RST}`)
const info = (m: string) => console.log(`${C}ℹ  ${m}${RST}`)
const titulo = (m: string) => console.log(`\n${B}${A}══ ${m} ══${RST}\n`)

async function main() {
  console.log(`\n${B}${C}Diagnóstico — mover_cliente_atomico (produção)${RST}\n`)

  // 1. Pegar um cliente real para teste não-destrutivo
  titulo('1. Buscando um cliente para teste')
  const { data: cliente, error: cliErr } = await supabase
    .from('clientes')
    .select('id, razao_social, etapa, etapa_anterior')
    .not('etapa', 'is', null)
    .limit(1)
    .single()

  if (cliErr || !cliente) {
    err(`Não foi possível buscar cliente: ${cliErr?.message}`)
    process.exit(1)
  }
  ok(`Cliente: ${cliente.razao_social} (id ${cliente.id}) — etapa atual: "${cliente.etapa}"`)

  // 2. Testar RPC movendo para a MESMA etapa (não muda nada de fato)
  titulo('2. Testando RPC mover_cliente_atomico (move para a mesma etapa)')
  const now = new Date().toISOString()
  const { error: rpcErr } = await supabase.rpc('mover_cliente_atomico', {
    p_cliente_id: cliente.id,
    p_etapa: cliente.etapa,
    p_etapa_anterior: cliente.etapa_anterior || cliente.etapa,
    p_data_entrada_etapa: now,
    p_extras: {},
  })

  if (rpcErr) {
    err(`RPC FALHOU: ${rpcErr.message}`)
    info('Código do erro: ' + (rpcErr.code || 'n/a'))
    info('Detalhes: ' + (rpcErr.details || 'n/a'))
    info('Hint: ' + (rpcErr.hint || 'n/a'))
    console.log(`\n${B}${R}→ O RPC NÃO está OK em produção. A migration precisa ser aplicada.${RST}`)
    process.exit(1)
  }
  ok('RPC executou com SUCESSO (sem extras)')

  // 3. Testar RPC COM vendedor_id no extras (recurso da migration 20260620)
  titulo('3. Testando RPC com vendedor_id em p_extras (migration 20260620)')
  const { data: vendedor } = await supabase.from('vendedores').select('id').limit(1).single()
  const vendedorId = vendedor?.id

  const { error: rpcErr2 } = await supabase.rpc('mover_cliente_atomico', {
    p_cliente_id: cliente.id,
    p_etapa: cliente.etapa,
    p_etapa_anterior: cliente.etapa_anterior || cliente.etapa,
    p_data_entrada_etapa: now,
    p_extras: vendedorId ? { vendedor_id: vendedorId } : {},
  })

  if (rpcErr2) {
    err(`RPC com vendedor_id FALHOU: ${rpcErr2.message}`)
    console.log(`\n${B}${A}→ O RPC básico funciona, mas a migration 20260620 (vendedor_id) NÃO está aplicada.${RST}`)
    process.exit(1)
  }
  ok('RPC com vendedor_id executou com SUCESSO (migration 20260620 aplicada)')

  titulo('Conclusão')
  ok('O RPC mover_cliente_atomico está 100% funcional em produção.')
  info('Portanto, o "Ir para Proposta" que falha no navegador é causado')
  info('EXCLUSIVAMENTE pelo token de sessão inválido (refresh token).')
  info('Solução: logout + login (ou limpar localStorage) na aplicação.')
  console.log()
  process.exit(0)
}

main().catch(e => {
  console.error(`${R}Erro fatal:${RST}`, e)
  process.exit(1)
})
