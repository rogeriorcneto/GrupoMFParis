import { omieCall, getOmieCredentials, getOmieEmpresas } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'

// ============================================
// Sync Omie Logistics → CRM (orientado a PEDIDOS)
// Cada pedido do CRM tem codigo_pedido_integracao = 'CRM-PED-{id}' ou
// 'CRM-AMT-{id}' (bonificação) e guarda omie_codigo/omie_numero.
// Para cada pedido vinculado ao Omie, consulta o pedido EXATO e atualiza:
//   - pedidos.omie_status / status
//   - clientes.status_follow_up (pedido de venda) ou status_amostra (bonificação)
//   - omie_status_logistico, rastreio, NF, faturamento, previsão de entrega
// Roda para TODAS as empresas Omie configuradas (multi-empresa).
// ============================================

export interface SyncLogisticsResult {
  atualizados: number
  semPedidoOmie: number
  naoEncontrados: number
  erros: { pedidoId: number; erro: string }[]
}

/** Mapeia etapa Omie → sub-status do card */
function mapEtapaFollowUp(etapa: string): string | null {
  const e = etapa.trim()
  const l = e.toLowerCase()
  if (e === '20' || e === '30') return 'em_producao'
  if (e === '40' || e === '50' || e === '60') return 'faturado'
  if (e === '70') return 'expedido'
  if (e === '80') return 'entregue'
  if (e === '10') return 'pedido_aprovado'
  if (l.includes('faturad') || l.includes('faturar')) return 'faturado'
  if (l.includes('separ') || l.includes('produ')) return 'em_producao'
  if (l.includes('exped') || l.includes('trânsito') || l.includes('transit') || l.includes('coletado')) return 'expedido'
  if (l.includes('entreg') || l.includes('finaliz') || l.includes('encerr')) return 'entregue'
  return null
}

function mapEtapaAmostra(etapa: string): string | null {
  const f = mapEtapaFollowUp(etapa)
  if (f === 'em_producao') return 'liberada'
  if (f === 'pedido_aprovado') return 'liberada'
  return f // faturado / expedido / entregue valem igual em amostra
}

const CANCELADO = (e: string) => ['00', '90', '99'].includes(e.trim())

