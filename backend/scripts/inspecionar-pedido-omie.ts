/**
 * Inspeciona um pedido real no Omie para conferir:
 * - CFOP de cada item
 * - Peso bruto/líquido de cada item
 * - Código do cliente (CNPJ)
 * - Email, telefone, inscrição estadual do cliente
 * - Código da parcela
 * - Cenário fiscal
 *
 * Uso: railway run npx tsx scripts/inspecionar-pedido-omie.ts --codigo 9682528464
 */

import { omieCall, getOmieCredentials } from '../src/omie/client.js'
import { supabase } from '../src/supabase.js'

const V = '\x1b[32m', R = '\x1b[31m', A = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', RST = '\x1b[0m'
const ok = (m: string) => console.log(`${V}✅ ${m}${RST}`)
const err = (m: string) => console.log(`${R}❌ ${m}${RST}`)
const info = (m: string) => console.log(`${C}ℹ  ${m}${RST}`)
const titulo = (m: string) => console.log(`\n${B}${A}══ ${m} ══${RST}\n`)

async function main() {
  const args = process.argv.slice(2)
  const idxCod = args.indexOf('--codigo')
  const codigoPedido = idxCod !== -1 && args[idxCod + 1] ? parseInt(args[idxCod + 1], 10) : 0

  if (!codigoPedido) {
    err('Use: --codigo <codigo_pedido_omie>')
    process.exit(1)
  }

  const creds = await getOmieCredentials()
  if (!creds) { err('Sem credenciais Omie'); process.exit(1) }

  // 1. Consultar pedido no Omie
  titulo(`Consultando pedido Omie código ${codigoPedido}`)
  let pedido: any
  try {
    pedido = await omieCall<any>(
      '/produtos/pedido/',
      'ConsultarPedido',
      [{ codigo_pedido: codigoPedido }],
      { skipCache: true, credentials: creds }
    )
  } catch (e: any) {
    err(`Erro ao consultar pedido: ${e.message}`)
    process.exit(1)
  }

  // Omie wraps the response in 'pedido_venda_produto'
  const pedidoReal = pedido?.pedido_venda_produto || pedido

  const cab = pedidoReal?.cabecalho || {}
  const det = pedidoReal?.det || []
  const frete = pedidoReal?.frete || {}
  const infAdic = pedidoReal?.informacoes_adicionais || {}
  const parcelas = pedidoReal?.lista_parcelas?.parcela || []

  console.log(`${B}--- CABEÇALHO ---${RST}`)
  console.log(`  codigo_cliente:     ${cab.codigo_cliente}`)
  console.log(`  codigo_parcela:     ${cab.codigo_parcela}`)
  console.log(`  codigo_cenario:     ${cab.codigo_cenario_impostos}`)
  console.log(`  data_previsao:      ${cab.data_previsao}`)
  console.log(`  etapa:              ${cab.etapa}`)
  console.log(`  quantidade_itens:   ${cab.quantidade_itens}`)
  console.log(`  numero_pedido:      ${cab.numero_pedido}`)

  console.log(`\n${B}--- ITENS ---${RST}`)
  for (let i = 0; i < det.length; i++) {
    const item = det[i]
    const prod = item?.produto || {}
    const inf = item?.inf_adic || {}
    console.log(`\n  ${B}Item ${i + 1}:${RST}`)
    console.log(`    codigo_produto:    ${prod.codigo_produto}`)
    console.log(`    descricao:         ${prod.descricao}`)
    console.log(`    unidade:           ${prod.unidade}`)
    console.log(`    cfop:              ${R}${B}${prod.cfop}${RST}`)
    console.log(`    quantidade:        ${prod.quantidade}`)
    console.log(`    valor_unitario:    ${prod.valor_unitario}`)
    console.log(`    ncm:               ${prod.ncm}`)
    console.log(`    peso_bruto:        ${R}${B}${inf.peso_bruto}${RST}`)
    console.log(`    peso_liquido:      ${R}${B}${inf.peso_liquido}${RST}`)
  }

  console.log(`\n${B}--- FRETE ---${RST}`)
  console.log(`  modalidade:         ${frete.modalidade}`)
  console.log(`  quantidade_volumes: ${frete.quantidade_volumes}`)
  console.log(`  especie_volumes:    ${frete.especie_volumes}`)

  console.log(`\n${B}--- INFORMAÇÕES ADICIONAIS ---${RST}`)
  console.log(`  codigo_categoria:   ${infAdic.codigo_categoria}`)
  console.log(`  consumidor_final:   ${infAdic.consumidor_final}`)
  console.log(`  codVend:            ${infAdic.codVend}`)
  console.log(`  codigo_conta:       ${infAdic.codigo_conta_corrente}`)
  if (infAdic.cep_entrega) {
    console.log(`  cep_entrega:        ${infAdic.cep_entrega}`)
    console.log(`  endereco_entrega:   ${infAdic.endereco_entrega}`)
    console.log(`  estado_entrega:     ${infAdic.estado_entrega}`)
  }

  console.log(`\n${B}--- PARCELAS ---${RST}`)
  if (parcelas.length === 0) {
    info('Sem lista_parcelas (à vista)')
  } else {
    for (const p of parcelas) {
      console.log(`  parcela ${p.numero_parcela}: valor=${p.valor_documento} venc=${p.data_vencimento}`)
    }
  }

  // 2. Consultar cliente no Omie pelo código
  const codCliente = cab.codigo_cliente
  if (codCliente) {
    titulo(`Consultando cliente Omie código ${codCliente}`)
    try {
      const cli = await omieCall<any>(
        '/geral/clientes/',
        'ConsultarCliente',
        [{ codigo_cliente_omie: codCliente }],
        { skipCache: true, credentials: creds }
      )
      console.log(`  razao_social:       ${cli?.razao_social}`)
      console.log(`  cnpj_cpf:           ${cli?.cnpj_cpf}`)
      console.log(`  email:              ${R}${B}${cli?.email || '(VAZIO)'}${RST}`)
      console.log(`  telefone1_numero:   ${R}${B}${cli?.telefone1_numero || '(VAZIO)'}${RST}`)
      console.log(`  telefone2_numero:   ${cli?.telefone2_numero || '(VAZIO)'}`)
      console.log(`  inscricao_estadual: ${R}${B}${cli?.inscricao_estadual || '(VAZIO)'}${RST}`)
      console.log(`  estado:             ${cli?.estado}`)
      console.log(`  cidade:             ${cli?.cidade}`)
    } catch (e: any) {
      err(`Erro ao consultar cliente: ${e.message}`)
    }
  }

  // 3. Buscar pedido no CRM para comparar
  titulo('Comparando com CRM')
  const { data: pedCrm } = await supabase
    .from('pedidos')
    .select('*, clientes(razao_social, cnpj, inscricao_estadual, contato_email, contato_telefone, endereco_estado)')
    .eq('omie_codigo', String(codigoPedido))
    .single()

  if (pedCrm) {
    console.log(`  Pedido CRM #${pedCrm.id}`)
    console.log(`  tipo:               ${pedCrm.tipo}`)
    console.log(`  forma_pagamento:    ${pedCrm.forma_pagamento}`)
    console.log(`  tipo_frete:         ${pedCrm.tipo_frete}`)
    console.log(`  total_valor:        ${pedCrm.total_valor}`)
    const cli = pedCrm.clientes
    if (cli) {
      console.log(`\n  ${B}Cliente CRM:${RST}`)
      console.log(`    razao_social:       ${cli.razao_social}`)
      console.log(`    cnpj:               ${cli.cnpj}`)
      console.log(`    inscricao_estadual: ${cli.inscricao_estadual || '(VAZIO)'}`)
      console.log(`    contato_email:      ${cli.contato_email || '(VAZIO)'}`)
      console.log(`    contato_telefone:   ${cli.contato_telefone || '(VAZIO)'}`)
      console.log(`    endereco_estado:    ${cli.endereco_estado}`)
    }

    // Buscar itens do pedido no CRM
    const { data: itensCrm } = await supabase
      .from('itens_pedido')
      .select('*, produtos(nome, unidade, peso_kg, omie_codigo)')
      .eq('pedido_id', pedCrm.id)

    if (itensCrm) {
      console.log(`\n  ${B}Itens CRM:${RST}`)
      for (const it of itensCrm) {
        const prod = it.produtos
        console.log(`    ${prod?.nome}: qtd=${it.quantidade}, unidade=${prod?.unidade}, peso_kg=${prod?.peso_kg}, omie_codigo=${prod?.omie_codigo}`)
        const pesoEsperado = (prod?.unidade || '').toUpperCase() === 'KG'
          ? it.quantidade
          : it.quantidade * (prod?.peso_kg || 0)
        console.log(`      → peso esperado: ${pesoEsperado} kg`)
      }
    }
  } else {
    info('Pedido não encontrado no CRM pelo omie_codigo')
  }

  console.log(`\n${B}Concluído.${RST}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
