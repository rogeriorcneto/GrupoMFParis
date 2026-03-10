import { omieCall, getOmieCredentials } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'

// ============================================
// Tipos do Pedido de Venda Omie
// ============================================

export interface OmiePedidoResponse {
  codigo_pedido: number
  codigo_pedido_integracao: string
  numero_pedido: string
  codigo_status?: string
  descricao_status?: string
}

// ============================================
// Garantir que cliente existe no Omie
// ============================================

async function garantirClienteOmie(clienteId: number): Promise<number> {
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', clienteId)
    .single()

  if (error || !cliente) throw new Error(`Cliente ${clienteId} não encontrado no CRM`)

  // Se já tem código Omie, retornar
  if (cliente.omie_codigo) {
    return parseInt(cliente.omie_codigo, 10)
  }

  // Senão, criar/atualizar no Omie via UpsertClienteCpfCnpj
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  const cnpj = (cliente.cnpj || '').replace(/\D/g, '')
  if (!cnpj) throw new Error(`Cliente ${clienteId} (${cliente.razao_social}) não tem CNPJ. Cadastre o CNPJ primeiro.`)

  log.info({ clienteId, cnpj, razao: cliente.razao_social }, '🔄 Criando/atualizando cliente no Omie...')

  const omieData = {
    cnpj_cpf: cnpj,
    razao_social: cliente.razao_social || '',
    nome_fantasia: cliente.nome_fantasia || cliente.razao_social || '',
    contato: cliente.contato_nome || '',
    email: cliente.contato_email || '',
    telefone1_numero: cliente.contato_telefone || '',
    telefone2_numero: cliente.contato_celular || '',
    endereco: cliente.endereco_rua || '',
    endereco_numero: cliente.endereco_numero || '',
    complemento: cliente.endereco_complemento || '',
    bairro: cliente.endereco_bairro || '',
    cidade: cliente.endereco_cidade || '',
    estado: cliente.endereco_estado || '',
    cep: (cliente.endereco_cep || '').replace(/\D/g, ''),
  }

  const response = await omieCall<any>(
    '/geral/clientes/',
    'UpsertClienteCpfCnpj',
    [omieData],
    { skipCache: true, credentials: creds }
  )

  const codigoOmie = response.codigo_cliente_omie
  if (!codigoOmie) {
    throw new Error(`Omie não retornou codigo_cliente_omie para CNPJ ${cnpj}`)
  }

  // Salvar código Omie no CRM
  await supabase
    .from('clientes')
    .update({ omie_codigo: String(codigoOmie) })
    .eq('id', clienteId)

  log.info({ clienteId, codigoOmie }, '✅ Cliente criado/atualizado no Omie')
  return codigoOmie
}

// ============================================
// Garantir que produto existe no Omie
// ============================================

