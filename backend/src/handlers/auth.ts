import * as db from '../database.js'
import { createSession, deleteSession, getSession } from '../session.js'
import { log } from '../logger.js'

export async function handleLogin(senderNumber: string, text: string): Promise<string> {
  const parts = text.split(/\s+/)
  if (parts.length < 3) {
    return '⚠️ Formato: *login seu@email.com suasenha*'
  }

  const email = parts[1]
  const password = parts.slice(2).join(' ')

  try {
    const authData = await db.signIn(email, password)
    if (!authData.user) {
      return '❌ Email ou senha inválidos.'
    }

    const vendedor = await db.getVendedorByAuthId(authData.user.id)
    if (!vendedor) {
      return '❌ Usuário não encontrado na equipe do CRM.'
    }

    if (!vendedor.ativo) {
      return '❌ Sua conta está desativada. Fale com o gerente.'
    }

    createSession(senderNumber, vendedor)

    const cargoLabel = { gerente: 'Gerente', vendedor: 'Vendedor', sdr: 'SDR' }[vendedor.cargo] || vendedor.cargo

    return `✅ Olá, *${vendedor.nome}*! (${cargoLabel})\n\n` + getMenuText()
  } catch (err: any) {
    const msg = err?.message || 'Erro desconhecido'
    if (msg.includes('Invalid login credentials')) {
      return '❌ Email ou senha inválidos.'
    }
    log.error({ err }, 'Erro no login')
    return '❌ Erro ao fazer login. Tente novamente.'
  }
}

export function handleLogout(senderNumber: string): string {
  const session = getSession(senderNumber)
  if (!session) {
    return '⚠️ Você não está logado.'
  }
  deleteSession(senderNumber)
  return `👋 Até logo, *${session.vendedor.nome}*! Sessão encerrada.`
}

export function getMenuText(): string {
  return `📋 *Menu Principal*

1️⃣ Meus clientes
2️⃣ Novo cliente
3️⃣ Registrar venda
4️⃣ Minhas tarefas
5️⃣ Meu pipeline
6️⃣ Buscar cliente
7️⃣ 🤖 Assistente IA
0️⃣ Sair

_Digite o número ou a palavra-chave._`
}

export function getWelcomeText(): string {
  return `👋 *Bem-vindo ao CRM Grupo MF Paris!*

Para acessar o sistema, envie:
*login seu@email.com suasenha*

Exemplo:
_login rafael@mfparis.com.br minhasenha_`
}
