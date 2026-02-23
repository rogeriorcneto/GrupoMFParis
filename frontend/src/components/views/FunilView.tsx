import React from 'react'
import type { Cliente, Vendedor, Interacao, FunilViewProps } from '../../types'

function FunilView({ clientes, vendedores, interacoes, loggedUser, onDragStart, onDragOver, onDrop, onQuickAction, onClickCliente, isGerente = false }: FunilViewProps & { onClickCliente?: (c: Cliente) => void; isGerente?: boolean }) {
  const [filterVendedorId, setFilterVendedorId] = React.useState<number | ''>('')
  const [sortBy, setSortBy] = React.useState<'urgencia' | 'score' | 'valor'>('urgencia')

  const stages = [
    { title: 'Prospecção', key: 'prospecção', color: 'blue', icon: '📞', prob: 0.10 },
    { title: 'Amostra', key: 'amostra', color: 'yellow', icon: '📦', prob: 0.25 },
    { title: 'Homologado', key: 'homologado', color: 'green', icon: '✅', prob: 0.50 },
    { title: 'Negociação', key: 'negociacao', color: 'purple', icon: '💰', prob: 0.75 },
    { title: 'Pós-Venda', key: 'pos_venda', color: 'pink', icon: '🚚', prob: 0.95 },
    { title: 'Perdido', key: 'perdido', color: 'red', icon: '❌', prob: 0 }
  ]

  const prazosEtapa: Record<string, number> = { amostra: 30, homologado: 75, negociacao: 45 }

  const diasDesde = (dateStr?: string) => {
    if (!dateStr) return 0
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  }

  const clientesFiltrados = filterVendedorId ? clientes.filter(c => c.vendedorId === filterVendedorId) : clientes

  const activeClientes = clientesFiltrados.filter(c => c.etapa !== 'perdido')
  const totalPipeline = activeClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
  const receitaPonderada = stages.reduce((total, stage) => {
    const stgClientes = clientesFiltrados.filter(c => c.etapa === stage.key)
    return total + stgClientes.reduce((s, c) => s + (c.valorEstimado || 0) * stage.prob, 0)
  }, 0)
  const taxaConversao = clientes.length > 0 ? Math.round((clientesFiltrados.filter(c => c.etapa === 'pos_venda').length / Math.max(clientesFiltrados.filter(c => c.etapa !== 'perdido').length, 1)) * 100) : 0
  const tempoMedio = (() => {
    const comHistorico = clientesFiltrados.filter(c => c.historicoEtapas && c.historicoEtapas.length > 1)
    if (comHistorico.length === 0) return 0
    const totalDias = comHistorico.reduce((s, c) => {
      const h = c.historicoEtapas!
      if (h.length < 2) return s
      const first = new Date(h[0].data).getTime()
      const last = new Date(h[h.length - 1].data).getTime()
      return s + Math.floor((last - first) / 86400000)
    }, 0)
    return Math.round(totalDias / comHistorico.length)
  })()

  const getCardUrgencia = (cliente: Cliente): 'normal' | 'atencao' | 'critico' => {
    const dias = diasDesde(cliente.dataEntradaEtapa)
    const prazo = prazosEtapa[cliente.etapa]
    if (prazo) {
      if (dias >= prazo) return 'critico'
      if (dias >= prazo * 0.83) return 'atencao'
    }
    if ((cliente.diasInativo || 0) > 14) return 'atencao'
    return 'normal'
  }

  const urgenciaBorder = (u: string) => {
    if (u === 'critico') return 'border-l-4 border-l-red-500 bg-red-50'
    if (u === 'atencao') return 'border-l-4 border-l-yellow-500 bg-yellow-50'
    return 'bg-gray-50 border border-gray-200'
  }

  const sortCards = (cards: Cliente[]) => {
    return [...cards].sort((a, b) => {
      if (sortBy === 'urgencia') {
        const urgOrder = { critico: 0, atencao: 1, normal: 2 }
        const diff = urgOrder[getCardUrgencia(a)] - urgOrder[getCardUrgencia(b)]
        if (diff !== 0) return diff
        return (b.score || 0) - (a.score || 0)
      }
      if (sortBy === 'score') return (b.score || 0) - (a.score || 0)
      return (b.valorEstimado || 0) - (a.valorEstimado || 0)
    })
  }

  const getNextAction = (cliente: Cliente): { text: string; color: string } | null => {
    const diasInativo = cliente.diasInativo || 0
    const diasEtapa = diasDesde(cliente.dataEntradaEtapa)
    switch (cliente.etapa) {
      case 'prospecção':
        if (diasInativo > 7) return { text: '📞 Ligar agora — inativo há ' + diasInativo + 'd', color: 'text-orange-600' }
        if (diasInativo > 3) return { text: '💬 Enviar WhatsApp de contato', color: 'text-blue-600' }
        return { text: '📧 Enviar apresentação', color: 'text-green-600' }
      case 'amostra':
        if (diasEtapa >= 25) return { text: '🚨 Cobrar retorno URGENTE', color: 'text-red-600' }
        if (diasEtapa >= 15) return { text: '📞 Follow-up da amostra', color: 'text-orange-600' }
        return { text: '⏳ Aguardar avaliação', color: 'text-gray-500' }
      case 'homologado':
        if (diasEtapa >= 60) return { text: '🚨 Agendar reunião URGENTE', color: 'text-red-600' }
        if (diasEtapa >= 30) return { text: '📞 Cobrar 1º pedido', color: 'text-orange-600' }
        return { text: '🤝 Preparar proposta', color: 'text-green-600' }
      case 'negociacao':
        if (diasEtapa >= 35) return { text: '🚨 Cobrar resposta proposta', color: 'text-red-600' }
        if (diasEtapa >= 14) return { text: '📞 Follow-up proposta', color: 'text-orange-600' }
        return { text: '💬 Aguardar decisão', color: 'text-gray-500' }
      case 'pos_venda': {
        const diasPedido = diasDesde(cliente.dataUltimoPedido)
        if (diasPedido >= 30) return { text: '🛒 Sugerir recompra — ' + diasPedido + 'd', color: 'text-purple-600' }
        if (diasPedido >= 20) return { text: '📞 Pós-venda — satisfação', color: 'text-blue-600' }
        return { text: '✅ Acompanhar entrega', color: 'text-green-600' }
      }
      case 'perdido': {
        const diasPerdido = diasDesde(cliente.dataPerda)
        if (diasPerdido >= 60) return { text: '🔄 Pronto para reconquista!', color: 'text-green-600' }
        if (diasPerdido >= 45) return { text: '⏳ Reconquista em ' + (60 - diasPerdido) + 'd', color: 'text-blue-600' }
        return null
      }
      default: return null
    }
  }

  const renderCardInfo = (cliente: Cliente) => {
    const dias = diasDesde(cliente.dataEntradaEtapa)
    switch (cliente.etapa) {
      case 'prospecção':
        return (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[10px] text-gray-500">📅 Há {dias} dia{dias !== 1 ? 's' : ''} em prospecção</p>
            {cliente.diasInativo !== undefined && cliente.diasInativo > 7 && <p className="text-[10px] text-orange-600 font-medium">⚠️ {cliente.diasInativo}d sem interação</p>}
          </div>
        )
      case 'amostra': {
        const diasAmostra = diasDesde(cliente.dataEnvioAmostra || cliente.dataEntradaEtapa)
        const pctPrazo = Math.min((diasAmostra / 30) * 100, 100)
        const diasRestam = Math.max(30 - diasAmostra, 0)
        const statusLabel: Record<string, string> = { enviada: '📤 Enviada', aguardando_resposta: '⏳ Aguardando', aprovada: '✅ Aprovada', rejeitada: '❌ Rejeitada' }
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.statusAmostra && <p className="text-[10px] font-medium text-gray-700">{statusLabel[cliente.statusAmostra] || cliente.statusAmostra}</p>}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 83 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pctPrazo}%` }} /></div>
              <span className={`text-[9px] font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 5 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `${diasRestam}d` : 'Vencido!'}</span>
            </div>
          </div>
        )
      }
      case 'homologado': {
        const diasHomol = diasDesde(cliente.dataHomologacao || cliente.dataEntradaEtapa)
        const pctPrazo = Math.min((diasHomol / 75) * 100, 100)
        const diasRestam = Math.max(75 - diasHomol, 0)
        return (
          <div className="mt-1.5 space-y-1">
            <p className="text-[10px] text-gray-500">✅ Homologado há {diasHomol}d</p>
            {cliente.proximoPedidoPrevisto && <p className="text-[10px] text-green-700 font-medium">🛒 Pedido prev.: {new Date(cliente.proximoPedidoPrevisto).toLocaleDateString('pt-BR')}</p>}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pctPrazo}%` }} /></div>
              <span className={`text-[9px] font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 15 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `${diasRestam}d` : 'Vencido!'}</span>
            </div>
          </div>
        )
      }
      case 'negociacao': {
        const diasNeg = diasDesde(cliente.dataProposta || cliente.dataEntradaEtapa)
        const pctPrazo = Math.min((diasNeg / 45) * 100, 100)
        const diasRestam = Math.max(45 - diasNeg, 0)
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.valorProposta && <p className="text-[10px] font-bold text-purple-700">💰 R$ {cliente.valorProposta.toLocaleString('pt-BR')}</p>}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 78 ? 'bg-yellow-500' : 'bg-purple-500'}`} style={{ width: `${pctPrazo}%` }} /></div>
              <span className={`text-[9px] font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 10 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `${diasRestam}d` : 'Vencido!'}</span>
            </div>
          </div>
        )
      }
      case 'pos_venda': {
        const statusLabel: Record<string, string> = { preparando: '📋 Preparando', enviado: '🚚 Enviado', entregue: '✅ Entregue' }
        const diasPedido = diasDesde(cliente.dataUltimoPedido)
        const cicloRecompra = 30
        const pctRecompra = Math.min((diasPedido / cicloRecompra) * 100, 100)
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.statusEntrega && <p className="text-[10px] font-medium text-gray-700">{statusLabel[cliente.statusEntrega]}</p>}
            {cliente.dataUltimoPedido && (
              <>
                <p className="text-[10px] text-gray-500">📦 Último pedido: {diasPedido}d atrás</p>
                <div className="flex items-center gap-1">
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pctRecompra >= 100 ? 'bg-purple-500' : pctRecompra >= 67 ? 'bg-blue-500' : 'bg-green-500'}`} style={{ width: `${pctRecompra}%` }} /></div>
                  <span className={`text-[9px] font-bold ${diasPedido >= cicloRecompra ? 'text-purple-600' : 'text-gray-500'}`}>{diasPedido >= cicloRecompra ? '🛒 Recompra!' : `${cicloRecompra - diasPedido}d`}</span>
                </div>
              </>
            )}
          </div>
        )
      }
      case 'perdido': {
        const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
        const diasPerdido = diasDesde(cliente.dataPerda)
        const pctReconquista = Math.min((diasPerdido / 60) * 100, 100)
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.categoriaPerda && <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-red-100 text-red-700 rounded-full">{catLabels[cliente.categoriaPerda]}</span>}
            {cliente.etapaAnterior && <p className="text-[10px] text-gray-500">↩ {cliente.etapaAnterior}</p>}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pctReconquista >= 100 ? 'bg-green-500' : 'bg-gray-400'}`} style={{ width: `${pctReconquista}%` }} /></div>
              <span className={`text-[9px] font-bold ${diasPerdido >= 60 ? 'text-green-600' : 'text-gray-500'}`}>{diasPerdido >= 60 ? '🔄 Reconquistar!' : `${60 - diasPerdido}d`}</span>
            </div>
          </div>
        )
      }
      default: return null
    }
  }

  const alertCount = clientesFiltrados.filter(c => getCardUrgencia(c) !== 'normal').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Pipeline Total</p>
          <p className="text-lg font-bold text-gray-900">R$ {totalPipeline.toLocaleString('pt-BR')}</p>
          <p className="text-[10px] text-gray-500">{activeClientes.length} leads ativos</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Receita Prevista</p>
          <p className="text-lg font-bold text-green-600">R$ {Math.round(receitaPonderada).toLocaleString('pt-BR')}</p>
          <p className="text-[10px] text-gray-500">Ponderada por probabilidade</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Taxa Conversão</p>
          <p className="text-lg font-bold text-primary-600">{taxaConversao}%</p>
          <p className="text-[10px] text-gray-500">Leads → Pós-Venda</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Tempo Médio</p>
          <p className="text-lg font-bold text-purple-600">{tempoMedio}d</p>
          <p className="text-[10px] text-gray-500">Ciclo de venda</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {isGerente && (
            <select value={filterVendedorId} onChange={(e) => setFilterVendedorId(e.target.value ? Number(e.target.value) : '')} className="px-3 py-1.5 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">👥 Todos os vendedores</option>
              {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          )}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-3 py-1.5 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="urgencia">🔥 Ordenar: Urgência</option>
            <option value="score">⭐ Ordenar: Score</option>
            <option value="valor">💰 Ordenar: Valor</option>
          </select>
        </div>
        {alertCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-apple px-3 py-1.5 flex items-center gap-2">
            <span>🚨</span>
            <p className="text-xs text-red-800"><span className="font-bold">{alertCount}</span> com prazo vencendo</p>
          </div>
        )}
      </div>

      <div className="flex lg:grid lg:grid-cols-6 gap-3 overflow-x-auto pb-2 snap-x snap-mandatory lg:overflow-x-visible lg:pb-0">
        {stages.map((stage) => {
          const stageClientes = sortCards(clientesFiltrados.filter(c => c.etapa === stage.key))
          const stageValor = stageClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
          const stageWeighted = Math.round(stageValor * stage.prob)
          return (
            <div key={stage.title} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 min-w-[260px] sm:min-w-[280px] lg:min-w-0 snap-start flex-shrink-0 lg:flex-shrink" onDragOver={onDragOver} onDrop={(e) => onDrop(e, stage.key)}>
              <div className="p-3">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="font-medium text-gray-900 text-sm">{stage.icon} {stage.title}</h3>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full bg-${stage.color}-100 text-${stage.color}-800`}>{stageClientes.length}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500">R$ {stageValor.toLocaleString('pt-BR')}</p>
                  {stage.prob > 0 && <p className="text-[10px] text-gray-400">{Math.round(stage.prob * 100)}% → R$ {stageWeighted.toLocaleString('pt-BR')}</p>}
                </div>
                <div className="space-y-2 min-h-[200px] lg:min-h-[300px] max-h-[calc(100vh-340px)] overflow-y-auto">
                  {stageClientes.map((cliente) => {
                    const urgencia = getCardUrgencia(cliente)
                    const nextAction = getNextAction(cliente)
                    const vendedor = vendedores.find(v => v.id === cliente.vendedorId)
                    return (
                      <div key={cliente.id} className={`p-2.5 rounded-apple ${isGerente ? 'cursor-move' : 'cursor-pointer'} hover:shadow-apple transition-all duration-200 ${urgenciaBorder(urgencia)} group`} draggable={isGerente} onDragStart={(e) => isGerente ? onDragStart(e, cliente, stage.key) : e.preventDefault()} onClick={() => onClickCliente?.(cliente)}>
                        <div className="flex items-start justify-between">
                          <h4 className="font-semibold text-xs text-gray-900 leading-tight">{cliente.razaoSocial}</h4>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {urgencia !== 'normal' && <span className="text-xs">{urgencia === 'critico' ? '🔴' : '🟡'}</span>}
                            {cliente.score !== undefined && <span className="text-[9px] font-bold text-gray-400">{cliente.score}</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-gray-500">{cliente.contatoNome}</p>
                          {vendedor && <span className="text-[9px] text-primary-500 font-medium">{vendedor.nome.split(' ')[0]}</span>}
                        </div>
                        {cliente.valorEstimado && <p className="text-[10px] font-bold text-primary-600">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p>}
                        {renderCardInfo(cliente)}
                        {nextAction && <p className={`text-[10px] font-medium mt-1 ${nextAction.color}`}>{nextAction.text}</p>}
                        {cliente.produtosInteresse && cliente.produtosInteresse.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {cliente.produtosInteresse.slice(0, 2).map(p => (<span key={p} className="px-1 py-0.5 text-[9px] bg-primary-50 text-primary-700 rounded-full border border-primary-100 truncate max-w-[90px]">{p}</span>))}
                            {cliente.produtosInteresse.length > 2 && <span className="text-[9px] text-gray-400">+{cliente.produtosInteresse.length - 2}</span>}
                          </div>
                        )}
                        <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'whatsapp', 'contato') }} className="px-1.5 py-0.5 text-[9px] bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium" title="WhatsApp">💬</button>
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'email', 'contato') }} className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium" title="Email">📧</button>
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'ligacao', 'contato') }} className="px-1.5 py-0.5 text-[9px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200 font-medium" title="Ligar">📞</button>
                        </div>
                      </div>
                    )
                  })}
                  {stageClientes.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Arraste clientes aqui</div>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FunilView