async function garantirProdutoOmie(produtoId: number): Promise<number> {
  const { data: produto, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('id', produtoId)
    .single()

  if (error || !produto) throw new Error(`Produto ${produtoId} não encontrado no CRM`)

  // Se já tem código Omie, retornar
  if (produto.omie_codigo) {
    return parseInt(produto.omie_codigo, 10)
  }

  // Senão, criar no Omie
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  log.info({ produtoId, nome: produto.nome }, '🔄 Criando produto no Omie...')

  const codigoIntegracao = `CRM-PROD-${produtoId}`
  const omieData = {
    codigo_produto_integracao: codigoIntegracao,
    descricao: produto.nome || '',
    unidade: produto.unidade || 'UN',
    valor_unitario: produto.preco || 0,
    ncm: '21069090', // NCM genérico para alimentos (ajustar conforme necessidade)
    peso_bruto: produto.peso_kg || 0,
    peso_liq: produto.peso_kg || 0,
    codigo: produto.sku || codigoIntegracao,
  }

  const response = await omieCall<any>(
    '/geral/produtos/',
    'IncluirProduto',
    [omieData],
    { skipCache: true, credentials: creds }
  )

  const codigoOmie = response.codigo_produto
  if (!codigoOmie) {
    throw new Error(`Omie não retornou codigo_produto para produto ${produto.nome}`)
  }

  // Salvar código Omie no CRM
  await supabase
    .from('produtos')
    .update({ omie_codigo: String(codigoOmie) })
    .eq('id', produtoId)

  log.info({ produtoId, codigoOmie }, '✅ Produto criado no Omie')
  return codigoOmie
}

// ============================================
// Criar pedido de venda no Omie
// ============================================

export async function criarPedidoOmie(pedidoId: number): Promise<OmiePedidoResponse> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas. Configure em Integrações → Omie ERP.')

  // Buscar pedido no CRM
  const { data: pedido, error: pedError } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', pedidoId)
    .single()

  if (pedError || !pedido) throw new Error(`Pedido ${pedidoId} não encontrado no CRM`)

  // Já foi enviado ao Omie?
  if (pedido.omie_codigo) {
    throw new Error(`Pedido ${pedidoId} já foi enviado ao Omie (código: ${pedido.omie_codigo})`)
  }

  // Buscar itens do pedido
  const { data: itens, error: itensError } = await supabase
    .from('itens_pedido')
    .select('*')
    .eq('pedido_id', pedidoId)

  if (itensError || !itens || itens.length === 0) {
    throw new Error(`Pedido ${pedidoId} não tem itens`)
  }

  log.info({ pedidoId, clienteId: pedido.cliente_id, qtdItens: itens.length }, '📦 Preparando pedido para Omie...')

  // 1. Garantir cliente no Omie
  const codigoClienteOmie = await garantirClienteOmie(pedido.cliente_id)

  // 2. Garantir produtos no Omie e montar itens
  const det = []
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i]
    const codigoProdutoOmie = await garantirProdutoOmie(item.produto_id)

    det.push({
      ide: {
        codigo_item_integracao: `CRM-${pedidoId}-${i}`,
      },
      produto: {
        codigo_produto: codigoProdutoOmie,
        quantidade: item.quantidade,
        valor_unitario: item.preco,
        tipo_desconto: 'V',
        valor_desconto: 0,
      },
    })
  }

  // 3. Montar pedido Omie conforme documentação
  const dataPrevisao = new Date()
  dataPrevisao.setDate(dataPrevisao.getDate() + 7) // Previsão: 7 dias

  const omiePedido = {
    cabecalho: {
      codigo_pedido_integracao: `CRM-PED-${pedidoId}`,
      codigo_cliente: codigoClienteOmie,
      data_previsao: dataPrevisao.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      }),
      etapa: '10', // 10 = Proposta/Orçamento (pode ser faturado depois)
      codigo_parcela: '999', // À vista
      quantidade_itens: itens.length,
    },
    det,
    frete: {
      modalidade: '9', // Sem frete
    },
    informacoes_adicionais: {
      consumidor_final: 'N',
      enviar_email: 'N',
    },
  }

  log.info({ pedidoId, omiePedido: JSON.stringify(omiePedido) }, '📤 Enviando pedido para Omie...')

  // 4. Enviar ao Omie
  const response = await omieCall<OmiePedidoResponse>(
    '/produtos/pedido/',
    'IncluirPedido',
    [omiePedido],
    { skipCache: true, credentials: creds }
  )

  log.info({ pedidoId, omieResponse: response }, '✅ Pedido criado no Omie')

  // 5. Salvar código Omie no pedido do CRM
  await supabase
    .from('pedidos')
    .update({
      omie_codigo: String(response.codigo_pedido || ''),
      omie_numero: String(response.numero_pedido || ''),
      omie_status: 'enviado',
    })
    .eq('id', pedidoId)

  return response
}

// ============================================
// Consultar status do pedido no Omie
// ============================================

export async function consultarPedidoOmie(pedidoId: number): Promise<any> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('omie_codigo')
    .eq('id', pedidoId)
    .single()

  if (!pedido?.omie_codigo) {
    throw new Error(`Pedido ${pedidoId} não tem código Omie`)
  }

  return omieCall<any>(
    '/produtos/pedido/',
    'StatusPedido',
    [{ codigo_pedido: parseInt(pedido.omie_codigo, 10) }],
    { credentials: creds }
  )
}

// ============================================
// Consultar entrega / etapas de um pedido
// ============================================

export interface EntregaOmieResult {
  etapa: string
  dataPrevisao: string
  codigoRastreio: string
  nf: string
  dataFaturamento: string
  statusDescricao: string
}

export async function consultarEntregaOmie(pedidoId: number): Promise<EntregaOmieResult> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('omie_codigo')
    .eq('id', pedidoId)
    .single()

  if (!pedido?.omie_codigo) {
    throw new Error(`Pedido ${pedidoId} não tem código Omie`)
  }

  const codigoPedido = parseInt(pedido.omie_codigo, 10)

  // Consultar pedido completo para extrair dados logísticos
  const result = await omieCall<any>(
    '/produtos/pedido/',
    'ConsultarPedido',
    [{ codigo_pedido: codigoPedido }],
    { credentials: creds }
  )

  const cab = result?.cabecalho || {}
  const infoCad = result?.infoCadastro || {}
  const transporte = result?.transporte || {}

  return {
    etapa: cab.etapa || infoCad.cEtapa || '',
    dataPrevisao: cab.data_previsao || '',
    codigoRastreio: transporte.codigo_rastreio || '',
    nf: infoCad.nNumeroNF ? String(infoCad.nNumeroNF) : '',
    dataFaturamento: infoCad.dDataFaturamento || infoCad.dDtFat || '',
    statusDescricao: cab.descricao_etapa || infoCad.cDescEtapa || '',
  }
}

