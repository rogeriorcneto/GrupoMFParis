import React, { useMemo, useState } from 'react'
import type { Cliente, Vendedor, Interacao, FunilViewProps } from '../../types'
import { diasDesde, getCardUrgencia, getNextAction, sortCards, prazosEtapa } from '../../utils/funil-logic'
import { stageLabels } from '../../utils/constants'

const AMOSTRAS_STAGES = [
  { title: 'Prospecção', key: 'prospecção', badge: 'bg-blue-100 text-blue-800', icon: '📞', prob: 0.10 },
  { title: 'Amostra', key: 'amostra', badge: 'bg-yellow-100 text-yellow-800', icon: '📦', prob: 0.25 },
  { title: 'Homologado', key: 'homologado', badge: 'bg-green-100 text-green-800', icon: '✅', prob: 0.50 },
  { title: 'Perdido', key: 'perdido', badge: 'bg-red-100 text-red-800', icon: '❌', prob: 0 },
]

const AMOSTRAS_ETAPAS = new Set(['prospecção', 'amostra', 'homologado'])

interface AmostrasViewProps extends FunilViewProps {
  onSolicitarAmostra?: (cliente: Cliente) => void
  onAprovarAmostra?: (cliente: Cliente) => void
  onRejeitarAmostra?: (cliente: Cliente) => void
  moverCliente?: (clienteId: number, toStage: string, extras?: Partial<Cliente>) => void
}

