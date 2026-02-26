import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import * as db from './database.js'
import { getEmailConfig } from './config-store.js'
import { STAGE_LABELS } from './constants.js'

let transporter: Transporter | null = null
let currentFrom: string = ''

export function initEmail(): boolean {
  return reloadEmail()
}

/**
 * Recarrega a configuração de email (chamado ao salvar config pelo CRM)
 */
export function reloadEmail(): boolean {
  const cfg = getEmailConfig()
  if (!cfg) {
    transporter = null
    currentFrom = ''
    console.log('📧 Email não configurado.')
    return false
  }

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  })

  currentFrom = cfg.from || cfg.user
  console.log(`📧 Email configurado: ${currentFrom}`)
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

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!transporter) {
    return { success: false, error: 'Email não configurado.' }
  }

  try {
    await transporter.sendMail({
      from: currentFrom,
      to: params.to,
      subject: params.subject,
      html: params.body,
    })

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
        console.error('Erro ao registrar interação de email:', err)
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
      console.error('Erro ao registrar atividade de email:', err)
    }

    return { success: true }
  } catch (err: any) {
    console.error('Erro ao enviar email:', err)
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
