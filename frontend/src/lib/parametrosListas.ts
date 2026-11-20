import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { authFetch, BOT_URL } from './botApi'
import { PAYMENT_TERM_GROUPS } from '../constants/paymentTerms'

export type ListaParametroKey =
  | 'segmento_cliente'
  | 'prazo_pagamento'
  | 'categoria_perda'
  | 'setor_contato'
  | 'tipo_frete'

export interface OpcaoParametro {
  id: string
  valor: string
  label: string
  ativo: boolean
  ordem: number
  alteradoPor?: string
  alteradoEm?: string
}

export interface LogParametro {
  data: string
  usuario: string
  lista: ListaParametroKey
  acao: 'adicionar' | 'renomear' | 'reordenar' | 'ativar' | 'desativar'
  detalhe: string
}

export interface ParametrosState {
  listas: Record<ListaParametroKey, OpcaoParametro[]>
  auditoria: LogParametro[]
}

const STORE_TIPO = 'store:parametros_listas'
const EVENT_NAME = 'crm-parametros-updated'

export const LISTA_META: Record<ListaParametroKey, { titulo: string; descricao: string }> = {
  segmento_cliente: {
    titulo: 'Segmento do cliente',
    descricao: 'Opções exibidas no cadastro e edição de clientes.',
  },
  prazo_pagamento: {
    titulo: 'Prazo de pagamento do pedido',
    descricao: 'Condições e prazos exibidos em propostas e pedidos.',
  },
  categoria_perda: {
    titulo: 'Categorias do motivo de perda',
    descricao: 'Categorias exibidas ao encerrar um card como Perdido.',
  },
  setor_contato: {
    titulo: 'Setor do contato',
    descricao: 'Setores disponíveis nas informações de contato do cliente.',
  },
  tipo_frete: {
    titulo: 'Tipo de frete',
    descricao: 'Modalidades de frete comerciais (propostas e pedidos de venda).',
  },
}

export function buildDefaultParametros(): ParametrosState {
  const todosPrazos = Array.from(new Set(PAYMENT_TERM_GROUPS.flatMap(g => g.options)))
  return {
    listas: {
      segmento_cliente: [
        { id: 'seg-ind', valor: 'Indústria', label: 'Indústria', ativo: true, ordem: 1 },
        { id: 'seg-dist', valor: 'Distribuição', label: 'Distribuição', ativo: true, ordem: 2 },
        { id: 'seg-cons', valor: 'Consumo', label: 'Consumo', ativo: true, ordem: 3 },
      ],
      prazo_pagamento: todosPrazos.map((p, idx) => ({
        id: `prz-${idx + 1}`,
        valor: p,
        label: p,
        ativo: true,
        ordem: idx + 1,
      })),
      categoria_perda: [
        { id: 'perda-preco', valor: 'preco', label: 'Preço', ativo: true, ordem: 1 },
        { id: 'perda-prazo', valor: 'prazo', label: 'Prazo', ativo: true, ordem: 2 },
        { id: 'perda-qualidade', valor: 'qualidade', label: 'Qualidade', ativo: true, ordem: 3 },
        { id: 'perda-concorrencia', valor: 'concorrencia', label: 'Concorrência', ativo: true, ordem: 4 },
        { id: 'perda-sem_resposta', valor: 'sem_resposta', label: 'Sem resposta', ativo: true, ordem: 5 },
        { id: 'perda-outro', valor: 'outro', label: 'Outro', ativo: true, ordem: 6 },
      ],
      setor_contato: [
        { id: 'set-compras', valor: 'compras', label: 'Compras', ativo: true, ordem: 1 },
        { id: 'set-financeiro', valor: 'financeiro', label: 'Financeiro', ativo: true, ordem: 2 },
        { id: 'set-diretoria', valor: 'diretoria', label: 'Diretoria', ativo: true, ordem: 3 },
        { id: 'set-marketing', valor: 'marketing', label: 'Marketing', ativo: true, ordem: 4 },
        { id: 'set-qualidade', valor: 'qualidade', label: 'Qualidade', ativo: true, ordem: 5 },
        { id: 'set-outro', valor: 'outro', label: 'Outro', ativo: true, ordem: 6 },
      ],
      tipo_frete: [
        { id: 'frt-cif', valor: 'CIF', label: 'CIF', ativo: true, ordem: 1 },
        { id: 'frt-fob', valor: 'FOB', label: 'FOB', ativo: true, ordem: 2 },
      ],
    },
    auditoria: [],
  }
}

let cachedState: ParametrosState = buildDefaultParametros()
let cachedRowId: number | null = null
let lastLoadAt = 0

function mergeWithDefaults(raw: any): ParametrosState {
  const def = buildDefaultParametros()
  if (!raw || typeof raw !== 'object' || !raw.listas) return def
  const listas = { ...def.listas }
  ;(Object.keys(def.listas) as ListaParametroKey[]).forEach(k => {
    if (Array.isArray(raw.listas[k]) && raw.listas[k].length > 0) {
      listas[k] = [...raw.listas[k]].sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    }
  })
  return {
    listas,
    auditoria: Array.isArray(raw.auditoria) ? raw.auditoria.slice(0, 300) : [],
  }
}

