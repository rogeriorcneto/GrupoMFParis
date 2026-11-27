import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BeakerIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  PauseCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import type { Cliente, Vendedor, Interacao, Pedido, FunilViewProps, PropostaHistorico } from '../../types'
import { diasDesde, getCardUrgencia, getNextAction, mapEtapaAgendor, mapCategoriaPerdaAgendor, sortCards, prazosEtapa } from '../../utils/funil-logic'
import { stageLabels, subStatusAmostraLabels, transicoesPermitidas } from '../../utils/constants'
import { getOmieStatusDisplay } from '../../utils/omieStatus'
import { getAmostraLocked, getFollowUpLocked } from '../../utils/business-rules'
import { PESO_PIPELINE, criarMapaUltimaProposta, valorPropostaAtivaCard } from '../../utils/indicadores-comerciais'
import { extractValidSocialLinks } from '../../utils/socialLinks'
import { classificarSituacaoCompra, pedidoContaComoVenda, SITUACAO_COMPRA_CONFIG, type SituacaoCompra } from '../../utils/situacaoCompra'
import { fetchAllPropostas } from '../../lib/database'
import { omieSyncLogistics } from '../../lib/omieApi'
import { useParametrosListas } from '../../lib/parametrosListas'
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

function FunilView({ clientes, vendedores, interacoes, pedidos = [], propostas = [], loggedUser, onDragStart, onDragOver, onDrop, onQuickAction, onClickCliente, isGerente = false, onImportNegocios, moverCliente, onNovoCiclo, onMoveCliente, onColetarSatisfacao }: FunilViewProps & { onColetarSatisfacao?: (cliente: Cliente) => Promise<void>; onClickCliente?: (c: Cliente) => void; isGerente?: boolean; propostas?: PropostaHistorico[]; onMoveCliente?: (cliente: Cliente, fromStage: string, toStage: string) => void }) {
  // ─── Mobile kanban: chips de etapa + scroll por coluna ───
  const kanbanScrollRef = useRef<HTMLDivElement>(null)
  const colRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollRaf = useRef(0)
  const [activeStageIdx, setActiveStageIdx] = useState(0)
  const [moveMenuCliente, setMoveMenuCliente] = useState<number | null>(null)
  const [filterVendedorId, setFilterVendedorId] = React.useState<number | ''>('')
  const [sortBy, setSortBy] = React.useState<'urgencia' | 'score' | 'valor' | 'antigo' | 'recente'>('urgencia')
  const [importStatus, setImportStatus] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const { opcoesAtivas } = useParametrosListas()
  const segmentosAtivos = opcoesAtivas('segmento_cliente')
  const categoriasPerdaAtivas = opcoesAtivas('categoria_perda')
  const [hidePerdidos, setHidePerdidos] = React.useState(true)
  const [hideInativos, setHideInativos] = React.useState(true)
  const [hideAmostraPerdida, setHideAmostraPerdida] = React.useState(true)
  const [showFollowUpFinalizados, setShowFollowUpFinalizados] = React.useState(false)
  const [filterSegmento, setFilterSegmento] = React.useState('')
  const [filterLocalizacao, setFilterLocalizacao] = React.useState('')
  const [callRecordingCliente, setCallRecordingCliente] = useState<Cliente | null>(null)
  const [lockProcessing, setLockProcessing] = useState(false)
  const [propostasLoaded, setPropostasLoaded] = useState<PropostaHistorico[]>([])
  const [syncing, setSyncing] = useState(false)
  const [seloSituacaoAberto, setSeloSituacaoAberto] = useState<number | null>(null)
  const INITIAL_COL_LIMIT = 50
  const [colLimits, setColLimits] = useState<Record<string, number>>({})

  // P0 Performance: Índice O(N) único para famílias de empresas e situação de compra (evita O(N²) de ~10M iterações por render)
  const { rootByCardId, situacaoPorCardId } = useMemo(() => {
    const parent = new Map<number, number>()
    for (const c of clientes) parent.set(c.id, c.id)
    const find = (x: number): number => {
      let cur = x
      while (parent.get(cur) !== cur) {
        const p = parent.get(cur)!
        parent.set(cur, parent.get(p)!)
        cur = p
      }
      return cur
    }
    const seen = new Map<string, number>()
    for (const c of clientes) {
      if (c.arquivadoDuplicata) continue
      const keys: string[] = []
      if (c.empresaFunilId) keys.push(`ef:${c.empresaFunilId}`)
      const doc = (c.cnpj || c.cpf || '').replace(/\D/g, '')
      if (doc) keys.push(`doc:${doc}`)
      if (c.omieCodigo) keys.push(`om:${c.omieCodigo}`)
      const nm = (c.razaoSocial || '').trim().toLowerCase()
      if (nm) keys.push(`nm:${nm}`)
      for (const k of keys) {
        const prev = seen.get(k)
        if (prev !== undefined) {
          const ra = find(c.id), rb = find(prev)
          if (ra !== rb) parent.set(rb, ra)
        } else {
          seen.set(k, c.id)
        }
      }
    }
    const rootByCard = new Map<number, number>()
    const ultimaPorRoot = new Map<number, string>()
    const setUltima = (root: number | undefined, raw?: string | null) => {
      if (root === undefined || !raw) return
      const iso = raw.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return
      const prev = ultimaPorRoot.get(root)
      if (!prev || iso > prev) ultimaPorRoot.set(root, iso)
    }
    for (const c of clientes) {
      const r = find(c.id)
      rootByCard.set(c.id, r)
      if (!c.arquivadoDuplicata && c.dataUltimaVenda) setUltima(r, c.dataUltimaVenda)
    }
    for (const p of pedidos) {
      if (!pedidoContaComoVenda(p)) continue
      const r = rootByCard.get(p.clienteId)
      setUltima(r, p.dataEnvioOmie || p.dataAprovacao || p.dataEnvio || p.dataCriacao)
    }
    const porRoot = new Map<number, { situacao: SituacaoCompra; dias: number | null }>()
    const situacaoMap = new Map<number, { situacao: SituacaoCompra; dias: number | null }>()
    for (const c of clientes) {
      const r = rootByCard.get(c.id)!
      let calc = porRoot.get(r)
      if (!calc) {
        const res = classificarSituacaoCompra(ultimaPorRoot.get(r) || null)
        calc = { situacao: res.situacao, dias: res.dias }
        porRoot.set(r, calc)
      }
      situacaoMap.set(c.id, calc)
    }
    return { rootByCardId: rootByCard, situacaoPorCardId: situacaoMap }
  }, [clientes, pedidos])

  const situacaoCompraDoCard = (cliente: Cliente) =>
    situacaoPorCardId.get(cliente.id) || { situacao: 'prospecto' as SituacaoCompra, dias: null }
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

  // Carregar propostas — 1 query só (antes era 1 request por cliente: ~1.600 requests)
  useEffect(() => {
    if (propostas.length > 0) return
    fetchAllPropostas().then(setPropostasLoaded).catch(() => {})
  }, [propostas.length])

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

  // Vendedor vê: Prospecção, Amostra, Proposta, Negociação, Follow-up, Inativos, Perdido
  // Gerente vê todas: Leads, Prospecção, Amostra, Amostra Perdida, Proposta, Negociação, Follow-up, Inativos, Perdido
  // Item 1b Rodada 3.1: não existe mais a etapa "Arquivados"; cards de Follow-up pós-satisfação ficam "Finalizado" e ocultos no próprio Follow-up
  const isFollowUpFinalizado = (c: Cliente) =>
    (c.etapa === 'follow_up' && c.statusFollowUp === 'concluido') || c.etapa === 'arquivado'

  const VENDEDOR_ETAPAS = new Set(['prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up', 'inativo'])
  const GERENTE_ETAPAS = new Set(['lead', 'prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up', 'inativo'])
  const FUNIL_ETAPAS = isGerente ? GERENTE_ETAPAS : VENDEDOR_ETAPAS

  const allStages = [
    { title: 'Leads', key: 'lead', dot: 'bg-emerald-500', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: 0.05, gerenteOnly: true },
    { title: 'Prospecção', key: 'prospecção', dot: 'bg-sky-500', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: 0.10, gerenteOnly: false },
    { title: 'Amostra', key: 'amostra', dot: 'bg-amber-500', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: 0.25, gerenteOnly: false },
    { title: 'Amostra Finalizada', key: 'amostra_perdida', dot: 'bg-orange-500', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: 0.05, gerenteOnly: false },
    { title: 'Inativos', key: 'inativo', dot: 'bg-gray-400', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: 0.10, gerenteOnly: false },
    { title: 'Proposta', key: 'proposta', dot: 'bg-indigo-500', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: PESO_PIPELINE.proposta, gerenteOnly: false },
    { title: 'Negociação', key: 'negociacao', dot: 'bg-violet-500', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: PESO_PIPELINE.negociacao, gerenteOnly: false },
    { title: 'Follow-up', key: 'follow_up', dot: 'bg-blue-500', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: 0.80, gerenteOnly: false },
    { title: 'Perdido', key: 'perdido', dot: 'bg-rose-500', badge: 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200', icon: '', prob: 0, gerenteOnly: false }
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
      !c.arquivadoDuplicata && (FUNIL_ETAPAS.has(c.etapa) || c.etapa === 'perdido' || c.etapa === 'arquivado')
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
      base = base.filter(c => (c.segmento || '').toLowerCase().includes(filterSegmento.toLowerCase()))
    }
    if (filterLocalizacao) {
      base = base.filter(c => c.etapa !== 'lead' || (c.localizacao || '').toLowerCase().includes(filterLocalizacao.toLowerCase()))
    }
    return base
  }, [clientesFiltradosVendedor, search, filterSegmento, filterLocalizacao])

  // Cards de Follow-up finalizados pós-satisfação (ocultos por padrão, exibidos pelo botão "Finalizados (N)" no cabeçalho do Follow-up)
  const followUpFinalizados = useMemo(
    () => sortCards(clientesFiltrados.filter(isFollowUpFinalizado), sortBy),
    [clientesFiltrados, sortBy]
  )

  // P1-1: Single O(n) pass to group clients by stage (Follow-up exibe apenas os em andamento; finalizados ficam ocultos no toggle)
  const stageMap = useMemo(() => {
    const m = new Map<string, Cliente[]>()
    displayedStages.forEach(s => m.set(s.key, []))
    clientesFiltrados.forEach(c => {
      if (isFollowUpFinalizado(c)) return
      const arr = m.get(c.etapa)
      if (arr) arr.push(c)
    })
    return m
  }, [clientesFiltrados, displayedStages])

  // P0 Performance: O(N) lookup em vez de O(N²) com existeCardAtivoNoFunil por cliente
  const clientesNovoCiclo = useMemo(() => {
    const rootsAtivosPropNeg = new Set<number>()
    for (const c of clientesFiltradosVendedor) {
      if (!c.arquivadoDuplicata && (c.etapa === 'proposta' || c.etapa === 'negociacao')) {
        const r = rootByCardId.get(c.id)
        if (r !== undefined) rootsAtivosPropNeg.add(r)
      }
    }
    const base = clientesFiltradosVendedor.filter(c => {
      if (c.arquivadoDuplicata) return false
      const r = rootByCardId.get(c.id)
      if (r !== undefined && rootsAtivosPropNeg.has(r)) return false
      if (c.etapa === 'follow_up' && c.statusFollowUp !== 'aguardando_aprovacao_gerente' && c.statusFollowUp !== 'novo_ciclo_iniciado') return true
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
  }, [clientesFiltradosVendedor, search, rootByCardId])

  const mapaUltimaProposta = useMemo(
    () => criarMapaUltimaProposta(propostas.length > 0 ? propostas : propostasLoaded),
    [propostas, propostasLoaded]
  )

  // Memoized metrics unificados com o Dashboard (valor das propostas ativas em Proposta + Negociação)
  const { totalPipeline, receitaPonderada, taxaConversao, tempoMedio, activeCount } = useMemo(() => {
    let pipeline = 0, weighted = 0, followUpCount = 0, nonPerdidoCount = 0
    let totalDias = 0, histCount = 0

    clientesFiltrados.forEach(c => {
      const val = valorPropostaAtivaCard(c, mapaUltimaProposta)
      if (c.etapa !== 'perdido' && c.etapa !== 'inativo' && c.etapa !== 'arquivado') nonPerdidoCount++
      if (c.etapa === 'proposta' || c.etapa === 'negociacao') {
        pipeline += val
        weighted += val * (PESO_PIPELINE[c.etapa] || 0)
      }
      if (c.etapa === 'follow_up') followUpCount++
      if (c.historicoEtapas && c.historicoEtapas.length > 1) {
        const h = c.historicoEtapas
        const first = new Date(h[0].data).getTime()
        const last = new Date(h[h.length - 1].data).getTime()
        totalDias += Math.floor((last - first) / 86400000)
        histCount++
      }
    })

    return {
      totalPipeline: Math.round(pipeline * 100) / 100,
      receitaPonderada: Math.round(weighted * 100) / 100,
      taxaConversao: nonPerdidoCount > 0 ? Math.round((followUpCount / nonPerdidoCount) * 100) : 0,
      tempoMedio: histCount > 0 ? Math.round(totalDias / histCount) : 0,
      activeCount: nonPerdidoCount,
    }
  }, [clientesFiltrados, mapaUltimaProposta])

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

  const getClientePedidoInfo = (cliente: Cliente) => {
    const allPs = pedidosByCliente.get(cliente.id) || []
    if (allPs.length === 0) return null
    // Filter pedidos by card's current etapa — each card is individual
    let ps = allPs
    if (cliente.etapa === 'amostra' || cliente.etapa === 'amostra_perdida') {
      ps = allPs.filter(p => p.tipo === 'bonificacao')
    } else if (cliente.etapa === 'negociacao' || cliente.etapa === 'follow_up' || cliente.etapa === 'arquivado') {
      ps = allPs.filter(p => p.tipo === 'venda' || !p.tipo)
    }
    if (ps.length === 0) return null
    const dataMaisRecente = (p: Pedido) => p.dataAprovacao || p.dataEnvio || p.dataCriacao || ''
    const sorted = [...ps].sort((a, b) => new Date(dataMaisRecente(b)).getTime() - new Date(dataMaisRecente(a)).getTime())
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
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
              <span className="font-medium">Na etapa: {diasEtapaProsp}d</span>
              <span>{Math.max(60 - diasEtapaProsp, 0)}d rest.</span>
            </div>
            {diasInativoProsp >= 3 && (
              <div className="flex items-center gap-1">
                <span className={`text-[10px] font-semibold tabular-nums ${diasInativoProsp >= 5 ? 'text-red-600' : 'text-orange-600'}`}>
                  Sem contato: {diasInativoProsp}d / 5d
                </span>
              </div>
            )}
            {diasInativoProsp >= 3 && (
              <div className="flex items-center gap-1">
                <div className="flex-1 bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-1"><div className={`h-1 rounded-full transition-all ${pctContato >= 100 ? 'bg-red-500' : 'bg-orange-400'}`} style={{ width: `${pctContato}%` }} /></div>
              </div>
            )}
            {diasEtapaProsp >= 30 && (
              <div className="flex items-center gap-1">
                <div className="flex-1 bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-1"><div className={`h-1 rounded-full transition-all ${pctEtapa60 >= 100 ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${pctEtapa60}%` }} /></div>
              </div>
            )}
            {cliente.origemLead && <span className="inline-block px-1.5 py-0.5 text-[9px] bg-sky-50 text-sky-700 rounded-md">{cliente.origemLead}</span>}
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
          <div className="mt-2 space-y-1">
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold rounded-md ${cliente.statusAmostra === 'aprovada' ? 'bg-emerald-50 text-emerald-700' : cliente.statusAmostra === 'reprovada' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{subLabel}</span>
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-1"><div className="h-1 rounded-full transition-all bg-amber-500" style={{ width: `${pctSub}%` }} /></div>
            </div>
            <div className="flex items-center justify-between text-[10px] tabular-nums">
              <span className="font-medium text-gray-500 dark:text-gray-400">Na etapa: {dias}d</span>
              <span className={`font-semibold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 7 ? 'text-amber-600' : 'text-gray-400'}`}>{diasRestam > 0 ? `${diasRestam}d rest.` : 'Vencido'}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-1"><div className={`h-1 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 80 ? 'bg-amber-500' : 'bg-gray-400'}`} style={{ width: `${pctPrazo}%` }} /></div>
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
            <div className="flex items-center justify-between text-[9px]">
              <span className="font-semibold text-gray-600 dark:text-gray-300">⏱ Na etapa: {dias}d</span>
              <span className={`font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 7 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `Prazo: ${diasRestam}d rest.` : 'Prazo vencido!'}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 80 ? 'bg-yellow-500' : 'bg-indigo-500'}`} style={{ width: `${pctPrazo}%` }} /></div>
            </div>
          </div>
        )
      }
      case 'negociacao': {
        const diasNeg = diasDesde(cliente.dataEntradaEtapa || cliente.dataProposta)
        const pctPrazo = Math.min((diasNeg / 45) * 100, 100)
        const diasRestam = Math.max(45 - diasNeg, 0)
        const infoPedNeg = getClientePedidoInfo(cliente)
        const aguardandoAprov = cliente.statusFollowUp === 'aguardando_aprovacao_gerente' || infoPedNeg?.latest?.status === 'enviado'
        return (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[10px] tabular-nums">
              <span className={`font-medium ${diasNeg > 3 && !aguardandoAprov ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>Na etapa: {diasNeg}d</span>
              <span className={`font-semibold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 10 ? 'text-amber-600' : 'text-gray-400'}`}>{diasRestam > 0 ? `${diasRestam}d rest.` : 'Vencido'}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-1"><div className={`h-1 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 78 ? 'bg-amber-500' : 'bg-primary-500'}`} style={{ width: `${pctPrazo}%` }} /></div>
            </div>
            {diasNeg > 3 && !aguardandoAprov && (
              <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40 rounded-md px-2 py-1 leading-tight">
                +3d em Negociação — encerrar venda ou perda
              </p>
            )}
          </div>
        )
      }
      case 'arquivado':
      case 'follow_up': {
        const ehFinalizado = isFollowUpFinalizado(cliente)
        const subIdx = ehFinalizado ? 7 : (cliente.statusFollowUp ? ['aguardando_aprovacao_gerente', 'pedido_aprovado', 'em_producao', 'faturado', 'expedido', 'entregue', 'satisfacao_pendente', 'concluido'].indexOf(cliente.statusFollowUp) : 0)
        const pctSub = Math.min(((subIdx + 1) / 8) * 100, 100)
        const semQuadroPedido = !getClientePedidoInfo(cliente)
        const omieFallback = semQuadroPedido && cliente.omieStatusLogistico ? getOmieStatusDisplay(cliente.omieStatusLogistico) : null
        return (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
              <span className="font-medium">Na etapa: {dias}d</span>
              <span>{Math.max(60 - dias, 0)}d rest.</span>
            </div>
            {omieFallback && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold rounded-md ${omieFallback.classes}`} title={`Status bruto: ${omieFallback.raw}`}>Omie: {omieFallback.label}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-1"><div className="h-1 rounded-full transition-all bg-blue-500" style={{ width: `${pctSub}%` }} /></div>
            </div>
            {cliente.omieCodigoRastreio && <p className="text-[10px] text-gray-500">Rastreio: {cliente.omieCodigoRastreio}</p>}
            {cliente.omieNotaFiscal && <p className="text-[10px] text-gray-500">NF: {cliente.omieNotaFiscal}</p>}
            {cliente.omieDataFaturamento && <p className="text-[10px] text-gray-400">Faturado: {cliente.omieDataFaturamento}</p>}
          </div>
        )
      }
      case 'lead': {
        return (
          <div className="mt-2 space-y-1">
            {cliente.segmento && <span className="inline-block px-1.5 py-0.5 text-[9px] bg-emerald-50 text-emerald-700 rounded-md">{cliente.segmento}</span>}
            {cliente.localizacao && <p className="text-[10px] text-gray-500">{cliente.localizacao}</p>}
            {cliente.origemLead && <span className="inline-block px-1.5 py-0.5 text-[9px] bg-sky-50 text-sky-700 rounded-md">{cliente.origemLead}</span>}
          </div>
        )
      }
      case 'amostra_perdida': {
        const tentativa = cliente.tentativaAmostra || 0
        return (
          <div className="mt-2 space-y-1">
            {cliente.motivoReprovacao && <p className="text-[10px] text-red-600">{cliente.motivoReprovacao}</p>}
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold rounded-md ${tentativa >= 2 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
              {tentativa >= 2 ? 'Sem tentativas' : `${2 - tentativa}ª tentativa disponível`}
            </span>
            {cliente.etapaAnterior && <p className="text-[10px] text-gray-500">Origem: {stageLabels[cliente.etapaAnterior] || cliente.etapaAnterior}</p>}
          </div>
        )
      }
      case 'inativo': {
        const diasIn = cliente.diasInativo || 0
        return (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] text-gray-600">Inativo há {diasIn} dias</p>
            {cliente.etapaAnterior && <p className="text-[10px] text-gray-500">Origem: {stageLabels[cliente.etapaAnterior] || cliente.etapaAnterior}</p>}
            {cliente.totalCompras !== undefined && cliente.totalCompras > 0 && <p className="text-[10px] text-emerald-700 font-medium">{cliente.totalCompras} compra(s)</p>}
          </div>
        )
      }
      case 'perdido': {
        const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
        const labelMotivoPerda = cliente.categoriaPerda
          ? (categoriasPerdaAtivas.find(o => o.valor === cliente.categoriaPerda)?.label || catLabels[cliente.categoriaPerda] || cliente.categoriaPerda)
          : ''
        const diasPerdido = diasDesde(cliente.dataPerda)
        const pctReconquista = Math.min((diasPerdido / 60) * 100, 100)
        return (
          <div className="mt-2 space-y-1">
            {labelMotivoPerda && <span className="inline-block px-1.5 py-0.5 text-[9px] font-semibold bg-red-50 text-red-700 rounded-md">{labelMotivoPerda}</span>}
            {cliente.etapaAnterior && <p className="text-[10px] text-gray-500">Origem: {stageLabels[cliente.etapaAnterior] || cliente.etapaAnterior}</p>}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-1"><div className={`h-1 rounded-full transition-all ${pctReconquista >= 100 ? 'bg-emerald-500' : 'bg-gray-400'}`} style={{ width: `${pctReconquista}%` }} /></div>
              <span className={`text-[9px] font-semibold tabular-nums ${diasPerdido >= 60 ? 'text-emerald-600' : 'text-gray-500'}`}>{diasPerdido >= 60 ? 'Reconquistar' : `${60 - diasPerdido}d`}</span>
            </div>
          </div>
        )
      }
      default: return null
    }
  }

  const alertCount = useMemo(() => clientesFiltrados.filter(c => getCardUrgencia(c) !== 'normal').length, [clientesFiltrados])

  // Mobile: descobre qual coluna está centralizada no scroll horizontal
  const handleKanbanScroll = () => {
    cancelAnimationFrame(scrollRaf.current)
    scrollRaf.current = requestAnimationFrame(() => {
      const el = kanbanScrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const center = rect.left + el.clientWidth / 2
      let best = 0, bestDist = Infinity
      displayedStages.forEach((s, i) => {
        const col = colRefs.current.get(s.key)
        if (!col) return
        const r = col.getBoundingClientRect()
        const d = Math.abs((r.left + r.right) / 2 - center)
        if (d < bestDist) { bestDist = d; best = i }
      })
      setActiveStageIdx(best)
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
      {/* KPI bar — Apple clean cards */}
      <div className="flex items-center gap-2 px-1 py-2 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2.5 bg-white dark:bg-[#1C1C1E] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3.5 py-2 shadow-apple-sm">
          <div className="w-2 h-2 rounded-full bg-primary-600" />
          <div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Pipeline</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-none mt-0.5 tabular-nums">R$ {totalPipeline.toLocaleString('pt-BR')}</p>
          </div>
          <span className="text-[11px] text-gray-400 tabular-nums">({activeCount})</span>
        </div>
        <div className="flex items-center gap-2.5 bg-white dark:bg-[#1C1C1E] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3.5 py-2 shadow-apple-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Prevista</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-none mt-0.5 tabular-nums">R$ {Math.round(receitaPonderada).toLocaleString('pt-BR')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-white dark:bg-[#1C1C1E] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3.5 py-2 shadow-apple-sm">
          <div className="w-2 h-2 rounded-full bg-sky-500" />
          <div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Conversão</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-none mt-0.5 tabular-nums">{taxaConversao}%</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-white dark:bg-[#1C1C1E] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3.5 py-2 shadow-apple-sm">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Ciclo médio</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-none mt-0.5 tabular-nums">{tempoMedio} dias</p>
          </div>
        </div>
        {alertCount > 0 && (
          <div className="flex items-center gap-1.5 bg-red-50/90 dark:bg-red-500/10 border border-red-200/80 dark:border-red-500/25 rounded-xl px-3.5 py-2 ml-auto">
            <ExclamationTriangleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
            <span className="text-xs font-semibold text-red-700 dark:text-red-300 tabular-nums">{alertCount} vencendo</span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-1 pb-2.5 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <MagnifyingGlassIcon className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-full pl-8 pr-6 py-1.5 border border-black/[0.09] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/25"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {isGerente && (
          <select value={filterVendedorId} onChange={(e) => setFilterVendedorId(e.target.value ? Number(e.target.value) : '')} className="px-2.5 py-1.5 border border-black/[0.09] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-gray-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/25">
            <option value="">Todos vendedores</option>
            {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        )}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-2.5 py-1.5 border border-black/[0.09] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-gray-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/25">
          <option value="urgencia">Urgência</option>
          <option value="score">Score</option>
          <option value="valor">Valor</option>
          <option value="antigo">Mais antigo</option>
          <option value="recente">Mais recente</option>
        </select>
        <select value={filterSegmento} onChange={e => setFilterSegmento(e.target.value)} aria-label="Filtrar por segmento" className="px-2.5 py-1.5 border border-black/[0.09] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-gray-100 rounded-lg text-xs w-28 focus:outline-none focus:ring-2 focus:ring-primary-500/25">
          <option value="">Segmento</option>
          {segmentosAtivos.map(s => (
            <option key={s.id} value={s.valor}>{s.label}</option>
          ))}
        </select>
        <input type="text" value={filterLocalizacao} onChange={e => setFilterLocalizacao(e.target.value)} placeholder="Local" className="px-2.5 py-1.5 border border-black/[0.09] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-gray-100 rounded-lg text-xs w-24 focus:outline-none focus:ring-2 focus:ring-primary-500/25" />

        <div className="h-4 w-px bg-black/[0.08] dark:bg-white/[0.10]" />
        <button onClick={() => setHideAmostraPerdida(v => !v)} className={`h-7 px-2 flex items-center gap-1 rounded-lg text-[11px] font-medium border transition-colors ${hideAmostraPerdida ? 'bg-white dark:bg-[#1C1C1E] border-black/[0.09] dark:border-white/[0.10] text-gray-500 hover:text-gray-800' : 'bg-orange-50 text-orange-700 border-orange-200'}`} title={hideAmostraPerdida ? 'Mostrar Amostra Perdida' : 'Ocultar Amostra Perdida'}>
          <NoSymbolIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Am. Perdida</span>
        </button>
        <button onClick={() => setHideInativos(v => !v)} className={`h-7 px-2 flex items-center gap-1 rounded-lg text-[11px] font-medium border transition-colors ${hideInativos ? 'bg-white dark:bg-[#1C1C1E] border-black/[0.09] dark:border-white/[0.10] text-gray-500 hover:text-gray-800' : 'bg-gray-200 text-gray-800 border-gray-300'}`} title={hideInativos ? 'Mostrar Inativos' : 'Ocultar Inativos'}>
          <PauseCircleIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Inativos</span>
        </button>
        <button onClick={() => setHidePerdidos(v => !v)} className={`h-7 px-2 flex items-center gap-1 rounded-lg text-[11px] font-medium border transition-colors ${hidePerdidos ? 'bg-white dark:bg-[#1C1C1E] border-black/[0.09] dark:border-white/[0.10] text-gray-500 hover:text-gray-800' : 'bg-red-50 text-red-700 border-red-200'}`} title={hidePerdidos ? 'Mostrar Perdidos' : 'Ocultar Perdidos'}>
          <EyeSlashIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Perdidos</span>
        </button>

        {isGerente && (
          <button
            onClick={async () => {
              if (syncing) return
              setSyncing(true)
              try {
                const res = await omieSyncLogistics()
                if (res.success && res.data) {
                  alert(`Sync Omie concluído!\n${res.data.atualizados} atualizados, ${res.data.erros?.length || 0} erros`)
                  window.location.reload()
                } else {
                  alert(`Sync Omie: ${res.error || 'Sem alterações'}`)
                }
              } catch { alert('Erro ao sincronizar com Omie') }
              finally { setSyncing(false) }
            }}
            disabled={syncing}
            className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium border border-black/[0.09] dark:border-white/[0.10] bg-white dark:bg-[#1C1C1E] text-gray-700 dark:text-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Sincronizar status dos pedidos com o Omie"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync Omie</span>
          </button>
        )}

        {isGerente && onImportNegocios && (
          <label className="bg-primary-700 hover:bg-primary-800 text-white font-medium h-7 px-2.5 rounded-lg transition-colors shadow-apple-sm flex items-center gap-1.5 cursor-pointer text-xs ml-auto">
            <input type="file" accept=".csv" className="hidden" onChange={handleImportNegocios} />
            <ArrowUpTrayIcon className="h-3.5 w-3.5" />
            <span>Importar</span>
          </label>
        )}
        {importStatus && (
          <div className="flex items-center gap-1.5 bg-white dark:bg-[#1C1C1E] border border-black/[0.08] rounded-lg px-2.5 py-1">
            <div className="w-2.5 h-2.5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
            <span className="text-[10px] text-gray-700 dark:text-gray-300">{importStatus}</span>
          </div>
        )}
      </div>

      {/* Mobile: chips de etapa para pular entre colunas */}
      <div className="md:hidden flex gap-1.5 px-2 pb-2 overflow-x-auto flex-shrink-0">
        {displayedStages.map((s, i) => (
          <button
            key={s.key}
            onClick={() => colRefs.current.get(s.key)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors flex-shrink-0 ${i === activeStageIdx ? 'bg-primary-700 text-white border-primary-700' : 'bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-300 border-black/[0.08] dark:border-white/[0.10]'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${(s as any).dot || 'bg-gray-400'}`} />
            <span>{s.title}</span>
            <span className={`px-1.5 rounded-full text-[9px] font-bold tabular-nums ${i === activeStageIdx ? 'bg-white/20' : 'bg-black/[0.05] dark:bg-white/[0.08]'}`}>{(stageMap.get(s.key) || []).length}</span>
          </button>
        ))}
      </div>

      {/* Kanban columns */}
      <div ref={kanbanScrollRef} onScroll={handleKanbanScroll} className="flex-1 overflow-x-auto overflow-y-hidden snap-x snap-mandatory md:snap-none">
        <div className="flex gap-3 h-full px-1 pb-2" style={{ minWidth: `${displayedStages.length * 300}px` }}>
          {displayedStages.map((stage) => {
            const stageClientesAtivos = sortCards(stageMap.get(stage.key) || [], sortBy)
            const isFollowUp = stage.key === 'follow_up'
            const stageClientes = isFollowUp && showFollowUpFinalizados
              ? [...stageClientesAtivos, ...followUpFinalizados]
              : stageClientesAtivos
            const limiteCol = search.trim() ? stageClientes.length : (colLimits[stage.key] || INITIAL_COL_LIMIT)
            const stageClientesVisiveis = stageClientes.slice(0, limiteCol)
            const restantesCol = Math.max(0, stageClientes.length - stageClientesVisiveis.length)
            const stageValor = stageClientesAtivos.reduce((s, c) => s + valorPropostaAtivaCard(c, mapaUltimaProposta), 0)
            const isProposta = stage.key === 'proposta'
            const novoCicloCount = isProposta ? clientesNovoCiclo.length : 0
            return (
              <div
                key={stage.key}
                ref={(el) => { if (el) colRefs.current.set(stage.key, el); else colRefs.current.delete(stage.key) }}
                className="flex-none w-[86vw] max-w-[86vw] snap-center md:flex-1 md:w-auto md:min-w-[272px] md:max-w-[380px] flex flex-col bg-[#EBEBEF]/75 dark:bg-[#161618] rounded-2xl border border-black/[0.05] dark:border-white/[0.07] overflow-hidden"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, stage.key)}
              >
                {/* Column header */}
                <div className="px-3.5 py-3 bg-[#FBFBFD] dark:bg-[#1C1C1E] border-b border-black/[0.05] dark:border-white/[0.07] flex-shrink-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${(stage as any).dot || 'bg-gray-400'}`} />
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-[13px] truncate leading-none tracking-tight">{stage.title}</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isProposta && novoCicloCount > 0 && (
                        <button
                          onClick={() => setShowNovosCiclos(v => !v)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${showNovosCiclos ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 border-transparent hover:bg-black/[0.08]'}`}
                          title={showNovosCiclos ? 'Ocultar clientes em novo ciclo (Follow-up)' : `Mostrar ${novoCicloCount} cliente(s) prontos para novo ciclo`}
                        >
                          <ArrowPathIcon className="h-3 w-3" /> {novoCicloCount}
                        </button>
                      )}
                      {isFollowUp && (
                        <button
                          type="button"
                          onClick={() => setShowFollowUpFinalizados(v => !v)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${showFollowUpFinalizados ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 border-transparent hover:bg-black/[0.08]'}`}
                          title={showFollowUpFinalizados ? 'Esconder cards finalizados' : `Mostrar ${followUpFinalizados.length} card(s) finalizado(s)`}
                        >
                          Finalizados ({followUpFinalizados.length})
                        </button>
                      )}
                      <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full leading-none tabular-nums ${stage.badge}`}>{stageClientesAtivos.length}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 tabular-nums">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">R$ {stageValor.toLocaleString('pt-BR')}</span>
                    {stage.prob > 0 && <span className="text-[10px] text-gray-400">{Math.round(stage.prob * 100)}% prob.</span>}
                  </div>
                </div>

                {/* Cards area (renderização progressiva para resposta instantânea) */}
                <div
                  className="flex-1 overflow-y-auto p-2 space-y-2"
                  onScroll={(e) => {
                    if (restantesCol <= 0) return
                    const el = e.currentTarget
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
                      setColLimits(prev => ({ ...prev, [stage.key]: (prev[stage.key] || INITIAL_COL_LIMIT) + 60 }))
                    }
                  }}
                >
                  {stageClientesVisiveis.map((cliente) => {
                    const urgencia = getCardUrgencia(cliente)
                    const nextAction = getNextAction(cliente)
                    const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
                    return (
                      <div
                        key={cliente.id}
                        className={`relative p-3.5 rounded-2xl bg-white dark:bg-[#1E1E22] ${isGerente ? 'cursor-move' : 'cursor-pointer'} shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)] hover:-translate-y-[1px] transition-all duration-150 group ${
                          urgencia === 'critico' ? 'ring-1 ring-red-500/30 border border-red-200/80 dark:border-red-500/30' :
                          urgencia === 'atencao' ? 'ring-1 ring-amber-400/35 border border-amber-200/80 dark:border-amber-500/30' :
                          'border border-black/[0.05] dark:border-white/[0.07] hover:border-black/[0.11] dark:hover:border-white/[0.14]'
                        }`}
                        draggable={isGerente}
                        onDragStart={(e) => isGerente ? onDragStart(e, cliente, stage.key) : e.preventDefault()}
                        onClick={() => { if (moveMenuCliente === cliente.id) { setMoveMenuCliente(null); return } onClickCliente?.(cliente) }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-[13px] text-gray-900 dark:text-gray-100 leading-[1.35] line-clamp-2 tracking-[-0.012em]">{cliente.razaoSocial}</h4>
                          <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                            {onMoveCliente && (isGerente || (transicoesPermitidas[stage.key] || []).length > 0) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setMoveMenuCliente(moveMenuCliente === cliente.id ? null : cliente.id) }}
                                className="md:hidden px-1.5 py-0.5 text-xs text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                                title="Mover de etapa"
                              >⇄</button>
                            )}
                            {urgencia !== 'normal' && (
                              <span className={`w-2 h-2 rounded-full ${urgencia === 'critico' ? 'bg-red-500' : 'bg-amber-400'}`} title={urgencia === 'critico' ? 'Urgência crítica' : 'Atenção'} />
                            )}
                            {cliente.score !== undefined && <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">{cliente.score}</span>}
                          </div>
                        </div>
                        {moveMenuCliente === cliente.id && onMoveCliente && (
                          <div className="absolute right-2 top-9 z-30 w-48 bg-white dark:bg-[#2C2C30] border border-black/[0.08] dark:border-white/[0.12] rounded-xl shadow-xl py-1 max-h-64 overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Mover para</p>
                            {allStages.filter(s => {
                              if (s.key === stage.key) return false
                              if (stage.key === 'negociacao' && s.key === 'proposta') return false
                              if (!isGerente) return (transicoesPermitidas[stage.key] || []).includes(s.key)
                              return true
                            }).map(s => (
                              <button
                                key={s.key}
                                onClick={() => { setMoveMenuCliente(null); onMoveCliente(cliente, stage.key, s.key) }}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2"
                              >
                                <span className={`w-2 h-2 rounded-full ${(s as any).dot || 'bg-gray-400'}`} /><span>{s.title}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2 gap-1.5 flex-wrap">
                          {(() => {
                            const info = situacaoCompraDoCard(cliente)
                            const cfg = SITUACAO_COMPRA_CONFIG[info.situacao]
                            const titulo = info.dias == null ? 'Nunca comprou' : `${info.dias} dia${info.dias === 1 ? '' : 's'} desde a última venda enviada ao Omie`
                            const aberto = seloSituacaoAberto === cliente.id
                            return (
                              <div className="relative inline-flex">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setSeloSituacaoAberto(aberto ? null : cliente.id) }}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border cursor-help tabular-nums ${cfg.cor}`}
                                  title={titulo}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.corDot}`} />
                                  {cfg.label}{info.dias != null ? ` · ${info.dias}d` : ''}
                                </button>
                                {aberto && (
                                  <div className="absolute left-0 top-6 z-30 w-48 rounded-xl border border-black/[0.08] bg-white dark:bg-[#2C2C30] p-2.5 text-[10px] text-gray-700 dark:text-gray-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
                                    {titulo}
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                          <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 font-medium tabular-nums ml-auto">
                            <span>C{cliente.cicloNumero || 1}</span>
                            {vendedor && (
                              <>
                                <span>·</span>
                                <span className="text-gray-600 dark:text-gray-300">{vendedor.nome.split(' ')[0]}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {(cliente.etapa === 'amostra' || cliente.etapa === 'amostra_perdida') && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {cliente.etapa === 'amostra' && (
                              <button onClick={(e) => { e.stopPropagation(); onClickCliente?.(cliente) }} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 font-medium border border-emerald-200/70" title="Registrar resultado da amostra por item">
                                <BeakerIcon className="h-3 w-3" /> Resultado
                              </button>
                            )}
                            {moverCliente && !['aprovada', 'reprovada', 'faturado', 'expedido', 'entregue'].includes(cliente.statusAmostra || '') && (
                              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Cancelar envio de amostra para ${cliente.razaoSocial}?`)) moverCliente(cliente.id, 'prospecção', { statusAmostra: undefined, dataEnvioAmostra: undefined, resultadoAmostra: undefined, dataResultadoAmostra: undefined }) }} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-red-50 text-red-700 rounded-md hover:bg-red-100 font-medium border border-red-200/70" title="Cancelar amostra e voltar para Prospecção">
                                <XCircleIcon className="h-3 w-3" /> Cancelar
                              </button>
                            )}
                          </div>
                        )}

                        {/* Proposta em aprovação / histórico de propostas — superfície neutra limpa estilo Apple */}
                        {(() => {
                          const historico = propostasPorCliente.get(cliente.id)
                          if (!historico || historico.length === 0) return null

                          if (cliente.etapa !== 'negociacao') {
                            const ultima = historico[0]
                            return (
                              <div className="mt-2 p-2 bg-[#F5F5F7] dark:bg-[#2C2C30] rounded-lg border border-black/[0.05] dark:border-white/[0.06]">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-200">Propostas ({historico.length})</span>
                                </div>
                                <div className="space-y-0.5 tabular-nums">
                                  {historico.slice(0, 2).map((p, i) => (
                                    <div key={p.id || i} className="flex items-center justify-between text-[10px]">
                                      <span className="text-gray-500 dark:text-gray-400 truncate max-w-[76px]">{p.numero}</span>
                                      <span className="font-semibold text-gray-900 dark:text-gray-100">R$ {p.totalValor.toLocaleString('pt-BR')}</span>
                                      <span className="text-gray-400 dark:text-gray-500">{new Date(p.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                    </div>
                                  ))}
                                  {historico.length > 2 && <p className="text-[9px] text-gray-500 text-center">+{historico.length - 2} mais</p>}
                                </div>
                                {ultima.frete && <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1">Frete: {ultima.frete}</p>}
                              </div>
                            )
                          }

                          const proposta = historico[0]
                          return (
                            <div className="mt-2 p-2 bg-[#F5F5F7] dark:bg-[#2C2C30] rounded-lg border border-black/[0.05] dark:border-white/[0.06] space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200">
                                  PROPOSTA
                                </span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold rounded-md bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                  <ClockIcon className="h-3 w-3" /> Aguardando aprovação
                                </span>
                              </div>
                              <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 tracking-tight tabular-nums">#{proposta.numero}</p>
                              {proposta.itens && proposta.itens.length > 0 && (
                                <div className="space-y-0.5 tabular-nums">
                                  {proposta.itens.map((item, idx) => (
                                    <div key={idx} className="text-[10px]">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="text-gray-700 dark:text-gray-300 font-medium leading-tight" title={item.nomeProduto}>
                                          {abreviarProduto(item.nomeProduto)}
                                        </span>
                                        <span className="font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap flex-shrink-0">
                                          {item.quantidade} kg
                                        </span>
                                      </div>
                                      <div className="text-gray-500 dark:text-gray-400 text-[9px]">
                                        {(item.preco * item.quantidade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </div>
                                    </div>
                                  ))}
                                  <div className="flex items-center justify-between pt-1 mt-1 border-t border-black/[0.06] dark:border-white/[0.08]">
                                    <span className="text-[9px] text-gray-500 dark:text-gray-400">
                                      {proposta.itens.reduce((s, i) => s + i.quantidade, 0)} kg
                                    </span>
                                    <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                                      {proposta.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {proposta.frete && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded-md bg-white dark:bg-[#1C1C1E] text-gray-700 dark:text-gray-300 border border-black/[0.06]">Frete: {proposta.frete}</span>
                                )}
                                {proposta.pagamento && (
                                  <span className="px-1.5 py-0.5 text-[9px] rounded-md bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-300 border border-black/[0.06] truncate max-w-[140px]">Prazo: {proposta.pagamento}</span>
                                )}
                              </div>
                            </div>
                          )
                        })()}

                        {cliente.valorEstimado && cliente.etapa !== 'negociacao' ? <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100 mt-1.5 tabular-nums">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p> : null}
                        {renderCardInfo(cliente)}
                        {/* Logistics mini-info from pedidos */}
                        {(() => {
                          if (cliente.etapa === 'negociacao') return null
                          const info = getClientePedidoInfo(cliente)
                          if (!info) return null
                          const p = info.latest
                          const isFollowUpCard = cliente.etapa === 'follow_up' || cliente.etapa === 'arquivado'
                          const omieRaw = cliente.omieStatusLogistico || p.omieStatus
                          const omie = getOmieStatusDisplay(omieRaw)
                          const statusLabel: Record<string, string> = { rascunho: 'Rascunho', enviado: 'Aguardando aprovação', confirmado: 'Confirmado', cancelado: 'Não aprovado' }
                          return (
                            <div className="mt-2 p-2 bg-[#F5F5F7] dark:bg-[#2C2C30] rounded-lg border border-black/[0.05] dark:border-white/[0.06] space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold rounded-md ${p.tipo === 'bonificacao' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {p.tipo === 'bonificacao' ? (p.numero?.toUpperCase().startsWith('BON-') ? 'Bonificação' : 'Amostra') : (isFollowUpCard ? 'VENDA' : 'Venda')}
                                </span>
                                {!isFollowUpCard && (
                                  <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-md ${p.status === 'confirmado' ? 'bg-emerald-100 text-emerald-800' : p.status === 'enviado' ? 'bg-amber-100 text-amber-800' : p.status === 'cancelado' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-700'}`}>
                                    {statusLabel[p.status] || p.status}
                                  </span>
                                )}
                                {isFollowUpCard && (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold rounded-md ${omie.classes}`} title={omie.recognized ? `Status bruto: ${omie.raw}` : `Status Omie não reconhecido: ${omie.raw || 'ausente'}`}>
                                    Omie: {omie.label}
                                  </span>
                                )}
                                {info.total > 1 && <span className="text-[9px] text-gray-400">{info.total} pedidos</span>}
                              </div>
                              <p className={`${isFollowUpCard ? 'text-[13px] font-bold text-gray-900 dark:text-gray-100 tracking-tight' : 'text-[10px] text-gray-500 dark:text-gray-400 font-medium'} tabular-nums`}>
                                {p.omieNumero ? `Omie #${p.omieNumero}` : `#${p.numero}`}
                              </p>
                              {p.itens && p.itens.length > 0 && (
                                <div className="space-y-0.5 tabular-nums">
                                  {p.itens.map((item, idx) => (
                                    <div key={idx} className="text-[10px]">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="text-gray-700 dark:text-gray-300 font-medium leading-tight" title={item.nomeProduto}>
                                          {abreviarProduto(item.nomeProduto)}
                                        </span>
                                        <span className="font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap flex-shrink-0">
                                          {item.quantidade} kg
                                        </span>
                                      </div>
                                      <div className="text-gray-500 dark:text-gray-400 text-[9px]">
                                        {(item.preco * item.quantidade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </div>
                                    </div>
                                  ))}
                                  <div className="flex items-center justify-between pt-1 mt-1 border-t border-black/[0.06] dark:border-white/[0.08]">
                                    <span className="text-[9px] text-gray-500 dark:text-gray-400">
                                      {p.itens.reduce((s, i) => s + i.quantidade, 0)} kg
                                    </span>
                                    <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                                      {p.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {p.tipoFrete && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded-md bg-white dark:bg-[#1C1C1E] text-gray-700 dark:text-gray-300 border border-black/[0.06]">{p.tipoFrete}</span>
                                )}
                                {p.formaPagamento && (
                                  <span className="px-1.5 py-0.5 text-[9px] rounded-md bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-300 border border-black/[0.06] truncate max-w-[120px]">{p.formaPagamento}</span>
                                )}
                              </div>
                              {!isFollowUpCard && omieRaw && <p className="text-[9px] text-gray-400 dark:text-gray-500">Omie: {omie.label}</p>}
                              {p.omieErro && <p className="text-[9px] text-red-600 dark:text-red-400 leading-tight mt-0.5" title={p.omieErro}>{p.omieErro.slice(0, 80)}{p.omieErro.length > 80 ? '…' : ''}</p>}
                              {p.motivoRecusa && (
                                <div className="mt-1 p-1.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200/70 dark:border-red-800/30">
                                  <p className="text-[9px] font-semibold text-red-700 dark:text-red-300">Não aprovado:</p>
                                  <p className="text-[9px] text-red-600 dark:text-red-300 leading-tight">{p.motivoRecusa}</p>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                        {nextAction && cliente.etapa !== 'follow_up' && cliente.etapa !== 'arquivado' && <p className={`text-[10px] font-medium mt-1.5 leading-snug ${nextAction.color}`}>{nextAction.text}</p>}
                        {cliente.produtosInteresse && cliente.produtosInteresse.length > 0 && cliente.etapa !== 'follow_up' && cliente.etapa !== 'arquivado' && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {cliente.produtosInteresse.slice(0, 3).map(p => (<span key={p} className="px-1.5 py-0.5 text-[9px] bg-black/[0.04] dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 rounded-md truncate max-w-[104px]">{p}</span>))}
                            {cliente.produtosInteresse.length > 3 && <span className="text-[9px] text-gray-400">+{cliente.produtosInteresse.length - 3}</span>}
                          </div>
                        )}
                        {(() => {
                          const socials = extractValidSocialLinks(cliente).filter(s => !(cliente.etapa === 'follow_up' || cliente.etapa === 'arquivado') || s.key !== 'instagram')
                          return socials.length > 0 ? (
                            <div className="flex gap-1 mt-1">
                              {socials.map((s) => (
                                <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition-colors text-[10px]" title={s.title}>{s.icon}</a>
                              ))}
                            </div>
                          ) : null
                        })()}
                      </div>
                    )
                  })}
                  {restantesCol > 0 && (
                    <button
                      type="button"
                      onClick={() => setColLimits(prev => ({ ...prev, [stage.key]: (prev[stage.key] || INITIAL_COL_LIMIT) + 80 }))}
                      className="w-full py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-white/70 dark:bg-[#1C1C1E] rounded-xl border border-black/[0.05] dark:border-white/[0.07] transition-colors cursor-pointer"
                    >
                      Mostrar mais ({restantesCol} restantes)
                    </button>
                  )}
                  {stageClientes.length === 0 && !showNovosCiclos && !search.trim() && <div className="p-6 text-center text-gray-400 dark:text-gray-600 text-xs">Arraste clientes aqui</div>}

                  {/* Novos ciclos: todos juntos, ocultos por padrão, botão 🔄 no header para mostrar — auto-mostrar quando pesquisa encontra */}
                  {isProposta && (showNovosCiclos || search.trim()) && (() => {
                    const todos = clientesNovoCiclo.filter(c => !novoCicloEscondidos.has(c.id))
                    if (todos.length === 0) return <div className="p-4 text-center text-gray-400 text-[11px]">Arraste clientes aqui</div>
                    return (
                      <>
                        {stageClientes.length > 0 && (
                          <div className="flex items-center gap-2 py-1">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-[9px] text-gray-400 uppercase tracking-wide whitespace-nowrap">{todos.length} novo{todos.length > 1 ? 's' : ''} ciclo{todos.length > 1 ? 's' : ''}</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                        )}
                        {todos.map((cliente) => {
                          const vendedor = cliente.vendedorId ? vendedorMap.get(cliente.vendedorId) : undefined
                          const handleClick = () => onNovoCiclo ? onNovoCiclo(cliente) : onClickCliente?.(cliente)
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
                                <div className="flex items-center justify-between mt-1.5 gap-1">
                                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-700 rounded-md border border-gray-200">
                                    Ciclo {cliente.cicloNumero || 2}
                                  </span>
                                  {vendedor && <span className="text-[10px] text-primary-500 font-medium flex-shrink-0">{vendedor.nome.split(' ')[0]}</span>}
                                </div>
                                {cliente.valorEstimado ? <p className="text-[11px] font-bold text-primary-600 mt-1.5">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p> : null}
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}

                  {isProposta && (showNovosCiclos || search.trim()) && novoCicloCount === 0 && stageClientes.length === 0 && (
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
              <h2 className="text-white font-semibold text-base flex items-center gap-2">
                <LockClosedIcon className="h-5 w-5" /> Ação obrigatória — Amostra vencida
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
                          onClickCliente?.(c)
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors"
                      >
                        Registrar Resultado (por item)
                      </button>
                      <button
                        onClick={() => {
                          if (!moverCliente) return
                          setLockProcessing(true)
                          moverCliente(c.id, 'amostra_perdida', {
                            resultadoAmostra: undefined,
                            dataResultadoAmostra: new Date().toISOString().split('T')[0],
                            motivoReprovacao: 'Amostra perdida / não recebida pelo cliente',
                          })
                          setTimeout(() => setLockProcessing(false), 500)
                        }}
                        className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors"
                      >
                        Amostra Perdida
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
              <h2 className="text-white font-semibold text-base flex items-center gap-2">
                <LockClosedIcon className="h-5 w-5" /> Ação obrigatória — Follow-up pendente
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
                        onClick={async () => {
                          if (!onColetarSatisfacao || lockProcessing) return
                          setLockProcessing(true)
                          try {
                            await onColetarSatisfacao(c)
                          } catch {
                            window.alert('Não foi possível abrir a tarefa de satisfação. Tente novamente.')
                          } finally {
                            setLockProcessing(false)
                          }
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
                        Nova Proposta
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
