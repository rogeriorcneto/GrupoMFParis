import { omieCall, getOmieCredentials } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'
import {
  calcularDataPrevisao,
  garantirVendedorOmie,
  fetchVendedoresOmie,
  getCenarioVendas,
  getCenarioAmostra,
  getDepartamentoComercial,
  getCategoriaVendasMercadoria,
  getContaBancoBrasil,
  getLocalEstoqueVilaParis,
  getEstadoEmpresa,
  mapFormaPagamentoToCodigoParcelaOmie,
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
  codigoReferencia?: string
  descricao: string
  unidade: string
  ncm: string
  marca: string
  especieVolume: string
  cfopInterno: string
  cfopExterno: string
  pesoKg: number
}

function toNumberSafe(value: any): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value).replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function pesoFromNomeProduto(nome: string): number {
  const normalized = String(nome || '').toLowerCase()
  const match = normalized.match(/(\d+(?:[\.,]\d+)?)\s*kg\b/)
  if (!match) return 0
  return toNumberSafe(match[1])
}

function buildMetaProduto(produto: any, consultaOmie?: any) {
  const pesoCrm = toNumberSafe(produto?.peso_kg)
  const pesoNome = pesoFromNomeProduto(produto?.nome || '')
  const pesoOmie = Math.max(toNumberSafe(consultaOmie?.peso_liq), toNumberSafe(consultaOmie?.peso_bruto))

  let pesoFinal = pesoOmie || pesoCrm || pesoNome || 0
  if (pesoNome > 0 && pesoCrm > 0 && pesoCrm > pesoNome * 1.5 && pesoOmie <= 0) {
    pesoFinal = pesoNome
  }

  return {
    descricao: consultaOmie?.descricao || produto?.nome || '',
    unidade: consultaOmie?.unidade || produto?.unidade || 'UN',
    ncm: consultaOmie?.ncm || produto?.ncm || '21069090',
    marca: consultaOmie?.marca || produto?.marca || '',
    especieVolume: produto?.especie_volume || 'FARDO',
    cfopInterno: produto?.cfop_interno || '5101',
    cfopExterno: produto?.cfop_externo || '6101',
    pesoKg: pesoFinal,
  }
}

