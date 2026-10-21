import { supabase } from './supabase.js'
import { log } from './logger.js'

/**
 * Report de ocorrência em pedidos (Anexo I, item 5.7).
 *
 * Ocorrências ficam no KV whatsapp_session (mesmo padrão dos protocolos),
 * uma lista por pedido:
 *   ocorrencias_ped:{pedidoId} → [{id, tipo, descricao, autorNome, vendedorId, criadoEm}]
 */

const PREFIX = 'ocorrencias_ped:'

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

export const TIPOS_OCORRENCIA = ['atraso', 'avaria', 'divergencia', 'reclamacao', 'entrega_parcial', 'pagamento', 'outro'] as const
export type TipoOcorrencia = typeof TIPOS_OCORRENCIA[number]

export interface Ocorrencia {
  id: string
  tipo: TipoOcorrencia
  descricao: string
  autorNome: string
  vendedorId: number | null
  criadoEm: string
}

export async function listOcorrencias(pedidoId: number): Promise<Ocorrencia[]> {
  const list = await kvGet<Ocorrencia[]>(`${PREFIX}${pedidoId}`)
  return (list || []).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

export async function addOcorrencia(pedidoId: number, input: {
  tipo: string
  descricao: string
  autorNome: string
  vendedorId: number | null
}): Promise<Ocorrencia> {
  const tipo = (TIPOS_OCORRENCIA as readonly string[]).includes(input.tipo) ? input.tipo as TipoOcorrencia : 'outro'
  const o: Ocorrencia = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tipo,
    descricao: input.descricao.trim(),
    autorNome: input.autorNome,
    vendedorId: input.vendedorId,
    criadoEm: new Date().toISOString(),
  }
  const list = await listOcorrencias(pedidoId)
  await kvSet(`${PREFIX}${pedidoId}`, [o, ...list])
  log.info({ pedidoId, tipo: o.tipo, autor: o.autorNome }, '⚠️ Ocorrência registrada em pedido')
  return o
}
