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

  // Se já tem código Omie vinculado, retornar
  if (produto.omie_codigo) {
    return parseInt(produto.omie_codigo, 10)
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
      return codigoOmie
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
