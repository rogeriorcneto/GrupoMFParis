import * as db from './database.js'
import { sendWhatsAppMessage, getWhatsAppStatus } from './whatsapp.js'
import { sendUserWhatsAppMessage, getUserWhatsAppStatus } from './whatsapp-multi.js'
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
          const numero = (cliente as any).whatsapp || (cliente as any).contatoCelular || cliente.contatoTelefone
          if (!numero) {
            await db.updateJobStatus(job.id, 'erro', 'Cliente sem número de WhatsApp/telefone')
            continue
          }
          // Tenta primeiro pelo WhatsApp conectado do vendedor dono da carteira; fallback para o WhatsApp global
          const vendWa = cliente.vendedorId ? getUserWhatsAppStatus(cliente.vendedorId) : null
          const globalWa = getWhatsAppStatus()
          if (!vendWa?.connected && !globalWa.connected) {
            await db.updateJobStatus(job.id, 'erro', 'WhatsApp não conectado')
            continue
          }
          const result = vendWa?.connected && cliente.vendedorId
            ? await sendUserWhatsAppMessage(cliente.vendedorId, numero, mensagem)
            : await sendWhatsAppMessage(numero, mensagem)
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
          origem: 'automatica', criadoPor: 'Automação',
        })
      } else if (acao.tipo === 'mover_etapa' && clienteId && cfg.etapa) {
        if (cfg.etapa === 'perdido' && !String(cfg.motivoPerda || cfg.motivo || '').trim()) {
          log.warn({ automacao: a.id, clienteId }, 'Automação bloqueada: proibido mover card para Perdido sem motivo registrado')
          continue
        }
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

let _lastWeeklySnapshotCheck = 0

/**
 * Item 8: Registro automático semanal dos indicadores por vendedor (store:evolucao_semanal).
 */
export async function garantirSnapshotEvolucaoSemanal(): Promise<void> {
  if (Date.now() - _lastWeeklySnapshotCheck < 6 * 3600 * 1000) return
  _lastWeeklySnapshotCheck = Date.now()
  try {
    const { supabase } = await import('./supabase.js')
    const agora = new Date()
    const diaSemana = agora.getDay() // 0 dom .. 6 sab
    const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana
    const segunda = new Date(agora)
    segunda.setDate(agora.getDate() + diffSegunda)
    const semanaISO = `${segunda.getFullYear()}-${String(segunda.getMonth() + 1).padStart(2, '0')}-${String(segunda.getDate()).padStart(2, '0')}`
    const hojeISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`

    const { data: existentes } = await supabase
      .from('atividades')
      .select('id, descricao')
      .eq('tipo', 'store:evolucao_semanal')
      .order('id', { ascending: false })
      .limit(50)

    const jaTemSemana = (existentes || []).some((r: any) => {
      try { return JSON.parse(r.descricao || '{}')?.semanaInicio === semanaISO } catch { return false }
    })
    if (jaTemSemana) return

    const [vendedoresRes, clientesRes, pedidosRes, tarefasRes] = await Promise.all([
      supabase.from('vendedores').select('id, nome, ativo').eq('ativo', true),
      supabase.from('clientes').select('id, razao_social, cnpj, cpf, empresa_funil_id, omie_codigo, vendedor_id, data_ultima_venda, arquivado_duplicata'),
      supabase.from('pedidos').select('id, cliente_id, status, tipo, omie_codigo, omie_numero, data_envio_omie, data_aprovacao, data_envio'),
      supabase.from('tarefas').select('id, cliente_id, vendedor_id, status, data, concluida_em, justificativa_prazo_longo'),
    ])
    const vendedores = vendedoresRes.data || []
    const clientes = (clientesRes.data || []).filter((c: any) => !c.arquivado_duplicata)
    const pedidos = pedidosRes.data || []
    const tarefas = tarefasRes.data || []

    const parent = new Map<number, number>(clientes.map((c: any) => [c.id, c.id]))
    const find = (x: number): number => { let cur = x; while (parent.get(cur) !== cur) { const p = parent.get(cur)!; parent.set(cur, parent.get(p)!); cur = p } return cur }
    const seen = new Map<string, number>()
    for (const c of clientes) {
      const keys: string[] = []
      if (c.empresa_funil_id) keys.push(`ef:${c.empresa_funil_id}`)
      const doc = String(c.cnpj || c.cpf || '').replace(/\D/g, '')
      if (doc) keys.push(`doc:${doc}`)
      if (c.omie_codigo) keys.push(`om:${c.omie_codigo}`)
      const nm = String(c.razao_social || '').trim().toLowerCase()
      if (nm) keys.push(`nm:${nm}`)
      for (const k of keys) { if (seen.has(k)) { const ra = find(c.id), rb = find(seen.get(k)!); if (ra !== rb) parent.set(rb, ra) } else seen.set(k, c.id) }
    }
    const fams = new Map<number, any[]>()
    const rootByCard = new Map<number, number>()
    for (const c of clientes) { const r = find(c.id); rootByCard.set(c.id, r); if (!fams.has(r)) fams.set(r, []); fams.get(r)!.push(c) }

    const ultimaVendaPorRoot = new Map<number, string>()
    const setUltima = (r: number | undefined, d?: string) => {
      if (!r || !d) return
      const iso = d.slice(0, 10)
      const prev = ultimaVendaPorRoot.get(r)
      if (!prev || iso > prev) ultimaVendaPorRoot.set(r, iso)
    }
    for (const p of pedidos) {
      if (p.status === 'confirmado' && (p.tipo || 'venda') === 'venda' && (p.omie_codigo || p.omie_numero || p.data_envio_omie)) {
        setUltima(rootByCard.get(p.cliente_id), p.data_envio_omie || p.data_aprovacao || p.data_envio)
      }
    }
    for (const c of clientes) setUltima(rootByCard.get(c.id), c.data_ultima_venda)

    const tarefasPorRoot = new Map<number, any[]>()
    for (const t of tarefas) {
      if (!t.cliente_id) continue
      const r = rootByCard.get(t.cliente_id)
      if (!r) continue
      if (!tarefasPorRoot.has(r)) tarefasPorRoot.set(r, [])
      tarefasPorRoot.get(r)!.push(t)
    }

    const pontos: any[] = []
    for (const v of vendedores) {
      let carteira180 = 0
      let verdes = 0
      let semAberta = 0
      for (const [root, cards] of fams) {
        const vendId = cards.find(c => c.vendedor_id)?.vendedor_id
        if (vendId !== v.id) continue
        const ult = ultimaVendaPorRoot.get(root)
        if (!ult) continue
        const diasCompra = Math.floor((Date.parse(hojeISO) - Date.parse(ult)) / 86400000)
        if (diasCompra > 180) continue
        carteira180++
        const ts = tarefasPorRoot.get(root) || []
        const pendentes = ts.filter(t => t.status === 'pendente')
        if (pendentes.length === 0) semAberta++
        const temJustFutura = pendentes.some(t => t.justificativa_prazo_longo && t.data >= hojeISO)
        if (temJustFutura) continue
        const conc = ts.filter(t => t.status === 'concluida' && (t.concluida_em || t.data)).sort((a, b) => String(b.concluida_em || b.data).localeCompare(String(a.concluida_em || a.data)))
        if (conc[0]) {
          const diasCont = Math.floor((Date.parse(hojeISO) - Date.parse(String(conc[0].concluida_em || conc[0].data).slice(0, 10))) / 86400000)
          if (diasCont <= 10) verdes++
        }
      }
      if (carteira180 === 0) continue
      pontos.push({
        vendedorId: v.id,
        vendedorNome: v.nome,
        carteira180,
        verdes,
        pctCarteiraEmDia: Math.round((verdes / carteira180) * 1000) / 10,
        semTarefaAberta: semAberta,
      })
    }

    if (pontos.length > 0) {
      await supabase.from('atividades').insert({
        tipo: 'store:evolucao_semanal',
        descricao: JSON.stringify({ semanaInicio: semanaISO, registradoEm: agora.toISOString(), pontos }),
        vendedor_nome: 'Sistema',
      })
      log.info({ semanaISO, vendedores: pontos.length }, '📈 Snapshot semanal de evolução registrado')
    }
  } catch (err) {
    log.warn({ err }, 'Falha ao garantir snapshot semanal de evolução')
  }
}
