import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function verificarProdutosExistentes() {
  console.log('🔍 VERIFICANDO PRODUTOS JÁ CADASTRADOS NO OMIE')
  
  try {
    // Login
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'rafael@mfparis.com.br',
      password: 'MFParis2024!',
    })
    
    const token = authData.session.access_token
    console.log('✅ Login OK')

    // Listar TODOS os produtos (sem limite)
    const response = await fetch('https://grupomfparis-production.up.railway.app/api/omie/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        group: 'vendas',
        module: 'produtos',
        action: 'listar',
        params: {
          pagina: 1,
          registros_por_pagina: 500 // Buscar mais produtos
        }
      })
    })
    
    const result = await response.json()
    console.log(`Status: ${response.status}`)
    
    if (result.success) {
      const produtos = result.data?.produto_servico_cadastro || []
      console.log(`📦 Encontrados ${produtos.length} produtos no Omie`)
      
      if (produtos.length > 0) {
        console.log('\n📋 TODOS OS PRODUTOS ENCONTRADOS:')
        produtos.forEach((p: any, index: number) => {
          console.log(`  ${index + 1}. ${p.codigo_produto}: ${p.descricao}`)
        })
        
        // Verificar se algum corresponde aos nossos produtos do CRM
        console.log('\n🔍 VERIFICANDO CORRESPONDÊNCIA COM CRM:')
        
        const { data: produtosCRM } = await supabase
          .from('produtos')
          .select('omie_codigo, nome')
          .not('omie_codigo', 'is', null)
          .limit(20)
        
        if (produtosCRM) {
          let encontrados = 0
          for (const crmProd of produtosCRM) {
            const omieProd = produtos.find((p: any) => 
              p.codigo_produto === parseInt(crmProd.omie_codigo!)
            )
            
            if (omieProd) {
              console.log(`  ✅ ${crmProd.omie_codigo}: ${crmProd.nome} ↔ ${omieProd.descricao}`)
              encontrados++
            }
          }
          
          console.log(`\n📊 RESUMO: ${encontrados}/${produtosCRM.length} produtos do CRM encontrados no Omie`)
          
          if (encontrados === 0) {
            console.log('\n❌ NENHUM produto do CRM corresponde aos produtos do Omie!')
            console.log('\n💡 SOLUÇÕES:')
            console.log('1. Verificar se está usando a conta Omie correta')
            console.log('2. Sincronizar produtos do Omie para o CRM')
            console.log('3. Atualizar códigos Omie no CRM manualmente')
          }
        }
      } else {
        console.log('❌ NENHUM produto encontrado no Omie')
        console.log('\n💡 POSSÍVEIS CAUSAS:')
        console.log('1. Está conectado à conta Omie errada')
        console.log('2. A conta Omie realmente não tem produtos')
        console.log('3. Permissões da API não permitem ver produtos')
        
        console.log('\n🔍 VERIFICANDO DADOS DA CONTA OMIE...')
        
        // Tentar verificar dados da conta
        const response2 = await fetch('https://grupomfparis-production.up.railway.app/api/omie/status', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        
        const result2 = await response2.json()
        console.log('Conta Omie:', JSON.stringify(result2, null, 2))
      }
    } else {
      console.log('❌ Erro ao listar produtos:', result.error)
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

verificarProdutosExistentes()
