import type { CadastroJustificativa, Cliente, Pedido, PropostaHistorico, Tarefa, Vendedor } from '../types'
import { avaliarCadastroCliente, CADASTRO_CAMPO_LABEL, CampoCadastroKey, CAMPOS_CADASTRO_PADRAO, justificativasAtivas, SituacaoCadastro } from './cadastroCompleto'
import { classificarSituacaoCompra, diasDesdeData, situacaoContaNaCarteiraAte180, SituacaoCompra } from './situacaoCompra'
import { CANAL_LABEL, CanalTarefa, inferirOrigemTarefa, OBJETIVO_LABEL, ObjetivoTarefa } from './tarefaFluxo'

export type StatusCadencia = 'verde' | 'amarelo' | 'vermelho' | 'cinza'

export const CADENCIA_CONFIG: Record<StatusCadencia, { label: string; cor: string; corBarra: string; ordem: number }> = {
  vermelho: { label: 'Vencido (>15d)', cor: 'bg-red-100 text-red-800 border-red-200', corBarra: '#DC2626', ordem: 0 },
  amarelo: { label: 'Atenção (11–15d)', cor: 'bg-amber-100 text-amber-800 border-amber-200', corBarra: '#F59E0B', ordem: 1 },
  verde: { label: 'Em dia (≤10d)', cor: 'bg-emerald-100 text-emerald-800 border-emerald-200', corBarra: '#16A34A', ordem: 2 },
  cinza: { label: 'Justificado', cor: 'bg-slate-200 text-slate-700 border-slate-300', corBarra: '#94A3B8', ordem: 3 },
}

export type CanalRelatorio = CanalTarefa | 'sem_canal'
export type ObjetivoRelatorio = ObjetivoTarefa | 'sem_objetivo'

export const CANAL_RELATORIO_LABEL: Record<CanalRelatorio, string> = {
  ...CANAL_LABEL,
  sem_canal: 'Sem canal',
}

export const OBJETIVO_RELATORIO_LABEL: Record<ObjetivoRelatorio, string> = {
  ...OBJETIVO_LABEL,
  sem_objetivo: 'Sem objetivo',
}

export interface FiltrosRelatorioFase2 {
  periodo: '7d' | '30d' | '90d' | 'mes_atual' | 'total'
  dataInicio?: string
  dataFim?: string
  vendedorId: number | 'todos' | 'banco_clientes' | 'banco_prospectos'
  cadencia: StatusCadencia | 'todos'
  situacaoCompra: SituacaoCompra | 'todos'
  situacaoCadastro: SituacaoCadastro | 'todos'
  objetivo: ObjetivoRelatorio | 'todos'
  canal: CanalRelatorio | 'todos'
  origemTarefa: 'manual' | 'automatica' | 'todos'
  segmento: string
  uf: string
}

export const FILTROS_RELATORIO_PADRAO: FiltrosRelatorioFase2 = {
  periodo: 'mes_atual',
  vendedorId: 'todos',
  cadencia: 'todos',
  situacaoCompra: 'todos',
  situacaoCadastro: 'todos',
  objetivo: 'todos',
  canal: 'todos',
  origemTarefa: 'todos',
  segmento: 'todos',
  uf: 'todos',
}

export interface EmpresaConsolidada {
  chave: string
  cardPrincipal: Cliente
  cards: Cliente[]
  vendedorId: number | null
  banco: 'clientes' | 'prospectos' | null
  situacaoCompra: SituacaoCompra
  diasSemCompra: number | null
  ultimaVendaISO: string | null
  situacaoCadastro: SituacaoCadastro
  camposFaltantes: CampoCadastroKey[]
  justificativasCadastro: CadastroJustificativa[]
  cadencia: StatusCadencia
  diasSemContato: number | null
  ultimoContatoISO: string | null
  ultimoContatoObjetivo?: ObjetivoTarefa
  ultimoContatoCanal?: CanalRelatorio
  proximaTarefa?: Tarefa
  temTarefaAberta: boolean
  justificativaPrazoLongo?: string
  segmento: string
  uf: string
}

export interface SinalIrregularItem {
  tipo: 'rajada_15min' | 'conclusao_repetida' | 'ia_marcado'
  vendedorId: number
  vendedorNome: string
  descricao: string
  tarefasIds: number[]
  clienteId?: number
  clienteNome?: string
  data?: string
}

export interface PedidoLeadTimeItem {
  pedido: Pedido
  empresa: EmpresaConsolidada | undefined
  diasLeadTime: number
  dataEnvioISO: string
  dataFaturamentoISO: string
}

export interface ClienteRitmoItem {
  empresa: EmpresaConsolidada
  intervaloMedioDias: number
  diasDesdeUltimaCompra: number
  limiteAlertaDias: number
}

