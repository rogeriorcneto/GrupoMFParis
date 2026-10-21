import { supabase } from './supabase.js'
import { SIMULADOR_DEFAULTS } from './simulador-defaults.js'

/**
 * Parâmetros do simulador/tabela de preços (custo, comissões, margens,
 * taxas por prazo, valores de frete CIF).
 * Guardados no KV whatsapp_session (mesmo padrão dos protocolos) —
 * sem migration. A página pública /simulador.html e o painel do CRM
 * leem da mesma fonte: mudou aqui, muda nos dois.
 */

const KEY = 'simulador_params'

export interface SimuladorProduto {
  custo: number
  comA: number
  comB: number
  margA: number
  margB: number
}

export interface SimuladorFrete {
  key: string
  label: string
  valor: number
}

export interface SimuladorParams {
  produtos: Record<string, SimuladorProduto>
  prazos: Record<string, number>
  fretes: SimuladorFrete[]
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

export async function getSimuladorParams(): Promise<SimuladorParams> {
  const saved = await kvGet<SimuladorParams>(KEY)
  if (saved?.produtos && saved?.prazos && saved?.fretes) return saved
  return SIMULADOR_DEFAULTS as unknown as SimuladorParams
}

export async function setSimuladorParams(params: SimuladorParams): Promise<void> {
  if (!params || typeof params !== 'object') throw new Error('Payload inválido')
  if (!params.produtos || typeof params.produtos !== 'object') throw new Error('produtos inválidos')
  if (!params.prazos || typeof params.prazos !== 'object') throw new Error('prazos inválidos')
  if (!Array.isArray(params.fretes)) throw new Error('fretes inválidos')
  for (const [nome, p] of Object.entries(params.produtos)) {
    for (const f of ['custo', 'comA', 'comB', 'margA', 'margB'] as const) {
      if (typeof p[f] !== 'number' || !isFinite(p[f])) {
        throw new Error(`Produto "${nome}": campo ${f} deve ser número`)
      }
    }
  }
  for (const [prazo, taxa] of Object.entries(params.prazos)) {
    if (typeof taxa !== 'number' || !isFinite(taxa)) throw new Error(`Prazo "${prazo}": taxa deve ser número`)
  }
  for (const f of params.fretes) {
    if (!f.key || typeof f.valor !== 'number' || !isFinite(f.valor)) {
      throw new Error(`Frete inválido: ${JSON.stringify(f)}`)
    }
  }
  await kvSet(KEY, params)
}
