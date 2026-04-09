import React from 'react'
import type { Cliente, Vendedor, Produto, Pedido, ItemPedido } from '../types'
import { PAYMENT_TERM_GROUPS, DEFAULT_PAYMENT_TERM } from '../constants/paymentTerms'

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
  onAddPedido?: (p: Omit<Pedido, 'id'>) => Promise<void>
  showToast?: (tipo: 'success' | 'error', texto: string) => void
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
  produtos = [], onAddPedido, showToast
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

  React.useEffect(() => {
    if (!showModalProposta) return
    setPropostaFrete('')
    setPropostaItens([])
    setPropostaObs('')
    setPropostaSearch('')
    setPropostaPagamento(DEFAULT_PAYMENT_TERM)
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

  const handleConfirmNegociacao = () => {
    if (!draggedItem) return
    const totalFromProducts = propostaItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
    const valorFinal = totalFromProducts > 0 ? totalFromProducts : (Number(modalPropostaValor) || draggedItem.cliente.valorEstimado || 0)
    setModalPropostaValor(String(valorFinal))
    const extras: Partial<Cliente> = {
      valorProposta: valorFinal,
    }
    if (propostaItens.length > 0) extras.produtosInteresse = propostaItens.map(i => i.nomeProduto)
    // Encode frete, payment and observations into notas
    const notasParts: string[] = []
    if (propostaFrete) notasParts.push(`Frete: ${propostaFrete}`)
    if (propostaPagamento && propostaPagamento !== DEFAULT_PAYMENT_TERM) notasParts.push(`Pagamento: ${propostaPagamento}`)
    if (propostaObs.trim()) notasParts.push(propostaObs.trim())
    if (notasParts.length > 0) extras.notas = notasParts.join(' | ')
    confirmProposta(extras)
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
  const cancelProposta = () => { setShowModalProposta(false); setDraggedItem(null); setPendingDrop(null); setModalPropostaValor('') }

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

      {/* Modal Envio de Amostra */}
      {showModalAmostra && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cancelAmostra}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {draggedItem?.fromStage === 'amostra_perdida' ? '🔄 2ª Tentativa de Amostra' : '📦 Enviar Amostra'}
            </h2>
            <p className="text-sm text-gray-600 mb-2">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            {draggedItem?.fromStage === 'amostra_perdida' && (
              <div className="bg-amber-50 border border-amber-200 rounded-apple p-3 mb-3">
                <p className="text-xs text-amber-800 font-medium">⚠️ Esta é a 2ª tentativa de amostra.</p>
                <p className="text-xs text-amber-700">Se não for aprovada desta vez, o cliente será movido para Perdido.</p>
                {draggedItem.cliente.motivoReprovacao && (
                  <p className="text-xs text-amber-700 mt-1">Motivo anterior: <span className="font-medium">{draggedItem.cliente.motivoReprovacao}</span></p>
                )}
              </div>
            )}
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de envio da amostra</label>
            <input type="date" value={modalAmostraData} onChange={(e) => setModalAmostraData(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3 text-sm" />
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900 mb-2"> Tipo de Frete</p>
              <div className="flex gap-2">
                <button onClick={() => setPedidoFrete('CIF')} className={`flex-1 py-2 px-3 rounded-apple text-sm font-medium border-2 transition-colors ${pedidoFrete === 'CIF' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                  📦 CIF (Entrega)
                </button>
                <button onClick={() => setPedidoFrete('FOB')} className={`flex-1 py-2 px-3 rounded-apple text-sm font-medium border-2 transition-colors ${pedidoFrete === 'FOB' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                  🏭 FOB (Retirada)
                </button>
              </div>
            </div>
            <input type="text" placeholder="Buscar produto pelo nome..." value={pedidoSearch} onChange={e => setPedidoSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3" />
            <div className="max-h-44 overflow-y-auto space-y-1 mb-3">
              {!pedidoSearch.trim() && (
                <p className="text-xs text-gray-500 px-2 py-1">Digite o nome do produto para buscar.</p>
              )}
              {pedidoSearch.trim() && filteredProdutos.length === 0 && (
                <p className="text-xs text-gray-500 px-2 py-1">Nenhum produto encontrado.</p>
              )}
              {filteredProdutos.slice(0, 20).map(p => {
                const qtd = pedidoItens.find(i => i.produtoId === p.id)?.quantidade || 0
                return (
                  <div key={p.id} className={`flex items-center gap-2 p-2 rounded-apple border ${qtd > 0 ? 'border-primary-300 bg-primary-50' : 'border-gray-100'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{p.nome}</p>
                      <p className="text-[10px] text-gray-500">R$ {p.preco.toFixed(2).replace('.', ',')} / {p.unidade.toUpperCase()}</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={qtd || ''}
                      onChange={(e) => setPedidoItemQtd(p, Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                      placeholder="Qtd"
                      className="w-20 px-2 py-1 border border-gray-300 rounded-apple text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )
              })}
            </div>
            <textarea value={pedidoObs} onChange={e => setPedidoObs(e.target.value)} placeholder="Observações..." rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none mb-3" />
            {pedidoItens.length > 0 && (
              <div className="mb-3 flex items-center justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>{pedidoItens.reduce((s, i) => s + i.quantidade, 0)} item(ns)</span>
                <span>R$ {pedidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <p className="text-xs text-gray-500 mb-4">Após enviar, o cliente será movido para a etapa Amostra automaticamente.</p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelAmostra} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={handleEnviarAmostraPedido} disabled={pedidoItens.length === 0 || !pedidoFrete || pedidoSaving} className="px-4 py-2 bg-yellow-600 text-white rounded-apple hover:bg-yellow-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                {pedidoSaving ? 'Enviando...' : 'Enviar Pedido e Amostra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Negociação — painel completo com produtos, frete e pagamento */}
      {showModalProposta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cancelProposta}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">💰 Nova Negociação</h2>
            <p className="text-sm text-gray-600 mb-3">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>

            {/* Frete */}
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900 mb-2">Tipo de Frete</p>
              <div className="flex gap-2">
                <button onClick={() => setPropostaFrete('CIF')} className={`flex-1 py-2 px-3 rounded-apple text-sm font-medium border-2 transition-colors ${propostaFrete === 'CIF' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                  📦 CIF (Entrega)
                </button>
                <button onClick={() => setPropostaFrete('FOB')} className={`flex-1 py-2 px-3 rounded-apple text-sm font-medium border-2 transition-colors ${propostaFrete === 'FOB' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                  🏭 FOB (Retirada)
                </button>
              </div>
            </div>

            {/* Pagamento */}
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900 mb-2">Forma de Pagamento</p>
              <select value={propostaPagamento} onChange={e => setPropostaPagamento(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {PAYMENT_TERM_GROUPS.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Produtos */}
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900 mb-2">Produtos da Negociação</p>
              <input type="text" placeholder="Buscar produto pelo nome..." value={propostaSearch} onChange={e => setPropostaSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2" />
              <div className="max-h-44 overflow-y-auto space-y-1 mb-2">
                {!propostaSearch.trim() && <p className="text-xs text-gray-500 px-2 py-1">Digite o nome do produto para buscar.</p>}
                {propostaSearch.trim() && propostaFilteredProdutos.length === 0 && <p className="text-xs text-gray-500 px-2 py-1">Nenhum produto encontrado.</p>}
                {propostaFilteredProdutos.slice(0, 20).map(p => {
                  const qtd = propostaItens.find(i => i.produtoId === p.id)?.quantidade || 0
                  return (
                    <div key={p.id} className={`flex items-center gap-2 p-2 rounded-apple border ${qtd > 0 ? 'border-primary-300 bg-primary-50' : 'border-gray-100'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{p.nome}</p>
                        <p className="text-[10px] text-gray-500">R$ {p.preco.toFixed(2).replace('.', ',')} / {p.unidade.toUpperCase()}</p>
                      </div>
                      <input type="number" min={0} value={qtd || ''} onChange={e => setPropostaItemQtd(p, Math.max(0, parseInt(e.target.value || '0', 10) || 0))} placeholder="Qtd" className="w-20 px-2 py-1 border border-gray-300 rounded-apple text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Observações */}
            <textarea value={propostaObs} onChange={e => setPropostaObs(e.target.value)} placeholder="Observações da negociação..." rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none mb-3" />

            {/* Resumo */}
            {propostaItens.length > 0 && (
              <div className="mb-3 flex items-center justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>{propostaItens.reduce((s, i) => s + i.quantidade, 0)} item(ns)</span>
                <span>R$ {propostaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={cancelProposta} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={handleConfirmNegociacao} className="px-4 py-2 bg-purple-600 text-white rounded-apple hover:bg-purple-700 text-sm font-medium">Iniciar Negociação</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
