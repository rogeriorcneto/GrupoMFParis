import type { Cliente, Tarefa } from '../types'

export type CanalTarefa = 'ligacao' | 'whatsapp' | 'email' | 'visita' | 'reuniao'
export type ObjetivoTarefa = 'relacionamento' | 'oferta_venda' | 'cotacao' | 'pos_venda' | 'cobranca'

export interface ProximoPassoInput {
  tipo: CanalTarefa
  objetivo: ObjetivoTarefa
  data: string
  descricao: string
  justificativaPrazoLongo?: string
}

export interface FinalizacaoTarefaInput {
  canalUsado: CanalTarefa
  conclusao: string
  proximoPasso: ProximoPassoInput
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

export function validarFinalizacaoTarefa(input: FinalizacaoTarefaInput, referencia: Date = new Date()): string | null {
  if (!input.canalUsado) return 'Selecione o canal usado.'
  if (!input.conclusao.trim()) return 'Informe a conclusão da tarefa.'
  const p = input.proximoPasso
  if (!p?.tipo) return 'Selecione o tipo do próximo passo.'
  if (!p?.objetivo) return 'Selecione o objetivo do próximo passo.'
  if (!p?.data) return 'Informe a data do próximo passo.'
  if (!p?.descricao?.trim()) return 'Informe a descrição curta do próximo passo.'
  if (exigeJustificativaPrazoLongo(p.data, referencia) && !p.justificativaPrazoLongo?.trim()) {
    return 'Próximo passo acima de 15 dias exige justificativa.'
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
  const nomeCliente = cliente?.razaoSocial || tarefaAtual.titulo.split(' - ').pop() || 'Cliente'
  return {
    titulo: `Retorno: ${CANAL_LABEL[input.proximoPasso.tipo]} - ${nomeCliente}`,
    descricao: input.proximoPasso.descricao.trim(),
    data: input.proximoPasso.data,
    hora: tarefaAtual.hora || undefined,
    tipo: input.proximoPasso.tipo,
    status: 'pendente',
    prioridade: tarefaAtual.prioridade || 'media',
    clienteId: tarefaAtual.clienteId,
    vendedorId: tarefaAtual.vendedorId,
    objetivo: input.proximoPasso.objetivo,
    origem: 'manual',
    criadoPor: loggedUserName,
    justificativaPrazoLongo: input.proximoPasso.justificativaPrazoLongo?.trim() || undefined,
  }
}

export function validarReagendamentoPrazo(novaData: string, justificativa: string | undefined, referencia: Date = new Date()): string | null {
  if (exigeJustificativaPrazoLongo(novaData, referencia) && !justificativa?.trim()) {
    return 'Reagendamento para mais de 15 dias exige justificativa.'
  }
  return null
}