export async function loadParametrosListas(force = false): Promise<ParametrosState> {
  if (!force && lastLoadAt > 0 && Date.now() - lastLoadAt < 3_000) return cachedState
  // 1) Tenta primeiro via backend (/api/store/parametros_listas — SERVICE_ROLE_KEY, sem bloqueio de RLS!)
  try {
    const res = await authFetch(`${BOT_URL}/api/store/parametros_listas`)
    if (res.ok) {
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length > 0) {
        cachedRowId = Number(rows[0].id)
        cachedState = mergeWithDefaults(rows[0])
        lastLoadAt = Date.now()
        return cachedState
      }
    }
  } catch { /* fallback supabase */ }

  // 2) Fallback direto via Supabase (ex.: ambiente E2E isolado)
  try {
    const { data, error } = await supabase
      .from('atividades')
      .select('id, descricao, created_at')
      .eq('tipo', STORE_TIPO)
      .order('id', { ascending: false })
      .limit(1)
    if (!error && data && data.length > 0) {
      cachedRowId = Number(data[0].id)
      const parsed = JSON.parse(data[0].descricao || '{}')
      cachedState = mergeWithDefaults(parsed)
      lastLoadAt = Date.now()
    }
  } catch { /* defaults */ }
  return cachedState
}

export async function saveParametrosListas(novo: ParametrosState, usuarioNome: string): Promise<ParametrosState> {
  cachedState = novo
  lastLoadAt = Date.now()
  let savedViaApi = false

  // 1) Persiste via backend (/api/store/parametros_listas — SERVICE_ROLE_KEY, nunca é bloqueado por RLS!)
  try {
    let targetId = cachedRowId
    if (!targetId) {
      const getRes = await authFetch(`${BOT_URL}/api/store/parametros_listas`)
      if (getRes.ok) {
        const rows = await getRes.json()
        if (Array.isArray(rows) && rows.length > 0) targetId = Number(rows[0].id)
      }
    }
    if (targetId) {
      const patchRes = await authFetch(`${BOT_URL}/api/store/parametros_listas/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novo),
      })
      if (patchRes.ok) {
        cachedRowId = targetId
        savedViaApi = true
      }
    } else {
      const postRes = await authFetch(`${BOT_URL}/api/store/parametros_listas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novo),
      })
      if (postRes.ok) {
        const created = await postRes.json()
        if (created?.id) cachedRowId = Number(created.id)
        savedViaApi = true
      }
    }
  } catch { /* fallback supabase */ }

  // 2) Fallback direto via Supabase caso o backend não esteja respondendo:
  // ATENÇÃO: a tabela `atividades` possui policy RLS para SELECT e INSERT (sem policy UPDATE para anon/authenticated).
  // Por isso inserimos um novo snapshot versionado (lido via `.order('id', { ascending: false }).limit(1)`).
  if (!savedViaApi) {
    const payloadStr = JSON.stringify(novo)
    const { data, error } = await supabase
      .from('atividades')
      .insert({ tipo: STORE_TIPO, descricao: payloadStr, vendedor_nome: usuarioNome })
      .select('id')
      .single()
    if (error) throw error
    if (data?.id) cachedRowId = Number(data.id)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: novo }))
  }
  return novo
}

export function getOpcoesAtivas(state: ParametrosState, key: ListaParametroKey): OpcaoParametro[] {
  return [...(state.listas[key] || [])]
    .filter(o => o.ativo)
    .sort((a, b) => a.ordem - b.ordem)
}

export function useParametrosListas(): {
  parametros: ParametrosState
  opcoesAtivas: (key: ListaParametroKey) => OpcaoParametro[]
  reload: () => Promise<void>
} {
  const [state, setState] = useState<ParametrosState>(() => cachedState)

  useEffect(() => {
    let mounted = true
    loadParametrosListas(true).then(s => {
      if (mounted) setState(s)
    })

    const onLocalUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ParametrosState>).detail
      if (detail && mounted) setState(detail)
    }
    const onFocus = () => {
      loadParametrosListas(true).then(s => {
        if (mounted) setState(s)
      })
    }
    if (typeof window !== 'undefined') {
      window.addEventListener(EVENT_NAME, onLocalUpdate)
      window.addEventListener('focus', onFocus)
    }

    let ch: any = null
    try {
      ch = supabase
        .channel('crm-parametros-listas-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'atividades' }, (payload: any) => {
          const row = payload?.new
          if (row && row.tipo === STORE_TIPO && row.descricao) {
            try {
              cachedRowId = Number(row.id)
              cachedState = mergeWithDefaults(JSON.parse(row.descricao))
              lastLoadAt = Date.now()
              if (mounted) setState(cachedState)
            } catch { /* ignore */ }
          }
        })
        .subscribe()
    } catch { /* ambiente sem realtime */ }

    return () => {
      mounted = false
      if (typeof window !== 'undefined') {
        window.removeEventListener(EVENT_NAME, onLocalUpdate)
        window.removeEventListener('focus', onFocus)
      }
      try { ch?.unsubscribe?.() } catch { /* ignore */ }
    }
  }, [])

  return {
    parametros: state,
    opcoesAtivas: (key: ListaParametroKey) => getOpcoesAtivas(state, key),
    reload: async () => {
      const s = await loadParametrosListas(true)
      setState(s)
    },
  }
}
