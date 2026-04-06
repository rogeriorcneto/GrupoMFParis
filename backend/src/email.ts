import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import * as db from './database.js'
import { getEmailConfig, getImapConfig, invalidateConfigCache } from './config-store.js'
import { STAGE_LABELS } from './constants.js'
import { log } from './logger.js'

let transporter: Transporter | null = null
let currentFrom: string = ''

export async function initEmail(): Promise<boolean> {
  return reloadEmail()
}

/**
 * Recarrega a configuração de email (chamado ao salvar config pelo CRM)
 */
export async function reloadEmail(): Promise<boolean> {
  // Invalidate cache to force re-read from DB
  invalidateConfigCache()

  const cfg = await getEmailConfig()
  if (!cfg) {
    transporter = null
    currentFrom = ''
    log.info('📧 Email não configurado (host/user/pass vazio)')
    return false
  }

  log.info({ host: cfg.host, port: cfg.port, user: cfg.user, from: cfg.from, passLen: cfg.pass?.length }, '📧 Criando transporter SMTP')

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false,
    },
  })

  currentFrom = cfg.from || cfg.user

  // Verify connection immediately
  try {
    await transporter.verify()
    log.info(`📧 Email configurado e verificado: ${currentFrom}`)
  } catch (err: any) {
    log.error({ err: err?.message, host: cfg.host, port: cfg.port }, '📧 Transporter criado mas verify falhou')
    // Keep transporter alive — some servers reject verify but allow send
  }

  return true
}

export function isEmailConfigured(): boolean {
  return transporter !== null
}

export function getEmailStatus() {
  return {
    configured: transporter !== null,
    from: currentFrom,
  }
}

/**
 * Substitui variáveis no template com dados reais
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}


export interface SendEmailParams {
  to: string
  subject: string
  body: string
  clienteId?: number
  vendedorNome?: string
}

export interface InboxEmailItem {
  id: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  bodyText: string
  unread: boolean
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!transporter) {
    log.warn({ to: params.to, subject: params.subject }, '📧 sendEmail chamado mas transporter é null')
    return { success: false, error: 'Email não configurado. Vá em Integrações → Email e salve a configuração.' }
  }

  log.info({ to: params.to, subject: params.subject, from: currentFrom }, '📧 Enviando email...')

  try {
    const info = await transporter.sendMail({
      from: currentFrom,
      to: params.to,
      subject: params.subject,
      html: params.body,
    })
    log.info({ messageId: info.messageId, to: params.to }, '📧 Email enviado com sucesso')

    // Registrar interação se tiver clienteId
    if (params.clienteId) {
      try {
        await db.insertInteracao({
          clienteId: params.clienteId,
          tipo: 'email',
          data: new Date().toISOString(),
          assunto: params.subject,
          descricao: `Email enviado para ${params.to}`,
          automatico: true,
        } as any)

        // Atualizar ultima interação
        await db.updateCliente(params.clienteId, {
          ultimaInteracao: new Date().toISOString().split('T')[0],
        })
      } catch (err) {
        log.error({ err }, 'Erro ao registrar interação de email')
      }
    }

    // Registrar atividade
    try {
      await db.insertAtividade({
        tipo: 'email',
        descricao: `Email "${params.subject}" enviado para ${params.to}`,
        vendedorNome: params.vendedorNome || 'Sistema',
      })
    } catch (err) {
      log.error({ err }, 'Erro ao registrar atividade de email')
    }

    return { success: true }
  } catch (err: any) {
    log.error({ err }, 'Erro ao enviar email')
    return { success: false, error: err?.message || 'Erro desconhecido' }
  }
}

/**
 * Envia email usando um template do banco, substituindo variáveis
 */
