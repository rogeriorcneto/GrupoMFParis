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
      // Uses numeric codes first (confirmed: 10=enviado, 20/30=producao, 40/50/60=faturado, 70=expedido, 80=entregue)
      let newStatusFollowUp = cliente.status_follow_up || 'pedido_aprovado'
      const etapaTrimmed = String(statusLogistico).trim()
      const etapaLower = etapaTrimmed.toLowerCase()

      // Numeric etapa codes from Omie (most reliable)
      if (etapaTrimmed === '20' || etapaTrimmed === '30') {
        newStatusFollowUp = 'em_producao'
      } else if (etapaTrimmed === '40' || etapaTrimmed === '50' || etapaTrimmed === '60') {
        newStatusFollowUp = 'faturado'
      } else if (etapaTrimmed === '70') {
        newStatusFollowUp = 'expedido'
      } else if (etapaTrimmed === '80') {
        newStatusFollowUp = 'entregue'
      } else if (etapaTrimmed === '00' || etapaTrimmed === '90' || etapaTrimmed === '99') {
        // Cancelado — don't change follow-up status
      } else if (etapaTrimmed === '10') {
        newStatusFollowUp = 'pedido_aprovado'
      }
      // Text-based fallback (if Omie sends descriptive strings)
      else if (etapaLower.includes('faturad') || etapaLower.includes('faturar')) {
        newStatusFollowUp = 'faturado'
      } else if (etapaLower.includes('separ') || etapaLower.includes('produ')) {
        newStatusFollowUp = 'em_producao'
      } else if (etapaLower.includes('exped') || etapaLower.includes('trânsito') || etapaLower.includes('transit') || etapaLower.includes('coletado')) {
        newStatusFollowUp = 'expedido'
      } else if (etapaLower.includes('entreg') || etapaLower.includes('finaliz') || etapaLower.includes('encerr')) {
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

      const nowIso = new Date().toISOString()
      const updates: Record<string, any> = { updated_at: nowIso, ultima_interacao: nowIso.split('T')[0] }
      if (statusLogistico) updates.omie_status_logistico = statusLogistico
      if (codigoRastreio) updates.omie_codigo_rastreio = codigoRastreio
      if (notaFiscal) updates.omie_nota_fiscal = notaFiscal
      if (dataFaturamento) updates.omie_data_faturamento = dataFaturamento
      const statusChanged = newStatusFollowUp !== cliente.status_follow_up
      if (statusChanged) updates.status_follow_up = newStatusFollowUp

      const { error: updateErr } = await supabase
        .from('clientes')
        .update(updates)
        .eq('id', cliente.id)

      if (updateErr) throw new Error(updateErr.message)
      atualizados++

      // Insert notification + activity when follow_up sub-status changes
      if (statusChanged) {
        const statusLabels: Record<string, string> = {
          'faturado': 'Faturado',
          'em_producao': 'Em Produção',
          'expedido': 'Expedido/Coletado',
          'entregue': 'Entregue',
        }
        const label = statusLabels[newStatusFollowUp] || newStatusFollowUp
        const isEntregue = newStatusFollowUp === 'entregue'

        // Insert notification
        try {
          await supabase.from('notificacoes').insert({
            tipo: isEntregue ? 'success' : 'info',
            titulo: isEntregue ? '📦 Pedido Entregue!' : `📦 Status Omie: ${label}`,
            mensagem: `${cliente.razao_social}: status atualizado para ${label}${notaFiscal ? ` (NF: ${notaFiscal})` : ''}`,
            cliente_id: cliente.id,
            lida: false,
            created_at: nowIso,
          })
        } catch { /* non-critical */ }

        // Insert activity
        try {
          await supabase.from('atividades').insert({
            tipo: 'moveu',
            descricao: `[Omie] ${cliente.razao_social}: ${label}${notaFiscal ? ` — NF ${notaFiscal}` : ''}`,
            vendedor_nome: 'Sistema/Omie',
            timestamp: nowIso,
          })
        } catch { /* non-critical */ }

        // If entregue, create follow-up task
        if (isEntregue) {
          try {
            await supabase.from('tarefas').insert({
              titulo: `Coletar satisfação: ${cliente.razao_social}`,
              descricao: `Pedido entregue — coletar feedback de satisfação do cliente.`,
              cliente_id: cliente.id,
              tipo: 'follow_up',
              prioridade: 'alta',
              status: 'pendente',
              data_vencimento: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
              created_at: nowIso,
            })
          } catch { /* non-critical */ }
        }
      }

      log.info({ clienteId: cliente.id, razaoSocial: cliente.razao_social, status: statusLogistico, nf: notaFiscal, followUpStatus: newStatusFollowUp },
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