export interface IndicadoresVendedorFase2 {
  vendedorId: number | 'banco_clientes' | 'banco_prospectos' | 'equipe'
  vendedorNome: string
  ativo: boolean
  somaNosTotais: boolean
  totalEmpresas: number
  carteira180: EmpresaConsolidada[]
  situacaoCompraCounts: Record<SituacaoCompra, EmpresaConsolidada[]>
  situacaoCadastroCounts: Record<SituacaoCadastro, EmpresaConsolidada[]>
  // 1 a 8 — Disciplina
  semTarefaAberta: EmpresaConsolidada[]
  verdes: EmpresaConsolidada[]
  amarelos: EmpresaConsolidada[]
  vermelhos: EmpresaConsolidada[]
  justificados: EmpresaConsolidada[]
  pctCarteiraEmDia: number
  coberturaMes: EmpresaConsolidada[]
  pctCoberturaMes: number
  tarefasAtrasadas: { tarefa: Tarefa; empresa?: EmpresaConsolidada; diasAtraso: number }[]
  clientesEmpurrados: { tarefa: Tarefa; empresa?: EmpresaConsolidada; qtdReagendamentos: number }[]
  justificativasPrazoLongo: { empresa: EmpresaConsolidada; tarefa: Tarefa; justificativa: string }[]
  cadastrosCompletos: EmpresaConsolidada[]
  pctCadastrosCompletos: number
  justificativasCadastro: { empresa: EmpresaConsolidada; item: CadastroJustificativa }[]
  // 9 a 11 — Contato
  tarefasFinalizadasMes: Tarefa[]
  contatosPorClienteMes: number
  atividadesDia: Tarefa[]
  atividadesSemana: Tarefa[]
  atividadesMes: Tarefa[]
  porCanalMes: Record<CanalRelatorio, Tarefa[]>
  porObjetivoMes: Record<ObjetivoRelatorio, Tarefa[]>
  pctRelacionamento: number
  pctOfertaVenda: number
  pctDemaisObjetivos: number
  // 12 a 17 — Resultado do trabalho
  pedidosSemContato15d: { pedido: Pedido; empresa?: EmpresaConsolidada }[]
  clientesForaDoRitmo: ClienteRitmoItem[]
  amostrasSemRetorno30d: { card: Cliente; empresa: EmpresaConsolidada; dias: number }[]
  pctAmostrasViraramPedido: number
  propostasParadas3d: { card: Cliente; empresa: EmpresaConsolidada; dias: number }[]
  pctPropostasViraramPedido: number
  reativacoesMes: EmpresaConsolidada[]
  leadTimePedidos: PedidoLeadTimeItem[]
  leadTimeMediaDias: number | null
  leadTimeMaxDias: number | null
  // 18 e 19 — Uso do CRM
  tempoAtivoSegundos: number
  sinaisIrregulares: SinalIrregularItem[]
}

function dataLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normNome(s?: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function digits(s?: string): string {
  return String(s || '').replace(/\D/g, '')
}

export function canalEfetivoTarefa(t: Tarefa): CanalRelatorio {
  if (t.canalUsado && ['ligacao', 'whatsapp', 'email', 'visita', 'reuniao'].includes(t.canalUsado)) {
    return t.canalUsado
  }
  if (['ligacao', 'whatsapp', 'email', 'visita', 'reuniao'].includes(t.tipo)) {
    return t.tipo as CanalTarefa
  }
  return 'sem_canal'
}

export function objetivoEfetivoTarefa(t: Tarefa): ObjetivoRelatorio {
  if (t.objetivo && ['relacionamento', 'oferta_venda', 'cotacao', 'pos_venda', 'cobranca'].includes(t.objetivo)) {
    return t.objetivo
  }
  return 'sem_objetivo'
}

export function dataConclusaoISO(t: Tarefa): string {
  return (t.concluidaEm || t.data || '').slice(0, 10)
}

export function calcularCadenciaEmpresa(
  tarefasDaEmpresa: Tarefa[],
  agora: Date = new Date(),
): {
  cadencia: StatusCadencia
  diasSemContato: number | null
  ultimoContatoISO: string | null
  ultimoContatoObjetivo?: ObjetivoTarefa
  ultimoContatoCanal?: CanalRelatorio
  proximaTarefa?: Tarefa
  temTarefaAberta: boolean
  justificativaPrazoLongo?: string
} {
  const hojeISO = dataLocalISO(agora)
  const pendentes = tarefasDaEmpresa
    .filter(t => t.status === 'pendente')
    .sort((a, b) => (a.data || '9999-99-99').localeCompare(b.data || '9999-99-99'))
  const proximaTarefa = pendentes[0]
  const temTarefaAberta = pendentes.length > 0

  const concluidas = tarefasDaEmpresa
    .filter(t => t.status === 'concluida' && !!(t.concluidaEm || t.data))
    .sort((a, b) => String(b.concluidaEm || b.data).localeCompare(String(a.concluidaEm || a.data)))
  const ultimaConcluida = concluidas[0]
  const ultimoContatoISO = ultimaConcluida ? (ultimaConcluida.concluidaEm || ultimaConcluida.data) : null
  const diasSemContato = ultimoContatoISO ? diasDesdeData(ultimoContatoISO.slice(0, 10), agora) : null

  // Regra do Cinza (Justificado): próximo passo aberto com justificativa de prazo longo e data >= hoje.
  const pendenteJustificadaFutura = pendentes.find(
    t => !!t.justificativaPrazoLongo?.trim() && !!t.data && t.data >= hojeISO
  )
  if (pendenteJustificadaFutura) {
    return {
      cadencia: 'cinza',
      diasSemContato,
      ultimoContatoISO,
      ultimoContatoObjetivo: ultimaConcluida?.objetivo,
      ultimoContatoCanal: ultimaConcluida ? canalEfetivoTarefa(ultimaConcluida) : undefined,
      proximaTarefa: pendenteJustificadaFutura,
      temTarefaAberta,
      justificativaPrazoLongo: pendenteJustificadaFutura.justificativaPrazoLongo,
    }
  }

  // Se uma tarefa com justificativa de prazo longo passou da data sem ser finalizada, vai para Vermelho.
  const pendenteJustificadaVencida = pendentes.find(
    t => !!t.justificativaPrazoLongo?.trim() && !!t.data && t.data < hojeISO
  )
  if (pendenteJustificadaVencida && (diasSemContato == null || diasSemContato > 10)) {
    return {
      cadencia: 'vermelho',
      diasSemContato,
      ultimoContatoISO,
      ultimoContatoObjetivo: ultimaConcluida?.objetivo,
      ultimoContatoCanal: ultimaConcluida ? canalEfetivoTarefa(ultimaConcluida) : undefined,
      proximaTarefa,
      temTarefaAberta,
      justificativaPrazoLongo: pendenteJustificadaVencida.justificativaPrazoLongo,
    }
  }

  let cadencia: StatusCadencia = 'vermelho'
  if (diasSemContato != null) {
    if (diasSemContato <= 10) cadencia = 'verde'
    else if (diasSemContato <= 15) cadencia = 'amarelo'
    else cadencia = 'vermelho'
  }

  return {
    cadencia,
    diasSemContato,
    ultimoContatoISO,
    ultimoContatoObjetivo: ultimaConcluida?.objetivo,
    ultimoContatoCanal: ultimaConcluida ? canalEfetivoTarefa(ultimaConcluida) : undefined,
    proximaTarefa,
    temTarefaAberta,
    justificativaPrazoLongo: proximaTarefa?.justificativaPrazoLongo,
  }
}

export function consolidarEmpresasFase2(
  clientesRaw: Cliente[],
  pedidos: Pedido[],
  tarefas: Tarefa[],
  camposObrigatorios: CampoCadastroKey[] = CAMPOS_CADASTRO_PADRAO,
  agora: Date = new Date(),
): { empresas: EmpresaConsolidada[]; empresaPorCardId: Map<number, EmpresaConsolidada> } {
  const clientes = clientesRaw.filter(c => !c.arquivadoDuplicata)
  const parent = new Map<number, number>(clientes.map(c => [c.id, c.id]))
  const find = (x: number): number => {
    let cur = x
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!
      parent.set(cur, parent.get(p)!)
      cur = p
    }
    return cur
  }
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  const seen = new Map<string, number>()
  for (const c of clientes) {
    const keys: string[] = []
    if (c.empresaFunilId) keys.push(`ef:${c.empresaFunilId}`)
    const doc = digits(c.cnpj || c.cpf)
    if (doc) keys.push(`doc:${doc}`)
    if (c.omieCodigo) keys.push(`omie:${c.omieCodigo}`)
    const nm = normNome(c.razaoSocial)
    if (nm) keys.push(`nm:${nm}`)
    if (keys.length === 0) keys.push(`id:${c.id}`)
    for (const k of keys) {
      if (seen.has(k)) union(c.id, seen.get(k)!)
      else seen.set(k, c.id)
    }
  }

  const fams = new Map<number, Cliente[]>()
  for (const c of clientes) {
    const r = find(c.id)
    if (!fams.has(r)) fams.set(r, [])
    fams.get(r)!.push(c)
  }

  const pedidosPorCard = new Map<number, Pedido[]>()
  for (const p of pedidos) {
    if (!pedidosPorCard.has(p.clienteId)) pedidosPorCard.set(p.clienteId, [])
    pedidosPorCard.get(p.clienteId)!.push(p)
  }

  const tarefasPorCard = new Map<number, Tarefa[]>()
  for (const t of tarefas) {
    if (!t.clienteId) continue
    if (!tarefasPorCard.has(t.clienteId)) tarefasPorCard.set(t.clienteId, [])
    tarefasPorCard.get(t.clienteId)!.push(t)
  }

  const etapasAbertasRank: Record<string, number> = {
    negociacao: 6,
    proposta: 5,
    amostra: 4,
    follow_up: 3,
    'prospecção': 2,
    lead: 1,
  }

  const empresas: EmpresaConsolidada[] = []
  const empresaPorCardId = new Map<number, EmpresaConsolidada>()

  for (const [root, cards] of fams) {
    const sorted = [...cards].sort((a, b) => {
      const ra = etapasAbertasRank[a.etapa] || 0
      const rb = etapasAbertasRank[b.etapa] || 0
      if (ra !== rb) return rb - ra
      return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')) || (b.id - a.id)
    })
    const cardPrincipal = sorted[0]
    const cardComVendedor = sorted.find(c => c.vendedorId != null && c.vendedorId > 0)
    const vendedorId = cardComVendedor?.vendedorId ?? null

    // Datas de venda confirmadas e integradas ao Omie + dataUltimaVenda legada
    const datasVenda: string[] = []
    for (const card of cards) {
      for (const p of pedidosPorCard.get(card.id) || []) {
        const integrado = !!(p.omieCodigo || p.omieNumero || p.dataEnvioOmie)
        if (p.status === 'confirmado' && (p.tipo || 'venda') === 'venda' && integrado) {
          const dt = p.dataEnvioOmie || p.dataAprovacao || p.dataEnvio
          if (dt) datasVenda.push(dt.slice(0, 10))
        }
      }
      if (card.dataUltimaVenda) datasVenda.push(card.dataUltimaVenda.slice(0, 10))
    }
    datasVenda.sort((a, b) => b.localeCompare(a))
    const ultimaVendaISO = datasVenda[0] || null
    const compra = classificarSituacaoCompra(ultimaVendaISO, agora)

    const cad = avaliarCadastroCliente(cardPrincipal, cards, camposObrigatorios, agora)
    const justCad = justificativasAtivas(cardPrincipal, cards)

    const tarefasEmpresa = cards.flatMap(card => tarefasPorCard.get(card.id) || [])
    const cadInfo = calcularCadenciaEmpresa(tarefasEmpresa, agora)

    const segmento = cards.map(c => c.segmento).find(s => !!(s && s.trim()))?.trim() || ''
    const uf = cards.map(c => c.enderecoEstado).find(s => !!(s && s.trim()))?.trim().toUpperCase() || ''
    const banco: EmpresaConsolidada['banco'] = vendedorId == null
      ? (compra.situacao === 'prospecto' ? 'prospectos' : 'clientes')
      : null

    const emp: EmpresaConsolidada = {
      chave: `emp:${root}`,
      cardPrincipal,
      cards,
      vendedorId,
      banco,
      situacaoCompra: compra.situacao,
      diasSemCompra: compra.dias,
      ultimaVendaISO,
      situacaoCadastro: cad.situacao,
      camposFaltantes: cad.faltantes,
      justificativasCadastro: justCad,
      cadencia: cadInfo.cadencia,
      diasSemContato: cadInfo.diasSemContato,
      ultimoContatoISO: cadInfo.ultimoContatoISO,
      ultimoContatoObjetivo: cadInfo.ultimoContatoObjetivo,
      ultimoContatoCanal: cadInfo.ultimoContatoCanal,
      proximaTarefa: cadInfo.proximaTarefa,
      temTarefaAberta: cadInfo.temTarefaAberta,
      justificativaPrazoLongo: cadInfo.justificativaPrazoLongo,
      segmento,
      uf,
    }
    empresas.push(emp)
    for (const card of cards) empresaPorCardId.set(card.id, emp)
  }

  return { empresas, empresaPorCardId }
}

