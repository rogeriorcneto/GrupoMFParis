import React from 'react'
import type {
  ViewType, Cliente, Interacao, Vendedor, Tarefa,
  Notificacao, Atividade, Template, Produto, DashboardMetrics,
  TemplateMsg, Cadencia, Campanha, JobAutomacao, Pedido
} from '../types'
import {
  DashboardView, AmostrasView, AprovacaoView, FunilView, ClientesView, TarefasView,
  ProspeccaoView, AutomacoesView, MapaView, SocialSearchView,
  IntegracoesView, VendedoresView, RelatoriosView, TemplatesView,
  ProdutosView, PedidosView, AssistenteIAView
} from './views'
import * as db from '../lib/database'
import { logger } from '../utils/logger'
import { getParametrosAprovacao, pedidoPassaAutoAprovacao } from './views/AprovacaoView'

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
  switch (activeView) {
    case 'dashboard':
      return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} loggedUser={loggedUser} />
    case 'aprovacao':
      return <AprovacaoView
        pedidos={pedidos}
        clientes={clientes}
        vendedores={vendedores}
        loggedUser={loggedUser || { id: 0, nome: 'Sistema', email: '', cargo: 'gerente', ativo: true, metaVendas: 0, metaLeads: 0, metaConversao: 0 } as Vendedor}
        showToast={showToast}
        onAprovar={async (pedido) => {
          try {
            await db.aprovarPedido(pedido.id, loggedUser?.id || 0)
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: 'confirmado', dataAprovacao: new Date().toISOString(), aprovadoPor: loggedUser?.id } : p))
            addNotificacao('success', 'Pedido aprovado', `Pedido ${pedido.numero} aprovado! O vendedor será notificado.`, pedido.clienteId)
          } catch (err) { logger.error('Erro ao aprovar pedido:', err); throw err }
        }}
        onRecusar={async (pedido, motivo) => {
          try {
            await db.recusarPedido(pedido.id, motivo)
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: 'cancelado', motivoRecusa: motivo } : p))
            addNotificacao('info', 'Pedido recusado', `Pedido ${pedido.numero} recusado. Motivo: ${motivo}`, pedido.clienteId)
          } catch (err) { logger.error('Erro ao recusar pedido:', err); throw err }
        }}
      />
    case 'amostras':
      return <AmostrasView
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
        onSolicitarAmostra={async (cliente) => {
          try {
            await db.updateCliente(cliente.id, { statusAmostra: 'pendente_aprovacao' })
            setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, statusAmostra: 'pendente_aprovacao' } : c))
            addNotificacao('success', 'Solicitação enviada', `Amostra solicitada para ${cliente.razaoSocial}. Aguardando aprovação do gerente.`, cliente.id)
          } catch (err) { logger.error('Erro ao solicitar amostra:', err); showToast('error', 'Erro ao solicitar amostra') }
        }}
        onAprovarAmostra={async (cliente) => {
          try {
            const dataEnvio = new Date().toISOString().split('T')[0]
            moverCliente(cliente.id, 'amostra', { dataEnvioAmostra: dataEnvio, statusAmostra: 'enviada' })
            addNotificacao('success', 'Amostra aprovada', `Amostra aprovada para ${cliente.razaoSocial}. Cliente movido para etapa Amostra.`, cliente.id)
          } catch (err) { logger.error('Erro ao aprovar amostra:', err); showToast('error', 'Erro ao aprovar amostra') }
        }}
        onRejeitarAmostra={async (cliente) => {
          try {
            await db.updateCliente(cliente.id, { statusAmostra: undefined })
            setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, statusAmostra: undefined } : c))
            addNotificacao('info', 'Amostra rejeitada', `Solicitação de amostra rejeitada para ${cliente.razaoSocial}.`, cliente.id)
          } catch (err) { logger.error('Erro ao rejeitar amostra:', err); showToast('error', 'Erro ao rejeitar amostra') }
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
        onNewCliente={openModal}
        onEditCliente={handleEditCliente}
        onImportClientes={async (novos) => {
          try {
            const comVendedor = novos.map(c => ({ ...c, vendedorId: c.vendedorId || loggedUser?.id }))
            const saved = await db.insertClientesBatch(comVendedor as Omit<Cliente, 'id'>[])
            setClientes(prev => [...prev, ...saved])
            showToast('success', `${saved.length} cliente(s) importado(s) com sucesso!`)
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
      return <AutomacoesView clientes={clientes} onAction={handleQuickAction} />
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
      return <TarefasView tarefas={tarefas} clientes={clientes} vendedores={vendedores} loggedUser={loggedUser}
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
      />
    case 'pedidos':
      return <PedidosView pedidos={pedidos} clientes={clientes} produtos={produtos} vendedores={vendedores} showToast={showToast} loggedUser={loggedUser || { id: 0, nome: 'Sistema', email: '', cargo: 'vendedor', ativo: true, metaVendas: 0, metaLeads: 0, metaConversao: 0 } as Vendedor}
        onAddPedido={async (p) => {
          try {
            const saved = await db.insertPedido(p)
            const params = getParametrosAprovacao()
            if (pedidoPassaAutoAprovacao(saved, params)) {
              await db.aprovarPedido(saved.id, loggedUser?.id || 0)
              setPedidos(prev => [...prev, { ...saved, status: 'confirmado', dataAprovacao: new Date().toISOString(), aprovadoPor: loggedUser?.id }])
              showToast('success', `Pedido ${saved.numero} aprovado automaticamente! ✅`)
            } else {
              setPedidos(prev => [...prev, saved])
              showToast('success', `Pedido ${p.numero} enviado para aprovação!`)
            }
          } catch (err) { logger.error('Erro ao criar pedido:', err); showToast('error', 'Erro ao salvar pedido. Tente novamente.') }
        }}
        onUpdatePedido={async (p) => {
          try {
            await db.updatePedidoStatus(p.id, p.status)
            setPedidos(prev => prev.map(x => x.id === p.id ? p : x))
          } catch (err) { logger.error('Erro ao atualizar pedido:', err) }
        }}
      />
    case 'ia':
      return <AssistenteIAView
        clientes={clientes}
        pedidos={pedidos}
        vendedores={vendedores}
        interacoes={interacoes}
        loggedUser={loggedUser}
      />
    default:
      return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} loggedUser={loggedUser} />
  }
}
