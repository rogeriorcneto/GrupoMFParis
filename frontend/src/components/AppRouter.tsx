import React from 'react'
import type {
  ViewType, Cliente, Interacao, Vendedor, Tarefa,
  Notificacao, Atividade, Template, Produto, DashboardMetrics,
  TemplateMsg, Cadencia, Campanha, JobAutomacao, Pedido
} from '../types'
import {
  DashboardView, DashboardVendedorView, AprovacaoView, FunilView, ClientesView, TarefasView,
  ProspeccaoView, AutomacoesView, MapaView, SocialSearchView,
  IntegracoesView, VendedoresView, RelatoriosView, TemplatesView, ProtocolosView, SacView, TabelaPrecosView, ParametrosView,
  ProdutosView, AssistenteIAView, IAContextoView, CriarAutomacaoView, OmieView, TrafegoPagoView, BaseLeadsView, LicitacoesView, TreinamentoView,
  ConfiguracaoTarefasView, ConfiguracaoMensagensView,
  MissaoView
} from './views'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { existeCardAtivoNoFunil } from '../utils/funil-logic'
import { registrarTarefaExcluida } from '../utils/exportacaoAuditoria'
import { getParametrosAprovacao, pedidoPassaAutoAprovacao } from './views/AprovacaoView'
import { aprovarPedidoComOmie, cancelarPedidoOmie, enviarPedidoOmie, checkCnpjsGlobais } from '../lib/botApi'
import { buildProximaTarefa, clienteJaTemOutraTarefaAberta, ehTarefaIncluirProdutos, exigeJustificativaPrazoLongo, validarFinalizacaoTarefa } from '../utils/tarefaFluxo'
import { temJustificativaAtiva } from '../utils/cadastroCompleto'
import { familiaDoClienteNoFunil } from '../utils/situacaoCompra'
import { loadParametrosListas } from '../lib/parametrosListas'

interface AppRouterProps {
  activeView: ViewType
  loggedUser: Vendedor | null
  // Data
  clientes: Cliente[]
  interacoes: Interacao[]
  vendedores: Vendedor[]
  tarefas: Tarefa[]
  atividades: Atividade[]
  templates: Template[]
  templatesMsgs: TemplateMsg[]
  cadencias: Cadencia[]
  campanhas: Campanha[]
  jobs: JobAutomacao[]
  produtos: Produto[]
  pedidos: Pedido[]
  dashboardMetrics: DashboardMetrics
  // Setters
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  setInteracoes: React.Dispatch<React.SetStateAction<Interacao[]>>
  setVendedores: React.Dispatch<React.SetStateAction<Vendedor[]>>
  setTarefas: React.Dispatch<React.SetStateAction<Tarefa[]>>
  setTemplates: React.Dispatch<React.SetStateAction<Template[]>>
  setTemplatesMsgs: React.Dispatch<React.SetStateAction<TemplateMsg[]>>
  setCampanhas: React.Dispatch<React.SetStateAction<Campanha[]>>
  setProdutos: React.Dispatch<React.SetStateAction<Produto[]>>
  setPedidos: React.Dispatch<React.SetStateAction<Pedido[]>>
  // Actions
  showToast: (tipo: 'success' | 'error', texto: string) => void
  openModal: () => void
  openModalComDados?: (dados: Partial<{ razaoSocial: string; cnpj: string; enderecoCidade: string; enderecoEstado: string }>) => void
  handleEditCliente: (c: Cliente) => void
  handleDragStart: (e: React.DragEvent, cliente: Cliente, fromStage: string) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, toStage: string) => void
  requestStageMove: (cliente: Cliente, fromStage: string, toStage: string) => void
  handleQuickAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
  setSelectedClientePanel: (c: Cliente | null) => void
  moverCliente: (clienteId: number, toStage: string, extras?: Partial<Cliente>) => Promise<boolean | undefined>
  criarNovoCiclo: (cliente: Cliente, extras?: Partial<Cliente>, etapa?: string) => Promise<Cliente>
  startCampanha: (id: number) => void
  runJobNow: (id: number) => void
  addNotificacao: (tipo: 'info' | 'warning' | 'error' | 'success', titulo: string, mensagem: string, clienteId?: number) => void
  onNovoCiclo?: (cliente: Cliente) => void
  onVerNoFunil?: (cliente: Cliente) => void
  onNavigate?: (view: ViewType) => void
  highlightTarefaId?: number
  onColetarSatisfacao: (cliente: Cliente) => Promise<void>
}

export function shouldMoveToFollowUpOnApproval(pedido: Pedido, cliente?: Cliente): boolean {
  const isBonificacaoComercial = Boolean(pedido.numero?.toUpperCase().startsWith('BON-'))
  const isAmostraFlow = (pedido.tipo === 'bonificacao' && !isBonificacaoComercial) || cliente?.etapa === 'amostra' || cliente?.etapa === 'amostra_perdida'
  if (isAmostraFlow) return false
  if (!cliente) return false
  // Move to follow_up from negociacao when a venda/BON pedido is approved (e abre novo ciclo em Proposta)
  if (cliente.etapa === 'negociacao') return true
  return false
}

