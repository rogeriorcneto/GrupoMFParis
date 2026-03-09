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

  // Buscar pedidos com omie_codigo
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, numero, cliente_id, vendedor_id, total_valor, data_criacao, status, omie_codigo, omie_numero, omie_status')
    .not('omie_codigo', 'is', null)
    .order('data_criacao', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  if (!pedidos || pedidos.length === 0) return []

  // Buscar nomes de clientes e vendedores
  const clienteIds = [...new Set(pedidos.map(p => p.cliente_id))]
  const vendedorIds = [...new Set(pedidos.map(p => p.vendedor_id))]

  const [clientesRes, vendedoresRes] = await Promise.all([
    supabase.from('clientes').select('id, razao_social').in('id', clienteIds),
    supabase.from('vendedores').select('id, nome').in('id', vendedorIds),
  ])

  const clienteMap = new Map((clientesRes.data || []).map((c: any) => [c.id, c.razao_social]))
  const vendedorMap = new Map((vendedoresRes.data || []).map((v: any) => [v.id, v.nome]))

  // Para cada pedido, tentar consultar status no Omie (com rate-limit awareness)
  const resultado: PedidoAcompanhamento[] = []
  let consultasOmie = 0
  const MAX_CONSULTAS = 10 // Limitar consultas ao Omie por chamada

  for (const p of pedidos) {
    let statusOmie = p.omie_status || 'enviado'
    let etapaOmie = ''
    let nf = ''
    let codigoRastreio = ''
    let dataFaturamento = ''

    // Consultar no Omie apenas os primeiros N (evitar rate-limit)
    if (consultasOmie < MAX_CONSULTAS && p.omie_codigo) {
      try {
        const omieData = await omieCall<any>(
          '/produtos/pedido/',
          'ConsultarPedido',
          [{ codigo_pedido: parseInt(p.omie_codigo, 10) }],
          { credentials: creds }
        )

        const cab = omieData?.cabecalho || {}
        const infoCad = omieData?.infoCadastro || {}
        const transporte = omieData?.transporte || {}

        etapaOmie = cab.descricao_etapa || infoCad.cDescEtapa || cab.etapa || ''
        nf = infoCad.nNumeroNF ? String(infoCad.nNumeroNF) : ''
        codigoRastreio = transporte.codigo_rastreio || ''
        dataFaturamento = infoCad.dDataFaturamento || infoCad.dDtFat || ''

        // Mapear etapa Omie para status legível
        const etapaLower = etapaOmie.toLowerCase()
        if (etapaLower.includes('faturado') || etapaLower.includes('faturar')) statusOmie = 'faturado'
        else if (etapaLower.includes('separar') || etapaLower.includes('produção')) statusOmie = 'em_producao'
        else if (etapaLower.includes('expedir') || etapaLower.includes('expedido')) statusOmie = 'expedido'
        else if (etapaLower.includes('entregue') || etapaLower.includes('finalizado')) statusOmie = 'entregue'
        else if (etapaLower.includes('cancelado')) statusOmie = 'cancelado'
        else statusOmie = 'enviado'

        // Atualizar status no banco para cache
        await supabase.from('pedidos').update({ omie_status: statusOmie }).eq('id', p.id)

        consultasOmie++
      } catch (err: any) {
        log.warn({ err: err.message, pedidoId: p.id }, 'Erro ao consultar pedido no Omie (acompanhamento)')
      }
    }

    resultado.push({
      pedidoId: p.id,
      numero: p.numero,
      clienteNome: clienteMap.get(p.cliente_id) || 'Cliente não encontrado',
      clienteId: p.cliente_id,
      vendedorNome: vendedorMap.get(p.vendedor_id) || 'Vendedor não encontrado',
      valor: Number(p.total_valor),
      dataCriacao: p.data_criacao,
      statusCrm: p.status,
      statusOmie,
      etapaOmie,
      nf,
      codigoRastreio,
      dataFaturamento,
      omieCodigo: p.omie_codigo,
    })
  }

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

  // Filtrar últimos 6 meses até 6 meses no futuro
  const hoje = new Date()
  const seisAtras = new Date(hoje)
  seisAtras.setMonth(seisAtras.getMonth() - 6)
  const seisFrente = new Date(hoje)
  seisFrente.setMonth(seisFrente.getMonth() + 6)

  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const dataInicio = fmt(seisAtras)
  const dataFim = fmt(seisFrente)

  const [receber, pagar] = await Promise.all([
    omieCall<any>(
      '/financas/contareceber/',
      'ListarContasReceber',
      [{
        pagina: 1,
        registros_por_pagina: 50,
        filtrar_por_data_de: dataInicio,
        filtrar_por_data_ate: dataFim,
      }],
      { credentials: creds }
    ).catch(() => ({ conta_receber_cadastro: [] })),
    omieCall<any>(
      '/financas/contapagar/',
      'ListarContasPagar',
      [{
        pagina: 1,
        registros_por_pagina: 50,
        filtrar_por_data_de: dataInicio,
        filtrar_por_data_ate: dataFim,
      }],
      { credentials: creds }
    ).catch(() => ({ conta_pagar_cadastro: [] })),
  ])

  const contasReceber = receber?.conta_receber_cadastro || []
  const contasPagar = pagar?.conta_pagar_cadastro || []

  const hojeStr = hoje.toISOString().split('T')[0]

  let totalReceber = 0
  let totalPagar = 0
  let titulosVencidos = 0
  let titulosAVencer = 0

  for (const cr of contasReceber) {
    const valor = Number(cr.valor_documento || 0)
    totalReceber += valor
    const venc = cr.data_vencimento || ''
    if (venc && venc < hojeStr) titulosVencidos++
    else titulosAVencer++
  }

  for (const cp of contasPagar) {
    totalPagar += Number(cp.valor_documento || 0)
  }

  return {
    totalReceber,
    totalPagar,
    saldo: totalReceber - totalPagar,
    titulosVencidos,
    titulosAVencer,
    contasReceber: contasReceber.slice(0, 20),
    contasPagar: contasPagar.slice(0, 20),
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