export async function sendTemplateEmail(params: {
  templateId: number
  to: string
  clienteId: number
  vendedorNome: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const templates = await db.fetchTemplates('email')
    const template = templates.find(t => t.id === params.templateId)
    if (!template) {
      return { success: false, error: 'Template não encontrado.' }
    }

    // Buscar dados do cliente para as variáveis
    const cliente = await db.fetchClienteById(params.clienteId)
    if (!cliente) {
      return { success: false, error: 'Cliente não encontrado.' }
    }

    const vars: Record<string, string> = {
      nome: cliente.contatoNome || cliente.razaoSocial,
      empresa: cliente.razaoSocial,
      vendedor: params.vendedorNome,
      etapa: STAGE_LABELS[cliente.etapa] || cliente.etapa,
      valor: (cliente.valorEstimado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    }

    const subject = renderTemplate(template.assunto || template.nome, vars)
    const body = renderTemplate(template.corpo, vars)

    return sendEmail({
      to: params.to,
      subject,
      body,
      clienteId: params.clienteId,
      vendedorNome: params.vendedorNome,
    })
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao processar template.' }
  }
}

/**
 * Testa a conexão SMTP
 */
export async function testEmailConnection(): Promise<{ success: boolean; error?: string }> {
  if (!transporter) {
    return { success: false, error: 'Email não configurado.' }
  }
  try {
    await transporter.verify()
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha na verificação SMTP.' }
  }
}

function pickImapConfig(emailCfg: { host: string; port: number; user: string; pass: string } | null, configImap: { host: string; port: number; user: string; pass: string; secure: boolean } | null) {
  const envHost = process.env.EMAIL_IMAP_HOST?.trim() || ''
  const envPort = Number(process.env.EMAIL_IMAP_PORT || 0)
  const envUser = process.env.EMAIL_IMAP_USER?.trim() || ''
  const envPass = process.env.EMAIL_IMAP_PASS || ''
  const envSecure = process.env.EMAIL_IMAP_SECURE

  const fallbackHost = (emailCfg?.host || '').replace(/^smtp\./i, 'imap.')
  const host = configImap?.host || envHost || fallbackHost
  const port = configImap?.port || envPort || (host.includes('gmail.com') ? 993 : 993)
  const user = configImap?.user || envUser || emailCfg?.user || ''
  const pass = configImap?.pass || envPass || emailCfg?.pass || ''
  const secure = configImap?.secure ?? (envSecure ? envSecure === 'true' : port === 993)

  return { host, port, user, pass, secure }
}

function extractEmailBody(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n')
  const boundarySplit = normalized.split('\n\n')
  if (boundarySplit.length < 2) return ''
  const body = boundarySplit.slice(1).join('\n\n').trim()
  if (!body) return ''

  if (/<[a-z][\s\S]*>/i.test(body)) {
    return body
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return body
    .replace(/=\n/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchInboxEmails(params: { clienteEmail: string; limit?: number }): Promise<{ success: boolean; data?: InboxEmailItem[]; error?: string }> {
  const clienteEmail = (params.clienteEmail || '').trim().toLowerCase()
  if (!clienteEmail) return { success: false, error: 'clienteEmail é obrigatório.' }

  const emailCfg = await getEmailConfig()
  const configImap = await getImapConfig()
  const imap = pickImapConfig(emailCfg, configImap)

  if (!imap.host || !imap.user || !imap.pass) {
    return {
      success: false,
      error: 'Inbox não configurado. Defina EMAIL_IMAP_HOST/USER/PASS (ou use credenciais de email válidas).',
    }
  }

  const imapflowModuleName = 'imapflow'
  let ImapFlowCtor: any
  try {
    const mod: any = await import(imapflowModuleName)
    ImapFlowCtor = mod?.ImapFlow
  } catch {
    return { success: false, error: 'Módulo IMAP não disponível no backend. Instale a dependência imapflow.' }
  }

  if (!ImapFlowCtor) {
    return { success: false, error: 'IMAP indisponível no servidor.' }
  }

  const limit = Math.max(1, Math.min(100, Number(params.limit) || 30))
  const client = new ImapFlowCtor({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
  })

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    const fetched: InboxEmailItem[] = []
    const seqRange = `1:*`

    for await (const msg of client.fetch(seqRange, { envelope: true, internalDate: true, flags: true, source: true })) {
      const fromList = (msg.envelope?.from || []).map((f: any) => `${f.name ? `${f.name} ` : ''}<${f.address || ''}>`).join(', ')
      const toList = (msg.envelope?.to || []).map((t: any) => `${t.name ? `${t.name} ` : ''}<${t.address || ''}>`).join(', ')
      const fromAddresses = (msg.envelope?.from || []).map((f: any) => String(f.address || '').toLowerCase())
      const toAddresses = (msg.envelope?.to || []).map((t: any) => String(t.address || '').toLowerCase())
      const matchCliente = fromAddresses.includes(clienteEmail) || toAddresses.includes(clienteEmail)
      if (!matchCliente) continue

      const raw = Buffer.isBuffer(msg.source) ? msg.source.toString('utf8') : String(msg.source || '')
      const bodyText = extractEmailBody(raw)
      const snippet = (bodyText || msg.envelope?.subject || '').slice(0, 220)
      const unread = !(msg.flags || []).has('\\Seen')

      fetched.push({
        id: String(msg.uid || msg.seq || Date.now()),
        subject: msg.envelope?.subject || '(Sem assunto)',
        from: fromList || '-',
        to: toList || '-',
        date: (msg.internalDate || new Date()).toISOString(),
        snippet,
        bodyText,
        unread,
      })
    }

    fetched.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return { success: true, data: fetched.slice(0, limit) }
  } catch (err: any) {
    log.error({ err: err?.message }, 'Erro ao buscar inbox IMAP')
    return { success: false, error: err?.message || 'Erro ao acessar caixa de entrada.' }
  } finally {
    try { await client.logout() } catch { }
  }
}
