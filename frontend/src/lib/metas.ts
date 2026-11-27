// Item 4 — Metas parametrizáveis por vendedor/mês.
// Todos os cálculos são PUROS e determinísticos (nada de IA nos números):
// a mesma entrada produz sempre a mesma saída, independente de fuso horário,
// porque todas as datas são tratadas como strings ISO 'YYYY-MM-DD' e o dia da
// semana é derivado do calendário gregoriano local (new Date(y, m-1, d)),
// sem dependência de horário/fuso.
import { supabase } from './supabase'
import type { Pedido, Produto } from '../types'

export interface MetaVendedorMes {
  vendedorId: number
  ano: number
  mes: number // 1-12
  metaFaturamento: number | null
  metaVolumeKg: number | null
  metaVisitas: number | null
  metaPropostas: number | null
  metaNovosClientes: number | null
}

export interface Feriado {
  data: string // 'YYYY-MM-DD'
  descricao: string
}

export const CAMPOS_META = [
  ['meta_faturamento', 'metaFaturamento'],
  ['meta_volume_kg', 'metaVolumeKg'],
  ['meta_visitas', 'metaVisitas'],
  ['meta_propostas', 'metaPropostas'],
  ['meta_novos_clientes', 'metaNovosClientes'],
] as const

// ─── Helpers de data (puros, timezone-safe) ──────────────────────────────────

function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

