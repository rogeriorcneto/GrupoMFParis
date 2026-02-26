import * as db from './database.js'
import { sendWhatsAppMessage, getWhatsAppStatus } from './whatsapp.js'
import { sendEmail, getEmailStatus } from './email.js'

/**
 * Processa jobs de automação pendentes.
 * Chamado a cada 5 minutos pelo scheduler em index.ts.
 */
export async function processarJobsPendentes(): Promise<void> {
  try {
    const jobs = await db.fetchJobsPendentes()
    if (jobs.length === 0) return

    console.log(`⏰ Processando ${jobs.length} job(s) pendente(s)...`)

    for (const job of jobs) {
      try {
        const cliente = await db.fetchClienteById(job.clienteId)
        if (!cliente) {
          await db.updateJobStatus(job.id, 'erro', 'Cliente não encontrado')
          continue
        }

        const mensagem = job.mensagem || `Olá ${cliente.razaoSocial}, mensagem automática do CRM MF Paris.`

        if (job.canal === 'whatsapp') {
          const waStatus = getWhatsAppStatus()
          if (!waStatus.connected) {
            await db.updateJobStatus(job.id, 'erro', 'WhatsApp não conectado')
            continue
          }
          const numero = cliente.whatsapp || cliente.contatoTelefone
          if (!numero) {
            await db.updateJobStatus(job.id, 'erro', 'Cliente sem número de WhatsApp/telefone')
            continue
          }
          const result = await sendWhatsAppMessage(numero, mensagem)
          if (result.success) {
            await db.updateJobStatus(job.id, 'enviado')
            await db.insertInteracao({
              clienteId: cliente.id, tipo: 'whatsapp', data: new Date().toISOString(),
              assunto: 'Automação WhatsApp', descricao: mensagem.substring(0, 200),
              automatico: true
            })
          } else {
            await db.updateJobStatus(job.id, 'erro', result.error || 'Erro ao enviar WhatsApp')
          }
        } else if (job.canal === 'email') {
          const emailStatus = getEmailStatus()
          if (!emailStatus.configured) {
            await db.updateJobStatus(job.id, 'erro', 'Email não configurado')
            continue
          }
          if (!cliente.contatoEmail) {
            await db.updateJobStatus(job.id, 'erro', 'Cliente sem email de contato')
            continue
          }
          const result = await sendEmail({
            to: cliente.contatoEmail,
            subject: job.assunto || 'CRM MF Paris — Mensagem Automática',
            body: mensagem,
            clienteId: cliente.id,
          })
          if (result.success) {
            await db.updateJobStatus(job.id, 'enviado')
            await db.insertInteracao({
              clienteId: cliente.id, tipo: 'email', data: new Date().toISOString(),
              assunto: job.assunto || 'Automação Email', descricao: mensagem.substring(0, 200),
              automatico: true
            })
          } else {
            await db.updateJobStatus(job.id, 'erro', result.error || 'Erro ao enviar email')
          }
        } else {
          // Canal não suportado (linkedin, instagram, etc.) — marcar como enviado (interação registrada)
          await db.updateJobStatus(job.id, 'enviado')
          await db.insertInteracao({
            clienteId: cliente.id, tipo: job.canal as any, data: new Date().toISOString(),
            assunto: `Automação ${job.canal}`, descricao: mensagem.substring(0, 200),
            automatico: true
          })
        }

        console.log(`  ✅ Job #${job.id} (${job.canal}) → ${cliente.razaoSocial}`)
      } catch (err) {
        console.error(`  ❌ Job #${job.id} erro:`, err)
        await db.updateJobStatus(job.id, 'erro', String(err)).catch(() => {})
      }
    }
  } catch (err) {
    console.error('Erro ao processar jobs pendentes:', err)
  }
}
