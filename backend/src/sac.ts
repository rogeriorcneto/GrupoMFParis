import { supabase } from './supabase.js'
import { log } from './logger.js'
import { addOcorrencia } from './ocorrencias.js'

/**
 * SAC — pesquisa de satisfação pós-entrega (WhatsApp dedicado).
 *
 * Fluxo:
 *  1. sync-logistics detecta pedido virando "entregue"
 *  2. enviarPesquisaSac() manda a mensagem pelo número SAC e marca
 *     sac_sent:{pedidoId} (anti-dupe) + sac_pending:{fone} (espera a nota)
 *  3. Cliente responde 1-5 → registrarNotaSac() grava ocorrência no pedido
 *     e responde agradecimento
 *
 * Config editável pelo gerente em KV sac_config: {ativo, template}.
 * Variáveis do template: {nome} (razão social) e {pedido} (número).
 */

const CONFIG_KEY = 'sac_config'
const SENT_PREFIX = 'sac_sent:'
const PENDING_PREFIX = 'sac_pending:'
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface SacConfig {
  ativo: boolean
  template: string
}

const TEMPLATE_PADRAO =
  'Olá, {nome}! 😊\n\nSeu pedido *{pedido}* foi entregue. Obrigado pela preferência!\n\n' +
  'De *1 a 5*, como foi sua experiência com a MF Paris? É só responder com a nota.'

async function kvSet(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_session')
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() })
  if (error) throw error
}

async function kvGet<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('whatsapp_session')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  if (!data?.value) return null
  try { return JSON.parse(data.value) as T } catch { return null }
}

async function kvDel(key: string): Promise<void> {
  await supabase.from('whatsapp_session').delete().eq('key', key)
}

export async function getSacConfig(): Promise<SacConfig> {
  const saved = await kvGet<SacConfig>(CONFIG_KEY)
  if (saved && typeof saved.ativo === 'boolean' && typeof saved.template === 'string') return saved
  return { ativo: false, template: TEMPLATE_PADRAO }
}

export async function setSacConfig(cfg: SacConfig): Promise<void> {
  if (typeof cfg?.ativo !== 'boolean' || !cfg?.template?.trim()) {
    throw new Error('Config inválida: {ativo: boolean, template: string}')
  }
  await kvSet(CONFIG_KEY, { ativo: cfg.ativo, template: cfg.template.trim() })
}

/**
 * Dispara a pesquisa quando o pedido vira "entregue".
 * Não lança exceção — falha só loga (não pode travar o sync).
 */
export async function enviarPesquisaSac(pedidoId: number, clienteId: number | null, numeroPedido?: string | null): Promise<void> {
  try {
    const cfg = await getSacConfig()
    if (!cfg.ativo) return

    // Anti-dupe: pedido já recebeu pesquisa
    if (await kvGet<string>(`${SENT_PREFIX}${pedidoId}`)) return

    if (!clienteId) return
    const { data: cli } = await supabase
      .from('clientes')
      .select('id, razao_social, whatsapp, whatsapp_jid')
      .eq('id', clienteId)
      .maybeSingle()
    if (!cli) return

    const phone = (cli.whatsapp_jid || cli.whatsapp || '').replace(/\D/g, '')
    if (!phone || phone.length < 10) {
      log.warn({ pedidoId, clienteId }, 'SAC: cliente sem WhatsApp válido, pesquisa não enviada')
      return
    }

    const { sendSacText } = await import('./whatsapp-sac.js')
    const texto = cfg.template
      .replaceAll('{nome}', cli.razao_social || 'cliente')
      .replaceAll('{pedido}', numeroPedido || String(pedidoId))

    const sent = await sendSacText(phone, texto)
    if (!sent) {
      log.warn({ pedidoId, phone }, 'SAC: sessão desconectada — pesquisa não enviada')
      return
    }

    await kvSet(`${SENT_PREFIX}${pedidoId}`, new Date().toISOString())
    await kvSet(`${PENDING_PREFIX}${phone}`, {
      pedidoId,
      clienteId,
      criadoEm: Date.now(),
      expiresAt: Date.now() + PENDING_TTL_MS,
    })
    log.info({ pedidoId, clienteId, phone }, '📊 SAC: pesquisa de satisfação enviada')
  } catch (err) {
    log.warn({ err, pedidoId }, 'SAC: falha ao enviar pesquisa')
  }
}

/**
 * Processa resposta do cliente na sessão SAC.
 * Se houver pesquisa pendente e a resposta começar com nota 1-5,
 * grava ocorrência no pedido e responde agradecimento.
 */
export async function registrarNotaSac(
  phone: string,
  text: string,
  sendReply: (to: string, text: string) => Promise<boolean>
): Promise<void> {
  const pending = await kvGet<{ pedidoId: number; clienteId: number; expiresAt: number }>(`${PENDING_PREFIX}${phone}`)
  if (!pending) return
  if (Date.now() > pending.expiresAt) {
    await kvDel(`${PENDING_PREFIX}${phone}`)
    return
  }

  const m = /^([1-5])(?:\D|$)/.exec(text.trim())
  if (!m) return // resposta não é nota — ignora (não interrompe conversa)

  const nota = Number(m[1])
  const comentario = text.trim().replace(/^[1-5]\s*[-–—.,;:!?)]?\s*/, '').trim()

  await addOcorrencia(pending.pedidoId, {
    tipo: 'outro',
    descricao: `Pesquisa de satisfação (SAC): nota ${nota}/5${comentario ? ` — "${comentario}"` : ''}`,
    autorNome: 'Cliente (WhatsApp SAC)',
    vendedorId: null,
  })
  await kvDel(`${PENDING_PREFIX}${phone}`)

  const agradecimento = nota >= 4
    ? 'Que ótimo! Muito obrigado pelo feedback. 💙'
    : 'Obrigado por nos contar! Vamos usar sua nota pra melhorar. 🙏'
  await sendReply(phone, agradecimento)

  // Nota baixa vira notificação pro gerente/vendedor do cliente
  if (nota <= 2) {
    try {
      const { data: cli } = await supabase
        .from('clientes').select('vendedor_id, razao_social').eq('id', pending.clienteId).maybeSingle()
      await supabase.from('notificacoes').insert({
        tipo: 'warning',
        titulo: '⚠️ Satisfação baixa',
        mensagem: `${cli?.razao_social || 'Cliente'} deu nota ${nota}/5 na pesquisa de satisfação (pedido ${pending.pedidoId}).`,
        cliente_id: pending.clienteId,
        vendedor_id: cli?.vendedor_id || null,
        lida: false,
        created_at: new Date().toISOString(),
      })
    } catch { /* non-critical */ }
  }

  log.info({ pedidoId: pending.pedidoId, phone, nota }, '📊 SAC: nota registrada')
}
