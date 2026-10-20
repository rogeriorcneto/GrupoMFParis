import { updateSession } from '../session.js'
import type { UserSession } from '../session.js'
import { log } from '../logger.js'
import * as db from '../database.js'
import { FUNCTION_DECLARATIONS, executeFunction, type AIFunctionResult } from '../ai-functions.js'
import { sendUserWhatsAppMessage, getUserWhatsAppSession } from '../whatsapp-multi.js'
import { sendEmail } from '../email.js'

const MAX_AI_HISTORY = 20

function fmtCliente(c: db.Cliente, vMap: Map<number, string>): string {
  return [
    c.razaoSocial,
    c.nomeFantasia || '',
    c.cnpj || '',
    c.etapa,
    c.score || 0,
    c.valorEstimado || 0,
    c.diasInativo || 0,
    vMap.get(c.vendedorId!) || '?',
    c.contatoNome || '',
    c.contatoTelefone || '',
    c.contatoEmail || '',
  ].join('|')
}

function fmtPedido(p: db.Pedido): string {
  return p.numero + '|' + p.status + '|R$' + p.totalValor + '|' + (p.dataCriacao || '').slice(0, 10)
}

async function buildWhatsAppContext(session: UserSession): Promise<string> {
  const v = session.vendedor
  const isGerente = v.cargo === 'gerente'

  const clientes = isGerente
    ? await db.fetchClientes()
    : await db.fetchClientesByVendedor(v.id)

  const vendedores = await db.fetchVendedores()
  const pedidos = await db.fetchPedidos()
  const interacoes = await db.fetchInteracoes()

  const vMap = new Map<number, string>(vendedores.map(ve => [ve.id, ve.nome]))

  const ativos = clientes.filter(c => c.etapa !== 'perdido')
  const perdidos = clientes.filter(c => c.etapa === 'perdido')

  const porEtapa = clientes.reduce((acc: Record<string, number>, c) => {
    acc[c.etapa] = (acc[c.etapa] || 0) + 1
    return acc
  }, {})

  const porEstado = clientes.reduce((acc: Record<string, number>, c) => {
    const uf: string = (c as any).enderecoEstado || 'N/A'
    acc[uf] = (acc[uf] || 0) + 1
    return acc
  }, {})

  const valorTotal = ativos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
  const inativos30 = ativos.filter(c => (c.diasInativo || 0) > 30).length
  const inativos60 = ativos.filter(c => (c.diasInativo || 0) > 60).length

  const pedidosPendentes = pedidos.filter(p => p.status === 'enviado')
  const pedidosConfirmados = pedidos.filter(p => p.status === 'confirmado')
  const faturamento = pedidosConfirmados.reduce((s, p) => s + p.totalValor, 0)

  const top10Score = [...ativos].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10)
  const top10Valor = [...ativos].filter(c => c.valorEstimado).sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0)).slice(0, 10)
  const top10Inativos = [...ativos].filter(c => (c.diasInativo || 0) > 0).sort((a, b) => (b.diasInativo || 0) - (a.diasInativo || 0)).slice(0, 10)

  const porVendedor = vendedores.map(ve => {
    const meus = ativos.filter(c => c.vendedorId === ve.id)
    const val = meus.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    return ve.nome + '(' + ve.cargo + '): ' + meus.length + ' ativos | R$' + val.toLocaleString('pt-BR') + ' carteira | meta R$' + (ve.metaVendas || 0).toLocaleString('pt-BR')
  }).join('\n')

  const H = 'nome|fantasia|cnpj|etapa|score|valor|diasInativo|vendedor|contato|telefone|email'

  const lines: string[] = []
  const now = new Date()
  const hoje = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  lines.push('Voce e a Assistente de IA do CRM Grupo MF Paris via WhatsApp, criada por Rogerio Reis. Desenvolvida exclusivamente para o Grupo MF Paris.')
  lines.push(`HOJE E ${hoje} (${now.toLocaleDateString('pt-BR', { weekday: 'long' })}). Para datas relativas ("amanha", "depois de amanha", "sexta", "semana que vem", "dia 30"), calcule SEMPRE a partir desta data atual — ela e atualizada a cada mensagem.`)
  lines.push('')
  lines.push('Sua personalidade: Direta, esperta e com tom leve. Respostas formatadas para WhatsApp (use *negrito*, _italico_, listas com - ou bullet). NUNCA termine com "Como posso ajudar?" ou frases genericas. Va direto ao ponto. Responda em portugues do Brasil.')
  lines.push('')
  lines.push('## USUARIO ATUAL')
  lines.push('Nome: ' + v.nome)
  lines.push('Cargo: ' + v.cargo)
  lines.push(isGerente ? 'Visao: TODOS os clientes da empresa' : 'Visao: apenas SEUS clientes')
  lines.push('')
  lines.push('## REGRAS DE COMPORTAMENTO')
  lines.push('- Voce e EXCLUSIVA do Grupo MF Paris.')
  lines.push('- Seja direta e natural. NUNCA termine respostas com "Como posso ajudar?", "Precisa de mais alguma coisa?", "Estou a disposicao" ou frases genericas de encerramento.')
  lines.push('- Se a pessoa pedir algo fora do escopo do CRM, diga naturalmente que seu foco e o CRM do Grupo MF Paris.')
  lines.push('- Use o primeiro nome do usuario de forma natural, sem forcar.')
  lines.push('- Para sair do modo IA: usuario digita "menu" ou "0".')
  lines.push('')
  lines.push('## RESUMO EXECUTIVO')
  lines.push('Total clientes: ' + clientes.length + ' (' + ativos.length + ' ativos, ' + perdidos.length + ' perdidos)')
  lines.push('Valor carteira ativa: R$ ' + valorTotal.toLocaleString('pt-BR'))
  lines.push('Inativos +30d: ' + inativos30 + ' | +60d: ' + inativos60)
  lines.push('Pedidos pendentes aprovacao: ' + pedidosPendentes.length)
  lines.push('Faturamento confirmado: R$ ' + faturamento.toLocaleString('pt-BR'))
  lines.push('Total interacoes: ' + interacoes.length)
  lines.push('')
  lines.push('## POR ETAPA')
  lines.push(Object.entries(porEtapa).map(([e, n]) => e + ': ' + n).join(' | '))
  lines.push('')
  lines.push('## POR ESTADO (top 10)')
  lines.push((Object.entries(porEstado) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([uf, n]) => uf + ':' + n).join(' | '))
  lines.push('')
  lines.push('## EQUIPE')
  lines.push(porVendedor)
  lines.push('')
  lines.push('## TOP 10 SCORE')
  lines.push(H)
  lines.push(top10Score.map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## TOP 10 VALOR')
  lines.push(H)
  lines.push(top10Valor.map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## TOP 10 MAIS INATIVOS')
  lines.push(H)
  lines.push(top10Inativos.map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## AMOSTRA CLIENTES ATIVOS (50 de ' + ativos.length + ')')
  lines.push(H)
  lines.push(ativos.slice(0, 50).map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## CLIENTES PERDIDOS (20 de ' + perdidos.length + ')')
  lines.push(H)
  lines.push(perdidos.slice(0, 20).map(c => fmtCliente(c, vMap)).join('\n'))
  lines.push('')
  lines.push('## PEDIDOS RECENTES (ultimos 10)')
  lines.push('numero|status|valor|data')
  lines.push(pedidos.slice(0, 10).map(p => fmtPedido(p)).join('\n'))
  lines.push('')
  lines.push('## INSTRUCOES')
  lines.push('- Busque clientes por nome, fantasia ou CNPJ nos dados acima.')
  lines.push('- Calcule metricas diretamente dos dados fornecidos.')
  lines.push('- Use listas formatadas para WhatsApp quando util.')
  lines.push('- Nunca invente dados - use apenas os dados reais acima.')
  lines.push('- SE PERGUNTAREM quem te criou: "Fui criada pelo Rogerio Reis, especialista em IA."')
  lines.push('- Se nao souber a resposta: seja honesta, diga que nao tem essa informacao nos dados disponiveis.')
  lines.push('')
  lines.push('## FUNCOES DISPONIVEIS (Function Calling)')
  lines.push('Voce tem acesso a funcoes para EXECUTAR acoes no CRM. Use-as quando o usuario pedir para fazer algo, nao apenas consultar.')
  lines.push('Funcoes disponiveis: searchClientes, getClienteDetalhes, sendWhatsApp, sendEmail, startCall, createCliente, updateCliente, deleteCliente (gerente), moverClienteEtapa (gerente), marcarClientePerdido (gerente), createTarefa, completeTarefa, remarcarTarefa, createPedido, listarPedidos, atualizarStatusPedido, enviarDocumentoPedido, relatorioCrm, aprovarPedido (gerente), recusarPedido (gerente), enviarPedidoOmie (gerente), listarProdutos, searchProdutos, createProduto (gerente), updateProduto (gerente), deleteProduto (gerente), addInteracao, addNota, listarTarefas.')
  lines.push('')
  lines.push('REGRAS DE EXECUCAO:')
  lines.push('- Para CADASTRAR CLIENTE: campos OBRIGATORIOS (mesma regra do CRM): razaoSocial, contatoNome, contatoTelefone, cnpj OU cpf, endereco. Se faltar qualquer um, PERGUNTE antes de chamar createCliente — a funcao recusa campos faltando ou CNPJ/CPF invalido. Se o vendedor enviar FOTO/DOCUMENTO (ex.: cartao CNPJ), extraia todos os campos legiveis da imagem e use-os como dados informados — pergunte so o que realmente nao estiver visivel.')
  lines.push('- Para CRIAR PEDIDO: primeiro use searchClientes para achar o cliente. Depois use listarProdutos para ver o catalogo. Pergunte: (1) tipo do pedido (venda ou bonificacao/amostra), (2) forma de pagamento (A vista, 7 dias, 14 dias, 21 dias, 28 dias, 30 dias, 45 dias ou 60 dias), (3) tipo de frete (CIF ou FOB), (4) quais produtos e quantidades em KG, (5) para VENDA, o preco unitario de cada item se nao informado (bonificacao/amostra usa preco 0). Use createPedido com TODOS esses campos.')
  lines.push('- Para ENVIAR WHATSAPP/EMAIL: primeiro busque o cliente com searchClientes, depois use sendWhatsApp ou sendEmail. SEMPRE confirme a mensagem com o usuario antes de enviar.')
  lines.push('- Para MOVER CLIENTE NO FUNIL: use moverClienteEtapa (somente gerente).')
  lines.push('- Para CRIAR TAREFA: use createTarefa com titulo, data (YYYY-MM-DD), tipo e prioridade. Para consultar tarefas use listarTarefas (filtros: status, data, clienteId); para concluir use completeTarefa; para remarcar use remarcarTarefa com novaData YYYY-MM-DD. Quando o usuario disser "ela", "essa" ou "a tarefa" sem dar ID, use o ID retornado pela criacao/consulta anterior ou chame listarTarefas para acha-la — nunca peca o ID ao vendedor se voce pode descobri-lo.')
  lines.push('- DATAS: o usuario escreve no formato brasileiro DD/MM/YYYY ou "25/10". Converta para YYYY-MM-DD ao chamar funcoes; ao RESPONDER, mostre datas em DD/MM/YYYY. Ano omitido = ano atual (ou proximo, se a data ja passou).')
  lines.push('- Para PDF/NOTA FISCAL de pedido: use enviarDocumentoPedido com tipo pedido_pdf (PDF do pedido) ou nota_fiscal (DANFE — so existe depois do faturamento). O arquivo chega direto no chat do vendedor.')
  lines.push('- Para RELATORIOS/METRICAS (vendas do dia/semana/mes, ultimos N dias, quantos clientes em cada etapa, ranking de vendedores, motivos de perda, funil de conversao, concentracao top10, taxa de recompra, receita media, tempo de tela, missoes/custo, total por vendedor): use SEMPRE relatorioCrm com dataInicio/dataFim. Gerente ve tudo; vendedor so os proprios dados. NUNCA diga "nao consigo calcular" nem invente numeros — se a pergunta precisar de dados agregados, chame a funcao; ela cobre todas as metricas da pagina Relatorios. Se o vendedor nao informar periodo, assuma o MES ATUAL e diga isso na resposta.')
  lines.push('- Para PRODUTOS: use listarProdutos/searchProdutos para consultar; use updateProduto para alterar preco, sku, nome, categoria, unidade, descricao ou ativo (somente gerente).')
  lines.push('- Para PEDIDOS: use listarPedidos para consultar e atualizarStatusPedido para enviar/cancelar/voltar rascunho quando apropriado. Quando o VENDEDOR pedir para "enviar o pedido para aprovacao", use atualizarStatusPedido com novoStatus "enviado" — aprovarPedido/recusarPedido sao apenas para o gerente agir sobre pedidos ja enviados. Para consultar pedidos use SEMPRE listarPedidos, nunca responda de memoria.')
  lines.push('- Para GERAR PROPOSTA: crie um pedido via createPedido e informe que o vendedor pode gerar o PDF pelo CRM web.')
  lines.push('- SEMPRE busque o cliente por nome antes de executar acoes que precisam de ID.')
  lines.push('- Se faltar informacao obrigatoria, PERGUNTE ao usuario antes de executar.')
  lines.push('- Apos executar uma acao, confirme o resultado ao usuario de forma clara.')

  return lines.join('\n')
}

export async function startAIChat(senderNumber: string, session: UserSession): Promise<string> {
  updateSession(senderNumber, {
    state: 'chatting_ai',
    aiHistory: [],
  })

  const nome = session.vendedor.nome.split(' ')[0]
  return [
    '*Assistente IA ativada*',
    '',
    'E ai, ' + nome + '! Pode me perguntar qualquer coisa sobre seus clientes, pipeline, tarefas...',
    '',
    'Exemplos:',
    '- _Quais clientes estao inativos?_',
    '- _Qual meu pipeline atual?_',
    '- _Sugira estrategia para os clientes em negociacao_',
    '',
    'Para voltar ao menu, digite *menu*',
  ].join('\n')
}

const MAX_FUNCTION_CALLS_WA = 5

async function callGeminiWA(
  apiKey: string,
  contents: any[],
  tools?: any[],
): Promise<any> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const body: any = {
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  }
  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_config = { function_calling_config: { mode: 'AUTO' } }
  }
  const resp = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const errorText = await resp.text()
    log.error({ error: errorText }, 'Erro na Gemini API (WhatsApp)')
    throw new Error(`Gemini API error ${resp.status}`)
  }
  return resp.json()
}

