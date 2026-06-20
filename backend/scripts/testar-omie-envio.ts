/**
 * Script de integração real — envia pedidos ao Omie de verdade.
 * Usa as credenciais reais do Omie configuradas no sistema.
 *
 * Uso:
 *   npx tsx scripts/testar-omie-envio.ts              ← reenviar pedidos com omieErro
 *   npx tsx scripts/testar-omie-envio.ts --id 123     ← enviar pedido específico
 *   npx tsx scripts/testar-omie-envio.ts --all        ← todos confirmados sem código Omie
 */

// Env vars: carregados por config.ts (dotenv) ou injetados via `railway run`

import { criarPedidoOmie } from '../src/omie/pedidos.js'
import { supabase } from '../src/supabase.js'
import { getOmieCredentials } from '../src/omie/client.js'
import { consultarPedidoOmie } from '../src/omie/pedidos.js'

const VERDE = '\x1b[32m'
const VERMELHO = '\x1b[31m'
const AMARELO = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'
const NEGRITO = '\x1b[1m'

function ok(msg: string) { console.log(`${VERDE}✅ ${msg}${RESET}`) }
function erro(msg: string) { console.log(`${VERMELHO}❌ ${msg}${RESET}`) }
function info(msg: string) { console.log(`${CYAN}ℹ  ${msg}${RESET}`) }
function titulo(msg: string) { console.log(`\n${NEGRITO}${AMARELO}══ ${msg} ══${RESET}\n`) }

async function verificarCredenciais() {
  titulo('Verificando credenciais Omie')
  const creds = await getOmieCredentials()
  if (!creds) {
    erro('Credenciais Omie não configuradas! Configure em Integrações → Omie ERP.')
    process.exit(1)
  }
  ok(`Credenciais OK — AppKey: ${creds.appKey.slice(0, 8)}...`)
  return creds
}

async function buscarPedidosParaEnviar(args: string[]): Promise<any[]> {
  // --id 123: pedido específico
  const idxId = args.indexOf('--id')
  if (idxId !== -1 && args[idxId + 1]) {
    const id = parseInt(args[idxId + 1], 10)
    const { data } = await supabase.from('pedidos').select('*').eq('id', id).single()
    return data ? [data] : []
  }

  // --all: todos confirmados sem omie_codigo
  if (args.includes('--all')) {
    const { data } = await supabase
      .from('pedidos')
      .select('*, clientes(razao_social)')
      .eq('status', 'confirmado')
      .is('omie_codigo', null)
      .order('created_at', { ascending: false })
      .limit(10)
    return data || []
  }

  // Padrão: confirmados com omie_erro (retry automático)
  const { data } = await supabase
    .from('pedidos')
    .select('*, clientes(razao_social)')
    .eq('status', 'confirmado')
    .is('omie_codigo', null)
    .not('omie_erro', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)
  return data || []
}

async function enviarPedido(pedido: any): Promise<void> {
  const clienteNome = pedido.clientes?.razao_social || `cliente_id:${pedido.cliente_id}`
  const tipo = pedido.tipo === 'bonificacao' ? '📦 AMOSTRA' : '🛒 VENDA'

  console.log(`\n─────────────────────────────────────────────`)
  console.log(`${NEGRITO}Pedido #${pedido.id}${RESET} | ${tipo} | ${clienteNome}`)
  console.log(`  Status: ${pedido.status}`)
  console.log(`  Valor:  R$ ${Number(pedido.total_valor || 0).toFixed(2)}`)
  console.log(`  Pagto:  ${pedido.forma_pagamento || 'Não informado'}`)
  console.log(`  Frete:  ${pedido.tipo_frete || 'Não informado'}`)
  if (pedido.omie_erro) {
    console.log(`  ${VERMELHO}Erro anterior: ${pedido.omie_erro}${RESET}`)
  }

  // Verificar se pedido já existe no Omie (caso omie_codigo esteja zerado mas foi enviado)
  if (pedido.omie_codigo) {
    info(`Pedido já tem código Omie: ${pedido.omie_codigo} — pulando.`)
    return
  }

  try {
    console.log(`  ${AMARELO}⏳ Enviando ao Omie...${RESET}`)
    const resultado = await criarPedidoOmie(pedido.id)

    ok(`ENVIADO! Código Omie: ${NEGRITO}${resultado.codigo_pedido}${RESET}${VERDE} | Número: ${resultado.numero_pedido}`)

    // Verificar no Omie que de fato chegou
    try {
      console.log(`  ⏳ Consultando confirmação no Omie...`)
      const status = await consultarPedidoOmie(pedido.id)
      if (status) {
        ok(`Confirmado no Omie! Status: ${(status as any).descricao_status || JSON.stringify(status)}`)
      }
    } catch (consultaErr: any) {
      info(`Consulta de confirmação falhou (pode ser delay): ${consultaErr.message}`)
    }

  } catch (err: any) {
    erro(`FALHOU: ${err.message}`)

    // Salvar erro atualizado no banco
    await supabase
      .from('pedidos')
      .update({ omie_erro: err.message })
      .eq('id', pedido.id)
    console.log(`  ${AMARELO}Erro salvo no banco para reprocessamento posterior.${RESET}`)
  }
}

async function resumo(pedidos: any[]) {
  titulo('Resumo')
  const { data: atualizados } = await supabase
    .from('pedidos')
    .select('id, omie_codigo, omie_numero, omie_erro')
    .in('id', pedidos.map(p => p.id))

  console.log(`${'ID'.padEnd(8)} ${'Omie Código'.padEnd(15)} ${'Omie Número'.padEnd(15)} ${'Erro'}`)
  console.log('─'.repeat(70))

  for (const p of atualizados || []) {
    const statusIcon = p.omie_codigo ? VERDE + '✅' : VERMELHO + '❌'
    const codigoStr = (p.omie_codigo || '-').padEnd(15)
    const numeroStr = (p.omie_numero || '-').padEnd(15)
    const erroStr = p.omie_erro ? p.omie_erro.slice(0, 35) + '...' : '-'
    console.log(`${statusIcon} ${RESET}#${String(p.id).padEnd(6)} ${codigoStr} ${numeroStr} ${erroStr}`)
  }
}

async function main() {
  console.log(`\n${NEGRITO}${CYAN}╔═══════════════════════════════════════╗${RESET}`)
  console.log(`${NEGRITO}${CYAN}║     Teste de Integração Omie Real     ║${RESET}`)
  console.log(`${NEGRITO}${CYAN}╚═══════════════════════════════════════╝${RESET}`)

  const args = process.argv.slice(2)

  await verificarCredenciais()

  titulo('Buscando pedidos')
  const pedidos = await buscarPedidosParaEnviar(args)

  if (!pedidos.length) {
    info('Nenhum pedido encontrado para enviar.')
    info('Dica: use --all para enviar todos os confirmados sem código Omie.')
    info('      use --id 123 para um pedido específico.')
    process.exit(0)
  }

  info(`${pedidos.length} pedido(s) encontrado(s).`)

  titulo('Enviando ao Omie')

  for (const pedido of pedidos) {
    await enviarPedido(pedido)
  }

  await resumo(pedidos)

  console.log(`\n${NEGRITO}Concluído.${RESET}\n`)
}

main().catch(err => {
  console.error(`${VERMELHO}Erro fatal:${RESET}`, err)
  process.exit(1)
})
