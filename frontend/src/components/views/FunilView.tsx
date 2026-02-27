import React, { useMemo } from 'react'
import type { Cliente, Vendedor, Interacao, FunilViewProps } from '../../types'
import { diasDesde, getCardUrgencia, getNextAction, mapEtapaAgendor, mapCategoriaPerdaAgendor, sortCards, prazosEtapa } from '../../utils/funil-logic'

const STAGES_AMOSTRA = [
  { title: 'Prospecção', key: 'prospecção', badge: 'bg-blue-100 text-blue-800', icon: '📞', prob: 0.10 },
  { title: 'Amostra', key: 'amostra', badge: 'bg-yellow-100 text-yellow-800', icon: '📦', prob: 0.25 },
  { title: 'Homologado', key: 'homologado', badge: 'bg-green-100 text-green-800', icon: '✅', prob: 0.50 },
  { title: 'Perdido', key: 'perdido', badge: 'bg-red-100 text-red-800', icon: '❌', prob: 0 },
] as const

const STAGES_VENDA = [
  { title: 'Negociação', key: 'negociacao', badge: 'bg-purple-100 text-purple-800', icon: '💰', prob: 0.75 },
  { title: 'Pós-Venda', key: 'pos_venda', badge: 'bg-pink-100 text-pink-800', icon: '🚚', prob: 0.95 },
  { title: 'Perdido', key: 'perdido', badge: 'bg-red-100 text-red-800', icon: '❌', prob: 0 },
] as const

const STAGES_ALL = [...STAGES_AMOSTRA, ...STAGES_VENDA]

type StageEntry = typeof STAGES_ALL[number]

