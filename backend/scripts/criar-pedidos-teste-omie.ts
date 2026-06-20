/**
 * Cria pedidos de TESTE reais (venda + bonificação) e envia ao Omie de verdade.
 * Usa cliente e produtos reais do banco. NÃO é mock.
 *
 * Uso (local com .env):
 *   npx tsx scripts/criar-pedidos-teste-omie.ts
 *
 * Uso (com env de produção do Railway):
 *   railway run npx tsx scripts/criar-pedidos-teste-omie.ts
 *
 * Flags:
 *   --cliente <id>     força o cliente a usar
 *   --so-venda         cria apenas pedido de venda
 *   --so-bonificacao   cria apenas pedido de bonificação
 *   --limpar           remove os pedidos de teste criados ao final
 */

import { criarPedidoOmie, consultarPedidoOmie } from '../src/omie/pedidos.js'
import { supabase } from '../src/supabase.js'
import { getOmieCredentials } from '../src/omie/client.js'

const V = '\x1b[32m', R = '\x1b[31m', A = '\x1b[33m', C = '\x1b[36m', RST = '\x1b[0m', B = '\x1b[1m'
const ok = (m: string) => console.log(`${V}✅ ${m}${RST}`)
const err = (m: string) => console.log(`${R}❌ ${m}${RST}`)
const info = (m: string) => console.log(`${C}ℹ  ${m}${RST}`)
const titulo = (m: string) => console.log(`\n${B}${A}══ ${m} ══${RST}\n`)

