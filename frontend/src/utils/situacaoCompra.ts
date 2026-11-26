import type { Cliente, Pedido } from '../types'
import { mesmaEmpresaNoFunil } from './funil-logic'

export type SituacaoCompra = 'prospecto' | 'ativo' | 'em_atencao' | 'em_risco' | 'inativo_recente' | 'inativo_antigo'

export const SITUACAO_COMPRA_CONFIG: Record<SituacaoCompra, { label: string; cor: string; corDot: string; ordem: number }> = {
  ativo: { label: 'Ativo', cor: 'bg-blue-100 text-blue-800 border-blue-200', corDot: 'bg-blue-500', ordem: 1 },
  em_atencao: { label: 'Em atenção', cor: 'bg-orange-100 text-orange-700 border-orange-200', corDot: 'bg-orange-400', ordem: 2 },
  em_risco: { label: 'Em risco', cor: 'bg-orange-200 text-orange-900 border-orange-300', corDot: 'bg-orange-700', ordem: 3 },
  inativo_recente: { label: 'Inativo recente', cor: 'bg-gray-400 text-white border-gray-500', corDot: 'bg-gray-500', ordem: 4 },
  inativo_antigo: { label: 'Inativo antigo', cor: 'bg-gray-600 text-white border-gray-700', corDot: 'bg-gray-700', ordem: 5 },
  prospecto: { label: 'Prospecto', cor: 'bg-purple-100 text-purple-800 border-purple-200', corDot: 'bg-purple-500', ordem: 0 },
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

function pedidoContaComoVenda(p: Pedido): boolean {
  return p.status === 'confirmado'
    && (p.tipo || 'venda') === 'venda'
    && !!(p.omieCodigo || p.omieNumero || p.dataEnvioOmie)
}

function dataEnvioReal(p: Pedido): string | undefined {
  return p.dataEnvioOmie || p.dataAprovacao || p.dataEnvio || undefined
}

export function familiaDoClienteNoFunil(cliente: Cliente, clientes: Cliente[]): Cliente[] {
  return clientes.filter(c => !c.arquivadoDuplicata && mesmaEmpresaNoFunil(c, cliente))
}

export function obterUltimaVendaCliente(cliente: Cliente, clientes: Cliente[], pedidos: Pedido[]): string | null {
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
