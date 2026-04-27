import React from 'react'
import type { Cliente, Vendedor, Produto, Pedido, ItemPedido, PropostaHistorico } from '../types'
import { PAYMENT_TERM_GROUPS, DEFAULT_PAYMENT_TERM } from '../constants/paymentTerms'
import { gerarPropostaPDF } from '../utils/pdfGenerator'
import { savePropostaHistorico, fetchPropostasByCliente } from '../lib/database'

interface DragItem {
  cliente: Cliente
  fromStage: string
}

interface FunilModalsProps {
  // Motivo Perda
  showMotivoPerda: boolean
  setShowMotivoPerda: (v: boolean) => void
  motivoPerdaTexto: string
  setMotivoPerdaTexto: (v: string) => void
  categoriaPerdaSel: NonNullable<Cliente['categoriaPerda']>
  setCategoriaPerdaSel: (v: NonNullable<Cliente['categoriaPerda']>) => void
  confirmPerda: () => void
  loggedUser?: Vendedor | null
  // Amostra
  showModalAmostra: boolean
  setShowModalAmostra: (v: boolean) => void
  modalAmostraData: string
  setModalAmostraData: (v: string) => void
  confirmAmostra: () => void
  // Proposta
  showModalProposta: boolean
  setShowModalProposta: (v: boolean) => void
  modalPropostaValor: string
  setModalPropostaValor: (v: string) => void
  confirmProposta: (extraNegociacao?: Partial<Cliente>) => void
  // Shared
  draggedItem: DragItem | null
  setDraggedItem: (v: DragItem | null) => void
  setPendingDrop: (v: any) => void
  produtos?: Produto[]
  clientes?: Cliente[]
  onAddPedido?: (p: Omit<Pedido, 'id'>) => Promise<void>
  showToast?: (tipo: 'success' | 'error', texto: string) => void
  isNovoCiclo?: boolean
  onCloseNovoCiclo?: () => void
  onClickCliente?: (c: Cliente) => void
}

const perdaCategorias: { key: NonNullable<Cliente['categoriaPerda']>; label: string; active: string }[] = [
  { key: 'preco', label: '💲 Preço', active: 'border-yellow-500 bg-yellow-50 text-yellow-800' },
  { key: 'prazo', label: '⏰ Prazo', active: 'border-orange-500 bg-orange-50 text-orange-800' },
  { key: 'qualidade', label: '⭐ Qualidade', active: 'border-blue-500 bg-blue-50 text-blue-800' },
  { key: 'concorrencia', label: '🏁 Concorrência', active: 'border-red-500 bg-red-50 text-red-800' },
  { key: 'sem_resposta', label: '📵 Sem resposta', active: 'border-gray-500 bg-gray-50 text-gray-800' },
  { key: 'outro', label: '📝 Outro', active: 'border-purple-500 bg-purple-50 text-purple-800' },
]

