import * as db from '../database.js'
import { updateSession, type UserSession } from '../session.js'
import { getMenuText } from './auth.js'

export async function handleTarefas(senderNumber: string, session: UserSession): Promise<string> {
  const tarefas = await db.fetchTarefasByVendedor(session.vendedor.id)
  const hoje = new Date().toISOString().split('T')[0]

  const pendentes = tarefas.filter(t => t.status === 'pendente')
  const atrasadas = pendentes.filter(t => t.data < hoje)
  const deHoje = pendentes.filter(t => t.data === hoje)
  const futuras = pendentes.filter(t => t.data > hoje).slice(0, 5)

  if (pendentes.length === 0) {
    return '✅ Nenhuma tarefa pendente! Bom trabalho.\n\n' + getMenuText()
  }

  // Carregar nomes dos clientes em batch (1 query) ao invés de N queries
  const allTarefas = [...atrasadas, ...deHoje, ...futuras]
  const clienteIds = [...new Set(allTarefas.filter(t => t.clienteId).map(t => t.clienteId!))]
  const clientes = clienteIds.length > 0 ? await db.fetchClientesByIds(clienteIds) : []
  const clienteNomeMap = new Map(clientes.map(c => [c.id, c.razaoSocial]))

  // Guardar IDs para poder marcar como concluída
  const allIds = allTarefas.map(t => t.id)
  updateSession(senderNumber, {
    state: 'viewing_client_list',
    clientListIds: allIds,
    listType: 'tarefas',
  })

  let msg = `📋 *Suas tarefas* (${pendentes.length} pendentes)\n\n`

  let idx = 1
  if (atrasadas.length > 0) {
    msg += `🔴 *Atrasadas (${atrasadas.length}):*\n`
    for (const t of atrasadas) {
      const diasAtraso = Math.floor((Date.now() - new Date(t.data).getTime()) / 86400000)
      const cliente = t.clienteId ? clienteNomeMap.get(t.clienteId) || '' : ''
      msg += `*${idx}.* ${t.titulo}${cliente ? ` — ${cliente}` : ''} _(${diasAtraso}d atrás)_\n`
      idx++
    }
    msg += '\n'
  }

  if (deHoje.length > 0) {
    msg += `🟡 *Hoje (${deHoje.length}):*\n`
    for (const t of deHoje) {
      const cliente = t.clienteId ? clienteNomeMap.get(t.clienteId) || '' : ''
      msg += `*${idx}.* ${t.titulo}${cliente ? ` — ${cliente}` : ''}${t.hora ? ` (${t.hora})` : ''}\n`
      idx++
    }
    msg += '\n'
  }

  if (futuras.length > 0) {
    msg += `🟢 *Próximas (${futuras.length}):*\n`
    for (const t of futuras) {
      const cliente = t.clienteId ? clienteNomeMap.get(t.clienteId) || '' : ''
      msg += `*${idx}.* ${t.titulo}${cliente ? ` — ${cliente}` : ''} _(${formatDate(t.data)})_\n`
      idx++
    }
    msg += '\n'
  }

  msg += `⏰ Atrasadas: ${atrasadas.length} | Hoje: ${deHoje.length} | Próximas: ${futuras.length}\n\n`
  msg += `✅ Envie o *número* para marcar como concluída\n`
  msg += `🔙 Envie *menu* para voltar`

  return msg
}

export async function handleTarefaConcluir(senderNumber: string, session: UserSession, text: string): Promise<string> {
  const ids = session.clientListIds || []
  const num = parseInt(text, 10)

  if (isNaN(num) || num < 1 || num > ids.length) {
    updateSession(senderNumber, { state: 'logged_in' })
    return '⚠️ Número inválido.\n\n' + getMenuText()
  }

  const tarefaId = ids[num - 1]
  try {
    await db.updateTarefaStatus(tarefaId, 'concluida')
    updateSession(senderNumber, { state: 'logged_in' })
    return `✅ Tarefa #${num} marcada como concluída!\n\n` + getMenuText()
  } catch (err) {
    console.error('Erro ao concluir tarefa:', err)
    return '❌ Erro ao concluir tarefa.\n\n' + getMenuText()
  }
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('pt-BR')
  } catch {
    return d
  }
}
