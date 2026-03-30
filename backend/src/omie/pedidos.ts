import { omieCall, getOmieCredentials } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'
import {
  calcularDataPrevisao,
  garantirVendedorOmie,
  getCenarioVendas,
  getCenarioAmostra,
  getDepartamentoComercial,
  getCategoriaVendasMercadoria,
  getContaBancoBrasil,
  getLocalEstoqueVilaParis,
} from './reference-data.js'

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

  // Se já tem código Omie vinculado, retornar
  if (cliente.omie_codigo) {
    return parseInt(cliente.omie_codigo, 10)
  }

  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  const cnpj = (cliente.cnpj || '').replace(/\D/g, '')
  if (!cnpj) throw new Error(`Cliente ${clienteId} (${cliente.razao_social}) não tem CNPJ. Cadastre o CNPJ primeiro.`)

  // 1. Buscar se já existe no Omie por CNPJ (evita duplicata)
  try {
    const busca = await omieCall<any>(
      '/geral/clientes/',
      'ListarClientes',
      [{ pagina: 1, registros_por_pagina: 5, clientesFiltro: { cnpj_cpf: cnpj } }],
      { skipCache: true, credentials: creds }
    )
    const encontrado = busca?.clientes_cadastro?.[0]
    if (encontrado?.codigo_cliente_omie) {
      const codigoOmie = encontrado.codigo_cliente_omie
      await supabase.from('clientes').update({ omie_codigo: String(codigoOmie) }).eq('id', clienteId)
      log.info({ clienteId, codigoOmie, cnpj }, '🔗 Cliente já existia no Omie — vinculado ao CRM')
      return codigoOmie
    }
  } catch {
    // Busca falhou — seguir com Upsert (que cria se necessário)
    log.info({ clienteId, cnpj }, '⚠️ Busca prévia no Omie falhou, tentando Upsert...')
  }

  // 2. Criar/atualizar via UpsertClienteCpfCnpj (dedup nativo por CNPJ)
  log.info({ clienteId, cnpj, razao: cliente.razao_social }, '🔄 Criando/atualizando cliente no Omie...')

  const omieData = {
    cnpj_cpf: cnpj,
    razao_social: cliente.razao_social || '',
    nome_fantasia: cliente.nome_fantasia || cliente.razao_social || '',
    contato: cliente.contato_nome || '',
    email: cliente.contato_email || '',
    telefone1_numero: (cliente.contato_telefone || '').replace(/\D/g, '').slice(0, 15),
    telefone2_numero: (cliente.contato_celular || '').replace(/\D/g, '').slice(0, 15),
    endereco: cliente.endereco_rua || 'Não informado',
    endereco_numero: cliente.endereco_numero || 'S/N',
    complemento: cliente.endereco_complemento || '',
    bairro: cliente.endereco_bairro || 'Centro',
    cidade: cliente.endereco_cidade || 'São Paulo',
    estado: cliente.endereco_estado || 'SP',
    cep: (cliente.endereco_cep || '01001000').replace(/\D/g, ''),
    contribuinte: 'S',
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

interface ProdutoOmieResult {
  codigoOmie: number
  descricao: string
  unidade: string
  ncm: string
  marca: string
  especieVolume: string
  cfopInterno: string
  cfopExterno: string
  pesoKg: number
}

async function garantirProdutoOmie(produtoId: number): Promise<ProdutoOmieResult> {
  const { data: produto, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('id', produtoId)
    .single()

  if (error || !produto) throw new Error(`Produto ${produtoId} não encontrado no CRM`)

  const meta = {
    descricao: produto.nome || '',
    unidade: produto.unidade || 'UN',
    ncm: produto.ncm || '21069090',
    marca: produto.marca || '',
    especieVolume: produto.especie_volume || 'FARDO',
    cfopInterno: produto.cfop_interno || '5101',
    cfopExterno: produto.cfop_externo || '6101',
    pesoKg: produto.peso_kg || 0,
  }

  // Se já tem código Omie vinculado, retornar
  if (produto.omie_codigo) {
    return { codigoOmie: parseInt(produto.omie_codigo, 10), ...meta }
  }

  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  const codigoIntegracao = `CRM-PROD-${produtoId}`
  const skuBusca = produto.sku || codigoIntegracao

  // 1. Buscar se produto já existe no Omie (por código/SKU ou descrição)
  try {
    const busca = await omieCall<any>(
      '/geral/produtos/',
      'ListarProdutos',
      [{ pagina: 1, registros_por_pagina: 20, filtrar_apenas_descricao: produto.nome || '' }],
      { skipCache: true, credentials: creds }
    )
    const encontrados = busca?.produto_servico_cadastro || []
    // Match por código SKU ou por descrição exata
    const match = encontrados.find((p: any) =>
      (p.codigo && p.codigo === skuBusca) ||
      (p.codigo_produto_integracao && p.codigo_produto_integracao === codigoIntegracao) ||
      (p.descricao && p.descricao.toLowerCase() === (produto.nome || '').toLowerCase())
    )
    if (match?.codigo_produto) {
      const codigoOmie = match.codigo_produto
      await supabase.from('produtos').update({ omie_codigo: String(codigoOmie) }).eq('id', produtoId)
      log.info({ produtoId, codigoOmie, nome: produto.nome }, '🔗 Produto já existia no Omie — vinculado ao CRM')
      return { codigoOmie, ...meta }
    }
  } catch {
    log.info({ produtoId, nome: produto.nome }, '⚠️ Busca prévia de produto no Omie falhou, tentando criar...')
  }

  // 2. Produto não existe no Omie — criar
  log.info({ produtoId, nome: produto.nome }, '🔄 Criando produto no Omie...')

  const omieData = {
    codigo_produto_integracao: codigoIntegracao,
    descricao: produto.nome || '',
    unidade: produto.unidade || 'UN',
    valor_unitario: produto.preco || 0,
    ncm: '21069090',
    peso_bruto: produto.peso_kg || 0,
    peso_liq: produto.peso_kg || 0,
    codigo: skuBusca,
  }

  try {
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
    return { codigoOmie, ...meta }
  } catch (createErr: any) {
    // Se o erro indica que o produto já existe, extrair o código e validar
    const errMsg = createErr?.message || String(createErr)
    const codigoMatch = errMsg.match(/c[oó]digo\s+(\d+)/i)
    if (codigoMatch) {
      const codigoExistente = parseInt(codigoMatch[1], 10)
      // Validar se o produto realmente existe no Omie consultando-o
      try {
        const consulta = await omieCall<any>(
          '/geral/produtos/',
          'ConsultarProduto',
          [{ codigo_produto: codigoExistente }],
          { skipCache: true, credentials: creds }
        )
        if (consulta?.codigo_produto) {
          log.info({ produtoId, codigoExistente, nome: produto.nome }, '🔗 Produto validado no Omie — vinculando')
          await supabase.from('produtos').update({ omie_codigo: String(consulta.codigo_produto) }).eq('id', produtoId)
          return { codigoOmie: consulta.codigo_produto, ...meta }
        }
      } catch {
        log.warn({ produtoId, codigoExistente }, '⚠️ Código extraído do erro não é válido, buscando por descrição...')
      }
      // Fallback: buscar todas as páginas por descrição
      try {
        const buscaAll = await omieCall<any>(
          '/geral/produtos/',
          'ListarProdutos',
          [{ pagina: 1, registros_por_pagina: 50, filtrar_apenas_descricao: produto.nome || '' }],
          { skipCache: true, credentials: creds }
        )
        const encontrados = buscaAll?.produto_servico_cadastro || []
        const matchProd = encontrados.find((p: any) =>
          p.descricao && p.descricao.toLowerCase().trim() === (produto.nome || '').toLowerCase().trim()
        )
        if (matchProd?.codigo_produto) {
          log.info({ produtoId, codigoOmie: matchProd.codigo_produto, nome: produto.nome }, '🔗 Produto encontrado por descrição no Omie')
          await supabase.from('produtos').update({ omie_codigo: String(matchProd.codigo_produto) }).eq('id', produtoId)
          return { codigoOmie: matchProd.codigo_produto, ...meta }
        }
      } catch {
        log.warn({ produtoId }, '⚠️ Busca por descrição também falhou')
      }
    }
    // Rethrow se não conseguimos resolver
    throw createErr
  }
}

// ============================================
// Helpers: Forma de pagamento → Omie parcelas
// ============================================

/**
 * Mapeia a forma de pagamento do CRM para o código de parcela do Omie.
 * - "000" = À vista
 * - "999" = Parcelas customizadas (nós especificamos em lista_parcelas)
 */
function mapFormaPagamentoToCodigoParcela(formaPagamento: string): string {
  const fp = formaPagamento.toLowerCase().trim()
  if (fp === 'à vista' || fp === 'a vista') return '000'
  // Qualquer prazo ou parcelamento → parcelas customizadas
  return '999'
}

/**
 * Gera array de parcelas Omie com base na forma de pagamento.
 * - "À vista" → 1 parcela, 100%, vencimento = data_previsao
 * - "N dias" → 1 parcela, 100%, vencimento = data_previsao + N dias
 * - "Nx sem juros" → N parcelas iguais, 30 dias entre cada
 */
function gerarParcelas(formaPagamento: string, totalPedido: number, dataPrevisaoStr: string): any[] {
  const fp = formaPagamento.toLowerCase().trim()

  // Helper: parsear dd/mm/yyyy e somar dias
  function parseDataOmie(d: string): Date {
    const parts = d.split('/')
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
  }
  function formatDataOmie(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }
  function addDays(d: Date, days: number): Date {
    const r = new Date(d)
    r.setDate(r.getDate() + days)
    return r
  }

  const baseDate = parseDataOmie(dataPrevisaoStr)

  // À vista → 1 parcela, vencimento = data_previsao
  if (fp === 'à vista' || fp === 'a vista') {
    return [{
      numero_parcela: 1,
      data_vencimento: dataPrevisaoStr,
      percentual: 100,
      valor: Math.round(totalPedido * 100) / 100,
    }]
  }

  // "N dias" → 1 parcela com prazo
  const matchDias = fp.match(/^(\d+)\s*dias?$/)
  if (matchDias) {
    const dias = parseInt(matchDias[1], 10)
    return [{
      numero_parcela: 1,
      data_vencimento: formatDataOmie(addDays(baseDate, dias)),
      percentual: 100,
      valor: Math.round(totalPedido * 100) / 100,
    }]
  }

  // "Nx sem juros" → N parcelas iguais, 30 dias entre cada
  const matchParcelas = fp.match(/^(\d+)x/)
  if (matchParcelas) {
    const numParcelas = parseInt(matchParcelas[1], 10)
    const valorParcela = Math.floor(totalPedido * 100 / numParcelas) / 100
    const parcelas: any[] = []
    let somaValores = 0

    for (let i = 1; i <= numParcelas; i++) {
      const isLast = i === numParcelas
      const valor = isLast ? Math.round((totalPedido - somaValores) * 100) / 100 : valorParcela
      somaValores += valor
      const percentual = isLast
        ? Math.round((100 - (numParcelas - 1) * Math.floor(10000 / numParcelas) / 100) * 100) / 100
        : Math.floor(10000 / numParcelas) / 100

      parcelas.push({
        numero_parcela: i,
        data_vencimento: formatDataOmie(addDays(baseDate, 30 * i)),
        percentual: isLast ? Math.round((totalPedido > 0 ? valor / totalPedido * 100 : 0) * 100) / 100 : Math.round((valorParcela / totalPedido * 100) * 100) / 100,
        valor,
      })
    }
    return parcelas
  }

  // Fallback: à vista
  return [{
    numero_parcela: 1,
    data_vencimento: dataPrevisaoStr,
    percentual: 100,
    valor: Math.round(totalPedido * 100) / 100,
  }]
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

  // Pedido precisa estar confirmado (aprovado pelo gerente)
  if (pedido.status !== 'confirmado') {
    throw new Error(`Pedido ${pedidoId} não está aprovado. Status atual: "${pedido.status}". Somente pedidos confirmados podem ser enviados ao Omie.`)
  }

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

  // Buscar cliente para determinar estado (CFOP)
  const { data: cliente } = await supabase
    .from('clientes')
    .select('endereco_estado')
    .eq('id', pedido.cliente_id)
    .single()

  const estadoCliente = (cliente?.endereco_estado || '').toUpperCase()
  // Se endereço de entrega diferente, usar estado da entrega para CFOP
  const estadoEntrega = pedido.endereco_diferente && pedido.endereco_entrega_estado
    ? pedido.endereco_entrega_estado.toUpperCase()
    : estadoCliente
  const isIntraEstado = estadoEntrega === 'MG'

  // Tipo do pedido: 'venda' ou 'bonificacao'
  const tipoPedido = pedido.tipo || 'venda'

  log.info({ pedidoId, clienteId: pedido.cliente_id, qtdItens: itens.length, tipoPedido, estadoEntrega }, '📦 Preparando pedido para Omie...')

  // 1. Garantir cliente no Omie
  const codigoClienteOmie = await garantirClienteOmie(pedido.cliente_id)

  // 2. Buscar dados de referência do Omie em paralelo
  const [
    codigoVendedorOmie,
    cenarioVendas,
    cenarioAmostra,
    deptoComercial,
    categoriaVendas,
    contaBB,
    localEstoque,
  ] = await Promise.all([
    pedido.vendedor_id ? garantirVendedorOmie(pedido.vendedor_id, creds) : Promise.resolve(0),
    getCenarioVendas(creds),
    getCenarioAmostra(creds),
    getDepartamentoComercial(creds),
    getCategoriaVendasMercadoria(creds),
    getContaBancoBrasil(creds),
    getLocalEstoqueVilaParis(creds),
  ])

  // Cenário fiscal: vendas ou amostra/bonificação (automático pelo tipo)
  const cenarioFiscal = tipoPedido === 'bonificacao' ? cenarioAmostra : cenarioVendas

  // 3. Garantir produtos no Omie e montar itens
  const det: any[] = []
  let totalVolumes = 0
  let especieVolume = 'FARDO'
  let marcaVolumes = ''

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i]
    const prodOmie = await garantirProdutoOmie(item.produto_id)

    totalVolumes += item.quantidade || 0
    if (prodOmie.especieVolume) especieVolume = prodOmie.especieVolume
    if (prodOmie.marca) marcaVolumes = prodOmie.marca

    const cfop = isIntraEstado ? prodOmie.cfopInterno : prodOmie.cfopExterno
    const pesoTotal = (prodOmie.pesoKg || 0) * (item.quantidade || 1)

    const detItem: any = {
      ide: {
        codigo_item_integracao: `CRM-${pedidoId}-${i}`,
      },
      produto: {
        codigo_produto: prodOmie.codigoOmie,
        codigo_produto_integracao: `CRM-PROD-${item.produto_id}`,
        descricao: prodOmie.descricao,
        unidade: prodOmie.unidade,
        ncm: prodOmie.ncm,
        cfop: cfop,
        quantidade: item.quantidade,
        valor_unitario: item.preco,
        tipo_desconto: 'V',
        valor_desconto: 0,
      },
      inf_adic: {
        peso_bruto: pesoTotal,
        peso_liquido: pesoTotal,
      },
    }

    // Cenário fiscal por item (se tiver)
    if (cenarioFiscal) {
      detItem.ide.codigo_cenario_impostos_item = cenarioFiscal
    }

    // Local de estoque (se tiver)
    if (localEstoque) {
      detItem.produto.codigo_local_estoque = localEstoque
    }

    det.push(detItem)
  }

  // 4. Data de previsão: 7 dias úteis
  const dataPrevisao = calcularDataPrevisao(7)

  // 5. Forma de pagamento → parcelas Omie
  const formaPagamento = (pedido.forma_pagamento || 'À vista').trim()
  const codigoParcela = mapFormaPagamentoToCodigoParcela(formaPagamento)

  // 5. Cabeçalho do pedido
  const cabecalho: any = {
    codigo_pedido_integracao: `CRM-PED-${pedidoId}`,
    codigo_cliente: codigoClienteOmie,
    data_previsao: dataPrevisao,
    etapa: '10',
    codigo_parcela: codigoParcela,
    quantidade_itens: itens.length,
  }

  // Cenário fiscal no cabeçalho
  if (cenarioFiscal) {
    cabecalho.codigo_cenario_impostos = cenarioFiscal
  }

  // Vendedor: vai em informacoes_adicionais como 'codVend' (não no cabecalho)

  // 6. Frete
  // modalidade: 0 = CIF (remetente/entrega), 1 = FOB (destinatário/retirada), 9 = sem frete
  const tipoFrete = (pedido.tipo_frete || '').toUpperCase()
  let modalidadeFrete = '9'
  if (tipoFrete === 'CIF') modalidadeFrete = '0'
  else if (tipoFrete === 'FOB') modalidadeFrete = '1'

  const frete: any = {
    modalidade: modalidadeFrete,
    quantidade_volumes: totalVolumes,
    especie_volumes: especieVolume,
    marca_volumes: marcaVolumes,
  }

  // 7. Departamentos: COMERCIAL (Omie WSDL: cCodDepto, nPerc, nValor, nValorFixo)
  const departamentos: any[] = []
  if (deptoComercial) {
    departamentos.push({ cCodDepto: deptoComercial, nPerc: 100, nValor: 0, nValorFixo: 'N' })
  }

  // 8. Informações adicionais
  const infAdic: any = {
    codigo_categoria: categoriaVendas || '1.01.03',
    consumidor_final: 'S',
    enviar_email: 'N',
  }
  if (contaBB) infAdic.codigo_conta_corrente = contaBB
  if (codigoVendedorOmie) infAdic.codVend = codigoVendedorOmie

  // Endereço de entrega diferente
  if (pedido.endereco_diferente) {
    infAdic.cep_entrega = (pedido.endereco_entrega_cep || '').replace(/\D/g, '')
    infAdic.endereco_entrega = pedido.endereco_entrega_rua || ''
    infAdic.numero_entrega = pedido.endereco_entrega_numero || ''
    infAdic.bairro_entrega = pedido.endereco_entrega_bairro || ''
    infAdic.estado_entrega = pedido.endereco_entrega_estado || ''
    infAdic.cidade_entrega = pedido.endereco_entrega_cidade || ''
  }

  // 9. Montar pedido Omie completo
  const omiePedido: any = {
    cabecalho,
    det,
    frete,
    informacoes_adicionais: infAdic,
  }

  // Departamentos (se encontrado)
  if (departamentos.length > 0) {
    omiePedido.departamentos = departamentos
  }

  // Parcelas baseadas na forma de pagamento
  const totalPedido = itens.reduce((sum: number, item: any) => sum + (item.preco || 0) * (item.quantidade || 1), 0)
  omiePedido.lista_parcelas = {
    parcela: gerarParcelas(formaPagamento, totalPedido, dataPrevisao),
  }

  // Observações do CRM
  if (pedido.observacoes) {
    omiePedido.observacoes = { obs_venda: pedido.observacoes }
  }

  log.info({ pedidoId, tipoPedido, cenarioFiscal, modalidadeFrete, codigoVendedorOmie, dataPrevisao }, '📤 Enviando pedido para Omie...')

  // 10. Enviar ao Omie
  const response = await omieCall<OmiePedidoResponse>(
    '/produtos/pedido/',
    'IncluirPedido',
    [omiePedido],
    { skipCache: true, credentials: creds }
  )

  log.info({ pedidoId, omieResponse: response }, '✅ Pedido criado no Omie')

  // 11. Salvar código Omie no pedido do CRM
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

// Helper: converter data dd/mm/aaaa para yyyy-mm-dd (ISO)
function parseOmieDate(d: string): string {
  if (!d) return ''
  const parts = d.split('/')
  if (parts.length === 3 && parts[0].length <= 2) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  return d
}

// Mapear etapa Omie (código numérico ou texto) para status padronizado
// Códigos confirmados via debug logs: 00=cancelado, 10=enviado, 20=em_producao, 60=faturado, 70=expedido, 80=entregue
function mapEtapaToStatus(etapa: string): string {
  const e = String(etapa).trim()
  // Códigos numéricos do Omie (confirmados em produção)
  if (e === '00') return 'cancelado'     // Cancelado / Orçamento cancelado
  if (e === '10') return 'enviado'       // Pedido enviado / Em aberto
  if (e === '20') return 'em_producao'   // Em separação / Produção
  if (e === '30') return 'em_producao'   // Aguardando faturamento
  if (e === '40') return 'faturado'      // Em faturamento
  if (e === '50') return 'faturado'      // Faturamento parcial
  if (e === '60') return 'faturado'      // Faturado (NF emitida)
  if (e === '70') return 'expedido'      // Expedido / Em trânsito
  if (e === '80') return 'entregue'      // Entregue / Encerrado
  if (e === '90' || e === '99') return 'cancelado'
  // Texto descritivo (fallback)
  const lower = e.toLowerCase()
  if (lower.includes('faturad') || lower.includes('faturar') || lower.includes('nf')) return 'faturado'
  if (lower.includes('separ') || lower.includes('produ')) return 'em_producao'
  if (lower.includes('exped') || lower.includes('trânsito') || lower.includes('transit')) return 'expedido'
  if (lower.includes('entreg') || lower.includes('finaliz') || lower.includes('conclu') || lower.includes('encerr')) return 'entregue'
  if (lower.includes('cancel')) return 'cancelado'
  return 'enviado'
}

// Extrair dados de um pedido bruto do Omie para formato padronizado
function mapPedidoOmie(p: any): PedidoAcompanhamento {
  const cab = p.cabecalho || {}
  const infoCad = p.infoCadastro || {}
  const totalPedido = p.total_pedido || {}
  const frete = p.frete || {}
  const obs = p.observacoes || {}

  // Etapa: buscar em todos os campos possíveis
  const etapaRaw = cab.etapa || infoCad.cEtapa || infoCad.etapa || ''
  const descEtapa = cab.descricao_etapa || infoCad.cDescricaoEtapa || infoCad.cDescEtapa || ''
  const statusOmie = mapEtapaToStatus(etapaRaw || descEtapa)

  // Data: preferir data_previsao, senão dInclusao, senão dDtInc
  const dataRaw = cab.data_previsao || infoCad.dInclusao || infoCad.dDtInc || infoCad.dDtAlt || ''
  const dataISO = parseOmieDate(dataRaw)

  // NF: buscar em vários campos
  const nf = infoCad.nNumeroNF || infoCad.numero_nf || cab.numero_nf || ''

  // Rastreio: pode estar no frete
  const rastreio = frete.codigo_rastreio || frete.outras_informacoes || ''

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
    etapaOmie: descEtapa || etapaRaw,
    nf: nf ? String(nf) : '',
    codigoRastreio: rastreio ? String(rastreio) : '',
    dataFaturamento: parseOmieDate(infoCad.dDataFaturamento || infoCad.dDtFat || infoCad.dFaturamento || ''),
    omieCodigo: String(cab.codigo_pedido || ''),
  }
}

