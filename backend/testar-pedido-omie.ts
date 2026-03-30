import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!)

async function testarPedidoOmie() {
  console.log('🔍 Buscando pedidos para testar...')
  
  try {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('omie_codigo', null)
      .limit(3)
    
    if (error) {
      console.error('❌ Erro ao buscar pedidos:', error)
      return
    }
    
    console.log(`📋 Encontrados ${pedidos.length} pedidos sem Omie:`)
    pedidos.forEach(p => {
      console.log(`  • ID ${p.id}: ${p.numero} - ${p.cliente_nome} (R$ ${p.valor_total})`)
    })
    
    if (pedidos.length > 0) {
      const pedidoTeste = pedidos[0]
      console.log(`\n🚀 Testando envio do pedido ${pedidoTeste.id} para o Omie...`)
      
      try {
        const { criarPedidoOmie } = await import('./src/omie/pedidos.js')
        const resultado = await criarPedidoOmie(pedidoTeste.id)
        console.log('✅ SUCESSO!', resultado)
        console.log(`📊 Pedido criado no Omie com código: ${resultado.codigo_pedido}`)
      } catch (err: any) {
        console.error('❌ ERRO ao enviar para Omie:', err.message)
        console.log('💡 Verifique se as credenciais Omie estão configuradas')
      }
    } else {
      console.log('⚠️ Nenhum pedido disponível para teste')
      console.log('💡 Crie um pedido no CRM primeiro para testar')
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

testarPedidoOmie()
