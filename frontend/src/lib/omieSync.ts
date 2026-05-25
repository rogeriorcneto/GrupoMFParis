/**
 * Sincronização Omie → Sistemas Grupo Paris
 *
 * Reutiliza as rotas Omie existentes do backend (/api/omie/call e /api/omie/call-all)
 * para puxar dados e popular as tabelas dos novos módulos ERP.
 */
import { supabase } from './supabase'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }
}

// ─── Helper para chamar Omie via backend ─────────────────────────────
async function omieCall(group: string, module: string, action: string, params: any = {}): Promise<any> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BOT_URL}/api/omie/call`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ group, module, action, params: [params] }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Erro chamando Omie')
  return json.data
}

async function omieCallAll(group: string, module: string, action: string, resultKey: string, params: any = {}): Promise<any[]> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BOT_URL}/api/omie/call-all`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ group, module, action, params: [params], resultKey }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Erro chamando Omie (all)')
  return json.data || []
}

// ============================================================
// FINANCEIRO — Contas Bancárias, Categorias, Lançamentos
// ============================================================

export interface SyncResult {
  success: boolean
  inseridos: number
  atualizados: number
  erros: string[]
  detalhes?: string
}

/** Sync contas correntes (bancárias) do Omie */
export async function syncContasBancariasOmie(): Promise<SyncResult> {
  const result: SyncResult = { success: false, inseridos: 0, atualizados: 0, erros: [] }
  try {
    const contas = await omieCallAll(
      'financas',
      'contasCorrentes',
      'listar',
      'ListarContasCorrentes',
      { pagina: 1, registros_por_pagina: 100 }
    )

    for (const c of contas) {
      const payload = {
        nome: c.descricao || `Conta ${c.nCodCC}`,
        banco: c.codigo_banco || c.cNomeBanco || '',
        agencia: c.agencia || '',
        conta: c.nro_conta || '',
        tipo: 'corrente',
        saldo_inicial: Number(c.saldo_inicial || 0),
        saldo_atual: Number(c.saldo_inicial || 0),
        ativo: true,
      }

      // Upsert por nome (não temos chave externa Omie em contas_bancarias ainda)
      const { data: existing } = await supabase
        .from('contas_bancarias')
        .select('id')
        .eq('nome', payload.nome)
        .maybeSingle()

      if (existing) {
        await supabase.from('contas_bancarias').update(payload).eq('id', existing.id)
        result.atualizados++
      } else {
        await supabase.from('contas_bancarias').insert(payload)
        result.inseridos++
      }
    }
    result.success = true
    return result
  } catch (err: any) {
    result.erros.push(err?.message || String(err))
    return result
  }
}

/** Sync categorias financeiras do Omie */
export async function syncCategoriasOmie(): Promise<SyncResult> {
  const result: SyncResult = { success: false, inseridos: 0, atualizados: 0, erros: [] }
  try {
    const cats = await omieCallAll(
      'geral',
      'categorias',
      'listar',
      'ListarCategorias',
      { pagina: 1, registros_por_pagina: 500 }
    )

    for (const c of cats) {
      // Omie tem campo conta_despesa/conta_receita ou `categoria`. Tentamos identificar pelo código (1.x = receita, 2.x = despesa convencionalmente)
      const codigo = String(c.codigo || c.cCodCateg || '')
      const desc = c.descricao || c.cDescricao || codigo
      let tipo: 'receita' | 'despesa' = 'despesa'
      // Heurística: códigos começando com 1 são receita
      if (codigo.startsWith('1') || /receit|venda|servic/i.test(desc)) tipo = 'receita'

      const payload = {
        nome: desc,
        tipo,
        cor: tipo === 'receita' ? '#10b981' : '#ef4444',
      }

      const { data: existing } = await supabase
        .from('categorias_financeiras')
        .select('id')
        .eq('nome', payload.nome)
        .maybeSingle()

      if (existing) {
        await supabase.from('categorias_financeiras').update(payload).eq('id', existing.id)
        result.atualizados++
      } else {
        await supabase.from('categorias_financeiras').insert(payload)
        result.inseridos++
      }
    }
    result.success = true
    return result
  } catch (err: any) {
    result.erros.push(err?.message || String(err))
    return result
  }
}

