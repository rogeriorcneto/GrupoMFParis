import * as db from '../database.js'
import { getSession, updateSession, type UserSession, type CreateClientData } from '../session.js'
import { getMenuText } from './auth.js'
import { STAGE_LABELS } from '../constants.js'
import { log } from '../logger.js'

function formatCurrency(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ============================================
// LISTAR MEUS CLIENTES
// ============================================

export async function handleListClientes(senderNumber: string, session: UserSession, text?: string): Promise<string> {
  const isGerente = session.vendedor.cargo === 'gerente'
  const clientes = isGerente
    ? await db.fetchClientes()
    : await db.fetchClientesByVendedor(session.vendedor.id)

  const ativos = clientes.filter(c => c.etapa !== 'perdido')
  if (ativos.length === 0) {
    return '📋 Você não tem clientes ativos no momento.\n\n' + getMenuText()
  }

  // Paginação
  const PAGE_SIZE = 10
  const page = session.clientListPage || 0
  const start = page * PAGE_SIZE
  const pageClientes = ativos.slice(start, start + PAGE_SIZE)
  const totalPages = Math.ceil(ativos.length / PAGE_SIZE)

  // Salvar IDs para referência
  const allIds = ativos.map(c => c.id)
  updateSession(senderNumber, {
    state: 'viewing_client_list',
    clientListPage: page,
    clientListIds: allIds,
    listType: 'clientes',
  })

  let msg = `📋 *Seus clientes* (${ativos.length} ativos)\n\n`
  pageClientes.forEach((c, i) => {
    const idx = start + i + 1
    const stage = STAGE_LABELS[c.etapa] || c.etapa
    msg += `*${idx}.* ${c.razaoSocial} — ${stage} — Score ${c.score || 0} — ${formatCurrency(c.valorEstimado || 0)}\n`
  })

  msg += `\n📄 Página ${page + 1}/${totalPages}`
  if (page + 1 < totalPages) msg += ` — envie *+* para próxima`
  if (page > 0) msg += ` — envie *-* para anterior`
  msg += `\n📌 Envie o *número* para ver detalhes`
  msg += `\n🔙 Envie *menu* para voltar`

  return msg
}

export async function handleClientListNavigation(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const ids = session.clientListIds || []
  const currentPage = session.clientListPage || 0

  if (text === '+') {
    const maxPage = Math.ceil(ids.length / 10) - 1
    if (currentPage < maxPage) {
      updateSession(senderNumber, { clientListPage: currentPage + 1 })
      return handleListClientes(senderNumber, { ...session, clientListPage: currentPage + 1 })
    }
    return '📄 Você já está na última página.'
  }

  if (text === '-') {
    if (currentPage > 0) {
      updateSession(senderNumber, { clientListPage: currentPage - 1 })
      return handleListClientes(senderNumber, { ...session, clientListPage: currentPage - 1 })
    }
    return '📄 Você já está na primeira página.'
  }

  // Número → ver detalhes
  const num = parseInt(text, 10)
  if (!isNaN(num) && num >= 1 && num <= ids.length) {
    const clienteId = ids[num - 1]
    return handleClienteInfo(senderNumber, session, clienteId)
  }

  updateSession(senderNumber, { state: 'logged_in' })
  return '⚠️ Opção inválida.\n\n' + getMenuText()
}

// ============================================
// INFO CLIENTE
// ============================================

async function handleClienteInfo(senderNumber: string, session: UserSession, clienteId: number): Promise<string> {
  const c = await db.fetchClienteById(clienteId)
  if (!c) {
    return '❌ Cliente não encontrado.'
  }

  // Verificar permissão: vendedor só vê seus próprios clientes
  if (session.vendedor.cargo !== 'gerente' && c.vendedorId !== session.vendedor.id) {
    return '❌ Cliente não encontrado.'
  }

  updateSession(senderNumber, { state: 'logged_in' })

  const stage = STAGE_LABELS[c.etapa] || c.etapa
  let msg = `📊 *${c.razaoSocial}*\n`
  if (c.nomeFantasia) msg += `├ Fantasia: ${c.nomeFantasia}\n`
  if (c.cnpj) msg += `├ CNPJ: ${c.cnpj}\n`
  if (c.contatoNome) msg += `├ Contato: ${c.contatoNome}`
  if (c.contatoTelefone) msg += ` — ${c.contatoTelefone}`
  msg += '\n'
  if (c.contatoEmail) msg += `├ Email: ${c.contatoEmail}\n`
  if (c.endereco) msg += `├ Endereço: ${c.endereco}\n`
  msg += `├ Etapa: ${stage}\n`
  msg += `├ Score: ${c.score || 0}/100\n`
  msg += `├ Valor estimado: ${formatCurrency(c.valorEstimado || 0)}\n`
  if (c.valorProposta) msg += `├ Proposta: ${formatCurrency(c.valorProposta)}${c.dataProposta ? ` (${formatDate(c.dataProposta)})` : ''}\n`
  msg += `├ Dias inativo: ${c.diasInativo || 0}\n`
  if (c.dataUltimoPedido) msg += `├ Último pedido: ${formatDate(c.dataUltimoPedido)}\n`
  if (c.statusEntrega) msg += `├ Entrega: ${c.statusEntrega}\n`
  if (c.statusFaturamento) msg += `├ Faturamento: ${c.statusFaturamento === 'faturado' ? '✅ Faturado' : '⏳ A faturar'}\n`
  if (c.notas) msg += `├ Notas: ${c.notas.slice(0, 100)}\n`
  msg += `└ Origem: ${c.origemLead || 'Não informada'}\n`
  msg += `\n🔙 Envie *menu* para voltar`

  return msg
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('pt-BR')
  } catch {
    return d
  }
}

