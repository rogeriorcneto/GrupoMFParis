import * as db from './database.js'
import { sendWhatsAppMessage, getWhatsAppStatus } from './whatsapp.js'
import { sendEmail, getEmailStatus } from './email.js'
import { log } from './logger.js'

/**
 * Processa jobs de automação pendentes.
 * Chamado a cada 5 minutos pelo scheduler em index.ts.
 */
export async function processarJobsPendentes(): Promise<void> {
  try {
    const jobs = await db.claimJobsPendentes()
    if (jobs.length === 0) return

    log.info(`⏰ Processando ${jobs.length} job(s) pendente(s)...`)

    for (const job of jobs) {
      try {
        const cliente = await db.fetchClienteById(job.clienteId)
        if (!cliente) {
          await db.updateJobStatus(job.id, 'erro', 'Cliente não encontrado')
          continue
        }

        let mensagem = `Olá ${cliente.razaoSocial}, mensagem automática do CRM MF Paris.`
        if (job.templateId) {
          const tmpl = await db.fetchTemplateMsgById(job.templateId)
          if (tmpl?.conteudo) {
            mensagem = tmpl.conteudo
              .replace(/\{\{nome\}\}/gi, cliente.razaoSocial)
              .replace(/\{\{empresa\}\}/gi, cliente.razaoSocial)
              .replace(/\{\{contato\}\}/gi, cliente.contatoNome || '')
          }
        }
        if (job.mensagem) mensagem = job.mensagem

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

        log.info({ jobId: job.id, canal: job.canal, cliente: cliente.razaoSocial }, '✅ Job processado')
      } catch (err) {
        log.error({ err, jobId: job.id }, '❌ Job erro')
        await db.updateJobStatus(job.id, 'erro', String(err)).catch(() => {})
      }
    }
  } catch (err) {
    log.error({ err }, 'Erro ao processar jobs pendentes')
  }
}

// ─── Ponte: automacoes (UI) → jobs_automacao (worker) ─────────────────────────

interface AutomacaoRow {
  id: string; nome: string; tipo: string; gatilho_tipo: string
  gatilho_config: any; acoes: any[]; ativo: boolean
  ultima_execucao: string | null; execucoes: number
}

async function executarAcoes(a: AutomacaoRow, clienteId: number | null, ctx: any): Promise<void> {
  const agora = new Date().toISOString()
  for (const acao of [...(a.acoes || [])].sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0))) {
    const cfg = acao.configuracao || {}
    try {
      if (acao.tipo === 'enviar_mensagem' || acao.tipo === 'enviar_whatsapp') {
        if (!clienteId) continue
        await db.insertJobAutomacao({
          clienteId, canal: acao.tipo === 'enviar_whatsapp' ? 'whatsapp' : (cfg.canal || 'whatsapp'),
          tipo: 'mensagem', mensagem: cfg.mensagem || null, templateId: cfg.templateId || null,
          agendadoPara: agora, automacaoId: a.id,
        })
      } else if (acao.tipo === 'enviar_email') {
        if (!clienteId) continue
        await db.insertJobAutomacao({
          clienteId, canal: 'email', tipo: 'mensagem',
          assunto: cfg.assunto || null, mensagem: cfg.mensagem || null,
          agendadoPara: agora, automacaoId: a.id,
        })
      } else if (acao.tipo === 'criar_tarefa') {
        if (!clienteId) continue
        const cliente = await db.fetchClienteById(clienteId)
        await db.insertTarefa({
          titulo: (cfg.titulo || `Tarefa — ${a.nome}`).replace('{cliente}', cliente?.razaoSocial || ''),
          descricao: cfg.descricao || `Gerada pela automação "${a.nome}"`,
          data: cfg.data || agora.slice(0, 10),
          tipo: cfg.tipoTarefa || 'outro',
          status: 'pendente', prioridade: cfg.prioridade || 'media',
          clienteId, vendedorId: cliente?.vendedorId || undefined,
        })
      } else if (acao.tipo === 'mover_etapa' && clienteId && cfg.etapa) {
        await db.updateClienteEtapa(clienteId, cfg.etapa)
      } else if (acao.tipo === 'notificacao') {
        await db.insertNotificacao({
          titulo: cfg.titulo || `Automação: ${a.nome}`,
          mensagem: cfg.mensagem || '',
          tipo: 'automacao', clienteId: clienteId || null,
        })
      } else if (acao.tipo === 'atualizar_score' && clienteId && cfg.valor !== undefined) {
        await db.updateClienteScore(clienteId, cfg.valor)
      }
    } catch (e) { log.warn({ e, acao: acao.tipo, automacao: a.id }, 'Falha em ação de automação') }
  }
}

async function marcarExecutada(a: AutomacaoRow): Promise<void> {
  await db.updateAutomacaoExecucao(a.id, (a.execucoes || 0) + 1)
}

/**
 * Avalia automações ativas: eventos na fila + gatilhos de tempo vencidos.
 * Chamado a cada 5min junto com processarJobsPendentes.
 */
export async function avaliarAutomacoes(): Promise<void> {
  try {
    const automacoes: AutomacaoRow[] = await db.fetchAutomacoesAtivas()
    if (automacoes.length === 0) return

    // 1) Eventos enfileirados (triggers de clientes/tarefas)
    const eventos = await db.fetchAutomacaoEventosPendentes(100)
    for (const ev of eventos) {
      for (const a of automacoes) {
        if (a.gatilho_tipo !== 'evento') continue
        const g = a.gatilho_config || {}
        if (g.evento && g.evento !== ev.evento) continue
        if (ev.evento === 'mudanca_etapa' && g.etapa && g.etapa !== ev.dados?.para) continue
        await executarAcoes(a, ev.cliente_id, ev)
        await marcarExecutada(a)
      }
      await db.marcarEventoProcessado(ev.id)
    }

    // 2) Gatilho 'tempo' — intervalo_minutos (com guard: não repete antes do intervalo)
    for (const a of automacoes) {
      if (a.gatilho_tipo !== 'tempo') continue
      const intervaloMin = Number(a.gatilho_config?.intervalo_minutos || 0)
      if (!intervaloMin) continue
      const ultima = a.ultima_execucao ? new Date(a.ultima_execucao).getTime() : 0
      if (Date.now() - ultima < intervaloMin * 60_000) continue
      const clienteIds: number[] = a.gatilho_config?.cliente_ids || []
      if (clienteIds.length === 0) { await executarAcoes(a, null, {}); await marcarExecutada(a); continue }
      for (const cid of clienteIds) await executarAcoes(a, cid, {})
      await marcarExecutada(a)
    }
  } catch (err) { log.error({ err }, 'Erro avaliarAutomacoes') }
}

/** Execução manual de uma automação (rota /api/automacoes/:id/executar) */
export async function executarAutomacaoManual(id: string, clienteId: number | null): Promise<{ ok: boolean; erro?: string }> {
  const a = await db.fetchAutomacaoById(id)
  if (!a) return { ok: false, erro: 'Automação não encontrada' }
  await executarAcoes(a as AutomacaoRow, clienteId, {})
  await marcarExecutada(a as AutomacaoRow)
  return { ok: true }
}
