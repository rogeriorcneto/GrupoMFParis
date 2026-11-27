import type { CadastroJustificativa, Cliente } from '../types'
import { familiaDoClienteNoFunil } from './situacaoCompra'

export type CampoCadastroKey =
  | 'contato_comprador'
  | 'contato_financeiro'
  | 'email_boleto'
  | 'telefone_empresa'
  | 'endereco_completo'
  | 'segmento'
  | 'presenca_digital'
  | 'produtos_interesse'

export const CADASTRO_CAMPOS: { key: CampoCadastroKey; label: string; descricao: string }[] = [
  { key: 'contato_comprador', label: 'Contato Comprador', descricao: 'Nome, telefone/WhatsApp e setor' },
  { key: 'contato_financeiro', label: 'Contato Financeiro', descricao: 'Nome, telefone/WhatsApp e setor' },
  { key: 'email_boleto', label: 'E-mail para boleto', descricao: 'E-mail separado para envio de boletos' },
  { key: 'telefone_empresa', label: 'Telefone da empresa', descricao: 'Telefone, celular ou WhatsApp da empresa' },
  { key: 'endereco_completo', label: 'Endereço completo', descricao: 'Logradouro, número, bairro, cidade, UF e CEP' },
  { key: 'segmento', label: 'Segmento', descricao: 'Segmento do cliente' },
  { key: 'presenca_digital', label: 'Site ou rede social', descricao: 'Pelo menos um entre site, Instagram, Facebook ou LinkedIn' },
  { key: 'produtos_interesse', label: 'Produtos de interesse', descricao: 'Pelo menos um produto e consumo mensal em kg em todos' },
]

export const CADASTRO_CAMPO_LABEL = Object.fromEntries(CADASTRO_CAMPOS.map(c => [c.key, c.label])) as Record<CampoCadastroKey, string>
export const CAMPOS_CADASTRO_PADRAO = CADASTRO_CAMPOS.map(c => c.key)

function preenchido(v?: string | null): boolean {
  return !!(v && String(v).trim())
}

function familiaCadastro(cliente: Cliente, clientes: Cliente[]): Cliente[] {
  const familia = familiaDoClienteNoFunil(cliente, clientes).map(c => c.id === cliente.id ? cliente : c)
  return familia.length > 0 ? familia : [cliente]
}

export function justificativasAtivas(cliente: Cliente, clientes: Cliente[] = [cliente]): CadastroJustificativa[] {
  const arr = familiaCadastro(cliente, clientes).flatMap(c => Array.isArray(c.cadastroJustificativas) ? c.cadastroJustificativas : [])
  const latest = new Map<string, CadastroJustificativa>()
  for (const j of arr) {
    if (!j?.campo) continue
    const prev = latest.get(j.campo)
    if (!prev || String(j.criadoEm || '').localeCompare(String(prev.criadoEm || '')) > 0) latest.set(j.campo, j)
  }
  return Array.from(latest.values()).filter(j => j.ativo !== false && !!j.justificativa?.trim())
}

export function temJustificativaAtiva(cliente: Cliente, campo: CampoCadastroKey, clientes: Cliente[] = [cliente]): CadastroJustificativa | undefined {
  return justificativasAtivas(cliente, clientes).find(j => j.campo === campo)
}

function consumoMensalValido(valor: unknown): boolean {
  if (typeof valor === 'number') return valor > 0
  if (valor && typeof valor === 'object') {
    const kg = (valor as any).kgMes
    return typeof kg === 'number' && Number.isFinite(kg) && kg > 0
  }
  return false
}

export function produtosInteresseCompletos(cliente: Cliente, clientes: Cliente[] = [cliente]): boolean {
  const familia = familiaDoClienteNoFunil(cliente, clientes)
  const produtos = new Map<string, unknown>()
  for (const c of familia) {
    for (const nome of c.produtosInteresse || []) {
      if (!produtos.has(nome)) produtos.set(nome, undefined)
    }
    for (const [nome, consumo] of Object.entries(c.produtosQuantidadesMensais || {})) {
      if (!produtos.has(nome) || !consumoMensalValido(produtos.get(nome))) produtos.set(nome, consumo)
    }
  }
  const nomes = Array.from(produtos.keys()).filter(Boolean)
  if (nomes.length === 0) return false
  return nomes.every(nome => consumoMensalValido(produtos.get(nome)))
}

