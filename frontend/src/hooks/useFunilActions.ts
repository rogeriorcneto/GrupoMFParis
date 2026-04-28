import { useState, useRef } from 'react'
import type { Cliente, Interacao, Atividade, Vendedor, Tarefa, JobAutomacao, Campanha, Cadencia, HistoricoEtapa } from '../types'
import * as db from '../lib/database'
import { stageLabels, transicoesPermitidas } from '../utils/constants'
import { logger } from '../utils/logger'

interface DragItem { cliente: Cliente; fromStage: string }

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
}

export function useFunilActions({
  clientes, setClientes, interacoes, setInteracoes, loggedUser,
  setAtividades, addNotificacao, jobs, setJobs, campanhas, setCampanhas,
  cadencias, tarefas, setTarefas, loadAllData
}: UseFunilActionsParams) {
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null)
  const [pendingDrop, setPendingDrop] = useState<{ e: React.DragEvent, toStage: string } | null>(null)
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
    const cliente = clientes.find(c => c.id === clienteId)
    if (!cliente) return

    const fromStage = cliente.etapa || ''
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
    } catch (err) {
      logger.error('Erro ao persistir movimento de cliente:', err)
      setClientes(prev => prev.map(c => c.id === clienteId ? previousSnapshot : c))
      try {
        await loadAllData()
      } catch (reloadErr) {
        logger.error('Erro ao recarregar dados após rollback:', reloadErr)
      }
      addNotificacao('error', 'Falha ao mover cliente', `Não foi possível mover ${previousSnapshot.razaoSocial}. O funil foi restaurado.`)
      return
    }

    // Atividade é importante, mas não deve invalidar a transição já persistida
    try {
      const savedAtiv = await db.insertAtividade({ tipo: 'moveu', descricao: `${cliente.razaoSocial} movido para ${stageLabels[toStage] || toStage}`, vendedorNome: loggedUser?.nome || 'Sistema', timestamp: now })
      setAtividades(prev => [savedAtiv, ...prev])
    } catch (err) {
      logger.error('Erro ao registrar atividade de movimento:', err)
    }

    // Item 3: Tarefas automáticas ao mover etapa
    const nome = cliente?.razaoSocial || 'Cliente'
    const dataDaqui = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().split('T')[0]
    const tarefaDefs: Omit<Tarefa, 'id'>[] = []
    if (toStage === 'amostra') {
      tarefaDefs.push({ titulo: `Follow-up amostra — ${nome}`, descricao: 'Verificar se o cliente recebeu e analisou a amostra', data: dataDaqui(20), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
      tarefaDefs.push({ titulo: `Cobrar resultado amostra — ${nome}`, descricao: 'Prazo de 45 dias se aproximando. Cobrar retorno urgente.', data: dataDaqui(40), hora: '09:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
    }
    if (toStage === 'proposta') {
      tarefaDefs.push({ titulo: `Preparar proposta — ${nome}`, descricao: 'Amostra aprovada. Preparar e enviar proposta comercial.', data: dataDaqui(5), hora: '10:00', tipo: 'reuniao', status: 'pendente', prioridade: 'alta', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
      tarefaDefs.push({ titulo: `Follow-up proposta — ${nome}`, descricao: 'Verificar se o cliente analisou a proposta.', data: dataDaqui(15), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
    }
    if (toStage === 'negociacao') {
      tarefaDefs.push({ titulo: `Cobrar resposta proposta — ${nome}`, descricao: 'Verificar retorno da proposta comercial enviada.', data: dataDaqui(7), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
    }
    if (toStage === 'follow_up') {
      tarefaDefs.push({ titulo: `Acompanhar logística — ${nome}`, descricao: 'Pedido aprovado. Acompanhar produção e entrega.', data: dataDaqui(7), hora: '11:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
      tarefaDefs.push({ titulo: `Coletar satisfação — ${nome}`, descricao: 'Após entrega, avaliar satisfação do cliente.', data: dataDaqui(30), hora: '14:00', tipo: 'email', status: 'pendente', prioridade: 'media', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
      tarefaDefs.push({ titulo: `Preparar proposta comercial — ${nome}`, descricao: 'Cliente em Follow-up. Preparar nova proposta para próximo ciclo de compra.', data: dataDaqui(15), hora: '09:00', tipo: 'reuniao', status: 'pendente', prioridade: 'alta', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
    }
    if (toStage === 'amostra_perdida') {
      tarefaDefs.push({ titulo: `Avaliar 2ª tentativa amostra — ${nome}`, descricao: 'Amostra reprovada. Avaliar se vale tentar novamente.', data: dataDaqui(3), hora: '10:00', tipo: 'reuniao', status: 'pendente', prioridade: 'alta', clienteId, vendedorId: cliente?.vendedorId || loggedUser?.id })
    }
    if (tarefaDefs.length > 0) {
      try {
        const savedTarefas = await Promise.all(tarefaDefs.map(t => db.insertTarefa(t)))
        setTarefas(prev => [...savedTarefas, ...prev])
      } catch (err) { logger.error('Erro ao criar tarefas automáticas:', err) }
    }

    // Novo ciclo automático: ao concluir o follow-up, duplicar card em Proposta
    if (extras.statusFollowUp === 'concluido') {
      const clienteAtualizado = { ...cliente, ...extras, etapa: toStage }
      const novoCard: Omit<Cliente, 'id'> = {
        ...clienteAtualizado,
        etapa: 'proposta',
        etapaAnterior: 'follow_up',
        novoCiclo: true,
        cicloNumero: (clienteAtualizado.cicloNumero || 1) + 1,
        statusFollowUp: undefined,
        statusAmostra: undefined,
        statusEntrega: undefined,
        statusFaturamento: undefined,
        statusSatisfacao: undefined,
        valorEstimado: undefined,
        valorProposta: undefined,
        dataProposta: undefined,
        dataEntradaEtapa: new Date().toISOString(),
        historicoEtapas: [],
        vendedorId: loggedUser?.id || clienteAtualizado.vendedorId,
      }
      try {
        const cardCriado = await db.insertCliente(novoCard)
        setClientes(prev => [...prev, cardCriado])
        addNotificacao('info', '🔄 Novo ciclo criado', `Card de ${cliente.razaoSocial} criado em Proposta para o próximo ciclo de vendas.`, cardCriado.id)
      } catch (e) {
        logger.error('Erro ao criar novo ciclo automático:', e)
      }
    }
    } finally { movingRef.current = false }
  }

  const handleDrop = (e: React.DragEvent, toStage: string) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.fromStage === toStage) { setDraggedItem(null); return }

    const isGerente = loggedUser?.cargo === 'gerente'
    const permitidas = transicoesPermitidas[draggedItem.fromStage] || []
    if (!isGerente && !permitidas.includes(toStage)) {
      setTransicaoInvalida(`Não é possível mover de "${stageLabels[draggedItem.fromStage]}" para "${stageLabels[toStage]}". Transições permitidas: ${permitidas.map(s => stageLabels[s]).join(', ')}`)
      setTimeout(() => setTransicaoInvalida(''), 4000)
      setDraggedItem(null)
      return
    }

    // Gerente movendo fora do fluxo normal: mover direto sem modal
    // EXCETO para 'perdido' — sempre abre o modal para registrar motivo e criar novo ciclo
    const isOutOfFlow = !permitidas.includes(toStage)
    if (isGerente && isOutOfFlow && toStage !== 'perdido') {
      moverCliente(draggedItem.cliente.id, toStage, {})
      setDraggedItem(null)
      return
    }

    if (toStage === 'perdido') {
      setPendingDrop({ e, toStage })
      setShowMotivoPerda(true)
      return
    }
    if (toStage === 'amostra') {
      setPendingDrop({ e, toStage })
      setModalAmostraData(new Date().toISOString().split('T')[0])
      setShowModalAmostra(true)
      return
    }
    if (toStage === 'negociacao') {
      setPendingDrop({ e, toStage })
      setModalPropostaValor(draggedItem.cliente.valorEstimado?.toString() || '')
      setShowModalProposta(true)
      return
    }

    // 2ª tentativa de amostra: de amostra_perdida → amostra
    if (toStage === 'amostra' && draggedItem.fromStage === 'amostra_perdida') {
      const tentativa = draggedItem.cliente.tentativaAmostra || 0
      if (tentativa >= 2) {
        setTransicaoInvalida(`${draggedItem.cliente.razaoSocial} já usou as 2 tentativas de amostra. Mova para Perdido.`)
        setTimeout(() => setTransicaoInvalida(''), 5000)
        setDraggedItem(null)
        return
      }
      setPendingDrop({ e, toStage })
      setModalAmostraData(new Date().toISOString().split('T')[0])
      setShowModalAmostra(true)
      return
    }

    const extras: Partial<Cliente> = {}
    if (toStage === 'proposta') { extras.resultadoAmostra = 'aprovada'; extras.dataResultadoAmostra = new Date().toISOString().split('T')[0] }
    if (toStage === 'prospecção') { extras.motivoPerda = undefined; extras.categoriaPerda = undefined; extras.dataPerda = undefined }
    // Lead → Prospecção: notify vendedor
    if (toStage === 'prospecção' && draggedItem.fromStage === 'lead') {
      const vendedorNome = loggedUser?.nome || 'Gerente'
      addNotificacao('info', '🆕 Novo Lead!', `${vendedorNome} enviou um novo lead: ${draggedItem.cliente.razaoSocial}`, draggedItem.cliente.id)
    }
    // Amostra → Amostra Perdida: set reprovada result
    if (toStage === 'amostra_perdida') {
      extras.resultadoAmostra = 'reprovada'
      extras.dataResultadoAmostra = new Date().toISOString().split('T')[0]
    }

    moverCliente(draggedItem.cliente.id, toStage, extras)
    setDraggedItem(null)
  }

  const confirmPerda = async () => {
    if (draggedItem) {
      const extras: Partial<Cliente> = {
        motivoPerda: motivoPerdaTexto.trim() || `Perdido por: ${categoriaPerdaSel}`,
        categoriaPerda: categoriaPerdaSel || 'outro',
        dataPerda: new Date().toISOString().split('T')[0]
      }
      // Se veio de negociação, marca para poder reviver como novo ciclo
      if (draggedItem.fromStage === 'negociacao') {
        extras.statusFollowUp = 'perdido_negociacao'
      }
      await moverCliente(draggedItem.cliente.id, 'perdido', extras)
      
      // Se veio de negociação, cria um novo ciclo (duplica o cliente em proposta)
      if (draggedItem.fromStage === 'negociacao') {
        const clienteOriginal = draggedItem.cliente
        const novoCliente: Omit<Cliente, 'id'> = {
          ...clienteOriginal,
          etapa: 'proposta',
          etapaAnterior: 'perdido',
          novoCiclo: true,
          cicloNumero: (clienteOriginal.cicloNumero || 1) + 1,
          statusFollowUp: undefined,
          motivoPerda: undefined,
          categoriaPerda: undefined,
          dataPerda: undefined,
          valorEstimado: undefined,
          dataProposta: undefined,
          dataEntradaEtapa: new Date().toISOString(),
          historicoEtapas: [],
          vendedorId: loggedUser?.id || clienteOriginal.vendedorId
        }
        try {
          const clienteCriado = await db.insertCliente(novoCliente)
          setClientes(prev => [...prev, clienteCriado])
          addNotificacao('info', 'Novo ciclo criado', `Cliente ${clienteOriginal.razaoSocial} foi duplicado em Proposta para novo ciclo de vendas`, clienteCriado.id)
        } catch (e) {
          console.error('Erro ao criar novo ciclo:', e)
        }
      }
    }
    setDraggedItem(null); setPendingDrop(null); setShowMotivoPerda(false); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro')
  }

  const confirmAmostra = () => {
    if (draggedItem) {
      const isRetry = draggedItem.fromStage === 'amostra_perdida'
      const tentativa = isRetry ? (draggedItem.cliente.tentativaAmostra || 0) + 1 : (draggedItem.cliente.tentativaAmostra || 0)
      moverCliente(draggedItem.cliente.id, 'amostra', {
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

  return {
    // Drag & drop
    draggedItem, setDraggedItem,
    handleDragStart, handleDragOver, handleDrop,
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
