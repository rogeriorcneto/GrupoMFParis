import React from 'react'
import { PaperAirplaneIcon, ShoppingCartIcon, PhotoIcon } from '@heroicons/react/24/outline'
import type { Pedido, Cliente, Produto, Vendedor, ItemPedido } from '../../types'

function PedidosView({ pedidos, clientes, produtos, vendedores, loggedUser, onAddPedido, onUpdatePedido }: {
  pedidos: Pedido[]
  clientes: Cliente[]
  produtos: Produto[]
  vendedores: Vendedor[]
  loggedUser: Vendedor
  onAddPedido: (p: Pedido) => void
  onUpdatePedido: (p: Pedido) => void
}) {
  const isGerente = loggedUser.cargo === 'gerente'
  const [tab, setTab] = React.useState<'novo' | 'historico'>('novo')
  const clientesDisponiveis = isGerente ? clientes : clientes.filter(c => c.vendedorId === loggedUser.id)
  const produtosAtivos = produtos.filter(p => p.ativo)
  const [selectedClienteId, setSelectedClienteId] = React.useState<number | ''>(clientesDisponiveis[0]?.id ?? '')
  const [itensPedido, setItensPedido] = React.useState<ItemPedido[]>([])
  const [observacoes, setObservacoes] = React.useState('')
  const [searchProduto, setSearchProduto] = React.useState('')
  const [filterCategoria, setFilterCategoria] = React.useState('')
  const [pedidoEnviado, setPedidoEnviado] = React.useState<Pedido | null>(null)
  const [filtroStatus, setFiltroStatus] = React.useState<string>('')
  const [filtroCliente, setFiltroCliente] = React.useState<string>('')

  const produtosFiltrados = produtosAtivos.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(searchProduto.toLowerCase()) || (p.sku || '').toLowerCase().includes(searchProduto.toLowerCase())
    const matchCat = !filterCategoria || p.categoria === filterCategoria
    return matchSearch && matchCat
  })

  const totalPedido = itensPedido.reduce((sum, item) => sum + item.preco * item.quantidade, 0)
  const getItemQtd = (produtoId: number) => itensPedido.find(i => i.produtoId === produtoId)?.quantidade ?? 0

  const setItemQtd = (produto: Produto, qtd: number) => {
    if (qtd <= 0) {
      setItensPedido(prev => prev.filter(i => i.produtoId !== produto.id))
    } else {
      setItensPedido(prev => {
        const existe = prev.find(i => i.produtoId === produto.id)
        if (existe) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: qtd } : i)
        return [...prev, { produtoId: produto.id, nomeProduto: produto.nome, sku: produto.sku, unidade: produto.unidade, preco: produto.preco, quantidade: qtd }]
      })
    }
  }

  const handleEnviarPedido = (status: 'rascunho' | 'enviado') => {
    if (!selectedClienteId || itensPedido.length === 0) return
    const numero = `PED-${Date.now().toString().slice(-6)}`
    const novoPedido: Pedido = {
      id: Date.now(), numero, clienteId: Number(selectedClienteId), vendedorId: loggedUser.id,
      itens: itensPedido, observacoes: observacoes.trim(), status,
      dataCriacao: new Date().toISOString(),
      dataEnvio: status === 'enviado' ? new Date().toISOString() : undefined,
      totalValor: totalPedido
    }
    onAddPedido(novoPedido)
    if (status === 'enviado') setPedidoEnviado(novoPedido)
    setItensPedido([]); setObservacoes(''); setSelectedClienteId(clientesDisponiveis[0]?.id ?? '')
  }

  const pedidosFiltrados = pedidos
    .filter(p => {
      const matchStatus = !filtroStatus || p.status === filtroStatus
      const matchCliente = !filtroCliente || String(p.clienteId) === filtroCliente
      const matchVendedor = isGerente || p.vendedorId === loggedUser.id
      return matchStatus && matchCliente && matchVendedor
    })
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())

  const statusBadge = (s: Pedido['status']) => ({ rascunho: 'bg-gray-100 text-gray-700', enviado: 'bg-blue-100 text-blue-800', confirmado: 'bg-green-100 text-green-800', cancelado: 'bg-red-100 text-red-800' }[s])
  const statusLabel = (s: Pedido['status']) => ({ rascunho: '📝 Rascunho', enviado: '📤 Enviado', confirmado: '✅ Confirmado', cancelado: '❌ Cancelado' }[s])
  const catLabel: Record<string, string> = { sacaria: 'Sacaria 25kg', okey_lac: 'Okey Lac 25kg', varejo_lacteo: 'Varejo Lácteo', cafe: 'Café', outros: 'Outros' }
  const clienteSelecionado = clientes.find(c => c.id === Number(selectedClienteId))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Lançamento de Pedidos</h1>
          <p className="mt-1 text-sm text-gray-600">{isGerente ? 'Gerencie todos os pedidos da equipe' : `Olá, ${loggedUser.nome.split(' ')[0]}! Lance pedidos para seus clientes`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('novo')} className={`px-3 sm:px-4 py-2 rounded-apple text-sm font-medium transition-colors ${tab === 'novo' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>➕ Novo Pedido</button>
          <button onClick={() => setTab('historico')} className={`px-3 sm:px-4 py-2 rounded-apple text-sm font-medium transition-colors ${tab === 'historico' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>📋 Histórico ({pedidos.filter(p => isGerente || p.vendedorId === loggedUser.id).length})</button>
        </div>
      </div>

      {pedidoEnviado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Pedido Enviado!</h2>
            <p className="text-3xl font-bold text-primary-600 mb-4">{pedidoEnviado.numero}</p>
            <div className="bg-gray-50 rounded-apple p-4 text-left mb-6 space-y-1">
              <p className="text-sm text-gray-700"><span className="font-medium">Cliente:</span> {clientes.find(c => c.id === pedidoEnviado.clienteId)?.razaoSocial}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Itens:</span> {pedidoEnviado.itens.length} produto(s)</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Total:</span> R$ {pedidoEnviado.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Data:</span> {new Date(pedidoEnviado.dataCriacao).toLocaleString('pt-BR')}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setPedidoEnviado(null); setTab('historico') }} className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm font-medium">Ver Histórico</button>
              <button onClick={() => setPedidoEnviado(null)} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm font-medium">Novo Pedido</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'novo' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 space-y-4">
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">👤 Cliente</h3>
              {clientesDisponiveis.length === 0 ? <p className="text-sm text-gray-500">Nenhum cliente atribuído a você.</p> : (
                <select value={selectedClienteId} onChange={(e) => setSelectedClienteId(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                  <option value="">Selecione um cliente...</option>
                  {clientesDisponiveis.map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
                </select>
              )}
              {clienteSelecionado && (
                <div className="mt-3 p-3 bg-gray-50 rounded-apple border border-gray-200 space-y-1">
                  <p className="text-xs text-gray-500">Contato: <span className="text-gray-800 font-medium">{clienteSelecionado.contatoNome}</span></p>
                  <p className="text-xs text-gray-500">Tel: <span className="text-gray-800">{clienteSelecionado.contatoTelefone}</span></p>
                  <p className="text-xs text-gray-500">Etapa: <span className="text-gray-800">{clienteSelecionado.etapa}</span></p>
                </div>
              )}
            </div>
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">🛒 Carrinho ({itensPedido.length} {itensPedido.length === 1 ? 'item' : 'itens'})</h3>
              {itensPedido.length === 0 ? (
                <div className="text-center py-6 text-gray-400"><ShoppingCartIcon className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Adicione produtos ao pedido</p></div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {itensPedido.map(item => (
                    <div key={item.produtoId} className="flex items-center justify-between p-2 bg-gray-50 rounded-apple border border-gray-200">
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="text-xs font-medium text-gray-900 truncate">{item.nomeProduto}</p>
                        <p className="text-xs text-gray-500">R$ {item.preco.toFixed(2).replace('.', ',')} / {item.unidade}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setItemQtd(produtos.find(p => p.id === item.produtoId)!, item.quantidade - 1)} className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 font-bold text-sm">−</button>
                        <span className="w-8 text-center text-sm font-semibold text-gray-900">{item.quantidade}</span>
                        <button onClick={() => setItemQtd(produtos.find(p => p.id === item.produtoId)!, item.quantidade + 1)} className="w-6 h-6 rounded-full bg-primary-100 hover:bg-primary-200 flex items-center justify-center text-primary-700 font-bold text-sm">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {itensPedido.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total ({itensPedido.reduce((s, i) => s + i.quantidade, 0)} unid.)</span>
                  <span className="text-sm font-bold text-gray-900">R$ {totalPedido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">📝 Observações</h3>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Condições de entrega, prazo, forma de pagamento..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none" />
            </div>
            <div className="space-y-2">
              <button onClick={() => handleEnviarPedido('enviado')} disabled={!selectedClienteId || itensPedido.length === 0} className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-apple shadow-apple-sm transition-colors flex items-center justify-center gap-2">
                <PaperAirplaneIcon className="h-5 w-5" /> Enviar Pedido — R$ {totalPedido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </button>
              <button onClick={() => handleEnviarPedido('rascunho')} disabled={!selectedClienteId || itensPedido.length === 0} className="w-full py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-700 font-medium rounded-apple transition-colors text-sm">💾 Salvar como Rascunho</button>
              {itensPedido.length > 0 && <button onClick={() => setItensPedido([])} className="w-full py-2 text-red-500 hover:text-red-700 text-sm font-medium transition-colors">🗑️ Limpar carrinho</button>}
            </div>
          </div>
          <div className="xl:col-span-2">
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">📦 Selecionar Produtos</h3>
              <div className="flex flex-wrap gap-3 mb-4">
                <input type="text" placeholder="Buscar por nome ou SKU..." value={searchProduto} onChange={(e) => setSearchProduto(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm flex-1 min-w-48" />
                <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Todas categorias</option>
                  <option value="sacaria">Sacaria 25kg</option>
                  <option value="okey_lac">Okey Lac 25kg</option>
                  <option value="varejo_lacteo">Varejo Lácteo</option>
                  <option value="cafe">Café</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {produtosFiltrados.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">Nenhum produto encontrado</p>}
                {produtosFiltrados.map(produto => {
                  const qtd = getItemQtd(produto.id)
                  const noCarrinho = qtd > 0
                  return (
                    <div key={produto.id} className={`flex items-center gap-4 p-3 rounded-apple border-2 transition-all ${noCarrinho ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                      <div className="w-14 h-14 bg-gray-100 rounded-apple flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {produto.foto ? <img src={produto.foto} alt={produto.nome} className="w-full h-full object-cover" /> : <PhotoIcon className="h-7 w-7 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-gray-900 truncate">{produto.nome}</p>
                          {produto.destaque && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-yellow-400 text-yellow-900 rounded-full flex-shrink-0">Destaque</span>}
                        </div>
                        <p className="text-xs text-gray-500">{catLabel[produto.categoria]}{produto.sku ? ` • ${produto.sku}` : ''}</p>
                        <p className="text-sm font-bold text-primary-600 mt-0.5">R$ {produto.preco.toFixed(2).replace('.', ',')} <span className="text-xs font-normal text-gray-400">/{produto.unidade}</span></p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {noCarrinho ? (
                          <>
                            <button onClick={() => setItemQtd(produto, qtd - 1)} className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 font-bold">−</button>
                            <span className="w-10 text-center font-bold text-gray-900">{qtd}</span>
                            <button onClick={() => setItemQtd(produto, qtd + 1)} className="w-8 h-8 rounded-full bg-primary-600 hover:bg-primary-700 flex items-center justify-center text-white font-bold">+</button>
                          </>
                        ) : (
                          <button onClick={() => setItemQtd(produto, 1)} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-apple transition-colors">+ Adicionar</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'historico' && (
        <div className="space-y-4">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Todos os status</option><option value="rascunho">Rascunho</option><option value="enviado">Enviado</option><option value="confirmado">Confirmado</option><option value="cancelado">Cancelado</option>
            </select>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Todos os clientes</option>
              {(isGerente ? clientes : clientesDisponiveis).map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
            </select>
            <span className="text-sm text-gray-500 ml-auto">{pedidosFiltrados.length} pedido(s)</span>
          </div>
          {pedidosFiltrados.length === 0 ? (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-16 text-center">
              <ShoppingCartIcon className="h-16 w-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Nenhum pedido encontrado</p>
              <p className="text-sm text-gray-400 mt-1">Lance seu primeiro pedido clicando em "Novo Pedido"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pedidosFiltrados.map(pedido => {
                const cliente = clientes.find(c => c.id === pedido.clienteId)
                const vendedor = vendedores.find(v => v.id === pedido.vendedorId)
                return (
                  <div key={pedido.id} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-900">{pedido.numero}</span>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadge(pedido.status)}`}>{statusLabel(pedido.status)}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1"><span className="font-medium">{cliente?.razaoSocial || '—'}</span>{isGerente && vendedor && <span className="text-gray-400"> • {vendedor.nome}</span>}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(pedido.dataCriacao).toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary-600">R$ {pedido.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-400">{pedido.itens.length} produto(s)</p>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 pt-3 space-y-1">
                      {pedido.itens.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700"><span className="font-medium">{item.quantidade}x</span> {item.nomeProduto}{item.sku && <span className="text-gray-400 text-xs ml-1">({item.sku})</span>}</span>
                          <span className="text-gray-900 font-medium">R$ {(item.preco * item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      {pedido.observacoes && <p className="text-xs text-gray-500 mt-2 italic">Obs: {pedido.observacoes}</p>}
                    </div>
                    {isGerente && pedido.status === 'enviado' && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button onClick={() => onUpdatePedido({ ...pedido, status: 'confirmado' })} className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-apple hover:bg-green-700">✅ Confirmar</button>
                        <button onClick={() => onUpdatePedido({ ...pedido, status: 'cancelado' })} className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-apple hover:bg-red-100">❌ Cancelar</button>
                      </div>
                    )}
                    {pedido.status === 'rascunho' && pedido.vendedorId === loggedUser.id && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button onClick={() => onUpdatePedido({ ...pedido, status: 'enviado', dataEnvio: new Date().toISOString() })} className="px-3 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-apple hover:bg-primary-700">📤 Enviar agora</button>
                        <button onClick={() => onUpdatePedido({ ...pedido, status: 'cancelado' })} className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-apple hover:bg-red-100">🗑️ Descartar</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PedidosView