async function garantirProdutoOmie(produtoId: number): Promise<ProdutoOmieResult> {
  const { data: produto, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('id', produtoId)
    .single()

  if (error || !produto) throw new Error(`Produto ${produtoId} não encontrado no CRM`)

  const meta = buildMetaProduto(produto)

  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  // Se já tem código Omie vinculado, validar e retornar
  if (produto.omie_codigo) {
    const codigoRef = String(produto.omie_codigo).trim()
    const codigoOmie = parseInt(codigoRef, 10)

    // 1) Tentar como código interno (codigo_produto)
    if (!Number.isNaN(codigoOmie)) {
      try {
        const consulta = await omieCall<any>(
          '/geral/produtos/',
          'ConsultarProduto',
          [{ codigo_produto: codigoOmie }],
          { skipCache: true, credentials: creds }
        )
        if (consulta?.codigo_produto) {
          const metaOmie = buildMetaProduto(produto, consulta)
          return { codigoOmie: Number(consulta.codigo_produto), ...metaOmie }
        }
      } catch {
        // fallback abaixo
      }
    }

    // 1.1) Tentar referência como código comercial da listagem Omie (campo "codigo")
    try {
      const consultaPorCodigo = await omieCall<any>(
        '/geral/produtos/',
        'ConsultarProduto',
        [{ codigo: codigoRef }],
        { skipCache: true, credentials: creds }
      )
      if (consultaPorCodigo?.codigo_produto) {
        const codigoInterno = Number(consultaPorCodigo.codigo_produto)
        if (String(produto.omie_codigo) !== String(codigoInterno)) {
          await supabase.from('produtos').update({ omie_codigo: String(codigoInterno) }).eq('id', produtoId)
          log.info(
            { produtoId, codigoOriginal: produto.omie_codigo, codigoInterno, nome: produto.nome },
            '🔄 Produto Omie resolvido via código comercial para código interno'
          )
        }
        const metaOmie = buildMetaProduto(produto, consultaPorCodigo)
        return { codigoOmie: codigoInterno, ...metaOmie }
      }
    } catch {
      // fallback abaixo
    }

    // 2) Fallback: omie_codigo pode ser o "Código" comercial exibido na UI do Omie
    //    Nesse caso, buscamos por descrição e/ou código comercial e resolvemos para codigo_produto interno.
    try {
      const buscaFallback = await omieCall<any>(
        '/geral/produtos/',
        'ListarProdutos',
        [{ pagina: 1, registros_por_pagina: 50, filtrar_apenas_descricao: produto.nome || '' }],
        { skipCache: true, credentials: creds }
      )

      const encontrados = buscaFallback?.produto_servico_cadastro || []
      const nomeProduto = String(produto.nome || '').toLowerCase().trim()

      const match = encontrados.find((p: any) => {
        const codigoInterno = String(p?.codigo_produto || '').trim()
        const codigoComercial = String(p?.codigo || '').trim()
        const codigoIntegracao = String(p?.codigo_produto_integracao || '').trim()
        const descricao = String(p?.descricao || '').toLowerCase().trim()

        return (
          codigoInterno === codigoRef ||
          codigoComercial === codigoRef ||
          codigoIntegracao === codigoRef ||
          (descricao.length > 0 && descricao === nomeProduto)
        )
      })

      if (match?.codigo_produto) {
        const codigoInterno = Number(match.codigo_produto)
        if (String(produto.omie_codigo) !== String(codigoInterno)) {
          await supabase.from('produtos').update({ omie_codigo: String(codigoInterno) }).eq('id', produtoId)
          log.info(
            { produtoId, codigoOriginal: produto.omie_codigo, codigoInterno, nome: produto.nome },
            '🔄 Produto Omie resolvido de código comercial para código interno'
          )
        }
        const metaOmie = buildMetaProduto(produto, match)
        return { codigoOmie: codigoInterno, ...metaOmie }
      }

      log.warn(
        { produtoId, codigoRef, nome: produto.nome },
        '⚠️ Produto não confirmado por consulta Omie; enviando pedido com código de referência da listagem'
      )
      return { codigoOmie: Number.isNaN(codigoOmie) ? 0 : codigoOmie, codigoReferencia: codigoRef, ...meta }
    } catch (err: any) {
      log.warn(
        { produtoId, codigoRef, nome: produto.nome, erro: err?.message },
        '⚠️ Falha na validação Omie; enviando pedido com código de referência da listagem'
      )
      return { codigoOmie: Number.isNaN(codigoOmie) ? 0 : codigoOmie, codigoReferencia: codigoRef, ...meta }
    }
  }

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

  // 2. Produto não existe no Omie — ERRO! Não criar produtos automaticamente
  throw new Error(`Produto "${produto.nome}" (ID: ${produtoId}) não encontrado no Omie ERP. Cadastre o produto no Omie primeiro ou vincule o código manualmente.`)
}

// ============================================
// Helpers: Forma de pagamento → Omie parcelas
// ============================================

/**
 * Gera array de parcelas Omie com base na forma de pagamento do CRM.
 *
 * Formatos suportados:
 *  - "À vista"          → 1 parcela no vencimento base
 *  - "7 dias"           → 1 parcela, +7 dias
 *  - "28 dias"          → 1 parcela, +28 dias
 *  - "7/14"             → 2 parcelas iguais, +7 e +14 dias
 *  - "7/14/21"          → 3 parcelas iguais, +7, +14 e +21 dias
 *  - "14/28/42"         → 3 parcelas iguais, +14, +28 e +42 dias
 *  - qualquer "D1/D2/.." → N parcelas iguais nos dias informados
 */
function gerarParcelas(formaPagamento: string, totalPedido: number, dataPrevisaoStr: string): any[] {
  const fp = formaPagamento.trim()

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
  function round2(n: number) { return Math.round(n * 100) / 100 }

  const baseDate = parseDataOmie(dataPrevisaoStr)
  const fpLower = fp.toLowerCase()

  // À vista → 1 parcela no vencimento base
  if (fpLower === 'à vista' || fpLower === 'a vista') {
    return [{ numero_parcela: 1, data_vencimento: dataPrevisaoStr, percentual: 100, valor: round2(totalPedido) }]
  }

  // "N dias" → 1 parcela com N dias de prazo
  const matchDias = fpLower.match(/^(\d+)\s*dias?$/)
  if (matchDias) {
    const dias = parseInt(matchDias[1], 10)
    return [{ numero_parcela: 1, data_vencimento: formatDataOmie(addDays(baseDate, dias)), percentual: 100, valor: round2(totalPedido) }]
  }

  // "D1/D2/.../Dn" → N parcelas iguais, cada uma com o prazo em dias da data base
  // Ex: "7/14", "7/14/21", "14/28/42", "28/35/42/49/56"
  const partes = fp.split('/').map(p => p.trim()).filter(Boolean)
  const diasParcelas = partes.map(p => parseInt(p, 10)).filter(n => !isNaN(n) && n > 0)

  if (diasParcelas.length >= 2) {
    const n = diasParcelas.length
    const valorParcela = round2(totalPedido / n)
    // Ajuste de arredondamento na última parcela
    const somaAnterior = round2(valorParcela * (n - 1))
    const ultimaP = round2(totalPedido - somaAnterior)
    const pct = round2(100 / n)
    const pctSomaAnterior = round2(pct * (n - 1))
    const ultimoPct = round2(100 - pctSomaAnterior)

    return diasParcelas.map((dias, idx) => ({
      numero_parcela: idx + 1,
      data_vencimento: formatDataOmie(addDays(baseDate, dias)),
      percentual: idx === n - 1 ? ultimoPct : pct,
      valor: idx === n - 1 ? ultimaP : valorParcela,
    }))
  }

  // Fallback: à vista
  return [{ numero_parcela: 1, data_vencimento: dataPrevisaoStr, percentual: 100, valor: round2(totalPedido) }]
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
  const estadoEmpresa = await getEstadoEmpresa(creds)
  const isIntraEstado = estadoEntrega === estadoEmpresa

  // Tipo do pedido: 'venda' ou 'bonificacao'
  const tipoPedido = pedido.tipo || 'venda'

  log.info({ pedidoId, clienteId: pedido.cliente_id, qtdItens: itens.length, tipoPedido, estadoEntrega, estadoEmpresa, isIntraEstado }, '📦 Preparando pedido para Omie...')

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
  if (tipoPedido === 'bonificacao' && !cenarioFiscal) {
    throw new Error('Cenário fiscal "Bonificação" não encontrado no Omie. Verifique se o cenário está cadastrado em Configurações → Cenários Fiscais no Omie ERP.')
  }

  // 3. Garantir produtos no Omie e montar itens
  const det: any[] = []
  let totalVolumes = 0
  let especieVolume = 'FARDO'
  let marcaVolumes = ''

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i]
    const prodOmie = await garantirProdutoOmie(item.produto_id)
    const quantidade = toNumberSafe(item.quantidade)

    totalVolumes += quantidade
    if (prodOmie.especieVolume) especieVolume = prodOmie.especieVolume
    if (prodOmie.marca) marcaVolumes = prodOmie.marca

    const cfop = isIntraEstado ? prodOmie.cfopInterno : prodOmie.cfopExterno
    const pesoTotal = quantidade

    const detItem: any = {
      ide: {
        codigo_item_integracao: `CRM-${pedidoId}-${i}`,
      },
      produto: {
        codigo_produto: prodOmie.codigoOmie,
        codigo: prodOmie.codigoReferencia,
        codigo_produto_integracao: `CRM-PROD-${item.produto_id}`,
        descricao: prodOmie.descricao,
        unidade: prodOmie.unidade,
        ncm: prodOmie.ncm,
        cfop: cfop,
        quantidade: quantidade,
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
  const { codigo: codigoParcela, usarListaParcelas } = await mapFormaPagamentoToCodigoParcelaOmie(formaPagamento, creds)

  // 5. Cabeçalho do pedido
  const cabecalho: any = {
    codigo_pedido_integracao: `CRM-${tipoPedido === 'bonificacao' ? 'AMT' : 'PED'}-${pedidoId}`,
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
    departamentos.push({ cCodDepto: deptoComercial, nPerc: 100, nValor: Number(pedido.total_valor) || 0, nValorFixo: 'N' })
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
  
  // Sempre enviar lista_parcelas com datas explícitas para garantir vencimentos corretos no Omie.
  // Exceção: à vista (codigo '000') — o Omie resolve sozinho.
  if (codigoParcela === '000') {
    log.info({ pedidoId, formaPagamento, codigoParcela }, '✅ À vista — sem lista_parcelas')
  } else {
    const parcelas = gerarParcelas(formaPagamento, totalPedido, dataPrevisao)
    omiePedido.lista_parcelas = { parcela: parcelas }
    // Quando enviamos lista_parcelas, usar código 999 para o Omie não sobrescrever as datas
    cabecalho.codigo_parcela = '999'
    log.info({ pedidoId, formaPagamento, codigoParcela, numParcelas: parcelas.length, primeiraParcela: parcelas[0] }, '📅 Parcelas com datas explícitas enviadas para Omie')
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
  // Fallback: se numero_pedido não veio, usa codigo_pedido formatado
  const omieNumero = response.numero_pedido 
    ? String(response.numero_pedido)
    : response.codigo_pedido 
      ? String(response.codigo_pedido)
      : ''
  
  await supabase
    .from('pedidos')
    .update({
      omie_codigo: String(response.codigo_pedido || ''),
      omie_numero: omieNumero,
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

  // Tentar resolver pelo CRM primeiro (pedidoId = id interno)
  let codigoPedido = 0
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('omie_codigo')
    .eq('id', pedidoId)
    .maybeSingle()

  if (pedido?.omie_codigo) {
    // Encontrou no CRM — usar o omie_codigo armazenado
    codigoPedido = parseInt(pedido.omie_codigo, 10)
  } else {
    // Não encontrou no CRM (pedido veio direto do Omie) — tratar pedidoId como codigo_pedido Omie
    codigoPedido = pedidoId
  }

  if (!codigoPedido) {
    throw new Error(`Pedido ${pedidoId} não tem código Omie`)
  }

  // Consultar pedido completo para extrair dados logísticos
  const result = await omieCall<any>(
    '/produtos/pedido/',
    'ConsultarPedido',
    [{ codigo_pedido: codigoPedido }],
    { credentials: creds }
  )

  log.info({ codigoPedido, result }, 'Omie ConsultarPedido resposta')

  const cab = result?.cabecalho || {}
  const infoCad = result?.infoCadastro || {}
  const transporte = result?.transporte || {}

  // Log all available fields for debugging
  log.info({ cab, infoCad, transporte }, 'Omie pedido detalhes extraídos')

  // Try multiple possible field names that Omie might return
  const etapa = cab.etapa || infoCad.cEtapa || cab.codigo_etapa || ''
  const dataPrevisao = cab.data_previsao || cab.data_entrega || transporte.data_previsao_entrega || ''
  const codigoRastreio = transporte.codigo_rastreio || transporte.codigo_rastreamento || transporte.numero_rastreamento || ''
  const nf = infoCad.nNumeroNF ? String(infoCad.nNumeroNF) : (cab.numero_nf || infoCad.numero_nf || '')
  const dataFaturamento = infoCad.dDataFaturamento || infoCad.dDtFat || cab.data_faturamento || ''
  const statusDescricao = cab.descricao_etapa || infoCad.cDescEtapa || cab.etapa_descricao || ''

  return {
    etapa,
    dataPrevisao,
    codigoRastreio,
    nf,
    dataFaturamento,
    statusDescricao,
  }
}

// ============================================
// Listar pedidos enviados ao Omie com status
// ============================================

export interface PedidoAcompanhamento {
  pedidoId: number
  numero: string
  clienteNome: string
  clienteId: number        // CRM id (resolvido via omie_codigo ou CNPJ)
  clienteOmieId: number    // codigo_cliente do Omie
  cnpjCliente: string
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
  tipo?: 'venda' | 'bonificacao'
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
function mapPedidoOmie(p: any, vendedorMap?: Map<number, string>, crmClienteMap?: Map<number, number>): PedidoAcompanhamento {
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

  // Vendedor: resolver nome a partir do código usando o mapa de vendedores Omie
  const codVendedor = cab.codigo_vendedor || 0
  let vendedorNome = ''
  if (codVendedor && vendedorMap) {
    vendedorNome = vendedorMap.get(codVendedor) || `Vendedor ${codVendedor}`
  } else if (codVendedor) {
    vendedorNome = `Vendedor ${codVendedor}`
  }

  const omieClienteId = cab.codigo_cliente || 0
  const crmId = crmClienteMap ? (crmClienteMap.get(omieClienteId) || 0) : 0

  return {
    pedidoId: cab.codigo_pedido || 0,
    numero: cab.numero_pedido ? String(cab.numero_pedido) : String(cab.codigo_pedido || ''),
    clienteNome: cab.razao_social || cab.nome_fantasia || String(omieClienteId || ''),
    clienteId: crmId,
    clienteOmieId: omieClienteId,
    cnpjCliente: cab.cnpj_cpf || '',
    vendedorNome,
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

  // Buscar pedidos, vendedores e clientes CRM em paralelo
  const [pedidosOmie, vendedoresOmie, crmClientesRaw] = await Promise.all([
    fetchAllPedidosOmie(creds),
    fetchVendedoresOmie(creds).catch(err => {
      log.warn({ err: err?.message }, 'Não foi possível carregar vendedores Omie — nomes não serão resolvidos')
      return []
    }),
    supabase.from('clientes').select('id, omie_codigo, cnpj').then(r => r.data || []),
  ])

  if (pedidosOmie.length === 0) return []

  // Montar mapa codigo_vendedor → nome
  const vendedorMap = new Map<number, string>()
  for (const v of vendedoresOmie) {
    if (v.codigo && v.nome) vendedorMap.set(v.codigo, v.nome)
  }
  log.info({ vendedoresCount: vendedorMap.size }, 'Mapa de vendedores Omie carregado')

  // Montar mapa omie_codigo (codigo_cliente Omie) → CRM id
  const crmClienteMap = new Map<number, number>()
  for (const c of crmClientesRaw) {
    if (c.omie_codigo) crmClienteMap.set(parseInt(c.omie_codigo, 10), c.id)
  }
  log.info({ vinculados: crmClienteMap.size }, 'Clientes CRM vinculados ao Omie')

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

  const resultado = pedidosOmie.map(p => mapPedidoOmie(p, vendedorMap, crmClienteMap))

  // Ordenar mais recentes primeiro
  resultado.sort((a, b) => Number(b.omieCodigo) - Number(a.omieCodigo))

  return resultado
}

// Busca sob demanda: pesquisar pedidos por número ou cliente direto no Omie
export async function buscarPedidoOmie(termo: string): Promise<PedidoAcompanhamento[]> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  // Carregar vendedores para resolver nomes
  const vendedoresOmie = await fetchVendedoresOmie(creds).catch(() => [])
  const vendedorMap = new Map<number, string>()
  for (const v of vendedoresOmie) {
    if (v.codigo && v.nome) vendedorMap.set(v.codigo, v.nome)
  }

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
        return [mapPedidoOmie(result, vendedorMap)]
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
          return [mapPedidoOmie(result, vendedorMap)]
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

  const resultado = filtered.map(p => mapPedidoOmie(p, vendedorMap))
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

// ============================================
// Cancelar pedido no Omie
// ============================================

export async function cancelarPedidoOmie(pedidoId: number, motivo?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Buscar pedido no CRM
    const { data: pedido, error: pedidoErr } = await supabase
      .from('pedidos')
      .select('omie_codigo, numero')
      .eq('id', pedidoId)
      .single()

    if (pedidoErr || !pedido) {
      return { success: false, error: 'Pedido não encontrado no CRM' }
    }

    if (!pedido.omie_codigo) {
      return { success: false, error: 'Pedido não tem código Omie vinculado' }
    }

    const omieCodigoPedido = parseInt(pedido.omie_codigo, 10)
    log.info({ pedidoId, omieCodigo: omieCodigoPedido }, '🛑 Cancelando pedido no Omie...')

    // Chamar API do Omie para cancelar pedido
    // Método: CancelarPedidoVenda (documentação Omie)
    const creds = await getOmieCredentials()
    if (!creds) {
      return { success: false, error: 'Credenciais Omie não configuradas' }
    }

    const response = await omieCall<any>(
      '/produtos/pedidovenda/',
      'CancelarPedidoVenda',
      [{
        codigo_pedido: omieCodigoPedido,
        motivo_cancelamento: motivo || 'Cancelado pelo CRM',
      }],
      { credentials: creds }
    )

    log.info({ pedidoId, omieCodigo: omieCodigoPedido, response }, '✅ Pedido cancelado no Omie')

    return {
      success: true,
    }
  } catch (err: any) {
    log.error({ err, pedidoId }, '❌ Erro ao cancelar pedido no Omie')
    return {
      success: false,
      error: err.message || 'Erro desconhecido ao cancelar no Omie',
    }
  }
}

// ============================================
// Sincronizar omie_numero dos pedidos existentes
// ============================================

export interface SyncOmieNumeroResult {
  atualizados: number
  erros: { pedidoId: number; erro: string }[]
}

/**
 * Sincroniza o omie_numero de pedidos que têm omie_codigo mas não têm omie_numero.
 * Busca os pedidos no Omie e atualiza o número correto.
 */
export async function syncOmieNumeros(): Promise<SyncOmieNumeroResult> {
  const creds = await getOmieCredentials()
  if (!creds) {
    throw new Error('Credenciais Omie não configuradas')
  }

  // Buscar pedidos que têm omie_codigo mas não têm omie_numero
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, omie_codigo, numero')
    .not('omie_codigo', 'is', null)
    .or('omie_numero.is.null,omie_numero.eq.""')

  if (error) {
    throw new Error(`Erro ao buscar pedidos: ${error.message}`)
  }

  if (!pedidos || pedidos.length === 0) {
    return { atualizados: 0, erros: [] }
  }

  log.info({ total: pedidos.length }, 'Sincronizando omie_numero para pedidos')

  const erros: { pedidoId: number; erro: string }[] = []
  let atualizados = 0

  for (const pedido of pedidos) {
    try {
      // Consultar pedido no Omie para pegar o numero_pedido
      const result = await omieCall<any>(
        '/produtos/pedido/',
        'ConsultarPedido',
        [{ codigo_pedido: parseInt(pedido.omie_codigo, 10) }],
        { credentials: creds }
      )

      const cab = result?.cabecalho || {}
      const numeroPedido = cab.numero_pedido || cab.codigo_pedido

      if (numeroPedido) {
        // Atualizar o omie_numero no CRM
        const { error: updateError } = await supabase
          .from('pedidos')
          .update({ omie_numero: String(numeroPedido) })
          .eq('id', pedido.id)

        if (updateError) {
          erros.push({ pedidoId: pedido.id, erro: `Erro ao atualizar: ${updateError.message}` })
        } else {
          atualizados++
          log.info({ pedidoId: pedido.id, omieNumero: numeroPedido }, 'omie_numero atualizado')
        }
      } else {
        erros.push({ pedidoId: pedido.id, erro: 'numero_pedido não encontrado na resposta do Omie' })
      }
    } catch (err: any) {
      erros.push({ pedidoId: pedido.id, erro: err.message || 'Erro desconhecido' })
    }
  }

  log.info({ atualizados, erros: erros.length }, 'Sincronização de omie_numero concluída')
  return { atualizados, erros }
}