// ============================================
// Listar pedidos enviados ao Omie com status
// ============================================

export interface PedidoAcompanhamento {
  pedidoId: number
  numero: string
  clienteNome: string
  clienteId: number
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
}

export async function listarPedidosOmieAcompanhamento(): Promise<PedidoAcompanhamento[]> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  // Buscar TODAS as páginas de pedidos do Omie
  const PER_PAGE = 200
  const MAX_PAGES = 50 // Segurança: máximo 10.000 pedidos

  const filtroParams = {
    pagina: 1,
    registros_por_pagina: PER_PAGE,
    apenas_importado_api: 'N',
  }

  // Primeira chamada para saber total de páginas
  const firstResult = await omieCall<any>(
    '/produtos/pedido/',
    'ListarPedidos',
    [filtroParams],
    { credentials: creds }
  )

  const totalPaginas = Math.min(firstResult?.total_de_paginas || 1, MAX_PAGES)
  let pedidosOmie: any[] = firstResult?.pedido_venda_produto || []

  // Buscar páginas restantes em paralelo (batches de 3 para respeitar rate-limit)
  if (totalPaginas > 1) {
    const pageNumbers = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2)
    const BATCH_SIZE = 3

    for (let i = 0; i < pageNumbers.length; i += BATCH_SIZE) {
      const batch = pageNumbers.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(pg =>
          omieCall<any>(
            '/produtos/pedido/',
            'ListarPedidos',
            [{ ...filtroParams, pagina: pg }],
            { credentials: creds }
          ).catch(() => ({ pedido_venda_produto: [] }))
        )
      )
      for (const r of results) {
        pedidosOmie = pedidosOmie.concat(r?.pedido_venda_produto || [])
      }
    }
  }

  log.info({ total: pedidosOmie.length, paginas: totalPaginas }, 'Pedidos Omie carregados para acompanhamento')

  if (pedidosOmie.length === 0) return []

  // Helper: converter data dd/mm/aaaa para yyyy-mm-dd (ISO)
  const parseOmieDate = (d: string): string => {
    if (!d || d.length < 10) return ''
    const parts = d.split('/')
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return d
  }

  // Mapear para formato padronizado
  const resultado: PedidoAcompanhamento[] = pedidosOmie.map((p: any) => {
    const cab = p.cabecalho || {}
    const infoCad = p.infoCadastro || {}
    const totalPedido = p.total_pedido || {}

    const etapa = cab.etapa || infoCad.cEtapa || ''
    const descEtapa = cab.descricao_etapa || infoCad.cDescEtapa || etapa

    // Mapear etapa Omie para status
    let statusOmie = 'enviado'
    const etapaLower = descEtapa.toLowerCase()
    if (etapaLower.includes('faturado') || etapaLower.includes('faturar')) statusOmie = 'faturado'
    else if (etapaLower.includes('separar') || etapaLower.includes('produção') || etapaLower.includes('separação')) statusOmie = 'em_producao'
    else if (etapaLower.includes('expedir') || etapaLower.includes('expedido') || etapaLower.includes('expedição')) statusOmie = 'expedido'
    else if (etapaLower.includes('entregue') || etapaLower.includes('finalizado')) statusOmie = 'entregue'
    else if (etapaLower.includes('cancelado')) statusOmie = 'cancelado'

    // Usar data_previsao do cabecalho, converter para ISO
    const dataRaw = cab.data_previsao || infoCad.dDtInc || ''
    const dataISO = parseOmieDate(dataRaw)

    return {
      pedidoId: cab.codigo_pedido || 0,
      numero: cab.numero_pedido ? String(cab.numero_pedido) : String(cab.codigo_pedido || ''),
      clienteNome: cab.razao_social || cab.nome_fantasia || String(cab.codigo_cliente || ''),
      clienteId: cab.codigo_cliente || 0,
      vendedorNome: cab.codigo_vendedor ? `Vendedor ${cab.codigo_vendedor}` : '',
      valor: Number(totalPedido.valor_total_pedido || cab.valor_total || 0),
      dataCriacao: dataISO || dataRaw,
      statusCrm: '',
      statusOmie,
      etapaOmie: descEtapa,
      nf: infoCad.nNumeroNF ? String(infoCad.nNumeroNF) : '',
      codigoRastreio: '',
      dataFaturamento: parseOmieDate(infoCad.dDataFaturamento || infoCad.dDtFat || ''),
      omieCodigo: String(cab.codigo_pedido || ''),
    }
  })

  // Ordenar mais recentes primeiro (por codigo_pedido desc — maior = mais novo)
  resultado.sort((a: PedidoAcompanhamento, b: PedidoAcompanhamento) => Number(b.omieCodigo) - Number(a.omieCodigo))

  return resultado
}

