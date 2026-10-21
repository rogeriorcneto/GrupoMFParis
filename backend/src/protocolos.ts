import { supabase } from './supabase.js'
import { log } from './logger.js'

/**
 * Protocolo de erro (contrato Anexo I, item 3.3 + SLA do item 5.7).
 *
 * Sem acesso ao dashboard p/ criar tabela — os chamados ficam no KV
 * whatsapp_session (mesmo padrão dos links da Academia e da mídia):
 *   protocolo:seq          → último número emitido
 *   protocolo:{numero}     → JSON do chamado
 *
 * SLA do contrato:
 *   - crítico (impede o uso): atendimento 24h, correção 48h
 *   - normal: correção em 5 dias úteis
 */

const PREFIX = 'protocolo:'
const SEQ_KEY = 'protocolo:seq'

export type ProtocoloSeveridade = 'critico' | 'normal'
export type ProtocoloStatus = 'aberto' | 'em_atendimento' | 'resolvido'

export interface Protocolo {
  numero: string
  titulo: string
  descricao: string
  severidade: ProtocoloSeveridade
  status: ProtocoloStatus
  vendedorId: number | null
  autorNome: string
  criadoEm: string
  atendidoEm?: string
  resolvidoEm?: string
  resposta?: string
}

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

async function nextNumero(): Promise<string> {
  const current = (await kvGet<number>(SEQ_KEY)) || 0
  const next = current + 1
  await kvSet(SEQ_KEY, next)
  const ano = new Date().getFullYear()
  return `PRT-${ano}-${String(next).padStart(4, '0')}`
}

export async function createProtocolo(input: {
  titulo: string
  descricao: string
  severidade: ProtocoloSeveridade
  vendedorId: number | null
  autorNome: string
}): Promise<Protocolo> {
  const numero = await nextNumero()
  const p: Protocolo = {
    numero,
    titulo: input.titulo.trim(),
    descricao: input.descricao.trim(),
    severidade: input.severidade,
    status: 'aberto',
    vendedorId: input.vendedorId,
    autorNome: input.autorNome,
    criadoEm: new Date().toISOString(),
  }
  await kvSet(`${PREFIX}${numero}`, p)
  log.info({ numero, severidade: p.severidade, autor: p.autorNome }, '🐛 Protocolo de erro aberto')
  return p
}

export async function listProtocolos(opts: { gerente: boolean; vendedorId?: number }): Promise<Protocolo[]> {
  const { data, error } = await supabase
    .from('whatsapp_session')
    .select('key, value')
    .like('key', `${PREFIX}PRT-%`)
  if (error) throw error
  const out: Protocolo[] = []
  for (const row of data || []) {
    try {
      const p = JSON.parse(row.value) as Protocolo
      if (opts.gerente || p.vendedorId === opts.vendedorId) out.push(p)
    } catch { /* ignora linha corrompida */ }
  }
  return out.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

export async function updateProtocolo(numero: string, update: {
  status?: ProtocoloStatus
  resposta?: string
}): Promise<Protocolo | null> {
  const p = await kvGet<Protocolo>(`${PREFIX}${numero}`)
  if (!p) return null
  if (update.status) {
    p.status = update.status
    if (update.status === 'em_atendimento' && !p.atendidoEm) p.atendidoEm = new Date().toISOString()
    if (update.status === 'resolvido' && !p.resolvidoEm) p.resolvidoEm = new Date().toISOString()
  }
  if (update.resposta !== undefined) p.resposta = update.resposta
  await kvSet(`${PREFIX}${numero}`, p)
  return p
}

/** Dias úteis entre duas datas (sáb/dom excluídos) */
function diasUteis(from: Date, to: Date): number {
  let d = new Date(from)
  let n = 0
  while (d < to) {
    d = new Date(d.getTime() + 86400000)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

export interface ProtocoloComSla extends Protocolo {
  slaAtendimentoEstourado: boolean
  slaCorrecaoEstourado: boolean
}

/** Anexa flags de SLA do contrato: crítico 24h/48h · normal 5 dias úteis */
export function withSla(p: Protocolo, now = new Date()): ProtocoloComSla {
  const criado = new Date(p.criadoEm)
  const atendido = p.atendidoEm ? new Date(p.atendidoEm) : now
  const resolvido = p.resolvidoEm ? new Date(p.resolvidoEm) : now
  const horasAteAtendimento = (atendido.getTime() - criado.getTime()) / 3_600_000
  const slaAtendimentoEstourado = p.severidade === 'critico' && horasAteAtendimento > 24
  const slaCorrecaoEstourado = p.severidade === 'critico'
    ? (resolvido.getTime() - criado.getTime()) / 3_600_000 > 48
    : diasUteis(criado, resolvido) > 5
  return { ...p, slaAtendimentoEstourado, slaCorrecaoEstourado }
}
