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
    description: 'Cria um novo pedido para um cliente. Requer lista de itens com produtoId e quantidade. O vendedor só pode criar pedidos para seus clientes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'INTEGER', description: 'ID do cliente' },
        itens: {
          type: 'ARRAY',
          description: 'Lista de itens do pedido',
          items: {
            type: 'OBJECT',
            properties: {
              produtoId: { type: 'INTEGER', description: 'ID do produto' },
              quantidade: { type: 'NUMBER', description: 'Quantidade' },
            },
            required: ['produtoId', 'quantidade'],
          },
        },
        observacoes: { type: 'STRING', description: 'Observações do pedido (opcional)' },
      },
      required: ['clienteId', 'itens'],
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
            unidade: prod.unidade,
            preco: prod.preco,
            quantidade: item.quantidade,
          })
          totalValor += subtotal
        }
        const now = new Date()
        const numero = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
        const pedido = await db.insertPedido({
          numero,
          clienteId: args.clienteId,
          vendedorId: user.id,
          itens,
          observacoes: args.observacoes || '',
          status: 'rascunho',
          dataCriacao: now.toISOString(),
          totalValor,
        })
        await db.insertAtividade({ tipo: 'pedido', descricao: `[IA] Criou pedido ${numero} para ${access.cliente!.razaoSocial} — R$${totalValor.toFixed(2)}`, vendedorNome: user.nome })
        const resumo = itens.map(i => `${i.nomeProduto} x${i.quantidade}`).join(', ')
        return {
          success: true,
          message: `✅ Pedido ${numero} criado para ${access.cliente!.razaoSocial}.\nItens: ${resumo}\nTotal: R$ ${totalValor.toFixed(2)}\nStatus: rascunho (precisa ser enviado para aprovação).`,
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
