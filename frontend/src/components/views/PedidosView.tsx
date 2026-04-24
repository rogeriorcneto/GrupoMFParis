import React from 'react'
import { PaperAirplaneIcon, ShoppingCartIcon, PhotoIcon, CloudArrowUpIcon, DocumentTextIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import type { Pedido, Cliente, Produto, Vendedor, ItemPedido } from '../../types'
import { enviarPedidoOmie } from '../../lib/botApi'
import { gerarPropostaPDF } from '../../utils/pdfGenerator'
import { DEFAULT_PAYMENT_TERM, PAYMENT_TERM_GROUPS } from '../../constants/paymentTerms'

function PedidosView({ pedidos, clientes, produtos, vendedores, loggedUser, onAddPedido, onUpdatePedido, onMoverCliente, showToast }: {
  pedidos: Pedido[]
  clientes: Cliente[]
  produtos: Produto[]
  vendedores: Vendedor[]
  loggedUser: Vendedor
  onAddPedido: (p: Omit<Pedido, 'id'>) => Promise<void>
  onUpdatePedido: (p: Pedido) => void
  onMoverCliente?: (id: number, toStage: string, extras?: Partial<Cliente>) => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}) {
  const isGerente = loggedUser.cargo === 'gerente'
  const [tab, setTab] = React.useState<'novo' | 'historico'>('novo')
  const clientesDisponiveis = (isGerente ? clientes : clientes.filter(c => c.vendedorId === loggedUser.id)).filter(c => c.etapa !== 'perdido' && c.etapa !== 'inativo')
  const produtosAtivos = produtos.filter(p => p.ativo)
  const [selectedClienteId, setSelectedClienteId] = React.useState<number | ''>(clientesDisponiveis[0]?.id ?? '')
  const [itensPedido, setItensPedido] = React.useState<ItemPedido[]>([])
  const [observacoes, setObservacoes] = React.useState('')
  const [searchProduto, setSearchProduto] = React.useState('')
  const [filterCategoria, setFilterCategoria] = React.useState('')
  const [pedidoEnviado, setPedidoEnviado] = React.useState<Pedido | null>(null)
  const [filtroStatus, setFiltroStatus] = React.useState<string>('')
  const [filtroCliente, setFiltroCliente] = React.useState<string>('')
  const [isSaving, setIsSaving] = React.useState(false)
  const [searchCliente, setSearchCliente] = React.useState('')
  const [showClienteDropdown, setShowClienteDropdown] = React.useState(false)
  const [enviandoOmie, setEnviandoOmie] = React.useState<number | null>(null)
  const [tipoPedido, setTipoPedido] = React.useState<'venda' | 'bonificacao'>('venda')
  const [tipoFrete, setTipoFrete] = React.useState<'CIF' | 'FOB' | ''>('')
  const [enderecoDiferente, setEnderecoDiferente] = React.useState(false)
  const [endEntregaRua, setEndEntregaRua] = React.useState('')
  const [endEntregaNumero, setEndEntregaNumero] = React.useState('')
  const [endEntregaBairro, setEndEntregaBairro] = React.useState('')
  const [endEntregaCidade, setEndEntregaCidade] = React.useState('')
  const [endEntregaEstado, setEndEntregaEstado] = React.useState('')
  const [endEntregaCep, setEndEntregaCep] = React.useState('')
  const [formaPagamento, setFormaPagamento] = React.useState(DEFAULT_PAYMENT_TERM)

  const handleEnviarOmieManual = async (pedido: Pedido) => {
    setEnviandoOmie(pedido.id)
    try {
      const result = await enviarPedidoOmie(pedido.id)
      if (result.success) showToast?.('success', `Pedido ${pedido.numero} enviado ao Omie!`)
      else showToast?.('error', `Falha ao enviar ao Omie: ${result.error}`)
    } catch {
      showToast?.('error', 'Erro ao conectar com Omie.')
    }
    setEnviandoOmie(null)
  }

  const produtosFiltrados = produtosAtivos.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(searchProduto.toLowerCase()) || (p.sku || '').toLowerCase().includes(searchProduto.toLowerCase())
    const matchCat = !filterCategoria || p.categoria === filterCategoria
    return matchSearch && matchCat
  })

  const totalPedido = itensPedido.reduce((sum, item) => sum + item.preco * item.quantidade, 0)
  const totalKg = itensPedido.reduce((s, i) => s + i.quantidade, 0)
  const getItemQtd = (produtoId: number) => itensPedido.find(i => i.produtoId === produtoId)?.quantidade ?? 0

  const setItemQtd = (produto: Produto, qtd: number) => {
    if (qtd <= 0) {
      setItensPedido(prev => prev.filter(i => i.produtoId !== produto.id))
    } else {
      setItensPedido(prev => {
        const existe = prev.find(i => i.produtoId === produto.id)
        if (existe) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: qtd, unidade: 'kg' } : i)
        return [...prev, { produtoId: produto.id, nomeProduto: produto.nome, sku: produto.omieCodigo || produto.sku || '', unidade: 'kg', preco: 0, quantidade: qtd }]
      })
    }
  }

  const setItemPreco = (produtoId: number, preco: number) => {
    const precoSeguro = Number.isFinite(preco) ? Math.max(0, preco) : 0
    setItensPedido(prev => prev.map(i => i.produtoId === produtoId ? { ...i, preco: precoSeguro } : i))
  }

  React.useEffect(() => {
    if (tipoPedido === 'bonificacao') {
      setItensPedido(prev => prev.map(i => ({ ...i, preco: 0 })))
    }
  }, [tipoPedido])

  const handleGerarProposta = async () => {
    if (!selectedClienteId || itensPedido.length === 0) {
      showToast?.('error', 'Selecione um cliente e adicione produtos antes de gerar a proposta.')
      return
    }
    const clienteAlvo = clientes.find(c => c.id === Number(selectedClienteId))
    if (!clienteAlvo) return
    const numeroProposta = `PROP-${Date.now().toString().slice(-6)}`
    try {
      await gerarPropostaPDF(clienteAlvo, itensPedido, observacoes, loggedUser.nome, numeroProposta, { formaPagamento, tipoFrete })
      if (onMoverCliente && clienteAlvo.etapa !== 'proposta') {
        onMoverCliente(clienteAlvo.id, 'proposta', { valorProposta: totalPedido, dataProposta: new Date().toISOString().split('T')[0] })
      }
      showToast?.('success', `Proposta ${numeroProposta} gerada com sucesso!`)
    } catch {
      showToast?.('error', 'Erro ao gerar proposta em PDF.')
    }
  }

  const resetForm = () => {
    setItensPedido([]); setObservacoes(''); setSelectedClienteId(clientesDisponiveis[0]?.id ?? '')
    setTipoPedido('venda'); setTipoFrete(''); setFormaPagamento(DEFAULT_PAYMENT_TERM); setEnderecoDiferente(false)
    setEndEntregaRua(''); setEndEntregaNumero(''); setEndEntregaBairro('')
    setEndEntregaCidade(''); setEndEntregaEstado(''); setEndEntregaCep('')
    setSearchCliente('')
  }

  const handleEnviarPedido = async (status: 'rascunho' | 'enviado') => {
    if (!selectedClienteId || isSaving) return
    const clienteAlvo = clientes.find(c => c.id === Number(selectedClienteId))
    if (clienteAlvo && (clienteAlvo.etapa === 'perdido' || clienteAlvo.etapa === 'inativo')) {
      showToast?.('error', `Cliente "${clienteAlvo.etapa === 'perdido' ? 'Perdido' : 'Inativo'}". Mova-o no funil primeiro.`)
      return
    }
    if (itensPedido.length === 0) { showToast?.('error', 'Adicione pelo menos um produto.'); return }
    if (tipoPedido === 'venda' && itensPedido.some(i => i.preco <= 0)) {
      showToast?.('error', 'Defina o preço unitário de todos os itens para venda.')
      return
    }
    if (tipoPedido === 'venda' && totalPedido <= 0) { showToast?.('error', 'Valor total deve ser > zero para venda.'); return }
    if (!tipoFrete) { showToast?.('error', 'Selecione o frete (CIF ou FOB).'); return }
    setIsSaving(true)
    const numero = `PED-${Date.now().toString().slice(-6)}`
    const novoPedido: Omit<Pedido, 'id'> = {
      numero, clienteId: Number(selectedClienteId), vendedorId: loggedUser.id,
      itens: itensPedido, observacoes: observacoes.trim(), status,
      dataCriacao: new Date().toISOString(),
      dataEnvio: status === 'enviado' ? new Date().toISOString() : undefined,
      totalValor: totalPedido, tipo: tipoPedido, formaPagamento,
      tipoFrete: tipoFrete || undefined, enderecoDiferente,
      enderecoEntregaRua: enderecoDiferente ? endEntregaRua : undefined,
      enderecoEntregaNumero: enderecoDiferente ? endEntregaNumero : undefined,
      enderecoEntregaBairro: enderecoDiferente ? endEntregaBairro : undefined,
      enderecoEntregaCidade: enderecoDiferente ? endEntregaCidade : undefined,
      enderecoEntregaEstado: enderecoDiferente ? endEntregaEstado : undefined,
      enderecoEntregaCep: enderecoDiferente ? endEntregaCep : undefined,
    }
    try {
      await onAddPedido(novoPedido)
      if (status === 'enviado') setPedidoEnviado({ ...novoPedido, id: 0 } as Pedido)
      resetForm()
    } catch { /* handled upstream */ } finally { setIsSaving(false) }
  }

  const pedidosFiltrados = pedidos
    .filter(p => {
      const matchStatus = !filtroStatus || p.status === filtroStatus
      const matchCliente = !filtroCliente || String(p.clienteId) === filtroCliente
      const matchVendedor = isGerente || p.vendedorId === loggedUser.id
      return matchStatus && matchCliente && matchVendedor
    })
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())

  const statusBadge = (s: Pedido['status']) => ({ rascunho: 'bg-gray-100 text-gray-700', enviado: 'bg-amber-100 text-amber-800', confirmado: 'bg-green-100 text-green-800', cancelado: 'bg-red-100 text-red-800' }[s])
  const statusLabel = (s: Pedido['status']) => ({ rascunho: 'Rascunho', enviado: 'Ag. aprovacao', confirmado: 'Aprovado', cancelado: 'Recusado' }[s])
  const tipoBadge = (t?: Pedido['tipo']) => (t === 'bonificacao' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800')
  const tipoLabel = (t?: Pedido['tipo']) => (t === 'bonificacao' ? 'Amostra' : 'Venda')
  const catLabel: Record<string, string> = { sacaria: 'Sacaria 25kg', okey_lac: 'Okey Lac 25kg', varejo_lacteo: 'Varejo Lacteo', cafe: 'Cafe', outros: 'Outros' }
  const clienteSelecionado = clientes.find(c => c.id === Number(selectedClienteId))
  const histCount = pedidos.filter(p => isGerente || p.vendedorId === loggedUser.id).length

  // ─────────────────── RENDER ───────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-1 py-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">Pedidos</h1>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setTab('novo')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === 'novo' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Novo Pedido</button>
            <button onClick={() => setTab('historico')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === 'historico' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Historico ({histCount})</button>
          </div>
        </div>
        {tab === 'novo' && itensPedido.length > 0 && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-gray-500">{itensPedido.length} item(s) | {totalKg} kg</span>
            <span className="text-sm font-bold text-primary-700">R$ {totalPedido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>

      {/* Success modal */}
      {pedidoEnviado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <PaperAirplaneIcon className="h-7 w-7 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Pedido Enviado!</h2>
            <p className="text-xl font-bold text-primary-600 mb-2">{pedidoEnviado.numero}</p>
            <span className="inline-flex px-3 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full mb-4">Aguardando aprovacao</span>
            <div className="bg-gray-50 rounded-xl p-3 text-left mb-4 space-y-1 text-sm">
              <p className="text-gray-600"><span className="font-medium text-gray-800">Cliente:</span> {clientes.find(c => c.id === pedidoEnviado.clienteId)?.razaoSocial}</p>
              <p className="text-gray-600"><span className="font-medium text-gray-800">Total:</span> R$ {pedidoEnviado.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPedidoEnviado(null); setTab('historico') }} className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">Historico</button>
              <button onClick={() => setPedidoEnviado(null)} className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">Novo Pedido</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: NOVO PEDIDO — 3 columns ═══ */}
      {tab === 'novo' && (
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">

          {/* COL 1 — Cliente + Config (3/12) */}
          <div className="col-span-12 xl:col-span-3 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 pb-1">
              {/* Cliente selector */}
              <div className="bg-white rounded-xl border border-gray-200 p-3">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Cliente</p>
                {clientesDisponiveis.length === 0 ? <p className="text-xs text-gray-400">Nenhum cliente.</p> : (
                  <div className="relative">
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input type="text" placeholder="Buscar cliente..." value={searchCliente}
                        onChange={(e) => { setSearchCliente(e.target.value); setShowClienteDropdown(true) }}
                        onFocus={() => setShowClienteDropdown(true)}
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-gray-50" />
                    </div>
                    {showClienteDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowClienteDropdown(false)} />
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-20 max-h-40 overflow-y-auto">
                          {(() => {
                            const q = searchCliente.toLowerCase().trim()
                            const filtrados = clientesDisponiveis.filter(c =>
                              c.razaoSocial?.toLowerCase().includes(q) ||
                              c.nomeFantasia?.toLowerCase().includes(q) ||
                              c.contatoNome?.toLowerCase().includes(q) ||
                              c.cnpj?.includes(q) ||
                              c.whatsapp?.includes(q) ||
                              c.contatoCelular?.includes(q) ||
                              c.contatoTelefone?.includes(q)
                            )
                            if (filtrados.length === 0) return <p className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</p>
                            return filtrados.map(c => (
                              <button key={c.id} onClick={() => { setSelectedClienteId(c.id); setSearchCliente(c.razaoSocial); setShowClienteDropdown(false) }}
                                className={`w-full px-3 py-1.5 text-xs text-left hover:bg-primary-50 ${selectedClienteId === c.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'}`}>
                                <span className="font-medium">{c.razaoSocial}</span>
                                {c.nomeFantasia && c.nomeFantasia !== c.razaoSocial && <span className="text-gray-500"> ({c.nomeFantasia})</span>}
                                <span className="text-gray-400"> | {c.etapa}</span>
                                {c.contatoNome && <span className="text-gray-400"> | {c.contatoNome}</span>}
                              </button>
                            ))
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {clienteSelecionado && (
                  <div className="mt-2 flex items-center gap-2 p-2 bg-primary-50 rounded-lg border border-primary-100">
                    <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {clienteSelecionado.razaoSocial.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 truncate">{clienteSelecionado.razaoSocial}</p>
                      <p className="text-[10px] text-gray-500 truncate">{clienteSelecionado.contatoNome} | {clienteSelecionado.contatoTelefone} | <span className="capitalize">{clienteSelecionado.etapa}</span></p>
                    </div>
                  </div>
                )}
              </div>

              {/* Tipo + Frete + Pagamento */}
              <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Tipo do Pedido</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => setTipoPedido('venda')} className={`py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${tipoPedido === 'venda' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>Venda</button>
                    <button onClick={() => setTipoPedido('bonificacao')} className={`py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${tipoPedido === 'bonificacao' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>Amostra</button>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Frete <span className="text-red-400">*</span></p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => setTipoFrete('CIF')} className={`py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${tipoFrete === 'CIF' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>CIF (Entrega)</button>
                    <button onClick={() => setTipoFrete('FOB')} className={`py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${tipoFrete === 'FOB' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>FOB (Retirada)</button>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Pagamento</p>
                  <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50">
                    {PAYMENT_TERM_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Endereco diferente */}
              <div className="bg-white rounded-xl border border-gray-200 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={enderecoDiferente} onChange={(e) => setEnderecoDiferente(e.target.checked)} className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300 focus:ring-primary-500" />
                  <span className="text-xs font-medium text-gray-600">Endereco de entrega diferente</span>
                </label>
                {enderecoDiferente && (
                  <div className="mt-2 space-y-1.5 pl-5 border-l-2 border-primary-200">
                    <div className="grid grid-cols-3 gap-1.5">
                      <input type="text" placeholder="CEP" value={endEntregaCep} onChange={e => setEndEntregaCep(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      <input type="text" placeholder="UF" value={endEntregaEstado} onChange={e => setEndEntregaEstado(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      <input type="text" placeholder="Cidade" value={endEntregaCidade} onChange={e => setEndEntregaCidade(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <input type="text" placeholder="Rua" value={endEntregaRua} onChange={e => setEndEntregaRua(e.target.value)} className="col-span-3 px-2 py-1 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      <input type="text" placeholder="No" value={endEntregaNumero} onChange={e => setEndEntregaNumero(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <input type="text" placeholder="Bairro" value={endEntregaBairro} onChange={e => setEndEntregaBairro(e.target.value)} className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                )}
              </div>

              {/* Observacoes */}
              <div className="bg-white rounded-xl border border-gray-200 p-3">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Observacoes</p>
                <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} placeholder="Condicoes especiais..." className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs resize-none bg-gray-50" />
              </div>
            </div>

            {/* Action buttons — pinned at bottom */}
            <div className="flex-shrink-0 pt-2 space-y-1.5">
              <button onClick={() => handleEnviarPedido('enviado')} disabled={!selectedClienteId || itensPedido.length === 0 || isSaving}
                className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-bold rounded-xl shadow-sm transition-all text-sm flex items-center justify-center gap-2">
                {isSaving
                  ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Enviando...</>
                  : <><PaperAirplaneIcon className="h-4 w-4" /> Enviar | R$ {totalPedido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</>
                }
              </button>
              <div className="flex gap-1.5">
                <button onClick={handleGerarProposta} disabled={!selectedClienteId || itensPedido.length === 0}
                  className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-40 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5">
                  <DocumentTextIcon className="h-3.5 w-3.5" /> Proposta PDF
                </button>
                <button onClick={() => handleEnviarPedido('rascunho')} disabled={!selectedClienteId || itensPedido.length === 0 || isSaving}
                  className="flex-1 py-2 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-600 font-semibold rounded-xl text-xs">
                  Rascunho
                </button>
              </div>
            </div>
          </div>

          {/* COL 2 — Catalogo de Produtos (5/12) */}
          <div className="col-span-12 xl:col-span-5 flex flex-col min-h-0 bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 p-3 border-b border-gray-100 flex-shrink-0">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Produtos</p>
              <span className="text-[10px] text-gray-400">({produtosFiltrados.length})</span>
              <div className="flex-1" />
              <div className="relative flex-1 max-w-48">
                <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" placeholder="Buscar..." value={searchProduto} onChange={(e) => setSearchProduto(e.target.value)} className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
              </div>
              <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50">
                <option value="">Todas</option>
                <option value="sacaria">Sacaria</option>
                <option value="okey_lac">Okey Lac</option>
                <option value="varejo_lacteo">Varejo</option>
                <option value="cafe">Cafe</option>
                <option value="outros">Outros</option>
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {!searchProduto.trim() && !filterCategoria && <p className="text-center py-12 text-gray-400 text-xs">Digite o nome do produto para buscar</p>}
              {(searchProduto.trim() || filterCategoria) && produtosFiltrados.length === 0 && <p className="text-center py-12 text-gray-400 text-xs">Nenhum produto encontrado</p>}
              {(searchProduto.trim() || filterCategoria) && produtosFiltrados.map(produto => {
                const qtd = getItemQtd(produto.id)
                const noCarrinho = qtd > 0
                return (
                  <div key={produto.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${noCarrinho ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-gray-50'}`}>
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {produto.foto ? <img src={produto.foto} alt={produto.nome} className="w-full h-full object-cover" /> : <PhotoIcon className="h-5 w-5 text-gray-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-gray-900 truncate">{produto.nome}</p>
                        {produto.destaque && <span className="px-1 py-0.5 text-[8px] font-bold bg-yellow-400 text-yellow-900 rounded flex-shrink-0">TOP</span>}
                      </div>
                      <p className="text-[10px] text-gray-400">{catLabel[produto.categoria]}{produto.sku ? ` | ${produto.sku}` : ''}</p>
                    </div>
                    <p className="text-xs font-medium text-gray-400 flex-shrink-0 w-20 text-right">/kg</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0 w-28 justify-end">
                      {noCarrinho ? (
                        <input type="number" min={1} value={qtd} onChange={e => setItemQtd(produto, Math.max(1, parseInt(e.target.value) || 1))} onFocus={e => e.target.select()}
                          className="w-16 text-center font-bold text-xs text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 py-1" />
                      ) : (
                        <button onClick={() => setItemQtd(produto, 1)} className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-lg transition-colors">+ Adicionar</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* COL 3 — Carrinho + Resumo (4/12) */}
          <div className="col-span-12 xl:col-span-4 flex flex-col min-h-0 bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 p-3 border-b border-gray-100 flex-shrink-0">
              <ShoppingCartIcon className="h-4 w-4 text-primary-600" />
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Carrinho</p>
              {itensPedido.length > 0 && (
                <>
                  <span className="ml-1 px-1.5 py-0.5 bg-primary-100 text-primary-700 text-[10px] font-bold rounded-full">{itensPedido.length}</span>
                  <div className="flex-1" />
                  <button onClick={() => setItensPedido([])} className="text-[10px] text-red-400 hover:text-red-600 font-medium">Limpar</button>
                </>
              )}
            </div>
            {itensPedido.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-300 p-6">
                <ShoppingCartIcon className="h-12 w-12 mb-2 opacity-40" />
                <p className="text-xs text-gray-400">Selecione produtos ao lado</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {itensPedido.map(item => (
                    <div key={item.produtoId} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{item.nomeProduto}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-gray-400">R$</span>
                          <input type="number" min={0} step="0.01" value={item.preco} onChange={e => setItemPreco(item.produtoId, parseFloat(e.target.value))} onFocus={e => e.target.select()} disabled={tipoPedido !== 'venda'}
                            className={`w-16 px-1 py-0.5 border border-gray-200 rounded text-[10px] ${tipoPedido === 'venda' ? 'text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400' : 'text-gray-400 bg-gray-100 cursor-not-allowed'}`} />
                          <span className="text-[10px] text-gray-400">/ kg</span>
                        </div>
                      </div>
                      <div className="flex items-center flex-shrink-0">
                        <input type="number" min={1} value={item.quantidade} onChange={e => setItemQtd(produtos.find(p => p.id === item.produtoId)!, Math.max(1, parseInt(e.target.value) || 1))} onFocus={e => e.target.select()}
                          className="w-16 text-center text-sm font-bold text-gray-900 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 py-1" />
                      </div>
                      <div className="text-right flex-shrink-0 w-16">
                        <p className="text-xs font-bold text-gray-900">R$ {(item.preco * item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[9px] text-gray-400">{item.quantidade} kg</p>
                      </div>
                      <button onClick={() => setItensPedido(prev => prev.filter(i => i.produtoId !== item.produtoId))}
                        className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex-shrink-0 border-t border-gray-100 p-3 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{itensPedido.length} produto(s) | {totalKg} kg</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-medium text-gray-600">Total</span>
                    <span className="text-lg font-bold text-primary-700">R$ {totalPedido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {clienteSelecionado && (
                    <div className="text-[10px] text-gray-400 flex items-center gap-1 flex-wrap">
                      <span className="font-medium text-gray-600">{clienteSelecionado.razaoSocial}</span>
                      <span>|</span>
                      <span>{tipoPedido === 'bonificacao' ? 'Amostra' : 'Venda'}</span>
                      {tipoFrete && <><span>|</span><span>{tipoFrete}</span></>}
                      <span>|</span>
                      <span>{formaPagamento}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ TAB: HISTORICO ═══ */}
      {tab === 'historico' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 px-1 pb-2 flex-shrink-0">
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="">Todos</option><option value="rascunho">Rascunho</option><option value="enviado">Enviado</option><option value="confirmado">Confirmado</option><option value="cancelado">Cancelado</option>
            </select>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="">Todos os clientes</option>
              {(isGerente ? clientes : clientesDisponiveis).map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
            </select>
            <span className="text-[10px] text-gray-400 ml-auto">{pedidosFiltrados.length} pedido(s)</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 px-1 pb-2">
            {pedidosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <ShoppingCartIcon className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm text-gray-400 font-medium">Nenhum pedido encontrado</p>
              </div>
            ) : pedidosFiltrados.map(pedido => {
              const cliente = clientes.find(c => c.id === pedido.clienteId)
              const vendedor = vendedores.find(v => v.id === pedido.vendedorId)
              return (
                <div key={pedido.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{pedido.numero}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${statusBadge(pedido.status)}`}>{statusLabel(pedido.status)}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${tipoBadge(pedido.tipo)}`}>{tipoLabel(pedido.tipo)}</span>
                        {pedido.omieCodigo && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200">Omie: {pedido.omieStatus || 'enviado'}</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-medium text-gray-700">{cliente?.razaoSocial || '-'}</span>
                        {isGerente && vendedor && <span className="text-gray-400"> | {vendedor.nome}</span>}
                        {' | '}{new Date(pedido.dataCriacao).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <p className="text-base font-bold text-primary-600">R$ {pedido.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-500 border-t border-gray-50 pt-2">
                    {pedido.itens.map((item, idx) => (
                      <span key={idx}><span className="font-medium text-gray-700">{item.quantidade}x</span> {item.nomeProduto}</span>
                    ))}
                  </div>
                  {pedido.observacoes && <p className="text-[10px] text-gray-400 mt-1 italic">Obs: {pedido.observacoes}</p>}
                  {pedido.motivoRecusa && (
                    <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-[10px] font-semibold text-red-700">Motivo: <span className="font-normal text-red-600">{pedido.motivoRecusa}</span></p>
                    </div>
                  )}
                  {/* Action buttons */}
                  {(
                    (isGerente && pedido.status === 'enviado') ||
                    (isGerente && pedido.status === 'confirmado' && !pedido.omieCodigo) ||
                    (pedido.status === 'rascunho' && pedido.vendedorId === loggedUser.id)
                  ) && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-gray-50 flex-wrap items-center">
                      {isGerente && pedido.status === 'enviado' && (
                        <>
                          <button onClick={() => onUpdatePedido({ ...pedido, status: 'confirmado' })} className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700">Aprovar</button>
                          <button onClick={() => onUpdatePedido({ ...pedido, status: 'cancelado' })} className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold rounded-lg hover:bg-red-100">Recusar</button>
                        </>
                      )}
                      {isGerente && pedido.status === 'confirmado' && !pedido.omieCodigo && (
                        <>
                          {pedido.omieErro && <span className="text-[10px] text-amber-600 max-w-[200px] truncate">Omie: {pedido.omieErro}</span>}
                          <button onClick={() => handleEnviarOmieManual(pedido)} disabled={enviandoOmie === pedido.id}
                            className="px-2.5 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                            {enviandoOmie === pedido.id
                              ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Enviando</>
                              : <><CloudArrowUpIcon className="h-3 w-3" /> {pedido.omieErro ? 'Reenviar Omie' : 'Enviar Omie'}</>
                            }
                          </button>
                        </>
                      )}
                      {pedido.status === 'rascunho' && pedido.vendedorId === loggedUser.id && (
                        <>
                          <button onClick={() => onUpdatePedido({ ...pedido, status: 'enviado', dataEnvio: new Date().toISOString() })} className="px-2.5 py-1 bg-primary-600 text-white text-[10px] font-bold rounded-lg hover:bg-primary-700">Enviar agora</button>
                          <button onClick={() => onUpdatePedido({ ...pedido, status: 'cancelado' })} className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold rounded-lg hover:bg-red-100">Descartar</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default PedidosView
