import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zeaeppmnetdhzwwdydmq.supabase.co', 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d')

async function verificarProdutosOmie() {
  console.log('🔍 VERIFICANDO PRODUTOS QUE EXISTEM NO OMIE')
  
  try {
    // Login
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'rafael@mfparis.com.br',
      password: 'MFParis2024!',
    })
    
    const token = authData.session.access_token
    console.log('✅ Login OK')

    // Listar produtos do Omie
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
          registros_por_pagina: 50,
          apenas_importado_api: 'N'
        }
      })
    })
    
    const result = await response.json()
    console.log(`Status: ${response.status}`)
    
    if (result.success) {
      const produtos = result.data?.produto_servico_cadastro || []
      console.log(`\n📦 Encontrados ${produtos.length} produtos no Omie:`)
      
      produtos.slice(0, 10).forEach((p: any) => {
        console.log(`  • ${p.codigo_produto}: ${p.descricao}`)
      })
      
      if (produtos.length > 10) {
        console.log(`  ... e mais ${produtos.length - 10} produtos`)
      }
      
      // Verificar se algum dos nossos códigos existe
      console.log('\n🔍 Verificando códigos do CRM:')
      
      const { data: produtosCRM } = await supabase
        .from('produtos')
        .select('omie_codigo, nome')
        .not('omie_codigo', 'is', null)
        .limit(10)
      
      if (produtosCRM) {
        for (const crmProd of produtosCRM) {
          const omieProd = produtos.find((p: any) => 
            p.codigo_produto === parseInt(crmProd.omie_codigo!)
          )
          
          if (omieProd) {
            console.log(`  ✅ ${crmProd.omie_codigo}: ${crmProd.nome} → ${omieProd.descricao}`)
          } else {
            console.log(`  ❌ ${crmProd.omie_codigo}: ${crmProd.nome} → NÃO ENCONTRADO`)
          }
        }
      }
      
    } else {
      console.log('❌ Erro:', result.error)
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral:', err.message)
  }
}

verificarProdutosOmie()
