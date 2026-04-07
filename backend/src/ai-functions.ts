/**
 * AI Agent Function Calling — CRM Grupo MF Paris
 * 
 * Defines all functions the AI can execute, with role-based permissions.
 * Uses Gemini Function Calling format.
 */

import { log } from './logger.js'
import * as db from './database.js'
import { supabase } from './supabase.js'
import type { Vendedor, Cliente } from './database.js'
import { onPedidoAprovado } from './omie/pedidos.js'

// ============================================
// Types
// ============================================

export interface AIFunctionCall {
  name: string
  args: Record<string, any>
}

export interface AIFunctionResult {
  success: boolean
  message: string
  data?: any
  /** If true, the frontend should execute a UI action */
  uiAction?: {
    type: 'startCall' | 'openWhatsApp' | 'refreshClientes' | 'refreshTarefas' | 'refreshPedidos' | 'navigateTo'
    payload?: any
  }
}

// ============================================
// Permission Control
// ============================================

const GERENTE_ONLY_FUNCTIONS = new Set([
  'moverClienteEtapa',
  'marcarClientePerdido',
  'aprovarPedido',
  'recusarPedido',
  'deleteCliente',
  'enviarPedidoOmie',
  'createProduto',
  'updateProduto',
  'deleteProduto',
])

export function canExecuteFunction(
  functionName: string,
  user: Vendedor
): { allowed: boolean; reason?: string } {
  if (GERENTE_ONLY_FUNCTIONS.has(functionName) && user.cargo !== 'gerente') {
    return {
      allowed: false,
      reason: `A função "${functionName}" é exclusiva do gerente. Peça ao seu gerente para realizar essa ação.`,
    }
  }
  return { allowed: true }
}

/** Check if vendedor has access to a specific cliente */
async function checkClienteAccess(
  clienteId: number,
  user: Vendedor
): Promise<{ allowed: boolean; cliente?: Cliente; reason?: string }> {
  const cliente = await db.fetchClienteById(clienteId)
  if (!cliente) return { allowed: false, reason: `Cliente com ID ${clienteId} não encontrado.` }
  if (user.cargo !== 'gerente' && cliente.vendedorId !== user.id) {
    return { allowed: false, reason: `Você não tem acesso a este cliente. Ele pertence a outro vendedor.` }
  }
  return { allowed: true, cliente }
}

// ============================================
// Gemini Function Declarations
// ============================================

