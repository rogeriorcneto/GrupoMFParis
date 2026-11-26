import type { Cliente, Pedido } from '../types'
import { mesmaEmpresaNoFunil } from './funil-logic'

export type SituacaoCompra = 'prospecto' | 'ativo' | 'em_atencao' | 'em_risco' | 'inativo_recente' | 'inativo_antigo'

export const SITUACAO_COMPRA_CONFIG: Record<SituacaoCompra, { label: string; cor: string; corDot: string; ordem: number }> = {
  ativo: { label: 'Ativo', cor: 'bg-blue-50/90 text-blue-700 border-blue-200/80', corDot: 'bg-blue-500', ordem: 1 },
  em_atencao: { label: 'Em atenção', cor: 'bg-orange-50/90 text-orange-700 border-orange-200/80', corDot: 'bg-orange-400', ordem: 2 },
  em_risco: { label: 'Em risco', cor: 'bg-orange-100/90 text-orange-900 border-orange-300/80', corDot: 'bg-orange-700', ordem: 3 },
  inativo_recente: { label: 'Inativo recente', cor: 'bg-slate-500 text-white border-slate-500', corDot: 'bg-slate-500', ordem: 4 },
  inativo_antigo: { label: 'Inativo antigo', cor: 'bg-slate-700 text-white border-slate-700', corDot: 'bg-slate-700', ordem: 5 },
  prospecto: { label: 'Prospecto', cor: 'bg-purple-50/90 text-purple-700 border-purple-200/80', corDot: 'bg-purple-500', ordem: 0 },
}