/** Sync contas a pagar e receber → lancamentos_financeiros */
export async function syncLancamentosOmie(): Promise<SyncResult> {
  const result: SyncResult = { success: false, inseridos: 0, atualizados: 0, erros: [] }
  try {
    // Contas a Receber
    const receber = await omieCallAll(
      'financas', 'contasReceber', 'listar', 'ListarContasReceber',
      { pagina: 1, registros_por_pagina: 100, apenas_importado_api: 'N' }
    )

    for (const r of receber) {
      const payload = {
        tipo: 'receita',
        descricao: r.observacao || r.numero_documento || `Receber #${r.codigo_lancamento_omie}`,
        valor: Number(r.valor_documento || 0),
        data_vencimento: r.data_vencimento ? convertOmieDate(r.data_vencimento) : new Date().toISOString().slice(0, 10),
        data_pagamento: r.data_pagamento ? convertOmieDate(r.data_pagamento) : null,
        status: r.status_titulo === 'PAGO' || r.status_titulo === 'RECEBIDO' ? 'pago' : 'pendente',
        documento: r.numero_documento || '',
        observacoes: `[Omie #${r.codigo_lancamento_omie}] ${r.observacao || ''}`.trim(),
      }

      // Dedupe por documento + valor + data
      const { data: existing } = await supabase
        .from('lancamentos_financeiros')
        .select('id')
        .eq('observacoes', payload.observacoes)
        .maybeSingle()

      if (existing) {
        await supabase.from('lancamentos_financeiros').update(payload).eq('id', existing.id)
        result.atualizados++
      } else {
        await supabase.from('lancamentos_financeiros').insert(payload)
        result.inseridos++
      }
    }

    // Contas a Pagar
    const pagar = await omieCallAll(
      'financas', 'contasPagar', 'listar', 'ListarContasPagar',
      { pagina: 1, registros_por_pagina: 100, apenas_importado_api: 'N' }
    )

    for (const p of pagar) {
      const payload = {
        tipo: 'despesa',
        descricao: p.observacao || p.numero_documento || `Pagar #${p.codigo_lancamento_omie}`,
        valor: Number(p.valor_documento || 0),
        data_vencimento: p.data_vencimento ? convertOmieDate(p.data_vencimento) : new Date().toISOString().slice(0, 10),
        data_pagamento: p.data_pagamento ? convertOmieDate(p.data_pagamento) : null,
        status: p.status_titulo === 'PAGO' ? 'pago' : 'pendente',
        documento: p.numero_documento || '',
        observacoes: `[Omie #${p.codigo_lancamento_omie}] ${p.observacao || ''}`.trim(),
      }

      const { data: existing } = await supabase
        .from('lancamentos_financeiros')
        .select('id')
        .eq('observacoes', payload.observacoes)
        .maybeSingle()

      if (existing) {
        await supabase.from('lancamentos_financeiros').update(payload).eq('id', existing.id)
        result.atualizados++
      } else {
        await supabase.from('lancamentos_financeiros').insert(payload)
        result.inseridos++
      }
    }

    result.success = true
    result.detalhes = `Receber: ${receber.length}, Pagar: ${pagar.length}`
    return result
  } catch (err: any) {
    result.erros.push(err?.message || String(err))
    return result
  }
}

/** Sync completo do módulo financeiro */
export async function syncFinanceiroCompleto(): Promise<SyncResult> {
  const cb = await syncContasBancariasOmie()
  const cat = await syncCategoriasOmie()
  const lanc = await syncLancamentosOmie()

  return {
    success: cb.success && cat.success && lanc.success,
    inseridos: cb.inseridos + cat.inseridos + lanc.inseridos,
    atualizados: cb.atualizados + cat.atualizados + lanc.atualizados,
    erros: [...cb.erros, ...cat.erros, ...lanc.erros],
    detalhes: `Contas: ${cb.inseridos + cb.atualizados} | Categorias: ${cat.inseridos + cat.atualizados} | Lançamentos: ${lanc.inseridos + lanc.atualizados}`,
  }
}

// ============================================================
// LOGÍSTICA — Transportadoras
// ============================================================

