import * as db from './database.js'
import { sendWhatsAppMessage, getWhatsAppStatus } from './whatsapp.js'
import { sendEmail, getEmailStatus } from './email.js'
import { log } from './logger.js'

// ── Types ──

export interface BulkTarget {
  clienteId: number
  to: string // email address or phone number
}

export interface BulkRequest {
  canal: 'email' | 'whatsapp'
  subject?: string        // email only
  body: string            // message body (HTML for email, plain for WA)
  templateId?: number     // optional template id
  targets: BulkTarget[]
  vendedorNome: string
  delayMs?: number        // throttle between sends (default: 1500ms email, 3000ms WA)
}

export interface BulkStatus {
  batchId: string
  canal: 'email' | 'whatsapp'
  total: number
  sent: number
  failed: number
  errors: Array<{ clienteId: number; to: string; error: string }>
  status: 'running' | 'done' | 'cancelled'
  startedAt: string
  finishedAt?: string
}

// ── In-memory batch store ──
const batches = new Map<string, BulkStatus>()

// Keep max 50 batches in memory (evict oldest when exceeded)
function evictOldBatches() {
  if (batches.size <= 50) return
  const sorted = [...batches.entries()].sort((a, b) => a[1].startedAt.localeCompare(b[1].startedAt))
  while (batches.size > 50) {
    const oldest = sorted.shift()
    if (oldest) batches.delete(oldest[0])
  }
}

export function getBatchStatus(batchId: string): BulkStatus | null {
  return batches.get(batchId) || null
}

export function getAllBatches(): BulkStatus[] {
  return [...batches.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function cancelBatch(batchId: string): boolean {
  const batch = batches.get(batchId)
  if (!batch || batch.status !== 'running') return false
  batch.status = 'cancelled'
  batch.finishedAt = new Date().toISOString()
  return true
}

// ── Helpers ──

function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

// ── Main dispatch function (runs async in background) ──

export function startBulkDispatch(req: BulkRequest): string {
  const batchId = generateBatchId()

  const batch: BulkStatus = {
    batchId,
    canal: req.canal,
    total: req.targets.length,
    sent: 0,
    failed: 0,
    errors: [],
    status: 'running',
    startedAt: new Date().toISOString(),
  }

  batches.set(batchId, batch)
  evictOldBatches()

  // Fire and forget — runs in background
  processBatch(batchId, req).catch(err => {
    log.error({ err, batchId }, 'Bulk dispatch fatal error')
    batch.status = 'done'
    batch.finishedAt = new Date().toISOString()
  })

  return batchId
}

async function processBatch(batchId: string, req: BulkRequest): Promise<void> {
  const batch = batches.get(batchId)!
  const defaultDelay = req.canal === 'email' ? 1500 : 3000
  const delayMs = req.delayMs ?? defaultDelay

  log.info({ batchId, canal: req.canal, total: req.targets.length }, '📨 Bulk dispatch started')

  // Pre-check channel availability
  if (req.canal === 'whatsapp') {
    const waStatus = getWhatsAppStatus()
    if (!waStatus.connected) {
      batch.status = 'done'
      batch.finishedAt = new Date().toISOString()
      batch.failed = batch.total
      batch.errors = req.targets.map(t => ({ clienteId: t.clienteId, to: t.to, error: 'WhatsApp não conectado' }))
      return
    }
  } else if (req.canal === 'email') {
    const emailStatus = getEmailStatus()
    if (!emailStatus.configured) {
      batch.status = 'done'
      batch.finishedAt = new Date().toISOString()
      batch.failed = batch.total
      batch.errors = req.targets.map(t => ({ clienteId: t.clienteId, to: t.to, error: 'Email não configurado' }))
      return
    }
  }

  // Load template if specified
  let templateContent: string | null = null
  if (req.templateId) {
    const tmpl = await db.fetchTemplateMsgById(req.templateId)
    if (tmpl?.conteudo) templateContent = tmpl.conteudo
  }

  for (let i = 0; i < req.targets.length; i++) {
    // Check cancellation
    if (batch.status === 'cancelled') {
      log.info({ batchId, sent: batch.sent, cancelled: batch.total - batch.sent - batch.failed }, 'Bulk dispatch cancelled')
      break
    }

    const target = req.targets[i]

    try {
      // Fetch client data for template variables
      const cliente = await db.fetchClienteById(target.clienteId)
      if (!cliente) {
        batch.failed++
        batch.errors.push({ clienteId: target.clienteId, to: target.to, error: 'Cliente não encontrado' })
        continue
      }

      const vars: Record<string, string> = {
        nome: cliente.contatoNome || cliente.razaoSocial,
        empresa: cliente.razaoSocial,
        contato: cliente.contatoNome || '',
        vendedor: req.vendedorNome,
        etapa: cliente.etapa || '',
      }

      const message = templateContent ? renderTemplate(templateContent, vars) : renderTemplate(req.body, vars)

      if (req.canal === 'email') {
        const subject = req.subject ? renderTemplate(req.subject, vars) : 'CRM MF Paris'
        const result = await sendEmail({
          to: target.to,
          subject,
          body: message,
          clienteId: target.clienteId,
          vendedorNome: req.vendedorNome,
        })
        if (result.success) {
          batch.sent++
        } else {
          batch.failed++
          batch.errors.push({ clienteId: target.clienteId, to: target.to, error: result.error || 'Erro desconhecido' })
        }
      } else if (req.canal === 'whatsapp') {
        const result = await sendWhatsAppMessage(target.to, message)
        if (result.success) {
          batch.sent++
          // Register interaction
          try {
            await db.insertInteracao({
              clienteId: target.clienteId, tipo: 'whatsapp', data: new Date().toISOString(),
              assunto: 'Disparo em massa', descricao: message.substring(0, 200),
              automatico: true
            })
            await db.updateCliente(target.clienteId, { ultimaInteracao: new Date().toISOString().split('T')[0] })
          } catch (err) {
            log.error({ err, clienteId: target.clienteId }, 'Erro ao registrar interação WA bulk')
          }
        } else {
          batch.failed++
          batch.errors.push({ clienteId: target.clienteId, to: target.to, error: result.error || 'Erro desconhecido' })
        }
      }
    } catch (err: any) {
      batch.failed++
      batch.errors.push({ clienteId: target.clienteId, to: target.to, error: err?.message || 'Erro inesperado' })
    }

    // Throttle between sends (avoid rate limits and bans)
    if (i < req.targets.length - 1 && batch.status === 'running') {
      await sleep(delayMs)
    }
  }

  batch.status = batch.status === 'cancelled' ? 'cancelled' : 'done'
  batch.finishedAt = new Date().toISOString()

  // Register bulk activity
  try {
    await db.insertAtividade({
      tipo: req.canal,
      descricao: `Disparo em massa ${req.canal}: ${batch.sent} enviados, ${batch.failed} falhas de ${batch.total} total`,
      vendedorNome: req.vendedorNome,
    })
  } catch (err) {
    log.error({ err }, 'Erro ao registrar atividade bulk')
  }

  log.info({ batchId, sent: batch.sent, failed: batch.failed, total: batch.total }, '📨 Bulk dispatch finished')
}