// Buscar todas as páginas de pedidos do Omie (com filtro de data para não sobrecarregar)
async function fetchAllPedidosOmie(creds: { appKey: string; appSecret: string }, filtroData?: { de: string; ate: string }): Promise<any[]> {
  const PER_PAGE = 50 // Omie cap real é ~50
  const MAX_PAGES = 500 // 500 * 50 = 25.000 pedidos max

  // Filtro de data padrão: últimos 12 meses
  const agora = new Date()
  const de12meses = new Date(agora)
  de12meses.setMonth(de12meses.getMonth() - 12)
  const formatDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

  const filtroParams: any = {
    pagina: 1,
    registros_por_pagina: PER_PAGE,
    apenas_importado_api: 'N',
    filtrar_por_data_de: filtroData?.de || formatDate(de12meses),
    filtrar_por_data_ate: filtroData?.ate || formatDate(agora),
  }

  const firstResult = await omieCall<any>(
    '/produtos/pedido/',
    'ListarPedidos',
    [filtroParams],
    { credentials: creds }
  )

  const totalRegistros = firstResult?.total_de_registros || 0
  const totalPaginas = Math.min(firstResult?.total_de_paginas || 1, MAX_PAGES)
  let pedidosOmie: any[] = firstResult?.pedido_venda_produto || []

  // Logar amostra do primeiro pedido para debug de campos
  if (pedidosOmie.length > 0) {
    const sample = pedidosOmie[0]
    log.info({
      totalRegistros,
      totalPaginas,
      perPageReal: pedidosOmie.length,
      sampleKeys: Object.keys(sample),
      cabKeys: Object.keys(sample.cabecalho || {}),
      infoCadKeys: Object.keys(sample.infoCadastro || {}),
      etapa: sample.cabecalho?.etapa,
      descEtapa: sample.cabecalho?.descricao_etapa,
      infoCadEtapa: sample.infoCadastro?.cEtapa,
      infoCadDescEtapa: sample.infoCadastro?.cDescricaoEtapa,
    }, 'Omie ListarPedidos — sample pedido (debug)')
  }

  // Buscar páginas restantes
  let failedPages = 0
  if (totalPaginas > 1) {
    const pageNumbers = Array.from({ length: totalPaginas - 1 }, (_, i) => i + 2)
    const BATCH = 3

    for (let i = 0; i < pageNumbers.length; i += BATCH) {
      const batch = pageNumbers.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map(pg =>
          omieCall<any>(
            '/produtos/pedido/',
            'ListarPedidos',
            [{ ...filtroParams, pagina: pg }],
            { credentials: creds }
          ).catch((err) => {
            failedPages++
            log.warn({ pg, error: err?.message || String(err) }, 'Omie ListarPedidos — falha ao buscar página')
            return { pedido_venda_produto: [] }
          })
        )
      )
      for (const r of results) {
        pedidosOmie = pedidosOmie.concat(r?.pedido_venda_produto || [])
      }
      // Pequeno delay entre batches para evitar rate limit
      if (i + BATCH < pageNumbers.length) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  log.info({ total: pedidosOmie.length, totalRegistros, paginas: totalPaginas, failedPages, filtro: filtroParams.filtrar_por_data_de + ' a ' + filtroParams.filtrar_por_data_ate }, 'Pedidos Omie carregados')
  return pedidosOmie
}

export async function listarPedidosOmieAcompanhamento(): Promise<PedidoAcompanhamento[]> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  const pedidosOmie = await fetchAllPedidosOmie(creds)
  if (pedidosOmie.length === 0) return []

  // Debug: logar todas as etapas únicas encontradas
  const etapasMap = new Map<string, number>()
  for (const p of pedidosOmie) {
    const cab = p.cabecalho || {}
    const infoCad = p.infoCadastro || {}
    const etapaRaw = cab.etapa || infoCad.cEtapa || infoCad.etapa || 'VAZIO'
    const descEtapa = cab.descricao_etapa || infoCad.cDescricaoEtapa || infoCad.cDescEtapa || ''
    const key = `${etapaRaw}|${descEtapa}`
    etapasMap.set(key, (etapasMap.get(key) || 0) + 1)
  }
  log.info({ etapas: Object.fromEntries(etapasMap), totalPedidos: pedidosOmie.length }, 'Omie — etapas únicas encontradas (debug)')

  // Debug: logar JSON completo do primeiro pedido
  if (pedidosOmie.length > 0) {
    log.info({ primeiroPedido: JSON.stringify(pedidosOmie[0]).slice(0, 2000) }, 'Omie — primeiro pedido RAW (debug)')
  }

  const resultado = pedidosOmie.map(mapPedidoOmie)

  // Ordenar mais recentes primeiro
  resultado.sort((a, b) => Number(b.omieCodigo) - Number(a.omieCodigo))

  return resultado
}