/** Sync transportadoras do Omie (clientes com tag/tipo transportadora) */
export async function syncTransportadorasOmie(): Promise<SyncResult> {
  const result: SyncResult = { success: false, inseridos: 0, atualizados: 0, erros: [] }
  try {
    // No Omie, transportadoras são cadastradas como clientes com tag específica
    // Vamos buscar por tag "Transportadora"
    const transps = await omieCallAll(
      'geral', 'clientes', 'listar', 'ListarClientes',
      {
        pagina: 1,
        registros_por_pagina: 100,
        clientesFiltro: { exibir_caracteristicas: 'S' }
      }
    )

    // Filtra apenas os que têm tag "Transportadora" ou tipo_atividade indicando transporte
    const filtrados = transps.filter((c: any) => {
      const tags = (c.tags || []).map((t: any) => (t.tag || '').toLowerCase())
      const cnae = (c.cnae || '').toString()
      const ativ = (c.tipo_atividade || '').toLowerCase()
      return tags.some((t: string) => t.includes('transportador') || t.includes('logist'))
        || /49\d{4}|53\d{4}/.test(cnae) // CNAEs de transporte
        || ativ.includes('transport')
    })

    for (const t of filtrados) {
      const payload = {
        nome: t.razao_social || t.nome_fantasia,
        cnpj: t.cnpj_cpf || '',
        contato: t.contato || '',
        telefone: t.telefone1_ddd && t.telefone1_numero ? `(${t.telefone1_ddd}) ${t.telefone1_numero}` : '',
        email: t.email || '',
        ativo: t.inativo !== 'S',
        observacoes: `[Omie] Cód: ${t.codigo_cliente_omie}`,
      }

      const { data: existing } = await supabase
        .from('transportadoras')
        .select('id')
        .eq('cnpj', payload.cnpj || '___nao_existe___')
        .maybeSingle()

      if (existing) {
        await supabase.from('transportadoras').update(payload).eq('id', existing.id)
        result.atualizados++
      } else {
        await supabase.from('transportadoras').insert(payload)
        result.inseridos++
      }
    }
    result.success = true
    result.detalhes = `${filtrados.length} transportadoras encontradas no Omie`
    return result
  } catch (err: any) {
    result.erros.push(err?.message || String(err))
    return result
  }
}

// ============================================================
// RH — Funcionários (vendedores Omie)
// ============================================================

export async function syncFuncionariosOmie(): Promise<SyncResult> {
  const result: SyncResult = { success: false, inseridos: 0, atualizados: 0, erros: [] }
  try {
    const vendedores = await omieCallAll(
      'comercial', 'vendedores', 'listar', 'ListarVendedores',
      { pagina: 1, registros_por_pagina: 200 }
    )

    for (const v of vendedores) {
      const payload = {
        nome: v.nome,
        email: v.email || '',
        cargo: 'Vendedor',
        departamento: 'Comercial',
        status: v.inativo === 'S' ? 'demitido' : 'ativo',
        observacoes: `[Omie] Cód: ${v.codigo}`,
      }

      const { data: existing } = await supabase
        .from('funcionarios')
        .select('id')
        .eq('email', payload.email || '___nao_existe___')
        .maybeSingle()

      if (existing) {
        await supabase.from('funcionarios').update(payload).eq('id', existing.id)
        result.atualizados++
      } else {
        await supabase.from('funcionarios').insert(payload)
        result.inseridos++
      }
    }
    result.success = true
    result.detalhes = `${vendedores.length} vendedores no Omie → funcionários`
    return result
  } catch (err: any) {
    result.erros.push(err?.message || String(err))
    return result
  }
}

// ============================================================
// PRODUÇÃO — Produtos do Omie (referência)
// ============================================================

export async function getProdutosOmieCount(): Promise<number> {
  try {
    const data = await omieCall('compras', 'produtos', 'listar', { pagina: 1, registros_por_pagina: 1 })
    return data?.total_de_registros || 0
  } catch {
    return 0
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Converte data Omie (dd/mm/yyyy) para ISO (yyyy-mm-dd) */
function convertOmieDate(omieDate: string): string {
  if (!omieDate) return new Date().toISOString().slice(0, 10)
  if (omieDate.includes('-')) return omieDate.slice(0, 10)
  const parts = omieDate.split('/')
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return new Date().toISOString().slice(0, 10)
}
