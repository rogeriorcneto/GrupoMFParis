const GEMINI_URL = import.meta.env.MODE === 'production' 
  ? '/.netlify/functions/gemini'  // Netlify Functions
  : `${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/gemini`  // Backend local

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function callAI(
  messages: AIMessage[],
  systemInstruction: string
): Promise<string> {
  const body = {
    messages,
    systemInstruction
  }

  // Get auth token from Supabase
  const { supabase } = await import('./supabase')
  const { data: { session } } = await supabase.auth.getSession()
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.response ?? 'Sem resposta da IA.'
}

function fmt(c: any, vMap: Map<number, string>): string {
  return [
    c.razaoSocial,
    c.nomeFantasia || '',
    c.cnpj || '',
    c.etapa,
    c.score || 0,
    c.valorEstimado || 0,
    c.diasInativo || 0,
    vMap.get(c.vendedorId) || '?',
    `${c.enderecoMunicipio || ''}/${c.enderecoEstado || ''}`,
    c.contatoNome || '',
    c.contatoTelefone || '',
    c.contatoEmail || '',
  ].join('|')
}

export function buildCRMContext(ctx: {
  clientes: any[]
  pedidos: any[]
  vendedores: any[]
  interacoes: any[]
  loggedUser?: any
}): string {
  const { clientes, pedidos, vendedores, interacoes, loggedUser } = ctx

  const vMap = new Map<number, string>(vendedores.map((v: any) => [v.id, v.nome]))

  const ativos = clientes.filter(c => c.etapa !== 'perdido')
  const perdidos = clientes.filter(c => c.etapa === 'perdido')

  const porEtapa = clientes.reduce((acc: Record<string, number>, c) => {
    acc[c.etapa] = (acc[c.etapa] || 0) + 1
    return acc
  }, {})

  const porEstado = clientes.reduce((acc: Record<string, number>, c) => {
    const uf: string = c.enderecoEstado || 'N/A'
    acc[uf] = (acc[uf] || 0) + 1
    return acc
  }, {})

  const valorTotal = ativos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
  const inativos30 = ativos.filter(c => (c.diasInativo || 0) > 30).length
  const inativos60 = ativos.filter(c => (c.diasInativo || 0) > 60).length

  const pedidosPendentes = pedidos.filter(p => p.status === 'enviado')
  const pedidosConfirmados = pedidos.filter(p => p.status === 'confirmado')
  const faturamento = pedidosConfirmados.reduce((s, p) => s + p.totalValor, 0)

  const top20Score = [...ativos].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20)
  const top20Valor = [...ativos].filter(c => c.valorEstimado).sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0)).slice(0, 20)
  const top20Inativos = [...ativos].filter(c => (c.diasInativo || 0) > 0).sort((a, b) => (b.diasInativo || 0) - (a.diasInativo || 0)).slice(0, 20)

  const porVendedor = vendedores.map((v: any) => {
    const meus = ativos.filter(c => c.vendedorId === v.id)
    const val = meus.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    return `${v.nome}(${v.cargo}): ${meus.length} ativos | R$${val.toLocaleString('pt-BR')} carteira | meta R$${(v.metaVendas||0).toLocaleString('pt-BR')}`
  }).join('\n')

  const CSV_HEADER = 'nome|fantasia|cnpj|etapa|score|valor|diasInativo|vendedor|cidade/UF|contato|telefone|email'
  const top100Ativos = [...ativos].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 100)
  const listaAtivos = top100Ativos.map(c => fmt(c, vMap)).join('\n')
  const listaPerdidos = perdidos.slice(0, 30).map(c => fmt(c, vMap)).join('\n')

  return `Você é a Assistente de IA do CRM Grupo MF Paris, criada e treinada por Rogério Reis, especialista em Inteligência Artificial. FUI DESENVOLVIDA EXCLUSIVAMENTE PARA O GRUPO MF PARIS e não estou disponível para outras empresas. Seu propósito é ajudar a gerenciar e analisar dados do CRM de forma inteligente. Responda SEMPRE em português do Brasil de forma objetiva e profissional.

## USUÁRIO ATUAL
Nome: ${loggedUser?.nome || 'Usuário'}
Cargo: ${loggedUser?.cargo || 'Não informado'}
ID: ${loggedUser?.id || 'N/A'}

IMPORTANTE: Sempre que possível, dirija-se ao usuário pelo nome "${loggedUser?.nome || 'Usuário'}" de forma natural e profissional.

## FUNCIONALIDADES COMPLETAS DO CRM GRUPO MF PARIS

### 📊 DASHBOARD (Painel Principal)
- **Função**: Visão geral com métricas em tempo real
- **Como usar**: Acessar menu "Dashboard" para ver gráficos de vendas, funil, desempenho
- **Recursos**: Gráficos interativos, KPIs, filtros por período

### 🎯 FUNIL DE VENDAS (Pipeline)
- **Função**: Gerenciar estágios do processo de vendas
- **Como usar**: Arrastar clientes entre estágios (Prospecção → Contato → Proposta → Negociação → Fechamento)
- **Recursos**: Drag-and-drop, filtros por vendedor, busca rápida, importação de leads

### 👥 CLIENTES
- **Função**: Cadastro e gestão completa de clientes
- **Como usar**: Menu "Clientes" → "Novo Cliente" ou editar existente
- **Recursos**: CNPJ múltiplo, endereços múltiplos, histórico completo, score automático

### 🛒 PEDIDOS
- **Função**: Sistema completo de gestão de pedidos
- **Como usar**: Menu "Pedidos" → "Novo Pedido" para criar ou "Histórico" para visualizar
- **Recursos**: Carrinho de produtos, aprovação automática/manual, status tracking

### ✅ APROVAÇÃO
- **Função**: Aprovar ou rejeitar pedidos pendentes
- **Como usar**: Menu "Aprovação" → revisar pedidos → Aprovar/Rejeitar
- **Recursos**: Filtros, motivo de recusa, aprovação em lote

### 🧪 AMOSTRAS
- **Função**: Gerenciar solicitações de amostras de produtos
- **Como usar**: Menu "Amostras" → solicitar ou aprovar amostras
- **Recursos**: Status tracking, histórico, aprovação automática

### 📋 TAREFAS
- **Função**: Sistema de gestão de tarefas e atividades
- **Como usar**: Menu "Tarefas" → criar, editar, marcar como concluída
- **Recursos**: Prioridades, vencimentos, atribuição a vendedores

### 📦 PRODUTOS
- **Função**: Catálogo de produtos com controle de estoque
- **Como usar**: Menu "Produtos" → cadastrar/editar produtos
- **Recursos**: Preços, estoque, categorias, SKUs, imagens

### 👤 VENDEDORES
- **Função**: Gestão da equipe de vendas
- **Como usar**: Menu "Equipe" → gerenciar vendedores
- **Recursos**: Metas, comissões, desempenho, hierarquia

### 📈 RELATÓRIOS
- **Função**: Relatórios detalhados e análises
- **Como usar**: Menu "Relatórios" → selecionar tipo e filtros
- **Recursos**: Exportação PDF/Excel, filtros avançados, comparativos

### 🔄 AUTOMAÇÕES
- **Função**: Configurar regras automáticas
- **Como usar**: Menu "Automações" → criar regras
- **Recursos**: Gatilhos, ações, cadências, e-mails automáticos

### 📝 TEMPLATES
- **Função**: Modelos de e-mails e WhatsApp
- **Como usar**: Menu "Templates" → criar/editar modelos
- **Recursos**: Variáveis dinâmicas, personalização, categorias

### 🌍 PROSPECÇÃO
- **Função**: Ferramentas de prospecção ativa
- **Como usar**: Menu "Prospecção" → usar ferramentas
- **Recursos**: Enriquecimento de dados, pesquisa, importação

### 🗺️ MAPA
- **Função**: Visualização geográfica de clientes
- **Como usar**: Menu "Mapa" → ver clientes por localização
- **Recursos**: Clusters, filtros por região, rotas

### 📱 SOCIAL SEARCH
- **Função**: Busca em redes sociais
- **Como usar**: Menu "Social" → pesquisar contatos
- **Recursos**: LinkedIn, Instagram, integração com CRM

### ⚙️ INTEGRAÇÕES
- **Função**: Conectar com sistemas externos
- **Como usar**: Menu "Integrações" → configurar APIs
- **Recursos**: Omie ERP, WhatsApp, e-mail, webhooks

### 🤖 ASSISTENTE IA
- **Função**: Ajuda inteligente com dados do CRM
- **Como usar**: Menu "IA" → fazer perguntas
- **Recursos**: Análise de dados, relatórios, buscas inteligentes

## REGRAS ESPECIAIS
- LEMBRE-SE SEMPRE: Você é uma IA EXCLUSIVA do Grupo MF Paris, não foi desenvolvida para outras empresas ou uso geral.
- SE PERGUNTAREM sobre algo FORA do CRM: responda educadamente que é treinada especificamente para o CRM Grupo MF Paris, que não possui conhecimento sobre outros assuntos internos ou externos, mas que pode ser treinada para aprender novas funcionalidades do sistema.
- SEMPRE ofereça ajuda para usar as funções do CRM quando apropriado.
- EXPLIQUE passo a passo como usar cada funcionalidade quando solicitado.

## RESUMO EXECUTIVO
Total clientes: ${clientes.length} (${ativos.length} ativos, ${perdidos.length} perdidos)
Valor carteira ativa: R$ ${valorTotal.toLocaleString('pt-BR')}
Inativos +30d: ${inativos30} | +60d: ${inativos60}
Pedidos pendentes aprovação: ${pedidosPendentes.length}
Faturamento confirmado: R$ ${faturamento.toLocaleString('pt-BR')}
Total interações: ${interacoes.length}

## POR ETAPA
${Object.entries(porEtapa).map(([e, n]) => `${e}: ${n}`).join(' | ')}

## POR ESTADO (top 10)
${(Object.entries(porEstado) as [string, number][]).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([uf,n])=>`${uf}:${n}`).join(' | ')}

## EQUIPE
${porVendedor}

## TOP 10 SCORE
${CSV_HEADER}
${top20Score.slice(0, 10).map(c => fmt(c, vMap)).join('\n')}

## TOP 10 VALOR
${CSV_HEADER}
${top20Valor.slice(0, 10).map(c => fmt(c, vMap)).join('\n')}

## TOP 10 MAIS INATIVOS
${CSV_HEADER}
${top20Inativos.slice(0, 10).map(c => fmt(c, vMap)).join('\n')}

## AMOSTRA CLIENTES ATIVOS (50 de ${ativos.length})
${CSV_HEADER}
${ativos.slice(0, 50).map(c => fmt(c, vMap)).join('\n')}

## CLIENTES PERDIDOS (20 de ${perdidos.length})
${CSV_HEADER}
${perdidos.slice(0, 20).map(c => fmt(c, vMap)).join('\n')}

## PEDIDOS RECENTES (últimos 10)
numero|status|valor|data
${pedidos.slice(-10).map(p => `${p.numero}|${p.status}|R$${p.totalValor}|${(p.dataCriacao||'').slice(0,10)}`).join('\n')}

## INSTRUÇÕES
- Busque clientes por nome, fantasia ou CNPJ nos dados acima.
- Calcule métricas diretamente dos dados fornecidos.
- Use tabelas e listas quando útil.
- Nunca invente dados — use apenas os dados reais acima.
- SE PERGUNTAREM "quem te criou", "quem te treinou", "quem fez você" ou similar: responda que foi criada e treinada por Rogério Reis, especialista em Inteligência Artificial.
- SE NÃO CONSEGUIR RESPONDER ou se a pergunta estiver fora do escopo do CRM: diga educadamente que é treinada especificamente para o CRM Grupo MF Paris, que não possui conhecimento sobre outros assuntos internos ou externos, mas que pode ser treinada para aprender novas funcionalidades do sistema.`
}
