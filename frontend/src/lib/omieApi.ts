import { authFetch, BOT_URL } from './botApi'

const OMIE_BASE = `${BOT_URL}/api/omie`

// ─── Config ───

export interface OmieConfig {
  configured: boolean
  appKey: string
  appSecret: string
}

export async function omieGetConfig(): Promise<OmieConfig> {
  const res = await authFetch(`${OMIE_BASE}/config`)
  return res.json()
}

export async function omieSaveConfig(appKey: string, appSecret: string): Promise<{ success: boolean; error?: string; empresa?: string; message?: string }> {
  const res = await authFetch(`${OMIE_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appKey, appSecret }),
  })
  return res.json()
}

// ─── Status ───

export interface OmieStatus {
  success: boolean
  error?: string
  empresa?: string
}

export async function omieGetStatus(): Promise<OmieStatus> {
  const res = await authFetch(`${OMIE_BASE}/status`)
  return res.json()
}

// ─── Módulos ───

export interface OmieModuleInfo {
  key: string
  label: string
  description: string
  methods: string[]
}

export async function omieGetModules(): Promise<Record<string, OmieModuleInfo[]>> {
  const res = await authFetch(`${OMIE_BASE}/modules`)
  return res.json()
}

// ─── Chamada genérica ───

export async function omieApiCall(group: string, module: string, action: string, params?: any): Promise<{ success: boolean; data?: any; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, module, action, params }),
  })
  return res.json()
}

export async function omieApiCallAll(group: string, module: string, action: string, resultKey: string, params?: any): Promise<{ success: boolean; data?: any[]; total?: number; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/call-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, module, action, resultKey, params }),
  })
  return res.json()
}

// ─── Sync ───

export interface SyncDiffItem {
  omieCodigo: number
  cnpj: string
  razaoSocial: string
  status: 'novo' | 'atualizado' | 'sem_alteracao'
  crmId?: number
}

export interface SyncDiffResult {
  novos: SyncDiffItem[]
  atualizados: SyncDiffItem[]
  semAlteracao: SyncDiffItem[]
  totalOmie: number
  totalCrm: number
}

export interface SyncPullResult {
  inseridos: number
  atualizados: number
  erros: { cnpj: string; erro: string }[]
}

export interface SyncPushResult {
  enviados: number
  erros: { cnpj: string; erro: string }[]
}

export async function omieSyncDiff(): Promise<{ success: boolean; data?: SyncDiffResult; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/sync/diff`, { method: 'POST' })
  return res.json()
}

export async function omieSyncPull(vendedorIdPadrao?: number): Promise<{ success: boolean; data?: SyncPullResult; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/sync/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vendedorIdPadrao }),
  })
  return res.json()
}

export async function omieSyncPush(): Promise<{ success: boolean; data?: SyncPushResult; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/sync/push`, { method: 'POST' })
  return res.json()
}
