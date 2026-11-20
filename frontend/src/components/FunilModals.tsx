import React from 'react'
import type { Cliente, Vendedor, Produto, Pedido, ItemPedido, PropostaHistorico } from '../types'
import { DEFAULT_PAYMENT_TERM } from '../constants/paymentTerms'
import { useParametrosListas } from '../lib/parametrosListas'
import { gerarPropostaPDF } from '../utils/pdfGenerator'
import { savePropostaHistorico, fetchPropostasByCliente } from '../lib/database'
import { formatCNPJ } from '../utils/validators'
import SimuladorPrecoPanel from './SimuladorPrecoPanel'

function extrairPesoEmbalagemKg(p?: Produto, nomeFallback?: string): number {
  if (p?.pesoKg && p.pesoKg > 1) return p.pesoKg
  const texto = `${p?.nome || ''} ${nomeFallback || ''}`
  const m = texto.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i)
  if (!m) return 0
  const val = parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(val) && val > 1 ? val : 0
}

function formatarEnderecoHeader(c?: Cliente): string {
  if (!c) return ''
  const partes = [
    c.enderecoRua,
    c.enderecoNumero ? `nº ${c.enderecoNumero}` : '',
    c.enderecoBairro,
    c.enderecoCidade && c.enderecoEstado ? `${c.enderecoCidade}/${c.enderecoEstado}` : (c.enderecoCidade || c.enderecoEstado),
    c.enderecoCep ? `CEP ${c.enderecoCep}` : '',
  ].filter(Boolean)
  return partes.join(', ') || c.endereco || ''
}

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
  onCriarNovoCiclo?: (cliente: Cliente, extras: Partial<Cliente>) => Promise<Cliente>
  showModalSatisfacao?: boolean
  setShowModalSatisfacao?: (v: boolean) => void
  modalSatisfacaoNota?: number
  setModalSatisfacaoNota?: (v: number) => void
  modalSatisfacaoFeedback?: string
  setModalSatisfacaoFeedback?: (v: string) => void
  confirmSatisfacao?: () => void
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
  isNovoCiclo = false, onCloseNovoCiclo, onClickCliente, onCriarNovoCiclo,
  showModalSatisfacao = false, setShowModalSatisfacao, modalSatisfacaoNota = 5, setModalSatisfacaoNota, modalSatisfacaoFeedback = '', setModalSatisfacaoFeedback, confirmSatisfacao
}: FunilModalsProps) {
  const { opcoesAtivas, reload: reloadParametros } = useParametrosListas()
  const prazosAtivos = opcoesAtivas('prazo_pagamento')
  const fretesAtivos = opcoesAtivas('tipo_frete')
  const categoriasPerdaAtivas = opcoesAtivas('categoria_perda')

  // Garante recarga imediata de Parâmetros sempre que qualquer modal do funil for aberto
  React.useEffect(() => {
    if (showModalProposta || showMotivoPerda || showModalAmostra) {
      reloadParametros().catch(() => {})
    }
  }, [showModalProposta, showMotivoPerda, showModalAmostra])
  const agora = new Date()
  const dataHoraAtual = `${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  const [pedidoFrete, setPedidoFrete] = React.useState<'CIF' | 'FOB' | 'VISITA' | ''>('')
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
  const [propostaTipo, setPropostaTipo] = React.useState<'venda' | 'bonificacao'>('venda')
  const [propostaFrete, setPropostaFrete] = React.useState<'CIF' | 'FOB' | 'VISITA' | ''>('')
  const [cifDescargaPropria, setCifDescargaPropria] = React.useState<'sim' | 'nao' | ''>('')
  const [cifValorDescarga, setCifValorDescarga] = React.useState('')
  const [propostaPagamento, setPropostaPagamento] = React.useState(DEFAULT_PAYMENT_TERM)
  const [propostaItens, setPropostaItens] = React.useState<ItemPedido[]>([])
  const [propostaObs, setPropostaObs] = React.useState('')
  const [propostaSearch, setPropostaSearch] = React.useState('')
  const [propostaSaving, setPropostaSaving] = React.useState(false)
  const propostaLockRef = React.useRef(false)
  const [propostaTab, setPropostaTab] = React.useState<'itens' | 'historico'>('itens')
  const [simuladorProdutoAtivo, setSimuladorProdutoAtivo] = React.useState<string>('')
  const [propostaHistorico, setPropostaHistorico] = React.useState<PropostaHistorico[]>([])
  const [propostaHistoricoLoading, setPropostaHistoricoLoading] = React.useState(false)

  React.useEffect(() => {
    if (!showModalProposta) return
    setPropostaTipo('venda')
    setPropostaFrete('')
    setCifDescargaPropria('')
    setCifValorDescarga('')
    setPropostaItens([])
    setPropostaObs('')
    setPropostaSearch('')
    setPropostaPagamento(DEFAULT_PAYMENT_TERM)
    setPropostaTab('itens')
    setSimuladorProdutoAtivo('')
    if (draggedItem?.cliente.id) {
      setPropostaHistoricoLoading(true)
      fetchPropostasByCliente(draggedItem.cliente.id)
        .then(setPropostaHistorico)
        .catch(() => setPropostaHistorico([]))
        .finally(() => setPropostaHistoricoLoading(false))
    }
  }, [showModalProposta])

  // Ao trocar para Bonificação, trava pagamento em "À vista" e sugere R$ 1,00/kg nos itens já adicionados (editável)
  const handleTrocarPropostaTipo = (novoTipo: 'venda' | 'bonificacao') => {
    setPropostaTipo(novoTipo)
    if (novoTipo === 'bonificacao') {
      setPropostaPagamento('À vista')
      setPropostaItens(prev => prev.map(it => ({ ...it, preco: 1 })))
    } else {
      setPropostaItens(prev =>
        prev.map(it => {
          const prod = produtos.find(p => p.id === it.produtoId)
          return it.preco === 1 && prod ? { ...it, preco: prod.preco } : it
        })
      )
    }
  }

  const propostaTotal = propostaItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
  const propostaTotalKg = propostaItens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0)
  const propostaFilteredProdutos = produtos.filter(p => {
    if (!propostaSearch.trim()) return false
    const q = propostaSearch.toLowerCase().trim()
    const skuTxt = (p.omieCodigo || p.sku || '').toLowerCase()
    return p.ativo && (p.nome.toLowerCase().includes(q) || skuTxt.includes(q))
  })

  const setPropostaItemQtd = (produto: Produto, qtd: number) => {
    setSimuladorProdutoAtivo(produto.nome)
    if (qtd <= 0) {
      setPropostaItens(prev => prev.filter(i => i.produtoId !== produto.id))
      return
    }
    setPropostaItens(prev => {
      const exists = prev.find(i => i.produtoId === produto.id)
      if (exists) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: qtd } : i)
      const precoInicial = propostaTipo === 'bonificacao' ? 1 : produto.preco
      return [...prev, { produtoId: produto.id, nomeProduto: produto.nome, sku: produto.omieCodigo || produto.sku || '', preco: precoInicial, unidade: produto.unidade, quantidade: qtd }]
    })
  }

  const removerPropostaItem = (produtoId: number) => {
    setPropostaItens(prev => prev.filter(i => i.produtoId !== produtoId))
  }

  const comporObservacaoComDescarga = (): string => {
    const partes: string[] = []
    if (propostaFrete === 'CIF') {
      if (cifDescargaPropria === 'sim') {
        const valLimpo = cifValorDescarga.trim()
        partes.push(
          valLimpo
            ? `Cliente com descarga própria – valor da descarga: R$ ${valLimpo}`
            : 'Cliente com descarga própria – sem custo informado'
        )
      } else if (cifDescargaPropria === 'nao') {
        partes.push('Necessário chapa para descarga')
      }
    }
    if (propostaObs.trim()) partes.push(propostaObs.trim())
    return partes.join(' | ')
  }

  const handleConfirmNegociacao = async () => {
    if (!draggedItem || propostaSaving || propostaLockRef.current) return
    if (propostaFrete === 'CIF' && !cifDescargaPropria) {
      showToast?.('error', 'Para frete CIF, informe se o cliente tem descarga própria (Sim / Não).')
      return
    }
    propostaLockRef.current = true
    setPropostaSaving(true)
    try {
      const totalFromProducts = propostaItens.reduce((s, i) => s + i.preco * i.quantidade, 0)
      const valorFinal = totalFromProducts > 0 ? totalFromProducts : (Number(modalPropostaValor) || draggedItem.cliente.valorEstimado || 0)
      setModalPropostaValor(String(valorFinal))
      const sufixoNum = Date.now().toString().slice(-6)
      const numero = propostaTipo === 'bonificacao' ? `BON-PROP-${sufixoNum}` : `PROP-${sufixoNum}`
      const pagamentoEfetivo = propostaTipo === 'bonificacao' ? 'À vista' : propostaPagamento
      const obsFinal = comporObservacaoComDescarga()
      const vendedorNome = loggedUser?.nome || 'Vendedor'

      // 1) Novo ciclo: validar/criar o card em Negociação ANTES de gerar o PDF
      // (se já existir card ativo, fecha o modal e redireciona sem baixar PDF à toa)
      let clienteIdProposta = draggedItem.cliente.id
      if (isNovoCiclo) {
        if (!onCriarNovoCiclo) {
          showToast?.('error', 'Não foi possível criar o novo ciclo.')
          return
        }
        const extrasNovoCiclo: Partial<Cliente> = {
          valorProposta: valorFinal,
          dataProposta: new Date().toISOString().split('T')[0],
        }
        if (propostaItens.length > 0) extrasNovoCiclo.produtosInteresse = propostaItens.map(i => i.nomeProduto)
        const notasParts: string[] = ['🔄 Novo ciclo de vendas iniciado']
        if (propostaTipo === 'bonificacao') notasParts.push('BONIFICAÇÃO')
        if (propostaFrete) notasParts.push(`Frete: ${propostaFrete}`)
        if (pagamentoEfetivo && pagamentoEfetivo !== DEFAULT_PAYMENT_TERM) notasParts.push(`Pagamento: ${pagamentoEfetivo}`)
        if (obsFinal) notasParts.push(obsFinal)
        extrasNovoCiclo.notas = notasParts.join(' | ')
        try {
          const criado = await onCriarNovoCiclo(draggedItem.cliente, extrasNovoCiclo)
          clienteIdProposta = criado.id
        } catch (err: any) {
          const msg = err?.message || 'Erro desconhecido'
          showToast?.('error', `Falha ao criar o novo ciclo: ${msg}`)
          setShowModalProposta(false)
          setDraggedItem(null)
          setPendingDrop(null)
          onCloseNovoCiclo?.()
          return
        }
      }

      // 2) Gerar PDF somente após validar o destino
      try {
        await gerarPropostaPDF(
          draggedItem.cliente,
          propostaItens,
          obsFinal,
          vendedorNome,
          numero,
          { formaPagamento: pagamentoEfetivo, tipoFrete: propostaFrete as 'CIF' | 'FOB' | '' }
        )
      } catch {
        showToast?.('error', 'Erro ao gerar PDF da proposta.')
      }

      // Salvar no histórico
      try {
        const saved = await savePropostaHistorico({
          numero,
          clienteId: clienteIdProposta,
          vendedorNome,
          itens: propostaItens,
          observacoes: obsFinal,
          frete: propostaFrete || undefined,
          pagamento: pagamentoEfetivo || undefined,
          totalValor: valorFinal,
          criadoEm: new Date().toISOString(),
        })
        setPropostaHistorico(prev => prev.some(x => x.id === saved.id) ? prev : [saved, ...prev])
      } catch {
        showToast?.('error', 'A proposta não foi salva no histórico. Gere-a novamente antes de prosseguir.')
      }

      if (propostaItens.length === 0) {
        showToast?.('error', 'Atenção: proposta gerada sem itens.')
      }

      if (isNovoCiclo) {
        setShowModalProposta(false)
        setDraggedItem(null)
        setPendingDrop(null)
        onCloseNovoCiclo?.()
        showToast?.('success', `Proposta ${numero} gerada e novo ciclo iniciado em Negociação!`)
      } else {
        const extras: Partial<Cliente> = { valorProposta: valorFinal }
        if (propostaItens.length > 0) extras.produtosInteresse = propostaItens.map(i => i.nomeProduto)
        const notasParts: string[] = []
        if (propostaTipo === 'bonificacao') notasParts.push('BONIFICAÇÃO')
        if (propostaFrete) notasParts.push(`Frete: ${propostaFrete}`)
        if (pagamentoEfetivo && pagamentoEfetivo !== DEFAULT_PAYMENT_TERM) notasParts.push(`Pagamento: ${pagamentoEfetivo}`)
        if (obsFinal) notasParts.push(obsFinal)
        if (notasParts.length > 0) extras.notas = notasParts.join(' | ')
        confirmProposta(extras)
        showToast?.('success', `Proposta ${numero} gerada e salva!`)
      }
    } finally {
      propostaLockRef.current = false
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
        { formaPagamento: p.pagamento, tipoFrete: p.frete as 'CIF' | 'FOB' | '', dataLancamento: p.criadoEm }
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
      if (exists) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: qtd, preco: 0.1 } : i)
      return [...prev, { produtoId: produto.id, nomeProduto: produto.nome, sku: produto.omieCodigo || produto.sku || '', preco: 0.1, unidade: produto.unidade, quantidade: qtd }]
    })
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={cancelPerda}>
          <div className="bg-white rounded-t-2xl sm:rounded-apple shadow-apple-lg max-w-md w-full p-4 sm:p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">❌ Marcar como Perdido</h2>
            <div className="mb-4 space-y-1">
              <p className="text-sm text-gray-600">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
              <div className="flex items-center gap-3 text-xs text-gray-400 bg-gray-50 rounded-apple px-3 py-2 border border-gray-200">
                <span>👤 <span className="font-medium text-gray-600">{loggedUser?.nome || 'Usuário'}</span></span>
                <span>·</span>
                <span>🕐 {dataHoraAtual}</span>
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo <span className="text-red-500">*</span></label>
            <select
              value={categoriaPerdaSel}
              onChange={e => setCategoriaPerdaSel(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3 bg-white"
            >
              <option value="">— Selecionar motivo —</option>
              {categoriaPerdaSel && !categoriasPerdaAtivas.some(c => c.valor === categoriaPerdaSel) && (
                <option value={categoriaPerdaSel}>{categoriaPerdaSel}</option>
              )}
              {categoriasPerdaAtivas.map(cat => (
                <option key={cat.id} value={cat.valor}>{cat.label}</option>
              ))}
            </select>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observação <span className="text-red-500">*</span></label>
            <textarea value={motivoPerdaTexto} onChange={(e) => setMotivoPerdaTexto(e.target.value)} rows={3} placeholder="Descreva a observação da perda... (obrigatório)" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm resize-none" />
            <div className="flex justify-end gap-3">
              <button onClick={cancelPerda} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmPerda} disabled={!categoriaPerdaSel || !motivoPerdaTexto.trim()} className="px-4 py-2 bg-red-600 text-white rounded-apple hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">Confirmar Perda</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Envio de Amostra — layout duas colunas */}
      {showModalAmostra && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={cancelAmostra}>
          <div className="bg-white rounded-t-2xl sm:rounded-apple shadow-apple-lg w-full max-w-4xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {draggedItem?.fromStage === 'amostra_perdida' ? '🔄 2ª Tentativa de Amostra' : '📦 Enviar Amostra'}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Cliente: <span className="font-medium text-gray-800">{draggedItem?.cliente.razaoSocial}</span></p>
            </div>

            {/* Body — empilha no mobile, duas colunas no desktop */}
            <div className="flex flex-1 flex-col sm:flex-row overflow-y-auto sm:overflow-hidden">
              {/* Coluna esquerda: busca e lista de produtos */}
              <div className="sm:flex-1 flex flex-col border-b sm:border-b-0 sm:border-r border-gray-200 sm:overflow-hidden">
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
                      <button onClick={() => setPedidoFrete('VISITA')} className={`flex-1 py-2 rounded-apple text-sm font-medium border-2 transition-colors ${pedidoFrete === 'VISITA' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>🚗 Entregue em Visita</button>
                    </div>
                  </div>
                  <input type="text" placeholder="🔍 Buscar produto..." value={pedidoSearch} onChange={e => setPedidoSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="sm:flex-1 sm:overflow-y-auto p-3 space-y-1">
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
                        <input type="number" min={0} step="0.01" inputMode="decimal" value={qtd || ''} onChange={e => setPedidoItemQtd(p, Math.max(0, parseFloat(e.target.value || '0') || 0))} placeholder="Qtd" className="w-16 px-2 py-1 border border-gray-300 rounded-apple text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      </div>
                    )
                  })}
                </div>
              </div>

                {/* Coluna direita: carrinho fixo */}
              <div className="w-full sm:w-72 flex flex-col bg-gray-50 flex-shrink-0">
                <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">🛒 Itens selecionados</p>
                </div>
                <div className="sm:flex-1 sm:overflow-y-auto p-3 space-y-2">
                  {pedidoItens.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-8">Nenhum item adicionado</p>
                  )}
                  {pedidoItens.map(item => (
                    <div key={item.produtoId} className="bg-white rounded-apple border border-gray-200 p-2.5">
                      <p className="text-xs font-semibold text-gray-800 leading-tight">{item.nomeProduto}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-gray-500 flex-shrink-0">{item.quantidade}x</span>
                        <span className="text-[10px] text-gray-500">R$ 0,10 /KG</span>
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
            <div className="px-4 sm:px-6 py-4 border-t border-gray-200 flex flex-wrap justify-between items-center gap-2 flex-shrink-0">
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

      {/* Modal Negociação (Item 1 Rodada 3): mais alto, NÃO fecha ao clicar fora, simulador fixo à esquerda */}
      {showModalProposta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-3">
          <div className="bg-white rounded-t-2xl sm:rounded-apple shadow-apple-lg w-full max-w-6xl h-[94dvh] sm:h-[92vh] max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 1.1 Header com nome, CNPJ, endereço e botão X */}
            <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 flex items-start justify-between gap-3 flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {isNovoCiclo ? 'Nova Proposta — Novo Ciclo' : 'Nova Negociação'}
                  </h2>
                  {propostaTipo === 'bonificacao' && (
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-pink-100 text-pink-800 rounded-full border border-pink-300">
                      BONIFICAÇÃO
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                  <p className="truncate">
                    <span className="font-medium text-gray-500">Cliente:</span>{' '}
                    <button
                      type="button"
                      onClick={() => draggedItem?.cliente && onClickCliente?.(draggedItem.cliente)}
                      className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline transition-colors"
                      title="Abrir cadastro do cliente"
                    >
                      {draggedItem?.cliente.razaoSocial}
                    </button>
                    {(draggedItem?.cliente.cnpj || draggedItem?.cliente.cpf) && (
                      <span className="ml-2 text-gray-500 font-mono">
                        · {formatCNPJ(draggedItem?.cliente.cnpj || '') || draggedItem?.cliente.cpf}
                      </span>
                    )}
                  </p>
                  {formatarEnderecoHeader(draggedItem?.cliente) && (
                    <p className="text-gray-500 truncate" title={formatarEnderecoHeader(draggedItem?.cliente)}>
                      <span className="font-medium">Endereço:</span> {formatarEnderecoHeader(draggedItem?.cliente)}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={cancelProposta}
                aria-label="Fechar janela"
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-apple transition-colors flex-shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Body — 3 áreas: Esquerda = Simulador sempre aberto + Campos e Busca | Direita = Itens e Histórico */}
            <div className="flex flex-1 flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
              {/* 1.5 Coluna esquerda fixa: Simulador de Preço sempre aberto */}
              <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-50/70 p-3.5 lg:overflow-y-auto flex-shrink-0">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Simulador de preço</p>
                <SimuladorPrecoPanel
                  produtoNome={simuladorProdutoAtivo || propostaItens[propostaItens.length - 1]?.nomeProduto}
                  prazoExterno={propostaTipo === 'bonificacao' ? 'À vista' : propostaPagamento}
                />
              </div>

              {/* Coluna central: 1.2 Campos na ordem (a: Tipo, b: Frete + descarga CIF, c: Pagamento, d: Busca) */}
              <div className="lg:flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 lg:overflow-hidden">
                <div className="p-4 border-b border-gray-100 space-y-3 flex-shrink-0">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* a) Tipo de pedido */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de pedido</label>
                      <select
                        aria-label="Tipo de pedido"
                        value={propostaTipo}
                        onChange={e => handleTrocarPropostaTipo(e.target.value as 'venda' | 'bonificacao')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="venda">Venda</option>
                        <option value="bonificacao">Bonificação</option>
                      </select>
                    </div>

                    {/* b) Frete (dropdown) */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Frete</label>
                      <select
                        aria-label="Frete"
                        value={propostaFrete}
                        onChange={e => {
                          const val = e.target.value as 'CIF' | 'FOB' | ''
                          setPropostaFrete(val)
                          if (val !== 'CIF') {
                            setCifDescargaPropria('')
                            setCifValorDescarga('')
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">— Selecionar —</option>
                        {fretesAtivos.map(frt => (
                          <option key={frt.id} value={frt.valor}>{frt.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* c) Forma de pagamento */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Forma de pagamento</label>
                      <select
                        aria-label="Forma de pagamento"
                        disabled={propostaTipo === 'bonificacao'}
                        value={propostaTipo === 'bonificacao' ? 'À vista' : propostaPagamento}
                        onChange={e => setPropostaPagamento(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {propostaTipo === 'bonificacao' ? (
                          <option value="À vista">À vista</option>
                        ) : (
                          <>
                            {propostaPagamento && !prazosAtivos.some(p => p.valor === propostaPagamento) && (
                              <option value={propostaPagamento}>{propostaPagamento} (desativado)</option>
                            )}
                            {prazosAtivos.map(opt => (
                              <option key={opt.id} value={opt.valor}>{opt.label}</option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Condicional CIF: Cliente tem descarga própria? */}
                  {propostaFrete === 'CIF' && (
                    <div className="bg-blue-50/60 border border-blue-200 rounded-apple p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-blue-950">Cliente tem descarga própria? <span className="text-red-500">*</span></span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCifDescargaPropria('sim')}
                            className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${cifDescargaPropria === 'sim' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => { setCifDescargaPropria('nao'); setCifValorDescarga('') }}
                            className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${cifDescargaPropria === 'nao' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                          >
                            Não
                          </button>
                        </div>
                      </div>
                      {cifDescargaPropria === 'sim' && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-700 whitespace-nowrap">Valor da descarga (R$):</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={cifValorDescarga}
                            onChange={e => setCifValorDescarga(e.target.value)}
                            placeholder="Opcional (ex.: 150,00)"
                            className="w-40 px-2.5 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}
                      {cifDescargaPropria === 'nao' && (
                        <p className="text-[11px] text-blue-800 font-medium">
                          Entrará na observação do pedido: "Necessário chapa para descarga"
                        </p>
                      )}
                    </div>
                  )}

                  {/* d) Busca de produto */}
                  <input
                    type="text"
                    placeholder="Buscar produto por SKU ou nome..."
                    value={propostaSearch}
                    onChange={e => setPropostaSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="lg:flex-1 lg:overflow-y-auto p-3 space-y-1">
                  {!propostaSearch.trim() && <p className="text-xs text-gray-400 text-center py-6">Digite o SKU ou nome para buscar produtos do catálogo</p>}
                  {propostaSearch.trim() && propostaFilteredProdutos.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Nenhum produto encontrado</p>}
                  {propostaFilteredProdutos.slice(0, 30).map(p => {
                    const qtd = propostaItens.find(i => i.produtoId === p.id)?.quantidade || 0
                    const skuExib = p.omieCodigo || p.sku || ''
                    return (
                      <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-apple border transition-colors ${qtd > 0 ? 'border-primary-300 bg-primary-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex-1 min-w-0" onClick={() => setSimuladorProdutoAtivo(p.nome)}>
                          <p className="text-xs font-semibold text-gray-900 truncate">
                            {skuExib && <span className="font-mono text-indigo-700 mr-1.5">[{skuExib}]</span>}
                            {p.nome}
                          </p>
                          <p className="text-[10px] text-gray-500">R$ {(propostaTipo === 'bonificacao' ? 1 : p.preco).toFixed(2).replace('.', ',')} / kg</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={qtd || ''}
                            onFocus={() => setSimuladorProdutoAtivo(p.nome)}
                            onChange={e => setPropostaItemQtd(p, Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                            placeholder="kg"
                            className="w-20 px-2 py-1 border border-gray-300 rounded-apple text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <span className="text-[10px] text-gray-500">kg</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Coluna direita: abas Itens e Histórico */}
              <div className="w-full lg:w-88 flex flex-col bg-gray-50 flex-shrink-0 lg:w-[22rem]">
                <div className="flex border-b border-gray-200 flex-shrink-0">
                  <button
                    onClick={() => setPropostaTab('itens')}
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${propostaTab === 'itens' ? 'text-purple-700 border-b-2 border-purple-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >Itens ({propostaItens.length})</button>
                  <button
                    onClick={() => setPropostaTab('historico')}
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${propostaTab === 'historico' ? 'text-purple-700 border-b-2 border-purple-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Histórico
                    {propostaHistorico.length > 0 && (
                      <span className="ml-1 bg-purple-100 text-purple-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{propostaHistorico.length}</span>
                    )}
                  </button>
                </div>

                {propostaTab === 'itens' ? (
                  <>
                    <div className="lg:flex-1 lg:overflow-y-auto p-3 space-y-2">
                      {propostaItens.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-8">Nenhum item adicionado</p>
                      )}
                      {propostaItens.map(item => {
                        const prodCat = produtos.find(p => p.id === item.produtoId)
                        const pesoEmb = extrairPesoEmbalagemKg(prodCat, item.nomeProduto)
                        const naoFechaEmbalagem = pesoEmb > 1 && item.quantidade > 0 && item.quantidade % pesoEmb !== 0
                        return (
                          <div
                            key={item.produtoId}
                            onClick={() => setSimuladorProdutoAtivo(item.nomeProduto)}
                            className="bg-white rounded-apple border border-gray-200 p-2.5 space-y-1"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-gray-800 leading-tight flex-1 min-w-0">
                                {item.sku && <span className="font-mono text-indigo-700 mr-1">[{item.sku}]</span>}
                                {item.nomeProduto}
                              </p>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removerPropostaItem(item.produtoId) }}
                                aria-label={`Excluir item ${item.nomeProduto}`}
                                title="Remover item"
                                className="text-gray-400 hover:text-red-600 font-bold text-xs px-1 flex-shrink-0"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-gray-700 flex-shrink-0">{item.quantidade} kg</span>
                              <div className="flex items-center gap-1 flex-1">
                                <span className="text-[10px] text-gray-400">R$</span>
                                <input
                                  type="number" min={0} step="0.01"
                                  value={item.preco === 0 ? '' : item.preco}
                                  onChange={e => setPropostaItemPreco(item.produtoId, parseFloat(e.target.value) || 0)}
                                  onFocus={e => { setSimuladorProdutoAtivo(item.nomeProduto); e.target.select() }}
                                  placeholder="0,00"
                                  className="flex-1 px-1.5 py-1 border border-gray-300 rounded text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                                />
                                <span className="text-[10px] text-gray-400 flex-shrink-0">/kg</span>
                              </div>
                            </div>
                            {naoFechaEmbalagem && (
                              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                {item.quantidade} kg não fecha sacos de {pesoEmb} kg
                              </p>
                            )}
                            {item.preco > 0 && (
                              <p className="text-[10px] font-bold text-primary-700">= R$ {(item.quantidade * item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="p-3 border-t border-gray-200 flex-shrink-0 space-y-2">
                      <textarea value={propostaObs} onChange={e => setPropostaObs(e.target.value)} placeholder="Observações adicionais..." rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none bg-white" />
                      <div className="flex items-center justify-between py-2 border-t border-gray-200">
                        <span className="text-xs font-medium text-gray-700">
                          {propostaItens.length} {propostaItens.length === 1 ? 'item' : 'itens'} · {propostaTotalKg} kg
                        </span>
                        <span className="text-sm font-bold text-gray-900">R$ {propostaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="lg:flex-1 lg:overflow-y-auto p-3 space-y-2">
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
                                {p.itens.map(i => `${i.nomeProduto} (${i.quantidade} kg)`).join(', ')}
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
                                Refazer
                              </button>
                              <button
                                onClick={() => handleDownloadPropostaHistorico(p)}
                                className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-semibold rounded-apple transition-colors"
                              >
                                PDF
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
            <div className="px-4 sm:px-6 py-4 border-t border-gray-200 flex flex-wrap justify-end gap-3 flex-shrink-0">
              <button onClick={cancelProposta} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={handleConfirmNegociacao} disabled={propostaSaving} className="px-5 py-2 bg-purple-600 text-white rounded-apple hover:bg-purple-700 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
                {propostaSaving ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Gerando PDF...</> : '📄 Gerar Proposta PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModalSatisfacao && setShowModalSatisfacao && confirmSatisfacao && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowModalSatisfacao(false); setDraggedItem(null); setPendingDrop(null) }}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">⭐ Coleta de Satisfação</h2>
              <p className="text-sm text-gray-500 mt-0.5">Registre a satisfação de {draggedItem?.cliente.razaoSocial} para finalizar o acompanhamento em Follow-up.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Nota (1 a 5)</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setModalSatisfacaoNota?.(n)}
                    className={`flex-1 py-2 rounded-apple text-sm font-bold border-2 transition-colors ${modalSatisfacaoNota === n ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    {n} ⭐
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Observações / Feedback do cliente <span className="text-red-500">*</span></label>
              <textarea
                rows={3}
                value={modalSatisfacaoFeedback}
                onChange={e => setModalSatisfacaoFeedback?.(e.target.value)}
                placeholder="Descreva o retorno do cliente sobre a entrega e qualidade..."
                className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowModalSatisfacao(false); setDraggedItem(null); setPendingDrop(null) }} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button
                disabled={!modalSatisfacaoFeedback.trim()}
                onClick={confirmSatisfacao}
                className="px-4 py-2 bg-purple-600 text-white rounded-apple hover:bg-purple-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salvar e Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