export function toISODate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function addDiasISO(iso: string, n: number): string {
  const { y, m, d } = parseISO(iso)
  const dt = new Date(y, m - 1, d + n)
  return toISODate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

/** Dia da semana (0=domingo … 6=sábado) de uma data ISO. */
export function diaSemanaISO(iso: string): number {
  const { y, m, d } = parseISO(iso)
  return new Date(y, m - 1, d).getDay()
}

function feriadosSet(feriados: Feriado[] | Set<string>): Set<string> {
  return feriados instanceof Set ? feriados : new Set(feriados.map(f => f.data))
}

/** Dia útil = segunda a sexta, exceto feriado cadastrado. */
export function ehDiaUtil(iso: string, feriados: Feriado[] | Set<string>): boolean {
  const dow = diaSemanaISO(iso)
  if (dow === 0 || dow === 6) return false
  return !feriadosSet(feriados).has(iso.slice(0, 10))
}

/** Quantidade de dias úteis (seg-sex exceto feriados) de um mês/ano. */
export function diasUteisMes(ano: number, mes: number, feriados: Feriado[] | Set<string>): number {
  const set = feriadosSet(feriados)
  const totalDias = new Date(ano, mes, 0).getDate() // último dia do mês
  let count = 0
  for (let d = 1; d <= totalDias; d++) {
    if (ehDiaUtil(toISODate(ano, mes, d), set)) count++
  }
  return count
}

/** Quantidade de dias úteis no intervalo [inicioISO, fimISO] (inclusive ambos). */
export function diasUteisNoPeriodo(inicioISO: string, fimISO: string, feriados: Feriado[] | Set<string>): number {
  const set = feriadosSet(feriados)
  let count = 0
  let cur = inicioISO.slice(0, 10)
  const fim = fimISO.slice(0, 10)
  let guard = 0
  while (cur <= fim && guard < 400) {
    if (ehDiaUtil(cur, set)) count++
    cur = addDiasISO(cur, 1)
    guard++
  }
  return count
}

/** Semana de segunda a domingo: retorna o intervalo [segunda, domingo] da semana que contém dataISO. */
export function intervaloSemanaSegDom(dataISO: string): { segunda: string; domingo: string } {
  const dow = diaSemanaISO(dataISO)
  const offsetSegunda = dow === 0 ? -6 : -(dow - 1)
  const segunda = addDiasISO(dataISO, offsetSegunda)
  return { segunda, domingo: addDiasISO(segunda, 6) }
}

/**
 * Dias úteis da semana (seg-dom) que contém dataISO, contando APENAS os dias
 * que caem dentro do mês/ano informado.
 *
 * Regra da semana que vira o mês (item 4.3): uma semana a cavalo de dois meses
 * divide seus dias úteis entre os dois meses — para a meta de novembro, por
 * exemplo, a semana 30/11 a 06/12/2026 contribui apenas com 30/11 (segunda),
 * pois 01-04/12 são dias úteis de DEZEMBRO e entram na meta semanal de dezembro.
 */
export function diasUteisSemanaNoMes(dataISO: string, ano: number, mes: number, feriados: Feriado[] | Set<string>): number {
  const set = feriadosSet(feriados)
  const { segunda, domingo } = intervaloSemanaSegDom(dataISO)
  const prefixoMes = `${ano}-${String(mes).padStart(2, '0')}`
  let count = 0
  let cur = segunda
  let guard = 0
  while (cur <= domingo && guard < 8) {
    if (cur.startsWith(prefixoMes) && ehDiaUtil(cur, set)) count++
    cur = addDiasISO(cur, 1)
    guard++
  }
  return count
}

/**
 * Meta da semana calculada pelo sistema (item 4.3):
 * meta_semana = meta_mes × dias_úteis_da_semana_no_mês ÷ dias_úteis_do_mês.
 * O mês de referência é o mês de dataRefISO; dias da semana que caem fora
 * desse mês não entram na conta (ver diasUteisSemanaNoMes).
 */
export function metaSemanaProrrateada(
  metaMes: number,
  dataRefISO: string,
  feriados: Feriado[] | Set<string>,
): number {
  const { y, m } = parseISO(dataRefISO)
  const duMes = diasUteisMes(y, m, feriados)
  if (duMes <= 0) return 0
  const duSemana = diasUteisSemanaNoMes(dataRefISO, y, m, feriados)
  return Math.round(((metaMes * duSemana) / duMes) * 100) / 100
}

/**
 * Dias úteis restantes no mês de hojeISO, INCLUINDO hoje quando hoje é dia útil
 * (simplificação adotada no item 4.4: inclui hoje sempre que hoje é dia útil,
 * mesmo que o expediente esteja no fim).
 */
export function diasUteisRestantesNoMes(hojeISO: string, feriados: Feriado[] | Set<string>): number {
  const { y, m } = parseISO(hojeISO)
  const ultimoDia = new Date(y, m, 0).getDate()
  return diasUteisNoPeriodo(hojeISO.slice(0, 10), toISODate(y, m, ultimoDia), feriados)
}

/** Dias úteis restantes na semana (seg-dom) de hojeISO, incluindo hoje se útil. */
export function diasUteisRestantesNaSemana(hojeISO: string, feriados: Feriado[] | Set<string>): number {
  const { domingo } = intervaloSemanaSegDom(hojeISO)
  return diasUteisNoPeriodo(hojeISO.slice(0, 10), domingo, feriados)
}

export interface RitmoMeta {
  faltaNoMes: number
  diasUteisRestantesMes: number
  ritmoNecessario: number // R$ por dia útil necessário até o fim do mês
  diasUteisRestantesSemana: number
  paraEstaSemana: number // quanto precisa vender ainda nesta semana
  noRitmo: boolean // true quando não falta nada ou o ritmo necessário é <= 0
}

/**
 * Parcela que o vendedor precisa vender (item 4.4):
 * - falta_no_mes = meta_mes − vendido_no_mes
 * - ritmo_necessario = falta_no_mes ÷ dias_úteis_restantes_no_mes (inclui hoje se útil).
 *   Se não houver mais dias úteis no mês e ainda faltar valor, o ritmo é o próprio
 *   valor que falta (precisaria vender tudo de uma vez — não há mais prazo).
 * - para_esta_semana = ritmo_necessario × dias_úteis_restantes_na_semana
 * - noRitmo quando falta_no_mes <= 0 ou ritmo_necessario <= 0.
 */
export function calcularRitmo(
  metaMes: number,
  vendidoMes: number,
  hojeISO: string,
  feriados: Feriado[] | Set<string>,
): RitmoMeta {
  const faltaNoMes = Math.round((metaMes - vendidoMes) * 100) / 100
  const diasUteisRestantesMes = diasUteisRestantesNoMes(hojeISO, feriados)
  const diasUteisRestantesSemana = diasUteisRestantesNaSemana(hojeISO, feriados)
  const ritmoNecessario = faltaNoMes <= 0
    ? 0
    : diasUteisRestantesMes > 0
      ? Math.round((faltaNoMes / diasUteisRestantesMes) * 100) / 100
      : faltaNoMes
  const paraEstaSemana = Math.round(ritmoNecessario * diasUteisRestantesSemana * 100) / 100
  return {
    faltaNoMes,
    diasUteisRestantesMes,
    ritmoNecessario,
    diasUteisRestantesSemana,
    paraEstaSemana,
    noRitmo: faltaNoMes <= 0 || ritmoNecessario <= 0,
  }
}

/** Meta da equipe = soma das metas dos vendedores (item 4.2 — rodapé da grade). */
export function somaMetasEquipe(metas: MetaVendedorMes[]): Omit<MetaVendedorMes, 'vendedorId' | 'ano' | 'mes'> {
  const acc = { metaFaturamento: 0, metaVolumeKg: 0, metaVisitas: 0, metaPropostas: 0, metaNovosClientes: 0 }
  for (const mt of metas) {
    acc.metaFaturamento += mt.metaFaturamento || 0
    acc.metaVolumeKg += mt.metaVolumeKg || 0
    acc.metaVisitas += mt.metaVisitas || 0
    acc.metaPropostas += mt.metaPropostas || 0
    acc.metaNovosClientes += mt.metaNovosClientes || 0
  }
  return acc
}

// ─── Vendido (mesma regra do faturamento do Dashboard) ───────────────────────

/**
 * "Vendido" no período: pedidos com status 'confirmado', excluindo bonificação,
 * pela data coalesce (dataAprovacao || dataEnvioOmie || dataCriacao) —
 * mesma definição de faturamentoPeriodo usada no Dashboard/Relatórios
 * (calcularIndicadoresGrupo em utils/relatoriosFase2.ts).
 */
export function pedidosVendidosPeriodo(pedidos: Pedido[], inicioISO: string, fimISO: string): Pedido[] {
  const ini = inicioISO.slice(0, 10)
  const fim = fimISO.slice(0, 10)
  return pedidos.filter(p => {
    if (p.status !== 'confirmado' || (p.tipo || 'venda') === 'bonificacao') return false
    const dt = (p.dataAprovacao || p.dataEnvioOmie || p.dataCriacao || '').slice(0, 10)
    return dt >= ini && dt <= fim
  })
}

export function vendidoPedidosPeriodo(pedidos: Pedido[], inicioISO: string, fimISO: string): number {
  return Math.round(
    pedidosVendidosPeriodo(pedidos, inicioISO, fimISO)
      .reduce((s, p) => s + (Number(p.totalValor) || 0), 0) * 100
  ) / 100
}

/**
 * Volume vendido em kg: soma (quantidade × pesoKg do produto) dos itens dos
 * pedidos informados. Fonte do peso: campo peso_kg do cadastro do produto.
 * Itens cujo produto não tem peso cadastrado entram como 0 kg — não há outra
 * fonte confiável de peso no sistema (documentado no item 4.5 da spec).
 */
export function volumeKgPedidos(pedidos: Pedido[], produtosPorId: Map<number, Produto>): number {
  let total = 0
  for (const p of pedidos) {
    for (const item of (p.itens || [])) {
      const prod = produtosPorId.get(item.produtoId)
      const peso = prod?.pesoKg
      if (peso && peso > 0) total += peso * (Number(item.quantidade) || 0)
    }
  }
  return Math.round(total * 100) / 100
}

// ─── Acesso ao Supabase ──────────────────────────────────────────────────────

function rowFromDb(r: any): MetaVendedorMes {
  return {
    vendedorId: r.vendedor_id,
    ano: r.ano,
    mes: r.mes,
    metaFaturamento: r.meta_faturamento != null ? Number(r.meta_faturamento) : null,
    metaVolumeKg: r.meta_volume_kg != null ? Number(r.meta_volume_kg) : null,
    metaVisitas: r.meta_visitas != null ? Number(r.meta_visitas) : null,
    metaPropostas: r.meta_propostas != null ? Number(r.meta_propostas) : null,
    metaNovosClientes: r.meta_novos_clientes != null ? Number(r.meta_novos_clientes) : null,
  }
}

export async function fetchMetasMes(ano: number, mes: number): Promise<MetaVendedorMes[]> {
  const { data, error } = await supabase.from('metas_vendedor_mes').select('*').eq('ano', ano).eq('mes', mes)
  if (error) throw error
  return (data || []).map(rowFromDb)
}

export async function fetchFeriados(): Promise<Feriado[]> {
  const { data, error } = await supabase.from('feriados').select('*').order('data', { ascending: true })
  if (error) throw error
  return (data || []).map((r: any) => ({ data: String(r.data).slice(0, 10), descricao: r.descricao || '' }))
}

export async function adicionarFeriado(dataISO: string, descricao: string): Promise<void> {
  const { error } = await supabase.from('feriados').upsert({ data: dataISO.slice(0, 10), descricao })
  if (error) throw error
}

export async function removerFeriado(dataISO: string): Promise<void> {
  const { error } = await supabase.from('feriados').delete().eq('data', dataISO.slice(0, 10))
  if (error) throw error
}

function numEq(a: number | null, b: number | null): boolean {
  return Number(a ?? 0) === Number(b ?? 0) && (a == null) === (b == null)
}

/**
 * Salva em lote as metas de um mês (item 4.2): faz upsert das linhas e grava
 * em metas_vendedor_log cada campo alterado (quem alterou, quando, valor
 * antigo e novo). Linhas totalmente vazias e sem registro anterior são ignoradas.
 */
export async function salvarMetasMes(
  ano: number,
  mes: number,
  linhas: MetaVendedorMes[],
  alteradoPor: string,
): Promise<{ alterados: number }> {
  const existentes = await fetchMetasMes(ano, mes)
  const porVendedor = new Map(existentes.map(e => [e.vendedorId, e]))

  const upserts: any[] = []
  const logs: any[] = []

  for (const linha of linhas) {
    const anterior = porVendedor.get(linha.vendedorId)
    const vazia = linha.metaFaturamento == null && linha.metaVolumeKg == null &&
      linha.metaVisitas == null && linha.metaPropostas == null && linha.metaNovosClientes == null
    if (vazia && !anterior) continue

    upserts.push({
      vendedor_id: linha.vendedorId,
      ano,
      mes,
      meta_faturamento: linha.metaFaturamento,
      meta_volume_kg: linha.metaVolumeKg,
      meta_visitas: linha.metaVisitas,
      meta_propostas: linha.metaPropostas,
      meta_novos_clientes: linha.metaNovosClientes,
    })

    for (const [campoDb, campoTs] of CAMPOS_META) {
      const antigo = anterior ? (anterior as any)[campoTs] as number | null : null
      const novo = (linha as any)[campoTs] as number | null
      if (!numEq(antigo, novo)) {
        logs.push({
          vendedor_id: linha.vendedorId,
          ano,
          mes,
          campo: campoDb,
          valor_antigo: antigo,
          valor_novo: novo,
          alterado_por: alteradoPor,
        })
      }
    }
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from('metas_vendedor_mes')
      .upsert(upserts, { onConflict: 'vendedor_id,ano,mes' })
    if (error) throw error
  }
  if (logs.length > 0) {
    const { error: eLog } = await supabase.from('metas_vendedor_log').insert(logs)
    if (eLog) throw eLog
  }
  return { alterados: logs.length }
}