function AmostrasView({
  clientes, vendedores, interacoes, loggedUser,
  onDragStart, onDragOver, onDrop, onQuickAction, onClickCliente,
  isGerente = false,
  onSolicitarAmostra, onAprovarAmostra, onRejeitarAmostra, moverCliente,
}: AmostrasViewProps) {
  const [filterVendedorId, setFilterVendedorId] = useState<number | ''>('')
  const [sortBy, setSortBy] = useState<'urgencia' | 'score' | 'antigo' | 'recente'>('urgencia')
  const [search, setSearch] = useState('')
  const [hidePerdidos, setHidePerdidos] = useState(false)
  const [showSolicitarModal, setShowSolicitarModal] = useState(false)
  const [solicitarCliente, setSolicitarCliente] = useState<Cliente | null>(null)
  const [solicitarMotivo, setSolicitarMotivo] = useState('')

  const vendedorMap = useMemo(() => {
    const m = new Map<number, Vendedor>()
    vendedores.forEach(v => m.set(v.id, v))
    return m
  }, [vendedores])

  const clientesFiltradosVendedor = useMemo(() =>
    filterVendedorId ? clientes.filter(c => c.vendedorId === filterVendedorId) : clientes
  , [clientes, filterVendedorId])

  const clientesFiltrados = useMemo(() => {
    if (!search.trim()) return clientesFiltradosVendedor
    const q = search.toLowerCase()
    return clientesFiltradosVendedor.filter(c =>
      c.razaoSocial.toLowerCase().includes(q) ||
      (c.nomeFantasia || '').toLowerCase().includes(q) ||
      (c.contatoNome || '').toLowerCase().includes(q) ||
      (c.cnpj || '').includes(q)
    )
  }, [clientesFiltradosVendedor, search])

  // Clientes nas etapas de amostras + perdidos que vieram de etapas de amostras
  const clientesAmostras = useMemo(() =>
    clientesFiltrados.filter(c =>
      AMOSTRAS_ETAPAS.has(c.etapa) ||
      (c.etapa === 'perdido' && AMOSTRAS_ETAPAS.has(c.etapaAnterior || ''))
    )
  , [clientesFiltrados])

  const stageMap = useMemo(() => {
    const m = new Map<string, Cliente[]>()
    AMOSTRAS_STAGES.forEach(s => m.set(s.key, []))
    clientesAmostras.forEach(c => {
      const arr = m.get(c.etapa)
      if (arr) arr.push(c)
    })
    return m
  }, [clientesAmostras])

  // Solicitações pendentes de aprovação (para gerente)
  const pendentes = useMemo(() =>
    clientesFiltrados.filter(c => c.statusAmostra === 'pendente_aprovacao' && c.etapa === 'prospecção')
  , [clientesFiltrados])

  // Métricas
  const { totalAmostras, amostrasPendentes, homologados, perdidos } = useMemo(() => ({
    totalAmostras: (stageMap.get('amostra') || []).length,
    amostrasPendentes: pendentes.length,
    homologados: (stageMap.get('homologado') || []).length,
    perdidos: (stageMap.get('perdido') || []).length,
  }), [stageMap, pendentes])

  const urgenciaBorder = (u: string) => {
    if (u === 'critico') return 'border-l-4 border-l-red-500 bg-red-50'
    if (u === 'atencao') return 'border-l-4 border-l-yellow-500 bg-yellow-50'
    return 'bg-gray-50 border border-gray-200'
  }

  const handleSolicitarAmostra = (cliente: Cliente) => {
    setSolicitarCliente(cliente)
    setSolicitarMotivo('')
    setShowSolicitarModal(true)
  }

  const confirmSolicitar = () => {
    if (solicitarCliente && onSolicitarAmostra) {
      onSolicitarAmostra(solicitarCliente)
    }
    setShowSolicitarModal(false)
    setSolicitarCliente(null)
    setSolicitarMotivo('')
  }

  const renderCardInfo = (cliente: Cliente) => {
    const dias = diasDesde(cliente.dataEntradaEtapa)
    switch (cliente.etapa) {
      case 'prospecção':
        return (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[10px] text-gray-500">📅 Há {dias} dia{dias !== 1 ? 's' : ''} em prospecção</p>
            {cliente.diasInativo !== undefined && cliente.diasInativo > 7 && <p className="text-[10px] text-orange-600 font-medium">⚠️ {cliente.diasInativo}d sem interação</p>}
            {cliente.statusAmostra === 'pendente_aprovacao' && (
              <span className="inline-block px-2 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full border border-amber-200 animate-pulse">⏳ Aguardando aprovação</span>
            )}
          </div>
        )
      case 'amostra': {
        const diasAmostra = diasDesde(cliente.dataEnvioAmostra || cliente.dataEntradaEtapa)
        const pctPrazo = Math.min((diasAmostra / 30) * 100, 100)
        const diasRestam = Math.max(30 - diasAmostra, 0)
        const statusLabel: Record<string, string> = { enviada: '📤 Enviada', aguardando_resposta: '⏳ Aguardando', aprovada: '✅ Aprovada', rejeitada: '❌ Rejeitada' }
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.statusAmostra && cliente.statusAmostra !== 'pendente_aprovacao' && (
              <p className="text-[10px] font-medium text-gray-700">{statusLabel[cliente.statusAmostra] || cliente.statusAmostra}</p>
            )}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 83 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pctPrazo}%` }} />
              </div>
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
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pctPrazo}%` }} />
              </div>
              <span className={`text-[9px] font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 15 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `${diasRestam}d` : 'Vencido!'}</span>
            </div>
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
            {cliente.etapaAnterior && <p className="text-[10px] text-gray-500">↩ {stageLabels[cliente.etapaAnterior] || cliente.etapaAnterior}</p>}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${pctReconquista >= 100 ? 'bg-green-500' : 'bg-gray-400'}`} style={{ width: `${pctReconquista}%` }} />
              </div>
              <span className={`text-[9px] font-bold ${diasPerdido >= 60 ? 'text-green-600' : 'text-gray-500'}`}>{diasPerdido >= 60 ? '🔄 Reconquistar!' : `${60 - diasPerdido}d`}</span>
            </div>
          </div>
        )
      }
      default: return null
    }
  }

  const alertCount = useMemo(() => clientesAmostras.filter(c => getCardUrgencia(c) !== 'normal').length, [clientesAmostras])

  return (
    <div className="space-y-4">
      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Prospecção</p>
          <p className="text-lg font-bold text-blue-600">{(stageMap.get('prospecção') || []).length}</p>
          <p className="text-[10px] text-gray-500">clientes prospectando</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Amostras Ativas</p>
          <p className="text-lg font-bold text-yellow-600">{totalAmostras}</p>
          <p className="text-[10px] text-gray-500">{amostrasPendentes > 0 ? `${amostrasPendentes} aguardando aprovação` : 'em avaliação'}</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Homologados</p>
          <p className="text-lg font-bold text-green-600">{homologados}</p>
          <p className="text-[10px] text-gray-500">prontos para negociar</p>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Perdidos</p>
          <p className="text-lg font-bold text-red-600">{perdidos}</p>
          <p className="text-[10px] text-gray-500">durante processo de amostra</p>
        </div>
      </div>

      {/* Solicitações Pendentes (só para gerente) */}
      {isGerente && pendentes.length > 0 && (
        <div className="bg-amber-50 rounded-apple shadow-apple-sm border-2 border-amber-300 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔔</span>
            <h3 className="font-semibold text-amber-900 text-sm">Solicitações de Amostra Pendentes ({pendentes.length})</h3>
          </div>
          <div className="space-y-2">
            {pendentes.map(cliente => {
              const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
              return (
                <div key={cliente.id} className="bg-white rounded-apple border border-amber-200 p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm text-gray-900 truncate">{cliente.razaoSocial}</h4>
                      {vendedor && <span className="text-[10px] text-primary-500 font-medium flex-shrink-0">{vendedor.nome.split(' ')[0]}</span>}
                    </div>
                    <p className="text-xs text-gray-500">{cliente.contatoNome} · {cliente.cnpj || 'Sem CNPJ'}</p>
                    {cliente.valorEstimado && <p className="text-xs font-bold text-primary-600">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-3">
                    <button
                      onClick={() => onAprovarAmostra?.(cliente)}
                      className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700 transition-colors"
                    >
                      ✅ Aprovar
                    </button>
                    <button
                      onClick={() => onRejeitarAmostra?.(cliente)}
                      className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded-apple hover:bg-red-200 transition-colors border border-red-200"
                    >
                      ❌ Rejeitar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-2">
        {/* Search bar */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar clientes em amostras... (nome, fantasia, CNPJ)"
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-1">✕</button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
              <option value="antigo">⏳ Ordenar: Mais Antigos</option>
              <option value="recente">🆕 Ordenar: Mais Recentes</option>
            </select>
            <button
              onClick={() => setHidePerdidos(v => !v)}
              className={`px-3 py-1.5 rounded-apple text-sm font-medium border transition-colors ${hidePerdidos ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              {hidePerdidos ? '👁 Mostrar Perdidos' : '🙈 Ocultar Perdidos'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {alertCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-apple px-3 py-1.5 flex items-center gap-2">
                <span>🚨</span>
                <p className="text-xs text-red-800"><span className="font-bold">{alertCount}</span> com prazo vencendo</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div className={`flex lg:grid gap-3 overflow-x-auto pb-2 snap-x snap-mandatory lg:overflow-x-visible lg:pb-0 ${hidePerdidos ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {AMOSTRAS_STAGES.filter(s => !(hidePerdidos && s.key === 'perdido')).map((stage) => {
          const stageClientes = sortCards(stageMap.get(stage.key) || [], sortBy)
          const stageValor = stageClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
          return (
            <div key={stage.title} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 min-w-[260px] sm:min-w-[280px] lg:min-w-0 snap-start flex-shrink-0 lg:flex-shrink" onDragOver={onDragOver} onDrop={(e) => onDrop(e, stage.key)}>
              <div className="p-3">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="font-medium text-gray-900 text-sm">{stage.icon} {stage.title}</h3>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${stage.badge}`}>{stageClientes.length}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500">R$ {stageValor.toLocaleString('pt-BR')}</p>
                  {stage.prob > 0 && <p className="text-[10px] text-gray-400">{Math.round(stage.prob * 100)}%</p>}
                </div>
                <div className="space-y-2 min-h-[200px] lg:min-h-[300px] max-h-[calc(100vh-380px)] overflow-y-auto">
                  {stageClientes.map((cliente) => {
                    const urgencia = getCardUrgencia(cliente)
                    const nextAction = getNextAction(cliente)
                    const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
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
                        {/* Action buttons */}
                        <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Solicitar amostra button (prospecção only, not yet requested) */}
                          {stage.key === 'prospecção' && cliente.statusAmostra !== 'pendente_aprovacao' && !isGerente && (
                            <button onClick={(e) => { e.stopPropagation(); handleSolicitarAmostra(cliente) }} className="px-1.5 py-0.5 text-[9px] bg-amber-100 text-amber-700 rounded hover:bg-amber-200 font-medium" title="Solicitar Amostra">📦 Solicitar</button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'whatsapp', 'contato') }} className="px-1.5 py-0.5 text-[9px] bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium" title="WhatsApp">💬</button>
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'email', 'contato') }} className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium" title="Email">📧</button>
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'ligacao', 'contato') }} className="px-1.5 py-0.5 text-[9px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200 font-medium" title="Ligar">📞</button>
                        </div>
                      </div>
                    )
                  })}
                  {stageClientes.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">{stage.key === 'prospecção' ? 'Nenhum prospect' : 'Arraste clientes aqui'}</div>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal Solicitar Amostra */}
      {showSolicitarModal && solicitarCliente && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowSolicitarModal(false)}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">📦 Solicitar Aprovação de Amostra</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{solicitarCliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo / Observação</label>
            <textarea
              value={solicitarMotivo}
              onChange={(e) => setSolicitarMotivo(e.target.value)}
              rows={3}
              placeholder="Ex: Cliente demonstrou interesse nos produtos X e Y, solicita amostra para teste..."
              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm resize-none"
            />
            <p className="text-xs text-gray-500 mb-4">A solicitação será enviada ao gerente para aprovação. Após aprovada, o cliente será movido para a etapa de Amostra.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowSolicitarModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmSolicitar} className="px-4 py-2 bg-amber-600 text-white rounded-apple hover:bg-amber-700 text-sm font-medium">Enviar Solicitação</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AmostrasView
