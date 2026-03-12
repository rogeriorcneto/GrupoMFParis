import React, { useMemo } from 'react'
import type { Cliente, Vendedor, Interacao, FunilViewProps } from '../../types'
import { diasDesde, getCardUrgencia, getNextAction, mapEtapaAgendor, mapCategoriaPerdaAgendor, sortCards, prazosEtapa } from '../../utils/funil-logic'
import { stageLabels, subStatusAmostraLabels, subStatusFollowUpLabels } from '../../utils/constants'

function FunilView({ clientes, vendedores, interacoes, loggedUser, onDragStart, onDragOver, onDrop, onQuickAction, onClickCliente, isGerente = false, onImportNegocios }: FunilViewProps & { onClickCliente?: (c: Cliente) => void; isGerente?: boolean }) {
  const [filterVendedorId, setFilterVendedorId] = React.useState<number | ''>('')
  const [sortBy, setSortBy] = React.useState<'urgencia' | 'score' | 'valor' | 'antigo' | 'recente'>('urgencia')
  const [importStatus, setImportStatus] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [hidePerdidos, setHidePerdidos] = React.useState(false)
  const [hideInativos, setHideInativos] = React.useState(true)
  const [hideAmostraPerdida, setHideAmostraPerdida] = React.useState(true)
  const [filterSegmento, setFilterSegmento] = React.useState('')
  const [filterLocalizacao, setFilterLocalizacao] = React.useState('')

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

  // Vendedor vê apenas: Prospecção, Amostra, Proposta, Negociação, Follow-up
  // Gerente vê todas: Leads, Prospecção, Amostra, Amostra Perdida, Proposta, Negociação, Follow-up, Inativos, Perdido
  const VENDEDOR_ETAPAS = new Set(['prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up'])
  const GERENTE_ETAPAS = new Set(['lead', 'prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up', 'inativo'])
  const FUNIL_ETAPAS = isGerente ? GERENTE_ETAPAS : VENDEDOR_ETAPAS

  const allStages = [
    { title: 'Leads', key: 'lead', badge: 'bg-emerald-100 text-emerald-800', icon: '🌐', prob: 0.05, gerenteOnly: true },
    { title: 'Prospecção', key: 'prospecção', badge: 'bg-sky-100 text-sky-800', icon: '🔎', prob: 0.10, gerenteOnly: false },
    { title: 'Amostra', key: 'amostra', badge: 'bg-amber-100 text-amber-800', icon: '🧪', prob: 0.25, gerenteOnly: false },
    { title: 'Amostra Perdida', key: 'amostra_perdida', badge: 'bg-orange-100 text-orange-800', icon: '🧪❌', prob: 0.05, gerenteOnly: true },
    { title: 'Proposta', key: 'proposta', badge: 'bg-indigo-100 text-indigo-800', icon: '📋', prob: 0.40, gerenteOnly: false },
    { title: 'Negociação', key: 'negociacao', badge: 'bg-purple-100 text-purple-800', icon: '💰', prob: 0.60, gerenteOnly: false },
    { title: 'Follow-up', key: 'follow_up', badge: 'bg-blue-100 text-blue-800', icon: '📦', prob: 0.80, gerenteOnly: false },
    { title: 'Inativos', key: 'inativo', badge: 'bg-gray-200 text-gray-700', icon: '💤', prob: 0.10, gerenteOnly: true },
    { title: 'Perdido', key: 'perdido', badge: 'bg-red-100 text-red-800', icon: '❌', prob: 0, gerenteOnly: true }
  ]

  const stages = allStages.filter(s => isGerente || !s.gerenteOnly)

  const displayedStages = useMemo(() => {
    return stages.filter(stage => {
      if (hidePerdidos && stage.key === 'perdido') return false
      if (hideInativos && stage.key === 'inativo') return false
      if (hideAmostraPerdida && stage.key === 'amostra_perdida') return false
      return true
    })
  }, [hideAmostraPerdida, hideInativos, hidePerdidos, isGerente])

  // P1-2: O(1) vendedor lookup instead of O(m) find per card
  const vendedorMap = useMemo(() => {
    const m = new Map<number, Vendedor>()
    vendedores.forEach(v => m.set(v.id, v))
    return m
  }, [vendedores])

  // Vendedor só vê seus clientes; gerente pode filtrar por vendedor ou ver todos
  const clientesFiltradosVendedor = useMemo(() => {
    if (!isGerente && loggedUser?.id) return clientes.filter(c => c.vendedorId === loggedUser.id)
    return filterVendedorId ? clientes.filter(c => c.vendedorId === filterVendedorId) : clientes
  }, [clientes, filterVendedorId, isGerente, loggedUser?.id])

  const clientesFiltrados = useMemo(() => {
    let base = clientesFiltradosVendedor.filter(c =>
      FUNIL_ETAPAS.has(c.etapa) || c.etapa === 'perdido'
    )
    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter(c =>
        c.razaoSocial.toLowerCase().includes(q) ||
        (c.nomeFantasia || '').toLowerCase().includes(q) ||
        (c.contatoNome || '').toLowerCase().includes(q) ||
        (c.cnpj || '').includes(q)
      )
    }
    if (filterSegmento) {
      base = base.filter(c => c.etapa !== 'lead' || (c.segmento || '').toLowerCase().includes(filterSegmento.toLowerCase()))
    }
    if (filterLocalizacao) {
      base = base.filter(c => c.etapa !== 'lead' || (c.localizacao || '').toLowerCase().includes(filterLocalizacao.toLowerCase()))
    }
    return base
  }, [clientesFiltradosVendedor, search, filterSegmento, filterLocalizacao])

  // P1-1: Single O(n) pass to group clients by stage (instead of 7× filter)
  const stageMap = useMemo(() => {
    const m = new Map<string, Cliente[]>()
    displayedStages.forEach(s => m.set(s.key, []))
    clientesFiltrados.forEach(c => {
      const arr = m.get(c.etapa)
      if (arr) arr.push(c)
    })
    return m
  }, [clientesFiltrados, displayedStages])

  // Memoized metrics using stageMap (no re-filtering)
  const { totalPipeline, receitaPonderada, taxaConversao, tempoMedio, activeCount } = useMemo(() => {
    let pipeline = 0, weighted = 0, followUpCount = 0, nonPerdidoCount = 0
    let totalDias = 0, histCount = 0
    const probMap = new Map(displayedStages.map(s => [s.key, s.prob]))

    clientesFiltrados.forEach(c => {
      const prob = probMap.get(c.etapa) || 0
      const val = c.valorEstimado || 0
      if (c.etapa !== 'perdido' && c.etapa !== 'inativo') { pipeline += val; nonPerdidoCount++ }
      if (c.etapa === 'follow_up') followUpCount++
      weighted += val * prob
      if (c.historicoEtapas && c.historicoEtapas.length > 1) {
        const h = c.historicoEtapas
        const first = new Date(h[0].data).getTime()
        const last = new Date(h[h.length - 1].data).getTime()
        totalDias += Math.floor((last - first) / 86400000)
        histCount++
      }
    })

    return {
      totalPipeline: pipeline,
      receitaPonderada: weighted,
      taxaConversao: nonPerdidoCount > 0 ? Math.round((followUpCount / nonPerdidoCount) * 100) : 0,
      tempoMedio: histCount > 0 ? Math.round(totalDias / histCount) : 0,
      activeCount: nonPerdidoCount,
    }
  }, [clientesFiltrados, displayedStages])

  const urgenciaBorder = (u: string) => {
    if (u === 'critico') return 'border-l-4 border-l-red-500 bg-red-50'
    if (u === 'atencao') return 'border-l-4 border-l-yellow-500 bg-yellow-50'
    return 'bg-gray-50 border border-gray-200'
  }

  const renderCardInfo = (cliente: Cliente) => {
    const dias = diasDesde(cliente.dataEntradaEtapa)
    switch (cliente.etapa) {
      case 'prospecção': {
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.diasInativo !== undefined && cliente.diasInativo > 3 && <p className="text-[10px] text-orange-600">⏳ Inativo há {cliente.diasInativo}d</p>}
            {cliente.origemLead && <span className="inline-block px-1.5 py-0.5 text-[9px] bg-sky-100 text-sky-700 rounded-full">{cliente.origemLead}</span>}
          </div>
        )
      }
      case 'amostra': {
        const subLabel = cliente.statusAmostra ? subStatusAmostraLabels[cliente.statusAmostra] || cliente.statusAmostra : 'Pendente'
        const subIdx = cliente.statusAmostra ? ['solicitada', 'aguardando_gerente', 'liberada', 'coletada', 'entregue', 'em_teste', 'aprovada', 'reprovada'].indexOf(cliente.statusAmostra) : 0
        const pctSub = Math.min(((subIdx + 1) / 7) * 100, 100)
        const pctPrazo = Math.min((dias / 45) * 100, 100)
        const diasRestam = Math.max(45 - dias, 0)
        return (
          <div className="mt-1.5 space-y-1">
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-full ${cliente.statusAmostra === 'aprovada' ? 'bg-green-100 text-green-700' : cliente.statusAmostra === 'reprovada' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{subLabel}</span>
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className="h-1.5 rounded-full transition-all bg-amber-500" style={{ width: `${pctSub}%` }} /></div>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1"><div className={`h-1 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 80 ? 'bg-yellow-500' : 'bg-gray-400'}`} style={{ width: `${pctPrazo}%` }} /></div>
              <span className={`text-[9px] font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 7 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `${diasRestam}d` : 'Vencido!'}</span>
            </div>
          </div>
        )
      }
      case 'proposta': {
        const pctPrazo = Math.min((dias / 30) * 100, 100)
        const diasRestam = Math.max(30 - dias, 0)
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.valorEstimado && <p className="text-[10px] font-bold text-indigo-700">� R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p>}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 80 ? 'bg-yellow-500' : 'bg-indigo-500'}`} style={{ width: `${pctPrazo}%` }} /></div>
              <span className={`text-[9px] font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 7 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `${diasRestam}d` : 'Vencido!'}</span>
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
      case 'follow_up': {
        const subLabel = cliente.statusFollowUp ? subStatusFollowUpLabels[cliente.statusFollowUp] || cliente.statusFollowUp : 'Aguardando'
        const subIdx = cliente.statusFollowUp ? ['pedido_aprovado', 'em_producao', 'faturado', 'expedido', 'entregue', 'satisfacao_pendente', 'concluido'].indexOf(cliente.statusFollowUp) : 0
        const pctSub = Math.min(((subIdx + 1) / 7) * 100, 100)
        return (
          <div className="mt-1.5 space-y-1">
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-full ${cliente.statusFollowUp === 'concluido' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{subLabel}</span>
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className="h-1.5 rounded-full transition-all bg-blue-500" style={{ width: `${pctSub}%` }} /></div>
            </div>
            {cliente.omieCodigoRastreio && <p className="text-[10px] text-gray-500">� Rastreio: {cliente.omieCodigoRastreio}</p>}
            {cliente.omieNotaFiscal && <p className="text-[10px] text-gray-500">� NF: {cliente.omieNotaFiscal}</p>}
          </div>
        )
      }
      case 'lead': {
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.segmento && <span className="inline-block px-1.5 py-0.5 text-[9px] bg-emerald-100 text-emerald-700 rounded-full">{cliente.segmento}</span>}
            {cliente.localizacao && <p className="text-[10px] text-gray-500">📍 {cliente.localizacao}</p>}
            {cliente.origemLead && <span className="inline-block px-1.5 py-0.5 text-[9px] bg-sky-100 text-sky-700 rounded-full">{cliente.origemLead}</span>}
          </div>
        )
      }
      case 'amostra_perdida': {
        const tentativa = cliente.tentativaAmostra || 0
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.motivoReprovacao && <p className="text-[10px] text-red-600">❌ {cliente.motivoReprovacao}</p>}
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-full ${tentativa >= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              {tentativa >= 2 ? 'Sem tentativas' : `${2 - tentativa}ª tentativa disponível`}
            </span>
            {cliente.etapaAnterior && <p className="text-[10px] text-gray-500">↩ Veio de: {stageLabels[cliente.etapaAnterior] || cliente.etapaAnterior}</p>}
          </div>
        )
      }
      case 'inativo': {
        const diasIn = cliente.diasInativo || 0
        return (
          <div className="mt-1.5 space-y-1">
            <p className="text-[10px] text-gray-600">💤 Inativo há {diasIn} dias</p>
            {cliente.etapaAnterior && <p className="text-[10px] text-gray-500">↩ Veio de: {stageLabels[cliente.etapaAnterior] || cliente.etapaAnterior}</p>}
            {cliente.totalCompras !== undefined && cliente.totalCompras > 0 && <p className="text-[10px] text-green-700">🛒 {cliente.totalCompras} compra(s)</p>}
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
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pctReconquista >= 100 ? 'bg-green-500' : 'bg-gray-400'}`} style={{ width: `${pctReconquista}%` }} /></div>
              <span className={`text-[9px] font-bold ${diasPerdido >= 60 ? 'text-green-600' : 'text-gray-500'}`}>{diasPerdido >= 60 ? '🔄 Reconquistar!' : `${60 - diasPerdido}d`}</span>
            </div>
          </div>
        )
      }
      default: return null
    }
  }

  const alertCount = useMemo(() => clientesFiltrados.filter(c => getCardUrgencia(c) !== 'normal').length, [clientesFiltrados])

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
      {/* KPI bar — inline compacta */}
      <div className="flex items-center gap-3 px-1 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
          <span className="text-[10px] text-gray-400 uppercase font-semibold">Pipeline</span>
          <span className="text-sm font-bold text-gray-900">R$ {totalPipeline.toLocaleString('pt-BR')}</span>
          <span className="text-[10px] text-gray-400">({activeCount})</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
          <span className="text-[10px] text-gray-400 uppercase font-semibold">Prevista</span>
          <span className="text-sm font-bold text-green-600">R$ {Math.round(receitaPonderada).toLocaleString('pt-BR')}</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
          <span className="text-[10px] text-gray-400 uppercase font-semibold">Conversão</span>
          <span className="text-sm font-bold text-primary-600">{taxaConversao}%</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
          <span className="text-[10px] text-gray-400 uppercase font-semibold">Ciclo</span>
          <span className="text-sm font-bold text-purple-600">{tempoMedio}d</span>
        </div>
        {alertCount > 0 && (
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 shadow-sm ml-auto">
            <span className="text-xs">🚨</span>
            <span className="text-xs font-bold text-red-700">{alertCount} vencendo</span>
          </div>
        )}
      </div>

      {/* Toolbar — 1 linha */}
      <div className="flex items-center gap-2 px-1 pb-2 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-7 pr-6 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[10px]">✕</button>}
        </div>
        {isGerente && (
          <select value={filterVendedorId} onChange={(e) => setFilterVendedorId(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-500">
            <option value="">Todos vendedores</option>
            {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        )}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-500">
          <option value="urgencia">Urgência</option>
          <option value="score">Score</option>
          <option value="valor">Valor</option>
          <option value="antigo">Mais antigo</option>
          <option value="recente">Mais recente</option>
        </select>
        <input type="text" value={filterSegmento} onChange={e => setFilterSegmento(e.target.value)} placeholder="Segmento" className="px-2 py-1 border border-gray-300 rounded-lg text-xs w-24 focus:outline-none focus:ring-1 focus:ring-primary-500" />
        <input type="text" value={filterLocalizacao} onChange={e => setFilterLocalizacao(e.target.value)} placeholder="Local" className="px-2 py-1 border border-gray-300 rounded-lg text-xs w-24 focus:outline-none focus:ring-1 focus:ring-primary-500" />

        {isGerente && (
          <>
            <div className="h-5 w-px bg-gray-300" />

            <button onClick={() => setHideAmostraPerdida(v => !v)} className={`h-7 w-7 flex items-center justify-center rounded-md text-xs border transition-colors ${hideAmostraPerdida ? 'bg-white border-gray-300 text-gray-400 hover:bg-gray-50' : 'bg-orange-50 text-orange-600 border-orange-200'}`} title={hideAmostraPerdida ? 'Mostrar Amostra Perdida' : 'Ocultar Amostra Perdida'}>
              🧪
            </button>
            <button onClick={() => setHideInativos(v => !v)} className={`h-7 w-7 flex items-center justify-center rounded-md text-xs border transition-colors ${hideInativos ? 'bg-white border-gray-300 text-gray-400 hover:bg-gray-50' : 'bg-gray-100 text-gray-600 border-gray-300'}`} title={hideInativos ? 'Mostrar Inativos' : 'Ocultar Inativos'}>
              💤
            </button>
            <button onClick={() => setHidePerdidos(v => !v)} className={`h-7 w-7 flex items-center justify-center rounded-md text-xs border transition-colors ${hidePerdidos ? 'bg-white border-gray-300 text-gray-400 hover:bg-gray-50' : 'bg-red-50 text-red-600 border-red-200'}`} title={hidePerdidos ? 'Mostrar Perdidos' : 'Ocultar Perdidos'}>
              ❌
            </button>
          </>
        )}

        {isGerente && onImportNegocios && (
          <label className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-1 px-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-1 cursor-pointer text-xs ml-auto">
            <input type="file" accept=".csv" className="hidden" onChange={handleImportNegocios} />
            📥 Importar
          </label>
        )}
        {importStatus && (
          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
            <div className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-[10px] text-indigo-700">{importStatus}</span>
          </div>
        )}
      </div>

      {/* Kanban columns — scroll horizontal com colunas de largura fixa igual */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-2 h-full px-1 pb-2" style={{ minWidth: `${displayedStages.length * 220}px` }}>
          {displayedStages.map((stage) => {
            const stageClientes = sortCards(stageMap.get(stage.key) || [], sortBy)
            const stageValor = stageClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
            const stageWeighted = Math.round(stageValor * stage.prob)
            return (
              <div key={stage.key} className="flex-1 min-w-[200px] max-w-[320px] flex flex-col bg-gray-50 rounded-lg border border-gray-200 overflow-hidden" onDragOver={onDragOver} onDrop={(e) => onDrop(e, stage.key)}>
                {/* Column header — compacto e colorido */}
                <div className="px-2.5 py-2 bg-white border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="font-semibold text-gray-800 text-[11px] truncate leading-none">{stage.icon} {stage.title}</h3>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full leading-none ${stage.badge}`}>{stageClientes.length}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-gray-500 font-medium">R$ {stageValor.toLocaleString('pt-BR')}</span>
                    {stage.prob > 0 && <span className="text-[9px] text-gray-400">{Math.round(stage.prob * 100)}%</span>}
                  </div>
                </div>

                {/* Cards area — scroll vertical */}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {stageClientes.map((cliente) => {
                    const urgencia = getCardUrgencia(cliente)
                    const nextAction = getNextAction(cliente)
                    const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
                    return (
                      <div
                        key={cliente.id}
                        className={`p-2 rounded-md bg-white ${isGerente ? 'cursor-move' : 'cursor-pointer'} hover:shadow-md transition-all duration-150 group ${
                          urgencia === 'critico' ? 'border-l-[3px] border-l-red-500 border border-red-100' :
                          urgencia === 'atencao' ? 'border-l-[3px] border-l-yellow-400 border border-yellow-100' :
                          'border border-gray-150 hover:border-gray-300'
                        }`}
                        draggable={isGerente}
                        onDragStart={(e) => isGerente ? onDragStart(e, cliente, stage.key) : e.preventDefault()}
                        onClick={() => onClickCliente?.(cliente)}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="font-semibold text-[11px] text-gray-900 leading-tight line-clamp-2">{cliente.razaoSocial}</h4>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {urgencia !== 'normal' && <span className="text-[10px]">{urgencia === 'critico' ? '🔴' : '🟡'}</span>}
                            {cliente.score !== undefined && <span className="text-[9px] font-bold text-gray-400">{cliente.score}</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-gray-500 truncate">{cliente.contatoNome}</span>
                          {vendedor && <span className="text-[9px] text-primary-500 font-medium flex-shrink-0">{vendedor.nome.split(' ')[0]}</span>}
                        </div>
                        {cliente.valorEstimado ? <p className="text-[10px] font-bold text-primary-600 mt-0.5">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p> : null}
                        {renderCardInfo(cliente)}
                        {nextAction && <p className={`text-[9px] font-medium mt-1 leading-snug ${nextAction.color}`}>{nextAction.text}</p>}
                        {cliente.produtosInteresse && cliente.produtosInteresse.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {cliente.produtosInteresse.slice(0, 2).map(p => (<span key={p} className="px-1 py-0 text-[8px] bg-primary-50 text-primary-700 rounded-full border border-primary-100 truncate max-w-[80px]">{p}</span>))}
                            {cliente.produtosInteresse.length > 2 && <span className="text-[8px] text-gray-400">+{cliente.produtosInteresse.length - 2}</span>}
                          </div>
                        )}
                        <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'whatsapp', 'contato') }} className="px-1 py-0.5 text-[8px] bg-green-50 text-green-700 rounded hover:bg-green-100 font-medium" title="WhatsApp">💬</button>
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'email', 'contato') }} className="px-1 py-0.5 text-[8px] bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-medium" title="Email">📧</button>
                          <button onClick={(e) => { e.stopPropagation(); onQuickAction(cliente, 'ligacao', 'contato') }} className="px-1 py-0.5 text-[8px] bg-orange-50 text-orange-700 rounded hover:bg-orange-100 font-medium" title="Ligar">📞</button>
                        </div>
                      </div>
                    )
                  })}
                  {stageClientes.length === 0 && <div className="p-4 text-center text-gray-400 text-[11px]">Arraste clientes aqui</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default FunilView
