import type { Cliente, Tarefa } from '../types'
import { avaliarCadastroCliente, CADASTRO_CAMPO_LABEL, CampoCadastroKey, CAMPOS_CADASTRO_PADRAO } from './cadastroCompleto'
import { familiaDoClienteNoFunil } from './situacaoCompra'

export type CanalTarefa = 'ligacao' | 'whatsapp' | 'email' | 'visita' | 'reuniao'
export type ObjetivoTarefa = 'relacionamento' | 'oferta_venda' | 'cotacao' | 'pos_venda' | 'cobranca'

export const TITULO_PADRAO_TAREFA_PRODUTOS = 'Incluir produtos de interesse do cliente'
export const TITULO_PADRAO_TAREFA_CADASTRO = 'Completar cadastro'

export interface TarefasPadraoCadastroConfig {
  incluirProdutos: string
  completarCadastro: string
}

export interface ProximoPassoInput {
  tipo: CanalTarefa
  objetivo: ObjetivoTarefa
  data: string
  descricao: string
  justificativaPrazoLongo?: string
}

export interface ProdutosInteresseConclusaoInput {
  produtosInteresse: string[]
  produtosQuantidadesMensais: NonNullable<Cliente['produtosQuantidadesMensais']>
}

export interface FinalizacaoTarefaInput {
  canalUsado: CanalTarefa
  conclusao: string
  proximoPasso?: ProximoPassoInput
  produtosInteresseRegistro?: ProdutosInteresseConclusaoInput
}

export const CANAL_LABEL: Record<CanalTarefa, string> = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visita: 'Visita',
  reuniao: 'Reunião',
}

export const OBJETIVO_LABEL: Record<ObjetivoTarefa, string> = {
  relacionamento: 'Relacionamento',
  oferta_venda: 'Oferta/Venda',
  cotacao: 'Cotação',
  pos_venda: 'Pós-venda',
  cobranca: 'Cobrança',
}

export const CANAIS_TAREFA: CanalTarefa[] = ['ligacao', 'whatsapp', 'email', 'visita', 'reuniao']
export const OBJETIVOS_TAREFA: ObjetivoTarefa[] = ['relacionamento', 'oferta_venda', 'cotacao', 'pos_venda', 'cobranca']

export function canalPrevistoDaTarefa(tipo?: Tarefa['tipo']): CanalTarefa | '' {
  return tipo && (CANAIS_TAREFA as string[]).includes(tipo) ? tipo as CanalTarefa : ''
}

export function tipoTarefaValidoParaNovoFluxo(tipo?: Tarefa['tipo']): tipo is CanalTarefa {
  return !!tipo && (CANAIS_TAREFA as string[]).includes(tipo)
}

export function normalizarTipoTarefaNovoFluxo(tipo: string | undefined, texto = ''): CanalTarefa {
  if (tipoTarefaValidoParaNovoFluxo(tipo as Tarefa['tipo'])) return tipo as CanalTarefa
  const txt = texto.toLowerCase()
  if (/whatsapp|whats|zap/.test(txt)) return 'whatsapp'
  if (/e-mail|email|enviar proposta|enviar cota/.test(txt)) return 'email'
  if (/visita|visitar/.test(txt)) return 'visita'
  if (/reuni[aã]o|meeting/.test(txt)) return 'reuniao'
  return 'ligacao'
}

function dataLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDiasISO(base: Date, dias: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + dias)
  return dataLocalISO(d)
}

export function diasEntreDatasISO(inicioISO: string, fimISO: string): number {
  const inicio = new Date(`${inicioISO}T00:00:00`)
  const fim = new Date(`${fimISO}T00:00:00`)
  return Math.round((fim.getTime() - inicio.getTime()) / 86400000)
}

export function exigeJustificativaPrazoLongo(dataDestino: string, referencia: Date = new Date()): boolean {
  const hojeISO = dataLocalISO(referencia)
  return diasEntreDatasISO(hojeISO, dataDestino) > 15
}

