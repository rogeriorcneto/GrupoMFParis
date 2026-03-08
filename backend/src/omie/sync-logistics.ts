import { omieCall, getOmieCredentials } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'

// ============================================
// Sync Omie Logistics → CRM (follow_up clients)
// Pulls: status logístico, código rastreio, NF, data faturamento
// ============================================

interface OmiePedidoEtapas {
  cCodigo?: string
  cDescricao?: string
  dDataPrevisao?: string
  cCodigoRastreio?: string
  cNumeroNF?: string
  dDataFaturamento?: string
  [key: string]: any
}

export interface SyncLogisticsResult {
  atualizados: number
  semPedido: number
  erros: { clienteId: number; erro: string }[]
}

/**
 * For all clients in follow_up stage that have an omie_codigo,
 * fetch the latest order status from Omie and update logistics fields.
 */
export async function syncOmieLogistics(): Promise<SyncLogisticsResult> {
  const creds = await getOmieCredentials()
  if (!creds) {
    log.warn('syncOmieLogistics: Credenciais Omie não configuradas, pulando')
    return { atualizados: 0, semPedido: 0, erros: [] }
  }

  // Fetch follow_up clients that have omie_codigo
  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, omie_codigo, razao_social, omie_status_logistico, omie_codigo_rastreio, omie_nota_fiscal, omie_data_faturamento, status_follow_up, etapa')
    .in('etapa', ['follow_up', 'cliente_ativo'])
    .not('omie_codigo', 'is', null)

  if (error) {
    log.error({ error }, 'syncOmieLogistics: Erro ao buscar clientes')
    return { atualizados: 0, semPedido: 0, erros: [{ clienteId: 0, erro: error.message }] }
  }

  if (!clientes || clientes.length === 0) {
    log.info('syncOmieLogistics: Nenhum cliente em follow_up/cliente_ativo com omie_codigo')
    return { atualizados: 0, semPedido: 0, erros: [] }
  }

  let atualizados = 0
  let semPedido = 0
  const erros: { clienteId: number; erro: string }[] = []

  for (const cliente of clientes) {
    try {
      // Search for the latest order for this client in Omie
      const pedidos = await omieCall<any>(
        '/produtos/pedido/',
        'ListarPedidos',
        [{
          pagina: 1,
          registros_por_pagina: 5,
          apenas_importado_api: 'N',
          filtrar_por_cliente: Number(cliente.omie_codigo),
          ordenar_por: 'CODIGO_PEDIDO_DESC',
        }],
        { credentials: creds }
      )

      const listaPedidos = pedidos?.pedido_venda_produto || []
      if (listaPedidos.length === 0) {
        semPedido++
        continue
      }

      // Get the most recent order
      const pedido = listaPedidos[0]
      const cab = pedido.cabecalho || {}
      const infoCad = pedido.infoCadastro || {}

      // Extract logistics data
      const statusLogistico = cab.etapa || infoCad.cEtapa || ''
      const codigoRastreio = pedido.transporte?.nao_gerar_cte === 'S' ? '' :
        (pedido.transporte?.codigo_rastreio || cab.codigo_rastreio || '')
      const notaFiscal = infoCad.nNumeroNF ? String(infoCad.nNumeroNF) : (cab.numero_nf || '')
      const dataFaturamento = infoCad.dDataFaturamento || infoCad.dDtFat || ''

      // Map Omie etapa to our follow_up sub-status
      let newStatusFollowUp = cliente.status_follow_up || 'pedido_aprovado'
      const etapaLower = statusLogistico.toLowerCase()
      if (etapaLower.includes('faturado') || etapaLower.includes('faturar')) {
        newStatusFollowUp = 'faturado'
      } else if (etapaLower.includes('separar') || etapaLower.includes('produção') || etapaLower.includes('producao')) {
        newStatusFollowUp = 'em_producao'
      } else if (etapaLower.includes('expedir') || etapaLower.includes('enviado') || etapaLower.includes('expedido')) {
        newStatusFollowUp = 'expedido'
      } else if (etapaLower.includes('entregue') || etapaLower.includes('finalizado')) {
        newStatusFollowUp = 'entregue'
      }

      // Check if anything changed
      const changed =
        (statusLogistico && statusLogistico !== cliente.omie_status_logistico) ||
        (codigoRastreio && codigoRastreio !== cliente.omie_codigo_rastreio) ||
        (notaFiscal && notaFiscal !== cliente.omie_nota_fiscal) ||
        (dataFaturamento && dataFaturamento !== cliente.omie_data_faturamento) ||
        (newStatusFollowUp !== cliente.status_follow_up)

      if (!changed) continue

      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (statusLogistico) updates.omie_status_logistico = statusLogistico
      if (codigoRastreio) updates.omie_codigo_rastreio = codigoRastreio
      if (notaFiscal) updates.omie_nota_fiscal = notaFiscal
      if (dataFaturamento) updates.omie_data_faturamento = dataFaturamento
      if (newStatusFollowUp !== cliente.status_follow_up) updates.status_follow_up = newStatusFollowUp

      const { error: updateErr } = await supabase
        .from('clientes')
        .update(updates)
        .eq('id', cliente.id)

      if (updateErr) throw new Error(updateErr.message)
      atualizados++

      log.info({ clienteId: cliente.id, razaoSocial: cliente.razao_social, status: statusLogistico, nf: notaFiscal },
        'syncOmieLogistics: Cliente atualizado')
    } catch (err: any) {
      erros.push({ clienteId: cliente.id, erro: err.message })
      log.error({ err, clienteId: cliente.id }, 'syncOmieLogistics: Erro ao processar cliente')
    }
  }

  log.info({ atualizados, semPedido, erros: erros.length, total: clientes.length },
    'syncOmieLogistics: Sync concluído')
  return { atualizados, semPedido, erros }
}
