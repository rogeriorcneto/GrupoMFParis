import React, { useEffect, useMemo, useState } from 'react'
import type { Cliente, Vendedor, Interacao, Pedido, FunilViewProps, PropostaHistorico } from '../../types'
import { diasDesde, getCardUrgencia, getNextAction, mapEtapaAgendor, mapCategoriaPerdaAgendor, sortCards, prazosEtapa } from '../../utils/funil-logic'
import { stageLabels, subStatusAmostraLabels, subStatusFollowUpLabels } from '../../utils/constants'
import { getAmostraLocked, getFollowUpLocked } from '../../utils/business-rules'
import { fetchPropostasByCliente } from '../../lib/database'
import { omieSyncLogistics } from '../../lib/omieApi'
import CallRecorder from '../CallRecorder'

// Função para abreviar nomes de produtos
// Resultado: "Comp. Horizonte 200g", "LPI Horizonte 25kg", "Creme Leite 200ml"
function abreviarProduto(nome: string): string {
  if (!nome) return ''

  // Extrai peso/volume do final (ex: 200G, 25KG, 1L, 500ML, 1KG)
  const pesoMatch = nome.match(/[\s\-](\d+(?:[.,]\d+)?\s*(?:KG|G|L|ML|LT|UN|CX|SC|BD|FD|BG|PCT|PT))\s*$/i)
  const peso = pesoMatch ? pesoMatch[1].toLowerCase().replace(/\s+/, '') : ''
  const semPeso = pesoMatch ? nome.slice(0, pesoMatch.index).trim() : nome.trim()

  // Mapeamento prefixo→abreviação (ordem: mais específico primeiro)
  const prefixos: [RegExp, string][] = [
    [/^COMPOSTO L[AÁ]CTEO\s+(?:COM\s+LEITE\s+)?/i,  'Comp.'],
    [/^LEITE\s+P[OÓ]\s+INTEGRAL/i,                   'LPI'],
    [/^LEITE\s+P[OÓ]/i,                               'Leite Pó'],
    [/^LEITE\s+CONDENSADO/i,                           'Leite Cond.'],
    [/^CREME\s+DE\s+LEITE/i,                           'Creme Leite'],
    [/^CREME\s+LEITE/i,                                'Creme Leite'],
    [/^A[ÇC]A[ÍI]/i,                                   'Açaí'],
    [/^CHOCOLATE\s+MEIO\s+AMARGO/i,                    'Choc. M.A.'],
    [/^CHOCOLATE\s+AO\s+LEITE/i,                       'Choc. Leite'],
    [/^CHOCOLATE/i,                                    'Choc.'],
    [/^ACHOCOLATADO/i,                                 'Achocol.'],
    [/^SORVETE/i,                                      'Sorv.'],
    [/^PICOLÉ|^PICOLE/i,                               'Picolé'],
    [/^EMULSIFICANTE/i,                                'Emuls.'],
    [/^ESTABILIZANTE/i,                                'Estab.'],
    [/^COBERTURA/i,                                    'Cob.'],
    [/^BASE\s+/i,                                      'Base'],
  ]

  let prefixAbrev = ''
  let resto = semPeso

  for (const [rx, abrev] of prefixos) {
    if (rx.test(semPeso)) {
      prefixAbrev = abrev
      resto = semPeso.replace(rx, '').trim()
      break
    }
  }

  // Se não achou prefixo conhecido, pega as 2 primeiras palavras
  if (!prefixAbrev) {
    const palavras = semPeso.split(/\s+/)
    prefixAbrev = palavras.slice(0, 2).join(' ')
    resto = palavras.slice(2).join(' ')
  }

  // Pega a próxima palavra-chave do resto (marca/variante), ignorando conectores
  const conectores = /^(DE|DA|DO|DAS|DOS|COM|PARA|EM|E|O|A|OS|AS|AO|À|AOS)\s+/i
  let varResto = resto.replace(conectores, '').trim()
  const varPalavras = varResto.split(/\s+/).filter(w => !conectores.test(w + ' '))
  // Pega até 2 palavras de variante/marca
  const variante = varPalavras.slice(0, 2).join(' ')

  const partes = [prefixAbrev, variante, peso].filter(Boolean)
  return partes.join(' ')
}

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
  const [novoCicloEscondidos, setNovoCicloEscondidos] = useState<Set<number>>(new Set())

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
      {/* KPI strip */}
      <div className="flex items-stretch gap-px bg-gray-200 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-x-auto">
        <div className="flex items-center gap-3 bg-white dark:bg-gray-900 px-5 py-2.5 min-w-max">
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-400 uppercase tracking-widest font-semibold">Pipeline</span>
            <span className="text-base font-black text-gray-900 dark:text-gray-100 leading-tight">R$ {totalPipeline.toLocaleString('pt-BR')}</span>
          </div>
          <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full font-medium">{activeCount}</span>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-gray-900 px-5 py-2.5 min-w-max">
          <div className="flex flex-col">
            <span className="text-[9px] text-emerald-500 uppercase tracking-widest font-semibold">Receita Prevista</span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400 leading-tight">R$ {Math.round(receitaPonderada).toLocaleString('pt-BR')}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-gray-900 px-5 py-2.5 min-w-max">
          <div className="flex flex-col">
            <span className="text-[9px] text-indigo-500 uppercase tracking-widest font-semibold">Conversão</span>
            <span className="text-base font-black text-indigo-600 dark:text-indigo-400 leading-tight">{taxaConversao}%</span>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-gray-900 px-5 py-2.5 min-w-max">
          <div className="flex flex-col">
            <span className="text-[9px] text-violet-500 uppercase tracking-widest font-semibold">Ciclo Médio</span>
            <span className="text-base font-black text-violet-600 dark:text-violet-400 leading-tight">{tempoMedio} dias</span>
          </div>
        </div>
        {alertCount > 0 && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 px-5 py-2.5 ml-auto min-w-max">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-red-600 dark:text-red-400">{alertCount} urgentes</span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-full pl-8 pr-6 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:bg-white transition-all"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>}
        </div>
        {isGerente && (
          <select value={filterVendedorId} onChange={(e) => setFilterVendedorId(e.target.value ? Number(e.target.value) : '')} className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all">
            <option value="">Todos vendedores</option>
            {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        )}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all">
          <option value="urgencia">Urgência</option>
          <option value="score">Score</option>
          <option value="valor">Valor</option>
          <option value="antigo">Mais antigo</option>
          <option value="recente">Mais recente</option>
        </select>
        <input type="text" value={filterSegmento} onChange={e => setFilterSegmento(e.target.value)} placeholder="Segmento" className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs w-28 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />
        <input type="text" value={filterLocalizacao} onChange={e => setFilterLocalizacao(e.target.value)} placeholder="Localização" className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs w-28 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />

        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-0.5" />

        <button onClick={() => setHideAmostraPerdida(v => !v)}
          className={`h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium border transition-all ${
            hideAmostraPerdida ? 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-800 dark:border-gray-700' : 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20'
          }`} title={hideAmostraPerdida ? 'Mostrar Amostra Perdida' : 'Ocultar Amostra Perdida'}>
          <span className="text-[10px]">Amt. Perdida</span>
        </button>

        {isGerente && (
          <>
            <button onClick={() => setHideInativos(v => !v)}
              className={`h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium border transition-all ${
                hideInativos ? 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-800 dark:border-gray-700' : 'bg-gray-100 text-gray-700 border-gray-300'
              }`} title={hideInativos ? 'Mostrar Inativos' : 'Ocultar Inativos'}>
              <span className="text-[10px]">Inativos</span>
            </button>
            <button onClick={() => setHidePerdidos(v => !v)}
              className={`h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium border transition-all ${
                hidePerdidos ? 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-800 dark:border-gray-700' : 'bg-red-50 text-red-600 border-red-200'
              }`} title={hidePerdidos ? 'Mostrar Perdidos' : 'Ocultar Perdidos'}>
              <span className="text-[10px]">Perdidos</span>
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
            className={`h-7 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium border transition-all ${
              syncing ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-white text-slate-600 border-gray-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
            title="Sincronizar status dos pedidos com o Omie"
          >
            {syncing
              ? <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            }
            <span>Sync Omie</span>
          </button>
        )}

        {isGerente && onImportNegocios && (
          <label className="ml-auto h-7 px-3 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors cursor-pointer text-xs">
            <input type="file" accept=".csv" className="hidden" onChange={handleImportNegocios} />
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importar
          </label>
        )}
        {importStatus && (
          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1">
            <div className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-[10px] text-indigo-700 font-medium">{importStatus}</span>
          </div>
        )}
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gray-50 dark:bg-gray-950">
        <div className="flex gap-2.5 h-full px-3 py-3" style={{ minWidth: `${displayedStages.length * 290}px` }}>
          {displayedStages.map((stage) => {
            const stageClientes = sortCards(stageMap.get(stage.key) || [], sortBy)
            const stageValor = stageClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
            const stageWeighted = Math.round(stageValor * stage.prob)
            const isProposta = stage.key === 'proposta'
            const novoCicloCount = isProposta ? clientesNovoCiclo.length + clientesNovoCicloProposta.length : 0
            const colAccent: Record<string, { bar: string; count: string; dot: string }> = {
              lead:           { bar: 'bg-emerald-400',  count: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-400' },
              'prospecção':   { bar: 'bg-sky-400',      count: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',                 dot: 'bg-sky-400' },
              amostra:        { bar: 'bg-amber-400',    count: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',         dot: 'bg-amber-400' },
              amostra_perdida:{ bar: 'bg-orange-400',  count: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',     dot: 'bg-orange-400' },
              inativo:        { bar: 'bg-gray-300',    count: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',                 dot: 'bg-gray-400' },
              proposta:       { bar: 'bg-indigo-400',  count: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',     dot: 'bg-indigo-400' },
              negociacao:     { bar: 'bg-violet-400',  count: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',     dot: 'bg-violet-400' },
              follow_up:      { bar: 'bg-blue-400',    count: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',             dot: 'bg-blue-400' },
              perdido:        { bar: 'bg-rose-400',    count: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',             dot: 'bg-rose-400' },
            }
            const accent = colAccent[stage.key] || colAccent.lead
            return (
              <div key={stage.key} className="flex-1 min-w-[265px] max-w-[370px] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 overflow-hidden" onDragOver={onDragOver} onDrop={(e) => onDrop(e, stage.key)}>
                {/* Accent bar */}
                <div className={`h-0.5 w-full ${accent.bar} flex-shrink-0`} />
                {/* Column header */}
                <div className="px-3.5 pt-3 pb-2.5 flex-shrink-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm leading-none flex-shrink-0">{stage.icon}</span>
                      <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate leading-none tracking-tight">{stage.title}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isProposta && novoCicloCount > 0 && (
                        <button
                          onClick={() => setShowNovosCiclos(v => !v)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                            showNovosCiclos ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 hover:bg-indigo-50 hover:text-indigo-600'
                          }`}
                          title={showNovosCiclos ? 'Ocultar novos ciclos' : `${novoCicloCount} prontos para novo ciclo`}
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                          {novoCicloCount}
                        </button>
                      )}
                      <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full leading-none ${accent.count}`}>{stageClientes.length}</span>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">R$ {stageValor.toLocaleString('pt-BR')}</span>
                    {stage.prob > 0 && <span className="text-[10px] text-gray-400 font-medium">{Math.round(stage.prob * 100)}%</span>}
                  </div>
                </div>

                {/* Cards area */}
                <div className="flex-1 overflow-y-auto px-2.5 pb-2.5 space-y-2 bg-gray-50/60 dark:bg-gray-900/60 border-t border-gray-100 dark:border-gray-800 pt-2">
                  {stageClientes.map((cliente) => {
                    const urgencia = getCardUrgencia(cliente)
                    const nextAction = getNextAction(cliente)
                    const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
                    return (
                      <div
                        key={cliente.id}
                        className={`p-3 rounded-xl bg-white dark:bg-gray-800 ${isGerente ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} hover:shadow-md dark:hover:shadow-gray-900/60 transition-all duration-150 ${
                          urgencia === 'critico' ? 'ring-1 ring-red-200 dark:ring-red-900/50 border-l-2 border-l-red-500' :
                          urgencia === 'atencao' ? 'ring-1 ring-amber-200 dark:ring-amber-900/50 border-l-2 border-l-amber-400' :
                          'border border-gray-100 dark:border-gray-700/80 hover:border-gray-200'
                        }`}
                        draggable={isGerente}
                        onDragStart={(e) => isGerente ? onDragStart(e, cliente, stage.key) : e.preventDefault()}
                        onClick={() => onClickCliente?.(cliente)}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <h4 className="font-semibold text-[13px] text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 tracking-tight">{cliente.razaoSocial}</h4>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {urgencia === 'critico' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                            {urgencia === 'atencao' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                            {cliente.score !== undefined && <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 tabular-nums">{cliente.score}</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{cliente.contatoNome}</span>
                          {vendedor && <span className="text-[10px] font-semibold flex-shrink-0 text-gray-500 dark:text-gray-400">{vendedor.nome.split(' ')[0]}</span>}
                        </div>
                        {/* Ações rápidas */}
                        <div className="flex gap-1 mt-2.5 flex-wrap">
                          {cliente.etapa === 'amostra' && moverCliente && cliente.statusAmostra === 'entregue' && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); moverCliente(cliente.id, 'proposta', { resultadoAmostra: 'aprovada', dataResultadoAmostra: new Date().toISOString().split('T')[0] }) }}
                                className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors" title="Aprovar amostra → Proposta">Aprovar</button>
                              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Reprovar amostra de ${cliente.razaoSocial}?`)) moverCliente(cliente.id, 'amostra_perdida', { resultadoAmostra: 'reprovada', dataResultadoAmostra: new Date().toISOString().split('T')[0] }) }}
                                className="px-2 py-0.5 text-[10px] font-semibold bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors" title="Reprovar amostra → Amostra Perdida">Reprovar</button>
                            </>
                          )}
                          {(cliente.etapa === 'amostra' || cliente.etapa === 'amostra_perdida') && moverCliente && !['aprovada', 'reprovada', 'faturado', 'expedido', 'entregue'].includes(cliente.statusAmostra || '') && (
                            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Cancelar envio de amostra para ${cliente.razaoSocial}?`)) moverCliente(cliente.id, 'prospecção', { statusAmostra: undefined, dataEnvioAmostra: undefined, resultadoAmostra: undefined, dataResultadoAmostra: undefined }) }}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors border border-gray-200" title="Cancelar amostra">Cancelar</button>
                          )}
                          {(cliente.whatsapp || cliente.contatoCelular || cliente.contatoTelefone) && (
                            <button onClick={(e) => { e.stopPropagation(); onClickCliente?.(cliente) }}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-md hover:bg-green-50 hover:text-green-700 transition-colors border border-gray-200" title="Abrir WhatsApp">WA</button>
                          )}
                          {cliente.contatoEmail && (
                            <button onClick={(e) => { e.stopPropagation(); onClickCliente?.(cliente) }}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-md hover:bg-blue-50 hover:text-blue-700 transition-colors border border-gray-200" title="Enviar Email">Email</button>
                          )}
                          {(cliente.contatoTelefone || cliente.contatoCelular) && (
                            <button onClick={(e) => { e.stopPropagation(); setCallRecordingCliente(cliente); onQuickAction(cliente, 'ligacao', 'contato') }}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-md hover:bg-orange-50 hover:text-orange-700 transition-colors border border-gray-200" title="Ligar com gravação">Ligar</button>
                          )}
                        </div>

                        {/* Histórico de Propostas */}
                        {(() => {
                          const historico = propostasPorCliente.get(cliente.id)
                          if (!historico || historico.length === 0) return null
                          const ultima = historico[0]
                          return (
                            <div className="mt-2.5 px-2.5 py-2 bg-violet-50/70 dark:bg-violet-900/10 rounded-lg border border-violet-100 dark:border-violet-800/30">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">Propostas</span>
                                <span className="text-[9px] text-violet-500 font-medium">{historico.length}</span>
                              </div>
                              <div className="space-y-1">
                                {historico.slice(0, 2).map((p, i) => (
                                  <div key={p.id || i} className="flex items-center justify-between gap-1">
                                    <span className="text-[9px] text-gray-500 truncate max-w-[70px]">{p.numero}</span>
                                    <span className="text-[10px] font-bold text-violet-700">R$ {p.totalValor.toLocaleString('pt-BR')}</span>
                                    <span className="text-[9px] text-gray-400">{new Date(p.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                  </div>
                                ))}
                                {historico.length > 2 && <p className="text-[9px] text-violet-500 text-right">+{historico.length - 2}</p>}
                              </div>
                              {ultima.frete && <p className="text-[9px] text-gray-400 mt-1">{ultima.frete}</p>}
                            </div>
                          )
                        })()}

                        {cliente.valorEstimado ? <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-2">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p> : null}
                        {renderCardInfo(cliente)}
                        {/* Logistics mini-info from pedidos */}
                        {(() => {
                          const info = getClientePedidoInfo(cliente.id)
                          if (!info) return null
                          const p = info.latest
                          const statusLabel: Record<string, string> = { rascunho: 'Rascunho', enviado: 'Aguardando Aprov. Gerência', confirmado: 'Confirmado', cancelado: 'Cancelado' }
                          return (
                            <div className="mt-2 px-2.5 py-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-100 dark:border-gray-700 space-y-1.5">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md ${p.tipo === 'bonificacao' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {p.tipo === 'bonificacao' ? 'Amostra' : 'Venda'}
                                  </span>
                                  <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-md ${p.status === 'confirmado' ? 'bg-emerald-100 text-emerald-700' : p.status === 'enviado' ? 'bg-amber-100 text-amber-700' : p.status === 'cancelado' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                                    {statusLabel[p.status] || p.status}
                                  </span>
                                </div>
                                {info.total > 1 && <span className="text-[9px] text-gray-400">{info.total}x</span>}
                              </div>
                              <p className="text-[9px] text-gray-400 font-mono">#{p.omieNumero || p.numero}</p>
                              {p.itens && p.itens.length > 0 && (
                                <div className="space-y-0.5">
                                  {p.itens.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-1 text-[10px]">
                                      <span className="text-gray-600 dark:text-gray-400 truncate" title={item.nomeProduto}>{abreviarProduto(item.nomeProduto)}</span>
                                      <span className="font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap flex-shrink-0 tabular-nums">{item.quantidade}×</span>
                                    </div>
                                  ))}
                                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
                                    <span className="text-[9px] text-gray-400">{p.itens.reduce((s, i) => s + i.quantidade, 0)} un</span>
                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                      {p.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-1 flex-wrap">
                                {p.tipoFrete && <span className="text-[9px] text-gray-500 font-medium">{p.tipoFrete}</span>}
                                {p.tipoFrete && p.formaPagamento && <span className="text-[9px] text-gray-300">·</span>}
                                {p.formaPagamento && <span className="text-[9px] text-gray-400 truncate max-w-[110px]">{p.formaPagamento}</span>}
                              </div>
                              {p.omieStatus && <p className="text-[9px] text-gray-400">Omie: {p.omieStatus}</p>}
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
                  {stageClientes.length === 0 && !showNovosCiclos && <div className="p-6 text-center text-gray-400 dark:text-gray-600 text-xs">Arraste clientes aqui</div>}

                  {/* Novos ciclos: todos juntos, ocultos por padrão, botão 🔄 no header para mostrar */}
                  {isProposta && showNovosCiclos && (() => {
                    const todos = [
                      ...clientesNovoCicloProposta,
                      ...clientesNovoCiclo.filter(c => !clientesNovoCicloProposta.some(p => p.id === c.id)),
                    ].filter(c => !novoCicloEscondidos.has(c.id))
                    if (todos.length === 0) return <div className="p-4 text-center text-gray-400 text-[11px]">Arraste clientes aqui</div>
                    return (
                      <>
                        {stageClientes.length > 0 && (
                          <div className="flex items-center gap-2 py-1">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-[9px] text-gray-400 uppercase tracking-wide whitespace-nowrap">🔄 {todos.length} novo{todos.length > 1 ? 's' : ''} ciclo{todos.length > 1 ? 's' : ''}</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                        )}
                        {todos.map((cliente) => {
                          const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
                          const handleClick = cliente.novoCiclo
                            ? () => onClickCliente?.(cliente)
                            : () => onNovoCiclo ? onNovoCiclo(cliente) : onClickCliente?.(cliente)
                          return (
                            <div
                              key={`nc-${cliente.id}`}
                              className="p-3 rounded-lg bg-white hover:shadow-md transition-all duration-150 group border border-gray-200 hover:border-gray-300 relative"
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); setNovoCicloEscondidos(prev => new Set([...prev, cliente.id])) }}
                                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity text-[9px]"
                                title="Esconder"
                              >✕</button>
                              <div onClick={handleClick} className="cursor-pointer">
                                <div className="flex items-start justify-between gap-1.5 pr-5">
                                  <h4 className="font-bold text-[13px] text-gray-900 leading-snug line-clamp-2">{cliente.razaoSocial}</h4>
                                  <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">{cliente.score}</span>
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
                                  <span className="px-2 py-0.5 text-[9px] bg-gray-100 text-gray-500 rounded-md font-medium border border-gray-200">🔄 #{cliente.cicloNumero || 2}° ciclo</span>
                                </div>
                                {cliente.valorEstimado ? <p className="text-[11px] font-bold text-primary-600 mt-1.5">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p> : null}
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}

                  {isProposta && showNovosCiclos && novoCicloCount === 0 && stageClientes.length === 0 && (
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
