import React from 'react'
import type {
  ViewType, Cliente, Interacao, Vendedor, Tarefa,
  Notificacao, Atividade, Template, Produto, DashboardMetrics,
  TemplateMsg, Cadencia, Campanha, JobAutomacao, Pedido
} from '../types'
import {
  DashboardView, AprovacaoView, FunilView, ClientesView, TarefasView,
  ProspeccaoView, AutomacoesView, MapaView, SocialSearchView,
  IntegracoesView, VendedoresView, RelatoriosView, TemplatesView,
  ProdutosView, PedidosView, AssistenteIAView, IAContextoView, CriarAutomacaoView, OmieView, TrafegoPagoView, BaseLeadsView, LicitacoesView, TreinamentoView,
  ConfiguracaoTarefasView, ConfiguracaoMensagensView
} from './views'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { getParametrosAprovacao, pedidoPassaAutoAprovacao } from './views/AprovacaoView'
import { aprovarPedidoComOmie, cancelarPedidoOmie, enviarPedidoOmie } from '../lib/botApi'

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
  handleQuickAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
  setSelectedClientePanel: (c: Cliente | null) => void
  moverCliente: (clienteId: number, toStage: string, extras?: Partial<Cliente>) => void
  startCampanha: (id: number) => void
  runJobNow: (id: number) => void
  addNotificacao: (tipo: 'info' | 'warning' | 'error' | 'success', titulo: string, mensagem: string, clienteId?: number) => void
  onNovoCiclo?: (cliente: Cliente) => void
  onVerNoFunil?: (cliente: Cliente) => void
}

