import { useState, useRef } from 'react'
import type { Cliente, Interacao, Atividade, Vendedor, Tarefa, JobAutomacao, Campanha, Cadencia, HistoricoEtapa } from '../types'
import * as db from '../lib/database'
import { stageLabels, transicoesPermitidas } from '../utils/constants'
import { buildNovoCicloCliente, existeCardAtivoNoFunil, mesmaEmpresaNoFunil } from '../utils/funil-logic'
import { logger } from '../utils/logger'

interface DragItem { cliente: Cliente; fromStage: string }

async function copiarHistoricoETarefas(
  _clienteOriginalId: number,
  _novoClienteId: number,
  _historicoOriginal: HistoricoEtapa[],
  _tarefasAll: Tarefa[],
  _setTarefas: React.Dispatch<React.SetStateAction<Tarefa[]>>,
) {
  // Regra oficial (Histórico Global por Cliente + Prevenção):
  // Tarefas, notas e histórico de etapas pertencem ao cliente como um todo e permanecem
  // vinculados ao ciclo original com suas datas de criação originais intactas.
}

interface UseFunilActionsParams {
  clientes: Cliente[]
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  interacoes: Interacao[]
  setInteracoes: React.Dispatch<React.SetStateAction<Interacao[]>>
  loggedUser: Vendedor | null
  setAtividades: React.Dispatch<React.SetStateAction<Atividade[]>>
  addNotificacao: (tipo: 'info' | 'warning' | 'error' | 'success', titulo: string, mensagem: string, clienteId?: number) => void
  jobs: JobAutomacao[]
  setJobs: React.Dispatch<React.SetStateAction<JobAutomacao[]>>
  campanhas: Campanha[]
  setCampanhas: React.Dispatch<React.SetStateAction<Campanha[]>>
  cadencias: Cadencia[]
  tarefas: Tarefa[]
  setTarefas: React.Dispatch<React.SetStateAction<Tarefa[]>>
  loadAllData: () => Promise<void>
  onConflictCard?: (cardExistente: Cliente) => void
}