// ============================================
// Resumo financeiro do Omie
// ============================================

export interface FinanceiroResumo {
  totalReceber: number
  totalPagar: number
  saldo: number
  titulosVencidos: number
  titulosAVencer: number
  contasReceber: any[]
  contasPagar: any[]
}

export async function obterResumoFinanceiro(): Promise<FinanceiroResumo> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  const hoje = new Date()

  // Helper para buscar TODAS as páginas de uma lista financeira
  async function fetchAllPages(endpoint: string, method: string, resultKey: string): Promise<any[]> {
    const PER_PAGE = 200
    const MAX_PAGES = 30
    const params = { pagina: 1, registros_por_pagina: PER_PAGE }

    const first = await omieCall<any>(endpoint, method, [params], { credentials: creds! })
    const totalPag = Math.min(first?.total_de_paginas || 1, MAX_PAGES)
    let all: any[] = first?.[resultKey] || []

    if (totalPag > 1) {
      const pageNumbers = Array.from({ length: totalPag - 1 }, (_, i) => i + 2)
      const BATCH = 3
      for (let i = 0; i < pageNumbers.length; i += BATCH) {
        const batch = pageNumbers.slice(i, i + BATCH)
        const results = await Promise.all(
          batch.map(pg =>
            omieCall<any>(endpoint, method, [{ ...params, pagina: pg }], { credentials: creds! })
              .catch(() => ({ [resultKey]: [] }))
          )
        )
        for (const r of results) all = all.concat(r?.[resultKey] || [])
      }
    }

    log.info({ endpoint, total: all.length, paginas: totalPag }, 'Financeiro Omie carregado')
    return all
  }

  const [contasReceberRaw, contasPagarRaw] = await Promise.all([
    fetchAllPages('/financas/contareceber/', 'ListarContasReceber', 'conta_receber_cadastro')
      .catch(() => []),
    fetchAllPages('/financas/contapagar/', 'ListarContasPagar', 'conta_pagar_cadastro')
      .catch(() => []),
  ])

  // Filtrar apenas contas de 2026 em diante (data_vencimento no formato dd/mm/aaaa)
  const isRecent = (d: string) => {
    if (!d) return true
    const parts = d.split('/')
    if (parts.length === 3) {
      const year = parseInt(parts[2], 10)
      return year >= 2026
    }
    return true
  }

  const contasReceber = contasReceberRaw.filter((c: any) => isRecent(c.data_vencimento))
  const contasPagar = contasPagarRaw.filter((c: any) => isRecent(c.data_vencimento))

  // Helper: dd/mm/yyyy → YYYYMMDD numérico para comparação
  const toNum = (d: string): number => {
    if (!d) return 0
    const parts = d.split('/')
    if (parts.length === 3) return parseInt(`${parts[2]}${parts[1]}${parts[0]}`, 10)
    return 0
  }

  const hojeNum = toNum(`${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`)

  let totalReceber = 0
  let totalPagar = 0
  let titulosVencidos = 0
  let titulosAVencer = 0

  for (const cr of contasReceber) {
    const valor = Number(cr.valor_documento || 0)
    totalReceber += valor
    const vencNum = toNum(cr.data_vencimento || '')
    if (vencNum > 0 && vencNum < hojeNum) titulosVencidos++
    else titulosAVencer++
  }

  for (const cp of contasPagar) {
    totalPagar += Number(cp.valor_documento || 0)
  }

  // Ordenar mais recentes primeiro (por data_vencimento desc dd/mm/yyyy)
  const sortByDate = (a: any, b: any) => toNum(b.data_vencimento || '') - toNum(a.data_vencimento || '')
  contasReceber.sort(sortByDate)
  contasPagar.sort(sortByDate)

  return {
    totalReceber,
    totalPagar,
    saldo: totalReceber - totalPagar,
    titulosVencidos,
    titulosAVencer,
    contasReceber,
    contasPagar,
  }
}

// ============================================
// Handler: pedido aprovado → enviar ao Omie
// ============================================

export async function onPedidoAprovado(pedidoId: number): Promise<{ success: boolean; error?: string; omie_codigo?: string }> {
  try {
    log.info({ pedidoId }, '🚀 Pedido aprovado — enviando automaticamente ao Omie...')
    const response = await criarPedidoOmie(pedidoId)
    return {
      success: true,
      omie_codigo: String(response.codigo_pedido || ''),
    }
  } catch (err: any) {
    log.error({ err, pedidoId }, '❌ Erro ao enviar pedido para Omie')
    return {
      success: false,
      error: err.message,
    }
  }
}