export default function AppRouter({
  activeView, loggedUser,
  clientes, interacoes, vendedores, tarefas, atividades, templates,
  templatesMsgs, cadencias, campanhas, jobs, produtos, pedidos, dashboardMetrics,
  setClientes, setInteracoes, setVendedores, setTarefas, setTemplates,
  setTemplatesMsgs, setCampanhas, setProdutos, setPedidos,
  showToast, openModal, openModalComDados, handleEditCliente,
  handleDragStart, handleDragOver, handleDrop, requestStageMove, handleQuickAction,
  setSelectedClientePanel, moverCliente, criarNovoCiclo, startCampanha, runJobNow, addNotificacao, onNovoCiclo, onVerNoFunil, onNavigate, highlightTarefaId, onColetarSatisfacao
}: AppRouterProps) {
  // Refresh data callback for AI agent actions
  const refreshData = async () => {
    try {
      const [c, t, p] = await Promise.all([
        db.fetchClientes(), db.fetchTarefas(), db.fetchPedidos(),
      ])
      setClientes(c)
      setTarefas(t)
      setPedidos(p)
    } catch { /* non-critical */ }
  }

  switch (activeView) {
    case 'dashboard':
      return <DashboardVendedorView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} pedidos={pedidos} loggedUser={loggedUser} onNavigate={onNavigate} />
    case 'aprovacao':
      return <AprovacaoView
        pedidos={pedidos}
        clientes={clientes}
        vendedores={vendedores}
        loggedUser={loggedUser || { id: 0, nome: 'Sistema', email: '', cargo: 'gerente', ativo: true, metaVendas: 0, metaLeads: 0, metaConversao: 0 } as Vendedor}
        showToast={showToast}
        onClickCliente={(c) => setSelectedClientePanel(c)}
        onVerNoFunil={onVerNoFunil}
        onAprovar={async (pedido, tabela) => {
          try {
            const result = await aprovarPedidoComOmie(pedido.id, tabela)
            const omieUpdate: Partial<Pedido> = {
              status: 'confirmado' as const,
              dataAprovacao: new Date().toISOString(),
              aprovadoPor: loggedUser?.id,
              tabelaPreco: tabela,
            }
            if (result.omie?.pending) {
              addNotificacao('success', 'Pedido aprovado ✅', `Pedido ${pedido.numero} aprovado! Enviando ao Omie em background...`, pedido.clienteId)
            } else if (result.omie?.success) {
              omieUpdate.omieCodigo = String(result.omie.omie_codigo || '')
              omieUpdate.omieErro = undefined
              omieUpdate.dataEnvioOmie = new Date().toISOString()
              addNotificacao('success', 'Pedido aprovado + Omie ✅', `Pedido ${pedido.numero} aprovado e enviado ao Omie com sucesso! (Cód: ${result.omie.omie_codigo})`, pedido.clienteId)
            } else {
              // Omie rejeitou → NÃO confirmar: mantém 'enviado' (pendente) com o erro
              // registrado para reenvio, senão o pedido some no histórico.
              omieUpdate.status = 'enviado' as any
              omieUpdate.dataAprovacao = undefined
              omieUpdate.aprovadoPor = undefined
              omieUpdate.omieErro = result.omie?.error || 'Erro desconhecido ao enviar para o Omie'
              addNotificacao('warning', 'Omie rejeitou o pedido ⚠️', `Pedido ${pedido.numero} NÃO foi aprovado — o Omie rejeitou: ${result.omie?.error || 'erro desconhecido'}. Corrija e aprove novamente.`, pedido.clienteId)
            }
            const omieFalhou = !result.omie?.pending && !result.omie?.success
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, ...omieUpdate } : p))
            if (omieFalhou) {
              // Reverter no banco também (aprovarPedidoComOmie já gravou 'confirmado')
              try { await db.updatePedidoStatus(pedido.id, 'enviado') } catch (e) { logger.error('Erro ao reverter status do pedido:', e) }
              return
            }
            // Auto-move client to follow_up only for clear sales orders
            const cliAprov = clientes.find(c => c.id === pedido.clienteId)
            const isBonificacaoComercial = Boolean(pedido.numero?.toUpperCase().startsWith('BON-'))
            const isAmostraFlow = (pedido.tipo === 'bonificacao' && !isBonificacaoComercial) || cliAprov?.etapa === 'amostra' || cliAprov?.etapa === 'amostra_perdida'
            if (isAmostraFlow && cliAprov && cliAprov.statusAmostra !== 'liberada') {
              setClientes(prev => prev.map(c => c.id === pedido.clienteId ? { ...c, statusAmostra: 'liberada' } : c))
              try { await db.updateCliente(pedido.clienteId, { statusAmostra: 'liberada' }) } catch { /* non-critical */ }
            }
            // Se cliente já está em follow_up aguardando aprovação, atualizar para pedido aprovado
            if (cliAprov?.etapa === 'follow_up' && cliAprov?.statusFollowUp === 'aguardando_aprovacao_gerente') {
              try { 
                await db.updateCliente(pedido.clienteId, { statusFollowUp: 'pedido_aprovado' })
                setClientes(prev => prev.map(c => c.id === pedido.clienteId ? { ...c, statusFollowUp: 'pedido_aprovado' } : c))
              } catch { /* non-critical */ }
            }
            if (shouldMoveToFollowUpOnApproval(pedido, cliAprov)) {
              try { 
                const movido = await moverCliente(pedido.clienteId, 'follow_up', { statusFollowUp: 'pedido_aprovado' })
                if (!movido) return
              } catch (err) { 
                logger.error('Erro ao mover cliente para follow_up:', err)
              }
              // Criar card clone em negociacao para o próximo ciclo

            }
          } catch (err) { logger.error('Erro ao aprovar pedido:', err); throw err }
        }}
        onRecusar={async (pedido, motivo) => {
          try {
            // Cancelar no Omie primeiro (se tiver omie_codigo)
            if (pedido.omieCodigo) {
              try {
                const cancelResult = await cancelarPedidoOmie(pedido.id, motivo)
                if (cancelResult.success) {
                  addNotificacao('success', 'Pedido cancelado no Omie', `Pedido ${pedido.numero} cancelado no Omie com sucesso.`, pedido.clienteId)
                } else {
                  addNotificacao('warning', 'Pedido recusado — Omie com erro', `Pedido ${pedido.numero} recusado, mas Omie retornou erro: ${cancelResult.error || 'erro desconhecido'}`, pedido.clienteId)
                }
              } catch (omieErr) {
                logger.error('Erro ao cancelar pedido no Omie:', omieErr)
                addNotificacao('warning', 'Pedido recusado — Omie não cancelado', `Pedido ${pedido.numero} recusado no CRM, mas não foi possível cancelar no Omie.`, pedido.clienteId)
              }
            }
            await db.recusarPedido(pedido.id, motivo)
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: 'cancelado', motivoRecusa: motivo } : p))
            addNotificacao('info', 'Pedido recusado', `Pedido ${pedido.numero} recusado. Motivo: ${motivo}`, pedido.clienteId)
            // Registrar o motivo da recusa no Histórico do cliente (Parte 1 Item 3)
            try {
              const savedInter = await db.insertInteracao({
                clienteId: pedido.clienteId,
                tipo: 'nota',
                data: new Date().toISOString(),
                assunto: `Pedido ${pedido.numero} recusado na aprovação`,
                descricao: `Pedido ${pedido.numero} recusado pelo gerente (${loggedUser?.nome || 'Gerência'}).\nMotivo da recusa: ${motivo}`,
                automatico: true,
              })
              setInteracoes(prev => [savedInter, ...prev])
            } catch { /* non-critical */ }
            // Se for pedido de amostra real (não BON comercial), mover cliente para amostra_perdida
            if (pedido.tipo === 'bonificacao' && !pedido.numero?.toUpperCase().startsWith('BON-')) {
              const cli = clientes.find(c => c.id === pedido.clienteId)
              if (cli && cli.etapa !== 'amostra_perdida' && cli.etapa !== 'perdido') {
                try {
                  moverCliente(pedido.clienteId, 'amostra_perdida', {
                    resultadoAmostra: 'reprovada',
                    dataResultadoAmostra: new Date().toISOString().split('T')[0],
                    motivoReprovacao: motivo,
                  })
                } catch { /* non-critical */ }
              }
            } else {
              // Parte 1 Item 3: Pedido de venda/BON recusado mantém o card em Negociação,
              // limpando statusFollowUp para liberar edição e reenvio do próprio pedido.
              const cliV = clientes.find(c => c.id === pedido.clienteId)
              if (cliV && (cliV.statusFollowUp === 'aguardando_aprovacao_gerente' || cliV.etapa === 'follow_up')) {
                const deveVoltarNegociacao = cliV.etapa === 'follow_up' && !pedidos.some(px => px.id !== pedido.id && px.clienteId === cliV.id && px.status === 'confirmado')
                try {
                  if (deveVoltarNegociacao) {
                    await db.updateCliente(pedido.clienteId, { etapa: 'negociacao', statusFollowUp: null as any })
                    setClientes(prev => prev.map(c => c.id === pedido.clienteId ? { ...c, etapa: 'negociacao', statusFollowUp: undefined } : c))
                  } else {
                    await db.updateCliente(pedido.clienteId, { statusFollowUp: null as any })
                    setClientes(prev => prev.map(c => c.id === pedido.clienteId ? { ...c, statusFollowUp: undefined } : c))
                  }
                } catch { /* non-critical */ }
              }
            }
          } catch (err) { logger.error('Erro ao recusar pedido:', err); throw err }
        }}
        onConfirmarCancelamento={async (pedido) => {
          try {
            // Cancelar no Omie primeiro (se tiver omie_codigo)
            if (pedido.omieCodigo) {
              try {
                const cancelResult = await cancelarPedidoOmie(pedido.id, 'Cancelamento confirmado')
                if (cancelResult.success) {
                  addNotificacao('success', 'Pedido cancelado no Omie', `Pedido ${pedido.numero} cancelado no Omie com sucesso.`, pedido.clienteId)
                } else {
                  addNotificacao('warning', 'Cancelamento confirmado — Omie com erro', `Cancelamento confirmado, mas Omie retornou erro: ${cancelResult.error || 'erro desconhecido'}`, pedido.clienteId)
                }
              } catch (omieErr) {
                logger.error('Erro ao cancelar pedido no Omie:', omieErr)
                addNotificacao('warning', 'Cancelamento confirmado — Omie não cancelado', `Cancelamento confirmado no CRM, mas não foi possível cancelar no Omie.`, pedido.clienteId)
              }
            }
            await db.confirmarCancelamentoPedido(pedido.id)
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: 'cancelado' } : p))
            addNotificacao('info', 'Pedido cancelado', `Pedido ${pedido.numero} cancelado pelo gerente.`, pedido.clienteId)
            const cli = clientes.find(c => c.id === pedido.clienteId)
            if (cli) {
              try {
                const now = new Date().toISOString()
                const today = now.split('T')[0]
                if (pedido.tipo === 'bonificacao') {
                  // Amostra não aprovada → amostra_perdida (permitir 2ª tentativa)
                  if (cli.etapa !== 'amostra_perdida') {
                    await db.moverClienteAtomico(
                      pedido.clienteId, 'amostra_perdida', cli.etapa, now,
                      { resultadoAmostra: 'reprovada', dataResultadoAmostra: today, motivoReprovacao: `Pedido ${pedido.numero} cancelado` }
                    )
                    setClientes(prev => prev.map(c => c.id === pedido.clienteId
                      ? { ...c, etapa: 'amostra_perdida', etapaAnterior: c.etapa, resultadoAmostra: 'reprovada', dataResultadoAmostra: today, motivoReprovacao: `Pedido ${pedido.numero} cancelado` }
                      : c
                    ))
                  }
                } else {
                  // Venda cancelada → perdido + novo ciclo em Proposta
                  if (cli.etapa !== 'perdido') {
                    await moverCliente(pedido.clienteId, 'perdido', {
                      motivoPerda: `Pedido ${pedido.numero} cancelado`, categoriaPerda: 'outro', dataPerda: today,
                    })
                  } else if (!existeCardAtivoNoFunil(clientes, cli)) {
                    await criarNovoCiclo(cli, {}, 'proposta')
                  }
                }
              } catch (moveErr) {
                logger.error('Erro ao processar cancelamento no funil:', moveErr)
              }
            }
          } catch (err) { logger.error('Erro ao confirmar cancelamento:', err); throw err }
        }}
        onRejeitarCancelamento={async (pedido) => {
          try {
            await db.rejeitarCancelamentoPedido(pedido.id)
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: 'confirmado', motivoRecusa: undefined } : p))
            addNotificacao('info', 'Cancelamento rejeitado', `Pedido ${pedido.numero} mantido. Cancelamento rejeitado pelo gerente.`, pedido.clienteId)
          } catch (err) { logger.error('Erro ao rejeitar cancelamento:', err); throw err }
        }}
        onReenviarOmie={async (pedido) => {
          const result = await enviarPedidoOmie(pedido.id)
          if (result.success) {
            const omieCodigo = String(result.omie?.codigo_pedido || result.omie?.omie_codigo || '')
            const omieNumero = String(result.omie?.numero_pedido || result.omie?.omie_numero || '')
            setPedidos(prev => prev.map(p => p.id === pedido.id
              ? { ...p, omieCodigo: omieCodigo || undefined, omieNumero: omieNumero || undefined, omieStatus: 'enviado', omieErro: undefined, dataEnvioOmie: new Date().toISOString() }
              : p
            ))
            addNotificacao('success', 'Omie ✅', `Pedido ${pedido.numero} enviado ao Omie com sucesso!`, pedido.clienteId)
          } else {
            setPedidos(prev => prev.map(p => p.id === pedido.id
              ? { ...p, omieErro: result.error || 'Erro ao reenviar para o Omie' }
              : p
            ))
            throw new Error(result.error || 'Omie rejeitou o pedido')
          }
        }}
        onAprovarCancelamentoAmostra={async (cliente) => {
          // O RPC mover_cliente_atomico usa COALESCE nos extras — nem undefined nem null
          // limpam status_amostra. Move para prospecção e depois limpa via update direto.
          await moverCliente(cliente.id, 'prospecção')
          await db.updateCliente(cliente.id, {
            statusAmostra: null as any,
            dataEnvioAmostra: null as any,
            resultadoAmostra: null as any,
            dataResultadoAmostra: null as any,
          })
          setClientes(prev => prev.map(c => c.id === cliente.id
            ? { ...c, statusAmostra: undefined, dataEnvioAmostra: undefined, resultadoAmostra: undefined, dataResultadoAmostra: undefined }
            : c
          ))
        }}
      />
    case 'trafico':
      return <TrafegoPagoView loggedUser={loggedUser} />
    case 'licitacoes':
      return <LicitacoesView
        clientes={clientes}
        vendedores={vendedores}
        loggedUser={loggedUser}
        onNovoCliente={(dados) => {
          if (openModalComDados) {
            openModalComDados({
              razaoSocial: dados.razaoSocial,
              cnpj: dados.cnpj,
              enderecoCidade: dados.enderecoCidade,
              enderecoEstado: dados.enderecoEstado,
            })
          } else {
            openModal()
          }
        }}
      />
    case 'funil':
      return <FunilView 
        clientes={clientes}
        vendedores={vendedores}
        interacoes={interacoes}
        pedidos={pedidos}
        loggedUser={loggedUser}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMoveCliente={requestStageMove}
        onQuickAction={handleQuickAction}
        onClickCliente={(c) => setSelectedClientePanel(c)}
        isGerente={loggedUser?.cargo === 'gerente'}
        moverCliente={moverCliente}
        onNovoCiclo={onNovoCiclo}
        onColetarSatisfacao={onColetarSatisfacao}
        onImportNegocios={async (updates, novos) => {
          try {
            // Item 4: respeitar 1 único card em Proposta/Negociação por empresa também na importação
            const updatesSeguros = updates.filter(u => {
              const etapaNova = u.changes?.etapa
              if (etapaNova && ['proposta', 'negociacao'].includes(etapaNova)) {
                const cli = clientes.find(c => c.id === u.clienteId)
                if (cli && existeCardAtivoNoFunil(clientes, cli, ['proposta', 'negociacao'])) return false
              }
              return true
            })
            if (updatesSeguros.length > 0) {
              const mapped = updatesSeguros.map(u => ({ id: u.clienteId, changes: u.changes }))
              await db.updateClientesBatch(mapped)
              setClientes(prev => {
                const updMap = new Map(mapped.map(u => [u.id, u.changes]))
                return prev.map(c => {
                  const ch = updMap.get(c.id)
                  return ch ? { ...c, ...ch } : c
                })
              })
            }
            const novosSeguros = novos.filter(n => {
              if (['proposta', 'negociacao'].includes(n.etapa)) {
                if (existeCardAtivoNoFunil(clientes, { ...n, id: -1 } as Cliente, ['proposta', 'negociacao'])) return false
              }
              return true
            })
            if (novosSeguros.length > 0) {
              const comVendedor = novosSeguros.map(c => ({ ...c, vendedorId: c.vendedorId || loggedUser?.id }))
              const { saved: savedNovos } = await db.insertClientesBatch(comVendedor as Omit<Cliente, 'id'>[])
              setClientes(prev => [...prev, ...savedNovos])
              if (savedNovos.length > 0) {
                const tarefasNovos = await db.criarTarefasAutomaticasNovosClientes(savedNovos, [...clientes, ...savedNovos]).catch(() => [])
                if (tarefasNovos.length > 0) setTarefas(prev => [...tarefasNovos, ...prev])
              }
            }
            showToast('success', `Funil atualizado: ${updatesSeguros.length} atualizados, ${novosSeguros.length} novos`)
          } catch (err) {
            logger.error('Erro ao importar negócios:', err)
            showToast('error', 'Erro ao importar negócios. Verifique o CSV.')
          }
        }}
      />
    case 'clientes':
      return <ClientesView 
        clientes={clientes} 
        vendedores={vendedores}
        loggedUser={loggedUser}
        tarefas={tarefas}
        pedidos={pedidos}
        interacoes={interacoes}
        onNewCliente={openModal}
        onEditCliente={handleEditCliente}
        onClickCliente={(c) => setSelectedClientePanel(c)}
        onUpdateCliente={async (id, changes) => {
          try {
            await db.updateCliente(id, changes)
            setClientes(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c))
          } catch (err) { logger.error('Erro ao atualizar cliente:', err); showToast('error', 'Erro ao atualizar cliente.') }
        }}
        onImportClientes={async (novos) => {
          try {
            const vendedorId = loggedUser?.id
            const comVendedor = novos.map(c => ({ ...c, vendedorId: c.vendedorId || vendedorId }))

            // Dedup: separar novos vs existentes (por CNPJ ou razão social)
            const realmente_novos: Omit<Cliente, 'id'>[] = []
            let atualizados = 0

            // Dedup DENTRO do próprio arquivo: evita inserir o mesmo CNPJ/razão 2x
            // numa única importação (o índice único do banco pode não estar ativo).
            const cnpjsEnfileirados = new Set<string>()
            const razoesEnfileiradas = new Set<string>()

            // Checagem global de CNPJ: o dedup local só vê os clientes DO PRÓPRIO
            // vendedor (RLS). Sem isso, vendedor importaria CNPJ de outro vendedor
            // criando duplicata invisível. O backend responde sem vazar dados.
            const cnpjAlheios = new Set<string>()
            if (loggedUser?.cargo !== 'gerente') {
              try {
                const cnpjsNovos = comVendedor.map(c => (c.cnpj || '').replace(/\D/g, '')).filter(d => d.length >= 11)
                const global = await checkCnpjsGlobais(cnpjsNovos)
                for (const g of global) if (g.exists && g.outroVendedor) cnpjAlheios.add(g.cnpj)
              } catch (err) { logger.error('Erro na checagem global de CNPJ na importação:', err) }
            }
            let bloqueadosOutroVendedor = 0

            for (const novoCliente of comVendedor) {
              const cnpjNorm = (novoCliente.cnpj || '').replace(/[^\d]/g, '')

              // CNPJ pertence a cliente de outro vendedor → bloqueia
              if (cnpjNorm && cnpjAlheios.has(cnpjNorm)) { bloqueadosOutroVendedor++; continue }
              const razaoNorm = (novoCliente.razaoSocial || '').toLowerCase().trim()

              // Pular se já enfileirado nesta mesma importação
              if (cnpjNorm && cnpjsEnfileirados.has(cnpjNorm)) continue
              if (!cnpjNorm && razaoNorm && razoesEnfileiradas.has(razaoNorm)) continue

              // Buscar duplicata por CNPJ
              let existente: Cliente | null = null
              if (novoCliente.cnpj && novoCliente.cnpj.trim()) {
                existente = await db.checkCnpjDuplicado(novoCliente.cnpj)
              }
              // Se não achou por CNPJ, buscar por razão social exata
              if (!existente && novoCliente.razaoSocial) {
                const match = clientes.find(c =>
                  c.razaoSocial.toLowerCase().trim() === razaoNorm
                )
                if (match) existente = match
              }

              const ETAPAS_PROPOSTA_OU_POSTERIOR = ['proposta', 'negociacao', 'follow_up']
              if (existente) {
                if (ETAPAS_PROPOSTA_OU_POSTERIOR.includes(existente.etapa)) {
                  // Cliente em Proposta ou posterior: permitir duplicata (novo lead em amostra)
                  realmente_novos.push(novoCliente as Omit<Cliente, 'id'>)
                  if (cnpjNorm) cnpjsEnfileirados.add(cnpjNorm)
                  else if (razaoNorm) razoesEnfileiradas.add(razaoNorm)
                } else {
                  // Cliente já existe em etapa anterior → atualizar vendedorId
                  await db.updateCliente(existente.id, { vendedorId: vendedorId })
                  setClientes(prev => prev.map(c => c.id === existente!.id ? { ...c, vendedorId } : c))
                  atualizados++
                }
              } else {
                realmente_novos.push(novoCliente as Omit<Cliente, 'id'>)
                if (cnpjNorm) cnpjsEnfileirados.add(cnpjNorm)
                else if (razaoNorm) razoesEnfileiradas.add(razaoNorm)
              }
            }

            // Inserir apenas os realmente novos
            let novosInseridos = 0
            let falhas: { razaoSocial: string; cnpj?: string; erro: string }[] = []
            if (realmente_novos.length > 0) {
              const result = await db.insertClientesBatch(realmente_novos)
              setClientes(prev => [...prev, ...result.saved])
              novosInseridos = result.saved.length
              falhas = result.falhas
              if (result.saved.length > 0) {
                const empresasRealmenteNovas = result.saved.filter(novo =>
                  !clientes.some(ex => !ex.arquivadoDuplicata && familiaDoClienteNoFunil(novo, [ex]).length > 0)
                )
                if (empresasRealmenteNovas.length > 0) {
                  const tarefasNovas = await db.criarTarefasAutomaticasNovosClientes(empresasRealmenteNovas, [...clientes, ...result.saved]).catch(() => [])
                  if (tarefasNovas.length > 0) setTarefas(prev => [...tarefasNovas, ...prev])
                }
              }
            }

            const msgs: string[] = []
            if (novosInseridos > 0) msgs.push(`${novosInseridos} novo(s)`)
            if (atualizados > 0) msgs.push(`${atualizados} atualizado(s) para você`)
            if (bloqueadosOutroVendedor > 0) msgs.push(`${bloqueadosOutroVendedor} ignorado(s) — CNPJ de outro vendedor`)
            if (falhas.length > 0) {
              showToast('error', `${falhas.length} falharam. Ex: ${falhas[0].razaoSocial} — ${falhas[0].erro}`)
            } else {
              showToast('success', `Importação concluída: ${msgs.join(', ')}`)
            }
            return { inserted: novosInseridos, updated: atualizados, errors: falhas.map(f => `${f.razaoSocial}: ${f.erro}`) }
          } catch (err: any) {
            logger.error('Erro ao importar:', err)
            showToast('error', `Erro ao importar: ${err?.message || 'verifique o CSV'}`)
            return { inserted: 0, updated: 0, errors: [err?.message || 'Erro desconhecido'] }
          }
        }}
        onDeleteCliente={async (id) => {
          try {
            await db.deleteCliente(id)
            setClientes(prev => prev.filter(c => c.id !== id))
            setInteracoes(prev => prev.filter(i => i.clienteId !== id))
            setTarefas(prev => prev.filter(t => t.clienteId !== id))
            showToast('success', 'Cliente excluído com sucesso')
          } catch (err) { logger.error('Erro ao deletar cliente:', err); showToast('error', 'Erro ao excluir cliente. Tente novamente.') }
        }}
        onDeleteAll={async () => {
          try {
            await db.deleteAllClientes()
            setClientes([])
            setInteracoes([])
            setTarefas(prev => prev.filter(t => !t.clienteId))
            showToast('success', 'Todos os clientes foram apagados com sucesso!')
          } catch (err) { logger.error('Erro ao apagar todos:', err); showToast('error', 'Erro ao apagar clientes. Tente novamente.'); throw err }
        }}
      />
    case 'automacoes':
      return <AutomacoesView clientes={clientes} vendedores={vendedores} templates={templatesMsgs} loggedUser={loggedUser} showToast={showToast} onAction={handleQuickAction} />
    case 'mapa':
      return <MapaView clientes={clientes} vendedores={vendedores} tarefas={tarefas} pedidos={pedidos} loggedUser={loggedUser} showToast={showToast} />
    case 'prospeccao':
      return (
        <ProspeccaoView
          clientes={clientes}
          interacoes={interacoes}
          templates={templatesMsgs}
          cadencias={cadencias}
          campanhas={campanhas}
          jobs={jobs}
          onQuickAction={handleQuickAction}
          onStartCampanha={startCampanha}
          onRunJobNow={runJobNow}
          onCreateTemplate={async (t: TemplateMsg) => {
            try {
              const saved = await db.insertTemplateMsg(t)
              setTemplatesMsgs(prev => [saved, ...prev])
            } catch (err) { logger.error('Erro ao criar template msg:', err) }
          }}
          onCreateCampanha={async (c: Campanha) => {
            try {
              const saved = await db.insertCampanha(c)
              setCampanhas(prev => [saved, ...prev])
            } catch (err) { logger.error('Erro ao criar campanha:', err) }
          }}
        />
      )
    case 'tarefas':
      return <TarefasView tarefas={tarefas} clientes={clientes} vendedores={vendedores} loggedUser={loggedUser} interacoes={interacoes} pedidos={pedidos} produtos={produtos} showToast={showToast} onVerNoFunil={onVerNoFunil}
        onOpenClientePanel={setSelectedClientePanel}
        highlightTarefaId={highlightTarefaId}
        onDeleteTarefa={async (t) => {
          try {
            const cliT = t.clienteId ? clientes.find(c => c.id === t.clienteId) : undefined
            await registrarTarefaExcluida(t, loggedUser?.nome || 'Gerente', cliT?.etapa)
            await db.deleteTarefa(t.id)
            setTarefas(prev => prev.filter(x => x.id !== t.id))
            showToast('success', 'Tarefa excluída com sucesso!')
          } catch (err) { logger.error('Erro ao excluir tarefa:', err); showToast('error', 'Erro ao excluir tarefa') }
        }}
        onUpdateTarefa={async (t) => {
          try {
            // Detectar se a tarefa está sendo marcada como concluída agora
            const tarefaAnterior = tarefas.find(x => x.id === t.id)
            const foiConcluidaAgora = tarefaAnterior?.status !== 'concluida' && t.status === 'concluida'
            if (foiConcluidaAgora && t.titulo.startsWith('Coletar satisfação — ') && !t.conclusao?.trim()) {
              showToast('error', 'Informe a satisfação coletada no resultado da tarefa antes de concluir.')
              return
            }
            
            // Finalização disciplinada: exige próximo passo apenas se o cliente
            // ainda não tiver outra tarefa aberta (hoje ou futura).
            let tarefaParaSalvar: Tarefa = t
            let proximaTarefaCriada: Tarefa | null = null
            if (foiConcluidaAgora) {
              if (!t.finalizacao) {
                showToast('error', 'Para finalizar, informe canal usado e conclusão.')
                return
              }
              const clienteDaTarefa = t.clienteId ? clientes.find(c => c.id === t.clienteId) : undefined
              const outraAberta = clienteJaTemOutraTarefaAberta(t, tarefas, clientes)
              const parametros = await loadParametrosListas().catch(() => null)
              const exigeProdutos = !!clienteDaTarefa
                && ehTarefaIncluirProdutos(t, parametros?.tarefasPadraoCadastro?.incluirProdutos)
                && !temJustificativaAtiva(clienteDaTarefa, 'produtos_interesse', clientes)

              const erroValidacao = validarFinalizacaoTarefa(t.finalizacao, new Date(), {
                exigeProximoPasso: !outraAberta,
                exigeProdutosInteresse: exigeProdutos,
              })
              if (erroValidacao) {
                showToast('error', erroValidacao)
                return
              }

              if (t.finalizacao.produtosInteresseRegistro && clienteDaTarefa) {
                const { produtosInteresse, produtosQuantidadesMensais } = t.finalizacao.produtosInteresseRegistro
                const familia = familiaDoClienteNoFunil(clienteDaTarefa, clientes)
                const idsAlvo = familia.length > 0 ? familia.map(f => f.id) : [clienteDaTarefa.id]
                await Promise.all(idsAlvo.map(id => db.updateCliente(id, { produtosInteresse, produtosQuantidadesMensais })))
                const idSet = new Set(idsAlvo)
                setClientes(prev => prev.map(c => idSet.has(c.id) ? { ...c, produtosInteresse, produtosQuantidadesMensais } : c))
              }

              const existente = tarefaAnterior?.proximaTarefaId ? tarefas.find(x => x.id === tarefaAnterior.proximaTarefaId) : undefined
              if (existente) {
                proximaTarefaCriada = existente
                tarefaParaSalvar = { ...t, proximaTarefaId: existente.id }
              } else if (t.finalizacao.proximoPasso) {
                const novaTarefa = buildProximaTarefa(t, t.finalizacao, clienteDaTarefa, loggedUser?.nome || 'Vendedor')
                proximaTarefaCriada = await db.insertTarefa(novaTarefa)
                const justLongo = exigeJustificativaPrazoLongo(t.finalizacao.proximoPasso.data)
                  ? t.finalizacao.proximoPasso.justificativaPrazoLongo
                  : undefined
                tarefaParaSalvar = { ...t, proximaTarefaId: proximaTarefaCriada.id, justificativaPrazoLongo: justLongo }
              } else if (outraAberta) {
                tarefaParaSalvar = { ...t, proximaTarefaId: outraAberta.id, justificativaPrazoLongo: t.justificativaPrazoLongo }
              }
            }

            // O campo finalizacao é transitório de UI e não vai para o banco.
            const { finalizacao: _finalizacaoTransitoria, ...tarefaPersistida } = tarefaParaSalvar

            try {
              await db.updateTarefa(t.id, tarefaPersistida as Tarefa)
            } catch (updErr) {
              // Rollback atômico: se falhar concluir a tarefa atual, desfaz o próximo passo recém-criado
              if (proximaTarefaCriada && !tarefaAnterior?.proximaTarefaId) {
                await db.deleteTarefa(proximaTarefaCriada.id).catch(() => {})
              }
              throw updErr
            }

            setTarefas(prev => {
              const atualizadas = prev.map(x => x.id === t.id ? { ...tarefaPersistida, id: t.id } as Tarefa : x)
              return proximaTarefaCriada && !atualizadas.some(x => x.id === proximaTarefaCriada!.id)
                ? [proximaTarefaCriada, ...atualizadas]
                : atualizadas
            })
            if (foiConcluidaAgora && t.clienteId && t.titulo.startsWith('Coletar satisfação — ')) {
              const cliAlvo = clientes.find(c => c.id === t.clienteId)
              const targetId = cliAlvo?.arquivadoDuplicata ? cliAlvo.cardPrincipalId : t.clienteId
              const targetCli = targetId ? clientes.find(c => c.id === targetId && !c.arquivadoDuplicata) : undefined
              if (targetCli) {
                const hoje = new Date().toISOString().split('T')[0]
                const feedback = t.conclusao || t.descricao || ''
                if (targetCli.etapa === 'follow_up') {
                  // Regra oficial Rodada 3.1: após a coleta de satisfação, o card permanece em Follow-up com status Finalizado (oculto)
                  await moverCliente(targetCli.id, 'follow_up', {
                    ultimaInteracao: hoje,
                    feedbackSatisfacao: feedback,
                    statusSatisfacao: 'satisfeito',
                    statusFollowUp: 'concluido',
                  })
                } else {
                  const atualizacao = { ultimaInteracao: hoje, feedbackSatisfacao: feedback }
                  await db.updateCliente(targetCli.id, atualizacao)
                  setClientes(prev => prev.map(c => c.id === targetCli.id ? { ...c, ...atualizacao } : c))
                }
              }
            }
            
            // Disparar regras de automação ao concluir tarefa
            if (foiConcluidaAgora && t.clienteId) {
              try {
                const cliente = clientes.find(c => c.id === t.clienteId)
                if (cliente) {
                  const novasTarefas = await db.processarRegrasTarefaConcluida(
                    t,
                    cliente.etapa,
                    cliente.razaoSocial || 'Cliente',
                    t.vendedorId || cliente.vendedorId || loggedUser?.id || 0,
                    tarefas
                  )
                  if (novasTarefas.length > 0) {
                    setTarefas(prev => [...novasTarefas, ...prev])
                    showToast('success', `${novasTarefas.length} tarefa(s) automática(s) criada(s)`)
                  }
                }
              } catch (err) {
                logger.error('Erro ao processar regras tarefa concluída:', err)
              }
            }
          } catch (err: any) {
            const anterior = tarefas.find(x => x.id === t.id)
            if (anterior) setTarefas(prev => prev.map(x => x.id === t.id ? anterior : x))
            logger.error('Erro ao atualizar tarefa:', err)
            showToast('error', `Erro ao salvar tarefa: ${err?.message || err?.code || 'desconhecido'}`)
          }
        }}
        onAddTarefa={async (t) => {
          try {
            const saved = await db.insertTarefa({ ...t, objetivo: t.objetivo || 'relacionamento', origem: t.origem || 'manual', criadoPor: t.criadoPor || loggedUser?.nome || 'Vendedor' })
            setTarefas(prev => prev.some(existing => existing.id === saved.id) ? prev : [saved, ...prev])
          } catch (err) { logger.error('Erro ao criar tarefa:', err) }
        }}
        onImportTarefas={async (novas) => {
          try {
            const saved = await db.insertTarefasBatch(novas)
            setTarefas(prev => [...saved, ...prev])
            showToast('success', `${saved.length} tarefa(s) importada(s) com sucesso!`)
            return saved
          } catch (err) {
            logger.error('Erro ao importar tarefas:', err)
            showToast('error', 'Erro ao importar tarefas. Verifique o CSV.')
            throw err
          }
        }}
      />
    case 'social':
      return <SocialSearchView onAddLead={async (nome, telefone, endereco) => {
        try {
          const saved = await db.insertCliente({
            razaoSocial: nome, cnpj: '', contatoNome: '', contatoTelefone: telefone, contatoEmail: '', endereco, etapa: 'prospecção', ultimaInteracao: new Date().toISOString().split('T')[0], diasInativo: 0, score: 20, vendedorId: loggedUser?.id
          } as Omit<Cliente, 'id'>)
          setClientes(prev => [...prev, saved])
          const tarefasNovas = await db.criarTarefasAutomaticasNovoCliente(saved, [...clientes, saved]).catch(() => [])
          if (tarefasNovas.length > 0) setTarefas(prev => [...tarefasNovas, ...prev])
        } catch (err) { logger.error('Erro ao add lead social:', err) }
      }} />
    case 'integracoes':
      return <IntegracoesView />
    case 'equipe':
      return <VendedoresView vendedores={vendedores} clientes={clientes} loggedUser={loggedUser}
        onAddVendedor={async (email, senha, vendedorData) => {
          try {
            const saved = await db.createVendedorViaBackend(email, senha, vendedorData)
            setVendedores(prev => [...prev, saved])
            addNotificacao('success', 'Vendedor cadastrado', `${vendedorData.nome} já pode fazer login com ${email}`)
            showToast('success', `Vendedor "${vendedorData.nome}" cadastrado com sucesso!`)
          } catch (err: any) {
            logger.error('Erro ao adicionar vendedor:', err)
            showToast('error', err?.message || 'Erro ao cadastrar vendedor')
            throw err
          }
        }}
        onUpdateVendedor={async (v) => {
          try {
            await db.updateVendedor(v.id, v)
            setVendedores(prev => prev.map(x => x.id === v.id ? v : x))
          } catch (err) { logger.error('Erro ao atualizar vendedor:', err) }
        }}
      />
    case 'relatorios':
      return <RelatoriosView clientes={clientes} vendedores={vendedores} interacoes={interacoes} produtos={produtos} pedidos={pedidos} tarefas={tarefas} atividades={atividades} />
    case 'protocolos':
      return <ProtocolosView loggedUser={loggedUser} showToast={showToast} />
    case 'sac':
      return <SacView loggedUser={loggedUser} showToast={showToast} />
    case 'tabela-precos':
      return <TabelaPrecosView loggedUser={loggedUser} showToast={showToast} />
    case 'parametros':
      return loggedUser ? <ParametrosView loggedUser={loggedUser} showToast={showToast} /> : null
    case 'templates':
      return <TemplatesView templates={templates}
        onAdd={async (t) => {
          try {
            const saved = await db.insertTemplate(t)
            setTemplates(prev => [...prev, saved])
          } catch (err) { logger.error('Erro ao criar template:', err) }
        }}
        onDelete={async (id) => {
          try {
            await db.deleteTemplate(id)
            setTemplates(prev => prev.filter(t => t.id !== id))
          } catch (err) { logger.error('Erro ao deletar template:', err) }
        }}
      />
    case 'produtos':
      return <ProdutosView produtos={produtos}
        onAdd={async (p) => {
          try {
            const saved = await db.insertProduto(p)
            setProdutos(prev => [...prev, saved])
            showToast('success', `Produto "${p.nome}" cadastrado!`)
          } catch (err) { logger.error('Erro ao adicionar produto:', err); showToast('error', 'Erro ao salvar produto. Tente novamente.') }
        }}
        onUpdate={async (p) => {
          try {
            const updated = await db.updateProduto(p.id, p)
            if (updated) {
              setProdutos(prev => prev.map(x => x.id === p.id ? updated : x))
            } else {
              setProdutos(prev => prev.map(x => x.id === p.id ? p : x))
            }
            showToast('success', `Produto "${p.nome}" atualizado!`)
          } catch (err: any) { logger.error('Erro ao atualizar produto:', err); showToast('error', `Erro ao salvar produto${err?.message ? ': ' + err.message : ''}`) }
        }}
        onDelete={async (id) => {
          try {
            await db.deleteProduto(id)
            setProdutos(prev => prev.filter(p => p.id !== id))
            showToast('success', 'Produto excluído!')
          } catch (err: any) { logger.error('Erro ao deletar produto:', err); showToast('error', `Erro ao excluir produto${err?.message ? ': ' + err.message : ''}`) }
        }}
        isGerente={loggedUser?.cargo === 'gerente'}
        canEditPrice={loggedUser?.cargo === 'vendedor'}
        showToast={showToast}
        onRefresh={async () => { try { const p = await db.fetchProdutos(); setProdutos(p) } catch {} }}
      />
    case 'baseleads':
      return <BaseLeadsView
        loggedUser={loggedUser}
        clientes={clientes}
        setClientes={setClientes}
        showToast={showToast}
      />
    case 'treinamento':
      return <TreinamentoView
        vendedor={loggedUser || { id: 0, nome: 'Vendedor', email: '', cargo: 'vendedor', ativo: true, metaVendas: 0, metaLeads: 0, metaConversao: 0 } as any}
        isGerente={loggedUser?.cargo === 'gerente'}
        produtos={produtos}
      />
    case 'configuracao-tarefas':
      return <ConfiguracaoTarefasView loggedUser={loggedUser} />
    case 'configuracao-mensagens':
      return <ConfiguracaoMensagensView loggedUser={loggedUser} />
    case 'omie':
      // Renderizado abaixo como componente persistente
      return null
    case 'ia':
      return <AssistenteIAView
        clientes={clientes}
        pedidos={pedidos}
        vendedores={vendedores}
        interacoes={interacoes}
        produtos={produtos}
        tarefas={tarefas}
        loggedUser={loggedUser}
        onRefreshData={refreshData}
        showToast={showToast}
      />
    case 'ia-contexto':
      return <IAContextoView loggedUser={loggedUser} />
    case 'criar-automacao':
      return <CriarAutomacaoView loggedUser={loggedUser} />
    case 'missao':
      return <MissaoView clientes={clientes} vendedores={vendedores} loggedUser={loggedUser} showToast={showToast} />
    default:
      return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} pedidos={pedidos} loggedUser={loggedUser} />
  }
}

/** Wrapper que mantém OmieView sempre montado após primeira visita (evita reload ao trocar de aba) */
export function PersistentViews({ activeView, pedidos, clientes, vendedores, loggedUser }: {
  activeView: string
  pedidos: Pedido[]
  clientes: Cliente[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
}) {
  const [omieVisited, setOmieVisited] = React.useState(false)

  React.useEffect(() => {
    if (activeView === 'omie') setOmieVisited(true)
  }, [activeView])

  if (!omieVisited) return null

  return (
    <div style={{ display: activeView === 'omie' ? 'block' : 'none' }} className="h-full">
      <OmieView pedidos={pedidos} clientes={clientes} vendedores={vendedores} loggedUser={loggedUser} />
    </div>
  )
}
