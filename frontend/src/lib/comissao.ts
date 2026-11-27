// Item 3 — Comissão parametrizável por produto × tabela de preço × tipo de vendedor (CLT/RCA)
// Tudo calculado por algoritmo determinístico — a mesma fórmula em Dashboard, Relatórios e carteira.
// Regra de vigência: alteração de percentual vale dali para frente — pedidos confirmados antes
// da alteração usam o percentual da época, reconstruído pela tabela de log (comissao_produtos_log).
import { supabase } from './supabase'
import type { ItemPedido, Pedido, Vendedor } from '../types'

export type TipoComissao = 'clt' | 'rca'
export type CampoComissao = 'pct_a_clt' | 'pct_b_clt' | 'pct_a_rca' | 'pct_b_rca'

export interface ComissaoProduto {
  produtoId: number
  pctAClt: number | null
  pctBClt: number | null
  pctARca: number | null
  pctBRca: number | null
  atualizadoEm?: string
  atualizadoPor?: string
}

export interface ComissaoLogEntry {
  produtoId: number
  campo: CampoComissao
  valorAntigo: number | null
  valorNovo: number | null
  alteradoPor: string | null
  alteradoEm: string
}

function rowFromDb(r: any): ComissaoProduto {
  return {
    produtoId: r.produto_id,
    pctAClt: r.pct_a_clt,
    pctBClt: r.pct_b_clt,
    pctARca: r.pct_a_rca,
    pctBRca: r.pct_b_rca,
    atualizadoEm: r.atualizado_em,
    atualizadoPor: r.atualizado_por,
  }
}

export async function fetchComissaoProdutos(): Promise<ComissaoProduto[]> {
  const { data, error } = await supabase.from('comissao_produtos').select('*')
  if (error) throw error
  return (data || []).map(rowFromDb)
}

export async function fetchComissaoLog(): Promise<ComissaoLogEntry[]> {
  const { data, error } = await supabase.from('comissao_produtos_log').select('*').order('alterado_em', { ascending: true })
  if (error) throw error
  return (data || []).map((r: any) => ({
    produtoId: r.produto_id,
    campo: r.campo,
    valorAntigo: r.valor_antigo,
    valorNovo: r.valor_novo,
    alteradoPor: r.alterado_por,
    alteradoEm: r.alterado_em,
  }))
}

/** Salva os percentuais de um produto registrando no log cada campo alterado
 *  (quem alterou, quando, valor antigo e novo — item 3 da spec). */
export async function salvarComissaoProduto(
  produtoId: number,
  novos: { pctAClt: number | null; pctBClt: number | null; pctARca: number | null; pctBRca: number | null },
  alteradoPor: string,
): Promise<void> {
  const { data: atualRows } = await supabase.from('comissao_produtos').select('*').eq('produto_id', produtoId).maybeSingle()
  const atual: ComissaoProduto = atualRows
    ? rowFromDb(atualRows)
    : { produtoId, pctAClt: null, pctBClt: null, pctARca: null, pctBRca: null }

  const { error } = await supabase.from('comissao_produtos').upsert({
    produto_id: produtoId,
    pct_a_clt: novos.pctAClt,
    pct_b_clt: novos.pctBClt,
    pct_a_rca: novos.pctARca,
    pct_b_rca: novos.pctBRca,
    atualizado_em: new Date().toISOString(),
    atualizado_por: alteradoPor,
  })
  if (error) throw error

  const campos: [CampoComissao, keyof typeof novos, number | null][] = [
    ['pct_a_clt', 'pctAClt', atual.pctAClt],
    ['pct_b_clt', 'pctBClt', atual.pctBClt],
    ['pct_a_rca', 'pctARca', atual.pctARca],
    ['pct_b_rca', 'pctBRca', atual.pctBRca],
  ]
  const logs = campos
    .filter(([, key, antigo]) => Number(novos[key] ?? null) !== Number(antigo ?? null))
    .map(([campo, key, antigo]) => ({
      produto_id: produtoId,
      campo,
      valor_antigo: antigo,
      valor_novo: novos[key],
      alterado_por: alteradoPor,
    }))
  if (logs.length > 0) {
    const { error: eLog } = await supabase.from('comissao_produtos_log').insert(logs)
    if (eLog) throw eLog
  }
}

/** Reconstrói o percentual vigente numa data: o valor mais recente definido antes dela.
 *  O primeiro valor cadastrado vale retroativamente (era o único existente na época). */
export function percentualVigente(
  produtoId: number,
  campo: CampoComissao,
  dataRef: Date,
  valoresAtuais: Map<number, ComissaoProduto>,
  log: ComissaoLogEntry[],
): number | null {
  const atual = valoresAtuais.get(produtoId)
  if (!atual) return null
  const valorAtual = atual[campoDbParaTs(campo)]
  // mudanças posteriores à data de referência deste produto/campo, da mais nova p/ mais antiga
  const mudancasDepois = log
    .filter(l => l.produtoId === produtoId && l.campo === campo && new Date(l.alteradoEm) > dataRef)
    .sort((a, b) => new Date(b.alteradoEm).getTime() - new Date(a.alteradoEm).getTime())
  if (mudancasDepois.length === 0) return valorAtual ?? null
  // o valor vigente na data é o valor ANTIGO da primeira alteração feita depois da data
  return mudancasDepois[mudancasDepois.length - 1].valorAntigo ?? null
}