export function ehTarefaIncluirProdutos(tarefa: Pick<Tarefa, 'titulo'>, tituloConfigurado?: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase()
  const baseTitulo = norm((tarefa.titulo || '').split(' - ')[0] || '')
  const fullTitulo = norm(tarefa.titulo || '')
  const alvos = [
    norm(TITULO_PADRAO_TAREFA_PRODUTOS),
    tituloConfigurado ? norm(tituloConfigurado) : '',
  ].filter(Boolean)
  return alvos.some(alvo => fullTitulo === alvo || baseTitulo === alvo || fullTitulo.startsWith(`${alvo} - `))
}

export function clienteJaTemOutraTarefaAberta(
  tarefaAtual: Pick<Tarefa, 'id' | 'clienteId'>,
  todasTarefas: Tarefa[],
  todosClientes: Cliente[] = [],
  referencia: Date = new Date(),
): Tarefa | undefined {
  if (!tarefaAtual.clienteId) return undefined
  const clienteBase = todosClientes.find(c => c.id === tarefaAtual.clienteId)
  const idsFamilia = clienteBase
    ? new Set(familiaDoClienteNoFunil(clienteBase, todosClientes).map(c => c.id))
    : new Set([tarefaAtual.clienteId])
  idsFamilia.add(tarefaAtual.clienteId)
  const hojeISO = dataLocalISO(referencia)
  const candidatas = todasTarefas
    .filter(t =>
      t.id !== tarefaAtual.id
      && t.status === 'pendente'
      && t.clienteId != null
      && idsFamilia.has(t.clienteId)
      && !!t.data
      && t.data >= hojeISO
    )
    .sort((a, b) => a.data.localeCompare(b.data))
  return candidatas[0]
}

export function validarFinalizacaoTarefa(
  input: FinalizacaoTarefaInput,
  referencia: Date = new Date(),
  opcoes: { exigeProximoPasso?: boolean; exigeProdutosInteresse?: boolean } = {},
): string | null {
  const exigeProximoPasso = opcoes.exigeProximoPasso ?? true
  if (!input.canalUsado) return 'Selecione o canal usado.'
  if (!input.conclusao.trim()) return 'Informe a conclusão da tarefa.'
  if (opcoes.exigeProdutosInteresse) {
    const reg = input.produtosInteresseRegistro
    const lista = (reg?.produtosInteresse || []).map(p => p.trim()).filter(Boolean)
    if (lista.length === 0) return 'Registre pelo menos um produto de interesse com consumo mensal em kg.'
    const algumSemKg = lista.some(nome => {
      const info = reg?.produtosQuantidadesMensais?.[nome] as any
      const kg = typeof info === 'number' ? info : info?.kgMes
      return !(typeof kg === 'number' && Number.isFinite(kg) && kg > 0)
    })
    if (algumSemKg) return 'Informe o consumo mensal em kg (maior que zero) para todos os produtos de interesse.'
  }
  const p = input.proximoPasso
  if (exigeProximoPasso || p) {
    if (!p?.tipo) return 'Selecione o tipo do próximo passo.'
    if (!p?.objetivo) return 'Selecione o objetivo do próximo passo.'
    if (!p?.data) return 'Informe a data do próximo passo.'
    if (!p?.descricao?.trim()) return 'Informe a descrição curta do próximo passo.'
    if (exigeJustificativaPrazoLongo(p.data, referencia) && !p.justificativaPrazoLongo?.trim()) {
      return 'Próximo passo acima de 15 dias exige justificativa.'
    }
  }
  return null
}

export function inferirOrigemTarefa(t: Partial<Tarefa>): 'manual' | 'automatica' {
  if (t.origem) return t.origem
  return (t.origemAutomacaoId || t.missaoId) ? 'automatica' : 'manual'
}

