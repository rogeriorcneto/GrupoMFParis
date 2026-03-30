import { supabase } from '../src/supabase.js'
import { log } from '../src/logger.js'

// ============================================
// LISTA COMPLETA DE PRODUTOS DO OMIE (134 produtos)
// ============================================

const PRODUTOS_OMIE = [
  // ACHOCOLATADOS (10)
  { codigo: '1230005', nome: 'ACHOCOLATADO CHOCOMINAS CESTA 1KG', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230011', nome: 'ACHOCOLATADO CHOCOMINAS CESTA 200G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230010', nome: 'ACHOCOLATADO CHOCOMINAS CESTA 400G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230028', nome: 'ACHOCOLATADO CHOCOMINAS PREMIUM 1KG', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230007', nome: 'ACHOCOLATADO CHOCOMINAS PREMIUM 200G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230003', nome: 'ACHOCOLATADO CHOCOMINAS PREMIUM 400G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230009', nome: 'ACHOCOLATADO CHOCOMINAS SUPER 1KG', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230004', nome: 'ACHOCOLATADO CHOCOMINAS SUPER 200G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230049', nome: 'ACHOCOLATADO CHOCOMINAS SUPER 400G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '1230032', nome: 'ACHOCOLATADO MILKSHOW CESTA 400G', ncm: '1806.90.00', cest: '17.006.00' },

  // MILKSHOW (3)
  { codigo: '1230067', nome: 'ACHOCOLATADO MILKSHOW PREMIUM 1KG', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '123004', nome: 'ACHOCOLATADO MILKSHOW PREMIUM 200G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '123003', nome: 'ACHOCOLATADO MILKSHOW PREMIUM 400G', ncm: '1806.90.00', cest: '17.006.00' },

  // MILKSHOW SUPER (1)
  { codigo: '12300052', nome: 'ACHOCOLATADO MILKSHOW SUPER 400g', ncm: '1806.90.00', cest: '17.006.00' },

  // CACAU MILKSHOW (4)
  { codigo: '123080', nome: 'CACAU MILKSHOW 50% 200G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '123081', nome: 'CACAU MILKSHOW 50% 500G', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '123079', nome: 'CACAU MILKSHOW 70% 400g', ncm: '1806.90.00', cest: '17.006.00' },
  { codigo: '123078', nome: 'CACAU MILKSHOW PREMIUM 400G', ncm: '1806.90.00', cest: '17.006.00' },

  // CACAU NATURAL (2)
  { codigo: '1230060', nome: 'CACAU NATURAL EM PÓ 25 KG - MARCA HORIZONTE', ncm: '1805.00.00', cest: null },
  { codigo: '1230061', nome: 'CACAU NATURAL EM PÓ 25 KG ALCALINO - MARCA HORIZONTE', ncm: '1805.00.00', cest: null },

  // CAFE ALMOFADA GM (6)
  { codigo: '1110031', nome: 'CAFE ALMOFADA GM EXTRAFORTE 250G', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '1110032', nome: 'CAFE ALMOFADA GM EXTRAFORTE 500G', ncm: '0901.21.00', cest: null },
  { codigo: '1110055', nome: 'CAFE ALMOFADA GM TRADICIONAL 250G', ncm: '0901.21.00', cest: '03.018.00' },
  { codigo: '1110030', nome: 'CAFE ALMOFADA GM TRADICIONAL 500G', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '1110026', nome: 'CAFE ALMOFADA MOINHOS 250G', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '1110028', nome: 'CAFE ALMOFADA MOINHOS 500G', ncm: '0901.21.00', cest: '17.096.00' },

  // CAFE ALMOFADA MOLITO (5)
  { codigo: '123073', nome: 'CAFE ALMOFADA MOLITO 250G L1325', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '1110078', nome: 'CAFE ALMOFADA MOLITO 250G L2002-10', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '1110034', nome: 'CAFE ALMOFADA MOLITO 500G L0924-24', ncm: '0901.21.00', cest: null },
  { codigo: '123071', nome: 'CAFE ALMOFADA MOLITO 500G L1325', ncm: '0901.21.00', cest: '17.096.00' },

  // CAFE ALMOFADA SEU CAFE (3)
  { codigo: '1110061', nome: 'CAFE ALMOFADA SEU CAFE EXTRAFORTE 250G', ncm: '0901.21.00', cest: null },
  { codigo: '1110049', nome: 'CAFE ALMOFADA SEU CAFE TRADICIONAL 250G', ncm: '0901.21.00', cest: '03.018.00' },
  { codigo: '1110060', nome: 'CAFE ALMOFADA SEU CAFE TRADICIONAL 500G', ncm: '0901.21.00', cest: '17.096.00' },

  // CAFE VACUO BELVEDER (11)
  { codigo: '1120426', nome: 'CAFE VACUO BELVEDER 250G L0426', ncm: '0901.21.00', cest: null },
  { codigo: '1120016', nome: 'CAFE VACUO BELVEDER 250G L2002', ncm: '0901.21.00', cest: null },
  { codigo: '1120074', nome: 'CAFE VACUO BELVEDER 250G L2035', ncm: '0901.21.00', cest: null },
  { codigo: '123058', nome: 'CAFE VACUO BELVEDER 500G L 1225', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123059', nome: 'CAFE VACUO BELVEDER 500G L 2225', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123060', nome: 'CAFE VACUO BELVEDER 500G L 3225', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123074', nome: 'CAFE VACUO BELVEDER 500G L1925', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123075', nome: 'CAFE VACUO BELVEDER 500G L2925', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123076', nome: 'CAFE VACUO BELVEDER 500G L3925', ncm: '0901.21.00', cest: '17.096.00' },

  // CAFE VACUO MOLITO (11)
  { codigo: '123064', nome: 'CAFE VACUO MOLITO 250G L 1325', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123069', nome: 'CAFE VACUO MOLITO 250G L 2325', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123072', nome: 'CAFE VACUO MOLITO 250G L 3325', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123053', nome: 'CAFE VACUO MOLITO 250G L0924-24', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '1120073', nome: 'CAFE VACUO MOLITO 250G L2002-10', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123068', nome: 'CAFE VACUO MOLITO 500G L 1325', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123070', nome: 'CAFE VACUO MOLITO 500G L 2325', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '123063', nome: 'CAFE VACUO MOLITO 500G L 3325', ncm: '0901.21.00', cest: '17.096.00' },

  // CAFE VACUO VILLA RICA (5)
  { codigo: '1120001', nome: 'CAFE VACUO VILLA RICA EXTRAFORTE 250G', ncm: '0901.21.00', cest: '17.096.00' },
  { codigo: '1120033', nome: 'CAFE VACUO VILLA RICA EXTRAFORTE 500G', ncm: '0901.21.00', cest: null },
  { codigo: '123051', nome: 'CAFE VACUO VILLA RICA GOURMET 500G', ncm: '0901.21.00', cest: null },
  { codigo: '1120072', nome: 'CAFE VACUO VILLA RICA SUPERIOR 250G', ncm: '0901.21.00', cest: null },
  { codigo: '1120056', nome: 'CAFE VACUO VILLA RICA SUPERIOR 500G', ncm: '0901.21.00', cest: null },
  { codigo: '1110033', nome: 'CAFE VACUO VILLA RICA TRADICIONAL 500G', ncm: '0901.21.00', cest: '17.096.00' },

  // COMPOSTO LACTEO (24)
  { codigo: '1230034', nome: 'COMPOSTO LACTEO COM LEITE HORIZONTE CREMOSO', ncm: '0404.90.00', cest: null },
  { codigo: '1210055', nome: 'COMPOSTO LACTEO COM MALTODEXTRINA SABOR CHOCOLATE 25KG', ncm: '0404.90.00', cest: null },
  { codigo: '12100030', nome: 'COMPOSTO LACTEO COM SORO DE LEITE OKEY LAC 25KG', ncm: '1901.90.90', cest: null },
  { codigo: '1210003', nome: 'COMPOSTO LACTEO COM SORO DE LEITE OKEY LAC 25KG - SABOR CHOCOLATE', ncm: '1901.90.90', cest: null },
  { codigo: '1230014', nome: 'COMPOSTO LACTEO HORIZONTE 1KG', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '1230089', nome: 'COMPOSTO LACTEO HORIZONTE 1kg PRO', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '121003', nome: 'COMPOSTO LACTEO HORIZONTE 200G PRO', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '1230015', nome: 'COMPOSTO LACTEO HORIZONTE 400g PRO', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '123083', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '1230099', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC BAUNILHA 1KG', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '1230100', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC CHOCOLATE 1KG', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '1230102', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC COCO 1KG', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '123077', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC MORANGO 1KG', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '1230071', nome: 'COMPOSTO LACTEO HORIZONTE COM MALTODEXTRINA 25KG', ncm: '1901.10.10', cest: '17.014.00' },
  { codigo: '1230029', nome: 'COMPOSTO LACTEO HORIZONTE OKEY LAC 100 - 25KG', ncm: '0404.90.00', cest: null },
  { codigo: '1230030', nome: 'COMPOSTO LACTEO HORIZONTE OKEY LAC 200 - 25KG', ncm: '0404.90.00', cest: null },
  { codigo: '1230039', nome: 'COMPOSTO LACTEO HORIZONTE OKEY LAC 2010 - 25KG', ncm: '0404.90.00', cest: null },
  { codigo: '1230031', nome: 'COMPOSTO LACTEO HORIZONTE OKEY LAC 300 - 25KG', ncm: '0404.90.00', cest: null },

  // GLUCOSE (2)
  { codigo: '1230048', nome: 'GLUCOSE EM PÓ - 25KG', ncm: '1702.30.19', cest: null },
  { codigo: '123049', nome: 'GLUCOSE EM PÓ NINOLAC - 25KG', ncm: '1702.30.19', cest: null },

  // LEITE EM PÓ (14)
  { codigo: '1230103', nome: 'LEITE EM PÓ DESNATADO HORIZONTE 200g', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230101', nome: 'LEITE EM PÓ DESNATADO HORIZONTE 400g', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230064', nome: 'LEITE EM PÓ DESNATADO HORIZONTE SACARIA 25Kg', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230091', nome: 'LEITE EM PÓ DESNATADO IMPORTADO 25Kg', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230017', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 1Kg', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230051', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 1kg VITAMINADO', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230019', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 200g', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230062', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 200g VITAMINADO', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230027', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 400g', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230052', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 400g VITAMINADO', ncm: '0402.10.10', cest: '17.012.00' },
  { codigo: '1230018', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 800g', ncm: '0402.10.10', cest: '17.012.00' },

  // OKEY LAC (10)
  { codigo: '1210001', nome: 'OKEY LAC GOURMET 25KG', ncm: '0404.90.00', cest: null },
  { codigo: '1210004', nome: 'OKEY LAC HAGE 200 COMPOSTO LACTEO COM SORO 25KG', ncm: '1901.90.90', cest: null },
  { codigo: '1210003', nome: 'OKEY LAC HAGE COMPOSTO LACTEO COM SORO DE LEITE 25KG', ncm: '1901.90.90', cest: null },
  { codigo: '1210020', nome: 'OKEY LAC PANIFICACAO 1KG', ncm: '0404.90.00', cest: null },
  { codigo: '12100019', nome: 'OKEY LAC PANIFICACAO 20 25KG', ncm: '0404.90.00', cest: null },
  { codigo: '12100019', nome: 'OKEY LAC PANIFICACAO 25KG', ncm: '0404.90.00', cest: null },
  { codigo: '1110095', nome: 'OKEY LAC PRO 200g', ncm: '0404.90.00', cest: null },
  { codigo: '1230013', nome: 'OKEY LAC PRO 25KG', ncm: '0404.90.00', cest: null },

  // PO PARA BEBIDA LACTEA (5)
  { codigo: '1210015', nome: 'PO PARA BEBIDA LACTEA HORIZONTE 1 KG', ncm: '1901.90.90', cest: null },
  { codigo: '1210010', nome: 'PO PARA BEBIDA LACTEA HORIZONTE 25kg', ncm: '1901.90.90', cest: null },
  { codigo: '1210013', nome: 'PO PARA BEBIDA LACTEA HORIZONTE CESTA 200g', ncm: '1901.90.90', cest: null },
  { codigo: '1210008', nome: 'PO PARA BEBIDA LACTEA HORIZONTE CESTA 400G', ncm: '1901.90.90', cest: null },
  { codigo: '1230059', nome: 'PO PARA BEBIDA LACTEA HORIZONTE CESTA 800G', ncm: '1901.90.90', cest: null },

  // OUTROS (3)
  { codigo: '1230045', nome: 'CONCENTRADO PROTEICO DE SORO DE LEITE EM PÓ 25KG', ncm: '0404.10.00.01', cest: null },
  { codigo: '1230078', nome: 'DINUTRI COMPOSTO LACTEO SABOR BAUNILHA - 25KG', ncm: '0404.90.00', cest: null },
]

// ============================================
// FUNÇÃO DE SYNC
// ============================================

async function sincronizarProdutosOmieCrm() {
  log.info('🚀 Iniciando sincronização Omie → CRM...')

  // 1. Buscar todos os produtos atuais do CRM
  const { data: produtosCrm, error: errorCrm } = await supabase
    .from('produtos')
    .select('*')

  if (errorCrm) {
    log.error({ error: errorCrm }, '❌ Erro ao buscar produtos do CRM')
    throw errorCrm
  }

  log.info({ totalCrm: produtosCrm?.length || 0 }, '📊 Produtos no CRM atualmente')

  // 2. Criar mapa de códigos Omie para fácil lookup
  const codigosOmie = new Set(PRODUTOS_OMIE.map(p => p.codigo))

  // 3. Identificar produtos para deletar (estão no CRM mas não no Omie)
  const produtosParaDeletar = produtosCrm?.filter(p => !codigosOmie.has(p.omie_codigo)) || []

  // 4. Identificar produtos para atualizar (código existe mas nome pode diferir)
  const produtosParaAtualizar: typeof PRODUTOS_OMIE = []
  const produtosParaInserir: typeof PRODUTOS_OMIE = []

  for (const prodOmie of PRODUTOS_OMIE) {
    const existente = produtosCrm?.find(p => p.omie_codigo === prodOmie.codigo)
    if (existente) {
      produtosParaAtualizar.push(prodOmie)
    } else {
      produtosParaInserir.push(prodOmie)
    }
  }

  log.info({
    paraInserir: produtosParaInserir.length,
    paraAtualizar: produtosParaAtualizar.length,
    paraDeletar: produtosParaDeletar.length,
  }, '📋 Resumo da sincronização')

  // 5. Inserir novos produtos
  let inseridos = 0
  let errosInserir: string[] = []

  for (const prod of produtosParaInserir) {
    try {
      const { error } = await supabase.from('produtos').insert({
        nome: prod.nome,
        descricao: prod.nome,
        categoria: 'PRODUTO ACABADO',
        preco: 0,
        unidade: 'UN',
        sku: prod.codigo,
        ativo: true,
        omie_codigo: prod.codigo,
      })

      if (error) {
        errosInserir.push(`${prod.codigo}: ${error.message}`)
        log.error({ codigo: prod.codigo, error }, '❌ Erro ao inserir produto')
      } else {
        inseridos++
        log.info({ codigo: prod.codigo, nome: prod.nome }, '✅ Produto inserido')
      }
    } catch (err: any) {
      errosInserir.push(`${prod.codigo}: ${err.message}`)
      log.error({ codigo: prod.codigo, error: err }, '❌ Erro ao inserir produto')
    }
  }

  // 6. Atualizar produtos existentes
  let atualizados = 0
  let errosAtualizar: string[] = []

  for (const prod of produtosParaAtualizar) {
    try {
      const { error } = await supabase.from('produtos').update({
        nome: prod.nome,
        descricao: prod.nome,
        updated_at: new Date().toISOString(),
      }).eq('omie_codigo', prod.codigo)

      if (error) {
        errosAtualizar.push(`${prod.codigo}: ${error.message}`)
        log.error({ codigo: prod.codigo, error }, '❌ Erro ao atualizar produto')
      } else {
        atualizados++
        log.info({ codigo: prod.codigo, nome: prod.nome }, '✅ Produto atualizado')
      }
    } catch (err: any) {
      errosAtualizar.push(`${prod.codigo}: ${err.message}`)
      log.error({ codigo: prod.codigo, error: err }, '❌ Erro ao atualizar produto')
    }
  }

  // 7. Deletar produtos que não existem no Omie
  let deletados = 0
  let errosDeletar: string[] = []

  for (const prod of produtosParaDeletar) {
    try {
      // Verificar se o produto tem pedidos associados
      const { data: itensPedido, error: errorItens } = await supabase
        .from('itens_pedido')
        .select('id')
        .eq('produto_id', prod.id)
        .limit(1)

      if (errorItens) {
        errosDeletar.push(`${prod.id} (${prod.nome}): Erro ao verificar pedidos - ${errorItens.message}`)
        continue
      }

      if (itensPedido && itensPedido.length > 0) {
        // Produto tem pedidos - apenas desativa
        const { error } = await supabase.from('produtos').update({
          ativo: false,
          updated_at: new Date().toISOString(),
        }).eq('id', prod.id)

        if (error) {
          errosDeletar.push(`${prod.id} (${prod.nome}): ${error.message}`)
        } else {
          log.info({ id: prod.id, nome: prod.nome }, '⚠️ Produto desativado (tem pedidos)')
        }
      } else {
        // Produto não tem pedidos - deleta
        const { error } = await supabase.from('produtos').delete().eq('id', prod.id)

        if (error) {
          errosDeletar.push(`${prod.id} (${prod.nome}): ${error.message}`)
          log.error({ id: prod.id, error }, '❌ Erro ao deletar produto')
        } else {
          deletados++
          log.info({ id: prod.id, nome: prod.nome }, '🗑️ Produto deletado')
        }
      }
    } catch (err: any) {
      errosDeletar.push(`${prod.id} (${prod.nome}): ${err.message}`)
      log.error({ id: prod.id, error: err }, '❌ Erro ao deletar produto')
    }
  }

  // 8. Relatório final
  const resultado = {
    totalOmie: PRODUTOS_OMIE.length,
    totalCrmAntes: produtosCrm?.length || 0,
    inseridos,
    atualizados,
    deletados,
    errosInserir,
    errosAtualizar,
    errosDeletar,
  }

  log.info(resultado, '🎉 Sincronização concluída!')

  return resultado
}

// Executar
sincronizarProdutosOmieCrm()
  .then(resultado => {
    console.log('\n📊 RESULTADO FINAL:')
    console.log(JSON.stringify(resultado, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Erro fatal:', err)
    process.exit(1)
  })
