import { supabase } from './src/supabase.js'
import { log } from './src/logger.js'

// ============================================
// TESTAR SE PRODUTOS DO CRM TÊM CÓDIGOS OMIE VÁLIDOS
// ============================================

async function testarProdutosOmie() {
  log.info('🔍 Testando produtos do CRM com códigos Omie...')
  
  try {
    // 1. Buscar todos produtos ativos
    const { data: produtos, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
    
    if (error) {
      log.error({ error }, '❌ Erro ao buscar produtos')
      throw error
    }
    
    log.info({ total: produtos?.length || 0 }, '📊 Total de produtos ativos')
    
    if (!produtos || produtos.length === 0) {
      log.warn('⚠️ Nenhum produto ativo encontrado')
      return
    }
    
    // 2. Separar produtos com e sem código Omie
    const comCodigo = produtos.filter(p => p.omie_codigo)
    const semCodigo = produtos.filter(p => !p.omie_codigo)
    
    log.info({ 
      comCodigo: comCodigo.length, 
      semCodigo: semCodigo.length 
    }, '📈 Produtos com/sem código Omie')
    
    // 3. Validar formato dos códigos
    const codigosInvalidos = comCodigo.filter(p => !/^\d+$/.test(p.omie_codigo))
    
    if (codigosInvalidos.length > 0) {
      log.warn({ 
        total: codigosInvalidos.length,
        produtos: codigosInvalidos.map(p => ({ id: p.id, nome: p.nome, codigo: p.omie_codigo }))
      }, '⚠️ Produtos com código Omie inválido (não numérico)')
    }
    
    // 4. Mostrar exemplos
    console.log('\n' + '='.repeat(60))
    console.log('📋 RELATÓRIO DE PRODUTOS CRM × OMIE')
    console.log('='.repeat(60))
    
    if (comCodigo.length > 0) {
      console.log('\n✅ PRODUTOS COM CÓDIGO OMIE:')
      comCodigo.slice(0, 10).forEach(p => {
        console.log(`   ID: ${p.id} | ${p.nome} | Código: ${p.omie_codigo}`)
      })
      if (comCodigo.length > 10) {
        console.log(`   ... e mais ${comCodigo.length - 10} produtos`)
      }
    }
    
    if (semCodigo.length > 0) {
      console.log('\n❌ PRODUTOS SEM CÓDIGO OMIE:')
      semCodigo.slice(0, 10).forEach(p => {
        console.log(`   ID: ${p.id} | ${p.nome}`)
      })
      if (semCodigo.length > 10) {
        console.log(`   ... e mais ${semCodigo.length - 10} produtos`)
      }
    }
    
    // 5. Verificar pedido 30 se existir
    const { data: pedido30 } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', 30)
      .single()
    
    if (pedido30) {
      console.log('\n📦 PEDIDO 30:')
      console.log(`   Status: ${pedido30.status}`)
      console.log(`   Cliente ID: ${pedido30.cliente_id}`)
      console.log(`   Valor: R$ ${pedido30.total_valor}`)
      console.log(`   Omie Código: ${pedido30.omie_codigo || 'Não enviado'}`)
      console.log(`   Omie Erro: ${pedido30.omie_erro || 'Sem erro'}`)
      
      // Buscar itens do pedido
      const { data: itens } = await supabase
        .from('itens_pedido')
        .select('*')
        .eq('pedido_id', 30)
      
      if (itens && itens.length > 0) {
        console.log('\n   ITENS DO PEDIDO:')
        for (const item of itens) {
          const produto = produtos.find(p => p.id === item.produto_id)
          console.log(`   - ${item.nomeProduto} (ID: ${item.produto_id})`)
          console.log(`     Quantidade: ${item.quantidade} | Preço: R$ ${item.preco}`)
          console.log(`     Código Omie: ${produto?.omie_codigo || '❌ SEM CÓDIGO'}`)
        }
      } else {
        console.log('   ❌ Pedido não tem itens')
      }
    }
    
    console.log('\n' + '='.repeat(60))
    
    // 6. Recomendações
    if (semCodigo.length > 0) {
      console.log('\n🔧 RECOMENDAÇÕES:')
      console.log('1. Execute o SQL de sincronização: supabase/sync_produtos_omie.sql')
      console.log('2. Isso vai inserir os 101 produtos do Omie com os códigos corretos')
      console.log('3. Depois execute novamente este teste para validar')
    } else {
      console.log('\n✅ Todos os produtos têm código Omie!')
      console.log('Você pode tentar enviar o pedido 30 para o Omie agora.')
    }
    
  } catch (err: any) {
    log.error({ err }, '❌ Erro no teste')
    throw err
  }
}

// Executar teste
testarProdutosOmie()
  .then(() => {
    console.log('\n✅ Teste concluído com sucesso!')
    process.exit(0)
  })
  .catch(err => {
    console.error('\n❌ Erro no teste:', err.message)
    process.exit(1)
  })