export const FUNCTION_DECLARATIONS = [
  // ── BUSCA ──
  {
    name: 'searchClientes',
    description: 'Busca clientes pelo nome, razão social, CNPJ ou nome do contato. Use sempre que o usuário mencionar um cliente por nome e você precisar do ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        termo: { type: 'STRING', description: 'Termo de busca (nome, razão social, CNPJ ou contato)' },
      },
      required: ['termo'],
    },
  },
  {
    name: 'getClienteDetalhes',
    description: 'Busca informações detalhadas de um cliente específico pelo ID. Use após searchClientes para obter dados completos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente' },
      },
      required: ['clienteId'],
    },
  },

  // ── COMUNICAÇÃO ──
  {
    name: 'sendWhatsApp',
    description: 'Envia uma mensagem de WhatsApp para um cliente. Requer o ID do cliente e a mensagem. SEMPRE confirme com o usuário antes de enviar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente destinatário' },
        mensagem: { type: 'STRING', description: 'Texto da mensagem a enviar' },
      },
      required: ['clienteId', 'mensagem'],
    },
  },
  {
    name: 'sendEmail',
    description: 'Envia um email para o contato de um cliente. Requer ID do cliente, assunto e corpo do email. SEMPRE confirme com o usuário antes de enviar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente destinatário' },
        assunto: { type: 'STRING', description: 'Assunto do email' },
        corpo: { type: 'STRING', description: 'Corpo do email (texto)' },
      },
      required: ['clienteId', 'assunto', 'corpo'],
    },
  },
  {
    name: 'startCall',
    description: 'Inicia uma ligação telefônica para um cliente via Phone Link do Windows. Requer o ID do cliente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente para ligar' },
      },
      required: ['clienteId'],
    },
  },

  // ── CLIENTES ──
  {
    name: 'createCliente',
    description: 'Cadastra um novo cliente no CRM. Campos obrigatórios: razaoSocial, cnpj, contatoNome, contatoTelefone, contatoEmail. Se faltar algum campo obrigatório, PERGUNTE ao usuário antes de criar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        razaoSocial: { type: 'STRING', description: 'Razão social ou nome da empresa' },
        nomeFantasia: { type: 'STRING', description: 'Nome fantasia (opcional)' },
        cnpj: { type: 'STRING', description: 'CNPJ da empresa' },
        contatoNome: { type: 'STRING', description: 'Nome do contato principal' },
        contatoTelefone: { type: 'STRING', description: 'Telefone do contato' },
        contatoEmail: { type: 'STRING', description: 'Email do contato' },
        whatsapp: { type: 'STRING', description: 'WhatsApp do contato (opcional)' },
        endereco: { type: 'STRING', description: 'Endereço (opcional)' },
        valorEstimado: { type: 'NUMBER', description: 'Valor estimado em R$ (opcional)' },
        segmento: { type: 'STRING', description: 'Segmento de mercado (opcional)' },
      },
      required: ['razaoSocial', 'contatoNome', 'contatoTelefone'],
    },
  },
  {
    name: 'updateCliente',
    description: 'Atualiza dados de um cliente existente. Informe o ID e apenas os campos que devem ser alterados.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente a atualizar' },
        razaoSocial: { type: 'STRING', description: 'Nova razão social (opcional)' },
        nomeFantasia: { type: 'STRING', description: 'Novo nome fantasia (opcional)' },
        contatoNome: { type: 'STRING', description: 'Novo nome do contato (opcional)' },
        contatoTelefone: { type: 'STRING', description: 'Novo telefone (opcional)' },
        contatoEmail: { type: 'STRING', description: 'Novo email (opcional)' },
        whatsapp: { type: 'STRING', description: 'Novo WhatsApp (opcional)' },
        valorEstimado: { type: 'NUMBER', description: 'Novo valor estimado (opcional)' },
        notas: { type: 'STRING', description: 'Novas notas/observações (opcional)' },
      },
      required: ['clienteId'],
    },
  },
  {
    name: 'deleteCliente',
    description: 'Deleta um cliente do CRM. SOMENTE gerentes podem usar. SEMPRE confirme com o usuário antes de deletar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente a deletar' },
      },
      required: ['clienteId'],
    },
  },

  // ── FUNIL ──
  {
    name: 'moverClienteEtapa',
    description: 'Move um cliente para outra etapa do funil de vendas. SOMENTE gerentes podem usar. Etapas: lead, prospecção, amostra, amostra_perdida, proposta, negociacao, follow_up, inativo, perdido.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente' },
        novaEtapa: {
          type: 'STRING',
          description: 'Nova etapa do funil',
          enum: ['lead', 'prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up', 'inativo', 'perdido'],
        },
      },
      required: ['clienteId', 'novaEtapa'],
    },
  },
  {
    name: 'marcarClientePerdido',
    description: 'Marca um cliente como perdido com categoria e motivo. SOMENTE gerentes podem usar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente' },
        categoriaPerda: {
          type: 'STRING',
          description: 'Categoria da perda',
          enum: ['preco', 'prazo', 'qualidade', 'concorrencia', 'sem_resposta', 'outro'],
        },
        motivoPerda: { type: 'STRING', description: 'Descrição do motivo da perda' },
      },
      required: ['clienteId', 'categoriaPerda'],
    },
  },

  // ── TAREFAS ──
  {
    name: 'createTarefa',
    description: 'Cria uma nova tarefa. O vendedor só pode criar tarefas para si mesmo. O gerente pode criar para qualquer vendedor.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo: { type: 'STRING', description: 'Título da tarefa' },
        descricao: { type: 'STRING', description: 'Descrição detalhada (opcional)' },
        data: { type: 'STRING', description: 'Data de vencimento no formato YYYY-MM-DD' },
        hora: { type: 'STRING', description: 'Hora no formato HH:MM (opcional)' },
        tipo: {
          type: 'STRING',
          description: 'Tipo da tarefa',
          enum: ['ligacao', 'reuniao', 'email', 'whatsapp', 'follow-up', 'outro'],
        },
        prioridade: {
          type: 'STRING',
          description: 'Prioridade da tarefa',
          enum: ['alta', 'media', 'baixa'],
        },
        clienteId: { type: 'INTEGER', description: 'ID do cliente relacionado (opcional)' },
        vendedorId: { type: 'INTEGER', description: 'ID do vendedor responsável (opcional, gerente only)' },
      },
      required: ['titulo', 'data', 'tipo', 'prioridade'],
    },
  },
  {
    name: 'completeTarefa',
    description: 'Marca uma tarefa como concluída pelo seu ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tarefaId: { type: 'INTEGER', description: 'ID da tarefa a concluir' },
      },
      required: ['tarefaId'],
    },
  },

  // ── PEDIDOS ──
  {
    name: 'createPedido',
    description: 'Cria um novo pedido para um cliente. Requer lista de itens com produtoId e quantidade, tipo do pedido (venda ou bonificacao/amostra), forma de pagamento e tipo de frete (CIF ou FOB). SEMPRE pergunte esses campos ao usuário antes de criar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente' },
        tipo: {
          type: 'STRING',
          description: 'Tipo do pedido: venda (pedido normal) ou bonificacao (amostra/brinde)',
          enum: ['venda', 'bonificacao'],
        },
        formaPagamento: {
          type: 'STRING',
          description: 'Forma de pagamento. Opções disponíveis:\nPagamento Direto: À vista, 7 dias, 14 dias, 21 dias, 28 dias, 30 dias, 45 dias, 60 dias, 90 dias\nIntervalos Progressivos: 7/14, 7/14/21, 7/14/21/28, 7/14/21/28/35, 7/14/21/28/35/42, 7/14/21/28/35/42/49, 7/14/21/28/35/42/49/56, 7/14/21/28/35/42/49/56/63, 7/14/21/28/35/42/49/56/63/70\nSérie 14: 14/21, 14/21/28, 14/21/28/35, 14/21/28/35/42, 14/21/28/35/42/49, 14/21/28/35/42/49/56\nSérie 28: 28/35, 28/35/42, 28/42/56, 28/35/42/49, 28/35/42/49/56\nCom Entrada: À vista/30, À vista/30/60/90, À vista/30/60/90/120, À vista/30/60/90/120/150\nMensais: 30/60/90, 30/60/90/120, 30/60/90/120/150, 30/60/90/120/150/180\nParcelas: 4 parcelas, 5 parcelas, 6 parcelas, 8 parcelas, 36 parcelas, 48 parcelas',
        },
        tipoFrete: {
          type: 'STRING',
          description: 'Tipo de frete: CIF (frete por conta do vendedor) ou FOB (frete por conta do cliente)',
          enum: ['CIF', 'FOB'],
        },
        itens: {
          type: 'ARRAY',
          description: 'Lista de itens do pedido',
          items: {
            type: 'OBJECT',
            properties: {
              produtoId: { type: 'INTEGER', description: 'ID do produto' },
              quantidade: { type: 'NUMBER', description: 'Quantidade em KG' },
            },
            required: ['produtoId', 'quantidade'],
          },
        },
        observacoes: { type: 'STRING', description: 'Observações do pedido (opcional)' },
      },
      required: ['clienteId', 'itens', 'tipo', 'formaPagamento', 'tipoFrete'],
    },
  },
  {
    name: 'aprovarPedido',
    description: 'Aprova um pedido pendente. SOMENTE gerentes podem usar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoId: { type: 'INTEGER', description: 'ID do pedido a aprovar' },
      },
      required: ['pedidoId'],
    },
  },
  {
    name: 'recusarPedido',
    description: 'Recusa um pedido pendente com motivo. SOMENTE gerentes podem usar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoId: { type: 'INTEGER', description: 'ID do pedido a recusar' },
        motivo: { type: 'STRING', description: 'Motivo da recusa' },
      },
      required: ['pedidoId', 'motivo'],
    },
  },

  {
    name: 'enviarPedidoOmie',
    description: 'Envia um pedido do CRM para o Omie ERP. SOMENTE gerentes podem usar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoId: { type: 'INTEGER', description: 'ID do pedido a enviar' },
      },
      required: ['pedidoId'],
    },
  },
  {
    name: 'listarPedidos',
    description: 'Lista pedidos do CRM. Vendedor vê apenas seus próprios pedidos; gerente vê todos. Permite filtros opcionais.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          description: 'Filtrar por status (opcional)',
          enum: ['rascunho', 'enviado', 'confirmado', 'cancelado'],
        },
        clienteId: { type: 'INTEGER', description: 'Filtrar por cliente (opcional)' },
        limite: { type: 'INTEGER', description: 'Quantidade máxima de resultados (opcional, padrão 20, máximo 100)' },
      },
      required: [],
    },
  },
  {
    name: 'atualizarStatusPedido',
    description: 'Atualiza status de pedido. Vendedor pode enviar/cancelar pedidos próprios; gerente pode ajustar status operacionais. Para aprovar/recusar formalmente use aprovarPedido/recusarPedido.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoId: { type: 'INTEGER', description: 'ID do pedido' },
        novoStatus: {
          type: 'STRING',
          description: 'Novo status do pedido',
          enum: ['rascunho', 'enviado', 'cancelado'],
        },
      },
      required: ['pedidoId', 'novoStatus'],
    },
  },

  // ── PRODUTOS ──
  {
    name: 'searchProdutos',
    description: 'Busca produtos por nome, SKU ou categoria. Gerente pode incluir inativos na busca.',
    parameters: {
      type: 'OBJECT',
      properties: {
        termo: { type: 'STRING', description: 'Termo de busca por nome, SKU ou categoria' },
        incluirInativos: { type: 'BOOLEAN', description: 'Se true, inclui produtos inativos (somente gerente)' },
      },
      required: ['termo'],
    },
  },
  {
    name: 'createProduto',
    description: 'Cria um novo produto no catálogo. SOMENTE gerentes podem usar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome do produto' },
        categoria: { type: 'STRING', description: 'Categoria do produto' },
        unidade: { type: 'STRING', description: 'Unidade de venda (ex: kg, un)' },
        preco: { type: 'NUMBER', description: 'Preço base de referência (opcional)' },
        sku: { type: 'STRING', description: 'SKU/código interno (opcional)' },
        descricao: { type: 'STRING', description: 'Descrição do produto (opcional)' },
        ativo: { type: 'BOOLEAN', description: 'Produto ativo (opcional, padrão true)' },
      },
      required: ['nome', 'categoria', 'unidade'],
    },
  },
  {
    name: 'updateProduto',
    description: 'Atualiza dados de um produto (incluindo preço). SOMENTE gerentes podem usar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        produtoId: { type: 'INTEGER', description: 'ID do produto a atualizar' },
        nome: { type: 'STRING', description: 'Novo nome (opcional)' },
        categoria: { type: 'STRING', description: 'Nova categoria (opcional)' },
        unidade: { type: 'STRING', description: 'Nova unidade (opcional)' },
        preco: { type: 'NUMBER', description: 'Novo preço (opcional)' },
        sku: { type: 'STRING', description: 'Novo SKU (opcional)' },
        descricao: { type: 'STRING', description: 'Nova descrição (opcional)' },
        ativo: { type: 'BOOLEAN', description: 'Ativar/desativar produto (opcional)' },
      },
      required: ['produtoId'],
    },
  },
  {
    name: 'deleteProduto',
    description: 'Exclui um produto do catálogo. SOMENTE gerentes podem usar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        produtoId: { type: 'INTEGER', description: 'ID do produto a excluir' },
      },
      required: ['produtoId'],
    },
  },

  // ── INTERAÇÕES E NOTAS ──
  {
    name: 'addInteracao',
    description: 'Registra uma interação com um cliente (reunião, ligação, email, nota, etc).',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente' },
        tipo: {
          type: 'STRING',
          description: 'Tipo da interação',
          enum: ['email', 'whatsapp', 'linkedin', 'instagram', 'ligacao', 'reuniao', 'nota'],
        },
        assunto: { type: 'STRING', description: 'Assunto breve' },
        descricao: { type: 'STRING', description: 'Descrição detalhada da interação' },
      },
      required: ['clienteId', 'tipo', 'assunto', 'descricao'],
    },
  },
  {
    name: 'addNota',
    description: 'Adiciona ou atualiza as notas/observações de um cliente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente' },
        nota: { type: 'STRING', description: 'Texto da nota a adicionar (será adicionado às notas existentes)' },
      },
      required: ['clienteId', 'nota'],
    },
  },

  // ── CONSULTAS ──
  {
    name: 'listarTarefas',
    description: 'Lista as tarefas do vendedor logado, opcionalmente filtradas por status ou data.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: { type: 'STRING', description: 'Filtrar por status: pendente ou concluida (opcional)', enum: ['pendente', 'concluida'] },
      },
      required: [],
    },
  },
  {
    name: 'listarProdutos',
    description: 'Lista os produtos ativos do catálogo com preços e estoque.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
]

