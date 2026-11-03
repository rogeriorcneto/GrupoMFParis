import type { Cliente, Pedido } from '../types'

export interface PeriodoIndicadores {
  inicio: string
  fim: string
}

const normalizarNome = (nome: string) => nome.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR')
const documento = (cliente: Cliente) => {
  const cnpj = cliente.cnpj.replace(/\D/g, '')
  const cpf = (cliente.cpf || '').replace(/\D/g, '')
  return cnpj ? `cnpj:${cnpj}` : cpf ? `cpf:${cpf}` : ''
}

export function criarIndiceEmpresas(clientes: readonly Cliente[]): Map<number, string> {
  const documentosPorNome = new Map<string, Set<string>>()
  clientes.forEach(cliente => {
    const nome = normalizarNome(cliente.razaoSocial)
    const doc = documento(cliente)
    if (!nome || !doc) return
    const docs = documentosPorNome.get(nome) || new Set<string>()
    docs.add(doc)
    documentosPorNome.set(nome, docs)
  })
  return new Map(clientes.map(cliente => {
    const nome = normalizarNome(cliente.razaoSocial)
    const docs = documentosPorNome.get(nome)
    const chave = documento(cliente) || (nome && docs?.size === 1 ? [...docs][0] : nome && !docs ? `nome:${nome}` : `cliente:${cliente.id}`)
    return [cliente.id, chave]
  }))
}

function dataCalendario(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(valor)) return null
  const dia = valor.slice(0, 10)
  const data = new Date(`${dia}T00:00:00Z`)
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== dia) return null
  if (valor.length === 10) return dia
  const instante = new Date(valor)
  if (!Number.isFinite(instante.getTime())) return null
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante)
  const parte = (tipo: string) => partes.find(p => p.type === tipo)!.value
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

export function calcularIndicadoresComerciais(
  clientes: readonly Cliente[],
  pedidos: readonly Pedido[],
  periodo: PeriodoIndicadores,
  opcoes: { vendedorId?: number; meta?: number } = {},
) {
  if (periodo.inicio.length !== 10 || periodo.fim.length !== 10 || !dataCalendario(periodo.inicio) || !dataCalendario(periodo.fim) || periodo.inicio > periodo.fim) {
    throw new Error('Período de indicadores inválido')
  }
  const empresas = criarIndiceEmpresas(clientes)
  const primeiraCompra = new Map<string, string>()
  const vendas = pedidos.filter(p => p.status === 'confirmado' && p.tipo !== 'bonificacao' && Number.isFinite(p.totalValor) && p.totalValor >= 0)
    .map(p => ({ pedido: p, dia: dataCalendario(p.dataAprovacao || p.dataCriacao), empresa: empresas.get(p.clienteId) || `cliente:${p.clienteId}` }))
    .filter((v): v is typeof v & { dia: string } => v.dia !== null)
  vendas.forEach(v => {
    const primeira = primeiraCompra.get(v.empresa)
    if (!primeira || v.dia < primeira) primeiraCompra.set(v.empresa, v.dia)
  })
  const selecionadas = vendas.filter(v => v.dia >= periodo.inicio && v.dia <= periodo.fim && (opcoes.vendedorId === undefined || v.pedido.vendedorId === opcoes.vendedorId))
  const ativos = new Set(selecionadas.map(v => v.empresa))
  const vendasConfirmadas = Math.round(selecionadas.reduce((s, v) => s + v.pedido.totalValor, 0) * 100) / 100
  return {
    vendasConfirmadas,
    pedidosFechados: selecionadas.length,
    clientesAtivos: ativos.size,
    novosClientes: [...ativos].filter(empresa => primeiraCompra.get(empresa)! >= periodo.inicio).length,
    ticketMedioPedido: selecionadas.length ? vendasConfirmadas / selecionadas.length : null,
    receitaMediaCliente: ativos.size ? vendasConfirmadas / ativos.size : null,
    atingimentoMeta: opcoes.meta && Number.isFinite(opcoes.meta) && opcoes.meta > 0 ? vendasConfirmadas / opcoes.meta * 100 : null,
  }
}