// Busca sob demanda: pesquisar pedidos por número ou cliente direto no Omie
export async function buscarPedidoOmie(termo: string): Promise<PedidoAcompanhamento[]> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  // Tentar buscar por número do pedido
  const numeroPedido = parseInt(termo, 10)

  if (!isNaN(numeroPedido) && numeroPedido > 0) {
    // Busca por código do pedido
    try {
      const result = await omieCall<any>(
        '/produtos/pedido/',
        'ConsultarPedido',
        [{ codigo_pedido: numeroPedido }],
        { credentials: creds }
      )
      if (result?.cabecalho) {
        return [mapPedidoOmie(result)]
      }
    } catch {
      // Tentar como número_pedido
      try {
        const result = await omieCall<any>(
          '/produtos/pedido/',
          'ConsultarPedido',
          [{ numero_pedido: termo }],
          { credentials: creds }
        )
        if (result?.cabecalho) {
          return [mapPedidoOmie(result)]
        }
      } catch { /* continua para busca geral */ }
    }
  }

  // Busca geral com filtro (busca por texto no Omie não existe, então buscamos tudo e filtramos)
  const pedidosOmie = await fetchAllPedidosOmie(creds)
  const termoLower = termo.toLowerCase()
  const filtered = pedidosOmie.filter((p: any) => {
    const cab = p.cabecalho || {}
    return (
      String(cab.codigo_pedido || '').includes(termo) ||
      String(cab.numero_pedido || '').includes(termo) ||
      (cab.razao_social || '').toLowerCase().includes(termoLower) ||
      (cab.nome_fantasia || '').toLowerCase().includes(termoLower)
    )
  })

  const resultado = filtered.map(mapPedidoOmie)
  resultado.sort((a, b) => Number(b.omieCodigo) - Number(a.omieCodigo))
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
