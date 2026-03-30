import { supabase } from '../src/supabase.js'
import { log } from '../src/logger.js'

// ============================================
// SCRIPT DE VALIDAÇÃO DO SYNC DE PRODUTOS
// Execute: npx tsx scripts/validar-sync-produtos.ts
// ============================================

const PRODUTOS_ESPERADOS_OMIE = [
  '1230005', '1230011', '1230010', '1230028', '1230007', '1230003', '1230009', '1230004', '1230049', '1230032',
  '1230067', '123004', '123003', '12300052', '123080', '123081', '123079', '123078', '1230060', '1230061',
  '1110031', '1110032', '1110055', '1110030', '1110026', '1110028', '123073', '1110078', '1110034', '123071',
  '1110061', '1110049', '1110060', '1120426', '1120016', '1120074', '123058', '123059', '123060', '123074',
  '123075', '123076', '123064', '123069', '123072', '123053', '1120073', '123068', '123070', '123063',
  '1120001', '1120033', '123051', '1120072', '1120056', '1110033', '1230034', '1210055', '12100030', '1210003',
  '1230014', '1230089', '121003', '1230015', '123083', '1230099', '1230100', '1230102', '123077', '1230071',
  '1230029', '1230030', '1230039', '1230031', '1230048', '123049', '1230103', '1230101', '1230064', '1230091',
  '1230017', '1230051', '1230019', '1230062', '1230027', '1230052', '1230018', '1210001', '1210004', '1210003',
  '1210020', '12100019', '1110095', '1230013', '1210015', '1210010', '1210013', '1210008', '1230059', '1230045', '1230078'
]

interface ValidacaoResult {
  totalCrm: number
  totalOmie: number
  produtosComCodigo: number
  produtosSemCodigo: number
  codigosNoCrm: string[]
  codigosFaltantes: string[]
  codigosExtras: string[]
  duplicados: string[]
  erros: string[]
}

async function validarSyncProdutos(): Promise<ValidacaoResult> {
  log.info('🔍 Iniciando validação do sync de produtos...')
  
  const result: ValidacaoResult = {
    totalCrm: 0,
    totalOmie: PRODUTOS_ESPERADOS_OMIE.length,
    produtosComCodigo: 0,
    produtosSemCodigo: 0,
    codigosNoCrm: [],
    codigosFaltantes: [],
    codigosExtras: [],
    duplicados: [],
    erros: []
  }

  try {
    // 1. Buscar todos produtos ativos do CRM
    const { data: produtosCrm, error: errorCrm } = await supabase
      .from('produtos')
      .select('id, nome, omie_codigo, ativo')
      .eq('ativo', true)

    if (errorCrm) {
      result.erros.push(`Erro ao buscar produtos: ${errorCrm.message}`)
      return result
    }

    result.totalCrm = produtosCrm?.length || 0
    log.info({ totalCrm: result.totalCrm }, '📊 Total de produtos ativos no CRM')

    // 2. Analisar códigos
    const codigosVistos = new Set<string>()
    
    for (const prod of produtosCrm || []) {
      if (prod.omie_codigo) {
        result.produtosComCodigo++
        result.codigosNoCrm.push(prod.omie_codigo)
        
        // Verificar duplicados
        if (codigosVistos.has(prod.omie_codigo)) {
          result.duplicados.push(prod.omie_codigo)
        } else {
          codigosVistos.add(prod.omie_codigo)
        }
      } else {
        result.produtosSemCodigo++
      }
    }

    // 3. Identificar códigos faltantes (no Omie, não no CRM)
    result.codigosFaltantes = PRODUTOS_ESPERADOS_OMIE.filter(
      codigo => !result.codigosNoCrm.includes(codigo)
    )

    // 4. Identificar códigos extras (no CRM, não no Omie)
    const codigosOmieSet = new Set(PRODUTOS_ESPERADOS_OMIE)
    result.codigosExtras = result.codigosNoCrm.filter(
      codigo => !codigosOmieSet.has(codigo)
    )

    // 5. Relatório
    log.info({
      totalCrm: result.totalCrm,
      totalOmie: result.totalOmie,
      produtosComCodigo: result.produtosComCodigo,
      produtosSemCodigo: result.produtosSemCodigo,
      codigosFaltantes: result.codigosFaltantes.length,
      codigosExtras: result.codigosExtras.length,
      duplicados: result.duplicados.length,
    }, '📋 Resumo da validação')

    if (result.codigosFaltantes.length > 0) {
      log.warn({ codigos: result.codigosFaltantes }, '⚠️ Códigos Omie NÃO encontrados no CRM')
    }

    if (result.codigosExtras.length > 0) {
      log.warn({ codigos: result.codigosExtras }, '⚠️ Códigos extras no CRM (não estão no Omie)')
    }

    if (result.duplicados.length > 0) {
      log.error({ codigos: result.duplicados }, '❌ Códigos DUPLICADOS no CRM')
    }

    if (result.produtosSemCodigo > 0) {
      log.warn({ count: result.produtosSemCodigo }, '⚠️ Produtos sem código Omie')
    }

    // 6. Validar pedido 30
    await validarPedido30(result)

    return result

  } catch (err: any) {
    result.erros.push(`Erro inesperado: ${err.message}`)
    return result
  }
}