function FunilView({ clientes, vendedores, interacoes, loggedUser, onDragStart, onDragOver, onDrop, onQuickAction, onClickCliente, isGerente = false, onImportNegocios }: FunilViewProps & { onClickCliente?: (c: Cliente) => void; isGerente?: boolean }) {
  const [filterVendedorId, setFilterVendedorId] = React.useState<number | ''>('')
  const [sortBy, setSortBy] = React.useState<'urgencia' | 'score' | 'valor'>('urgencia')
  const [importStatus, setImportStatus] = React.useState<string | null>(null)
  const [funil, setFunil] = React.useState<'amostra' | 'venda'>('amostra')
  const [showPerdidos, setShowPerdidos] = React.useState(false)
  const [showPerdidosVenda, setShowPerdidosVenda] = React.useState(false)

  const handleImportNegocios = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onImportNegocios) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) { alert('CSV vazio ou sem dados'); return }

      const firstLine = lines[0]
      const countSemicolon = (firstLine.match(/;/g) || []).length
      const countComma = (firstLine.match(/,/g) || []).length
      const countTab = (firstLine.match(/\t/g) || []).length
      const sep = countTab > countComma && countTab > countSemicolon ? '\t' : countSemicolon > countComma ? ';' : ','

      const parseLine = (line: string): string[] => {
        const result: string[] = []
        let current = '', inQuotes = false
        for (let j = 0; j < line.length; j++) {
          const ch = line[j]
          if (ch === '"') { inQuotes = !inQuotes; continue }
          if (ch === sep && !inQuotes) { result.push(current.trim()); current = ''; continue }
          current += ch
        }
        result.push(current.trim())
        return result
      }

      const headers = parseLine(firstLine).map(h => h.replace(/^\uFEFF/, '').toLowerCase().trim())

      if (!headers.some(h => h.includes('etapa') || h.includes('título do negócio') || h.includes('titulo do negocio'))) {
        alert('Este CSV não parece ser uma exportação de Negócios do Agendor.\nUse: Agendor → Negócios → Exportar')
        return
      }

      // Parsear todos os negócios
      interface NegocioRow {
        empresa: string; cnpj: string; etapa: string; status: string; valor: number
        motivoPerda: string; descMotivo: string; produto: string; origemCliente: string
        pessoa: string; telefone: string; celular: string; whatsapp: string; email: string
        endereco: string; dataUlt: string; ranking: number
      }

      const negocios: NegocioRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals = parseLine(lines[i])
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = vals[idx] || '' })

        const empresa = row['empresa relacionada'] || ''
        if (!empresa) continue

        const endParts = [row['rua'], row['número'] || row['numero'], row['complemento'] ? `(${row['complemento']})` : '', row['bairro'], row['cidade'], row['estado'], row['cep'] ? `CEP ${row['cep']}` : ''].filter(Boolean)

        let dataUlt = ''
        const dataStr = row['ultima atualização'] || row['ultima atualizacao'] || row['data de cadastro'] || ''
        if (dataStr) {
          const match = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
          if (match) {
            const ano = match[3].length === 2 ? '20' + match[3] : match[3]
            dataUlt = `${ano}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
          }
        }

        negocios.push({
          empresa,
          cnpj: (row['cnpj'] || '').replace(/[^\d./\-]/g, ''),
          etapa: row['etapa'] || '',
          status: row['status'] || '',
          valor: parseFloat(row['valor'] || '0') || 0,
          motivoPerda: row['motivo de perda'] || '',
          descMotivo: row['descrição do motivo de perda'] || row['descricao do motivo de perda'] || '',
          produto: row['produto'] || '',
          origemCliente: row['origem do cliente'] || '',
          pessoa: row['pessoa relacionada'] || '',
          telefone: row['telefone'] || '',
          celular: row['celular'] || '',
          whatsapp: row['whatsapp'] || '',
          email: row['e-mail'] || row['email'] || '',
          endereco: endParts.join(', '),
          dataUlt,
          ranking: parseInt(row['ranking'] || '0')
        })
      }

      if (negocios.length === 0) { alert('Nenhum negócio válido encontrado no CSV.'); return }

      // Agrupar por empresa — pegar o negócio mais recente de cada uma
      const porEmpresa = new Map<string, NegocioRow[]>()
      negocios.forEach(n => {
        const key = n.cnpj || n.empresa.toLowerCase().trim()
        if (!porEmpresa.has(key)) porEmpresa.set(key, [])
        porEmpresa.get(key)!.push(n)
      })

      const updates: { clienteId: number; changes: Partial<Cliente> }[] = []
      const novos: Omit<Cliente, 'id'>[] = []
      let matchCount = 0, newCount = 0

      porEmpresa.forEach((deals, _key) => {
        // Usar o deal mais recente para etapa e dados, mas somar valores de todos
        const sortedDeals = deals.sort((a, b) => (a.dataUlt || '').localeCompare(b.dataUlt || ''))
        const deal = sortedDeals[sortedDeals.length - 1]
        const etapaCRM = mapEtapaAgendor(deal.etapa, deal.status)
        // Somar valores de TODOS os negócios da empresa
        const valorTotal = deals.reduce((sum, d) => sum + d.valor, 0)
        // Coletar todos os produtos de todos os negócios
        const allProdutos = [...new Set(deals.map(d => d.produto).filter(Boolean).flatMap(p => p.split(',').map(x => x.trim())))]

        // Normalizar nome para matching fuzzy
        const normalize = (s: string) => s.toLowerCase().trim()
          .replace(/\b(ltda|me|epp|eireli|s\.?a\.?|s\/a|cia|comercio|comércio|industria|indústria|distribui(dora|cao|ção)?|com\.?|ind\.?|imp\.?|exp\.?)\b/gi, '')
          .replace(/[.\-\/,()]/g, ' ').replace(/\s+/g, ' ').trim()

        const dealNorm = normalize(deal.empresa)

        // Tentar match com cliente existente (CNPJ exato > nome normalizado > nome contém)
        const clienteExistente = clientes.find(c => {
          if (deal.cnpj && c.cnpj && deal.cnpj.replace(/\D/g, '') === c.cnpj.replace(/\D/g, '')) return true
          const razaoNorm = normalize(c.razaoSocial)
          const fantasiaNorm = c.nomeFantasia ? normalize(c.nomeFantasia) : ''
          // Match exato normalizado
          if (razaoNorm === dealNorm || fantasiaNorm === dealNorm) return true
          // Match parcial: um contém o outro (mínimo 4 chars para evitar falsos positivos)
          if (dealNorm.length >= 4 && razaoNorm.length >= 4) {
            if (razaoNorm.includes(dealNorm) || dealNorm.includes(razaoNorm)) return true
            if (fantasiaNorm && (fantasiaNorm.includes(dealNorm) || dealNorm.includes(fantasiaNorm))) return true
          }
          return false
        })

        const changes: Partial<Cliente> = {
          etapa: etapaCRM,
          dataEntradaEtapa: deal.dataUlt || new Date().toISOString().split('T')[0],
          ultimaInteracao: deal.dataUlt || new Date().toISOString().split('T')[0],
        }
        changes.contatoNome = deal.pessoa || ''
        if (deal.celular || deal.whatsapp || deal.telefone) changes.contatoTelefone = deal.celular || deal.whatsapp || deal.telefone
        if (deal.email) changes.contatoEmail = deal.email
        if (valorTotal > 0) changes.valorEstimado = valorTotal
        if (allProdutos.length > 0) changes.produtosInteresse = allProdutos
        if (deal.origemCliente) changes.origemLead = deal.origemCliente
        if (etapaCRM === 'perdido') {
          changes.motivoPerda = deal.descMotivo || deal.motivoPerda || ''
          changes.categoriaPerda = mapCategoriaPerdaAgendor(deal.motivoPerda)
          changes.dataPerda = deal.dataUlt || new Date().toISOString().split('T')[0]
        }
        if (etapaCRM === 'negociacao' && deal.valor > 0) {
          changes.valorProposta = deal.valor
          changes.dataProposta = deal.dataUlt || undefined
        }
        if (deal.ranking > 0) changes.score = Math.min(deal.ranking * 20, 100)

        if (clienteExistente) {
          updates.push({ clienteId: clienteExistente.id, changes })
          matchCount++
        } else {
          novos.push({
            razaoSocial: deal.empresa,
            nomeFantasia: '',
            cnpj: deal.cnpj,
            contatoNome: deal.pessoa,
            contatoTelefone: deal.celular || deal.whatsapp || deal.telefone,
            contatoEmail: deal.email,
            endereco: deal.endereco,
            diasInativo: 0,
            ...changes
          } as Omit<Cliente, 'id'>)
          newCount++
        }
      })

      setImportStatus(`Processando: ${matchCount} atualizados + ${newCount} novos...`)
      onImportNegocios(updates, novos)
      setTimeout(() => setImportStatus(null), 5000)
      alert(`✅ Importação de Negócios concluída!\n\n📋 ${negocios.length} negócios processados\n🔄 ${matchCount} clientes atualizados no funil\n➕ ${newCount} novos clientes criados\n\nEtapas mapeadas automaticamente do Agendor.`)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const { clientesFiltrados, activeClientes, totalPipeline, receitaPonderada, taxaConversao, tempoMedio } = useMemo(() => {
    const clientesFiltrados = filterVendedorId ? clientes.filter(c => c.vendedorId === filterVendedorId) : clientes

    const etapaMap = new Map<string, number>()
    let totalActive = 0
    let posVendaCount = 0
    for (const c of clientesFiltrados) {
      const v = c.valorEstimado || 0
      etapaMap.set(c.etapa, (etapaMap.get(c.etapa) || 0) + v)
      if (c.etapa !== 'perdido') { totalActive++ }
      if (c.etapa === 'pos_venda') posVendaCount++
    }

    const totalPipeline = [...etapaMap.entries()]
      .filter(([k]) => k !== 'perdido')
      .reduce((s, [, v]) => s + v, 0)

    const stagesAba = funil === 'amostra' ? STAGES_AMOSTRA : STAGES_VENDA
    const receitaPonderada = stagesAba.reduce((total, stage) => {
      return total + (etapaMap.get(stage.key) || 0) * stage.prob
    }, 0)

    const taxaConversao = clientes.length > 0
      ? Math.round((posVendaCount / Math.max(totalActive, 1)) * 100)
      : 0

    const comHistorico = clientesFiltrados.filter(c => c.historicoEtapas && c.historicoEtapas.length > 1)
    let tempoMedio = 0
    if (comHistorico.length > 0) {
      const totalDias = comHistorico.reduce((s, c) => {
        const h = c.historicoEtapas!
        if (h.length < 2) return s
        const first = new Date(h[0].data).getTime()
        const last = new Date(h[h.length - 1].data).getTime()
        return s + Math.floor((last - first) / 86400000)
      }, 0)
      tempoMedio = Math.round(totalDias / comHistorico.length)
    }

    const activeClientes = clientesFiltrados.filter(c => c.etapa !== 'perdido')

    return { clientesFiltrados, activeClientes, totalPipeline, receitaPonderada, taxaConversao, tempoMedio }
  }, [clientes, filterVendedorId, funil])

  const urgenciaBorder = (u: string) => {
    if (u === 'critico') return 'border-l-4 border-l-red-500 bg-red-50'
    if (u === 'atencao') return 'border-l-4 border-l-yellow-500 bg-yellow-50'
    return 'bg-gray-50 border border-gray-200'
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
        const diasPedido = diasDesde(cliente.dataUltimoPedido)
        const cicloRecompra = 30
        const pctRecompra = Math.min((diasPedido / cicloRecompra) * 100, 100)
        const entregaRealizada = cliente.dataEntregaRealizada
        const entregaPrevista = cliente.dataEntregaPrevista
        const faturamento = cliente.statusFaturamento
        return (
          <div className="mt-1.5 space-y-1">
            {entregaRealizada ? (
              <p className="text-[10px] font-medium text-green-700">✅ Entregue em {new Date(entregaRealizada).toLocaleDateString('pt-BR')}</p>
            ) : entregaPrevista ? (
              <p className="text-[10px] font-medium text-blue-700">🚚 Entrega prevista: {new Date(entregaPrevista).toLocaleDateString('pt-BR')}</p>
            ) : cliente.statusEntrega === 'enviado' ? (
              <p className="text-[10px] font-medium text-orange-600">🚚 Enviado — aguardando entrega</p>
            ) : cliente.statusEntrega === 'preparando' ? (
              <p className="text-[10px] font-medium text-gray-600">📋 Preparando pedido</p>
            ) : null}
            {faturamento === 'faturado' ? (
              <p className="text-[10px] font-bold text-green-700">💰 Faturado</p>
            ) : (
              <p className="text-[10px] font-bold text-orange-600">💰 A faturar</p>
            )}
            {cliente.dataUltimoPedido && (
              <>
                <p className="text-[10px] text-gray-500">📦 Pedido: {diasPedido}d atrás</p>
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

  const stagesAtivos: StageEntry[] = funil === 'amostra'
    ? (showPerdidos ? [...STAGES_AMOSTRA] : STAGES_AMOSTRA.filter(s => s.key !== 'perdido'))
    : (showPerdidosVenda ? [...STAGES_VENDA] : STAGES_VENDA.filter(s => s.key !== 'perdido'))

  const alertCount = clientesFiltrados.filter(c => getCardUrgencia(c) !== 'normal').length
  const perdidosCount = clientesFiltrados.filter(c => c.etapa === 'perdido').length

  return (
    <div className="space-y-4">

      {/* Seletor de funil */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-apple p-1 shadow-apple-sm w-fit">
        <button
          onClick={() => setFunil('amostra')}
          className={`flex items-center gap-2 px-4 py-2 rounded-apple text-sm font-semibold transition-all duration-200 ${
            funil === 'amostra'
              ? 'bg-yellow-500 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          📦 Amostra
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
            funil === 'amostra' ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-500'
          }`}>
            {clientesFiltrados.filter(c => c.etapa === 'prospecção' || c.etapa === 'amostra' || c.etapa === 'homologado').length}
          </span>
        </button>
        <button
          onClick={() => setFunil('venda')}
          className={`flex items-center gap-2 px-4 py-2 rounded-apple text-sm font-semibold transition-all duration-200 ${
            funil === 'venda'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          💰 Venda
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
            funil === 'venda' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
          }`}>
            {clientesFiltrados.filter(c => c.etapa === 'negociacao' || c.etapa === 'pos_venda').length}
          </span>
        </button>
      </div>

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
          {funil === 'amostra' && (
            <button
              onClick={() => setShowPerdidos(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-apple text-sm font-medium border transition-colors duration-200 ${
                showPerdidos
                  ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              ❌ Perdidos
              {perdidosCount > 0 && <span className="text-xs font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{perdidosCount}</span>}
            </button>
          )}
          {funil === 'venda' && (
            <button
              onClick={() => setShowPerdidosVenda(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-apple text-sm font-medium border transition-colors duration-200 ${
                showPerdidosVenda
                  ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              ❌ Perdidos
              {perdidosCount > 0 && <span className="text-xs font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{perdidosCount}</span>}
            </button>
          )}
          {isGerente && onImportNegocios && (
            <label className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-1.5 px-3 rounded-apple transition-colors duration-200 shadow-apple-sm flex items-center gap-1.5 cursor-pointer text-sm">
              <input type="file" accept=".csv" className="hidden" onChange={handleImportNegocios} />
              📥 Importar Negócios Agendor
            </label>
          )}
        </div>
        <div className="flex items-center gap-2">
          {importStatus && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-apple px-3 py-1.5 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-xs text-indigo-800">{importStatus}</p>
            </div>
          )}
          {alertCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-apple px-3 py-1.5 flex items-center gap-2">
              <span>🚨</span>
              <p className="text-xs text-red-800"><span className="font-bold">{alertCount}</span> com prazo vencendo</p>
            </div>
          )}
        </div>
      </div>

      <div className={`flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory lg:overflow-x-visible lg:pb-0 ${
        stagesAtivos.length === 2 ? 'lg:grid lg:grid-cols-2' :
        stagesAtivos.length === 3 ? 'lg:grid lg:grid-cols-3' :
        'lg:grid lg:grid-cols-3'
      }`}>
        {stagesAtivos.map((stage) => {
          const stageClientes = sortCards(clientesFiltrados.filter(c => c.etapa === stage.key), sortBy)
          const stageValor = stageClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
          const stageWeighted = Math.round(stageValor * stage.prob)
          return (
            <div key={stage.title} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 min-w-[260px] sm:min-w-[280px] lg:min-w-0 snap-start flex-shrink-0 lg:flex-shrink" onDragOver={onDragOver} onDrop={(e) => onDrop(e, stage.key)}>
              <div className="p-3">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="font-medium text-gray-900 text-sm">{stage.icon} {stage.title}</h3>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${stage.badge}`}>{stageClientes.length}</span>
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
