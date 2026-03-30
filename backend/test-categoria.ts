import { supabase } from './src/supabase.js'

const categories = ['alimentos', 'bebidas', 'limpeza', 'higiene', 'outros']

async function testCategories() {
  for (const cat of categories) {
    console.log(`Testando categoria: ${cat}`)
    
    const { data, error } = await supabase.from('produtos').insert({
      nome: 'TESTE',
      descricao: 'TESTE',
      categoria: cat,
      preco: 0,
      unidade: 'UN',
      sku: 'TEST',
      ativo: true
    }).select()
    
    if (error) {
      console.log(`❌ ${cat}: ${error.message}`)
    } else {
      console.log(`✅ ${cat}: SUCESSO!`)
      // Limpar produto de teste
      if (data && data.length > 0) {
        await supabase.from('produtos').delete().eq('id', data[0].id)
      }
      break
    }
  }
}

testCategories()
  .then(() => console.log('Teste concluído'))
  .catch(err => console.error('Erro:', err))
