import { supabase } from './src/supabase.js'
import { log } from './src/logger.js'

// ============================================
// TESTE COMPLETO: PRODUTOS CRM × PRODUTOS OMIE (SUAS IMAGENS)
// Validar se os produtos do CRM são EXATAMENTE os mesmos do Omie
// ============================================

// Lista completa extraída das suas imagens do Omie
const PRODUTOS_OMIE_OFICIAIS = [
  // ACHOCOLATADOS (10)
  { codigo: '1230005', nome: 'ACHOCOLATADO CHOCOMINAS CESTA 1KG' },
  { codigo: '1230011', nome: 'ACHOCOLATADO CHOCOMINAS CESTA 200G' },
  { codigo: '1230010', nome: 'ACHOCOLATADO CHOCOMINAS CESTA 400G' },
  { codigo: '1230028', nome: 'ACHOCOLATADO CHOCOMINAS PREMIUM 1KG' },
  { codigo: '1230007', nome: 'ACHOCOLATADO CHOCOMINAS PREMIUM 200G' },
  { codigo: '1230003', nome: 'ACHOCOLATADO CHOCOMINAS PREMIUM 400G' },
  { codigo: '1230009', nome: 'ACHOCOLATADO CHOCOMINAS SUPER 1KG' },
  { codigo: '1230004', nome: 'ACHOCOLATADO CHOCOMINAS SUPER 200G' },
  { codigo: '1230049', nome: 'ACHOCOLATADO CHOCOMINAS SUPER 400G' },
  { codigo: '1230032', nome: 'ACHOCOLATADO MILKSHOW CESTA 400G' },

  // MILKSHOW (3)
  { codigo: '1230067', nome: 'ACHOCOLATADO MILKSHOW PREMIUM 1KG' },
  { codigo: '123004', nome: 'ACHOCOLATADO MILKSHOW PREMIUM 200G' },
  { codigo: '123003', nome: 'ACHOCOLATADO MILKSHOW PREMIUM 400G' },

  // MILKSHOW SUPER (1)
  { codigo: '12300052', nome: 'ACHOCOLATADO MILKSHOW SUPER 400g' },

  // CACAU MILKSHOW (4)
  { codigo: '123080', nome: 'CACAU MILKSHOW 50% 200G' },
  { codigo: '123081', nome: 'CACAU MILKSHOW 50% 500G' },
  { codigo: '123079', nome: 'CACAU MILKSHOW 70% 400g' },
  { codigo: '123078', nome: 'CACAU MILKSHOW PREMIUM 400G' },

  // CACAU NATURAL (2)
  { codigo: '1230060', nome: 'CACAU NATURAL EM PÓ 25 KG - MARCA HORIZONTE' },
  { codigo: '1230061', nome: 'CACAU NATURAL EM PÓ 25 KG ALCALINO - MARCA HORIZONTE' },

  // CAFE ALMOFADA GM (6)
  { codigo: '1110031', nome: 'CAFE ALMOFADA GM EXTRAFORTE 250G' },
  { codigo: '1110032', nome: 'CAFE ALMOFADA GM EXTRAFORTE 500G' },
  { codigo: '1110055', nome: 'CAFE ALMOFADA GM TRADICIONAL 250G' },
  { codigo: '1110030', nome: 'CAFE ALMOFADA GM TRADICIONAL 500G' },
  { codigo: '1110026', nome: 'CAFE ALMOFADA MOINHOS 250G' },
  { codigo: '1110028', nome: 'CAFE ALMOFADA MOINHOS 500G' },

  // CAFE ALMOFADA MOLITO (5)
  { codigo: '123073', nome: 'CAFE ALMOFADA MOLITO 250G L1325' },
  { codigo: '1110078', nome: 'CAFE ALMOFADA MOLITO 250G L2002-10' },
  { codigo: '1110034', nome: 'CAFE ALMOFADA MOLITO 500G L0924-24' },
  { codigo: '123071', nome: 'CAFE ALMOFADA MOLITO 500G L1325' },

  // CAFE ALMOFADA SEU CAFE (3)
  { codigo: '1110061', nome: 'CAFE ALMOFADA SEU CAFE EXTRAFORTE 250G' },
  { codigo: '1110049', nome: 'CAFE ALMOFADA SEU CAFE TRADICIONAL 250G' },
  { codigo: '1110060', nome: 'CAFE ALMOFADA SEU CAFE TRADICIONAL 500G' },

  // CAFE VACUO BELVEDER (11)
  { codigo: '1120426', nome: 'CAFE VACUO BELVEDER 250G L0426' },
  { codigo: '1120016', nome: 'CAFE VACUO BELVEDER 250G L2002' },
  { codigo: '1120074', nome: 'CAFE VACUO BELVEDER 250G L2035' },
  { codigo: '123058', nome: 'CAFE VACUO BELVEDER 500G L 1225' },
  { codigo: '123059', nome: 'CAFE VACUO BELVEDER 500G L 2225' },
  { codigo: '123060', nome: 'CAFE VACUO BELVEDER 500G L 3225' },
  { codigo: '123074', nome: 'CAFE VACUO BELVEDER 500G L1925' },
  { codigo: '123075', nome: 'CAFE VACUO BELVEDER 500G L2925' },
  { codigo: '123076', nome: 'CAFE VACUO BELVEDER 500G L3925' },

  // CAFE VACUO MOLITO (11)
  { codigo: '123064', nome: 'CAFE VACUO MOLITO 250G L 1325' },
  { codigo: '123069', nome: 'CAFE VACUO MOLITO 250G L 2325' },
  { codigo: '123072', nome: 'CAFE VACUO MOLITO 250G L 3325' },
  { codigo: '123053', nome: 'CAFE VACUO MOLITO 250G L0924-24' },
  { codigo: '1120073', nome: 'CAFE VACUO MOLITO 250G L2002-10' },
  { codigo: '123068', nome: 'CAFE VACUO MOLITO 500G L 1325' },
  { codigo: '123070', nome: 'CAFE VACUO MOLITO 500G L 2325' },
  { codigo: '123063', nome: 'CAFE VACUO MOLITO 500G L 3325' },

  // CAFE VACUO VILLA RICA (5)
  { codigo: '1120001', nome: 'CAFE VACUO VILLA RICA EXTRAFORTE 250G' },
  { codigo: '1120033', nome: 'CAFE VACUO VILLA RICA EXTRAFORTE 500G' },
  { codigo: '123051', nome: 'CAFE VACUO VILLA RICA GOURMET 500G' },
  { codigo: '1120072', nome: 'CAFE VACUO VILLA RICA SUPERIOR 250G' },
  { codigo: '1120056', nome: 'CAFE VACUO VILLA RICA SUPERIOR 500G' },
  { codigo: '1110033', nome: 'CAFE VACUO VILLA RICA TRADICIONAL 500G' },

  // COMPOSTO LACTEO (24)
  { codigo: '1230034', nome: 'COMPOSTO LACTEO COM LEITE HORIZONTE CREMOSO' },
  { codigo: '1210055', nome: 'COMPOSTO LACTEO COM MALTODEXTRINA SABOR CHOCOLATE 25KG' },
  { codigo: '12100030', nome: 'COMPOSTO LACTEO COM SORO DE LEITE OKEY LAC 25KG' },
  { codigo: '1210003', nome: 'COMPOSTO LACTEO COM SORO DE LEITE OKEY LAC 25KG - SABOR CHOCOLATE' },
  { codigo: '1230014', nome: 'COMPOSTO LACTEO HORIZONTE 1KG' },
  { codigo: '1230089', nome: 'COMPOSTO LACTEO HORIZONTE 1kg PRO' },
  { codigo: '121003', nome: 'COMPOSTO LACTEO HORIZONTE 200G PRO' },
  { codigo: '1230015', nome: 'COMPOSTO LACTEO HORIZONTE 400g PRO' },
  { codigo: '123083', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC' },
  { codigo: '1230099', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC BAUNILHA 1KG' },
  { codigo: '1230100', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC CHOCOLATE 1KG' },
  { codigo: '1230102', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC COCO 1KG' },
  { codigo: '123077', nome: 'COMPOSTO LACTEO HORIZONTE ALIMLAC MORANGO 1KG' },
  { codigo: '1230071', nome: 'COMPOSTO LACTEO HORIZONTE COM MALTODEXTRINA 25KG' },
  { codigo: '1230029', nome: 'COMPOSTO LACTEO HORIZONTE OKEY LAC 100 - 25KG' },
  { codigo: '1230030', nome: 'COMPOSTO LACTEO HORIZONTE OKEY LAC 200 - 25KG' },
  { codigo: '1230039', nome: 'COMPOSTO LACTEO HORIZONTE OKEY LAC 2010 - 25KG' },
  { codigo: '1230031', nome: 'COMPOSTO LACTEO HORIZONTE OKEY LAC 300 - 25KG' },

  // GLUCOSE (2)
  { codigo: '1230048', nome: 'GLUCOSE EM PÓ - 25KG' },
  { codigo: '123049', nome: 'GLUCOSE EM PÓ NINOLAC - 25KG' },

  // LEITE EM PÓ (14)
  { codigo: '1230103', nome: 'LEITE EM PÓ DESNATADO HORIZONTE 200g' },
  { codigo: '1230101', nome: 'LEITE EM PÓ DESNATADO HORIZONTE 400g' },
  { codigo: '1230064', nome: 'LEITE EM PÓ DESNATADO HORIZONTE SACARIA 25Kg' },
  { codigo: '1230091', nome: 'LEITE EM PÓ DESNATADO IMPORTADO 25Kg' },
  { codigo: '1230017', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 1Kg' },
  { codigo: '1230051', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 1kg VITAMINADO' },
  { codigo: '1230019', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 200g' },
  { codigo: '1230062', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 200g VITAMINADO' },
  { codigo: '1230027', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 400g' },
  { codigo: '1230052', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 400g VITAMINADO' },
  { codigo: '1230018', nome: 'LEITE EM PÓ INTEGRAL HORIZONTE 800g' },

  // OKEY LAC (10)
  { codigo: '1210001', nome: 'OKEY LAC GOURMET 25KG' },
  { codigo: '1210004', nome: 'OKEY LAC HAGE 200 COMPOSTO LACTEO COM SORO 25KG' },
  { codigo: '1210003', nome: 'OKEY LAC HAGE COMPOSTO LACTEO COM SORO DE LEITE 25KG' },
  { codigo: '1210020', nome: 'OKEY LAC PANIFICACAO 1KG' },
  { codigo: '12100019', nome: 'OKEY LAC PANIFICACAO 20 25KG' },
  { codigo: '1110095', nome: 'OKEY LAC PRO 200g' },
  { codigo: '1230013', nome: 'OKEY LAC PRO 25KG' },

  // PO PARA BEBIDA LACTEA (5)
  { codigo: '1210015', nome: 'PO PARA BEBIDA LACTEA HORIZONTE 1 KG' },
  { codigo: '1210010', nome: 'PO PARA BEBIDA LACTEA HORIZONTE 25kg' },
  { codigo: '1210013', nome: 'PO PARA BEBIDA LACTEA HORIZONTE CESTA 200g' },
  { codigo: '1210008', nome: 'PO PARA BEBIDA LACTEA HORIZONTE CESTA 400G' },
  { codigo: '1230059', nome: 'PO PARA BEBIDA LACTEA HORIZONTE CESTA 800G' },

  // OUTROS (3)
  { codigo: '1230045', nome: 'CONCENTRADO PROTEICO DE SORO DE LEITE EM PÓ 25KG' },
  { codigo: '1230078', nome: 'DINUTRI COMPOSTO LACTEO SABOR BAUNILHA - 25KG' },
]

async function validarProdutosCrmOmie() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 VALIDAÇÃO COMPLETA: PRODUTOS CRM × PRODUTOS OMIE OFICIAIS')
  console.log('='.repeat(80))
  
  try {
    // 1. Buscar todos produtos ativos do CRM
    const { data: produtosCrm, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
    
    if (error) {
      console.error('❌ Erro ao buscar produtos CRM:', error.message)
      throw error
    }
    
    console.log(`\n📊 Total produtos ativos no CRM: ${produtosCrm?.length || 0}`)
    console.log(`📊 Total produtos oficiais Omie: ${PRODUTOS_OMIE_OFICIAIS.length}`)
    
    // 2. Criar mapa dos produtos Omie oficiais
    const mapaOmie = new Map(PRODUTOS_OMIE_OFICIAIS.map(p => [p.codigo, p.nome]))
    
    // 3. Análise detalhada
    const analise = {
      produtosCrm: produtosCrm || [],
      codigosOmieNoCrm: [] as Array<{codigo: string, nome: string, crmId?: number, crmNome?: string}>,
      codigosCrmNaoNoOmie: [] as Array<{id: number, nome: string, codigo: string}>,
      produtosSemCodigo: [] as Array<{id: number, nome: string}>,
      correspondenciasPerfeitas: [] as Array<{crmId: number, crmNome: string, omieCodigo: string, omieNome: string}>,
      nomesDiferentes: [] as Array<{crmId: number, crmNome: string, omieCodigo: string, omieNome: string}>
    }
    
    // 4. Analisar cada produto do CRM
    for (const prodCrm of analise.produtosCrm) {
      if (!prodCrm.omie_codigo) {
        analise.produtosSemCodigo.push({
          id: prodCrm.id,
          nome: prodCrm.nome
        })
        continue
      }
      
      const nomeOmieOficial = mapaOmie.get(prodCrm.omie_codigo)
      
      if (nomeOmieOficial) {
        // Produto tem código Omie válido
        if (prodCrm.nome.toUpperCase().trim() === nomeOmieOficial.toUpperCase().trim()) {
          analise.correspondenciasPerfeitas.push({
            crmId: prodCrm.id,
            crmNome: prodCrm.nome,
            omieCodigo: prodCrm.omie_codigo,
            omieNome: nomeOmieOficial
          })
        } else {
          analise.nomesDiferentes.push({
            crmId: prodCrm.id,
            crmNome: prodCrm.nome,
            omieCodigo: prodCrm.omie_codigo,
            omieNome: nomeOmieOficial
          })
        }
        
        analise.codigosOmieNoCrm.push({
          codigo: prodCrm.omie_codigo,
          nome: nomeOmieOficial,
          crmId: prodCrm.id,
          crmNome: prodCrm.nome
        })
      } else {
        // Código não existe na lista oficial
        analise.codigosCrmNaoNoOmie.push({
          id: prodCrm.id,
          nome: prodCrm.nome,
          codigo: prodCrm.omie_codigo
        })
      }
    }
    
    // 5. Identificar códigos Omie que não estão no CRM
    const codigosOmieFaltantes = PRODUTOS_OMIE_OFICIAIS.filter(
      p => !analise.codigosOmieNoCrm.find(c => c.codigo === p.codigo)
    )
    
    // 6. Relatório completo
    console.log('\n' + '='.repeat(80))
    console.log('📋 RELATÓRIO DETALHADO DA VALIDAÇÃO')
    console.log('='.repeat(80))
    
    console.log(`\n✅ CORRESPONDÊNCIAS PERFEITAS: ${analise.correspondenciasPerfeitas.length}`)
    if (analise.correspondenciasPerfeitas.length > 0) {
      analise.correspondenciasPerfeitas.slice(0, 5).forEach(p => {
        console.log(`   ✓ CRM ID ${p.crmId}: "${p.crmNome}" ↔ Omie ${p.omieCodigo}: "${p.omieNome}"`)
      })
      if (analise.correspondenciasPerfeitas.length > 5) {
        console.log(`   ... e mais ${analise.correspondenciasPerfeitas.length - 5} produtos`)
      }
    }
    
    console.log(`\n⚠️ NOMES DIFERENTES (mesmo código): ${analise.nomesDiferentes.length}`)
    if (analise.nomesDiferentes.length > 0) {
      analise.nomesDiferentes.forEach(p => {
        console.log(`   ⚠️ CRM: "${p.crmNome}" | Omie: "${p.omieNome}" (código: ${p.omieCodigo})`)
      })
    }
    
    console.log(`\n❌ CÓDIGOS CRM NÃO EXISTEM NO OMIE: ${analise.codigosCrmNaoNoOmie.length}`)
    if (analise.codigosCrmNaoNoOmie.length > 0) {
      analise.codigosCrmNaoNoOmie.forEach(p => {
        console.log(`   ❌ CRM ID ${p.id}: "${p.nome}" (código inválido: ${p.codigo})`)
      })
    }
    
    console.log(`\n❌ PRODUTOS CRM SEM CÓDIGO OMIE: ${analise.produtosSemCodigo.length}`)
    if (analise.produtosSemCodigo.length > 0) {
      analise.produtosSemCodigo.slice(0, 10).forEach(p => {
        console.log(`   ❌ CRM ID ${p.id}: "${p.nome}"`)
      })
      if (analise.produtosSemCodigo.length > 10) {
        console.log(`   ... e mais ${analise.produtosSemCodigo.length - 10} produtos`)
      }
    }
    
    console.log(`\n❌ CÓDIGOS OMIE FALTANTES NO CRM: ${codigosOmieFaltantes.length}`)
    if (codigosOmieFaltantes.length > 0) {
      codigosOmieFaltantes.slice(0, 10).forEach(p => {
        console.log(`   ❌ Omie ${p.codigo}: "${p.nome}"`)
      })
      if (codigosOmieFaltantes.length > 10) {
        console.log(`   ... e mais ${codigosOmieFaltantes.length - 10} produtos`)
      }
    }
    
    // 7. Verificação crítica: produtos importantes que faltam
    const produtosCriticos = PRODUTOS_OMIE_OFICIAIS.filter(p => 
      p.nome.includes('OKEY LAC') || 
      p.nome.includes('LEITE EM PÓ') ||
      p.nome.includes('CHOCOMINAS')
    )
    
    const criticosFaltantes = produtosCriticos.filter(p =>
      !analise.codigosOmieNoCrm.find(c => c.codigo === p.codigo)
    )
    
    if (criticosFaltantes.length > 0) {
      console.log('\n🚨 PRODUTOS CRÍTICOS FALTANTES:')
      criticosFaltantes.forEach(p => {
        console.log(`   🚨 ${p.codigo}: "${p.nome}"`)
      })
    }
    
    // 8. Conclusão
    console.log('\n' + '='.repeat(80))
    console.log('🎯 CONCLUSÃO')
    console.log('='.repeat(80))
    
    const totalOmieOficiais = PRODUTOS_OMIE_OFICIAIS.length
    const sincronizados = analise.codigosOmieNoCrm.length
    const percentualSincronizado = ((sincronizados / totalOmieOficiais) * 100).toFixed(1)
    
    console.log(`\n📈 SINCRONIZAÇÃO: ${sincronizados}/${totalOmieOficiais} (${percentualSincronizado}%)`)
    
    if (analise.correspondenciasPerfeitas.length === totalOmieOficiais) {
      console.log('\n✅ PERFEITO! Todos os produtos do Omie estão sincronizados no CRM com nomes idênticos!')
    } else if (sincronizados >= totalOmieOficiais * 0.8) {
      console.log('\n⚠️ BOM! Mais de 80% sincronizado, mas ainda há ajustes necessários.')
    } else {
      console.log('\n❌ CRÍTICO! Menos de 80% sincronizado. Execute o SQL de sincronização.')
    }
    
    console.log('\n🔧 AÇÕES RECOMENDADAS:')
    if (codigosOmieFaltantes.length > 0) {
      console.log('1. Execute: supabase/sync_produtos_omie.sql (para inserir produtos faltantes)')
    }
    if (analise.codigosCrmNaoNoOmie.length > 0) {
      console.log('2. Verifique produtos com códigos inválidos (podem ser deletados)')
    }
    if (analise.produtosSemCodigo.length > 0) {
      console.log('3. Produtos sem código serão substituídos pelos oficiais do Omie')
    }
    
    return {
      sucesso: analise.correspondenciasPerfeitas.length === totalOmieOficiais,
      sincronizados,
      totalOmieOficiais,
      percentualSincronizado,
      analise
    }
    
  } catch (err: any) {
    console.error('\n❌ Erro na validação:', err.message)
    throw err
  }
}

// Executar validação completa
validarProdutosCrmOmie()
  .then(resultado => {
    console.log('\n✅ Validação concluída!')
    process.exit(resultado.sucesso ? 0 : 1)
  })
  .catch(err => {
    console.error('\n❌ Erro fatal:', err.message)
    process.exit(1)
  })
