/**
 * Multi-empresa Omie helpers
 * Suporta múltiplas contas Omie (uma por empresa do grupo) para listar pedidos
 * e atualizar código de rastreio mesmo em pedidos faturados.
 *
 * Credenciais podem ser configuradas via env vars (recomendado para produção):
 *   OMIE_EMPRESA_<KEY>_NAME / KEY / SECRET
 * Ou usando o array DEFAULT_EMPRESAS abaixo.
 */
import { omieCall, OmieCredentials } from './client.js'

export interface Empresa {
  id: string
  nome: string
  appKey: string
  appSecret: string
}

// Defaults — sobrescrever via env se necessário
const DEFAULT_EMPRESAS: Empresa[] = [
  { id: 'profi',   nome: 'PROFI COMERCIO DE ALIMENTOS LTDA', appKey: '6625695374298', appSecret: '588e34aa9429edcae86f5e87c47a65df' },
  { id: 'dms',     nome: 'DMS ALIMENTOS',                    appKey: '1340821992510', appSecret: 'dac287f9b3ec422dc93da6cdbcc3e0b2' },
  { id: 'mfparis', nome: 'MFPARIS INDÚSTRIA DE ALIMENTOS',   appKey: '952260381072',  appSecret: '8300b385eeec583c71439709ab866fc7' },
]

export function getEmpresas(): Empresa[] {
  // Permite override por env: OMIE_EMPRESAS_JSON='[{"id":"x","nome":"Y","appKey":"...","appSecret":"..."}]'
  const envJson = process.env.OMIE_EMPRESAS_JSON
  if (envJson) {
    try {
      const arr = JSON.parse(envJson)
      if (Array.isArray(arr) && arr.length > 0) return arr
    } catch (err) {
      console.error('OMIE_EMPRESAS_JSON inválido, usando defaults:', err)
    }
  }
  return DEFAULT_EMPRESAS
}

export function getEmpresaById(id: string): Empresa | null {
  return getEmpresas().find(e => e.id === id) || null
}

function toCreds(emp: Empresa): OmieCredentials {
  return { appKey: emp.appKey, appSecret: emp.appSecret }
}

export interface ListarPedidosFiltro {
  pagina?: number
  registros_por_pagina?: number
  filtrar_por_data_de?: string  // dd/MM/yyyy
  filtrar_por_data_ate?: string
  filtrar_por_etapa?: string
  filtrar_por_numero_of?: string  // número da NF
  filtrar_apenas_inclusao?: 'S' | 'N'
  apenas_importado_api?: 'S' | 'N'
}

/**
 * Lista pedidos de venda de uma empresa Omie específica.
 * Retorna o array `pedido_venda_produto` com cabecalho, det (itens), info_cadastro, frete, total_pedido.
 */
export async function listarPedidosEmpresa(
  empresaId: string,
  filtro: ListarPedidosFiltro = {}
): Promise<any[]> {
  const empresa = getEmpresaById(empresaId)
  if (!empresa) throw new Error(`Empresa não encontrada: ${empresaId}`)

  const param = {
    pagina: filtro.pagina ?? 1,
    registros_por_pagina: filtro.registros_por_pagina ?? 50,
    apenas_importado_api: filtro.apenas_importado_api ?? 'N',
    ...(filtro.filtrar_por_data_de ? { filtrar_por_data_de: filtro.filtrar_por_data_de } : {}),
    ...(filtro.filtrar_por_data_ate ? { filtrar_por_data_ate: filtro.filtrar_por_data_ate } : {}),
    ...(filtro.filtrar_por_etapa ? { filtrar_por_etapa: filtro.filtrar_por_etapa } : {}),
    ...(filtro.filtrar_por_numero_of ? { filtrar_por_numero_of: filtro.filtrar_por_numero_of } : {}),
    ...(filtro.filtrar_apenas_inclusao ? { filtrar_apenas_inclusao: filtro.filtrar_apenas_inclusao } : {}),
  }

  const data = await omieCall<any>(
    '/produtos/pedido/',
    'ListarPedidos',
    [param],
    { credentials: toCreds(empresa), skipCache: true }
  )

  return data?.pedido_venda_produto || []
}

/**
 * Busca pedido pela número da NF (filtrar_por_numero_of).
 * Retorna o número do pedido encontrado, ou null.
 */
export async function buscarPedidoPorNF(
  empresaId: string,
  notaFiscal: string
): Promise<number | null> {
  const pedidos = await listarPedidosEmpresa(empresaId, {
    filtrar_por_numero_of: notaFiscal,
    registros_por_pagina: 5,
  })
  if (!pedidos.length) return null
  return pedidos[0]?.cabecalho?.numero_pedido || null
}

/**
 * Atualiza o código de rastreio de um pedido.
 * Tenta AlterarPedidoVendaProduto; se bloqueado por faturamento, usa AlterarPedidoVendaProdutoFaturado.
 */
export async function atualizarRastreioPedido(
  empresaId: string,
  numeroPedido: number,
  codigoRastreio: string
): Promise<{ success: boolean; metodo: string; data?: any }> {
  const empresa = getEmpresaById(empresaId)
  if (!empresa) throw new Error(`Empresa não encontrada: ${empresaId}`)

  const creds = toCreds(empresa)
  const param = [{
    cabecalho: {
      numero_pedido: numeroPedido,
      codigo_rastreio: codigoRastreio,
    },
    frete: {
      codigo_rastreio: codigoRastreio,
    },
  }]

  // 1ª tentativa: pedido normal
  try {
    const data = await omieCall<any>(
      '/produtos/pedido/',
      'AlterarPedidoVendaProduto',
      param,
      { credentials: creds, skipCache: true }
    )
    return { success: true, metodo: 'AlterarPedidoVendaProduto', data }
  } catch (err: any) {
    const msg = (err.message || '').toLowerCase()
    if (msg.includes('faturado')) {
      // 2ª tentativa: endpoint para faturados
      const data = await omieCall<any>(
        '/produtos/pedido/',
        'AlterarPedidoVendaProdutoFaturado',
        param,
        { credentials: creds, skipCache: true }
      )
      return { success: true, metodo: 'AlterarPedidoVendaProdutoFaturado', data }
    }
    throw err
  }
}

/**
 * Atualiza rastreio buscando pelo número da NF (replica o fluxo do Apps Script).
 */
export async function lancarRastreioPorNF(
  empresaId: string,
  notaFiscal: string,
  codigoRastreio: string
): Promise<{ success: boolean; numero_pedido: number; metodo: string }> {
  const numeroPedido = await buscarPedidoPorNF(empresaId, notaFiscal)
  if (!numeroPedido) throw new Error(`NF não encontrada: ${notaFiscal}`)
  const result = await atualizarRastreioPedido(empresaId, numeroPedido, codigoRastreio)
  return { success: result.success, numero_pedido: numeroPedido, metodo: result.metodo }
}
