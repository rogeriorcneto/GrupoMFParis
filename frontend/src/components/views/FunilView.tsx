import React, { useEffect, useMemo, useState } from 'react'
import type { Cliente, Vendedor, Interacao, Pedido, FunilViewProps, PropostaHistorico } from '../../types'
import { diasDesde, getCardUrgencia, getNextAction, mapEtapaAgendor, mapCategoriaPerdaAgendor, sortCards, prazosEtapa } from '../../utils/funil-logic'
import { stageLabels, subStatusAmostraLabels, subStatusFollowUpLabels } from '../../utils/constants'
import { getAmostraLocked, getFollowUpLocked } from '../../utils/business-rules'
import { fetchPropostasByCliente } from '../../lib/database'
import { omieSyncLogistics } from '../../lib/omieApi'
import CallRecorder from '../CallRecorder'

function FunilView({ clientes, vendedores, interacoes, pedidos = [], propostas = [], loggedUser, onDragStart, onDragOver, onDrop, onQuickAction, onClickCliente, isGerente = false, onImportNegocios, moverCliente, onNovoCiclo }: FunilViewProps & { onClickCliente?: (c: Cliente) => void; isGerente?: boolean; propostas?: PropostaHistorico[] }) {
  const [filterVendedorId, setFilterVendedorId] = React.useState<number | ''>('')
  const [sortBy, setSortBy] = React.useState<'urgencia' | 'score' | 'valor' | 'antigo' | 'recente'>('urgencia')
  const [importStatus, setImportStatus] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [hidePerdidos, setHidePerdidos] = React.useState(true)
  const [hideInativos, setHideInativos] = React.useState(true)
  const [hideAmostraPerdida, setHideAmostraPerdida] = React.useState(true)
  const [filterSegmento, setFilterSegmento] = React.useState('')
  const [filterLocalizacao, setFilterLocalizacao] = React.useState('')
  const [callRecordingCliente, setCallRecordingCliente] = useState<Cliente | null>(null)
  const [lockProcessing, setLockProcessing] = useState(false)
  const [propostasLoaded, setPropostasLoaded] = useState<PropostaHistorico[]>([])
  const [syncing, setSyncing] = useState(false)
  const [showNovosCiclos, setShowNovosCiclos] = useState(false)

  // Lock detection: clients in amostra 45+ days or follow_up entregue 45+ days
  const amostraLockedClients = useMemo(() => {
    if (!loggedUser || isGerente) return []
    return getAmostraLocked(clientes, loggedUser.id)
  }, [clientes, loggedUser, isGerente])

  const followUpLockedClients = useMemo(() => {
    if (!loggedUser || isGerente) return []
    return getFollowUpLocked(clientes, loggedUser.id)
  }, [clientes, loggedUser, isGerente])

  const hasLock = amostraLockedClients.length > 0 || followUpLockedClients.length > 0

  // Carregar propostas de todos os clientes
  useEffect(() => {
    const loadAll = async () => {
      const all: PropostaHistorico[] = []
      for (const c of clientes) {
        try {
          const list = await fetchPropostasByCliente(c.id)
          all.push(...list)
        } catch { /* ignore */ }
      }
      setPropostasLoaded(all)
    }
    loadAll()
  }, [clientes])

  // Agrupar propostas por cliente (use prop se fornecida, senão loaded)
  const propostasPorCliente = useMemo(() => {
    const source = propostas.length > 0 ? propostas : propostasLoaded
    const map = new Map<number, PropostaHistorico[]>()
    for (const p of source) {
      const list = map.get(p.clienteId) || []
      list.push(p)
      map.set(p.clienteId, list)
    }
    // Ordenar por data (mais recente primeiro)
    for (const [id, list] of map) {
      list.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
      map.set(id, list)
    }
    return map
  }, [propostas, propostasLoaded])

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
  const VENDEDOR_ETAPAS = new Set(['prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up'])
  const GERENTE_ETAPAS = new Set(['lead', 'prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up', 'inativo'])
  const FUNIL_ETAPAS = isGerente ? GERENTE_ETAPAS : VENDEDOR_ETAPAS

  const allStages = [
    { title: 'Leads', key: 'lead', badge: 'bg-emerald-100 text-emerald-800', icon: '🌐', prob: 0.05, gerenteOnly: true },
    { title: 'Prospecção', key: 'prospecção', badge: 'bg-sky-100 text-sky-800', icon: '🔎', prob: 0.10, gerenteOnly: false },
    { title: 'Amostra', key: 'amostra', badge: 'bg-amber-100 text-amber-800', icon: '🧪', prob: 0.25, gerenteOnly: false },
    { title: 'Amostra Perdida', key: 'amostra_perdida', badge: 'bg-orange-100 text-orange-800', icon: '🚫', prob: 0.05, gerenteOnly: false },
    { title: 'Inativos', key: 'inativo', badge: 'bg-gray-200 text-gray-700', icon: '💤', prob: 0.10, gerenteOnly: true },
    { title: 'Proposta', key: 'proposta', badge: 'bg-indigo-100 text-indigo-800', icon: '📋', prob: 0.40, gerenteOnly: false },
    { title: 'Negociação', key: 'negociacao', badge: 'bg-purple-100 text-purple-800', icon: '🤝', prob: 0.60, gerenteOnly: false },
    { title: 'Follow-up', key: 'follow_up', badge: 'bg-blue-100 text-blue-800', icon: '📦', prob: 0.80, gerenteOnly: false },
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
      // Não incluir clientes de novo ciclo na lista normal de proposta
      if (c.etapa === 'proposta' && c.novoCiclo) return
      const arr = m.get(c.etapa)
      if (arr) arr.push(c)
    })
    return m
  }, [clientesFiltrados, displayedStages])

  // Clientes em proposta que são novos ciclos (duplicados de perdidos)
  const clientesNovoCicloProposta = useMemo(() => {
    return clientesFiltradosVendedor.filter(c => 
      c.etapa === 'proposta' && c.novoCiclo === true
    )
  }, [clientesFiltradosVendedor])

  // Clientes em follow_up OU perdidos vindo de negociação que podem iniciar novo ciclo
  const clientesNovoCiclo = useMemo(() => {
    const base = clientesFiltradosVendedor.filter(c => {
      // Clientes em follow-up normais (não aguardando aprovação)
      if (c.etapa === 'follow_up' && c.statusFollowUp !== 'aguardando_aprovacao_gerente') return true
      // Clientes perdidos que vieram de negociação (podem ser revividos)
      if (c.etapa === 'perdido' && c.etapaAnterior === 'negociacao' && (c.statusFollowUp as string) === 'perdido_negociacao') return true
      return false
    })
    if (search.trim()) {
      const q = search.toLowerCase()
      return base.filter(c =>
        c.razaoSocial.toLowerCase().includes(q) ||
        (c.nomeFantasia || '').toLowerCase().includes(q) ||
        (c.contatoNome || '').toLowerCase().includes(q)
      )
    }
    return base
  }, [clientesFiltradosVendedor, search])

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

  // Map pedidos by clienteId for logistics info on cards
  const pedidosByCliente = useMemo(() => {
    const map = new Map<number, Pedido[]>()
    for (const p of pedidos) {
      const arr = map.get(p.clienteId) || []
      arr.push(p)
      map.set(p.clienteId, arr)
    }
    return map
  }, [pedidos])

  const getClientePedidoInfo = (clienteId: number) => {
    const ps = pedidosByCliente.get(clienteId) || []
    if (ps.length === 0) return null
    const sorted = [...ps].sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())
    const latest = sorted[0]
    const amostras = ps.filter(p => p.tipo === 'bonificacao')
    const vendas = ps.filter(p => p.tipo === 'venda' || !p.tipo)
    return { latest, total: ps.length, amostras: amostras.length, vendas: vendas.length, all: sorted }
  }

  const urgenciaBorder = (u: string) => {
    if (u === 'critico') return 'border-l-4 border-l-red-500 bg-red-50'
    if (u === 'atencao') return 'border-l-4 border-l-yellow-500 bg-yellow-50'
    return 'bg-gray-50 border border-gray-200'
  }

  const renderCardInfo = (cliente: Cliente) => {
    const dias = diasDesde(cliente.dataEntradaEtapa)
    switch (cliente.etapa) {
      case 'prospecção': {
        const diasInativoProsp = cliente.diasInativo || 0
        const diasEtapaProsp = dias
        const pctContato = Math.min((diasInativoProsp / 5) * 100, 100)
        const pctEtapa60 = Math.min((diasEtapaProsp / 60) * 100, 100)
        return (
          <div className="mt-1.5 space-y-1">
            {diasInativoProsp >= 3 && (
              <div className="flex items-center gap-1">
                <span className={`text-[9px] font-bold ${diasInativoProsp >= 5 ? 'text-red-600' : 'text-orange-600'}`}>
                  {diasInativoProsp >= 5 ? '🚨' : '⏳'} Sem contato: {diasInativoProsp}d / 5d
                </span>
              </div>
            )}
            {diasInativoProsp >= 3 && (
              <div className="flex items-center gap-1">
                <div className="flex-1 bg-gray-200 rounded-full h-1"><div className={`h-1 rounded-full transition-all ${pctContato >= 100 ? 'bg-red-500' : 'bg-orange-400'}`} style={{ width: `${pctContato}%` }} /></div>
              </div>
            )}
            {diasEtapaProsp >= 30 && (
              <div className="flex items-center gap-1">
                <div className="flex-1 bg-gray-200 rounded-full h-1"><div className={`h-1 rounded-full transition-all ${pctEtapa60 >= 100 ? 'bg-red-500' : 'bg-yellow-400'}`} style={{ width: `${pctEtapa60}%` }} /></div>
                <span className={`text-[9px] font-bold ${diasEtapaProsp >= 60 ? 'text-red-600' : 'text-yellow-600'}`}>{Math.max(60 - diasEtapaProsp, 0)}d</span>
              </div>
            )}
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
        const pctPrazo = Math.min((dias / 60) * 100, 100)
        const diasRestam = Math.max(60 - dias, 0)
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
        const subIdx = cliente.statusFollowUp ? ['aguardando_aprovacao_gerente', 'pedido_aprovado', 'em_producao', 'faturado', 'expedido', 'entregue', 'satisfacao_pendente', 'concluido'].indexOf(cliente.statusFollowUp) : 0
        const pctSub = Math.min(((subIdx + 1) / 8) * 100, 100)
        const subBadgeColor = cliente.statusFollowUp === 'concluido' ? 'bg-green-100 text-green-700' :
          cliente.statusFollowUp === 'entregue' ? 'bg-emerald-100 text-emerald-700' :
          cliente.statusFollowUp === 'expedido' ? 'bg-cyan-100 text-cyan-700' :
          cliente.statusFollowUp === 'faturado' ? 'bg-indigo-100 text-indigo-700' :
          cliente.statusFollowUp === 'aguardando_aprovacao_gerente' ? 'bg-amber-100 text-amber-700' :
          'bg-blue-100 text-blue-700'
        return (
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-full ${subBadgeColor}`}>{subLabel}</span>
              {cliente.omieStatusLogistico && (
                <span className="inline-block px-1.5 py-0.5 text-[9px] bg-gray-100 text-gray-600 rounded-full border border-gray-200">🔄 Omie: {cliente.omieStatusLogistico}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className="h-1.5 rounded-full transition-all bg-blue-500" style={{ width: `${pctSub}%` }} /></div>
            </div>
            {cliente.omieCodigoRastreio && <p className="text-[10px] text-gray-500">🚚 Rastreio: {cliente.omieCodigoRastreio}</p>}
            {cliente.omieNotaFiscal && <p className="text-[10px] text-gray-500">📄 NF: {cliente.omieNotaFiscal}</p>}
            {cliente.omieDataFaturamento && <p className="text-[10px] text-gray-400">Faturado: {cliente.omieDataFaturamento}</p>}
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

        <div className="h-5 w-px bg-gray-300" />
        <button onClick={() => setHideAmostraPerdida(v => !v)} className={`h-7 w-7 flex items-center justify-center rounded-md text-xs border transition-colors ${hideAmostraPerdida ? 'bg-white border-gray-300 text-gray-400 hover:bg-gray-50' : 'bg-orange-50 text-orange-600 border-orange-200'}`} title={hideAmostraPerdida ? 'Mostrar Amostra Perdida' : 'Ocultar Amostra Perdida'}>
          🚫
        </button>
        {isGerente && (
          <>
            <button onClick={() => setHideInativos(v => !v)} className={`h-7 w-7 flex items-center justify-center rounded-md text-xs border transition-colors ${hideInativos ? 'bg-white border-gray-300 text-gray-400 hover:bg-gray-50' : 'bg-gray-100 text-gray-600 border-gray-300'}`} title={hideInativos ? 'Mostrar Inativos' : 'Ocultar Inativos'}>
              💤
            </button>
            <button onClick={() => setHidePerdidos(v => !v)} className={`h-7 w-7 flex items-center justify-center rounded-md text-xs border transition-colors ${hidePerdidos ? 'bg-white border-gray-300 text-gray-400 hover:bg-gray-50' : 'bg-red-50 text-red-600 border-red-200'}`} title={hidePerdidos ? 'Mostrar Perdidos' : 'Ocultar Perdidos'}>
              ❌
            </button>
          </>
        )}

        {isGerente && (
          <button
            onClick={async () => {
              if (syncing) return
              setSyncing(true)
              try {
                const res = await omieSyncLogistics()
                if (res.success && res.data) {
                  alert(`✅ Sync Omie concluído!\n${res.data.atualizados} atualizados, ${res.data.erros?.length || 0} erros`)
                  window.location.reload()
                } else {
                  alert(`⚠️ Sync Omie: ${res.error || 'Sem alterações'}`)
                }
              } catch { alert('❌ Erro ao sincronizar com Omie') }
              finally { setSyncing(false) }
            }}
            disabled={syncing}
            className={`h-7 px-2 flex items-center gap-1 rounded-md text-xs border transition-colors ${syncing ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'}`}
            title="Sincronizar status dos pedidos com o Omie"
          >
            {syncing ? <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> : '🔄'}
            <span>Sync Omie</span>
          </button>
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
        <div className="flex gap-3 h-full px-2 pb-2" style={{ minWidth: `${displayedStages.length * 290}px` }}>
          {displayedStages.map((stage) => {
            const stageClientes = sortCards(stageMap.get(stage.key) || [], sortBy)
            const stageValor = stageClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
            const stageWeighted = Math.round(stageValor * stage.prob)
            const isProposta = stage.key === 'proposta'
            const novoCicloCount = isProposta ? clientesNovoCiclo.length + clientesNovoCicloProposta.length : 0
            return (
              <div key={stage.key} className="flex-1 min-w-[260px] max-w-[380px] flex flex-col bg-gray-50 rounded-lg border border-gray-200 overflow-hidden" onDragOver={onDragOver} onDrop={(e) => onDrop(e, stage.key)}>
                {/* Column header */}
                <div className="px-3 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="font-bold text-gray-800 text-xs truncate leading-none">{stage.icon} {stage.title}</h3>
                    <div className="flex items-center gap-1.5">
                      {isProposta && novoCicloCount > 0 && (
                        <button
                          onClick={() => setShowNovosCiclos(v => !v)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${showNovosCiclos ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'}`}
                          title={showNovosCiclos ? 'Ocultar clientes em novo ciclo (Follow-up)' : `Mostrar ${novoCicloCount} cliente(s) prontos para novo ciclo`}
                        >
                          🔄 {novoCicloCount}
                        </button>
                      )}
                      <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full leading-none ${stage.badge}`}>{stageClientes.length}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-gray-500 font-medium">R$ {stageValor.toLocaleString('pt-BR')}</span>
                    {stage.prob > 0 && <span className="text-[10px] text-gray-400">{Math.round(stage.prob * 100)}%</span>}
                  </div>
                </div>

                {/* Cards area — scroll vertical */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageClientes.map((cliente) => {
                    const urgencia = getCardUrgencia(cliente)
                    const nextAction = getNextAction(cliente)
                    const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
                    return (
                      <div
                        key={cliente.id}
                        className={`p-3 rounded-lg bg-white ${isGerente ? 'cursor-move' : 'cursor-pointer'} hover:shadow-md transition-all duration-150 group ${
                          urgencia === 'critico' ? 'border-l-[3px] border-l-red-500 border border-red-100' :
                          urgencia === 'atencao' ? 'border-l-[3px] border-l-yellow-400 border border-yellow-100' :
                          'border border-gray-200 hover:border-gray-300'
                        }`}
                        draggable={isGerente}
                        onDragStart={(e) => isGerente ? onDragStart(e, cliente, stage.key) : e.preventDefault()}
                        onClick={() => onClickCliente?.(cliente)}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <h4 className="font-bold text-[13px] text-gray-900 leading-snug line-clamp-2">{cliente.razaoSocial}</h4>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {urgencia !== 'normal' && <span className="text-xs">{urgencia === 'critico' ? '🔴' : '🟡'}</span>}
                            {cliente.score !== undefined && <span className="text-[10px] font-bold text-gray-400">{cliente.score}</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-gray-500 truncate">{cliente.contatoNome}</span>
                          {vendedor && <span className="text-[10px] text-primary-500 font-medium flex-shrink-0">{vendedor.nome.split(' ')[0]}</span>}
                        </div>
                        {/* Ações rápidas — sempre visíveis no topo */}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {cliente.etapa === 'amostra' && moverCliente && cliente.statusAmostra === 'entregue' && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); moverCliente(cliente.id, 'proposta', { resultadoAmostra: 'aprovada', dataResultadoAmostra: new Date().toISOString().split('T')[0] }) }} className="px-2 py-0.5 text-[9px] bg-green-50 text-green-700 rounded-md hover:bg-green-100 font-medium border border-green-100" title="Aprovar amostra → Proposta">✅ Aprovar</button>
                              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Reprovar amostra de ${cliente.razaoSocial}?`)) moverCliente(cliente.id, 'amostra_perdida', { resultadoAmostra: 'reprovada', dataResultadoAmostra: new Date().toISOString().split('T')[0] }) }} className="px-2 py-0.5 text-[9px] bg-orange-50 text-orange-700 rounded-md hover:bg-orange-100 font-medium border border-orange-100" title="Reprovar amostra → Amostra Perdida">🚫 Reprovar</button>
                            </>
                          )}
                          {(cliente.etapa === 'amostra' || cliente.etapa === 'amostra_perdida') && moverCliente && !['aprovada', 'reprovada', 'faturado', 'expedido', 'entregue'].includes(cliente.statusAmostra || '') && (
                            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Cancelar envio de amostra para ${cliente.razaoSocial}?`)) moverCliente(cliente.id, 'prospecção', { statusAmostra: undefined, dataEnvioAmostra: undefined, resultadoAmostra: undefined, dataResultadoAmostra: undefined }) }} className="px-2 py-0.5 text-[9px] bg-red-50 text-red-700 rounded-md hover:bg-red-100 font-medium border border-red-100" title="Cancelar amostra e voltar para Prospecção">❌ Cancelar</button>
                          )}
                          {(cliente.whatsapp || cliente.contatoCelular || cliente.contatoTelefone) && (
                            <button onClick={(e) => { e.stopPropagation(); onClickCliente?.(cliente) }} className="px-2 py-0.5 text-[9px] bg-green-50 text-green-700 rounded-md hover:bg-green-100 font-medium border border-green-100" title="Abrir WhatsApp">📱 WA</button>
                          )}
                          {cliente.contatoEmail && (
                            <button onClick={(e) => { e.stopPropagation(); onClickCliente?.(cliente) }} className="px-2 py-0.5 text-[9px] bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 font-medium border border-blue-100" title="Enviar Email">📧 Email</button>
                          )}
                          {(cliente.contatoTelefone || cliente.contatoCelular) && (
                            <button onClick={(e) => { e.stopPropagation(); setCallRecordingCliente(cliente); onQuickAction(cliente, 'ligacao', 'contato') }} className="px-2 py-0.5 text-[9px] bg-orange-50 text-orange-700 rounded-md hover:bg-orange-100 font-medium border border-orange-100" title="Ligar com gravação">📞 Ligar</button>
                          )}
                        </div>

                        {/* Histórico de Propostas (negociação) */}
                        {(() => {
                          const historico = propostasPorCliente.get(cliente.id)
                          if (!historico || historico.length === 0) return null
                          const ultima = historico[0]
                          return (
                            <div className="mt-2 p-2 bg-purple-50/60 rounded-md border border-purple-100">
                              <div className="flex items-center gap-1 mb-1">
                                <span className="text-[10px] font-semibold text-purple-800">💰 Propostas ({historico.length})</span>
                              </div>
                              <div className="space-y-1">
                                {historico.slice(0, 2).map((p, i) => (
                                  <div key={p.id || i} className="flex items-center justify-between text-[9px]">
                                    <span className="text-gray-600 truncate max-w-[70px]">{p.numero}</span>
                                    <span className="font-medium text-purple-700">R$ {p.totalValor.toLocaleString('pt-BR')}</span>
                                    <span className="text-gray-400">{new Date(p.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                  </div>
                                ))}
                                {historico.length > 2 && <p className="text-[9px] text-purple-600 text-center">+{historico.length - 2} mais</p>}
                              </div>
                              {ultima.frete && <p className="text-[9px] text-gray-500 mt-1">🚚 {ultima.frete}</p>}
                            </div>
                          )
                        })()}

                        {cliente.valorEstimado ? <p className="text-[11px] font-bold text-primary-600 mt-1.5">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p> : null}
                        {renderCardInfo(cliente)}
                        {/* Logistics mini-info from pedidos */}
                        {(() => {
                          const info = getClientePedidoInfo(cliente.id)
                          if (!info) return null
                          const p = info.latest
                          const statusLabel: Record<string, string> = { rascunho: 'Rascunho', enviado: 'Aguardando Aprov. Gerência', confirmado: 'Confirmado', cancelado: 'Cancelado' }
                          return (
                            <div className="mt-1.5 p-2 bg-gray-50 rounded-md border border-gray-100 space-y-1">
                              {/* Tipo + Status */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-full ${p.tipo === 'bonificacao' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                  {p.tipo === 'bonificacao' ? '🧪 Amostra' : '🛒 Venda'}
                                </span>
                                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full ${p.status === 'confirmado' ? 'bg-green-100 text-green-700' : p.status === 'enviado' ? 'bg-amber-100 text-amber-700' : p.status === 'cancelado' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {statusLabel[p.status] || p.status}
                                </span>
                                {info.total > 1 && <span className="text-[9px] text-gray-400">{info.total} pedidos</span>}
                              </div>
                              {/* Número */}
                              <p className="text-[10px] text-gray-500 font-medium">📋 #{p.omieNumero || p.numero}</p>
                              {/* Itens */}
                              {p.itens && p.itens.length > 0 && (
                                <div className="space-y-0.5">
                                  {p.itens.map((item, idx) => (
                                    <p key={idx} className="text-[10px] text-gray-600 leading-snug truncate">
                                      • {item.nomeProduto} <span className="font-semibold">×{item.quantidade}</span>
                                    </p>
                                  ))}
                                </div>
                              )}
                              {/* Frete + Pgto */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {p.tipoFrete && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-blue-100 text-blue-700">{p.tipoFrete}</span>
                                )}
                                {p.formaPagamento && (
                                  <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-gray-100 text-gray-600 truncate max-w-[110px]">{p.formaPagamento}</span>
                                )}
                              </div>
                              {/* Valor total */}
                              {p.totalValor > 0 && (
                                <p className="text-[11px] font-bold text-gray-800">💰 R$ {p.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              )}
                              {p.omieStatus && <p className="text-[9px] text-gray-400">🔄 Omie: {p.omieStatus}</p>}
                            </div>
                          )
                        })()}
                        {nextAction && <p className={`text-[10px] font-medium mt-1.5 leading-snug ${nextAction.color}`}>{nextAction.text}</p>}
                        {cliente.produtosInteresse && cliente.produtosInteresse.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {cliente.produtosInteresse.slice(0, 3).map(p => (<span key={p} className="px-1.5 py-0.5 text-[9px] bg-primary-50 text-primary-700 rounded-full border border-primary-100 truncate max-w-[100px]">{p}</span>))}
                            {cliente.produtosInteresse.length > 3 && <span className="text-[9px] text-gray-400">+{cliente.produtosInteresse.length - 3}</span>}
                          </div>
                        )}
                        {cliente.redesSociais && (() => {
                          const entries = cliente.redesSociais!.split(/[,;\s]+/).filter(Boolean)
                          const socials: { icon: string; url: string; title: string }[] = []
                          for (const entry of entries) {
                            const e = entry.toLowerCase().trim()
                            if (e.includes('instagram') || e.includes('insta')) {
                              const url = e.startsWith('http') ? entry.trim() : e.startsWith('@') ? `https://instagram.com/${e.slice(1)}` : `https://instagram.com/${e.replace(/.*instagram\.com\/?/,'')}`
                              socials.push({ icon: '📸', url, title: 'Instagram' })
                            } else if (e.includes('linkedin')) {
                              socials.push({ icon: '💼', url: e.startsWith('http') ? entry.trim() : `https://linkedin.com/in/${e}`, title: 'LinkedIn' })
                            } else if (e.includes('facebook') || e.includes('fb.com')) {
                              socials.push({ icon: '👤', url: e.startsWith('http') ? entry.trim() : `https://facebook.com/${e}`, title: 'Facebook' })
                            } else if (e.includes('twitter') || e.includes('x.com')) {
                              socials.push({ icon: '🐦', url: e.startsWith('http') ? entry.trim() : `https://x.com/${e}`, title: 'X / Twitter' })
                            } else if (e.includes('tiktok')) {
                              socials.push({ icon: '🎵', url: e.startsWith('http') ? entry.trim() : `https://tiktok.com/@${e}`, title: 'TikTok' })
                            } else if (e.includes('youtube') || e.includes('youtu.be')) {
                              socials.push({ icon: '▶️', url: e.startsWith('http') ? entry.trim() : `https://youtube.com/${e}`, title: 'YouTube' })
                            } else if (e.startsWith('http') || e.includes('.com') || e.includes('.br')) {
                              socials.push({ icon: '🌐', url: e.startsWith('http') ? entry.trim() : `https://${entry.trim()}`, title: 'Site' })
                            }
                          }
                          return socials.length > 0 ? (
                            <div className="flex gap-1 mt-1">
                              {socials.map((s, i) => (
                                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition-colors text-[10px]" title={s.title}>{s.icon}</a>
                              ))}
                            </div>
                          ) : null
                        })()}
                      </div>
                    )
                  })}
                  {stageClientes.length === 0 && !showNovosCiclos && <div className="p-4 text-center text-gray-400 text-[11px]">Arraste clientes aqui</div>}

                  {/* Cards virtuais: clientes em Follow-up prontos para novo ciclo */}
                  {isProposta && showNovosCiclos && clientesNovoCiclo.length > 0 && (
                    <>
                      {stageClientes.length > 0 && (
                        <div className="flex items-center gap-2 py-1">
                          <div className="flex-1 h-px bg-blue-200" />
                          <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wide whitespace-nowrap">🔄 Novos Ciclos ({clientesNovoCiclo.length})</span>
                          <div className="flex-1 h-px bg-blue-200" />
                        </div>
                      )}
                      {clientesNovoCiclo.map((cliente) => {
                        const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
                        const historico = propostasPorCliente.get(cliente.id) || []
                        const ultimaProposta = historico[0]
                        const isReviver = cliente.etapa === 'perdido' && cliente.etapaAnterior === 'negociacao'
                        return (
                          <div
                            key={`ciclo-${cliente.id}`}
                            onClick={() => onNovoCiclo ? onNovoCiclo(cliente) : onClickCliente?.(cliente)}
                            className={`p-3 rounded-lg bg-white cursor-pointer hover:shadow-md transition-all duration-150 group border-l-[3px] ${isReviver ? 'border-l-orange-400 border-orange-100' : 'border-l-blue-400 border-blue-100'} border`}
                            title={isReviver ? `⚠️ Cliente perdido em Negociação — ${cliente.motivoPerda || 'Clique para tentar novo ciclo'}` : 'Cliente em Follow-up — clique para criar nova proposta'}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <h4 className="font-bold text-[13px] text-gray-900 leading-snug line-clamp-2">{cliente.razaoSocial}</h4>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[10px] font-bold text-gray-400">{cliente.score}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[11px] text-gray-500 truncate">{cliente.contatoNome}</span>
                              {vendedor && <span className="text-[10px] text-primary-500 font-medium flex-shrink-0">{vendedor.nome.split(' ')[0]}</span>}
                            </div>
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {(cliente.whatsapp || cliente.contatoCelular || cliente.contatoTelefone) && (
                                <span className="px-2 py-0.5 text-[9px] bg-green-50 text-green-700 rounded-md font-medium border border-green-100">📱 WA</span>
                              )}
                              {cliente.contatoEmail && (
                                <span className="px-2 py-0.5 text-[9px] bg-blue-50 text-blue-700 rounded-md font-medium border border-blue-100">📧 Email</span>
                              )}
                              {isReviver ? (
                                <span className="px-2 py-0.5 text-[9px] bg-orange-50 text-orange-600 rounded-md font-medium border border-orange-100">⚡ Reviver</span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] bg-blue-50 text-blue-600 rounded-md font-medium border border-blue-100">🔄 Novo ciclo</span>
                              )}
                            </div>
                            {historico.length > 0 && (
                              <div className="mt-2 p-2 bg-purple-50/60 rounded-md border border-purple-100">
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="text-[10px] font-semibold text-purple-800">💰 Propostas ({historico.length})</span>
                                </div>
                                <div className="space-y-1">
                                  {historico.slice(0, 2).map((p, i) => (
                                    <div key={p.id || i} className="flex items-center justify-between text-[9px]">
                                      <span className="text-gray-600 truncate max-w-[70px]">{p.numero}</span>
                                      <span className="font-medium text-purple-700">R$ {p.totalValor.toLocaleString('pt-BR')}</span>
                                      <span className="text-gray-400">{new Date(p.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                    </div>
                                  ))}
                                  {historico.length > 2 && <p className="text-[9px] text-purple-600 text-center">+{historico.length - 2} mais</p>}
                                </div>
                                {ultimaProposta?.frete && <p className="text-[9px] text-gray-500 mt-1">🚚 {ultimaProposta.frete}</p>}
                              </div>
                            )}
                            {cliente.valorEstimado ? <p className="text-[11px] font-bold text-primary-600 mt-1.5">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p> : null}
                            {cliente.produtosInteresse && cliente.produtosInteresse.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {cliente.produtosInteresse.slice(0, 3).map(p => (<span key={p} className="px-1.5 py-0.5 text-[9px] bg-primary-50 text-primary-700 rounded-full border border-primary-100 truncate max-w-[100px]">{p}</span>))}
                                {cliente.produtosInteresse.length > 3 && <span className="text-[9px] text-gray-400">+{cliente.produtosInteresse.length - 3}</span>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}

                  {/* Cards virtuais: clientes em Proposta que são novos ciclos (vindos de perdidos) */}
                  {isProposta && showNovosCiclos && clientesNovoCicloProposta.length > 0 && (
                    <>
                      {(stageClientes.length > 0 || clientesNovoCiclo.length > 0) && (
                        <div className="flex items-center gap-2 py-1">
                          <div className="flex-1 h-px bg-purple-200" />
                          <span className="text-[9px] font-bold text-purple-500 uppercase tracking-wide whitespace-nowrap">🆕 Novos Ciclos Proposta ({clientesNovoCicloProposta.length})</span>
                          <div className="flex-1 h-px bg-purple-200" />
                        </div>
                      )}
                      {clientesNovoCicloProposta.map((cliente) => {
                        const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
                        return (
                          <div
                            key={`novo-ciclo-proposta-${cliente.id}`}
                            onClick={() => onClickCliente?.(cliente)}
                            className="p-3 rounded-lg bg-white cursor-pointer hover:shadow-md transition-all duration-150 group border-l-[3px] border-l-purple-400 border-purple-100 border"
                            title={`🆕 Novo ciclo #${cliente.cicloNumero || 2} - Cliente duplicado de perda em Negociação`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <h4 className="font-bold text-[13px] text-gray-900 leading-snug line-clamp-2">{cliente.razaoSocial}</h4>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[10px] font-bold text-purple-600">#{cliente.cicloNumero || 2}°</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[11px] text-gray-500 truncate">{cliente.contatoNome}</span>
                              {vendedor && <span className="text-[10px] text-primary-500 font-medium flex-shrink-0">{vendedor.nome.split(' ')[0]}</span>}
                            </div>
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {(cliente.whatsapp || cliente.contatoCelular || cliente.contatoTelefone) && (
                                <span className="px-2 py-0.5 text-[9px] bg-green-50 text-green-700 rounded-md font-medium border border-green-100">📱 WA</span>
                              )}
                              {cliente.contatoEmail && (
                                <span className="px-2 py-0.5 text-[9px] bg-blue-50 text-blue-700 rounded-md font-medium border border-blue-100">📧 Email</span>
                              )}
                              <span className="px-2 py-0.5 text-[9px] bg-purple-50 text-purple-600 rounded-md font-medium border border-purple-100">🆕 Novo ciclo</span>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}

                  {isProposta && showNovosCiclos && clientesNovoCiclo.length === 0 && clientesNovoCicloProposta.length === 0 && stageClientes.length === 0 && (
                    <div className="p-4 text-center text-gray-400 text-[11px]">Arraste clientes aqui</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Call Recorder overlay */}
      {callRecordingCliente && (
        <CallRecorder
          cliente={callRecordingCliente}
          vendedorId={loggedUser?.id}
          phoneNumber={(callRecordingCliente.contatoCelular || callRecordingCliente.contatoTelefone || '').replace(/\D/g, '')}
          onClose={() => setCallRecordingCliente(null)}
        />
      )}

      {/* ─── LOCK MODAL: Amostra 45d ─── */}
      {amostraLockedClients.length > 0 && !lockProcessing && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                🔒 Ação Obrigatória — Amostra Vencida
              </h2>
              <p className="text-red-100 text-sm mt-1">
                {amostraLockedClients.length === 1
                  ? 'Este cliente está há mais de 45 dias em Amostra sem resultado.'
                  : `${amostraLockedClients.length} clientes estão há mais de 45 dias em Amostra sem resultado.`}
              </p>
            </div>
            <div className="px-6 py-4 max-h-[400px] overflow-y-auto space-y-3">
              {amostraLockedClients.map(c => {
                const dias = diasDesde(c.dataEntradaEtapa)
                return (
                  <div key={c.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{c.razaoSocial}</p>
                        <p className="text-xs text-gray-500">{dias} dias em Amostra</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          if (!moverCliente) return
                          setLockProcessing(true)
                          moverCliente(c.id, 'proposta', { resultadoAmostra: 'aprovada', dataResultadoAmostra: new Date().toISOString().split('T')[0] })
                          setTimeout(() => setLockProcessing(false), 500)
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors"
                      >
                        ✅ Aprovada → Proposta
                      </button>
                      <button
                        onClick={() => {
                          if (!moverCliente) return
                          setLockProcessing(true)
                          const tentativa = (c.tentativaAmostra || 0)
                          if (tentativa >= 2) {
                            moverCliente(c.id, 'perdido', {
                              resultadoAmostra: 'reprovada',
                              dataResultadoAmostra: new Date().toISOString().split('T')[0],
                              categoriaPerda: 'qualidade',
                              motivoPerda: 'Amostra reprovada (sem mais tentativas)',
                              dataPerda: new Date().toISOString().split('T')[0],
                            })
                          } else {
                            moverCliente(c.id, 'amostra_perdida', {
                              resultadoAmostra: 'reprovada',
                              dataResultadoAmostra: new Date().toISOString().split('T')[0],
                              motivoReprovacao: 'Prazo de 45 dias vencido',
                            })
                          }
                          setTimeout(() => setLockProcessing(false), 500)
                        }}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors"
                      >
                        ❌ Reprovada{(c.tentativaAmostra || 0) >= 2 ? ' → Perdido' : ' → Amostra Perdida'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t">
              <p className="text-xs text-gray-500 text-center">Você precisa definir o resultado de cada amostra para continuar usando o sistema.</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── LOCK MODAL: Follow-up 45d após entrega ─── */}
      {followUpLockedClients.length > 0 && amostraLockedClients.length === 0 && !lockProcessing && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-amber-600 px-6 py-4">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                🔒 Ação Obrigatória — Follow-up Pendente
              </h2>
              <p className="text-amber-100 text-sm mt-1">
                {followUpLockedClients.length === 1
                  ? 'Este cliente foi entregue há mais de 45 dias sem atualização.'
                  : `${followUpLockedClients.length} clientes foram entregues há mais de 45 dias sem atualização.`}
              </p>
            </div>
            <div className="px-6 py-4 max-h-[400px] overflow-y-auto space-y-3">
              {followUpLockedClients.map(c => {
                const diasSinceUpdate = diasDesde(c.ultimaInteracao || c.dataEntradaEtapa)
                return (
                  <div key={c.id} className="border border-gray-200 rounded-lg p-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{c.razaoSocial}</p>
                      <p className="text-xs text-gray-500">{diasSinceUpdate} dias sem atualização após entrega</p>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          if (!moverCliente) return
                          setLockProcessing(true)
                          moverCliente(c.id, 'follow_up', {
                            statusFollowUp: 'satisfacao_pendente',
                            ultimaInteracao: new Date().toISOString().split('T')[0],
                          })
                          setTimeout(() => setLockProcessing(false), 500)
                        }}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors"
                      >
                        ⭐ Coletar Satisfação
                      </button>
                      <button
                        onClick={() => {
                          if (!moverCliente) return
                          setLockProcessing(true)
                          // Marcar ciclo como concluído — o hook criará automaticamente um novo card em Proposta
                          moverCliente(c.id, 'follow_up', {
                            statusFollowUp: 'concluido',
                            ultimaInteracao: new Date().toISOString().split('T')[0],
                            totalCompras: (c.totalCompras || 0) + 1,
                            dataUltimoPedido: new Date().toISOString().split('T')[0],
                          })
                          setTimeout(() => setLockProcessing(false), 500)
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors"
                      >
                        📝 Nova Proposta
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t">
              <p className="text-xs text-gray-500 text-center">Atualize o status de cada cliente para desbloquear o sistema.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FunilView