export async function handleAIChat(senderNumber: string, session: UserSession, text: string, image?: { mimeType: string; data: string }, sendDocument?: (doc: { url: string; mimetype: string; fileName: string; caption?: string }) => Promise<{ success: boolean; error?: string }>): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    log.error('GEMINI_API_KEY nao configurada para WhatsApp AI')
    return 'IA indisponivel no momento. Tente novamente mais tarde.'
  }

  try {
    const systemInstruction = await buildWhatsAppContext(session)
    const vendedor = session.vendedor

    const history = session.aiHistory || []
    history.push({ role: 'user', content: image ? `${text}\n[imagem enviada neste turno]` : text })

    if (history.length > MAX_AI_HISTORY) {
      history.splice(0, history.length - MAX_AI_HISTORY)
    }

    const contents: any[] = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Entendido, tenho acesso completo ao CRM e posso executar ações. Vou responder de forma direta via WhatsApp.' }] },
      ...history.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      })),
      {
        role: 'user',
        parts: image
          ? [{ text }, { inline_data: { mime_type: image.mimeType, data: image.data } }]
          : [{ text }],
      },
    ]

    // Build tools with all CRM function declarations
    const tools = [{ functionDeclarations: FUNCTION_DECLARATIONS }]

    // Build WhatsApp send function for this vendedor's session
    const sendWhatsAppFn = async (number: string, msgText: string, clienteId?: number) => {
      const waSession = getUserWhatsAppSession(vendedor.id)
      if (!waSession?.sock) return { success: false, error: 'WhatsApp não conectado' }
      try {
        await sendUserWhatsAppMessage(vendedor.id, number, msgText)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao enviar' }
      }
    }

    // Build email send function
    const sendEmailFn = async (to: string, subject: string, body: string, clienteId?: number, vendedorNome?: string) => {
      try {
        const result = await sendEmail({ to, subject, body, clienteId, vendedorNome })
        return result
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao enviar email' }
      }
    }

    // Function calling loop
    const executedActions: string[] = []
    let callCount = 0
    let hallucinationRetries = 0

    // Padrão de "afirmação de ação concluída" — se a IA responder isso SEM
    // ter chamado nenhuma função neste turno, ela alucinou a execução.
    const ACTION_CLAIM = /(criad[ao]|cadastrad[ao]|enviad[ao]|registrad[ao]|conclu[íi]d[ao]|feito!|pronto[!,.]|pedido (criado|registrado|enviado)|tarefa (criada|agendada)|cliente (criado|cadastrado)|estou (criando|cadastrando|enviando|registrando|agendando|buscando|procurando|verificando|consultando|listando)|(vou |vamos )?(criar|cadastrar|enviar|registrar|agendar|verificar|buscar|consultar|procurar|remarcar|concluir|listar|analisar|checar) (o|a|um|uma|este|essa|isso|esse)? ?(pedido|cliente|tarefa)? ?(agora|ja|já)?[.!]|aguarde( um)? (momento|instante)|deixa eu (ver|verificar|buscar)|chamando (a )?fun[cç][aã]o|fun[cç][aã]o `?[a-zA-Z]+`? para|(listando|buscando|procurando|analisando|verificando|conferindo|consultando|criando|cadastrando|enviando|concluindo|remarcando)[^.?!]*\.\.\.|(tools\.)?(createTarefa|createCliente|createPedido|updateCliente|remarcarTarefa|completeTarefa|listarTarefas|listarPedidos|listarProdutos|atualizarStatusPedido|enviarDocumentoPedido|relatorioCrm|searchClientes|getClienteDetalhes|addNota|addInteracao|sendWhatsApp|sendEmail|moverClienteEtapa|aprovarPedido|recusarPedido|enviarPedidoOmie|listarClientes)\s*\()/i

    while (callCount < MAX_FUNCTION_CALLS_WA) {
      const geminiData = await callGeminiWA(apiKey, contents, tools)
      const candidate = geminiData.candidates?.[0]
      if (!candidate?.content?.parts) break

      const parts = candidate.content.parts
      const functionCallPart = parts.find((p: any) => p.functionCall)

      if (!functionCallPart?.functionCall) {
        const textResponse = parts.find((p: any) => p.text)?.text || 'Sem resposta da IA.'

        // Guardrail anti-alucinação: afirmou que executou uma ação mas não
        // chamou função neste turno → repreende e dá uma chance de executar de verdade.
        if (executedActions.length === 0 && ACTION_CLAIM.test(textResponse) && hallucinationRetries >= 2) {
          const honest = 'Desculpe, tive um problema técnico e não consegui executar isso agora. Pode reformular a pergunta ou tentar novamente?'
          history.push({ role: 'assistant', content: honest })
          updateSession(senderNumber, { aiHistory: history })
          return honest
        }

        if (hallucinationRetries < 2 && executedActions.length === 0 && ACTION_CLAIM.test(textResponse)) {
          hallucinationRetries++
          log.warn({ vendedor: vendedor.nome, text: textResponse.slice(0, 120) }, 'IA WhatsApp afirmou ação sem executar função — forçando nova tentativa')
          contents.push({ role: 'model', parts: [{ text: textResponse }] })
          contents.push({
            role: 'user',
            parts: [{
              text: 'ATENÇÃO: você afirmou que executou uma ação, mas nenhuma função foi chamada — nada foi salvo no CRM. Se a ação foi realmente solicitada, chame a função correspondente AGORA com os dados corretos. Se não for possível (falta dados), diga honestamente o que falta, sem inventar número de pedido ou confirmação.',
            }],
          })
          continue
        }

        history.push({ role: 'assistant', content: textResponse })
        updateSession(senderNumber, { aiHistory: history })
        return textResponse
      }

      // Execute the function
      const { name, args } = functionCallPart.functionCall
      log.info({ functionName: name, args, vendedor: vendedor.nome, via: 'whatsapp' }, 'IA WhatsApp chamou função')

      const result = await executeFunction({ name, args }, vendedor, sendWhatsAppFn, sendEmailFn, sendDocument)
      executedActions.push(`${name}: ${result.message}`)
      log.info({ functionName: name, success: result.success, message: result.message, via: 'whatsapp' }, 'Resultado função IA WhatsApp')

      // Feed result back to Gemini
      contents.push({
        role: 'model',
        parts: [{ functionCall: { name, args } }],
      })
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name,
            response: {
              success: result.success,
              message: result.message,
              data: result.data || null,
            },
          },
        }],
      })

      callCount++
    }

    // Safety: if loop limit hit, get final text
    const geminiData = await callGeminiWA(apiKey, contents)
    const textResponse = geminiData.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || 'Ações executadas.'
    history.push({ role: 'assistant', content: textResponse })
    updateSession(senderNumber, { aiHistory: history })
    return textResponse

  } catch (err) {
    log.error({ err }, 'Erro no handler IA WhatsApp')
    return 'Erro interno da IA. Tente novamente.'
  }
}
