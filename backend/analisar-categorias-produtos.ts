import { createClient } from '@supabase/supabase-js'

// Configuração Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Categorias permitidas pela constraint
const CATEGORIAS_PERMITIDAS = ['sacaria', 'okey_lac', 'varejo_lacteo', 'cafe', 'outros']

// Regras inteligentes de categorização baseadas no nome do produto
const REGRAS_CATEGORIA = [
  // CAFÉ - qualquer produto que contenha "CAFE" no nome
  {
    categoria: 'cafe',
    palavras_chave: ['CAFE', 'CAFÉ'],
    exclusoes: [] // Nenhuma exclusão para café
  },
  
  // OKEY LAC - produtos que contêm "OKEY LAC" ou são compostos lácteos de 25KG
  {
    categoria: 'okey_lac',
    palavras_chave: ['OKEY LAC'],
    exclusoes: []
  },
  {
    categoria: 'okey_lac',
    palavras_chave: ['COMPOSTO LACTEO'],
    condicoes: [(nome: string) => nome.includes('25KG')], // Só se for 25KG
    exclusoes: ['HORIZONTE'] // Excluir os que são da marca Horizon
  },
  
  // SACARIA - Leites em pó de 25KG e produtos a granel
  {
    categoria: 'sacaria',
    palavras_chave: ['LEITE EM PÓ'],
    condicoes: [(nome: string) => nome.includes('25KG')],
    exclusoes: []
  },
  {
    categoria: 'sacaria',
    palavras_chave: ['IMPORTADO'],
    exclusoes: []
  },
  
  // VAREJO LÁCTEO - Achocolatados, leites em pó pequenos, compostos lácteos de varejo
  {
    categoria: 'varejo_lacteo',
    palavras_chave: ['ACHOCOLATADO', 'CHOCOMINAS', 'MILKSHOW'],
    exclusoes: []
  },
  {
    categoria: 'varejo_lacteo',
    palavras_chave: ['LEITE EM PÓ'],
    condicoes: [(nome: string) => !nome.includes('25KG')], // Só se NÃO for 25KG
    exclusoes: []
  },
  {
    categoria: 'varejo_lacteo',
    palavras_chave: ['COMPOSTO LACTEO', 'HORIZONTE'],
    condicoes: [(nome: string) => !nome.includes('25KG')], // Só se NÃO for 25KG
    exclusoes: []
  },
  {
    categoria: 'varejo_lacteo',
    palavras_chave: ['PO PARA BEBIDA LACTEA'],
    exclusoes: []
  },
  {
    categoria: 'varejo_lacteo',
    palavras_chave: ['OKEY LAC'],
    condicoes: [(nome: string) => !nome.includes('25KG')], // Só se NÃO for 25KG
    exclusoes: []
  },
  
  // OUTROS - Cacau, glucose, concentrado proteico
  {
    categoria: 'outros',
    palavras_chave: ['CACAU', 'GLUCOSE', 'CONCENTRADO PROTEICO', 'DINUTRI'],
    exclusoes: []
  }
]

// Função para determinar categoria automaticamente
function determinarCategoriaAutomatica(nomeProduto: string): string {
  const nomeUpper = nomeProduto.toUpperCase()
  
  for (const regra of REGRAS_CATEGORIA) {
    // Verificar se contém alguma palavra-chave
    const temPalavraChave = regra.palavras_chave.some(palavra => 
      nomeUpper.includes(palavra.toUpperCase())
    )
    
    if (!temPalavraChave) continue
    
    // Verificar exclusões
    const temExclusao = regra.exclusoes.some(exclusao => 
      nomeUpper.includes(exclusao.toUpperCase())
    )
    
    if (temExclusao) continue
    
    // Verificar condições adicionais
    if (regra.condicoes) {
      const condicoesAtendidas = regra.condicoes.every(condicao => 
        condicao(nomeUpper)
      )
      
      if (!condicoesAtendidas) continue
    }
    
    return regra.categoria
  }
  
  // Se nenhuma regra se aplicar, usar 'outros' como padrão
  return 'outros'
}

