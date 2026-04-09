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
  return await res.json()
}

// ─── Pedidos Acompanhamento ───

export interface PedidoAcompanhamento {
  pedidoId: number
  numero: string
  clienteNome: string
  clienteId: number
  clienteOmieId: number
  cnpjCliente: string
  vendedorNome: string
  valor: number
  dataCriacao: string
  statusCrm: string
  statusOmie: string
  etapaOmie: string
  nf: string
  codigoRastreio: string
  dataFaturamento: string
  omieCodigo: string
  tipo?: 'venda' | 'bonificacao'
}

export async function omieGetPedidosAcompanhamento(): Promise<{ success: boolean; data?: PedidoAcompanhamento[]; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/pedidos/acompanhamento`)
  return res.json()
}

// ─── Busca sob demanda no Omie ───

export async function omieBuscarPedido(termo: string): Promise<{ success: boolean; data?: PedidoAcompanhamento[]; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/pedidos/buscar?q=${encodeURIComponent(termo)}`)
  return res.json()
}

// ─── Consultar Entrega ───

export interface EntregaOmieResult {
  etapa: string
  dataPrevisao: string
  codigoRastreio: string
  nf: string
  dataFaturamento: string
  statusDescricao: string
}

export async function omieConsultarEntrega(pedidoId: number): Promise<{ success: boolean; data?: EntregaOmieResult; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/pedidos/${pedidoId}/consultar-entrega`, { method: 'POST' })
  return res.json()
}

// ─── Financeiro Resumo ───

export interface FinanceiroResumo {
  totalReceber: number
  totalPagar: number
  saldo: number
  titulosVencidos: number
  titulosAVencer: number
  contasReceber: any[]
  contasPagar: any[]
}

export async function omieGetFinanceiroResumo(): Promise<{ success: boolean; data?: FinanceiroResumo; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/financeiro/resumo`)
  return res.json()
}

// ─── Push Single Cliente CRM → Omie ───

export async function omiePushSingleCliente(clienteId: number): Promise<{ success: boolean; omieCodigo?: string; error?: string }> {
  try {
    const res = await authFetch(`${OMIE_BASE}/sync/cliente/${clienteId}`, { method: 'POST' })
    return res.json()
  } catch {
    return { success: false, error: 'Erro de conexão com o backend' }
  }
}

// ─── Enviar Pedido ao Omie (quando gerente confirma venda) ───

export async function omieEnviarPedido(pedidoId: number): Promise<{ success: boolean; omie_codigo?: string; message?: string; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/pedidos/${pedidoId}/enviar`, { method: 'POST' })
  return res.json()
}

// ─── Sync Produtos Omie → CRM ───

export interface SyncProdutosResult {
  inseridos: number
  atualizados: number
  removidos: number
  totalOmie: number
  erros: { codigo: string; erro: string }[]
}

export async function omieSyncProdutos(): Promise<{ success: boolean; data?: SyncProdutosResult; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/sync/produtos`, { method: 'POST' })
  return res.json()
}

// ─── Sync Logístico ───

export async function omieSyncLogistics(): Promise<{ success: boolean; data?: { atualizados: number; semPedido: number; erros: any[] }; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/sync/logistics`, { method: 'POST' })
  return res.json()
}

// ─── Associar clientes CRM ↔ Omie por CNPJ ───

export interface AssociacaoResult {
  associados: number
  jaVinculados: number
  semCnpj: number
  naoEncontradosOmie: number
  erros: { crmId: number; razaoSocial: string; erro: string }[]
  detalhes: { crmId: number; razaoSocial: string; omieId: string; cnpj: string }[]
}

export async function omieAssociarPorCnpj(): Promise<{ success: boolean; data?: AssociacaoResult; error?: string }> {
  const res = await authFetch(`${OMIE_BASE}/sync/associar-por-cnpj`, { method: 'POST' })
  return res.json()
}