function parseDateValue(v?: string): Date | null {
  if (!v) return null
  // Datas vindas da importação/banco costumam ser somente YYYY-MM-DD.
  // O JavaScript trata esse formato como UTC, o que pode virar o dia anterior no Brasil.
  // Para a contagem de dias do selo, interpretamos como data civil local.
  const apenasData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (apenasData) {
    const d = new Date(Number(apenasData[1]), Number(apenasData[2]) - 1, Number(apenasData[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function diasDesdeData(dataISO: string, agora: Date = new Date()): number {
  const d = parseDateValue(dataISO)
  if (!d) return 0
  const a = new Date(agora)
  a.setHours(0, 0, 0, 0)
  const b = new Date(d)
  b.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86400000))
}

export function pedidoContaComoVenda(p: Pedido): boolean {
  return p.status === 'confirmado'
    && (p.tipo || 'venda') === 'venda'
    && !!(p.omieCodigo || p.omieNumero || p.dataEnvioOmie)
}

function dataEnvioReal(p: Pedido): string | undefined {
  return p.dataEnvioOmie || p.dataAprovacao || p.dataEnvio || undefined
}

const _familiaIndexCache = new WeakMap<readonly Cliente[], { porId: Map<number, Cliente[]>; rootPorId: Map<number, number> }>()
const _ultimaVendaCache = new WeakMap<readonly Cliente[], WeakMap<readonly Pedido[], Map<number, string | null>>>()

function normalizarNomeEmpresa(s?: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function getFamiliaIndex(clientes: readonly Cliente[]) {
  let cached = _familiaIndexCache.get(clientes)
  if (cached) return cached

  const ativos = clientes.filter(c => !c.arquivadoDuplicata)
  const parent = new Map<number, number>()
  for (const c of ativos) parent.set(c.id, c.id)

  const find = (x: number): number => {
    let cur = x
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!
      parent.set(cur, parent.get(p)!)
      cur = p
    }
    return cur
  }

  const seen = new Map<string, number>()
  for (const c of ativos) {
    const keys: string[] = [`ef:${c.empresaFunilId || c.id}`]
    const doc = (c.cnpj || c.cpf || '').replace(/\D/g, '')
    if (doc) keys.push(`doc:${doc}`)
    if (c.omieCodigo) keys.push(`om:${c.omieCodigo}`)
    const nm = normalizarNomeEmpresa(c.razaoSocial)
    if (nm) keys.push(`nm:${nm}`)

    for (const k of keys) {
      const prev = seen.get(k)
      if (prev !== undefined) {
        const ra = find(c.id), rb = find(prev)
        if (ra !== rb) parent.set(rb, ra)
      } else {
        seen.set(k, c.id)
      }
    }
  }

  const grupos = new Map<number, Cliente[]>()
  const rootPorId = new Map<number, number>()
  for (const c of ativos) {
    const r = find(c.id)
    rootPorId.set(c.id, r)
    let arr = grupos.get(r)
    if (!arr) { arr = []; grupos.set(r, arr) }
    arr.push(c)
  }

  const porId = new Map<number, Cliente[]>()
  for (const c of ativos) {
    porId.set(c.id, grupos.get(rootPorId.get(c.id)!) || [c])
  }

  cached = { porId, rootPorId }
  _familiaIndexCache.set(clientes, cached)
  return cached
}

export function familiaDoClienteNoFunil(cliente: Cliente, clientes: Cliente[]): Cliente[] {
  if (clientes.length > 20) {
    const hit = getFamiliaIndex(clientes).porId.get(cliente.id)
    if (hit) return hit
  }
  return clientes.filter(c => !c.arquivadoDuplicata && mesmaEmpresaNoFunil(c, cliente))
}

export function obterUltimaVendaCliente(cliente: Cliente, clientes: Cliente[], pedidos: Pedido[]): string | null {
  if (clientes.length > 20) {
    let porPedidos = _ultimaVendaCache.get(clientes)
    if (!porPedidos) {
      porPedidos = new WeakMap()
      _ultimaVendaCache.set(clientes, porPedidos)
    }
    let mapaUltima = porPedidos.get(pedidos)
    if (!mapaUltima) {
      const { porId, rootPorId } = getFamiliaIndex(clientes)
      const melhorPorRoot = new Map<number, { raw: string; ms: number }>()
      const registrar = (root: number | undefined, raw?: string) => {
        if (root === undefined || !raw) return
        const d = parseDateValue(raw)
        if (!d) return
        const ms = d.getTime()
        const prev = melhorPorRoot.get(root)
        if (!prev || ms > prev.ms) melhorPorRoot.set(root, { raw, ms })
      }
      for (const p of pedidos) {
        if (!pedidoContaComoVenda(p)) continue
        registrar(rootPorId.get(p.clienteId), dataEnvioReal(p))
      }
      for (const [id, r] of rootPorId) {
        const fam = porId.get(id)
        if (fam && fam[0]?.id === id) {
          for (const membro of fam) {
            if (membro.dataUltimaVenda) registrar(r, membro.dataUltimaVenda)
          }
        }
      }
      mapaUltima = new Map<number, string | null>()
      for (const [id, r] of rootPorId) {
        mapaUltima.set(id, melhorPorRoot.get(r)?.raw ?? null)
      }
      porPedidos.set(pedidos, mapaUltima)
    }
    if (mapaUltima.has(cliente.id)) return mapaUltima.get(cliente.id) ?? null
  }

  const familia = familiaDoClienteNoFunil(cliente, clientes)
  const idsFamilia = new Set(familia.map(c => c.id))
  const datas: string[] = []

  for (const p of pedidos) {
    if (!idsFamilia.has(p.clienteId) || !pedidoContaComoVenda(p)) continue
    const data = dataEnvioReal(p)
    if (data) datas.push(data)
  }

  // Complemento legado: campo "Última venda" já existente no CRM, citado na especificação.
  // Não usa dataUltimoPedido porque esse campo também é gravado em fluxos de aprovação.
  for (const c of familia) {
    if (c.dataUltimaVenda) datas.push(c.dataUltimaVenda)
  }

  const validas = datas
    .map(v => ({ raw: v, date: parseDateValue(v) }))
    .filter(x => !!x.date) as { raw: string; date: Date }[]
  if (validas.length === 0) return null
  validas.sort((a, b) => b.date.getTime() - a.date.getTime())
  return validas[0].raw
}

export function classificarSituacaoCompra(ultimaVendaISO: string | null, agora: Date = new Date()): { situacao: SituacaoCompra; dias: number | null } {
  if (!ultimaVendaISO) return { situacao: 'prospecto', dias: null }
  const dias = diasDesdeData(ultimaVendaISO, agora)
  if (dias <= 40) return { situacao: 'ativo', dias }
  if (dias <= 60) return { situacao: 'em_atencao', dias }
  if (dias <= 90) return { situacao: 'em_risco', dias }
  if (dias <= 180) return { situacao: 'inativo_recente', dias }
  return { situacao: 'inativo_antigo', dias }
}

export function obterSituacaoCompraCliente(cliente: Cliente, clientes: Cliente[], pedidos: Pedido[], agora: Date = new Date()) {
  const ultimaVenda = obterUltimaVendaCliente(cliente, clientes, pedidos)
  return { ...classificarSituacaoCompra(ultimaVenda, agora), ultimaVenda }
}

export function situacaoContaNaCarteiraAte180(s: SituacaoCompra): boolean {
  return s === 'ativo' || s === 'em_atencao' || s === 'em_risco' || s === 'inativo_recente'
}