// ============================================
// Function Executor
// ============================================

export async function executeFunction(
  call: AIFunctionCall,
  user: Vendedor,
  /** WhatsApp send function injected from the session handler */
  sendWhatsAppFn?: (number: string, text: string, clienteId?: number) => Promise<{ success: boolean; error?: string }>,
  /** Email send function */
  sendEmailFn?: (to: string, subject: string, body: string, clienteId?: number, vendedorNome?: string) => Promise<{ success: boolean; error?: string }>,
): Promise<AIFunctionResult> {
  const { name, args } = call

  // Permission check
  const perm = canExecuteFunction(name, user)
  if (!perm.allowed) {
    return { success: false, message: perm.reason! }
  }

  try {
    switch (name) {
      // ── BUSCA ──
      case 'searchClientes': {
        const clientes = user.cargo === 'gerente'
          ? await db.searchClientes(args.termo)
          : await db.searchClientes(args.termo, user.id)
        if (clientes.length === 0) {
          return { success: true, message: `Nenhum cliente encontrado para "${args.termo}".`, data: [] }
        }
        const lista = clientes.map(c => ({
          id: c.id,
          razaoSocial: c.razaoSocial,
          nomeFantasia: c.nomeFantasia,
          cnpj: c.cnpj,
          contato: c.contatoNome,
          telefone: c.contatoTelefone,
          email: c.contatoEmail,
          whatsapp: c.whatsapp,
          etapa: c.etapa,
          score: c.score,
          valorEstimado: c.valorEstimado,
        }))
        return { success: true, message: `Encontrados ${clientes.length} cliente(s).`, data: lista }
      }

      case 'getClienteDetalhes': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        const c = access.cliente!
        return {
          success: true,
          message: `Detalhes do cliente ${c.razaoSocial}.`,
          data: {
            id: c.id, razaoSocial: c.razaoSocial, nomeFantasia: c.nomeFantasia,
            cnpj: c.cnpj, contato: c.contatoNome, telefone: c.contatoTelefone,
            email: c.contatoEmail, whatsapp: c.whatsapp, etapa: c.etapa,
            score: c.score, valorEstimado: c.valorEstimado, notas: c.notas,
            diasInativo: c.diasInativo, vendedorId: c.vendedorId,
            dataEntradaEtapa: c.dataEntradaEtapa, origemLead: c.origemLead,
          },
        }
      }

      // ── COMUNICAÇÃO ──
      case 'sendWhatsApp': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        const c = access.cliente!
        const phone = c.whatsapp || c.contatoTelefone
        if (!phone) return { success: false, message: `Cliente ${c.razaoSocial} não tem número de WhatsApp cadastrado.` }
        if (!sendWhatsAppFn) return { success: false, message: 'WhatsApp não conectado. Conecte seu WhatsApp em Tarefas → 📱 Meu WhatsApp.' }
        const result = await sendWhatsAppFn(phone, args.mensagem, c.id)
        if (!result.success) return { success: false, message: `Erro ao enviar WhatsApp: ${result.error}` }
        await db.insertInteracao({ clienteId: c.id, tipo: 'whatsapp', data: new Date().toISOString(), assunto: 'WhatsApp via IA', descricao: args.mensagem, automatico: false })
        await db.insertAtividade({ tipo: 'whatsapp', descricao: `[IA] WhatsApp para ${c.razaoSocial}: ${args.mensagem.slice(0, 80)}`, vendedorNome: user.nome })
        return { success: true, message: `✅ WhatsApp enviado para ${c.razaoSocial} (${phone}): "${args.mensagem.slice(0, 100)}${args.mensagem.length > 100 ? '...' : ''}"` }
      }

      case 'sendEmail': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        const c = access.cliente!
        if (!c.contatoEmail) return { success: false, message: `Cliente ${c.razaoSocial} não tem email cadastrado.` }
        if (!sendEmailFn) return { success: false, message: 'Serviço de email não configurado.' }
        const result = await sendEmailFn(c.contatoEmail, args.assunto, args.corpo, c.id, user.nome)
        if (!result.success) return { success: false, message: `Erro ao enviar email: ${result.error}` }
        await db.insertInteracao({ clienteId: c.id, tipo: 'email', data: new Date().toISOString(), assunto: args.assunto, descricao: args.corpo.slice(0, 300), automatico: false })
        await db.insertAtividade({ tipo: 'email', descricao: `[IA] Email para ${c.razaoSocial}: ${args.assunto}`, vendedorNome: user.nome })
        return { success: true, message: `✅ Email enviado para ${c.razaoSocial} (${c.contatoEmail}).\nAssunto: ${args.assunto}` }
      }

      case 'startCall': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        const c = access.cliente!
        const phone = c.contatoTelefone || c.whatsapp
        if (!phone) return { success: false, message: `Cliente ${c.razaoSocial} não tem telefone cadastrado.` }
        let formattedNum = phone.replace(/\D/g, '')
        if (!formattedNum.startsWith('55')) formattedNum = `55${formattedNum}`
        await db.insertAtividade({ tipo: 'ligacao', descricao: `[IA] Ligação para ${c.razaoSocial} (+${formattedNum})`, vendedorNome: user.nome })
        return {
          success: true,
          message: `📞 Iniciando ligação para ${c.razaoSocial} (+${formattedNum})...`,
          uiAction: { type: 'startCall', payload: { phone: `+${formattedNum}`, clienteId: c.id, clienteNome: c.razaoSocial } },
        }
      }

      // ── CLIENTES ──
      case 'createCliente': {
        const newCliente = await db.insertCliente({
          razaoSocial: args.razaoSocial,
          nomeFantasia: args.nomeFantasia || '',
          cnpj: args.cnpj || '',
          contatoNome: args.contatoNome,
          contatoTelefone: args.contatoTelefone,
          contatoEmail: args.contatoEmail || '',
          whatsapp: args.whatsapp || args.contatoTelefone || '',
          endereco: args.endereco || '',
          etapa: 'prospecção',
          vendedorId: user.id,
          score: 0,
          valorEstimado: args.valorEstimado || 0,
        })
        await db.insertAtividade({ tipo: 'cadastro', descricao: `[IA] Cadastrou cliente ${newCliente.razaoSocial}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Cliente "${newCliente.razaoSocial}" cadastrado com sucesso! (ID: ${newCliente.id}, Etapa: Prospecção)`,
          data: { id: newCliente.id, razaoSocial: newCliente.razaoSocial },
          uiAction: { type: 'refreshClientes' },
        }
      }

      case 'updateCliente': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        const changes: Partial<Cliente> = {}
        if (args.razaoSocial) changes.razaoSocial = args.razaoSocial
        if (args.nomeFantasia) changes.nomeFantasia = args.nomeFantasia
        if (args.contatoNome) changes.contatoNome = args.contatoNome
        if (args.contatoTelefone) changes.contatoTelefone = args.contatoTelefone
        if (args.contatoEmail) changes.contatoEmail = args.contatoEmail
        if (args.whatsapp) changes.whatsapp = args.whatsapp
        if (args.valorEstimado !== undefined) changes.valorEstimado = args.valorEstimado
        if (args.notas) changes.notas = args.notas
        if (Object.keys(changes).length === 0) return { success: false, message: 'Nenhum campo para atualizar foi informado.' }
        await db.updateCliente(args.clienteId, changes)
        const fields = Object.keys(changes).join(', ')
        await db.insertAtividade({ tipo: 'atualizacao', descricao: `[IA] Atualizou ${fields} de ${access.cliente!.razaoSocial}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Cliente "${access.cliente!.razaoSocial}" atualizado. Campos: ${fields}`,
          uiAction: { type: 'refreshClientes' },
        }
      }

      case 'deleteCliente': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        // Delete via supabase (matching frontend logic)
        const { error: delErr } = await supabase.from('clientes').delete().eq('id', args.clienteId)
        if (delErr) return { success: false, message: `Erro ao deletar: ${delErr.message}` }
        await db.insertAtividade({ tipo: 'exclusao', descricao: `[IA] Deletou cliente ${access.cliente!.razaoSocial} (ID: ${args.clienteId})`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Cliente "${access.cliente!.razaoSocial}" deletado.`,
          uiAction: { type: 'refreshClientes' },
        }
      }

      // ── FUNIL ──
      case 'moverClienteEtapa': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        const oldEtapa = access.cliente!.etapa
        await db.updateCliente(args.clienteId, {
          etapa: args.novaEtapa,
          etapaAnterior: oldEtapa,
          dataEntradaEtapa: new Date().toISOString(),
        })
        // Insert historico_etapas
        await supabase.from('historico_etapas').insert({
          cliente_id: args.clienteId,
          etapa: args.novaEtapa,
          de: oldEtapa,
        })
        await db.insertAtividade({ tipo: 'funil', descricao: `[IA] Moveu ${access.cliente!.razaoSocial} de ${oldEtapa} → ${args.novaEtapa}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ ${access.cliente!.razaoSocial} movido de "${oldEtapa}" para "${args.novaEtapa}".`,
          uiAction: { type: 'refreshClientes' },
        }
      }

      case 'marcarClientePerdido': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        const oldEtapa = access.cliente!.etapa
        await db.updateCliente(args.clienteId, {
          etapa: 'perdido',
          etapaAnterior: oldEtapa,
          categoriaPerda: args.categoriaPerda,
          motivoPerda: args.motivoPerda || '',
          dataPerda: new Date().toISOString(),
          dataEntradaEtapa: new Date().toISOString(),
        })
        await supabase.from('historico_etapas').insert({ cliente_id: args.clienteId, etapa: 'perdido', de: oldEtapa })
        await db.insertAtividade({ tipo: 'funil', descricao: `[IA] Marcou ${access.cliente!.razaoSocial} como perdido (${args.categoriaPerda})`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ ${access.cliente!.razaoSocial} marcado como perdido. Categoria: ${args.categoriaPerda}.`,
          uiAction: { type: 'refreshClientes' },
        }
      }

      // ── TAREFAS ──
      case 'createTarefa': {
        // Vendedor can only create tasks for themselves
        let vendedorId = user.id
        if (args.vendedorId && user.cargo === 'gerente') {
          vendedorId = args.vendedorId
        }
        // If clienteId given, check access
        if (args.clienteId) {
          const access = await checkClienteAccess(args.clienteId, user)
          if (!access.allowed) return { success: false, message: access.reason! }
        }
        const tarefa = await db.insertTarefa({
          titulo: args.titulo,
          descricao: args.descricao || '',
          data: args.data,
          hora: args.hora || '',
          tipo: args.tipo,
          status: 'pendente',
          prioridade: args.prioridade,
          clienteId: args.clienteId || undefined,
          vendedorId,
        })
        await db.insertAtividade({ tipo: 'tarefa', descricao: `[IA] Criou tarefa "${args.titulo}" para ${args.data}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Tarefa "${tarefa.titulo}" criada para ${args.data}${args.hora ? ` às ${args.hora}` : ''}. Prioridade: ${args.prioridade}.`,
          data: { id: tarefa.id },
          uiAction: { type: 'refreshTarefas' },
        }
      }

      case 'completeTarefa': {
        // Verify the tarefa belongs to the user (vendedor can only complete their own)
        const { data: tarefaRow, error: tarefaErr } = await supabase.from('tarefas').select('*').eq('id', args.tarefaId).single()
        if (tarefaErr || !tarefaRow) return { success: false, message: `Tarefa com ID ${args.tarefaId} não encontrada.` }
        if (user.cargo !== 'gerente' && tarefaRow.vendedor_id !== user.id) {
          return { success: false, message: 'Você não pode concluir tarefas de outro vendedor.' }
        }
        await db.updateTarefaStatus(args.tarefaId, 'concluida')
        await db.insertAtividade({ tipo: 'tarefa', descricao: `[IA] Concluiu tarefa "${tarefaRow.titulo}"`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Tarefa "${tarefaRow.titulo}" marcada como concluída.`,
          uiAction: { type: 'refreshTarefas' },
        }
      }

      // ── PEDIDOS ──
      case 'createPedido': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        // Fetch products to validate and get prices
        const produtos = await db.fetchProdutosAtivos()
        const prodMap = new Map(produtos.map(p => [p.id, p]))
        const itens: db.ItemPedido[] = []
        let totalValor = 0
        for (const item of args.itens) {
          const prod = prodMap.get(item.produtoId)
          if (!prod) return { success: false, message: `Produto ID ${item.produtoId} não encontrado ou inativo.` }
          const subtotal = prod.preco * item.quantidade
          itens.push({
            produtoId: prod.id,
            nomeProduto: prod.nome,
            sku: prod.sku || '',
            unidade: 'kg',
            preco: prod.preco,
            quantidade: item.quantidade,
          })
          totalValor += subtotal
        }
        const now = new Date()
        const numero = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
        const tipoPedido = args.tipo || 'venda'
        const formaPag = args.formaPagamento || 'À vista'
        const frete = args.tipoFrete || ''
        const pedido = await db.insertPedido({
          numero,
          clienteId: args.clienteId,
          vendedorId: user.id,
          itens,
          observacoes: args.observacoes || '',
          status: 'rascunho',
          dataCriacao: now.toISOString(),
          totalValor,
          tipo: tipoPedido,
          formaPagamento: formaPag,
          tipoFrete: frete as 'CIF' | 'FOB' | '',
        })
        await db.insertAtividade({ tipo: 'pedido', descricao: `[IA] Criou pedido ${numero} (${tipoPedido === 'bonificacao' ? 'Amostra' : 'Venda'}) para ${access.cliente!.razaoSocial} — R$${totalValor.toFixed(2)} | ${frete} | ${formaPag}`, vendedorNome: user.nome })
        const resumo = itens.map(i => `${i.nomeProduto} x${i.quantidade}`).join(', ')
        return {
          success: true,
          message: `✅ Pedido ${numero} criado para ${access.cliente!.razaoSocial}.\nTipo: ${tipoPedido === 'bonificacao' ? 'Amostra/Bonificação' : 'Venda'}\nFrete: ${frete || 'N/A'}\nPagamento: ${formaPag}\nItens: ${resumo}\nTotal: R$ ${totalValor.toFixed(2)}\nStatus: rascunho (precisa ser enviado para aprovação).`,
          data: { id: pedido.id, numero },
          uiAction: { type: 'refreshPedidos' },
        }
      }

      case 'aprovarPedido': {
        const { data: pedRow } = await supabase.from('pedidos').select('*').eq('id', args.pedidoId).single()
        if (!pedRow) return { success: false, message: `Pedido ID ${args.pedidoId} não encontrado.` }
        if (pedRow.status !== 'enviado') return { success: false, message: `Pedido ${pedRow.numero} não está pendente de aprovação (status: ${pedRow.status}).` }
        // 1. Aprovar no CRM
        await supabase.from('pedidos').update({ status: 'confirmado', data_aprovacao: new Date().toISOString(), aprovado_por: user.id }).eq('id', args.pedidoId)
        await db.insertAtividade({ tipo: 'aprovacao', descricao: `[IA] Aprovou pedido ${pedRow.numero}`, vendedorNome: user.nome })
        // 2. Enviar automaticamente ao Omie
        let omieMsg = ''
        try {
          const omieResult = await onPedidoAprovado(args.pedidoId)
          if (omieResult.success) {
            await supabase.from('pedidos').update({ omie_erro: null }).eq('id', args.pedidoId)
            omieMsg = ` Enviado ao Omie (código: ${omieResult.omie_codigo}).`
          } else {
            await supabase.from('pedidos').update({ omie_erro: omieResult.error || 'Erro desconhecido' }).eq('id', args.pedidoId)
            omieMsg = ` ⚠️ Omie rejeitou: ${omieResult.error}`
          }
        } catch (omieErr: any) {
          try { await supabase.from('pedidos').update({ omie_erro: omieErr.message || 'Erro ao enviar' }).eq('id', args.pedidoId) } catch { /* */ }
          omieMsg = ` ⚠️ Erro Omie: ${omieErr.message}`
        }
        return {
          success: true,
          message: `✅ Pedido ${pedRow.numero} aprovado.${omieMsg}`,
          uiAction: { type: 'refreshPedidos' },
        }
      }

      case 'recusarPedido': {
        const { data: pedRow } = await supabase.from('pedidos').select('*').eq('id', args.pedidoId).single()
        if (!pedRow) return { success: false, message: `Pedido ID ${args.pedidoId} não encontrado.` }
        if (pedRow.status !== 'enviado') return { success: false, message: `Pedido ${pedRow.numero} não está pendente de aprovação (status: ${pedRow.status}).` }
        await supabase.from('pedidos').update({ status: 'cancelado', motivo_recusa: args.motivo }).eq('id', args.pedidoId)
        await db.insertAtividade({ tipo: 'aprovacao', descricao: `[IA] Recusou pedido ${pedRow.numero}: ${args.motivo}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `❌ Pedido ${pedRow.numero} recusado. Motivo: ${args.motivo}.`,
          uiAction: { type: 'refreshPedidos' },
        }
      }

      case 'enviarPedidoOmie': {
        const { data: pedRow } = await supabase.from('pedidos').select('*').eq('id', args.pedidoId).single()
        if (!pedRow) return { success: false, message: `Pedido ID ${args.pedidoId} não encontrado.` }
        if (pedRow.omie_codigo) return { success: false, message: `Pedido ${pedRow.numero} já foi enviado ao Omie (código: ${pedRow.omie_codigo}).` }
        
        // Importar criarPedidoOmie
        const { criarPedidoOmie } = await import('./omie/pedidos.js')
        
        try {
          const omieResult = await criarPedidoOmie(args.pedidoId)
          await db.insertAtividade({ tipo: 'omie', descricao: `[IA] Enviou pedido ${pedRow.numero} ao Omie (código: ${omieResult.codigo_pedido})`, vendedorNome: user.nome })
          return {
            success: true,
            message: `✅ Pedido ${pedRow.numero} enviado ao Omie com sucesso! Código: ${omieResult.codigo_pedido}`,
            data: { omieCodigo: omieResult.codigo_pedido, numeroPedido: omieResult.numero_pedido },
            uiAction: { type: 'refreshPedidos' },
          }
        } catch (omieErr: any) {
          await supabase.from('pedidos').update({ omie_erro: omieErr.message || 'Erro ao enviar' }).eq('id', args.pedidoId)
          await db.insertAtividade({ tipo: 'omie', descricao: `[IA] Erro ao enviar pedido ${pedRow.numero} ao Omie: ${omieErr.message}`, vendedorNome: user.nome })
          return {
            success: false,
            message: `❌ Erro ao enviar pedido ${pedRow.numero} ao Omie: ${omieErr.message}`,
          }
        }
      }

      case 'listarPedidos': {
        let query = supabase.from('pedidos').select('*').order('data_criacao', { ascending: false })
        if (args.status) query = query.eq('status', args.status)
        if (args.clienteId) query = query.eq('cliente_id', args.clienteId)
        if (user.cargo !== 'gerente') query = query.eq('vendedor_id', user.id)
        const limite = Math.max(1, Math.min(100, Number(args.limite) || 20))
        query = query.limit(limite)

        const { data, error } = await query
        if (error) return { success: false, message: `Erro ao listar pedidos: ${error.message}` }
        const lista = (data || []).map((p: any) => ({
          id: p.id,
          numero: p.numero,
          clienteId: p.cliente_id,
          vendedorId: p.vendedor_id,
          status: p.status,
          tipo: p.tipo || 'venda',
          formaPagamento: p.forma_pagamento || 'À vista',
          tipoFrete: p.tipo_frete || '',
          totalValor: p.total_valor || 0,
          dataCriacao: p.data_criacao,
          dataEnvio: p.data_envio,
          omieCodigo: p.omie_codigo,
          omieStatus: p.omie_status,
        }))
        return {
          success: true,
          message: `${lista.length} pedido(s) encontrado(s).`,
          data: lista,
        }
      }

      case 'atualizarStatusPedido': {
        const { data: pedRow, error: pedErr } = await supabase.from('pedidos').select('*').eq('id', args.pedidoId).single()
        if (pedErr || !pedRow) return { success: false, message: `Pedido ID ${args.pedidoId} não encontrado.` }

        if (user.cargo !== 'gerente' && pedRow.vendedor_id !== user.id) {
          return { success: false, message: 'Você não pode alterar pedido de outro vendedor.' }
        }

        const novoStatus = String(args.novoStatus || '').toLowerCase()
        if (!['rascunho', 'enviado', 'cancelado'].includes(novoStatus)) {
          return { success: false, message: 'Status inválido. Use: rascunho, enviado ou cancelado.' }
        }

        if (novoStatus === 'enviado' && pedRow.status !== 'rascunho' && user.cargo !== 'gerente') {
          return { success: false, message: 'Vendedor só pode enviar pedidos em rascunho.' }
        }

        const updates: Record<string, any> = { status: novoStatus }
        if (novoStatus === 'enviado') updates.data_envio = new Date().toISOString()

        const { error: updErr } = await supabase.from('pedidos').update(updates).eq('id', args.pedidoId)
        if (updErr) return { success: false, message: `Erro ao atualizar pedido: ${updErr.message}` }

        await db.insertAtividade({ tipo: 'pedido', descricao: `[IA] Alterou status do pedido ${pedRow.numero} para ${novoStatus}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Pedido ${pedRow.numero} atualizado para status "${novoStatus}".`,
          uiAction: { type: 'refreshPedidos' },
        }
      }

      // ── PRODUTOS ──
      case 'searchProdutos': {
        const termo = String(args.termo || '').trim()
        if (!termo) return { success: false, message: 'Informe um termo para buscar produtos.' }
        const safeTerm = termo.replace(/[%_\\]/g, c => `\\${c}`)
        let query = supabase
          .from('produtos')
          .select('*')
          .or(`nome.ilike.%${safeTerm}%,sku.ilike.%${safeTerm}%,categoria.ilike.%${safeTerm}%`)
          .order('categoria, nome')
          .limit(30)

        const incluirInativos = !!args.incluirInativos && user.cargo === 'gerente'
        if (!incluirInativos) query = query.eq('ativo', true)

        const { data, error } = await query
        if (error) return { success: false, message: `Erro ao buscar produtos: ${error.message}` }
        const lista = (data || []).map((p: any) => ({
          id: p.id,
          nome: p.nome,
          categoria: p.categoria,
          preco: p.preco,
          unidade: p.unidade,
          sku: p.sku || '',
          ativo: !!p.ativo,
        }))
        return { success: true, message: `${lista.length} produto(s) encontrado(s).`, data: lista }
      }

      case 'createProduto': {
        const preco = args.preco !== undefined ? Math.max(0, Number(args.preco) || 0) : 0
        const payload = {
          nome: String(args.nome || '').trim(),
          categoria: String(args.categoria || '').trim(),
          unidade: String(args.unidade || '').trim(),
          preco,
          sku: args.sku ? String(args.sku).trim() : '',
          descricao: args.descricao ? String(args.descricao).trim() : '',
          ativo: args.ativo === undefined ? true : !!args.ativo,
        }
        if (!payload.nome || !payload.categoria || !payload.unidade) {
          return { success: false, message: 'Campos obrigatórios: nome, categoria e unidade.' }
        }

        const { data, error } = await supabase.from('produtos').insert(payload).select('*').single()
        if (error || !data) return { success: false, message: `Erro ao criar produto: ${error?.message || 'falha desconhecida'}` }

        await db.insertAtividade({ tipo: 'produto', descricao: `[IA] Cadastrou produto ${data.nome} (R$ ${Number(data.preco || 0).toFixed(2)})`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Produto "${data.nome}" criado com sucesso (ID: ${data.id}).`,
          data: { id: data.id, nome: data.nome },
        }
      }

      case 'updateProduto': {
        const { data: existing, error: fetchErr } = await supabase.from('produtos').select('*').eq('id', args.produtoId).single()
        if (fetchErr || !existing) return { success: false, message: `Produto ID ${args.produtoId} não encontrado.` }

        const updates: Record<string, any> = {}
        if (args.nome !== undefined) updates.nome = String(args.nome).trim()
        if (args.categoria !== undefined) updates.categoria = String(args.categoria).trim()
        if (args.unidade !== undefined) updates.unidade = String(args.unidade).trim()
        if (args.preco !== undefined) updates.preco = Math.max(0, Number(args.preco) || 0)
        if (args.sku !== undefined) updates.sku = String(args.sku || '').trim()
        if (args.descricao !== undefined) updates.descricao = String(args.descricao || '').trim()
        if (args.ativo !== undefined) updates.ativo = !!args.ativo

        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'Nenhum campo para atualizar foi informado.' }
        }

        const { error: updErr } = await supabase.from('produtos').update(updates).eq('id', args.produtoId)
        if (updErr) return { success: false, message: `Erro ao atualizar produto: ${updErr.message}` }

        const fields = Object.keys(updates).join(', ')
        await db.insertAtividade({ tipo: 'produto', descricao: `[IA] Atualizou produto ${existing.nome} (ID ${args.produtoId}) — campos: ${fields}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Produto "${existing.nome}" atualizado. Campos: ${fields}.`,
        }
      }

      case 'deleteProduto': {
        const { data: existing, error: fetchErr } = await supabase.from('produtos').select('*').eq('id', args.produtoId).single()
        if (fetchErr || !existing) return { success: false, message: `Produto ID ${args.produtoId} não encontrado.` }

        const { error: delErr } = await supabase.from('produtos').delete().eq('id', args.produtoId)
        if (delErr) return { success: false, message: `Erro ao excluir produto: ${delErr.message}` }

        await db.insertAtividade({ tipo: 'produto', descricao: `[IA] Excluiu produto ${existing.nome} (ID ${args.produtoId})`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Produto "${existing.nome}" excluído com sucesso.`,
        }
      }

      // ── INTERAÇÕES E NOTAS ──
      case 'addInteracao': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        await db.insertInteracao({
          clienteId: args.clienteId,
          tipo: args.tipo,
          data: new Date().toISOString(),
          assunto: args.assunto,
          descricao: args.descricao,
          automatico: false,
        })
        await db.insertAtividade({ tipo: args.tipo, descricao: `[IA] Registrou ${args.tipo} com ${access.cliente!.razaoSocial}: ${args.assunto}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Interação "${args.tipo}" registrada com ${access.cliente!.razaoSocial}: ${args.assunto}`,
        }
      }

      case 'addNota': {
        const access = await checkClienteAccess(args.clienteId, user)
        if (!access.allowed) return { success: false, message: access.reason! }
        const existingNotas = access.cliente!.notas || ''
        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        const newNotas = existingNotas
          ? `${existingNotas}\n\n[${timestamp} — ${user.nome} via IA] ${args.nota}`
          : `[${timestamp} — ${user.nome} via IA] ${args.nota}`
        await db.updateCliente(args.clienteId, { notas: newNotas })
        await db.insertAtividade({ tipo: 'nota', descricao: `[IA] Nota em ${access.cliente!.razaoSocial}: ${args.nota.slice(0, 80)}`, vendedorNome: user.nome })
        return {
          success: true,
          message: `✅ Nota adicionada ao cliente ${access.cliente!.razaoSocial}.`,
          uiAction: { type: 'refreshClientes' },
        }
      }

      // ── CONSULTAS ──
      case 'listarTarefas': {
        const tarefas = await db.fetchTarefasByVendedor(user.id)
        const filtered = args.status ? tarefas.filter(t => t.status === args.status) : tarefas
        if (filtered.length === 0) return { success: true, message: 'Nenhuma tarefa encontrada.', data: [] }
        const lista = filtered.map(t => ({
          id: t.id,
          titulo: t.titulo,
          data: t.data,
          hora: t.hora,
          tipo: t.tipo,
          status: t.status,
          prioridade: t.prioridade,
        }))
        return { success: true, message: `${filtered.length} tarefa(s) encontrada(s).`, data: lista }
      }

      case 'listarProdutos': {
        const produtos = await db.fetchProdutosAtivos()
        const lista = produtos.map(p => ({
          id: p.id,
          nome: p.nome,
          categoria: p.categoria,
          preco: p.preco,
          unidade: p.unidade,
          sku: p.sku,
        }))
        return { success: true, message: `${produtos.length} produto(s) ativo(s).`, data: lista }
      }

      default:
        return { success: false, message: `Função "${name}" não reconhecida.` }
    }
  } catch (error: any) {
    log.error({ error, functionName: name, args }, 'Erro ao executar função IA')
    return { success: false, message: `Erro ao executar "${name}": ${error.message}` }
  }
}