async function validarPedido30(result: ValidacaoResult) {
  try {
    log.info('📦 Validando pedido 30...')

    // Buscar itens do pedido 30
    const { data: itens, error: errorItens } = await supabase
      .from('itens_pedido')
      .select('produto_id, nome_produto, quantidade')
      .eq('pedido_id', 30)

    if (errorItens) {
      result.erros.push(`Erro ao buscar itens do pedido 30: ${errorItens.message}`)
      return
    }

    if (!itens || itens.length === 0) {
      log.warn('Pedido 30 não tem itens')
      return
    }

    log.info({ totalItens: itens.length }, `📦 Pedido 30 tem ${itens.length} item(ns)`)

    // Buscar produtos dos itens
    const produtoIds = itens.map((i: any) => i.produto_id)
    const { data: produtos, error: errorProdutos } = await supabase
      .from('produtos')
      .select('id, nome, omie_codigo')
      .in('id', produtoIds)

    if (errorProdutos) {
      result.erros.push(`Erro ao buscar produtos do pedido 30: ${errorProdutos.message}`)
      return
    }

    // Verificar cada item
    const produtosValidados = itens.map((item: any) => {
      const produto = produtos?.find((p: any) => p.id === item.produto_id)
      return {
        produtoId: item.produto_id,
        nome: item.nome_produto,
        quantidade: item.quantidade,
        omieCodigo: produto?.omie_codigo || null,
        valido: !!produto?.omie_codigo && PRODUTOS_ESPERADOS_OMIE.includes(produto.omie_codigo)
      }
    })

    log.info({ itens: produtosValidados }, '📋 Itens do pedido 30')

    const itensInvalidos = produtosValidados.filter((i: any) => !i.valido)
    if (itensInvalidos.length > 0) {
      log.error({ itens: itensInvalidos }, '❌ Itens com problema no pedido 30')
    } else {
      log.info('✅ Todos os itens do pedido 30 têm códigos Omie válidos!')
    }

  } catch (err: any) {
    result.erros.push(`Erro ao validar pedido 30: ${err.message}`)
  }
}

async function gerarRelatorioFinal(result: ValidacaoResult) {
  console.log('\n' + '='.repeat(60))
  console.log('📊 RELATÓRIO FINAL DE VALIDAÇÃO')
  console.log('='.repeat(60))
  console.log(`
✅ Produtos no CRM:        ${result.totalCrm}
✅ Produtos esperados Omie: ${result.totalOmie}
✅ Produtos com código:     ${result.produtosComCodigo}
⚠️ Produtos sem código:     ${result.produtosSemCodigo}
❌ Códigos faltantes:       ${result.codigosFaltantes.length}
⚠️ Códigos extras:          ${result.codigosExtras.length}
❌ Códigos duplicados:      ${result.duplicados.length}
❌ Erros:                   ${result.erros.length}
`)

  if (result.codigosFaltantes.length > 0) {
    console.log('\n⚠️ CÓDIGOS FALTANTES (executar SQL de sync):')
    result.codigosFaltantes.forEach(c => console.log(`   - ${c}`))
  }

  if (result.codigosExtras.length > 0) {
    console.log('\n⚠️ CÓDIGOS EXTRAS (podem ser deletados):')
    result.codigosExtras.forEach(c => console.log(`   - ${c}`))
  }

  if (result.duplicados.length > 0) {
    console.log('\n❌ CÓDIGOS DUPLICADOS (requer correção manual):')
    result.duplicados.forEach(c => console.log(`   - ${c}`))
  }

  if (result.erros.length > 0) {
    console.log('\n❌ ERROS:')
    result.erros.forEach(e => console.log(`   - ${e}`))
  }

  // Status final
  const sucesso = result.codigosFaltantes.length === 0 && 
                  result.duplicados.length === 0 && 
                  result.erros.length === 0

  if (sucesso) {
    console.log('\n✅ VALIDAÇÃO CONCLUÍDA COM SUCESSO!')
    console.log('   Todos os produtos do Omie estão sincronizados no CRM.')
  } else {
    console.log('\n⚠️ VALIDAÇÃO CONCLUÍDA COM ALERTAS')
    console.log('   Execute o SQL de sincronização para corrigir.')
  }

  console.log('='.repeat(60))
  
  return sucesso
}

// Executar validação
validarSyncProdutos()
  .then(gerarRelatorioFinal)
  .then(sucesso => {
    process.exit(sucesso ? 0 : 1)
  })
  .catch(err => {
    console.error('❌ Erro fatal:', err)
    process.exit(1)
  })