export function buildProximaTarefa(
  tarefaAtual: Tarefa,
  input: FinalizacaoTarefaInput,
  cliente?: Cliente,
  loggedUserName?: string,
): Omit<Tarefa, 'id'> {
  const p = input.proximoPasso
  if (!p) throw new Error('Próximo passo ausente para criar próxima tarefa.')
  const nomeCliente = cliente?.razaoSocial || tarefaAtual.titulo.split(' - ').pop() || 'Cliente'
  return {
    titulo: `Retorno: ${CANAL_LABEL[p.tipo]} - ${nomeCliente}`,
    descricao: p.descricao.trim(),
    data: p.data,
    hora: tarefaAtual.hora || undefined,
    tipo: p.tipo,
    status: 'pendente',
    prioridade: tarefaAtual.prioridade || 'media',
    clienteId: tarefaAtual.clienteId,
    vendedorId: tarefaAtual.vendedorId,
    objetivo: p.objetivo,
    origem: 'manual',
    criadoPor: loggedUserName,
    justificativaPrazoLongo: exigeJustificativaPrazoLongo(p.data) ? (p.justificativaPrazoLongo?.trim() || undefined) : undefined,
  }
}

export function montarTarefasIniciaisCliente(
  cliente: Cliente,
  opcoes: {
    camposObrigatorios?: CampoCadastroKey[]
    nomesTarefas?: Partial<TarefasPadraoCadastroConfig>
    todosClientes?: Cliente[]
    referencia?: Date
    diasPrazoProdutos?: number
    diasPrazoCadastro?: number
  } = {},
): Omit<Tarefa, 'id'>[] {
  const ref = opcoes.referencia || new Date()
  const tituloProdutos = (opcoes.nomesTarefas?.incluirProdutos || '').trim() || TITULO_PADRAO_TAREFA_PRODUTOS
  const tituloCadastro = (opcoes.nomesTarefas?.completarCadastro || '').trim() || TITULO_PADRAO_TAREFA_CADASTRO
  const camposObrigatorios = opcoes.camposObrigatorios && opcoes.camposObrigatorios.length > 0
    ? opcoes.camposObrigatorios
    : CAMPOS_CADASTRO_PADRAO
  const todos = opcoes.todosClientes && opcoes.todosClientes.length > 0 ? opcoes.todosClientes : [cliente]
  const avaliacao = avaliarCadastroCliente(cliente, todos, camposObrigatorios, ref)

  const tarefas: Omit<Tarefa, 'id'>[] = [
    {
      titulo: tituloProdutos,
      descricao: 'Levantar e registrar os produtos de interesse do cliente com consumo mensal em kg.',
      data: addDiasISO(ref, opcoes.diasPrazoProdutos ?? 5),
      tipo: 'ligacao',
      objetivo: 'relacionamento',
      origem: 'automatica',
      criadoPor: 'Automação',
      status: 'pendente',
      prioridade: 'media',
      clienteId: cliente.id,
      vendedorId: cliente.vendedorId,
    },
  ]

  if (avaliacao.faltantes.length > 0) {
    const listaFaltantes = avaliacao.faltantes.map(c => CADASTRO_CAMPO_LABEL[c] || c).join(', ')
    tarefas.push({
      titulo: tituloCadastro,
      descricao: `Campos pendentes: ${listaFaltantes}.`,
      data: addDiasISO(ref, opcoes.diasPrazoCadastro ?? 15),
      tipo: 'ligacao',
      objetivo: 'relacionamento',
      origem: 'automatica',
      criadoPor: 'Automação',
      status: 'pendente',
      prioridade: 'media',
      clienteId: cliente.id,
      vendedorId: cliente.vendedorId,
    })
  }

  return tarefas
}

export function validarReagendamentoPrazo(novaData: string, justificativa: string | undefined, referencia: Date = new Date()): string | null {
  if (exigeJustificativaPrazoLongo(novaData, referencia) && !justificativa?.trim()) {
    return 'Reagendamento para mais de 15 dias exige justificativa.'
  }
  return null
}
