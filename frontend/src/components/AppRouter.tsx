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
  ProdutosView, PedidosView, AssistenteIAView, OmieView
} from './views'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { getParametrosAprovacao, pedidoPassaAutoAprovacao } from './views/AprovacaoView'
import { aprovarPedidoComOmie } from '../lib/botApi'

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
}

export function shouldMoveToFollowUpOnApproval(pedido: Pedido, cliente?: Cliente): boolean {
  const isAmostraFlow = pedido.tipo === 'bonificacao' || cliente?.etapa === 'amostra' || cliente?.etapa === 'amostra_perdida'
  if (isAmostraFlow) return false
  if (!cliente) return false
  return cliente.etapa !== 'follow_up' && cliente.etapa !== 'perdido'
}

export default function AppRouter({
  activeView, loggedUser,
  clientes, interacoes, vendedores, tarefas, atividades, templates,
  templatesMsgs, cadencias, campanhas, jobs, produtos, pedidos, dashboardMetrics,
  setClientes, setInteracoes, setVendedores, setTarefas, setTemplates,
  setTemplatesMsgs, setCampanhas, setProdutos, setPedidos,
  showToast, openModal, handleEditCliente,
  handleDragStart, handleDragOver, handleDrop, handleQuickAction,
  setSelectedClientePanel, moverCliente, startCampanha, runJobNow, addNotificacao
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
            if (result.omie?.success) {
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
            if (shouldMoveToFollowUpOnApproval(pedido, cliAprov)) {
              try { moverCliente(pedido.clienteId, 'follow_up', { statusFollowUp: 'pedido_aprovado' }) } catch { /* non-critical */ }
            }
          } catch (err) { logger.error('Erro ao aprovar pedido:', err); throw err }
        }}
        onRecusar={async (pedido, motivo) => {
          try {
            await db.recusarPedido(pedido.id, motivo)
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: 'cancelado', motivoRecusa: motivo } : p))
            addNotificacao('info', 'Pedido recusado', `Pedido ${pedido.numero} recusado. Motivo: ${motivo}`, pedido.clienteId)
            // If rejected, move client back to proposta
            const cliRecusado = clientes.find(c => c.id === pedido.clienteId)
            if (cliRecusado && cliRecusado.etapa === 'negociacao') {
              try { moverCliente(pedido.clienteId, 'proposta') } catch { /* non-critical */ }
            }
          } catch (err) { logger.error('Erro ao recusar pedido:', err); throw err }
        }}
      />
    case 'funil':
      return <FunilView 
        clientes={clientes}
        vendedores={vendedores}
        interacoes={interacoes}
        loggedUser={loggedUser}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onQuickAction={handleQuickAction}
        onClickCliente={(c) => setSelectedClientePanel(c)}
        isGerente={loggedUser?.cargo === 'gerente'}
        moverCliente={moverCliente}
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
              const savedNovos = await db.insertClientesBatch(comVendedor as Omit<Cliente, 'id'>[])
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

            for (const novoCliente of comVendedor) {
              // Buscar duplicata por CNPJ
              let existente: Cliente | null = null
              if (novoCliente.cnpj && novoCliente.cnpj.trim()) {
                existente = await db.checkCnpjDuplicado(novoCliente.cnpj)
              }
              // Se não achou por CNPJ, buscar por razão social exata
              if (!existente && novoCliente.razaoSocial) {
                const match = clientes.find(c =>
                  c.razaoSocial.toLowerCase().trim() === novoCliente.razaoSocial.toLowerCase().trim()
                )
                if (match) existente = match
              }

              if (existente) {
                // Cliente já existe → atualizar vendedorId para o vendedor que importou
                await db.updateCliente(existente.id, { vendedorId: vendedorId })
                setClientes(prev => prev.map(c => c.id === existente!.id ? { ...c, vendedorId } : c))
                atualizados++
              } else {
                realmente_novos.push(novoCliente as Omit<Cliente, 'id'>)
              }
            }

            // Inserir apenas os realmente novos
            let novosInseridos = 0
            if (realmente_novos.length > 0) {
              const saved = await db.insertClientesBatch(realmente_novos)
              setClientes(prev => [...prev, ...saved])
              novosInseridos = saved.length
            }

            const msgs: string[] = []
            if (novosInseridos > 0) msgs.push(`${novosInseridos} novo(s)`)
            if (atualizados > 0) msgs.push(`${atualizados} atualizado(s) para você`)
            showToast('success', `Importação concluída: ${msgs.join(', ')}`)
          } catch (err) { logger.error('Erro ao importar:', err); showToast('error', 'Erro ao importar clientes. Verifique o CSV.') }
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
      return <MapaView clientes={clientes} />
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
      return <TarefasView tarefas={tarefas} clientes={clientes} vendedores={vendedores} loggedUser={loggedUser} interacoes={interacoes} pedidos={pedidos} showToast={showToast}
        onUpdateTarefa={async (t) => {
          try {
            await db.updateTarefa(t.id, t)
            setTarefas(prev => prev.map(x => x.id === t.id ? t : x))
          } catch (err) { logger.error('Erro ao atualizar tarefa:', err) }
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
          } catch (err) { logger.error('Erro ao importar tarefas:', err); showToast('error', 'Erro ao importar tarefas. Verifique o CSV.') }
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
      return <VendedoresView vendedores={vendedores} clientes={clientes}
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
            await db.updateProduto(p.id, p)
            setProdutos(prev => prev.map(x => x.id === p.id ? p : x))
          } catch (err) { logger.error('Erro ao atualizar produto:', err) }
        }}
        onDelete={async (id) => {
          try {
            await db.deleteProduto(id)
            setProdutos(prev => prev.filter(p => p.id !== id))
          } catch (err) { logger.error('Erro ao deletar produto:', err) }
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
                // Auto-move client to negociacao when sale is approved
                const cli = clientes.find(c => c.id === p.clienteId)
                if (cli && cli.etapa !== 'negociacao' && cli.etapa !== 'perdido') {
                  try { moverCliente(p.clienteId, 'negociacao') } catch { /* non-critical */ }
                }
                if (omieResult.omie?.success) {
                  showToast('success', `Pedido ${saved.numero} aprovado e enviado ao Omie! ✅`)
                } else {
                  showToast('success', `Pedido ${saved.numero} aprovado! ${omieResult.omie?.error ? '⚠️ Omie: ' + omieResult.omie.error : ''}`)
                }
              } catch {
                await db.aprovarPedido(saved.id, loggedUser?.id || 0)
                setPedidos(prev => [...prev, { ...saved, status: 'confirmado', dataAprovacao: new Date().toISOString(), aprovadoPor: loggedUser?.id }])
                // Auto-move client to negociacao when sale is approved
                const cli2 = clientes.find(c => c.id === p.clienteId)
                if (cli2 && cli2.etapa !== 'negociacao' && cli2.etapa !== 'perdido') {
                  try { moverCliente(p.clienteId, 'negociacao') } catch { /* non-critical */ }
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
                // Auto-move client to negociacao when sale is approved
                const cliApproved = clientes.find(c => c.id === p.clienteId)
                if (cliApproved && cliApproved.etapa !== 'negociacao' && cliApproved.etapa !== 'perdido') {
                  try { moverCliente(p.clienteId, 'negociacao') } catch { /* non-critical */ }
                }
                if (result.omie?.success) {
                  showToast('success', `Pedido ${p.numero} aprovado e enviado ao Omie! ✅`)
                } else {
                  showToast('success', `Pedido ${p.numero} aprovado! ${result.omie?.error ? '⚠️ Omie: ' + result.omie.error : ''}`)
                }
              } catch {
                await db.aprovarPedido(p.id, loggedUser?.id || 0)
                setPedidos(prev => prev.map(x => x.id === p.id ? { ...p, status: 'confirmado' } : x))
                // Auto-move client to negociacao when sale is approved
                const cliApproved2 = clientes.find(c => c.id === p.clienteId)
                if (cliApproved2 && cliApproved2.etapa !== 'negociacao' && cliApproved2.etapa !== 'perdido') {
                  try { moverCliente(p.clienteId, 'negociacao') } catch { /* non-critical */ }
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
