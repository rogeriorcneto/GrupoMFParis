const PNCP_BASE = 'https://pncp.gov.br/api/consulta/v1'

export interface PncpContratacao {
  numeroControlePNCP: string
  orgaoEntidade: {
    cnpj: string
    razaoSocial: string
    poderId: string
    esferaId: string
  }
  unidadeOrgao: {
    codigoUnidade: string
    nomeUnidade: string
    municipioNome: string
    ufSigla: string
    ufNome: string
  }
  objetoCompra: string
  informacaoComplementar?: string
  modalidadeId: number
  modalidadeNome: string
  situacaoCompraId: number
  situacaoCompraNome: string
  dataPublicacaoPncp: string
  dataAberturaProposta?: string
  dataEncerramentoProposta?: string
  valorTotalEstimado?: number
  valorTotalHomologado?: number
  anoCompra: number
  sequencialCompra: number
  linkSistemaOrigem?: string
  numeroCompra?: string
  processo?: string
}

export interface PncpItem {
  numeroItem: number
  descricao: string
  materialOuServico: string
  valorUnitarioEstimado?: number
  valorTotal?: number
  quantidade?: number
  unidadeMedida?: string
  situacaoCompraItem?: string
  criterioJulgamentoNome?: string
}

export interface PncpResultado {
  data: PncpContratacao[]
  totalRegistros: number
  totalPaginas: number
  numeroPagina: number
  tamanhoPagina: number
}

export interface PncpPropostaResult {
  data: PncpContratacao[]
  totalRegistros: number
  totalPaginas: number
  numeroPagina: number
  tamanhoPagina: number
}

export type ModalidadeContratacao =
  | 1   // Leilão - Eletrônico
  | 2   // Diálogo Competitivo
  | 3   // Concurso
  | 4   // Concorrência - Eletrônica
  | 5   // Concorrência - Presencial
  | 6   // Pregão - Eletrônico
  | 7   // Pregão - Presencial
  | 8   // Dispensa de Licitação
  | 9   // Inexigibilidade
  | 10  // Manifestação de Interesse
  | 11  // Pré-qualificação
  | 12  // Credenciamento
  | 13  // Leilão - Presencial

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export async function buscarContratacoesPorPublicacao(params: {
  dataInicial: Date
  dataFinal: Date
  ufSigla?: string
  codigoModalidade?: ModalidadeContratacao
  pagina?: number
  tamanhoPagina?: number
}): Promise<PncpResultado> {
  const qs = new URLSearchParams({
    dataInicial: fmtDate(params.dataInicial),
    dataFinal: fmtDate(params.dataFinal),
    pagina: String(params.pagina ?? 1),
    tamanhoPagina: String(params.tamanhoPagina ?? 20),
  })
  if (params.ufSigla) qs.set('ufSigla', params.ufSigla)
  if (params.codigoModalidade) qs.set('codigoModalidadeContratacao', String(params.codigoModalidade))

  const res = await fetch(`${PNCP_BASE}/contratacoes/publicacao?${qs}`)
  if (!res.ok) throw new Error(`PNCP erro ${res.status}`)
  return res.json()
}

export async function buscarPropostasAbertas(params: {
  dataFinal?: Date
  ufSigla?: string
  codigoModalidade?: ModalidadeContratacao
  pagina?: number
  tamanhoPagina?: number
}): Promise<PncpPropostaResult> {
  const qs = new URLSearchParams({
    dataFinal: fmtDate(params.dataFinal ?? new Date()),
    pagina: String(params.pagina ?? 1),
    tamanhoPagina: String(params.tamanhoPagina ?? 20),
  })
  if (params.ufSigla) qs.set('ufSigla', params.ufSigla)
  if (params.codigoModalidade) qs.set('codigoModalidadeContratacao', String(params.codigoModalidade))

  const res = await fetch(`${PNCP_BASE}/contratacoes/proposta?${qs}`)
  if (!res.ok) throw new Error(`PNCP erro ${res.status}`)
  return res.json()
}

export async function buscarItensContratacao(params: {
  cnpj: string
  anoCompra: number
  sequencialCompra: number
  pagina?: number
}): Promise<{ data: PncpItem[]; totalRegistros: number }> {
  const qs = new URLSearchParams({
    pagina: String(params.pagina ?? 1),
    tamanhoPagina: '20',
  })
  const url = `${PNCP_BASE}/orgaos/${params.cnpj}/compras/${params.anoCompra}/${params.sequencialCompra}/itens?${qs}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PNCP erro ${res.status}`)
  return res.json()
}

export async function buscarResultadoContratacao(params: {
  cnpj: string
  anoCompra: number
  sequencialCompra: number
  pagina?: number
}): Promise<{ data: Array<PncpItem & { niFornecedor?: string; nomeRazaoSocialFornecedor?: string; valorTotal?: number }> }> {
  const qs = new URLSearchParams({
    pagina: String(params.pagina ?? 1),
    tamanhoPagina: '20',
  })
  const url = `${PNCP_BASE}/orgaos/${params.cnpj}/compras/${params.anoCompra}/${params.sequencialCompra}/itens/resultado?${qs}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PNCP erro ${res.status}`)
  return res.json()
}

export const PALAVRAS_CHAVE_PADRAO = [
  'leite em pó',
  'leite em po',
  'composto lácteo',
  'composto lacteo',
  'café torrado',
  'cafe torrado',
  'café moído',
  'cafe moido',
]

export function filtrarPorPalavraChave(
  contratacoes: PncpContratacao[],
  palavras: string[]
): PncpContratacao[] {
  const lower = palavras.map(p => p.toLowerCase())
  return contratacoes.filter(c => {
    const obj = (c.objetoCompra ?? '').toLowerCase()
    const inf = (c.informacaoComplementar ?? '').toLowerCase()
    return lower.some(p => obj.includes(p) || inf.includes(p))
  })
}

export function getLinkPNCP(c: PncpContratacao): string {
  return `https://pncp.gov.br/app/editais/${c.orgaoEntidade.cnpj}/${c.anoCompra}/${c.sequencialCompra}`
}

export const MODALIDADES: Record<number, string> = {
  1: 'Leilão Eletrônico',
  2: 'Diálogo Competitivo',
  3: 'Concurso',
  4: 'Concorrência Eletrônica',
  5: 'Concorrência Presencial',
  6: 'Pregão Eletrônico',
  7: 'Pregão Presencial',
  8: 'Dispensa',
  9: 'Inexigibilidade',
  10: 'Manifestação de Interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Leilão Presencial',
}

export const UF_SIGLAS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
]
