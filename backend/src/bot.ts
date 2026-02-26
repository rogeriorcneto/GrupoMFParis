import { getSession } from './session.js'
import { handleLogin, handleLogout, getWelcomeText, getMenuText } from './handlers/auth.js'
import { handleMenu } from './handlers/menu.js'
import {
  handleListClientes,
  handleClientListNavigation,
  startCreateClient,
  handleCreateClientStep,
  startSearch,
  handleSearch,
} from './handlers/clientes.js'
import { startCreateSale, handleCreateSaleStep } from './handlers/vendas.js'
import { handleTarefas } from './handlers/tarefas.js'
import { handleTarefaConcluir } from './handlers/tarefas.js'
import { handlePipeline } from './handlers/pipeline.js'

// Rate limiting: max 30 messages per minute per number
const rateLimits = new Map<string, number[]>()
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

function checkRateLimit(senderNumber: string): boolean {
  const now = Date.now()
  const timestamps = rateLimits.get(senderNumber) || []
  const recent = timestamps.filter(t => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_LIMIT) return false
  recent.push(now)
  rateLimits.set(senderNumber, recent)
  return true
}

/**
 * Central message handler.
 * Receives a WhatsApp message and returns the reply text.
 */
export async function handleMessage(senderNumber: string, text: string): Promise<string> {
  // Rate limit
  if (!checkRateLimit(senderNumber)) {
    return '⚠️ Muitas mensagens. Aguarde um momento.'
  }

  const lower = text.toLowerCase().trim()
  const session = getSession(senderNumber)

  // ─── Not logged in ───
  if (!session) {
    if (lower.startsWith('login ')) {
      return handleLogin(senderNumber, text)
    }
    return getWelcomeText()
  }

  // ─── Global commands (work in any state) ───
  if (lower === 'menu' || lower === 'm') {
    // Reset state to logged_in
    const { updateSession } = await import('./session.js')
    updateSession(senderNumber, {
      state: 'logged_in',
      createClientData: undefined,
      createSaleData: undefined,
      clientListPage: undefined,
      clientListIds: undefined,
    })
    return getMenuText()
  }

  if (lower === '0' || lower === 'sair' || lower === 'logout') {
    return handleLogout(senderNumber)
  }

  // ─── State-specific handling ───
  switch (session.state) {
    case 'creating_client':
      return handleCreateClientStep(senderNumber, session, text)

    case 'creating_sale':
      return handleCreateSaleStep(senderNumber, session, text)

    case 'searching_client':
      return handleSearch(senderNumber, session, text)

    case 'viewing_client_list':
      if (session.listType === 'tarefas') {
        // Tarefas: só aceita números para concluir (não suporta +/-)
        if (!isNaN(parseInt(lower, 10))) {
          return handleTarefaConcluir(senderNumber, session, text)
        }
        // Qualquer outra coisa: volta ao menu
        break
      }
      // Clientes: aceita +, -, e números
      if (lower === '+' || lower === '-' || !isNaN(parseInt(lower, 10))) {
        return handleClientListNavigation(senderNumber, session, text)
      }
      // Fall through to menu commands
      break
  }

  // ─── Menu commands (logged_in state) ───
  switch (lower) {
    case '1':
    case 'clientes':
    case 'meus clientes':
      return handleListClientes(senderNumber, session)

    case '2':
    case 'novo':
    case 'novo cliente':
      return startCreateClient(senderNumber)

    case '3':
    case 'venda':
    case 'vender':
    case 'pedido':
      return startCreateSale(senderNumber, session)

    case '4':
    case 'tarefas':
    case 'minhas tarefas':
      return handleTarefas(senderNumber, session)

    case '5':
    case 'pipeline':
    case 'meu pipeline':
      return handlePipeline(session)

    case '6':
    case 'buscar':
    case 'busca':
    case 'procurar':
      return startSearch(senderNumber)

    default:
      // If viewing list and typed a number
      if (session.state === 'viewing_client_list') {
        return handleClientListNavigation(senderNumber, session, text)
      }

      return `⚠️ Não entendi "${text}".\n\n` + getMenuText()
  }
}
