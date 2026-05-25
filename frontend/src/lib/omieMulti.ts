import { supabase } from './supabase'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }
}

export interface EmpresaOmie {
  id: string
  nome: string
}

export interface PedidoOmie {
  cabecalho?: {
    numero_pedido?: number
    codigo_pedido?: number
    codigo_cliente?: number
    data_previsao?: string
    etapa?: string
    codigo_pedido_integracao?: string
    nf?: string
  }
  total_pedido?: {
    valor_total_pedido?: number
    valor_total_documento?: number
    valor_total_pedido_liquido?: number
  }
  frete?: {
    codigo_rastreio?: string
    modalidade?: string
    cnpj_transportadora?: string
    nome_transportadora?: string
    valor_frete?: number
    quantidade_volumes?: number
    peso_bruto?: number
    peso_liquido?: number
  }
  informacoes_adicionais?: {
    codigo_vendedor?: number
    consumidor_final?: string
    enviar_email?: string
    nome_vendedor?: string
    numero_pedido_cliente?: string
    operacao?: string
    utilizar_emails?: string
  }
  infoCadastro?: {
    dInc?: string
    dAlt?: string
    hInc?: string
    hAlt?: string
    cImpAPI?: string
  }
  pedido_venda_produto?: any
  det?: Array<{
    ide?: { codigo_item_integracao?: string }
    produto?: {
      codigo_produto?: number
      codigo_produto_integracao?: string
      cfop?: string
      descricao?: string
      quantidade?: number
      valor_unitario?: number
      valor_total?: number
      peso_liquido_unit?: number
      peso_bruto_unit?: number
    }
  }>
  observacoes?: {
    obs_venda?: string
    codigo_pedido_cliente?: string
  }
}

export interface ListarPedidosFiltro {
  pagina?: number
  registros_por_pagina?: number
  filtrar_por_data_de?: string
  filtrar_por_data_ate?: string
  filtrar_por_etapa?: string
  filtrar_por_numero_of?: string
  filtrar_apenas_inclusao?: 'S' | 'N'
}

export async function fetchEmpresasOmie(): Promise<EmpresaOmie[]> {
  const headers = await authHeaders()
  const res = await fetch(`${BOT_URL}/api/omie/multi/empresas`, { headers })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Erro')
  return json.data || []
}

export async function listarPedidosOmie(empresaId: string, filtro: ListarPedidosFiltro = {}): Promise<PedidoOmie[]> {
  const headers = await authHeaders()
  const res = await fetch(`${BOT_URL}/api/omie/multi/listar-pedidos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ empresaId, filtro }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Erro ao listar pedidos')
  return json.data || []
}

export async function atualizarRastreioOmie(empresaId: string, numero_pedido: number, codigo_rastreio: string) {
  const headers = await authHeaders()
  const res = await fetch(`${BOT_URL}/api/omie/multi/atualizar-rastreio`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ empresaId, numero_pedido, codigo_rastreio }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Erro ao atualizar rastreio')
  return json.data
}

export async function lancarRastreioPorNF(empresaId: string, nota_fiscal: string, codigo_rastreio: string) {
  const headers = await authHeaders()
  const res = await fetch(`${BOT_URL}/api/omie/multi/lancar-rastreio-por-nf`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ empresaId, nota_fiscal, codigo_rastreio }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Erro ao lançar rastreio')
  return json.data
}

/** Formata data Omie (dd/mm/yyyy) para exibição (já está nesse formato, mas garante) */
export function formatDataOmie(d?: string): string {
  if (!d) return '—'
  return d
}

export function formatMoney(v?: number): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