/** Omie devolve datas em DD/MM/YYYY — colunas date/timestamp exigem ISO */
function brToIso(d?: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d || '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export async function syncOmieLogistics(): Promise<SyncLogisticsResult> {
  // Multi-empresa: todas as credenciais ativas; fallback para credencial única
  const empresas = await getOmieEmpresas()
  const credList = empresas.length > 0
    ? empresas
    : [await getOmieCredentials()].filter(Boolean) as { appKey: string; appSecret: string }[]

  if (credList.length === 0) {
    log.warn('syncOmieLogistics: Credenciais Omie não configuradas, pulando')
    return { atualizados: 0, semPedidoOmie: 0, naoEncontrados: 0, erros: [] }
  }

  // Pedidos do CRM vinculados ao Omie e ainda não finalizados
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, numero, cliente_id, tipo, status, omie_codigo, omie_numero, omie_status')
    .not('omie_codigo', 'is', null)
    .not('status', 'in', '("cancelado")')
    .not('omie_status', 'in', '("entregue","cancelado","nao_encontrado")')

  if (error) {
    log.error({ error }, 'syncOmieLogistics: Erro ao buscar pedidos')
    return { atualizados: 0, semPedidoOmie: 0, naoEncontrados: 0, erros: [{ pedidoId: 0, erro: error.message }] }
  }
  if (!pedidos || pedidos.length === 0) {
    return { atualizados: 0, semPedidoOmie: 0, naoEncontrados: 0, erros: [] }
  }

  let atualizados = 0
  let naoEncontrados = 0
  const erros: { pedidoId: number; erro: string }[] = []

  for (const pedido of pedidos) {
    try {
      // Consulta o pedido EXATO em cada empresa até encontrar
      let omiePedido: any = null
      let soNaoCadastrado = true
      for (const creds of credList) {
        try {
          const r = await omieCall<any>(
            '/produtos/pedido/',
            'ConsultarPedido',
            [{ codigo_pedido: Number(pedido.omie_codigo) }],
            { credentials: creds, skipCache: true }
          )
          const p = r?.pedido_venda_produto || r
          if (p?.cabecalho?.codigo_pedido) { omiePedido = p; break }
        } catch (e: any) {
          if (!/n[ãa]o cadastrado|n[ãa]o encontrado|not found/i.test(e?.message || '')) {
            soNaoCadastrado = false
          }
        }
      }

      if (!omiePedido) {
        if (soNaoCadastrado) {
          // Pedido realmente não existe no Omie — tira da fila (Omie bloqueia após erros seguidos)
          naoEncontrados++
          await supabase.from('pedidos').update({ omie_status: 'nao_encontrado' }).eq('id', pedido.id)
          log.warn({ pedidoId: pedido.id, omie: pedido.omie_codigo }, 'syncOmieLogistics: pedido não existe no Omie — marcado nao_encontrado')
        } else {
          erros.push({ pedidoId: pedido.id, erro: 'Falha transitória ao consultar Omie — tentará no próximo ciclo' })
        }
        continue
      }

      const cab = omiePedido.cabecalho || {}
      const info = omiePedido.infoCadastro || {}
      const tr = omiePedido.transporte || {}
      const etapa = String(cab.etapa || info.cEtapa || '').trim()
      const rastreio = tr.codigo_rastreio || cab.codigo_rastreio || ''
      const nf = info.nNumeroNF ? String(info.nNumeroNF) : (cab.numero_nf || '')
      const dataFat = brToIso(info.dDataFaturamento || info.dDtFat || '')
      const dataPrev = brToIso(cab.data_previsao || '')
      const cancelado = CANCELADO(etapa)

      // Status textual do pedido no CRM
      const followUpStatus = mapEtapaFollowUp(etapa)
      const amostraStatus = mapEtapaAmostra(etapa)
      const omieStatusLabel = cancelado ? 'cancelado' : (followUpStatus || pedido.omie_status || 'enviado')

      // 1) Atualizar o pedido no CRM
      const pedUpdates: Record<string, any> = {}
      if (omieStatusLabel !== pedido.omie_status) pedUpdates.omie_status = omieStatusLabel
      if (cancelado && pedido.status !== 'cancelado') pedUpdates.status = 'cancelado'
      if (Object.keys(pedUpdates).length > 0) {
        const { error: e1 } = await supabase.from('pedidos').update(pedUpdates).eq('id', pedido.id)
        if (e1) throw new Error(`pedido: ${e1.message}`)
      }

      // 2) Atualizar o card do cliente vinculado ao pedido
      if (pedido.cliente_id) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('id, etapa, status_follow_up, status_amostra, omie_status_logistico, omie_codigo_rastreio, omie_nota_fiscal, omie_data_faturamento, vendedor_id')
          .eq('id', pedido.cliente_id)
          .maybeSingle()

        if (cli) {
          const isAmostra = pedido.tipo === 'bonificacao' && cli.etapa === 'amostra'
          const novoStatus = cancelado
            ? (isAmostra ? null : cli.status_follow_up) // cancelado não move status manual — só marca omie_status
            : (isAmostra ? amostraStatus : followUpStatus)

          const cliUpdates: Record<string, any> = {}
          if (etapa && etapa !== cli.omie_status_logistico) cliUpdates.omie_status_logistico = etapa
          if (rastreio && rastreio !== cli.omie_codigo_rastreio) cliUpdates.omie_codigo_rastreio = rastreio
          if (nf && nf !== cli.omie_nota_fiscal) cliUpdates.omie_nota_fiscal = nf
          if (dataFat && dataFat !== cli.omie_data_faturamento) cliUpdates.omie_data_faturamento = dataFat
          if (dataPrev) cliUpdates.data_entrega_prevista = dataPrev
          if (novoStatus && novoStatus !== (isAmostra ? cli.status_amostra : cli.status_follow_up)) {
            if (isAmostra) cliUpdates.status_amostra = novoStatus
            else cliUpdates.status_follow_up = novoStatus
          }

          if (Object.keys(cliUpdates).length > 0) {
            const { error: e2 } = await supabase.from('clientes').update(cliUpdates).eq('id', cli.id)
            if (e2) throw new Error(`cliente: ${e2.message}`)

            // Notificação + tarefa de satisfação ao entregar
            const labelField = isAmostra ? 'status_amostra' : 'status_follow_up'
            if (cliUpdates[labelField]) {
              const { data: cliFull } = await supabase.from('clientes').select('razao_social').eq('id', cli.id).single()
              const label = novoStatus === 'entregue' ? 'Entregue' : novoStatus === 'expedido' ? 'Expedido' : novoStatus === 'faturado' ? 'Faturado' : novoStatus
              try {
                await supabase.from('notificacoes').insert({
                  tipo: novoStatus === 'entregue' ? 'success' : 'info',
                  titulo: `📦 ${isAmostra ? 'Amostra' : 'Pedido'} ${label}`,
                  mensagem: `${cliFull?.razao_social || 'Cliente'}: ${label}${nf ? ` (NF ${nf})` : ''} — status real do Omie.`,
                  cliente_id: cli.id, vendedor_id: cli.vendedor_id || null,
                  lida: false, created_at: new Date().toISOString(),
                })
              } catch { /* non-critical */ }
              if (novoStatus === 'entregue' && !isAmostra) {
                try {
                  const { data: existente } = await supabase
                    .from('tarefas')
                    .select('id')
                    .eq('cliente_id', cli.id)
                    .ilike('titulo', 'Coletar satisfação:%')
                    .in('status', ['pendente', 'em_andamento'])
                    .limit(1)
                  if (!existente || existente.length === 0) {
                    await supabase.from('tarefas').insert({
                      titulo: `Coletar satisfação: ${cliFull?.razao_social || 'cliente'}`,
                      descricao: 'Pedido entregue — coletar feedback de satisfação do cliente.',
                      cliente_id: cli.id, vendedor_id: cli.vendedor_id || null,
                      tipo: 'follow_up', prioridade: 'alta', status: 'pendente',
                      data: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
                    })
                  }
                } catch { /* non-critical */ }
              }
            }
          }
        }
      }

      atualizados++
      log.info({ pedidoId: pedido.id, omie: pedido.omie_codigo, etapa, nf, rastreio }, 'syncOmieLogistics: pedido sincronizado')
    } catch (err: any) {
      erros.push({ pedidoId: pedido.id, erro: err.message })
      log.error({ err, pedidoId: pedido.id }, 'syncOmieLogistics: erro ao processar pedido')
    }
  }

  log.info({ atualizados, naoEncontrados, erros: erros.length, total: pedidos.length }, 'syncOmieLogistics: concluído')
  return { atualizados, semPedidoOmie: 0, naoEncontrados, erros }
}