export function useFunilActions({
  clientes, setClientes, interacoes, setInteracoes, loggedUser,
  setAtividades, addNotificacao, jobs, setJobs, campanhas, setCampanhas,
  cadencias, tarefas, setTarefas, loadAllData, onConflictCard
}: UseFunilActionsParams) {
  // Regra anti-duplicata: só pode existir 1 card em proposta/negociacao por cliente.
  const clientesRef = useRef({ origem: clientes, atuais: clientes })
  if (clientesRef.current.origem !== clientes) clientesRef.current = { origem: clientes, atuais: clientes }
  const ciclosPendentes = useRef<Cliente[]>([])
  const buscarCardAtivo = (cliente: Cliente, etapas: string[], lista?: Cliente[]) =>
    (lista || clientesRef.current.atuais).find(c => !c.arquivadoDuplicata && c.id !== cliente.id && etapas.includes(c.etapa) && mesmaEmpresaNoFunil(c, cliente))
  const existeCardAtivo = (cliente: Cliente, etapas: string[], lista?: Cliente[]) =>
    existeCardAtivoNoFunil(lista || clientesRef.current.atuais, cliente, etapas)
  const inserirNovoCiclo = async (cliente: Cliente, novoCard: Omit<Cliente, 'id'>) => {
    const atuais = clientesRef.current.atuais
    const conflito = buscarCardAtivo(cliente, ['proposta', 'negociacao'], atuais)
    if (conflito) {
      onConflictCard?.(conflito)
      throw new Error(`Já existe um card ativo em ${stageLabels[conflito.etapa] || conflito.etapa} para este cliente. Abrindo o card existente.`)
    }
    if (ciclosPendentes.current.some(c => mesmaEmpresaNoFunil(c, cliente))) {
      throw new Error('A criação de um card ativo deste cliente já está em andamento.')
    }
    ciclosPendentes.current.push(cliente)
    try {
      const cicloNumero = Math.max(cliente.cicloNumero || 1, ...atuais.filter(c => mesmaEmpresaNoFunil(c, cliente)).map(c => c.cicloNumero || 1)) + 1
      const novo = await db.insertCliente({ ...novoCard, cicloNumero })
      clientesRef.current.atuais = [...clientesRef.current.atuais, novo]
      return novo
    } finally {
      ciclosPendentes.current = ciclosPendentes.current.filter(c => c !== cliente)
    }
  }

  const draggedItemRef = useRef<DragItem | null>(null)
  const [draggedItem, setDraggedItemState] = useState<DragItem | null>(null)
  const setDraggedItem = (v: DragItem | null) => { draggedItemRef.current = v; setDraggedItemState(v) }
  const [pendingDrop, setPendingDrop] = useState<{ e: React.DragEvent | null, toStage: string } | null>(null)
  const [showMotivoPerda, setShowMotivoPerda] = useState(false)
  const [motivoPerdaTexto, setMotivoPerdaTexto] = useState('')
  const [categoriaPerdaSel, setCategoriaPerdaSel] = useState<Cliente['categoriaPerda']>('outro')
  const [showModalAmostra, setShowModalAmostra] = useState(false)
  const [modalAmostraData, setModalAmostraData] = useState(new Date().toISOString().split('T')[0])
  const [showModalProposta, setShowModalProposta] = useState(false)
  const [modalPropostaValor, setModalPropostaValor] = useState('')
  const [showModalSatisfacao, setShowModalSatisfacao] = useState(false)
  const [modalSatisfacaoNota, setModalSatisfacaoNota] = useState(5)
  const [modalSatisfacaoFeedback, setModalSatisfacaoFeedback] = useState('')
  const [selectedClientePanel, setSelectedClientePanel] = useState<Cliente | null>(null)
  const [transicaoInvalida, setTransicaoInvalida] = useState('')
  const movingRef = useRef(false)
  const quickActionRef = useRef(false)

  const handleQuickAction = async (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => {
    if (quickActionRef.current) return
    quickActionRef.current = true
    const assunto = tipo === 'propaganda' ? `Propaganda - ${canal.toUpperCase()}` : `Contato - ${canal.toUpperCase()}`
    const descricao = tipo === 'propaganda'
      ? `Envio de propaganda automatizada para ${cliente.razaoSocial}`
      : `Ação de contato iniciada com ${cliente.razaoSocial}`

    try {
      // Attempt real send via backend for email/whatsapp
      let sendOk = true
      if (canal === 'email' && cliente.contatoEmail) {
        const { sendEmailViaBot } = await import('../lib/botApi')
        const result = await sendEmailViaBot(
          cliente.contatoEmail, assunto, descricao,
          cliente.id, loggedUser?.nome
        )
        if (!result.success) {
          sendOk = false
          addNotificacao('warning', 'Envio falhou', `Email para ${cliente.razaoSocial} falhou: ${result.error || 'bot offline'}`, cliente.id)
        }
      } else if (canal === 'whatsapp' && (cliente.whatsapp || cliente.contatoTelefone)) {
        const { sendWhatsApp } = await import('../lib/botApi')
        const numero = cliente.whatsapp || cliente.contatoTelefone
        const result = await sendWhatsApp(
          numero, descricao,
          cliente.id, loggedUser?.nome
        )
        if (!result.success) {
          sendOk = false
          addNotificacao('warning', 'Envio falhou', `WhatsApp para ${cliente.razaoSocial} falhou: ${result.error || 'bot offline'}`, cliente.id)
        }
      }

      // Só registra interação se o envio real teve sucesso (ou se é canal sem envio real como ligação)
      if (!sendOk) return

      const savedI = await db.insertInteracao({
        clienteId: cliente.id, tipo: canal, data: new Date().toISOString(), assunto, descricao, automatico: true
      })
      setInteracoes(prev => [savedI, ...prev])
      const hoje = new Date().toISOString().split('T')[0]
      await db.updateCliente(cliente.id, { ultimaInteracao: hoje })
      setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, ultimaInteracao: hoje } : c))
      const savedAtiv = await db.insertAtividade({ tipo: tipo === 'propaganda' ? 'propaganda' : 'contato', descricao: `${assunto}: ${cliente.razaoSocial}`, vendedorNome: loggedUser?.nome || 'Sistema', timestamp: new Date().toISOString() })
      setAtividades(prev => [savedAtiv, ...prev])
      addNotificacao('success', 'Automação executada', `${assunto}: ${cliente.razaoSocial}`, cliente.id)
    } catch (err) { logger.error('Erro quickAction:', err); addNotificacao('error', 'Erro na automação', `Falha ao executar ${assunto} para ${cliente.razaoSocial}`, cliente.id) } finally { quickActionRef.current = false }
  }

  const scheduleJob = async (job: Omit<JobAutomacao, 'id' | 'status'>) => {
    try {
      const savedJob = await db.insertJob({ ...job, status: 'pendente' })
      setJobs(prev => [savedJob, ...prev])
      const cliente = clientes.find(c => c.id === job.clienteId)
      if (cliente) addNotificacao('info', 'Job agendado', `Agendado ${job.canal.toUpperCase()} para ${cliente.razaoSocial}`, cliente.id)
    } catch (err) { logger.error('Erro ao agendar job:', err) }
  }

  const runJobNow = async (jobId: number) => {
    try {
      await db.updateJobStatus(jobId, 'enviado')
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'enviado' } : j))
    } catch (err) { logger.error('Erro ao executar job:', err) }
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    const cliente = clientes.find(c => c.id === job.clienteId)
    if (!cliente) return
    handleQuickAction(cliente, job.canal, job.tipo)
  }

  const startCampanha = async (campanhaId: number) => {
    const campanha = campanhas.find(c => c.id === campanhaId)
    if (!campanha) return
    const cadencia = cadencias.find(c => c.id === campanha.cadenciaId)
    if (!cadencia) return

    const audience = clientes.filter(c => {
      if (campanha.etapa && c.etapa !== campanha.etapa) return false
      if (campanha.minScore !== undefined && (c.score || 0) < campanha.minScore) return false
      if (campanha.diasInativoMin !== undefined && (c.diasInativo || 0) < campanha.diasInativoMin) return false
      return true
    })

    // Build all jobs upfront, then batch insert (instead of N×M sequential calls)
    const now = new Date()
    const allJobs: Omit<import('../types').JobAutomacao, 'id'>[] = []
    for (const step of cadencia.steps) {
      for (const cliente of audience) {
        const dt = new Date(now)
        dt.setDate(dt.getDate() + step.delayDias)
        allJobs.push({
          clienteId: cliente.id, canal: step.canal, tipo: 'propaganda',
          status: 'pendente', agendadoPara: dt.toISOString(),
          templateId: step.templateId, campanhaId: campanha.id
        })
      }
    }

    try {
      const savedJobs = await db.insertJobsBatch(allJobs)
      setJobs(prev => [...savedJobs, ...prev])
      await db.updateCampanhaStatus(campanhaId, 'ativa')
      setCampanhas(prev => prev.map(c => c.id === campanhaId ? { ...c, status: 'ativa' } : c))
      addNotificacao('success', 'Campanha ativada', `${campanha.nome} iniciada para ${audience.length} leads (${savedJobs.length} jobs criados)`)
    } catch (err) {
      logger.error('Erro ao iniciar campanha:', err)
      addNotificacao('error', 'Erro na campanha', `Falha ao iniciar ${campanha.nome}`)
    }
  }

  const handleDragStart = (e: React.DragEvent, cliente: Cliente, fromStage: string) => {
    setDraggedItem({ cliente, fromStage })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const moverCliente = async (clienteId: number, toStage: string, extras: Partial<Cliente> = {}) => {
    if (movingRef.current) return
    movingRef.current = true
    try {
    const now = new Date().toISOString()
    const cliente = clientesRef.current.atuais.find(c => c.id === clienteId)
    if (!cliente) return false

    const fromStage = cliente.etapa || ''
    const isGerente = loggedUser?.cargo === 'gerente'
    if (fromStage === 'negociacao' && toStage === 'proposta') {
      const msg = 'Negociação não pode voltar para Proposta. Use Ganhou ou Perdido.'
      addNotificacao('warning', 'Transição bloqueada', msg, cliente.id)
      setTransicaoInvalida(msg)
      setTimeout(() => setTransicaoInvalida(''), 5000)
      return false
    }
    // Se algum fluxo legado tentar mover amostra -> proposta com card comercial já ativo, encerra em amostra_perdida
    if (toStage === 'proposta' && fromStage === 'amostra' && existeCardAtivo(cliente, ['proposta', 'negociacao'])) {
      toStage = 'amostra_perdida'
      extras = { ...extras, resultadoAmostra: extras.resultadoAmostra || 'aprovada', dataResultadoAmostra: extras.dataResultadoAmostra || now.split('T')[0] }
    }
    if (fromStage !== toStage && !isGerente) {
      const permitidas = transicoesPermitidas[fromStage] || []
      if (!permitidas.includes(toStage)) {
        const msg = `Movimentação bloqueada: "${stageLabels[fromStage] || fromStage}" só pode ir para ${permitidas.length ? permitidas.map(s => stageLabels[s] || s).join(' ou ') : 'nenhuma etapa'}.`
        addNotificacao('warning', 'Transição bloqueada', msg, cliente.id)
        setTransicaoInvalida(msg)
        setTimeout(() => setTransicaoInvalida(''), 5000)
        return false
      }
    }
    if (fromStage !== toStage && ['proposta', 'negociacao'].includes(toStage)) {
      const conflito = buscarCardAtivo(cliente, ['proposta', 'negociacao'])
      if (conflito) {
        const msg = `Este cliente já possui um card aberto em ${stageLabels[conflito.etapa] || conflito.etapa}. Redirecionando para o card existente.`
        addNotificacao('warning', 'Card ativo existente', msg, conflito.id)
        setTransicaoInvalida(msg)
        setTimeout(() => setTransicaoInvalida(''), 5000)
        onConflictCard?.(conflito)
        return false
      }
    }
    if (toStage === 'amostra' && fromStage !== 'amostra' && !['prospecção', 'proposta', 'amostra_perdida'].includes(fromStage)) {
      addNotificacao('warning', 'Transição bloqueada', 'Amostra só pode partir de Prospecção ou Proposta, exceto o 2º envio de amostra.')
      return false
    }
    const previousSnapshot: Cliente = {
      ...cliente,
      historicoEtapas: [...(cliente.historicoEtapas || [])],
    }

    // Update local state immediately (optimistic)
    setClientes(prev => prev.map(c => {
      if (c.id !== clienteId) return c
      const hist: HistoricoEtapa = { etapa: toStage, data: now, de: c.etapa }
      return { ...c, etapa: toStage, etapaAnterior: c.etapa, dataEntradaEtapa: now, historicoEtapas: [...(c.historicoEtapas || []), hist], ...extras }
    }))

    // Persist to Supabase atomicamente (se falhar, faz rollback para evitar inconsistência de funil)
    try {
      await db.moverClienteAtomico(clienteId, toStage, fromStage, now, extras)
      clientesRef.current.atuais = clientesRef.current.atuais.map(c => c.id === clienteId ? { ...c, ...extras, etapa: toStage } : c)
    } catch (err) {
      logger.error('Erro ao persistir movimento de cliente:', err)
      setClientes(prev => prev.map(c => c.id === clienteId ? previousSnapshot : c))
      try {
        await loadAllData()
      } catch (reloadErr) {
        logger.error('Erro ao recarregar dados após rollback:', reloadErr)
      }
      addNotificacao('error', 'Falha ao mover cliente', `Não foi possível mover ${previousSnapshot.razaoSocial}. O funil foi restaurado.`)
      return false
    }

    // Atividade é importante, mas não deve invalidar a transição já persistida
    try {
      const savedAtiv = await db.insertAtividade({ tipo: 'moveu', descricao: `${cliente.razaoSocial} movido para ${stageLabels[toStage] || toStage}`, vendedorNome: loggedUser?.nome || 'Sistema', timestamp: now })
      setAtividades(prev => [savedAtiv, ...prev])
    } catch (err) {
      logger.error('Erro ao registrar atividade de movimento:', err)
    }

    // Item 3: Tarefas automáticas ao mover etapa (usando regras do banco)
    try {
      const nome = cliente?.razaoSocial || 'Cliente'
      const tarefasCriadas = await db.processarRegrasAutomacao(
        clienteId,
        toStage,
        fromStage,
        cliente?.vendedorId || loggedUser?.id || 0,
        nome,
        tarefas
      )
      
      if (tarefasCriadas.length > 0) {
        setTarefas(prev => [...tarefasCriadas, ...prev])
        logger.log(`${tarefasCriadas.length} tarefa(s) criada(s) automaticamente para ${nome}`)
      }
    } catch (err) {
      logger.error('Erro ao processar regras de automação:', err)
    }

    // Matriz oficial: ao ir para Amostra (de Prospecção ou de Proposta), gera automaticamente card em Proposta
    if (toStage === 'amostra' && ['prospecção', 'proposta'].includes(fromStage) && !existeCardAtivo(cliente, ['proposta', 'negociacao'])) {
      const novoCard = buildNovoCicloCliente(cliente, 'proposta', loggedUser?.id, { etapaAnterior: 'amostra' })
      try {
        const cardCriado = await inserirNovoCiclo(cliente, novoCard)
        setClientes(prev => [...prev, { ...cardCriado, historicoEtapas: cliente.historicoEtapas || [] }])
        addNotificacao('info', '🔄 Card criado em Proposta', `${cliente.razaoSocial}: amostra iniciada em card próprio e card criado em Proposta.`, cardCriado.id)
        await copiarHistoricoETarefas(clienteId, cardCriado.id, cliente.historicoEtapas || [], tarefas, setTarefas)
      } catch (e) {
        logger.error('Erro ao criar card automático em Proposta ao enviar amostra:', e)
      }
    }

    // Matriz oficial: perder em Negociação abre automaticamente um novo ciclo em Proposta
    if (toStage === 'perdido' && fromStage === 'negociacao' && !existeCardAtivo(cliente, ['proposta', 'negociacao'])) {
      const novoCard = buildNovoCicloCliente(cliente, 'proposta', loggedUser?.id, { etapaAnterior: 'perdido' })
      try {
        const cardCriado = await inserirNovoCiclo(cliente, novoCard)
        setClientes(prev => [...prev, { ...cardCriado, historicoEtapas: cliente.historicoEtapas || [] }])
        addNotificacao('info', '🔄 Novo ciclo criado', `${cliente.razaoSocial} foi aberto em Proposta para novo ciclo de vendas.`, cardCriado.id)
        await copiarHistoricoETarefas(clienteId, cardCriado.id, cliente.historicoEtapas || [], tarefas, setTarefas)
      } catch (e) {
        logger.error('Erro ao criar novo ciclo após perda:', e)
      }
    }

    // Matriz oficial (Rodada 3.1 Item 1): entrar/finalizar em Follow-up garante sempre um card ativo aberto em Proposta
    if (toStage === 'follow_up' && !existeCardAtivo(cliente, ['lead', 'prospecção', 'amostra', 'proposta', 'negociacao'])) {
      const novoCard = buildNovoCicloCliente(cliente, 'proposta', loggedUser?.id)
      try {
        const cardCriado = await inserirNovoCiclo(cliente, novoCard)
        setClientes(prev => [...prev, { ...cardCriado, historicoEtapas: cliente.historicoEtapas || [] }])
        addNotificacao('info', '🔄 Novo ciclo criado', `Card de ${cliente.razaoSocial} criado em Proposta para o próximo ciclo de vendas.`, cardCriado.id)
        await copiarHistoricoETarefas(clienteId, cardCriado.id, cliente.historicoEtapas || [], tarefas, setTarefas)
      } catch (e) {
        logger.error('Erro ao criar novo ciclo automático:', e)
      }
    }
    return true
    } finally { movingRef.current = false }
  }

  // Lógica de transição de etapa — usada tanto pelo drag-and-drop (desktop)
  // quanto pelo menu "Mover" dos cards (mobile), que não tem DragEvent.
  const requestStageMove = (cliente: Cliente, fromStage: string, toStage: string) => {
    if (fromStage === toStage) { setDraggedItem(null); return }
    // Garante draggedItem para os confirms dos modais (perda, amostra, proposta)
    setDraggedItem({ cliente, fromStage })

    const isGerente = loggedUser?.cargo === 'gerente'
    // Regra dura (vale pra gerente também): negociação não volta pra proposta —
    // ou clica ganhou/perdido, ou ajusta a proposta no próprio card.
    if (fromStage === 'negociacao' && toStage === 'proposta') {
      setTransicaoInvalida(`Negociação não pode voltar para Proposta. Use Ganhou (Follow-up), Perdido, ou edite a proposta no card.`)
      setTimeout(() => setTransicaoInvalida(''), 5000)
      setDraggedItem(null)
      return
    }
    const permitidas = transicoesPermitidas[fromStage] || []
    if (!isGerente && !permitidas.includes(toStage)) {
      setTransicaoInvalida(`Não é possível mover de "${stageLabels[fromStage]}" para "${stageLabels[toStage]}". Transições permitidas: ${permitidas.map(s => stageLabels[s]).join(', ')}`)
      setTimeout(() => setTransicaoInvalida(''), 4000)
      setDraggedItem(null)
      return
    }

    // Gerente movendo fora do fluxo normal: mover direto sem modal
    // EXCETO para 'perdido' — sempre abre o modal para registrar motivo e criar novo ciclo
    const isOutOfFlow = !permitidas.includes(toStage)
    if (isGerente && isOutOfFlow && toStage !== 'perdido') {
      moverCliente(cliente.id, toStage, {})
      setDraggedItem(null)
      return
    }

    if (toStage === 'perdido') {
      if (fromStage === 'amostra') {
        moverCliente(cliente.id, 'amostra_perdida', {
          resultadoAmostra: 'reprovada',
          dataResultadoAmostra: new Date().toISOString().split('T')[0],
        })
        setDraggedItem(null)
        return
      }
      setPendingDrop({ e: null, toStage })
      setShowMotivoPerda(true)
      return
    }
    if (toStage === 'amostra') {
      if (fromStage === 'amostra_perdida') {
        const tentativa = cliente.tentativaAmostra || 1
        if (tentativa >= 2) {
          setTransicaoInvalida(`${cliente.razaoSocial} já usou as 2 tentativas de amostra. Mova para Perdido.`)
          setTimeout(() => setTransicaoInvalida(''), 5000)
          setDraggedItem(null)
          return
        }
      }
      setPendingDrop({ e: null, toStage })
      setModalAmostraData(new Date().toISOString().split('T')[0])
      setShowModalAmostra(true)
      return
    }
    if (toStage === 'negociacao') {
      setPendingDrop({ e: null, toStage })
      setModalPropostaValor(cliente.valorEstimado?.toString() || '')
      setShowModalProposta(true)
      return
    }

    const extras: Partial<Cliente> = {}
    if (toStage === 'prospecção') { extras.motivoPerda = undefined; extras.categoriaPerda = undefined; extras.dataPerda = undefined }
    // Lead → Prospecção: notify vendedor
    if (toStage === 'prospecção' && fromStage === 'lead') {
      const vendedorNome = loggedUser?.nome || 'Gerente'
      addNotificacao('info', '🆕 Novo Lead!', `${vendedorNome} enviou um novo lead: ${cliente.razaoSocial}`, cliente.id)
    }
    // Amostra → Amostra Perdida: set reprovada result
    if (toStage === 'amostra_perdida') {
      extras.resultadoAmostra = 'reprovada'
      extras.dataResultadoAmostra = new Date().toISOString().split('T')[0]
    }

    moverCliente(cliente.id, toStage, extras)
    setDraggedItem(null)
  }

  const handleDrop = (e: React.DragEvent, toStage: string) => {
    e.preventDefault()
    if (!draggedItem) { setDraggedItem(null); return }
    requestStageMove(draggedItem.cliente, draggedItem.fromStage, toStage)
  }

  const confirmPerda = async () => {
    const item = draggedItemRef.current
    if (item) {
      if (movingRef.current) return
      movingRef.current = true
      try {
      const clienteOriginal = item.cliente
      const fromStage = item.fromStage
      const now = new Date().toISOString()
      const today = now.split('T')[0]
      const autorNome = loggedUser?.nome || 'Usuário'
      const motivo = motivoPerdaTexto.trim() || `Perdido por: ${categoriaPerdaSel}`
      const extras: Partial<Cliente> = {
        motivoPerda: motivo,
        categoriaPerda: categoriaPerdaSel || 'outro',
        dataPerda: today,
        etapaAnterior: fromStage,
        ...(fromStage === 'negociacao' ? { statusFollowUp: 'perdido_negociacao' } : {}),
      }

      // Mover para perdido direto via db (sem movingRef lock)
      try {
        await db.moverClienteAtomico(clienteOriginal.id, 'perdido', fromStage, now, extras)
        clientesRef.current.atuais = clientesRef.current.atuais.map(c => c.id === clienteOriginal.id ? { ...c, ...extras, etapa: 'perdido' } : c)
        setClientes(prev => prev.map(c => c.id === clienteOriginal.id
          ? { ...c, etapa: 'perdido', etapaAnterior: fromStage, ...extras, dataEntradaEtapa: now }
          : c
        ))
        // Registrar na timeline quem marcou Perdido, etapa de origem, motivo e observação (sai na exportação/análise)
        try {
          const savedInter = await db.insertInteracao({
            clienteId: clienteOriginal.id,
            tipo: 'nota',
            data: now,
            assunto: `Marcado como Perdido (${stageLabels[fromStage] || fromStage})`,
            descricao: `[PERDA_REGISTRADA] Etapa de origem: ${stageLabels[fromStage] || fromStage} | Motivo: ${categoriaPerdaSel || 'outro'} | Observação: ${motivo} | Marcado por: ${autorNome}`,
            automatico: true,
          })
          setInteracoes(prev => [savedInter, ...prev])
        } catch { /* non-critical */ }
      } catch (e) {
        logger.error('Erro ao mover para perdido:', e)
        draggedItemRef.current = null; setDraggedItemState(null); setPendingDrop(null); setShowMotivoPerda(false); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro')
        return
      }

      // Regra oficial Rodada 3 (Item 3): Perdido em qualquer etapa abre automaticamente novo ciclo em Proposta (funil 100% fechado)
      if (!existeCardAtivo(clienteOriginal, ['proposta', 'negociacao'])) {
        const novoCliente = buildNovoCicloCliente(clienteOriginal, 'proposta', loggedUser?.id, { etapaAnterior: 'perdido' })
        try {
          const clienteCriado = await inserirNovoCiclo(clienteOriginal, novoCliente)
          setClientes(prev => [...prev, { ...clienteCriado, historicoEtapas: clienteOriginal.historicoEtapas || [] }])
          addNotificacao('info', '🔄 Novo ciclo criado', `${clienteOriginal.razaoSocial} foi aberto em Proposta para novo ciclo de vendas.`, clienteCriado.id)
          await copiarHistoricoETarefas(clienteOriginal.id, clienteCriado.id, clienteOriginal.historicoEtapas || [], tarefas, setTarefas)
        } catch (e) {
          logger.error('Erro ao criar novo ciclo:', e)
        }
      }
      } finally { movingRef.current = false }
    }
    draggedItemRef.current = null; setDraggedItemState(null); setPendingDrop(null); setShowMotivoPerda(false); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro')
  }

  const confirmAmostra = async () => {
    const item = draggedItemRef.current
    if (item) {
      draggedItemRef.current = null
      const isRetry = item.fromStage === 'amostra_perdida'
      const tentativa = isRetry ? Math.max((item.cliente.tentativaAmostra || 1) + 1, 2) : Math.max(item.cliente.tentativaAmostra || 0, 1)
      const clienteOriginal = item.cliente
      // moverCliente já cria automaticamente o card em Proposta quando parte de prospecção/proposta
      await moverCliente(clienteOriginal.id, 'amostra', {
        dataEnvioAmostra: modalAmostraData,
        statusAmostra: 'solicitada',
        tentativaAmostra: tentativa,
        resultadoAmostra: undefined,
        dataResultadoAmostra: undefined,
        motivoReprovacao: undefined,
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowModalAmostra(false)
  }

  const confirmSatisfacao = () => {
    if (draggedItem) {
      // Regra oficial Rodada 3.1 (Item 1b): após a coleta de satisfação, o card permanece em Follow-up com status "Finalizado" (oculto por padrão)
      moverCliente(draggedItem.cliente.id, 'follow_up', {
        statusSatisfacao: modalSatisfacaoNota >= 4 ? 'satisfeito' : 'insatisfeito',
        notaSatisfacao: modalSatisfacaoNota,
        feedbackSatisfacao: modalSatisfacaoFeedback.trim() || undefined,
        statusFollowUp: 'concluido',
        totalCompras: (draggedItem.cliente.totalCompras || 0) + 1,
        dataUltimoPedido: new Date().toISOString().split('T')[0],
        dataProximaRecompra: new Date(Date.now() + (draggedItem.cliente.cicloRecompra || 60) * 86400000).toISOString().split('T')[0],
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowModalSatisfacao(false); setModalSatisfacaoNota(5); setModalSatisfacaoFeedback('')
  }

  const confirmProposta = (extraNegociacao?: Partial<Cliente>) => {
    if (draggedItem) {
      moverCliente(draggedItem.cliente.id, 'negociacao', {
        valorProposta: Number(modalPropostaValor) || draggedItem.cliente.valorEstimado || 0,
        dataProposta: new Date().toISOString().split('T')[0],
        ...extraNegociacao,
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowModalProposta(false); setModalPropostaValor('')
  }

  // Cria um NOVO card (nova linha em clientes) para um novo ciclo de vendas,
  // preservando o card original no funil. Usado quando um novo ciclo é iniciado
  // a partir de um card existente (ex.: cliente em follow_up) — antes o fluxo
  // movia o próprio card antigo, "linkando" o ciclo novo ao antigo.
  const criarNovoCiclo = async (
    cliente: Cliente,
    extras: Partial<Cliente> = {},
    etapa: string = 'negociacao',
  ): Promise<Cliente> => {
    const now = new Date().toISOString()
    const novoCard = buildNovoCicloCliente(cliente, etapa, loggedUser?.id, extras)
    let cardCriado: Cliente
    try {
      cardCriado = await inserirNovoCiclo(cliente, novoCard)
    } catch (e: any) {
      logger.error('Falha ao inserir card de novo ciclo:', e)
      const msg = e?.message || e?.details || e?.hint || 'Erro desconhecido ao criar card no banco'
      throw new Error(msg)
    }
    const entradaHistorico: HistoricoEtapa = { etapa, de: cliente.etapa, data: now }
    try { await db.insertHistoricoEtapa(cardCriado.id, entradaHistorico) } catch { /* non-critical */ }
    setClientes(prev => [...prev, {
      ...cardCriado,
      historicoEtapas: [...(cliente.historicoEtapas || []), entradaHistorico],
    }])
    // Marca o card original para não oferecer "novo ciclo" novamente — apenas
    // quando o ciclo anterior já terminou (não sobrescreve status logístico
    // de pedido ainda em andamento: faturado, expedido, entregue etc.)
    const statusCicloTerminado = !cliente.statusFollowUp || ['concluido', 'satisfacao_pendente', 'novo_ciclo_iniciado'].includes(cliente.statusFollowUp)
    if (cliente.etapa === 'follow_up' && statusCicloTerminado && cliente.statusFollowUp !== 'novo_ciclo_iniciado') {
      try {
        await db.updateCliente(cliente.id, { statusFollowUp: 'novo_ciclo_iniciado' })
        setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, statusFollowUp: 'novo_ciclo_iniciado' } : c))
      } catch { /* non-critical */ }
    }
    await copiarHistoricoETarefas(cliente.id, cardCriado.id, cliente.historicoEtapas || [], tarefas, setTarefas)
    addNotificacao('info', '🔄 Novo ciclo criado', `Card de ${cliente.razaoSocial} criado em ${stageLabels[etapa] || etapa} para um novo ciclo de vendas.`, cardCriado.id)
    return cardCriado
  }

  return {
    // Drag & drop
    draggedItem, setDraggedItem,
    handleDragStart, handleDragOver, handleDrop,
    // Transição de etapa (drag ou menu mobile)
    requestStageMove,
    // Mover cliente
    moverCliente,
    // Quick actions & campaigns
    handleQuickAction, scheduleJob, runJobNow, startCampanha,
    // Modal: Motivo de Perda
    showMotivoPerda, setShowMotivoPerda,
    motivoPerdaTexto, setMotivoPerdaTexto,
    categoriaPerdaSel, setCategoriaPerdaSel,
    confirmPerda,
    // Modal: Amostra
    showModalAmostra, setShowModalAmostra,
    modalAmostraData, setModalAmostraData,
    confirmAmostra,
    // Modal: Proposta
    showModalProposta, setShowModalProposta,
    modalPropostaValor, setModalPropostaValor,
    confirmProposta,
    // Novo ciclo (cria card novo em vez de mover o antigo)
    criarNovoCiclo,
    // Modal: Satisfação
    showModalSatisfacao, setShowModalSatisfacao,
    modalSatisfacaoNota, setModalSatisfacaoNota,
    modalSatisfacaoFeedback, setModalSatisfacaoFeedback,
    confirmSatisfacao,
    // Panel
    selectedClientePanel, setSelectedClientePanel,
    // Transição inválida toast
    transicaoInvalida, setTransicaoInvalida,
    // Pending drop (for panel triggers)
    pendingDrop, setPendingDrop,
  }
}