export function intervaloDatasFiltro(
  filtros: Pick<FiltrosRelatorioFase2, 'periodo' | 'dataInicio' | 'dataFim'>,
  agora: Date = new Date(),
): { inicioISO: string; fimISO: string } {
  const fimISO = filtros.dataFim || dataLocalISO(agora)
  if (filtros.dataInicio) return { inicioISO: filtros.dataInicio, fimISO }
  if (filtros.periodo === '7d') {
    const d = new Date(agora); d.setDate(d.getDate() - 7)
    return { inicioISO: dataLocalISO(d), fimISO }
  }
  if (filtros.periodo === '30d') {
    const d = new Date(agora); d.setDate(d.getDate() - 30)
    return { inicioISO: dataLocalISO(d), fimISO }
  }
  if (filtros.periodo === '90d') {
    const d = new Date(agora); d.setDate(d.getDate() - 90)
    return { inicioISO: dataLocalISO(d), fimISO }
  }
  if (filtros.periodo === 'mes_atual') {
    return { inicioISO: `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`, fimISO }
  }
  return { inicioISO: '0001-01-01', fimISO }
}

export function detectarSinaisIrregulares(
  tarefas: Tarefa[],
  vendedores: Vendedor[],
  empresaPorCardId: Map<number, EmpresaConsolidada>,
): SinalIrregularItem[] {
  const vendNomeMap = new Map(vendedores.map(v => [v.id, v.nome]))
  const sinais: SinalIrregularItem[] = []
  const concluidas = tarefas.filter(t => t.status === 'concluida')

  // 1) Mais de 10 tarefas finalizadas em 15 minutos pelo mesmo vendedor
  const porVend = new Map<number, Tarefa[]>()
  for (const t of concluidas) {
    if (!t.vendedorId || !t.concluidaEm) continue
    if (!porVend.has(t.vendedorId)) porVend.set(t.vendedorId, [])
    porVend.get(t.vendedorId)!.push(t)
  }

  for (const [vendId, lista] of porVend) {
    const ord = [...lista]
      .map(t => ({ t, ms: new Date(t.concluidaEm!).getTime() }))
      .filter(x => Number.isFinite(x.ms))
      .sort((a, b) => a.ms - b.ms)
    let j = 0
    let reportouJanela = false
    for (let i = 0; i < ord.length; i++) {
      while (j < ord.length && ord[j].ms - ord[i].ms <= 15 * 60 * 1000) j++
      const qtd = j - i
      if (qtd > 10 && !reportouJanela) {
        reportouJanela = true
        const slice = ord.slice(i, j).map(x => x.t)
        sinais.push({
          tipo: 'rajada_15min',
          vendedorId: vendId,
          vendedorNome: vendNomeMap.get(vendId) || `Vendedor #${vendId}`,
          descricao: `${qtd} tarefas finalizadas em menos de 15 minutos (${new Date(ord[i].ms).toLocaleString('pt-BR')})`,
          tarefasIds: slice.map(x => x.id),
          clienteId: slice[0]?.clienteId,
          clienteNome: slice[0]?.clienteId ? empresaPorCardId.get(slice[0].clienteId)?.cardPrincipal.razaoSocial : undefined,
          data: ord[i].t.concluidaEm?.slice(0, 10),
        })
      }
    }
  }

  // 2) Conclusões repetidas (mesmo vendedor repetindo exatamente o mesmo texto em 3+ tarefas concluídas)
  for (const [vendId, lista] of porVend) {
    const porTexto = new Map<string, Tarefa[]>()
    for (const t of lista) {
      const txt = normNome(t.conclusao)
      if (!txt) continue
      if (!porTexto.has(txt)) porTexto.set(txt, [])
      porTexto.get(txt)!.push(t)
    }
    for (const [txt, arr] of porTexto) {
      if (arr.length >= 3) {
        sinais.push({
          tipo: 'conclusao_repetida',
          vendedorId: vendId,
          vendedorNome: vendNomeMap.get(vendId) || `Vendedor #${vendId}`,
          descricao: `Conclusão repetida ${arr.length}x: "${(arr[0].conclusao || txt).slice(0, 80)}"`,
          tarefasIds: arr.map(x => x.id),
          clienteId: arr[0]?.clienteId,
          clienteNome: arr[0]?.clienteId ? empresaPorCardId.get(arr[0].clienteId)?.cardPrincipal.razaoSocial : undefined,
          data: dataConclusaoISO(arr[0]),
        })
      }
    }
  }

  return sinais
}