export interface IndicadoresOperacionais {
  semCompra: { d30: number; d60: number; d90: number; nunca: number }
  pipelineAberto: number
  pipelinePonderado: number
  negociacoesAbertas: number
  cotacoesEnviadas: number
  enviadosCount: number
  enviadosValor: number
  previsaoFaturamento: number
  precoMedioNegociacao: number | null
  prazoMedioNegociacao: number | null
  porProduto: Map<string, { quantidade: number; receita: number; participacao: number }>
  porVendedor: Map<number, { receita: number; pedidos: number; clientes: number }>
  porEstado: Map<string, { receita: number; pedidos: number }>
  frequenciaMediaCompra: number | null
  mixMedioItensPedido: number | null
}

/**
 * Pesos do pipeline ponderado — conversão empírica do historico_etapas do CRM:
 * negociacao→follow_up: 506 vitórias / 532 saídas resolvidas ≈ 95%
 * proposta→(negociacao|follow_up): 405 / ~480 saídas ≈ 84% × 95% ≈ 80%
 */
export const PESO_PIPELINE: Record<string, number> = { proposta: 0.8, negociacao: 0.95 }

export function calcularIndicadoresOperacionais(
  clientes: readonly Cliente[],
  pedidos: readonly Pedido[],
  periodo: PeriodoIndicadores,
  hoje: string,
  opcoes: { vendedorId?: number } = {},
): IndicadoresOperacionais {
  const ativos = clientes.filter(c => !c.arquivadoDuplicata && (opcoes.vendedorId === undefined || c.vendedorId === opcoes.vendedorId))
  const empresas = criarIndiceEmpresas(clientes)
  const vendas = pedidos.filter(p => p.status === 'confirmado' && p.tipo !== 'bonificacao' && Number.isFinite(p.totalValor) && p.totalValor >= 0)
    .map(p => ({ pedido: p, dia: dataCalendario(p.dataAprovacao || p.dataCriacao), empresa: empresas.get(p.clienteId) || `cliente:${p.clienteId}` }))
    .filter((v): v is typeof v & { dia: string } => v.dia !== null)
    .filter(v => opcoes.vendedorId === undefined || v.pedido.vendedorId === opcoes.vendedorId)

  // Última compra por empresa → clientes sem compra em janelas de 30/60/90 dias
  const ultima = new Map<string, string>()
  vendas.forEach(v => { const u = ultima.get(v.empresa); if (!u || v.dia > u) ultima.set(v.empresa, v.dia) })
  const msPorDia = 86400000
  const dias = (dia: string) => Math.floor((Date.parse(hoje) - Date.parse(dia)) / msPorDia)
  const semCompra = { d30: 0, d60: 0, d90: 0, nunca: 0 }
  const empresasDaCarteira = new Set(ativos.map(c => empresas.get(c.id) || `cliente:${c.id}`))
  for (const emp of empresasDaCarteira) {
    const u = ultima.get(emp)
    if (!u) { semCompra.nunca++; continue }
    const d = dias(u)
    if (d > 90) semCompra.d90++; else if (d > 60) semCompra.d60++; else if (d > 30) semCompra.d30++
  }

  // Pedidos enviados (em trânsito — venda fechada aguardando confirmação fiscal)
  const enviados = pedidos.filter(p => p.status === 'enviado' && p.tipo !== 'bonificacao'
    && (opcoes.vendedorId === undefined || p.vendedorId === opcoes.vendedorId))
  const enviadosCount = enviados.length
  const enviadosValor = Math.round(enviados.reduce((s, p) => s + p.totalValor, 0) * 100) / 100

  // Pipeline: cards comerciais abertos (não arquivados)
  const comerciais = ativos.filter(c => c.etapa === 'proposta' || c.etapa === 'negociacao')
  const pipelineAberto = Math.round(comerciais.reduce((s, c) => s + (c.valorProposta || 0), 0) * 100) / 100
  const pipelinePonderado = Math.round(comerciais.reduce((s, c) => s + (c.valorProposta || 0) * (PESO_PIPELINE[c.etapa] || 0), 0) * 100) / 100
  const emNegociacao = comerciais.filter(c => c.etapa === 'negociacao')
  const precoMedioNegociacao = emNegociacao.length ? Math.round(emNegociacao.reduce((s, c) => s + (c.valorProposta || 0), 0) / emNegociacao.length * 100) / 100 : null
  const prazos = emNegociacao.map(c => c.dataEntradaEtapa ? dias(c.dataEntradaEtapa.slice(0, 10)) : null).filter((d): d is number => d !== null && d >= 0)
  const prazoMedioNegociacao = prazos.length ? Math.round(prazos.reduce((a, b) => a + b, 0) / prazos.length) : null
  const negociacoesAbertas = comerciais.filter(c => c.etapa === 'negociacao').length
  const cotacoesEnviadas = ativos.filter(c => c.dataProposta && c.dataProposta >= periodo.inicio && c.dataProposta <= periodo.fim).length

  // Mix por produto no período (participação sobre a soma dos itens — frete não distorce)
  const noPeriodo = vendas.filter(v => v.dia >= periodo.inicio && v.dia <= periodo.fim)
  const porProduto = new Map<string, { quantidade: number; receita: number; participacao: number }>()
  let totalItens = 0
  for (const v of noPeriodo) for (const item of v.pedido.itens || []) {
    const nome = item.nomeProduto || 'Sem nome'
    const cur = porProduto.get(nome) || { quantidade: 0, receita: 0, participacao: 0 }
    const receitaItem = (item.preco || 0) * (item.quantidade || 0)
    cur.quantidade += item.quantidade || 0
    cur.receita += receitaItem
    totalItens += receitaItem
    porProduto.set(nome, cur)
  }
  porProduto.forEach(v => { v.participacao = totalItens > 0 ? Math.round(v.receita / totalItens * 1000) / 10 : 0 })

  // Por vendedor e por estado no período
  const porVendedor = new Map<number, { receita: number; pedidos: number; clientes: number }>()
  const cliPorVendedor = new Map<number, Set<string>>()
  const porEstado = new Map<string, { receita: number; pedidos: number }>()
  const estadoPorEmpresa = new Map<string, string>()
  for (const c of clientes) { const e = c.enderecoEstado || ''; if (e) estadoPorEmpresa.set(empresas.get(c.id) || '', e) }
  for (const v of noPeriodo) {
    const vid = v.pedido.vendedorId
    const pv = porVendedor.get(vid) || { receita: 0, pedidos: 0, clientes: 0 }
    pv.receita += v.pedido.totalValor; pv.pedidos += 1
    porVendedor.set(vid, pv)
    const set = cliPorVendedor.get(vid) || new Set<string>(); set.add(v.empresa); cliPorVendedor.set(vid, set)
    const est = estadoPorEmpresa.get(v.empresa) || 'Sem UF'
    const pe = porEstado.get(est) || { receita: 0, pedidos: 0 }
    pe.receita += v.pedido.totalValor; pe.pedidos += 1
    porEstado.set(est, pe)
  }
  cliPorVendedor.forEach((set, vid) => { porVendedor.get(vid)!.clientes = set.size })

  const empresasComCompra = new Set(noPeriodo.map(v => v.empresa))
  const frequenciaMediaCompra = empresasComCompra.size ? Math.round(noPeriodo.length / empresasComCompra.size * 100) / 100 : null
  const itensPorPedido = noPeriodo.map(v => (v.pedido.itens || []).length).filter(n => n > 0)
  const mixMedioItensPedido = itensPorPedido.length ? Math.round(itensPorPedido.reduce((a, b) => a + b, 0) / itensPorPedido.length * 100) / 100 : null

  // Previsão de faturamento: confirmado no período + enviado + pipeline ponderado
  const confirmadoPeriodo = noPeriodo.reduce((s, v) => s + v.pedido.totalValor, 0)
  const previsaoFaturamento = Math.round((confirmadoPeriodo + enviadosValor + pipelinePonderado) * 100) / 100

  return { semCompra, pipelineAberto, pipelinePonderado, negociacoesAbertas, cotacoesEnviadas, enviadosCount, enviadosValor, previsaoFaturamento, precoMedioNegociacao, prazoMedioNegociacao, porProduto, porVendedor, porEstado, frequenciaMediaCompra, mixMedioItensPedido }
}
