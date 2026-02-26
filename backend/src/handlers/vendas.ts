import * as db from '../database.js'
import { getSession, updateSession, type UserSession, type CreateSaleData } from '../session.js'
import { getMenuText } from './auth.js'
import { log } from '../logger.js'

const CAT_LABELS: Record<string, string> = {
  sacaria: 'Sacaria 25kg', okey_lac: 'Okey Lac 25kg', varejo_lacteo: 'Varejo Lácteo', cafe: 'Café', outros: 'Outros',
}

function formatCurrency(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Cache de produtos (reload a cada 5 min)
let produtosCache: db.Produto[] = []
let produtosCacheTime = 0
async function getProdutos(): Promise<db.Produto[]> {
  if (Date.now() - produtosCacheTime > 5 * 60 * 1000 || produtosCache.length === 0) {
    produtosCache = await db.fetchProdutosAtivos()
    produtosCacheTime = Date.now()
  }
  return produtosCache
}

// ============================================
// INICIAR VENDA
// ============================================

const SALE_PAGE_SIZE = 15

export async function startCreateSale(senderNumber: string, session: UserSession): Promise<string> {
  const isGerente = session.vendedor.cargo === 'gerente'
  const clientes = isGerente
    ? await db.fetchClientes()
    : await db.fetchClientesByVendedor(session.vendedor.id)

  const ativos = clientes.filter(c => c.etapa !== 'perdido')
  if (ativos.length === 0) {
    return '⚠️ Você não tem clientes ativos para registrar venda.\n\n' + getMenuText()
  }

  // Salvar IDs para seleção com paginação
  updateSession(senderNumber, {
    state: 'creating_sale',
    createSaleData: { step: 'selectClient', itens: [] },
    clientListIds: ativos.map(c => c.id),
    clientListPage: 0,
  })

  return buildClientSelectionPage(ativos, 0)
}

function buildClientSelectionPage(ativos: db.Cliente[], page: number): string {
  const start = page * SALE_PAGE_SIZE
  const pageClientes = ativos.slice(start, start + SALE_PAGE_SIZE)
  const totalPages = Math.ceil(ativos.length / SALE_PAGE_SIZE)

  let msg = `🛒 *Nova Venda* — Selecione o cliente:\n\n`
  pageClientes.forEach((c, i) => {
    msg += `*${start + i + 1}.* ${c.razaoSocial}\n`
  })
  msg += `\n📄 Página ${page + 1}/${totalPages} (${ativos.length} clientes)`
  if (page + 1 < totalPages) msg += `\n➡️ Envie *+* para próxima página`
  if (page > 0) msg += `\n⬅️ Envie *-* para página anterior`
  msg += `\n🔍 Envie *buscar [nome]* para filtrar`
  msg += `\n❌ Envie *cancelar* para sair`

  return msg
}

// ============================================
// STATE MACHINE DA VENDA
// ============================================

export async function handleCreateSaleStep(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const data = session.createSaleData!
  const lower = text.toLowerCase().trim()

  if (lower === 'cancelar') {
    updateSession(senderNumber, { state: 'logged_in', createSaleData: undefined })
    return '❌ Venda cancelada.\n\n' + getMenuText()
  }

  switch (data.step) {
    case 'selectClient':
      return handleSelectClient(senderNumber, session, text)

    case 'selectProduct':
      return handleSelectProduct(senderNumber, session, text)

    case 'addMore':
      if (lower === 'finalizar' || lower === 'f') {
        data.step = 'observacoes'
        updateSession(senderNumber, { createSaleData: data })
        return 'Observações? (ou envie *pular*)'
      }
      // Interpret as product selection
      return handleSelectProduct(senderNumber, session, text)

    case 'observacoes':
      data.observacoes = lower === 'pular' ? '' : text.trim()
      data.step = 'confirm'
      updateSession(senderNumber, { createSaleData: data })
      return buildSaleConfirmation(data)

    case 'confirm':
      if (lower === 'sim') {
        return saveSale(senderNumber, session, data)
      }
      if (lower === 'enviar') {
        return saveSale(senderNumber, session, data, 'enviado')
      }
      updateSession(senderNumber, { state: 'logged_in', createSaleData: undefined })
      return '❌ Venda cancelada.\n\n' + getMenuText()
  }

  return '⚠️ Resposta não reconhecida. Envie *cancelar* para sair.'
}

async function handleSelectClient(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const ids = session.clientListIds || []
  const currentPage = session.clientListPage || 0
  const lower = text.toLowerCase().trim()

  // Paginação: + e -
  if (lower === '+') {
    const maxPage = Math.ceil(ids.length / SALE_PAGE_SIZE) - 1
    if (currentPage < maxPage) {
      const newPage = currentPage + 1
      updateSession(senderNumber, { clientListPage: newPage })
      const clientes = await db.fetchClientesByIds(ids)
      const ativos = ids.map(id => clientes.find(c => c.id === id)).filter(Boolean) as db.Cliente[]
      return buildClientSelectionPage(ativos, newPage)
    }
    return '📄 Você já está na última página.'
  }
  if (lower === '-') {
    if (currentPage > 0) {
      const newPage = currentPage - 1
      updateSession(senderNumber, { clientListPage: newPage })
      const clientes = await db.fetchClientesByIds(ids)
      const ativos = ids.map(id => clientes.find(c => c.id === id)).filter(Boolean) as db.Cliente[]
      return buildClientSelectionPage(ativos, newPage)
    }
    return '📄 Você já está na primeira página.'
  }

  // Busca por nome
  if (lower.startsWith('buscar ')) {
    const termo = text.slice(7).trim()
    if (!termo) return '⚠️ Envie *buscar [nome]* para filtrar.'
    const isGerente = session.vendedor.cargo === 'gerente'
    const results = await db.searchClientes(termo, isGerente ? undefined : session.vendedor.id)
    const ativos = results.filter(c => c.etapa !== 'perdido')
    if (ativos.length === 0) return `🔍 Nenhum cliente ativo encontrado para "${termo}". Tente outro nome.`
    updateSession(senderNumber, { clientListIds: ativos.map(c => c.id), clientListPage: 0 })
    return buildClientSelectionPage(ativos, 0)
  }

  // Seleção por número
  const num = parseInt(text, 10)
  if (isNaN(num) || num < 1 || num > ids.length) {
    return '⚠️ Número inválido. Envie o número, *+*/*-* para navegar, ou *buscar [nome]*.'
  }

  const clienteId = ids[num - 1]
  const cliente = await db.fetchClienteById(clienteId)

  if (!cliente) {
    return '❌ Cliente não encontrado.'
  }

  const data = session.createSaleData!
  data.clienteId = clienteId
  data.clienteNome = cliente.razaoSocial
  data.step = 'selectProduct'
  updateSession(senderNumber, { createSaleData: data })

  return buildProductCatalog(cliente.razaoSocial, senderNumber)
}

async function buildProductCatalog(clienteNome: string, senderNumber: string): Promise<string> {
  const produtos = await getProdutos()
  if (produtos.length === 0) {
    return '⚠️ Nenhum produto ativo no catálogo.'
  }

  // Agrupar por categoria
  const byCategory = new Map<string, db.Produto[]>()
  for (const p of produtos) {
    const cat = p.categoria
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(p)
  }

  let msg = `📦 *Catálogo de Produtos* (${clienteNome})\n\n`
  let idx = 1
  const indexMap: number[] = [] // Track display index → produto.id

  for (const [cat, prods] of byCategory) {
    msg += `*${CAT_LABELS[cat] || cat}*\n`
    for (const p of prods) {
      msg += `${idx}. ${p.nome} — ${formatCurrency(p.preco)}/${p.unidade}\n`
      indexMap.push(p.id)
      idx++
    }
    msg += '\n'
  }

  // Store mapping in session so handleSelectProduct uses correct IDs
  const { updateSession } = await import('../session.js')
  const session = (await import('../session.js')).getSession(senderNumber)
  if (session?.createSaleData) {
    session.createSaleData.productIndexMap = indexMap
    updateSession(senderNumber, { createSaleData: session.createSaleData })
  }

  msg += `Envie: *[número] [quantidade]*\nEx: _1 50_ = 50 unidades do item 1\n\n❌ Envie *cancelar* para sair`

  return msg
}

async function handleSelectProduct(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const parts = text.trim().split(/\s+/)
  if (parts.length < 2) {
    return '⚠️ Formato: *[número do produto] [quantidade]*\nEx: _1 50_'
  }

  const prodNum = parseInt(parts[0], 10)
  const qty = parseInt(parts[1], 10)

  if (isNaN(prodNum) || isNaN(qty) || qty <= 0) {
    return '⚠️ Número ou quantidade inválida. Ex: _1 50_'
  }

  const produtos = await getProdutos()
  const data = session.createSaleData!
  const indexMap = data.productIndexMap
  const maxItems = indexMap ? indexMap.length : produtos.length

  if (prodNum < 1 || prodNum > maxItems) {
    return `⚠️ Produto ${prodNum} não existe. Escolha entre 1 e ${maxItems}.`
  }

  // Use indexMap for correct product lookup (matches category-grouped display order)
  const produtoId = indexMap ? indexMap[prodNum - 1] : produtos[prodNum - 1].id
  const produto = produtos.find(p => p.id === produtoId) || produtos[prodNum - 1]

  // Add or update item
  const existing = data.itens.find(i => i.produtoId === produto.id)
  if (existing) {
    existing.quantidade = qty
  } else {
    data.itens.push({
      produtoId: produto.id,
      nomeProduto: produto.nome,
      unidade: produto.unidade,
      sku: produto.sku,
      preco: produto.preco,
      quantidade: qty,
    })
  }

  data.step = 'addMore'
  updateSession(senderNumber, { createSaleData: data })

  const total = data.itens.reduce((sum, i) => sum + i.preco * i.quantidade, 0)
  const itemLine = `✅ ${qty}x ${produto.nome} = ${formatCurrency(produto.preco * qty)}`

  let msg = `${itemLine}\n\n📋 *Itens do pedido:*\n`
  data.itens.forEach(i => {
    msg += `├ ${i.quantidade}x ${i.nomeProduto} — ${formatCurrency(i.preco * i.quantidade)}\n`
  })
  msg += `└ *Total: ${formatCurrency(total)}*\n\n`
  msg += `Adicionar mais? Envie *[número] [qtd]* ou *finalizar*`

  return msg
}

function buildSaleConfirmation(data: CreateSaleData): string {
  const total = data.itens.reduce((sum, i) => sum + i.preco * i.quantidade, 0)
  let msg = `📋 *Confirme o pedido:*\n\n`
  msg += `├ Cliente: *${data.clienteNome}*\n`
  data.itens.forEach(i => {
    msg += `├ ${i.quantidade}x ${i.nomeProduto} — ${formatCurrency(i.preco * i.quantidade)}\n`
  })
  msg += `├ *Total: ${formatCurrency(total)}*\n`
  if (data.observacoes) msg += `└ Obs: ${data.observacoes}\n`
  else msg += `└ Sem observações\n`
  msg += `\nEnvie *sim* para salvar como rascunho`
  msg += `\nEnvie *enviar* para salvar e enviar`
  msg += `\nEnvie *cancelar* para desistir`
  return msg
}

async function saveSale(senderNumber: string, session: UserSession, data: CreateSaleData, status: string = 'rascunho'): Promise<string> {
  try {
    const numero = `PED-${Date.now().toString().slice(-6)}`
    const now = new Date().toISOString()
    const total = data.itens.reduce((sum, i) => sum + i.preco * i.quantidade, 0)

    const pedido = await db.insertPedido({
      numero,
      clienteId: data.clienteId!,
      vendedorId: session.vendedor.id,
      itens: data.itens,
      observacoes: data.observacoes || '',
      status,
      dataCriacao: now,
      dataEnvio: status === 'enviado' ? now : undefined,
      totalValor: total,
    } as any)

    await db.insertAtividade({
      tipo: 'venda',
      descricao: `Pedido ${numero} (${formatCurrency(total)}) — ${data.clienteNome} — via WhatsApp Bot`,
      vendedorNome: session.vendedor.nome,
    })

    updateSession(senderNumber, { state: 'logged_in', createSaleData: undefined })

    const statusLabel = status === 'enviado' ? '📤 Enviado' : '📝 Rascunho'
    return `✅ *Pedido ${numero} criado!*\n\n` +
      `├ Cliente: ${data.clienteNome}\n` +
      `├ Itens: ${data.itens.length} produto(s)\n` +
      `├ Total: ${formatCurrency(total)}\n` +
      `├ Status: ${statusLabel}\n` +
      (data.observacoes ? `└ Obs: ${data.observacoes}\n` : `└ Sem observações\n`) +
      `\n` + getMenuText()
  } catch (err) {
    log.error({ err }, 'Erro ao criar pedido')
    updateSession(senderNumber, { state: 'logged_in', createSaleData: undefined })
    return '❌ Erro ao criar pedido. Tente novamente.\n\n' + getMenuText()
  }
}