// ============================================
// NOVO CLIENTE (state machine)
// ============================================

export function startCreateClient(senderNumber: string): string {
  updateSession(senderNumber, {
    state: 'creating_client',
    createClientData: { step: 'razaoSocial' },
  })
  return '➕ *Novo Cliente*\n\nQual a *Razão Social*?'
}

export async function handleCreateClientStep(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const data = session.createClientData!
  const lower = text.toLowerCase().trim()

  if (lower === 'cancelar') {
    updateSession(senderNumber, { state: 'logged_in', createClientData: undefined })
    return '❌ Cadastro cancelado.\n\n' + getMenuText()
  }

  switch (data.step) {
    case 'razaoSocial':
      data.razaoSocial = text.trim()
      data.step = 'cnpj'
      updateSession(senderNumber, { createClientData: data })
      return `CNPJ? (ou envie *pular*)`

    case 'cnpj':
      data.cnpj = lower === 'pular' ? '' : text.trim()
      data.step = 'contatoNome'
      updateSession(senderNumber, { createClientData: data })
      return 'Nome do *contato*?'

    case 'contatoNome':
      data.contatoNome = text.trim()
      data.step = 'contatoTelefone'
      updateSession(senderNumber, { createClientData: data })
      return 'Telefone do contato?'

    case 'contatoTelefone':
      data.contatoTelefone = text.trim()
      data.step = 'contatoEmail'
      updateSession(senderNumber, { createClientData: data })
      return 'Email do contato? (ou *pular*)'

    case 'contatoEmail':
      data.contatoEmail = lower === 'pular' ? '' : text.trim()
      data.step = 'confirm'
      updateSession(senderNumber, { createClientData: data })

      return `📋 *Confirme os dados:*\n\n` +
        `├ Razão Social: *${data.razaoSocial}*\n` +
        `├ CNPJ: ${data.cnpj || '—'}\n` +
        `├ Contato: ${data.contatoNome}\n` +
        `├ Telefone: ${data.contatoTelefone}\n` +
        `└ Email: ${data.contatoEmail || '—'}\n\n` +
        `Envie *sim* para confirmar ou *cancelar* para desistir.`

    case 'confirm':
      if (lower === 'sim') {
        return saveNewClient(senderNumber, session, data)
      }
      updateSession(senderNumber, { state: 'logged_in', createClientData: undefined })
      return '❌ Cadastro cancelado.\n\n' + getMenuText()
  }

  return '⚠️ Resposta não reconhecida. Envie *cancelar* para sair do cadastro.'
}

async function saveNewClient(senderNumber: string, session: UserSession, data: CreateClientData): Promise<string> {
  try {
    const now = new Date().toISOString()
    const saved = await db.insertCliente({
      razaoSocial: data.razaoSocial!,
      cnpj: data.cnpj || '',
      contatoNome: data.contatoNome || '',
      contatoTelefone: data.contatoTelefone || '',
      contatoEmail: data.contatoEmail || '',
      etapa: 'prospecção',
      ultimaInteracao: now.split('T')[0],
      diasInativo: 0,
      score: 10,
      vendedorId: session.vendedor.id,
    } as any)

    try { await db.criarTarefasAutomaticasNovoCliente(saved) } catch { /* non-critical */ }

    await db.insertInteracao({
      clienteId: saved.id,
      tipo: 'whatsapp',
      data: now,
      assunto: 'Novo cliente (bot WhatsApp)',
      descricao: `Cliente cadastrado por ${session.vendedor.nome} via WhatsApp Bot`,
      automatico: true,
    } as any)

    await db.insertAtividade({
      tipo: 'cadastro',
      descricao: `${saved.razaoSocial} cadastrado via WhatsApp Bot`,
      vendedorNome: session.vendedor.nome,
    })

    updateSession(senderNumber, { state: 'logged_in', createClientData: undefined })

    return `✅ *Cliente cadastrado!*\n\n` +
      `├ ${saved.razaoSocial}\n` +
      `├ CNPJ: ${saved.cnpj || '—'}\n` +
      `├ Contato: ${saved.contatoNome}\n` +
      `├ Etapa: Prospecção\n` +
      `└ Score: 10\n\n` +
      getMenuText()
  } catch (err) {
    log.error({ err }, 'Erro ao cadastrar cliente')
    updateSession(senderNumber, { state: 'logged_in', createClientData: undefined })
    return '❌ Erro ao cadastrar cliente. Tente novamente.\n\n' + getMenuText()
  }
}

// ============================================
// BUSCAR CLIENTE
// ============================================

export function startSearch(senderNumber: string): string {
  updateSession(senderNumber, { state: 'searching_client' })
  return '🔍 Digite o *nome* ou *CNPJ* do cliente:'
}

export async function handleSearch(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const isGerente = session.vendedor.cargo === 'gerente'
  const results = await db.searchClientes(text, isGerente ? undefined : session.vendedor.id)

  updateSession(senderNumber, { state: 'logged_in' })

  if (results.length === 0) {
    return `🔍 Nenhum resultado para "${text}".\n\n` + getMenuText()
  }

  // Save IDs for selection
  updateSession(senderNumber, {
    state: 'viewing_client_list',
    clientListPage: 0,
    clientListIds: results.map(c => c.id),
    listType: 'clientes',
  })

  let msg = `🔍 *Resultados para "${text}":*\n\n`
  results.forEach((c, i) => {
    const stage = STAGE_LABELS[c.etapa] || c.etapa
    msg += `*${i + 1}.* ${c.razaoSocial} — ${stage} — Score ${c.score || 0}\n`
  })
  msg += `\n📌 Envie o *número* para ver detalhes`
  msg += `\n🔙 Envie *menu* para voltar`

  return msg
}