export function shouldMoveToFollowUpOnApproval(pedido: Pedido, cliente?: Cliente): boolean {
  const isAmostraFlow = pedido.tipo === 'bonificacao' || cliente?.etapa === 'amostra' || cliente?.etapa === 'amostra_perdida'
  if (isAmostraFlow) return false
  if (!cliente) return false
  // Move to follow_up from negociacao when a venda pedido is approved
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
  handleDragStart, handleDragOver, handleDrop, handleQuickAction,
  setSelectedClientePanel, moverCliente, startCampanha, runJobNow, addNotificacao, onNovoCiclo, onVerNoFunil
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
      return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} pedidos={pedidos} loggedUser={loggedUser} />
    case 'aprovacao':
      return <AprovacaoView
        pedidos={pedidos}
        clientes={clientes}
        vendedores={vendedores}
        loggedUser={loggedUser || { id: 0, nome: 'Sistema', email: '', cargo: 'gerente', ativo: true, metaVendas: 0, metaLeads: 0, metaConversao: 0 } as Vendedor}
        showToast={showToast}
        onAprovar={async (pedido) => {
          try {
            const result = await aprovarPedidoComOmie(pedido.id)
            const omieUpdate: Partial<Pedido> = {
              status: 'confirmado' as const,
              dataAprovacao: new Date().toISOString(),
              aprovadoPor: loggedUser?.id,
            }
            if (result.omie?.pending) {
              addNotificacao('success', 'Pedido aprovado ✅', `Pedido ${pedido.numero} aprovado! Enviando ao Omie em background...`, pedido.clienteId)
            } else if (result.omie?.success) {
              omieUpdate.omieCodigo = String(result.omie.omie_codigo || '')
              omieUpdate.omieErro = undefined
              addNotificacao('success', 'Pedido aprovado + Omie ✅', `Pedido ${pedido.numero} aprovado e enviado ao Omie com sucesso! (Cód: ${result.omie.omie_codigo})`, pedido.clienteId)
            } else {
              omieUpdate.omieErro = result.omie?.error || 'Erro desconhecido ao enviar para o Omie'
              addNotificacao('warning', 'Pedido aprovado — Omie com erro', `Pedido ${pedido.numero} foi aprovado, mas o Omie rejeitou: ${result.omie?.error || 'erro desconhecido'}`, pedido.clienteId)
            }
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, ...omieUpdate } : p))
            // Auto-move client to follow_up only for clear sales orders
            const cliAprov = clientes.find(c => c.id === pedido.clienteId)
            const isAmostraFlow = pedido.tipo === 'bonificacao' || cliAprov?.etapa === 'amostra' || cliAprov?.etapa === 'amostra_perdida'
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
                await moverCliente(pedido.clienteId, 'follow_up', { statusFollowUp: 'pedido_aprovado' })
              } catch (err) { 
                logger.error('Erro ao mover cliente para follow_up:', err)
              }
              // Criar card clone em negociacao para o próximo ciclo
              if (cliAprov) {
                try {
                  const clienteOriginal = clientes.find(c => c.id === pedido.clienteId) || cliAprov
                  const novoCliente: Omit<Cliente, 'id'> = {
                    ...clienteOriginal,
                    etapa: 'negociacao',
                    etapaAnterior: 'follow_up',
                    novoCiclo: true,
                    cicloNumero: (clienteOriginal.cicloNumero || 1) + 1,
                    statusFollowUp: undefined,
                    motivoPerda: undefined,
                    categoriaPerda: undefined,
                    dataPerda: undefined,
                    dataEntradaEtapa: new Date().toISOString(),
                    historicoEtapas: [],
                  }
                  const saved = await db.insertCliente(novoCliente)
                  setClientes(prev => [saved, ...prev])
                  addNotificacao('info', 'Novo ciclo criado', `Card de ${clienteOriginal.razaoSocial} criado em Negociação para o próximo ciclo.`, saved.id)
                } catch (cicloErr) {
                  logger.error('Erro ao criar novo ciclo em negociacao:', cicloErr)
                }
              }
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
            // Se for pedido de bonificação (amostra), mover cliente para amostra_perdida
            if (pedido.tipo === 'bonificacao') {
              const cli = clientes.find(c => c.id === pedido.clienteId)
              if (cli && cli.etapa === 'amostra') {
                try {
                  moverCliente(pedido.clienteId, 'amostra_perdida', {
                    resultadoAmostra: 'reprovada',
                    dataResultadoAmostra: new Date().toISOString().split('T')[0],
                    motivoReprovacao: motivo,
                  })
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
            // Mover cliente para perdido + criar novo card em Proposta (direto via db, sem lock)
            const cli = clientes.find(c => c.id === pedido.clienteId)
            if (cli) {
              try {
                const now = new Date().toISOString()
                const today = now.split('T')[0]
                // 1) Mover para perdido diretamente no banco
                if (cli.etapa !== 'perdido') {
                  await db.moverClienteAtomico(
                    pedido.clienteId, 'perdido', cli.etapa, now,
                    { motivoPerda: `Pedido ${pedido.numero} cancelado`, categoriaPerda: 'outro', dataPerda: today }
                  )
                  setClientes(prev => prev.map(c => c.id === pedido.clienteId
                    ? { ...c, etapa: 'perdido', etapaAnterior: c.etapa, motivoPerda: `Pedido ${pedido.numero} cancelado`, categoriaPerda: 'outro', dataPerda: today }
                    : c
                  ))
                }
                // 2) Criar novo card em Proposta
                const novoCard: Omit<Cliente, 'id'> = {
                  ...cli,
                  cnpj: undefined,
                  etapa: 'proposta',
                  etapaAnterior: 'perdido',
                  novoCiclo: true,
                  cicloNumero: (cli.cicloNumero || 1) + 1,
                  statusFollowUp: undefined,
                  statusAmostra: undefined,
                  statusEntrega: undefined,
                  statusFaturamento: undefined,
                  motivoPerda: undefined,
                  categoriaPerda: undefined,
                  dataPerda: undefined,
                  valorEstimado: undefined,
                  valorProposta: undefined,
                  dataProposta: undefined,
                  dataEntradaEtapa: now,
                  historicoEtapas: [],
                  vendedorId: cli.vendedorId,
                }
                const cardCriado = await db.insertCliente(novoCard)
                setClientes(prev => [...prev, cardCriado])
                addNotificacao('info', '🔄 Novo ciclo criado', `Pedido cancelado — card de ${cli.razaoSocial} criado em Proposta para novo ciclo.`, cardCriado.id)
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
              ? { ...p, omieCodigo: omieCodigo || undefined, omieNumero: omieNumero || undefined, omieStatus: 'enviado', omieErro: undefined }
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
        onQuickAction={handleQuickAction}
        onClickCliente={(c) => setSelectedClientePanel(c)}
        isGerente={loggedUser?.cargo === 'gerente'}
        moverCliente={moverCliente}
        onNovoCiclo={onNovoCiclo}
        onImportNegocios={async (updates, novos) => {
          try {
            if (updates.length > 0) {
              const mapped = updates.map(u => ({ id: u.clienteId, changes: u.changes }))
              await db.updateClientesBatch(mapped)
              setClientes(prev => {
                const updMap = new Map(mapped.map(u => [u.id, u.changes]))
                return prev.map(c => {
                  const ch = updMap.get(c.id)
                  return ch ? { ...c, ...ch } : c
                })
              })
            }
            if (novos.length > 0) {
              const comVendedor = novos.map(c => ({ ...c, vendedorId: c.vendedorId || loggedUser?.id }))
              const { saved: savedNovos } = await db.insertClientesBatch(comVendedor as Omit<Cliente, 'id'>[])
              setClientes(prev => [...prev, ...savedNovos])
            }
            showToast('success', `Funil atualizado: ${updates.length} atualizados, ${novos.length} novos`)
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

            for (const novoCliente of comVendedor) {
              const cnpjNorm = (novoCliente.cnpj || '').replace(/[^\d]/g, '')
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
            }

            const msgs: string[] = []
            if (novosInseridos > 0) msgs.push(`${novosInseridos} novo(s)`)
            if (atualizados > 0) msgs.push(`${atualizados} atualizado(s) para você`)
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
      return <MapaView clientes={clientes} loggedUser={loggedUser} showToast={showToast} />
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
      return <TarefasView tarefas={tarefas} clientes={clientes} vendedores={vendedores} loggedUser={loggedUser} interacoes={interacoes} pedidos={pedidos} showToast={showToast} onVerNoFunil={onVerNoFunil}
        onDeleteTarefa={async (t) => {
          try {
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
            
            // Atualização otimista: atualiza UI imediatamente antes da resposta do banco
            setTarefas(prev => prev.map(x => x.id === t.id ? t : x))
            await db.updateTarefa(t.id, t)
            
            // Disparar regras de automação ao concluir tarefa
            if (foiConcluidaAgora && t.clienteId) {
              try {
                const cliente = clientes.find(c => c.id === t.clienteId)
                if (cliente) {
                  const novasTarefas = await db.processarRegrasTarefaConcluida(
                    t,
                    cliente.etapa,
                    cliente.razaoSocial || 'Cliente',
                    t.vendedorId || cliente.vendedorId || loggedUser?.id || 0
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
            logger.error('Erro ao atualizar tarefa:', err)
            showToast('error', `Erro ao salvar tarefa: ${err?.message || err?.code || 'desconhecido'}`)
          }
        }}
        onAddTarefa={async (t) => {
          try {
            const saved = await db.insertTarefa(t)
            setTarefas(prev => [saved, ...prev])
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
        } catch (err) { logger.error('Erro ao add lead social:', err) }
      }} />
    case 'integracoes':
      return <IntegracoesView />
    case 'equipe':
      return <VendedoresView vendedores={vendedores} clientes={clientes} loggedUser={loggedUser}
        onAddVendedor={async (email, senha, vendedorData) => {
          try {
            const saved = await db.createVendedorWithAuth(email, senha, vendedorData)
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
      return <RelatoriosView clientes={clientes} vendedores={vendedores} interacoes={interacoes} produtos={produtos} />
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
    case 'pedidos':
      return <PedidosView pedidos={pedidos} clientes={clientes} produtos={produtos} vendedores={vendedores} showToast={showToast} loggedUser={loggedUser || { id: 0, nome: 'Sistema', email: '', cargo: 'vendedor', ativo: true, metaVendas: 0, metaLeads: 0, metaConversao: 0 } as Vendedor}
        onMoverCliente={moverCliente}
        onAddPedido={async (p) => {
          try {
            const saved = await db.insertPedido(p)
            // Atualizar ultimaInteracao do cliente (evita auto-inativo)
            const now = new Date().toISOString()
            try {
              await db.updateCliente(p.clienteId, { ultimaInteracao: now.split('T')[0] })
              setClientes(prev => prev.map(c => c.id === p.clienteId ? { ...c, ultimaInteracao: now.split('T')[0], diasInativo: 0 } : c))
            } catch { /* non-critical */ }
            const params = getParametrosAprovacao()
            // Vendedor: SEMPRE vai para aprovação do gerente. Auto-aprovação só para gerente.
            if (loggedUser?.cargo === 'gerente' && pedidoPassaAutoAprovacao(saved, params)) {
              try {
                const omieResult = await aprovarPedidoComOmie(saved.id)
                setPedidos(prev => [...prev, { ...saved, status: 'confirmado', dataAprovacao: new Date().toISOString(), aprovadoPor: loggedUser?.id }])
                // Auto-move client to negociacao when sale is approved (or create new cycle if lost)
                const cli = clientes.find(c => c.id === p.clienteId)
                if (cli) {
                  try {
                    if (cli.etapa === 'perdido') {
                      const novoCard: Omit<Cliente, 'id'> = { ...cli, cnpj: undefined, etapa: 'proposta', etapaAnterior: 'perdido', novoCiclo: true, cicloNumero: (cli.cicloNumero || 1) + 1, statusFollowUp: undefined, motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined, valorEstimado: undefined, valorProposta: undefined, dataProposta: undefined, dataEntradaEtapa: new Date().toISOString(), historicoEtapas: [] }
                      const cardCriado = await db.insertCliente(novoCard)
                      setClientes(prev => [...prev, cardCriado])
                    } else if (cli.etapa !== 'negociacao') {
                      moverCliente(p.clienteId, 'negociacao')
                    }
                  } catch { /* non-critical */ }
                }
                if (omieResult.omie?.success) {
                  showToast('success', `Pedido ${saved.numero} aprovado e enviado ao Omie! ✅`)
                } else {
                  showToast('success', `Pedido ${saved.numero} aprovado! ${omieResult.omie?.error ? '⚠️ Omie: ' + omieResult.omie.error : ''}`)
                }
              } catch {
                await db.aprovarPedido(saved.id, loggedUser?.id || 0)
                setPedidos(prev => [...prev, { ...saved, status: 'confirmado', dataAprovacao: new Date().toISOString(), aprovadoPor: loggedUser?.id }])
                // Auto-move client to negociacao when sale is approved (or create new cycle if lost)
                const cli2 = clientes.find(c => c.id === p.clienteId)
                if (cli2) {
                  try {
                    if (cli2.etapa === 'perdido') {
                      const novoCard: Omit<Cliente, 'id'> = { ...cli2, cnpj: undefined, etapa: 'proposta', etapaAnterior: 'perdido', novoCiclo: true, cicloNumero: (cli2.cicloNumero || 1) + 1, statusFollowUp: undefined, motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined, valorEstimado: undefined, valorProposta: undefined, dataProposta: undefined, dataEntradaEtapa: new Date().toISOString(), historicoEtapas: [] }
                      const cardCriado = await db.insertCliente(novoCard)
                      setClientes(prev => [...prev, cardCriado])
                    } else if (cli2.etapa !== 'negociacao') {
                      moverCliente(p.clienteId, 'negociacao')
                    }
                  } catch { /* non-critical */ }
                }
                showToast('success', `Pedido ${saved.numero} aprovado automaticamente! ✅ (Omie offline)`)
              }
            } else {
              setPedidos(prev => [...prev, saved])
              // Move client to negociacao when pedido is sent for approval
              const cliSent = clientes.find(c => c.id === p.clienteId)
              if (cliSent && cliSent.etapa !== 'negociacao' && cliSent.etapa !== 'perdido') {
                try { moverCliente(p.clienteId, 'negociacao') } catch { /* non-critical */ }
              }
              showToast('success', `Pedido ${p.numero} enviado para aprovação!`)
            }
          } catch (err: any) { logger.error('Erro ao criar pedido:', err); showToast('error', err?.message || 'Erro ao salvar pedido. Tente novamente.'); throw err }
        }}
        onUpdatePedido={async (p) => {
          try {
            if (p.status === 'confirmado') {
              // Aprovar via backend → Omie
              try {
                const result = await aprovarPedidoComOmie(p.id)
                setPedidos(prev => prev.map(x => x.id === p.id ? { ...p, status: 'confirmado', dataAprovacao: new Date().toISOString(), aprovadoPor: loggedUser?.id } : x))
                // Auto-move client to negociacao when sale is approved (or create new cycle if lost)
                const cliApproved = clientes.find(c => c.id === p.clienteId)
                if (cliApproved) {
                  try {
                    if (cliApproved.etapa === 'perdido') {
                      const novoCard: Omit<Cliente, 'id'> = { ...cliApproved, cnpj: undefined, etapa: 'proposta', etapaAnterior: 'perdido', novoCiclo: true, cicloNumero: (cliApproved.cicloNumero || 1) + 1, statusFollowUp: undefined, motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined, valorEstimado: undefined, valorProposta: undefined, dataProposta: undefined, dataEntradaEtapa: new Date().toISOString(), historicoEtapas: [] }
                      const cardCriado = await db.insertCliente(novoCard)
                      setClientes(prev => [...prev, cardCriado])
                    } else if (cliApproved.etapa !== 'negociacao') {
                      moverCliente(p.clienteId, 'negociacao')
                    }
                  } catch { /* non-critical */ }
                }
                if (result.omie?.success) {
                  showToast('success', `Pedido ${p.numero} aprovado e enviado ao Omie! ✅`)
                } else {
                  showToast('success', `Pedido ${p.numero} aprovado! ${result.omie?.error ? '⚠️ Omie: ' + result.omie.error : ''}`)
                }
              } catch {
                await db.aprovarPedido(p.id, loggedUser?.id || 0)
                setPedidos(prev => prev.map(x => x.id === p.id ? { ...p, status: 'confirmado' } : x))
                // Auto-move client to negociacao when sale is approved (or create new cycle if lost)
                const cliApproved2 = clientes.find(c => c.id === p.clienteId)
                if (cliApproved2) {
                  try {
                    if (cliApproved2.etapa === 'perdido') {
                      const novoCard: Omit<Cliente, 'id'> = { ...cliApproved2, cnpj: undefined, etapa: 'proposta', etapaAnterior: 'perdido', novoCiclo: true, cicloNumero: (cliApproved2.cicloNumero || 1) + 1, statusFollowUp: undefined, motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined, valorEstimado: undefined, valorProposta: undefined, dataProposta: undefined, dataEntradaEtapa: new Date().toISOString(), historicoEtapas: [] }
                      const cardCriado = await db.insertCliente(novoCard)
                      setClientes(prev => [...prev, cardCriado])
                    } else if (cliApproved2.etapa !== 'negociacao') {
                      moverCliente(p.clienteId, 'negociacao')
                    }
                  } catch { /* non-critical */ }
                }
                showToast('success', `Pedido ${p.numero} aprovado! (Omie offline)`)
              }
            } else {
              await db.updatePedidoStatus(p.id, p.status)
              setPedidos(prev => prev.map(x => x.id === p.id ? p : x))
            }
          } catch (err) { logger.error('Erro ao atualizar pedido:', err) }
        }}
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