export default function FunilModals({
  showMotivoPerda, setShowMotivoPerda, motivoPerdaTexto, setMotivoPerdaTexto,
  categoriaPerdaSel, setCategoriaPerdaSel, confirmPerda, loggedUser,
  showModalAmostra, setShowModalAmostra, modalAmostraData, setModalAmostraData, confirmAmostra,
  showModalProposta, setShowModalProposta, modalPropostaValor, setModalPropostaValor, confirmProposta,
  draggedItem, setDraggedItem, setPendingDrop,
  produtos = [], clientes = [], onAddPedido, showToast,
  isNovoCiclo = false, onCloseNovoCiclo, onClickCliente
}: FunilModalsProps) {
  const agora = new Date()
  const dataHoraAtual = `${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  const [pedidoFrete, setPedidoFrete] = React.useState<'CIF' | 'FOB' | ''>('')
  const [pedidoItens, setPedidoItens] = React.useState<ItemPedido[]>([])
  const [pedidoObs, setPedidoObs] = React.useState('')
  const [pedidoSaving, setPedidoSaving] = React.useState(false)
  const [pedidoSearch, setPedidoSearch] = React.useState('')

  React.useEffect(() => {
    if (!showModalAmostra) return
    setPedidoFrete('')
    setPedidoItens([])
    setPedidoObs('')
    setPedidoSearch('')
  }, [showModalAmostra])

  // ── Proposta / Negociação state ──
  const [propostaFrete, setPropostaFrete] = React.useState<'CIF' | 'FOB' | ''>('')
  const [propostaPagamento, setPropostaPagamento] = React.useState(DEFAULT_PAYMENT_TERM)
  const [propostaItens, setPropostaItens] = React.useState<ItemPedido[]>([])
  const [propostaObs, setPropostaObs] = React.useState('')
  const [propostaSearch, setPropostaSearch] = React.useState('')
  const [propostaSaving, setPropostaSaving] = React.useState(false)
  const [propostaTab, setPropostaTab] = React.useState<'itens' | 'historico'>('itens')
  const [propostaHistorico, setPropostaHistorico] = React.useState<PropostaHistorico[]>([])
  const [propostaHistoricoLoading, setPropostaHistoricoLoading] = React.useState(false)

  React.useEffect(() => {
    if (!showModalProposta) return
    setPropostaFrete('')
    setPropostaItens([])
    setPropostaObs('')
    setPropostaSearch('')
    setPropostaPagamento(DEFAULT_PAYMENT_TERM)
    setPropostaTab('itens')
    if (draggedItem?.cliente.id) {
      setPropostaHistoricoLoading(true)
      fetchPropostasByCliente(draggedItem.cliente.id)
        .then(setPropostaHistorico)
        .catch(() => setPropostaHistorico([]))
        .finally(() => setPropostaHistoricoLoading(false))
    }
  }, [showModalProposta])

  const propostaTotal = propostaItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
  const propostaFilteredProdutos = produtos.filter(p => {
    if (!propostaSearch.trim()) return false
    return p.ativo && p.nome.toLowerCase().includes(propostaSearch.toLowerCase())
  })

  const setPropostaItemQtd = (produto: Produto, qtd: number) => {
    if (qtd <= 0) {
      setPropostaItens(prev => prev.filter(i => i.produtoId !== produto.id))
      return
    }
    setPropostaItens(prev => {
      const exists = prev.find(i => i.produtoId === produto.id)
      if (exists) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: qtd } : i)
      return [...prev, { produtoId: produto.id, nomeProduto: produto.nome, sku: produto.omieCodigo || produto.sku || '', preco: produto.preco, unidade: produto.unidade, quantidade: qtd }]
    })
  }

  const handleConfirmNegociacao = async () => {
    if (!draggedItem || propostaSaving) return
    setPropostaSaving(true)
    try {
      const totalFromProducts = propostaItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
      const valorFinal = totalFromProducts > 0 ? totalFromProducts : (Number(modalPropostaValor) || draggedItem.cliente.valorEstimado || 0)
      setModalPropostaValor(String(valorFinal))
      const numero = `PROP-${Date.now().toString().slice(-6)}`
      const vendedorNome = loggedUser?.nome || 'Vendedor'

      // Gerar PDF
      try {
        await gerarPropostaPDF(
          draggedItem.cliente,
          propostaItens,
          propostaObs,
          vendedorNome,
          numero,
          { formaPagamento: propostaPagamento, tipoFrete: propostaFrete as 'CIF' | 'FOB' | '' }
        )
      } catch {
        showToast?.('error', 'Erro ao gerar PDF da proposta.')
      }

      // Salvar no histórico
      try {
        const saved = await savePropostaHistorico({
          numero,
          clienteId: draggedItem.cliente.id,
          vendedorNome,
          itens: propostaItens,
          observacoes: propostaObs,
          frete: propostaFrete || undefined,
          pagamento: propostaPagamento || undefined,
          totalValor: valorFinal,
          criadoEm: new Date().toISOString(),
        })
        setPropostaHistorico(prev => [saved, ...prev])
      } catch {
        // histórico falhou silenciosamente, não bloqueia o fluxo
      }

      if (isNovoCiclo) {
        // Novo ciclo: salvar proposta E mover cliente de follow_up para negociacao
        // para iniciar novo ciclo de vendas
        const extras: Partial<Cliente> = {
          valorProposta: valorFinal,
          dataProposta: new Date().toISOString().split('T')[0],
          statusFollowUp: 'novo_ciclo_iniciado' // marca que iniciou novo ciclo
        }
        if (propostaItens.length > 0) extras.produtosInteresse = propostaItens.map(i => i.nomeProduto)
        const notasParts: string[] = ['🔄 Novo ciclo de vendas iniciado']
        if (propostaFrete) notasParts.push(`Frete: ${propostaFrete}`)
        if (propostaPagamento && propostaPagamento !== DEFAULT_PAYMENT_TERM) notasParts.push(`Pagamento: ${propostaPagamento}`)
        if (propostaObs.trim()) notasParts.push(propostaObs.trim())
        extras.notas = notasParts.join(' | ')
        confirmProposta(extras)
        setShowModalProposta(false)
        onCloseNovoCiclo?.()
        showToast?.('success', `Proposta ${numero} gerada e cliente movido para Negociação!`)
      } else {
        const extras: Partial<Cliente> = { valorProposta: valorFinal }
        if (propostaItens.length > 0) extras.produtosInteresse = propostaItens.map(i => i.nomeProduto)
        const notasParts: string[] = []
        if (propostaFrete) notasParts.push(`Frete: ${propostaFrete}`)
        if (propostaPagamento && propostaPagamento !== DEFAULT_PAYMENT_TERM) notasParts.push(`Pagamento: ${propostaPagamento}`)
        if (propostaObs.trim()) notasParts.push(propostaObs.trim())
        if (notasParts.length > 0) extras.notas = notasParts.join(' | ')
        confirmProposta(extras)
        showToast?.('success', `Proposta ${numero} gerada e salva!`)
      }
    } finally {
      setPropostaSaving(false)
    }
  }

  const handleDownloadPropostaHistorico = async (p: PropostaHistorico) => {
    const cliente = clientes.find(c => c.id === p.clienteId) || draggedItem?.cliente
    if (!cliente) return
    try {
      await gerarPropostaPDF(
        cliente,
        p.itens,
        p.observacoes,
        p.vendedorNome,
        p.numero,
        { formaPagamento: p.pagamento, tipoFrete: p.frete as 'CIF' | 'FOB' | '' }
      )
    } catch {
      showToast?.('error', 'Erro ao baixar PDF.')
    }
  }

  const handleRefazerPedido = (p: PropostaHistorico) => {
    // Copiar itens da proposta histórica para a nova proposta
    setPropostaItens(p.itens.map(i => ({ ...i })))
    if (p.frete) setPropostaFrete(p.frete as 'CIF' | 'FOB')
    if (p.pagamento) setPropostaPagamento(p.pagamento)
    if (p.observacoes) setPropostaObs(p.observacoes)
    setPropostaTab('itens')
    showToast?.('success', `Itens da ${p.numero} copiados para nova proposta!`)
  }

  const pedidoTotal = pedidoItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
  const filteredProdutos = produtos.filter(p => {
    if (!pedidoSearch.trim()) return false
    const q = pedidoSearch.toLowerCase()
    return p.ativo && p.nome.toLowerCase().includes(q)
  })

  const setPedidoItemQtd = (produto: Produto, qtd: number) => {
    if (qtd <= 0) {
      setPedidoItens(prev => prev.filter(i => i.produtoId !== produto.id))
      return
    }
    setPedidoItens(prev => {
      const exists = prev.find(i => i.produtoId === produto.id)
      if (exists) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: qtd } : i)
      return [...prev, { produtoId: produto.id, nomeProduto: produto.nome, sku: produto.omieCodigo || produto.sku || '', preco: produto.preco, unidade: produto.unidade, quantidade: qtd }]
    })
  }

  const setPedidoItemPreco = (produtoId: number, preco: number) => {
    setPedidoItens(prev => prev.map(i => i.produtoId === produtoId ? { ...i, preco: Math.max(0, preco) } : i))
  }

  const setPropostaItemPreco = (produtoId: number, preco: number) => {
    setPropostaItens(prev => prev.map(i => i.produtoId === produtoId ? { ...i, preco: Math.max(0, preco) } : i))
  }

  const handleEnviarAmostraPedido = async () => {
    if (!draggedItem || !onAddPedido || pedidoItens.length === 0 || !pedidoFrete || pedidoSaving) return
    setPedidoSaving(true)
    try {
      const numero = `PED-${Date.now().toString().slice(-6)}`
      await onAddPedido({
        numero,
        clienteId: draggedItem.cliente.id,
        vendedorId: draggedItem.cliente.vendedorId || loggedUser?.id || 0,
        itens: pedidoItens,
        observacoes: pedidoObs.trim(),
        status: 'enviado',
        dataCriacao: new Date().toISOString(),
        dataEnvio: new Date().toISOString(),
        totalValor: pedidoTotal,
        tipo: 'bonificacao',
        tipoFrete: pedidoFrete,
      })
      confirmAmostra()
      showToast?.('success', `Pedido ${numero} de amostra enviado com sucesso`)
    } catch {
      showToast?.('error', 'Falha ao enviar pedido desta amostra.')
    } finally {
      setPedidoSaving(false)
    }
  }

  const cancelPerda = () => { setShowMotivoPerda(false); setDraggedItem(null); setPendingDrop(null); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro') }
  const cancelAmostra = () => { setShowModalAmostra(false); setDraggedItem(null); setPendingDrop(null) }
  const cancelProposta = () => { setShowModalProposta(false); setDraggedItem(null); setPendingDrop(null); setModalPropostaValor(''); if (isNovoCiclo) onCloseNovoCiclo?.() }

  return (
    <>
      {/* Modal Motivo de Perda */}
      {showMotivoPerda && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cancelPerda}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">❌ Marcar como Perdido</h2>
            <div className="mb-4 space-y-1">
              <p className="text-sm text-gray-600">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
              <div className="flex items-center gap-3 text-xs text-gray-400 bg-gray-50 rounded-apple px-3 py-2 border border-gray-200">
                <span>👤 <span className="font-medium text-gray-600">{loggedUser?.nome || 'Usuário'}</span></span>
                <span>·</span>
                <span>🕐 {dataHoraAtual}</span>
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {perdaCategorias.map(cat => (
                <button key={cat.key} onClick={() => setCategoriaPerdaSel(cat.key)}
                  className={`px-2 py-2 text-xs font-medium rounded-apple border-2 transition-all ${categoriaPerdaSel === cat.key ? cat.active : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >{cat.label}</button>
              ))}
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da perda <span className="text-red-500">*</span></label>
            <textarea value={motivoPerdaTexto} onChange={(e) => setMotivoPerdaTexto(e.target.value)} rows={2} placeholder="Descreva o motivo da perda... (obrigatório)" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm resize-none" />
            <div className="flex justify-end gap-3">
              <button onClick={cancelPerda} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmPerda} disabled={!categoriaPerdaSel || !motivoPerdaTexto.trim()} className="px-4 py-2 bg-red-600 text-white rounded-apple hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">Confirmar Perda</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Envio de Amostra — layout duas colunas */}
      {showModalAmostra && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cancelAmostra}>
          <div className="bg-white rounded-apple shadow-apple-lg w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {draggedItem?.fromStage === 'amostra_perdida' ? '🔄 2ª Tentativa de Amostra' : '📦 Enviar Amostra'}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Cliente: <span className="font-medium text-gray-800">{draggedItem?.cliente.razaoSocial}</span></p>
            </div>

            {/* Body — duas colunas */}
            <div className="flex flex-1 overflow-hidden">
              {/* Coluna esquerda: busca e lista de produtos */}
              <div className="flex-1 flex flex-col border-r border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 space-y-3 flex-shrink-0">
                  {draggedItem?.fromStage === 'amostra_perdida' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-apple p-3">
                      <p className="text-xs text-amber-800 font-medium">⚠️ Esta é a 2ª tentativa de amostra.</p>
                      {draggedItem.cliente.motivoReprovacao && <p className="text-xs text-amber-700 mt-0.5">Motivo anterior: {draggedItem.cliente.motivoReprovacao}</p>}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Data de envio</label>
                    <input type="date" value={modalAmostraData} onChange={e => setModalAmostraData(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Tipo de Frete</p>
                    <div className="flex gap-2">
                      <button onClick={() => setPedidoFrete('CIF')} className={`flex-1 py-2 rounded-apple text-sm font-medium border-2 transition-colors ${pedidoFrete === 'CIF' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>📦 CIF (Entrega)</button>
                      <button onClick={() => setPedidoFrete('FOB')} className={`flex-1 py-2 rounded-apple text-sm font-medium border-2 transition-colors ${pedidoFrete === 'FOB' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>🏭 FOB (Retirada)</button>
                    </div>
                  </div>
                  <input type="text" placeholder="🔍 Buscar produto..." value={pedidoSearch} onChange={e => setPedidoSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {!pedidoSearch.trim() && <p className="text-xs text-gray-400 text-center py-6">Digite para buscar produtos do catálogo</p>}
                  {pedidoSearch.trim() && filteredProdutos.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Nenhum produto encontrado</p>}
                  {filteredProdutos.slice(0, 30).map(p => {
                    const qtd = pedidoItens.find(i => i.produtoId === p.id)?.quantidade || 0
                    return (
                      <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-apple border transition-colors ${qtd > 0 ? 'border-primary-300 bg-primary-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{p.nome}</p>
                          <p className="text-[10px] text-gray-500">R$ {p.preco.toFixed(2).replace('.', ',')} / KG</p>
                        </div>
                        <input type="number" min={0} value={qtd || ''} onChange={e => setPedidoItemQtd(p, Math.max(0, parseInt(e.target.value || '0', 10) || 0))} placeholder="Qtd" className="w-16 px-2 py-1 border border-gray-300 rounded-apple text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                    )
                  })}
                </div>
              </div>

                {/* Coluna direita: carrinho fixo */}
              <div className="w-72 flex flex-col bg-gray-50 flex-shrink-0">
                <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">🛒 Itens selecionados</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {pedidoItens.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-8">Nenhum item adicionado</p>
                  )}
                  {pedidoItens.map(item => (
                    <div key={item.produtoId} className="bg-white rounded-apple border border-gray-200 p-2.5">
                      <p className="text-xs font-semibold text-gray-800 leading-tight">{item.nomeProduto}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-gray-500 flex-shrink-0">{item.quantidade}x</span>
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-[10px] text-gray-400">R$</span>
                          <input
                            type="number" min={0} step="0.01"
                            value={item.preco || ''}
                            onChange={e => setPedidoItemPreco(item.produtoId, parseFloat(e.target.value) || 0)}
                            onFocus={e => e.target.select()}
                            placeholder="0,00"
                            className="flex-1 px-1.5 py-1 border border-gray-300 rounded text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                          />
                          <span className="text-[10px] text-gray-400 flex-shrink-0">/KG</span>
                        </div>
                      </div>
                      {item.preco > 0 && (
                        <p className="text-[10px] font-bold text-primary-700 mt-1">= R$ {(item.quantidade * item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-gray-200 flex-shrink-0 space-y-2">
                  <textarea value={pedidoObs} onChange={e => setPedidoObs(e.target.value)} placeholder="Observações..." rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none bg-white" />
                  <div className="flex items-center justify-between py-2 border-t border-gray-200">
                    <span className="text-xs text-gray-600">{pedidoItens.reduce((s, i) => s + i.quantidade, 0)} item(ns)</span>
                    <span className="text-sm font-bold text-gray-900">R$ {pedidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
              <p className="text-xs text-gray-400">Cliente será movido para Amostra após envio</p>
              <div className="flex gap-3">
                <button onClick={cancelAmostra} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
                <button onClick={handleEnviarAmostraPedido} disabled={pedidoItens.length === 0 || !pedidoFrete || pedidoSaving} className="px-5 py-2 bg-yellow-600 text-white rounded-apple hover:bg-yellow-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                  {pedidoSaving ? 'Enviando...' : 'Enviar Amostra'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Negociação — layout duas colunas */}
      {showModalProposta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cancelProposta}>
          <div className="bg-white rounded-apple shadow-apple-lg w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">{isNovoCiclo ? '🔄 Nova Proposta — Novo Ciclo' : '💰 Nova Negociação'}</h2>
              <p className="text-sm text-gray-500 mt-0.5">Cliente: <button
                  onClick={() => draggedItem?.cliente && onClickCliente?.(draggedItem.cliente)}
                  className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline transition-colors"
                  title="Abrir cadastro do cliente"
                >{draggedItem?.cliente.razaoSocial}</button></p>
              {isNovoCiclo && <p className="text-xs text-blue-600 mt-1 font-medium">A proposta será salva sem alterar a etapa do cliente no funil.</p>}
            </div>

            {/* Body — duas colunas */}
            <div className="flex flex-1 overflow-hidden">
              {/* Coluna esquerda: configurações + busca */}
              <div className="flex-1 flex flex-col border-r border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 space-y-3 flex-shrink-0">
                  {/* Frete */}
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Tipo de Frete</p>
                    <div className="flex gap-2">
                      <button onClick={() => setPropostaFrete('CIF')} className={`flex-1 py-2 rounded-apple text-sm font-medium border-2 transition-colors ${propostaFrete === 'CIF' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>📦 CIF (Entrega)</button>
                      <button onClick={() => setPropostaFrete('FOB')} className={`flex-1 py-2 rounded-apple text-sm font-medium border-2 transition-colors ${propostaFrete === 'FOB' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>🏭 FOB (Retirada)</button>
                    </div>
                  </div>
                  {/* Pagamento */}
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Forma de Pagamento</p>
                    <select value={propostaPagamento} onChange={e => setPropostaPagamento(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                      {PAYMENT_TERM_GROUPS.map(group => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  {/* Busca */}
                  <input type="text" placeholder="🔍 Buscar produto..." value={propostaSearch} onChange={e => setPropostaSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {!propostaSearch.trim() && <p className="text-xs text-gray-400 text-center py-6">Digite para buscar produtos do catálogo</p>}
                  {propostaSearch.trim() && propostaFilteredProdutos.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Nenhum produto encontrado</p>}
                  {propostaFilteredProdutos.slice(0, 30).map(p => {
                    const qtd = propostaItens.find(i => i.produtoId === p.id)?.quantidade || 0
                    return (
                      <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-apple border transition-colors ${qtd > 0 ? 'border-primary-300 bg-primary-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{p.nome}</p>
                          <p className="text-[10px] text-gray-500">R$ {p.preco.toFixed(2).replace('.', ',')} / KG</p>
                        </div>
                        <input type="number" min={0} value={qtd || ''} onChange={e => setPropostaItemQtd(p, Math.max(0, parseInt(e.target.value || '0', 10) || 0))} placeholder="Qtd" className="w-16 px-2 py-1 border border-gray-300 rounded-apple text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Coluna direita: abas Itens / Histórico */}
              <div className="w-80 flex flex-col bg-gray-50 flex-shrink-0">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 flex-shrink-0">
                  <button
                    onClick={() => setPropostaTab('itens')}
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${propostaTab === 'itens' ? 'text-purple-700 border-b-2 border-purple-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >🛒 Itens</button>
                  <button
                    onClick={() => setPropostaTab('historico')}
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${propostaTab === 'historico' ? 'text-purple-700 border-b-2 border-purple-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    📋 Histórico
                    {propostaHistorico.length > 0 && (
                      <span className="ml-1 bg-purple-100 text-purple-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{propostaHistorico.length}</span>
                    )}
                  </button>
                </div>

                {propostaTab === 'itens' ? (
                  <>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {propostaItens.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-8">Nenhum item adicionado</p>
                      )}
                      {propostaItens.map(item => (
                        <div key={item.produtoId} className="bg-white rounded-apple border border-gray-200 p-2.5">
                          <p className="text-xs font-semibold text-gray-800 leading-tight">{item.nomeProduto}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-gray-500 flex-shrink-0">{item.quantidade}x</span>
                            <div className="flex items-center gap-1 flex-1">
                              <span className="text-[10px] text-gray-400">R$</span>
                              <input
                                type="number" min={0} step="0.01"
                                value={item.preco || ''}
                                onChange={e => setPropostaItemPreco(item.produtoId, parseFloat(e.target.value) || 0)}
                                onFocus={e => e.target.select()}
                                placeholder="0,00"
                                className="flex-1 px-1.5 py-1 border border-gray-300 rounded text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                              />
                              <span className="text-[10px] text-gray-400 flex-shrink-0">/KG</span>
                            </div>
                          </div>
                          {item.preco > 0 && (
                            <p className="text-[10px] font-bold text-primary-700 mt-1">= R$ {(item.quantidade * item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="p-3 border-t border-gray-200 flex-shrink-0 space-y-2">
                      <textarea value={propostaObs} onChange={e => setPropostaObs(e.target.value)} placeholder="Observações da negociação..." rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none bg-white" />
                      <div className="flex items-center justify-between py-2 border-t border-gray-200">
                        <span className="text-xs text-gray-600">{propostaItens.reduce((s, i) => s + i.quantidade, 0)} item(ns)</span>
                        <span className="text-sm font-bold text-gray-900">R$ {propostaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {propostaHistoricoLoading && (
                      <p className="text-xs text-gray-400 text-center py-8">Carregando histórico...</p>
                    )}
                    {!propostaHistoricoLoading && propostaHistorico.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">Nenhuma proposta gerada ainda</p>
                    )}
                    {!propostaHistoricoLoading && propostaHistorico.map(p => (
                      <div key={p.id} className="bg-white rounded-apple border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800">{p.numero}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {new Date(p.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} · {p.vendedorNome}
                            </p>
                            {p.itens.length > 0 && (
                              <p className="text-[10px] text-gray-500 mt-1 truncate">
                                {p.itens.map(i => `${i.nomeProduto} (${i.quantidade})`).join(', ')}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {p.frete && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{p.frete}</span>}
                              {p.pagamento && <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium truncate max-w-[100px]">{p.pagamento}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-xs font-bold text-purple-700">R$ {p.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleRefazerPedido(p)}
                                className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-semibold rounded-apple transition-colors"
                                title="Copiar itens desta proposta para a nova proposta"
                              >
                                🔄 Refazer
                              </button>
                              <button
                                onClick={() => handleDownloadPropostaHistorico(p)}
                                className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-semibold rounded-apple transition-colors"
                              >
                                ⬇ PDF
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
              <button onClick={cancelProposta} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={handleConfirmNegociacao} disabled={propostaSaving} className="px-5 py-2 bg-purple-600 text-white rounded-apple hover:bg-purple-700 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
                {propostaSaving ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Gerando PDF...</> : '📄 Gerar Proposta PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