export function campoCadastroPreenchido(cliente: Cliente, campo: CampoCadastroKey, clientes: Cliente[] = [cliente]): boolean {
  const familia = familiaCadastro(cliente, clientes)
  switch (campo) {
    case 'contato_comprador':
      return familia.some(c => preenchido(c.contatoComprasNome) && preenchido(c.contatoComprasTelefone) && preenchido(c.contatoComprasSetor || 'Compras'))
    case 'contato_financeiro':
      return familia.some(c => preenchido(c.contatoFinanceiroNome) && preenchido(c.contatoFinanceiroTelefone) && preenchido(c.contatoFinanceiroSetor || 'Financeiro'))
    case 'email_boleto':
      return familia.some(c => preenchido(c.emailBoleto))
    case 'telefone_empresa':
      return familia.some(c => preenchido(c.contatoTelefone) || preenchido(c.contatoCelular) || preenchido(c.contatoTelefoneFixo) || preenchido(c.whatsapp))
    case 'endereco_completo':
      return familia.some(c => preenchido(c.enderecoRua) && preenchido(c.enderecoNumero) && preenchido(c.enderecoBairro) && preenchido(c.enderecoCidade) && preenchido(c.enderecoEstado) && preenchido(c.enderecoCep))
    case 'segmento':
      return familia.some(c => preenchido(c.segmento))
    case 'presenca_digital':
      return familia.some(c => preenchido(c.website) || preenchido(c.instagram) || preenchido(c.facebook) || preenchido(c.linkedin))
    case 'produtos_interesse':
      return produtosInteresseCompletos(cliente, clientes)
  }
}

export type SituacaoCadastro = 'completo' | 'completo_com_justificativa' | 'incompleto' | 'incompleto_vencido'

export const SITUACAO_CADASTRO_CONFIG: Record<SituacaoCadastro, { label: string; cor: string }> = {
  completo: { label: 'Cadastro completo', cor: 'bg-blue-100 text-blue-800 border-blue-200' },
  completo_com_justificativa: { label: 'Completo com justificativa', cor: 'bg-purple-100 text-purple-800 border-purple-200' },
  incompleto: { label: 'Cadastro incompleto', cor: 'bg-orange-100 text-orange-800 border-orange-200' },
  incompleto_vencido: { label: 'Incompleto vencido', cor: 'bg-orange-200 text-orange-900 border-orange-300' },
}

export function avaliarCadastroCliente(
  cliente: Cliente,
  clientes: Cliente[] = [cliente],
  camposObrigatorios: CampoCadastroKey[] = CAMPOS_CADASTRO_PADRAO,
  agora: Date = new Date(),
): { situacao: SituacaoCadastro; faltantes: CampoCadastroKey[]; justificados: CampoCadastroKey[]; totalObrigatorios: number } {
  const faltantes: CampoCadastroKey[] = []
  const justificados: CampoCadastroKey[] = []
  for (const campo of camposObrigatorios) {
    if (campoCadastroPreenchido(cliente, campo, clientes)) continue
    if (temJustificativaAtiva(cliente, campo, clientes)) justificados.push(campo)
    else faltantes.push(campo)
  }
  if (faltantes.length === 0) {
    return { situacao: justificados.length > 0 ? 'completo_com_justificativa' : 'completo', faltantes, justificados, totalObrigatorios: camposObrigatorios.length }
  }
  // Item 9: o selo é do CADASTRO do cliente, não do card/ciclo — a data base é a
  // criação mais antiga da família de cards, garantindo selo idêntico em todos eles.
  const familia = familiaCadastro(cliente, clientes)
  const basesTime = familia
    .map(f => new Date(f.criadoEm || f.dataEntradaEtapa || '').getTime())
    .filter(t => Number.isFinite(t))
  const baseMaisAntiga = basesTime.length > 0 ? new Date(Math.min(...basesTime)).toISOString() : undefined
  const baseCriacao = baseMaisAntiga || cliente.criadoEm || cliente.dataEntradaEtapa
  let vencido = false
  if (baseCriacao) {
    const d = new Date(baseCriacao)
    if (!Number.isNaN(d.getTime())) vencido = Math.floor((agora.getTime() - d.getTime()) / 86400000) > 15
  }
  return { situacao: vencido ? 'incompleto_vencido' : 'incompleto', faltantes, justificados, totalObrigatorios: camposObrigatorios.length }
}