const args = process.argv.slice(2)
function flagVal(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

async function verificarCredenciais() {
  titulo('Credenciais Omie')
  const creds = await getOmieCredentials()
  if (!creds) {
    err('Credenciais Omie não configuradas no ambiente atual!')
    info('Se rodando local, configure o .env. Para produção use: railway run npx tsx ...')
    process.exit(1)
  }
  ok(`OK — AppKey: ${creds.appKey.slice(0, 8)}...`)
}

async function escolherCliente(): Promise<any> {
  titulo('Selecionando cliente')
  const forcado = flagVal('--cliente')
  if (forcado) {
    const { data } = await supabase.from('clientes').select('*').eq('id', parseInt(forcado, 10)).single()
    if (!data) { err(`Cliente ${forcado} não encontrado.`); process.exit(1) }
    ok(`Cliente forçado: ${data.razao_social} (id ${data.id})`)
    return data
  }

  // Prioridade 1: cliente já vinculado ao Omie (omie_codigo) e com CNPJ
  const { data: comOmie } = await supabase
    .from('clientes')
    .select('*')
    .not('omie_codigo', 'is', null)
    .not('cnpj', 'is', null)
    .limit(1)
  if (comOmie && comOmie.length) {
    ok(`Cliente já no Omie: ${comOmie[0].razao_social} (omie_codigo ${comOmie[0].omie_codigo})`)
    return comOmie[0]
  }

  // Prioridade 2: cliente com CNPJ válido (será criado no Omie)
  const { data: comCnpj } = await supabase
    .from('clientes')
    .select('*')
    .not('cnpj', 'is', null)
    .limit(1)
  if (comCnpj && comCnpj.length) {
    ok(`Cliente com CNPJ: ${comCnpj[0].razao_social} (será criado/encontrado no Omie)`)
    return comCnpj[0]
  }

  err('Nenhum cliente com CNPJ encontrado no banco.')
  process.exit(1)
}

async function escolherProdutos(qtd = 2): Promise<any[]> {
  titulo('Selecionando produtos')
  // Prioridade: produtos já com omie_codigo
  const { data: comOmie } = await supabase
    .from('produtos')
    .select('*')
    .not('omie_codigo', 'is', null)
    .limit(qtd)
  if (comOmie && comOmie.length) {
    comOmie.forEach(p => ok(`Produto: ${p.nome} (omie_codigo ${p.omie_codigo})`))
    return comOmie
  }
  const { data: quaisquer } = await supabase.from('produtos').select('*').limit(qtd)
  if (quaisquer && quaisquer.length) {
    quaisquer.forEach(p => info(`Produto (sem omie_codigo): ${p.nome}`))
    return quaisquer
  }
  err('Nenhum produto encontrado no banco.')
  process.exit(1)
}

async function criarPedido(opts: {
  cliente: any
  produtos: any[]
  tipo: 'venda' | 'bonificacao'
  formaPagamento: string
  tipoFrete: string
}): Promise<number> {
  const { cliente, produtos, tipo, formaPagamento, tipoFrete } = opts
  const isVenda = tipo === 'venda'
  const numero = `TESTE-${tipo === 'venda' ? 'VND' : 'BON'}-${Date.now().toString().slice(-6)}`

  const itensData = produtos.map((p, i) => ({
    produto_id: p.id,
    nome_produto: p.nome,
    sku: p.omie_codigo || p.sku || '',
    unidade: p.unidade || 'UN',
    preco: isVenda ? 100 + i * 50 : 0,
    quantidade: isVenda ? 5 + i : 2,
  }))
  const totalValor = itensData.reduce((s, it) => s + it.preco * it.quantidade, 0)

  const { data: pedido, error: pedErr } = await supabase
    .from('pedidos')
    .insert({
      numero,
      cliente_id: cliente.id,
      vendedor_id: cliente.vendedor_id || null,
      tipo,
      status: 'confirmado', // já aprovado pelo gerente
      total_valor: totalValor,
      forma_pagamento: formaPagamento,
      tipo_frete: tipoFrete,
      observacoes: `Pedido de teste automático (${tipo}) — pode excluir.`,
      data_criacao: new Date().toISOString(),
      data_envio: new Date().toISOString(),
      data_aprovacao: new Date().toISOString(),
    })
    .select()
    .single()

  if (pedErr || !pedido) throw new Error(`Falha ao criar pedido: ${pedErr?.message}`)

  const itensComPedido = itensData.map(it => ({ ...it, pedido_id: pedido.id }))
  const { error: itErr } = await supabase.from('itens_pedido').insert(itensComPedido)
  if (itErr) throw new Error(`Falha ao criar itens: ${itErr.message}`)

  ok(`Pedido #${pedido.id} (${numero}) criado — ${tipo.toUpperCase()} — R$ ${totalValor.toFixed(2)}`)
  return pedido.id
}

async function enviarEConfirmar(pedidoId: number, tipo: string): Promise<boolean> {
  console.log(`\n─────────────────────────────────────────────`)
  console.log(`${B}Enviando pedido #${pedidoId} (${tipo.toUpperCase()}) ao Omie...${RST}`)
  try {
    const res = await criarPedidoOmie(pedidoId)
    ok(`ENVIADO! Código Omie: ${B}${res.codigo_pedido}${RST}${V} | Número: ${res.numero_pedido}`)

    try {
      const status = await consultarPedidoOmie(pedidoId)
      if (status) ok(`Confirmado no Omie: ${(status as any).descricao_status || 'OK'}`)
    } catch (e: any) {
      info(`Consulta de confirmação: ${e.message}`)
    }
    return true
  } catch (e: any) {
    err(`FALHOU: ${e.message}`)
    await supabase.from('pedidos').update({ omie_erro: e.message }).eq('id', pedidoId)
    return false
  }
}

async function limpar(ids: number[]) {
  titulo('Limpando pedidos de teste')
  for (const id of ids) {
    await supabase.from('itens_pedido').delete().eq('pedido_id', id)
    await supabase.from('pedidos').delete().eq('id', id)
    info(`Pedido #${id} removido.`)
  }
}

async function main() {
  console.log(`\n${B}${C}╔════════════════════════════════════════════╗${RST}`)
  console.log(`${B}${C}║   Criar Pedidos de Teste REAIS no Omie     ║${RST}`)
  console.log(`${B}${C}╚════════════════════════════════════════════╝${RST}`)

  await verificarCredenciais()

  const cliente = await escolherCliente()
  const produtos = await escolherProdutos(2)

  const criados: number[] = []
  const resultados: { tipo: string; id: number; sucesso: boolean }[] = []

  const soVenda = args.includes('--so-venda')
  const soBonif = args.includes('--so-bonificacao')
  const vezes = parseInt(flagVal('--vezes') || '1', 10)

  // Variações de pagamento/frete para cobrir mais cenários
  const variacoes = [
    { formaPagamento: 'À vista', tipoFrete: 'CIF' },
    { formaPagamento: '28 dias', tipoFrete: 'FOB' },
    { formaPagamento: '30/60/90 dias', tipoFrete: 'CIF' },
    { formaPagamento: 'À vista', tipoFrete: 'FOB' },
    { formaPagamento: '30 dias', tipoFrete: 'CIF' },
  ]

  const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

  titulo(`Criando e enviando pedidos (${vezes}x cada)`)

  for (let n = 0; n < vezes; n++) {
    const variacao = variacoes[n % variacoes.length]
    console.log(`\n${B}${C}━━━ Rodada ${n + 1}/${vezes} — ${variacao.formaPagamento} / ${variacao.tipoFrete} ━━━${RST}`)

    if (!soBonif) {
      const idVenda = await criarPedido({ cliente, produtos, tipo: 'venda', ...variacao })
      criados.push(idVenda)
      const sucesso = await enviarEConfirmar(idVenda, 'venda')
      resultados.push({ tipo: 'venda', id: idVenda, sucesso })
      await espera(6000) // evita REDUNDANT do Omie
    }

    if (!soVenda) {
      const idBonif = await criarPedido({ cliente, produtos, tipo: 'bonificacao', ...variacao })
      criados.push(idBonif)
      const sucesso = await enviarEConfirmar(idBonif, 'bonificacao')
      resultados.push({ tipo: 'bonificacao', id: idBonif, sucesso })
      await espera(6000)
    }
  }

  titulo('Resumo Final')
  for (const r of resultados) {
    const icon = r.sucesso ? `${V}✅` : `${R}❌`
    console.log(`${icon} ${r.tipo.toUpperCase().padEnd(12)}${RST} pedido #${r.id} → ${r.sucesso ? 'CAIU NO OMIE' : 'FALHOU'}`)
  }

  if (args.includes('--limpar')) {
    await limpar(criados)
  } else {
    info(`\nPedidos de teste mantidos no banco: ${criados.join(', ')}`)
    info(`Para remover: railway run npx tsx scripts/criar-pedidos-teste-omie.ts --limpar`)
  }

  const todosOk = resultados.every(r => r.sucesso)
  console.log(`\n${B}${todosOk ? V + 'TODOS OS PEDIDOS CAÍRAM NO OMIE! ✅' : R + 'ALGUNS PEDIDOS FALHARAM ❌'}${RST}\n`)
  process.exit(todosOk ? 0 : 1)
}

main().catch(e => {
  console.error(`${R}Erro fatal:${RST}`, e)
  process.exit(1)
})