// Função principal de análise
async function analisarCategoriasProdutos() {
  console.log('🔍 Analisando categorias dos produtos...')
  
  try {
    // Buscar todos os produtos
    const { data: produtos, error } = await supabase
      .from('produtos')
      .select('*')
    
    if (error) {
      console.error('❌ Erro ao buscar produtos:', error)
      return
    }
    
    console.log(`📊 Encontrados ${produtos.length} produtos`)
    
    // Análise detalhada
    const analise = {
      total: produtos.length,
      porCategoria: {} as Record<string, number>,
      detalhes: [] as Array<{
        nome: string
        categoriaSugerida: string
        categoriaAtual?: string
        precisaAtualizar: boolean
      }>
    }
    
    // Inicializar contadores
    CATEGORIAS_PERMITIDAS.forEach(cat => {
      analise.porCategoria[cat] = 0
    })
    
    // Analisar cada produto
    for (const produto of produtos) {
      const categoriaSugerida = determinarCategoriaAutomatica(produto.nome)
      const categoriaAtual = produto.categoria
      const precisaAtualizar = categoriaAtual !== categoriaSugerida
      
      analise.porCategoria[categoriaSugerida]++
      
      analise.detalhes.push({
        nome: produto.nome,
        categoriaSugerida,
        categoriaAtual,
        precisaAtualizar
      })
      
      if (precisaAtualizar) {
        console.log(`🔄 ${produto.nome}: ${categoriaAtual} → ${categoriaSugerida}`)
      }
    }
    
    // Relatório final
    console.log('\n📋 RELATÓRIO DE CATEGORIZAÇÃO')
    console.log('=' .repeat(50))
    console.log(`Total de produtos: ${analise.total}`)
    console.log('\nDistribuição por categoria:')
    
    Object.entries(analise.porCategoria).forEach(([categoria, quantidade]) => {
      const percentual = ((quantidade / analise.total) * 100).toFixed(1)
      console.log(`  ${categoria}: ${quantidade} produtos (${percentual}%)`)
    })
    
    const produtosParaAtualizar = analise.detalhes.filter(d => d.precisaAtualizar)
    console.log(`\n🔄 Produtos que precisam atualizar: ${produtosParaAtualizar.length}`)
    
    if (produtosParaAtualizar.length > 0) {
      console.log('\n📝 Sugestões de atualização:')
      produtosParaAtualizar.forEach(item => {
        console.log(`  • ${item.nome}: ${item.categoriaAtual} → ${item.categoriaSugerida}`)
      })
      
      // Gerar SQL de atualização
      console.log('\n💾 SQL para atualizar as categorias:')
      console.log('-- Copie e execute no SQL Editor do Supabase')
      console.log('UPDATE produtos SET categoria = CASE')
      
      produtosParaAtualizar.forEach(item => {
        console.log(`  WHEN nome = '${item.nome.replace(/'/g, "''")}' THEN '${item.categoriaSugerida}'`)
      })
      
      console.log('  ELSE categoria')
      console.log('END')
      console.log('WHERE nome IN (')
      
      produtosParaAtualizar.forEach((item, index) => {
        const virgula = index < produtosParaAtualizar.length - 1 ? ',' : ''
        console.log(`  '${item.nome.replace(/'/g, "''")}'${virgula}`)
      })
      
      console.log(');')
    }
    
    // Testar regras
    console.log('\n🧪 TESTE DAS REGRAS DE CATEGORIZAÇÃO')
    console.log('=' .repeat(50))
    
    const produtosTeste = [
      'CAFE ALMOFADA GM EXTRAFORTE 250G',
      'ACHOCOLATADO CHOCOMINAS CESTA 1KG',
      'LEITE EM PÓ DESNATADO HORIZONTE 200g',
      'LEITE EM PÓ DESNATADO HORIZONTE SACARIA 25Kg',
      'COMPOSTO LACTEO HORIZONTE 1KG',
      'COMPOSTO LACTEO COM MALTODEXTRINA SABOR CHOCOLATE 25KG',
      'OKEY LAC GOURMET 25KG',
      'CACAU MILKSHOW 50% 200G',
      'GLUCOSE EM PÓ - 25KG'
    ]
    
    produtosTeste.forEach(produto => {
      const categoria = determinarCategoriaAutomatica(produto)
      console.log(`  ${produto}: ${categoria}`)
    })
    
  } catch (err) {
    console.error('❌ Erro na análise:', err)
  }
}

// Executar análise
analisarCategoriasProdutos()