export function calcularIndicadoresGrupo(params: {
  id: IndicadoresVendedorFase2['vendedorId']
  nome: string
  ativo: boolean
  somaNosTotais: boolean
  empresasGrupo: EmpresaConsolidada[]
  tarefasGrupo: Tarefa[]
  pedidosGrupo: Pedido[]
  propostas: PropostaHistorico[]
  empresaPorCardId: Map<number, EmpresaConsolidada>
  tempoAtivoSegundos?: number
  sinaisIrregulares?: SinalIrregularItem[]
  inicioPeriodoISO: string
  fimPeriodoISO: string
  agora?: Date
}): IndicadoresVendedorFase2 {
  const agora = params.agora || new Date()
  const hojeISO = dataLocalISO(agora)
  const mesInicioISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
  const semanaInicioDate = new Date(agora)
  semanaInicioDate.setDate(agora.getDate() - agora.getDay())
  const semanaInicioISO = dataLocalISO(semanaInicioDate)

  const janelaInicio = params.inicioPeriodoISO === '0001-01-01' ? mesInicioISO : params.inicioPeriodoISO
  const janelaFim = params.fimPeriodoISO || hojeISO

  const situacaoCompraCounts: Record<SituacaoCompra, EmpresaConsolidada[]> = {
    prospecto: [], ativo: [], em_atencao: [], em_risco: [], inativo_recente: [], inativo_antigo: [],
  }
  const situacaoCadastroCounts: Record<SituacaoCadastro, EmpresaConsolidada[]> = {
    completo: [], completo_com_justificativa: [], incompleto: [], incompleto_vencido: [],
  }

  for (const emp of params.empresasGrupo) {
    situacaoCompraCounts[emp.situacaoCompra].push(emp)
    situacaoCadastroCounts[emp.situacaoCadastro].push(emp)
  }

  const carteira180 = params.empresasGrupo.filter(e => situacaoContaNaCarteiraAte180(e.situacaoCompra))
  const chavesCarteira180 = new Set(carteira180.map(e => e.chave))
  const cardIdsGrupo = new Set(params.empresasGrupo.flatMap(e => e.cards.map(c => c.id)))
  const cardIdsCarteira180 = new Set(carteira180.flatMap(e => e.cards.map(c => c.id)))

  const semTarefaAberta = carteira180.filter(e => !e.temTarefaAberta)
  const verdes = carteira180.filter(e => e.cadencia === 'verde')
  const amarelos = carteira180.filter(e => e.cadencia === 'amarelo')
  const vermelhos = carteira180.filter(e => e.cadencia === 'vermelho')
  const justificados = carteira180.filter(e => e.cadencia === 'cinza')
  const pctCarteiraEmDia = carteira180.length > 0 ? Math.round((verdes.length / carteira180.length) * 1000) / 10 : 0

  // Cobertura no mês/janela
  const concluidasNoPeriodo = params.tarefasGrupo.filter(t => {
    if (t.status !== 'concluida') return false
    const dt = dataConclusaoISO(t)
    return dt >= janelaInicio && dt <= janelaFim
  })
  const empresasComTarefaNoMes = new Set<string>()
  for (const t of concluidasNoPeriodo) {
    if (!t.clienteId) continue
    const emp = params.empresaPorCardId.get(t.clienteId)
    if (emp && chavesCarteira180.has(emp.chave)) empresasComTarefaNoMes.add(emp.chave)
  }
  const coberturaMes = carteira180.filter(e => empresasComTarefaNoMes.has(e.chave))
  const pctCoberturaMes = carteira180.length > 0 ? Math.round((coberturaMes.length / carteira180.length) * 1000) / 10 : 0

  // Tarefas atrasadas
  const tarefasAtrasadas = params.tarefasGrupo
    .filter(t => t.status === 'pendente' && !!t.data && t.data < hojeISO)
    .map(t => ({
      tarefa: t,
      empresa: t.clienteId ? params.empresaPorCardId.get(t.clienteId) : undefined,
      diasAtraso: diasDesdeData(t.data, agora),
    }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso)

  // Cliente empurrado (3+ reagendamentos)
  const clientesEmpurrados = params.tarefasGrupo
    .filter(t => t.status === 'pendente' && (t.reagendamentos?.length || 0) >= 3)
    .map(t => ({
      tarefa: t,
      empresa: t.clienteId ? params.empresaPorCardId.get(t.clienteId) : undefined,
      qtdReagendamentos: t.reagendamentos?.length || 0,
    }))
    .sort((a, b) => b.qtdReagendamentos - a.qtdReagendamentos)

  // Justificativas de prazo longo
  const justificativasPrazoLongo = justificados
    .filter(e => !!e.proximaTarefa && !!e.justificativaPrazoLongo)
    .map(e => ({
      empresa: e,
      tarefa: e.proximaTarefa!,
      justificativa: e.justificativaPrazoLongo!,
    }))

  // Cadastros completos (base carteira 180d)
  const cadastrosCompletos = carteira180.filter(
    e => e.situacaoCadastro === 'completo' || e.situacaoCadastro === 'completo_com_justificativa'
  )
  const pctCadastrosCompletos = carteira180.length > 0 ? Math.round((cadastrosCompletos.length / carteira180.length) * 1000) / 10 : 0

  const justificativasCadastro = params.empresasGrupo.flatMap(emp =>
    emp.justificativasCadastro.map(item => ({ empresa: emp, item }))
  )

  // Contato (9, 10, 11)
  const concluidasTodas = params.tarefasGrupo.filter(t => t.status === 'concluida')
  const concluidasCarteiraMes = concluidasNoPeriodo.filter(t => !t.clienteId || cardIdsCarteira180.has(t.clienteId))
  const contatosPorClienteMes = carteira180.length > 0
    ? Math.round((concluidasCarteiraMes.length / carteira180.length) * 100) / 100
    : 0

  const atividadesDia = concluidasTodas.filter(t => dataConclusaoISO(t) === hojeISO)
  const atividadesSemana = concluidasTodas.filter(t => {
    const dt = dataConclusaoISO(t)
    return dt >= semanaInicioISO && dt <= hojeISO
  })
  const atividadesMes = concluidasNoPeriodo

  const porCanalMes: Record<CanalRelatorio, Tarefa[]> = {
    ligacao: [], whatsapp: [], email: [], visita: [], reuniao: [], sem_canal: [],
  }
  const porObjetivoMes: Record<ObjetivoRelatorio, Tarefa[]> = {
    relacionamento: [], oferta_venda: [], cotacao: [], pos_venda: [], cobranca: [], sem_objetivo: [],
  }
  for (const t of atividadesMes) {
    porCanalMes[canalEfetivoTarefa(t)].push(t)
    porObjetivoMes[objetivoEfetivoTarefa(t)].push(t)
  }
  const totObj = atividadesMes.length
  const pctRelacionamento = totObj > 0 ? Math.round((porObjetivoMes.relacionamento.length / totObj) * 1000) / 10 : 0
  const pctOfertaVenda = totObj > 0 ? Math.round((porObjetivoMes.oferta_venda.length / totObj) * 1000) / 10 : 0
  const demaisCount = totObj - porObjetivoMes.relacionamento.length - porObjetivoMes.oferta_venda.length
  const pctDemaisObjetivos = totObj > 0 ? Math.round((demaisCount / totObj) * 1000) / 10 : 0

  // 12. Pedido sem contato registrado nos 15 dias anteriores
  const concluidasPorEmpresa = new Map<string, string[]>()
  for (const t of concluidasTodas) {
    if (!t.clienteId) continue
    const emp = params.empresaPorCardId.get(t.clienteId)
    if (!emp) continue
    const dt = dataConclusaoISO(t)
    if (!dt) continue
    if (!concluidasPorEmpresa.has(emp.chave)) concluidasPorEmpresa.set(emp.chave, [])
    concluidasPorEmpresa.get(emp.chave)!.push(dt)
  }

  const vendasConfirmadas = params.pedidosGrupo.filter(
    p => p.status === 'confirmado' && (p.tipo || 'venda') === 'venda'
  )
  const vendasPeriodo = vendasConfirmadas.filter(p => {
    const dt = (p.dataEnvioOmie || p.dataAprovacao || p.dataCriacao || '').slice(0, 10)
    return dt >= params.inicioPeriodoISO && dt <= janelaFim
  })

  const pedidosSemContato15d = vendasPeriodo
    .filter(p => {
      const emp = params.empresaPorCardId.get(p.clienteId)
      const dtPed = (p.dataEnvioOmie || p.dataAprovacao || p.dataCriacao || '').slice(0, 10)
      if (!dtPed) return false
      const pedMs = Date.parse(`${dtPed}T00:00:00Z`)
      const datasContato = emp ? (concluidasPorEmpresa.get(emp.chave) || []) : []
      return !datasContato.some(dc => {
        const dcMs = Date.parse(`${dc}T00:00:00Z`)
        const diff = (pedMs - dcMs) / 86400000
        return diff >= 0 && diff <= 15
      })
    })
    .map(p => ({ pedido: p, empresa: params.empresaPorCardId.get(p.clienteId) }))

  // 13. Cliente fora do próprio ritmo (> 1.2x intervalo médio entre compras)
  const datasCompraPorEmp = new Map<string, string[]>()
  for (const p of vendasConfirmadas) {
    const integrado = !!(p.omieCodigo || p.omieNumero || p.dataEnvioOmie)
    if (!integrado) continue
    const emp = params.empresaPorCardId.get(p.clienteId)
    if (!emp) continue
    const dt = (p.dataEnvioOmie || p.dataAprovacao || p.dataEnvio || '').slice(0, 10)
    if (!dt) continue
    if (!datasCompraPorEmp.has(emp.chave)) datasCompraPorEmp.set(emp.chave, [])
    datasCompraPorEmp.get(emp.chave)!.push(dt)
  }

  const clientesForaDoRitmo: ClienteRitmoItem[] = []
  const reativacoesMes: EmpresaConsolidada[] = []

  for (const emp of carteira180) {
    const datasUnicas = Array.from(new Set(datasCompraPorEmp.get(emp.chave) || [])).sort()
    if (datasUnicas.length >= 2) {
      let somaDiff = 0
      for (let i = 1; i < datasUnicas.length; i++) {
        somaDiff += Math.max(1, Math.round((Date.parse(datasUnicas[i]) - Date.parse(datasUnicas[i - 1])) / 86400000))
      }
      const media = Math.round(somaDiff / (datasUnicas.length - 1))
      const limite = Math.round(media * 1.2)
      if (emp.diasSemCompra != null && emp.diasSemCompra > limite) {
        clientesForaDoRitmo.push({
          empresa: emp,
          intervaloMedioDias: media,
          diasDesdeUltimaCompra: emp.diasSemCompra,
          limiteAlertaDias: limite,
        })
      }
      // 16. Reativação: última compra dentro da janela/mês e compra imediatamente anterior entre 61 e 180 dias antes dela
      const ultima = datasUnicas[datasUnicas.length - 1]
      const penultima = datasUnicas[datasUnicas.length - 2]
      if (ultima >= janelaInicio && ultima <= janelaFim && emp.situacaoCompra === 'ativo') {
        const gap = Math.round((Date.parse(ultima) - Date.parse(penultima)) / 86400000)
        if (gap >= 61 && gap <= 180) {
          reativacoesMes.push(emp)
        }
      }
    }
  }

  // 14. Amostra sem retorno (> 30 dias sem conclusão) e % amostras -> pedido
  const amostrasSemRetorno30d: { card: Cliente; empresa: EmpresaConsolidada; dias: number }[] = []
  const empresasComAmostra = new Set<string>()
  const empresasComVenda = new Set(vendasConfirmadas.map(p => params.empresaPorCardId.get(p.clienteId)?.chave).filter(Boolean) as string[])

  for (const emp of params.empresasGrupo) {
    for (const c of emp.cards) {
      if (c.etapa === 'amostra' || c.etapa === 'amostra_perdida' || !!c.dataEnvioAmostra) {
        empresasComAmostra.add(emp.chave)
      }
      if (c.etapa === 'amostra' && !c.resultadoAmostra) {
        const dtBase = (c.dataEnvioAmostra || c.dataEntradaEtapa || c.criadoEm || '').slice(0, 10)
        const dias = dtBase ? diasDesdeData(dtBase, agora) : 0
        if (dias > 30) amostrasSemRetorno30d.push({ card: c, empresa: emp, dias })
      }
    }
  }
  for (const p of params.pedidosGrupo) {
    if (p.tipo === 'bonificacao') {
      const emp = params.empresaPorCardId.get(p.clienteId)
      if (emp) empresasComAmostra.add(emp.chave)
    }
  }
  const amostrasConvertidas = [...empresasComAmostra].filter(ch => empresasComVenda.has(ch)).length
  const pctAmostrasViraramPedido = empresasComAmostra.size > 0
    ? Math.round((amostrasConvertidas / empresasComAmostra.size) * 1000) / 10
    : 0

  // 15. Proposta parada (> 3 dias sem tarefa pendente/recente de follow-up) e % propostas -> pedido
  const propostasParadas3d: { card: Cliente; empresa: EmpresaConsolidada; dias: number }[] = []
  const empresasComProposta = new Set<string>()
  for (const pr of params.propostas) {
    if (cardIdsGrupo.has(pr.clienteId)) {
      const emp = params.empresaPorCardId.get(pr.clienteId)
      if (emp) empresasComProposta.add(emp.chave)
    }
  }
  for (const emp of params.empresasGrupo) {
    for (const c of emp.cards) {
      if (c.etapa === 'proposta' || c.etapa === 'negociacao' || c.etapa === 'follow_up' || !!c.dataProposta) {
        empresasComProposta.add(emp.chave)
      }
      if (c.etapa === 'proposta') {
        const dtBase = (c.dataProposta || c.dataEntradaEtapa || c.criadoEm || '').slice(0, 10)
        const dias = dtBase ? diasDesdeData(dtBase, agora) : 0
        if (dias > 3) {
          const temFollowRecente = params.tarefasGrupo.some(t => {
            if (!t.clienteId || params.empresaPorCardId.get(t.clienteId)?.chave !== emp.chave) return false
            if (t.status === 'pendente') {
              const diff = Math.round((Date.parse(`${t.data}T00:00:00Z`) - Date.parse(`${hojeISO}T00:00:00Z`)) / 86400000)
              return diff >= 0 && diff <= 3
            }
            const dc = dataConclusaoISO(t)
            return dc ? diasDesdeData(dc, agora) <= 3 : false
          })
          if (!temFollowRecente) propostasParadas3d.push({ card: c, empresa: emp, dias })
        }
      }
    }
  }
  const propostasConvertidas = [...empresasComProposta].filter(ch => empresasComVenda.has(ch)).length
  const pctPropostasViraramPedido = empresasComProposta.size > 0
    ? Math.round((propostasConvertidas / empresasComProposta.size) * 1000) / 10
    : 0

  // 17. Lead time do pedido (dias entre envio ao Omie e faturamento)
  const leadTimePedidos: PedidoLeadTimeItem[] = []
  for (const p of vendasPeriodo) {
    const emp = params.empresaPorCardId.get(p.clienteId)
    const dtEnvio = (p.dataEnvioOmie || p.dataAprovacao || '').slice(0, 10)
    const dtFat = (p.dataFaturamento || emp?.cardPrincipal.omieDataFaturamento || '').slice(0, 10)
    if (!dtEnvio || !dtFat) continue
    const dias = Math.max(0, Math.round((Date.parse(`${dtFat}T00:00:00Z`) - Date.parse(`${dtEnvio}T00:00:00Z`)) / 86400000))
    leadTimePedidos.push({
      pedido: p,
      empresa: emp,
      diasLeadTime: dias,
      dataEnvioISO: dtEnvio,
      dataFaturamentoISO: dtFat,
    })
  }
  leadTimePedidos.sort((a, b) => b.diasLeadTime - a.diasLeadTime)
  const leadTimeMediaDias = leadTimePedidos.length > 0
    ? Math.round((leadTimePedidos.reduce((s, x) => s + x.diasLeadTime, 0) / leadTimePedidos.length) * 10) / 10
    : null
  const leadTimeMaxDias = leadTimePedidos.length > 0 ? leadTimePedidos[0].diasLeadTime : null

  return {
    vendedorId: params.id,
    vendedorNome: params.nome,
    ativo: params.ativo,
    somaNosTotais: params.somaNosTotais,
    totalEmpresas: params.empresasGrupo.length,
    carteira180,
    situacaoCompraCounts,
    situacaoCadastroCounts,
    semTarefaAberta,
    verdes,
    amarelos,
    vermelhos,
    justificados,
    pctCarteiraEmDia,
    coberturaMes,
    pctCoberturaMes,
    tarefasAtrasadas,
    clientesEmpurrados,
    justificativasPrazoLongo,
    cadastrosCompletos,
    pctCadastrosCompletos,
    justificativasCadastro,
    tarefasFinalizadasMes: atividadesMes,
    contatosPorClienteMes,
    atividadesDia,
    atividadesSemana,
    atividadesMes,
    porCanalMes,
    porObjetivoMes,
    pctRelacionamento,
    pctOfertaVenda,
    pctDemaisObjetivos,
    pedidosSemContato15d,
    clientesForaDoRitmo,
    amostrasSemRetorno30d,
    pctAmostrasViraramPedido,
    propostasParadas3d,
    pctPropostasViraramPedido,
    reativacoesMes,
    leadTimePedidos,
    leadTimeMediaDias,
    leadTimeMaxDias,
    tempoAtivoSegundos: params.tempoAtivoSegundos || 0,
    sinaisIrregulares: params.sinaisIrregulares || [],
  }
}