function campoDbParaTs(campo: CampoComissao): 'pctAClt' | 'pctBClt' | 'pctARca' | 'pctBRca' {
  switch (campo) {
    case 'pct_a_clt': return 'pctAClt'
    case 'pct_b_clt': return 'pctBClt'
    case 'pct_a_rca': return 'pctARca'
    case 'pct_b_rca': return 'pctBRca'
  }
}

export function campoComissao(tabela: 'A' | 'B' | undefined, tipo: TipoComissao | undefined): CampoComissao | null {
  if (!tipo) return null
  const t = tabela === 'B' ? 'b' : 'a'
  return `pct_${t}_${tipo}` as CampoComissao
}

export interface ComissaoItemDetalhe {
  pedidoId: number
  numeroPedido: string
  produtoId: number
  nomeProduto: string
  valorItem: number
  pct: number | null
  valorComissao: number
}

export interface ComissaoResultado {
  total: number
  itens: ComissaoItemDetalhe[]
  pedidosSemTipoVendedor: string[] // numeros de pedidos cujo vendedor não tem CLT/RCA
  produtosSemPercentual: number[] // produtoIds usados em pedidos mas sem percentual na coluna aplicável
}

/** Cálculo oficial da comissão estimada (item 3): soma item a item dos pedidos confirmados,
 *  valor do item × percentual do produto conforme a tabela do pedido (A/B) e o tipo do vendedor
 *  (CLT/RCA), usando o percentual vigente na data de aprovação do pedido. */
export function calcularComissao(
  pedidos: Pedido[],
  vendedores: Vendedor[],
  comissaoRows: ComissaoProduto[],
  log: ComissaoLogEntry[],
  inicio?: Date,
  fim?: Date,
): ComissaoResultado {
  const valoresAtuais = new Map(comissaoRows.map(r => [r.produtoId, r]))
  const vendById = new Map(vendedores.map(v => [v.id, v]))
  const resultado: ComissaoResultado = { total: 0, itens: [], pedidosSemTipoVendedor: [], produtosSemPercentual: [] }

  const confirmados = pedidos.filter(p => {
    if (p.status !== 'confirmado') return false
    const d = p.dataAprovacao ? new Date(p.dataAprovacao) : (p.dataCriacao ? new Date(p.dataCriacao) : null)
    if (!d) return false
    if (inicio && d < inicio) return false
    if (fim && d > fim) return false
    return true
  })

  const semTipo = new Set<string>()
  const semPct = new Set<number>()

  for (const p of confirmados) {
    const dataRef = p.dataAprovacao ? new Date(p.dataAprovacao) : new Date(p.dataCriacao || '')
    const vend = vendById.get(p.vendedorId)
    const tipo = (vend as any)?.tipoComissao as TipoComissao | undefined
    const campo = campoComissao(p.tabelaPreco, tipo)
    if (!campo) {
      semTipo.add(p.numero || `#${p.id}`)
      continue
    }
    for (const item of (p.itens || []) as ItemPedido[]) {
      const valorItem = Number(item.preco || 0) * Number(item.quantidade || 0)
      const pct = percentualVigente(item.produtoId, campo, dataRef, valoresAtuais, log)
      if (pct === null || pct === undefined) {
        if (item.produtoId) semPct.add(item.produtoId)
        resultado.itens.push({
          pedidoId: p.id, numeroPedido: p.numero || `#${p.id}`,
          produtoId: item.produtoId, nomeProduto: item.nomeProduto,
          valorItem, pct: null, valorComissao: 0,
        })
        continue
      }
      const valorComissao = Math.round(valorItem * (pct / 100) * 100) / 100
      resultado.total += valorComissao
      resultado.itens.push({
        pedidoId: p.id, numeroPedido: p.numero || `#${p.id}`,
        produtoId: item.produtoId, nomeProduto: item.nomeProduto,
        valorItem, pct, valorComissao,
      })
    }
  }
  resultado.total = Math.round(resultado.total * 100) / 100
  resultado.pedidosSemTipoVendedor = [...semTipo]
  resultado.produtosSemPercentual = [...semPct]
  return resultado
}

/** Comissão incompleta enquanto houver produto ativo sem percentual completo nas 4 colunas. */
export function produtosIncompletos(produtos: { id: number; ativo?: boolean }[], comissaoRows: ComissaoProduto[]): number[] {
  const map = new Map(comissaoRows.map(r => [r.produtoId, r]))
  return produtos
    .filter(p => p.ativo !== false)
    .filter(p => {
      const c = map.get(p.id)
      if (!c) return true
      return c.pctAClt == null || c.pctBClt == null || c.pctARca == null || c.pctBRca == null
    })
    .map(p => p.id)
}
