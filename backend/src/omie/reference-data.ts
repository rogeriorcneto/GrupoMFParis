import { omieCall, getOmieCredentials, type OmieCredentials } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'

// ============================================
// Cache em memória (10 min)
// ============================================

const CACHE_TTL = 10 * 60_000
const memCache = new Map<string, { data: any; expiresAt: number }>()

function getCached<T>(key: string): T | null {
  const entry = memCache.get(key)
  if (entry && entry.expiresAt > Date.now()) return entry.data as T
  return null
}

function setCache(key: string, data: any): void {
  memCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL })
}

// ============================================
// Cenários Fiscais
// ============================================

export interface OmieCenario {
  nCodigo: number
  cDescricao: string
  cPadrao?: string
}

export async function fetchCenariosFiscais(creds?: OmieCredentials): Promise<OmieCenario[]> {
  const cached = getCached<OmieCenario[]>('cenarios')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  const response = await omieCall<any>(
    '/geral/cenarios/',
    'ListarCenarios',
    [{ nPagina: 1, nRegPorPagina: 200 }],
    { credentials }
  )

  const cenarios: OmieCenario[] = (response.cadastros || response.cenariosCadastro || []).map((c: any) => ({
    nCodigo: c.nCodigo || c.codigo || 0,
    cDescricao: c.cDescricao || c.descricao || '',
    cPadrao: c.cPadrao || '',
  }))

  setCache('cenarios', cenarios)
  log.info({ count: cenarios.length }, 'Cenários fiscais carregados do Omie')
  return cenarios
}

export async function getCenarioVendas(creds?: OmieCredentials): Promise<number> {
  const cenarios = await fetchCenariosFiscais(creds)
  const vendas = cenarios.find(c =>
    c.cPadrao === 'S' ||
    c.cDescricao.toLowerCase().includes('venda') ||
    c.cDescricao.toLowerCase().includes('padrão') ||
    c.cDescricao.toLowerCase().includes('padrao')
  )
  return vendas?.nCodigo || 0
}

export async function getCenarioAmostra(creds?: OmieCredentials): Promise<number> {
  const cenarios = await fetchCenariosFiscais(creds)
  const amostra = cenarios.find(c =>
    c.cDescricao.toLowerCase().includes('amostra') ||
    c.cDescricao.toLowerCase().includes('bonifica')
  )
  return amostra?.nCodigo || 0
}

// ============================================
// Departamentos
// ============================================

export interface OmieDepartamento {
  codigo: string
  descricao: string
}

export async function fetchDepartamentos(creds?: OmieCredentials): Promise<OmieDepartamento[]> {
  const cached = getCached<OmieDepartamento[]>('departamentos')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  const response = await omieCall<any>(
    '/geral/departamentos/',
    'ListarDepartamentos',
    [{ pagina: 1, registros_por_pagina: 200 }],
    { credentials }
  )

  const deptos: OmieDepartamento[] = (response.departamentos || response.cadastro || []).map((d: any) => ({
    codigo: String(d.codigo || d.nCodDepto || ''),
    descricao: d.descricao || d.cDescrDepto || '',
  }))

  setCache('departamentos', deptos)
  log.info({ count: deptos.length }, 'Departamentos carregados do Omie')
  return deptos
}

export async function getDepartamentoComercial(creds?: OmieCredentials): Promise<string> {
  const deptos = await fetchDepartamentos(creds)
  const comercial = deptos.find(d =>
    d.descricao.toLowerCase().includes('comercial')
  )
  return comercial?.codigo || ''
}

// ============================================
// Categorias
// ============================================

export interface OmieCategoria {
  codigo: string
  descricao: string
}

export async function fetchCategorias(creds?: OmieCredentials): Promise<OmieCategoria[]> {
  const cached = getCached<OmieCategoria[]>('categorias')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  const response = await omieCall<any>(
    '/geral/categorias/',
    'ListarCategorias',
    [{ pagina: 1, registros_por_pagina: 500 }],
    { credentials }
  )

  const cats: OmieCategoria[] = (response.categoria_cadastro || response.cadastro || []).map((c: any) => ({
    codigo: c.codigo || c.cCodigo || '',
    descricao: c.descricao || c.cDescricao || '',
  }))

  setCache('categorias', cats)
  log.info({ count: cats.length }, 'Categorias carregadas do Omie')
  return cats
}

export async function getCategoriaVendasMercadoria(creds?: OmieCredentials): Promise<string> {
  const cats = await fetchCategorias(creds)
  const cat = cats.find(c =>
    c.descricao.toLowerCase().includes('vendas de mercadoria') ||
    c.descricao.toLowerCase().includes('venda de mercadoria') ||
    c.descricao.toLowerCase().includes('receita de venda')
  )
  return cat?.codigo || ''
}

// ============================================
// Contas Correntes
// ============================================

export interface OmieContaCorrente {
  nCodCC: number
  cDescricao: string
  cNomeBanco?: string
}

export async function fetchContasCorrentes(creds?: OmieCredentials): Promise<OmieContaCorrente[]> {
  const cached = getCached<OmieContaCorrente[]>('contas_correntes')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  const response = await omieCall<any>(
    '/geral/contacorrente/',
    'ListarContasCorrentes',
    [{ pagina: 1, registros_por_pagina: 200 }],
    { credentials }
  )

  const contas: OmieContaCorrente[] = (response.ListarContasCorrentes || response.conta_corrente_lista || []).map((c: any) => ({
    nCodCC: c.nCodCC || 0,
    cDescricao: c.descricao || c.cDescricao || '',
    cNomeBanco: c.cNomeBanco || c.nome_banco || '',
  }))

  setCache('contas_correntes', contas)
  log.info({ count: contas.length }, 'Contas correntes carregadas do Omie')
  return contas
}

export async function getContaBancoBrasil(creds?: OmieCredentials): Promise<number> {
  const contas = await fetchContasCorrentes(creds)
  const bb = contas.find(c =>
    (c.cNomeBanco || '').toLowerCase().includes('brasil') ||
    (c.cDescricao || '').toLowerCase().includes('brasil') ||
    (c.cDescricao || '').toLowerCase().includes('bb')
  )
  return bb?.nCodCC || 0
}

// ============================================
// Locais de Estoque
// ============================================

export interface OmieLocalEstoque {
  nCodLocal: number
  cDescricao: string
  codigo_local_integracao?: string
}

export async function fetchLocaisEstoque(creds?: OmieCredentials): Promise<OmieLocalEstoque[]> {
  const cached = getCached<OmieLocalEstoque[]>('locais_estoque')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  try {
    const response = await omieCall<any>(
      '/estoque/local/',
      'ListarLocaisEstoque',
      [{ pagina: 1, registros_por_pagina: 200 }],
      { credentials }
    )

    const locais: OmieLocalEstoque[] = (response.locaisEncontrados || response.cadastro || []).map((l: any) => ({
      nCodLocal: l.nCodLocal || l.codigo || 0,
      cDescricao: l.cDescLocal || l.descricao || '',
      codigo_local_integracao: l.cCodIntLocal || '',
    }))

    setCache('locais_estoque', locais)
    log.info({ count: locais.length }, 'Locais de estoque carregados do Omie')
    return locais
  } catch (err: any) {
    log.warn({ err: err.message }, 'Não foi possível buscar locais de estoque do Omie')
    return []
  }
}

export async function getLocalEstoqueVilaParis(creds?: OmieCredentials): Promise<number> {
  const locais = await fetchLocaisEstoque(creds)
  const vila = locais.find(l =>
    l.cDescricao.toLowerCase().includes('vila paris') ||
    l.cDescricao.toLowerCase().includes('cd-vila') ||
    l.cDescricao.toLowerCase().includes('produto acabado')
  )
  return vila?.nCodLocal || 0
}

// ============================================
// Vendedores Omie
// ============================================

export interface OmieVendedor {
  codigo: number
  codInt?: string
  nome: string
  email?: string
  inativo?: string
}

export async function fetchVendedoresOmie(creds?: OmieCredentials): Promise<OmieVendedor[]> {
  const cached = getCached<OmieVendedor[]>('vendedores_omie')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  const response = await omieCall<any>(
    '/geral/vendedores/',
    'ListarVendedores',
    [{ pagina: 1, registros_por_pagina: 200 }],
    { credentials }
  )

  const vendedores: OmieVendedor[] = (response.cadastro || []).map((v: any) => ({
    codigo: v.codigo || 0,
    codInt: v.codInt || '',
    nome: v.nome || '',
    email: v.email || '',
    inativo: v.inativo || 'N',
  }))

  setCache('vendedores_omie', vendedores)
  log.info({ count: vendedores.length }, 'Vendedores carregados do Omie')
  return vendedores
}

export async function garantirVendedorOmie(vendedorCrmId: number, creds?: OmieCredentials): Promise<number> {
  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  // 1. Checar se vendedor CRM já tem omie_codigo
  const { data: vendedorCrm } = await supabase
    .from('vendedores')
    .select('id, nome, email, omie_codigo')
    .eq('id', vendedorCrmId)
    .single()

  if (!vendedorCrm) throw new Error(`Vendedor ${vendedorCrmId} não encontrado no CRM`)

  if (vendedorCrm.omie_codigo) {
    return parseInt(vendedorCrm.omie_codigo, 10)
  }

  // 2. Buscar vendedores Omie e tentar match por nome ou email
  const vendedoresOmie = await fetchVendedoresOmie(credentials)
  const nomeNorm = (vendedorCrm.nome || '').toLowerCase().trim()
  const emailNorm = (vendedorCrm.email || '').toLowerCase().trim()

  const match = vendedoresOmie.find(v => {
    if (v.inativo === 'S') return false
    const nomeOmie = (v.nome || '').toLowerCase().trim()
    const emailOmie = (v.email || '').toLowerCase().trim()
    return (nomeNorm && nomeOmie === nomeNorm) || (emailNorm && emailOmie === emailNorm)
  })

  if (match) {
    await supabase.from('vendedores').update({ omie_codigo: String(match.codigo) }).eq('id', vendedorCrmId)
    log.info({ vendedorCrmId, omieCode: match.codigo, nome: match.nome }, '🔗 Vendedor vinculado ao Omie')
    return match.codigo
  }

  // 3. Criar vendedor no Omie via UpsertVendedor
  log.info({ vendedorCrmId, nome: vendedorCrm.nome }, '🔄 Criando vendedor no Omie...')
  const response = await omieCall<any>(
    '/geral/vendedores/',
    'UpsertVendedor',
    [{
      codInt: `CRM_${vendedorCrmId}`,
      nome: vendedorCrm.nome || 'Vendedor',
      email: vendedorCrm.email || '',
      inativo: 'N',
      fatura_pedido: 'S',
      visualiza_pedido: 'S',
    }],
    { skipCache: true, credentials }
  )

  const codigoOmie = response.codigo || 0
  if (codigoOmie) {
    await supabase.from('vendedores').update({ omie_codigo: String(codigoOmie) }).eq('id', vendedorCrmId)
    // Invalidar cache de vendedores
    memCache.delete('vendedores_omie')
    log.info({ vendedorCrmId, codigoOmie }, '✅ Vendedor criado no Omie')
  }

  return codigoOmie
}

// ============================================
// Parcelas (Prazos de Pagamento)
// ============================================

export interface OmieParcela {
  codigo: string
  descricao: string
}

export async function fetchParcelasOmie(creds?: OmieCredentials): Promise<OmieParcela[]> {
  const cached = getCached<OmieParcela[]>('parcelas')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  try {
    const response = await omieCall<any>(
      '/geral/parcelas/',
      'ListarParcelas',
      [{ nPagina: 1, nRegPorPagina: 200 }],
      { credentials }
    )
    const parcelas: OmieParcela[] = (response.cadastros || []).map((p: any) => ({
      codigo: String(p.codigo || p.cCodigo || ''),
      descricao: p.descricao || p.cDescricao || '',
    }))
    setCache('parcelas', parcelas)
    log.info({ count: parcelas.length }, 'Parcelas carregadas do Omie')
    return parcelas
  } catch (err) {
    log.warn({ err }, 'Erro ao buscar parcelas do Omie')
    return []
  }
}

/**
 * Mapeia forma de pagamento para código de parcela Omie.
 * Busca parcelas cadastradas no Omie e tenta fazer match com a descrição.
 */
/**
 * Normaliza uma string de parcela para comparação.
 * Remove espaços, "dd", "dias", "dia" e converte para minúsculo.
 * Ex: "07/14/21 DD" → "7/14/21", "Para 07 dias" → "para7", "07/14 Dias" → "7/14"
 */
function normalizeParcela(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bdd\b/gi, '')
    .replace(/\bdias?\b/gi, '')
    .replace(/\bpara\b/gi, '')
    .replace(/\s+/g, '')
    // Remove leading zeros from numbers: "07/14" → "7/14"
    .replace(/\b0+(\d)/g, '$1')
    .trim()
}

export async function mapFormaPagamentoToCodigoParcelaOmie(
  formaPagamento: string,
  creds?: OmieCredentials
): Promise<{ codigo: string; usarListaParcelas: boolean }> {
  const fp = formaPagamento.toLowerCase().trim()
  
  // À vista → código 000
  if (fp === 'à vista' || fp === 'a vista') {
    return { codigo: '000', usarListaParcelas: false }
  }
  
  // Buscar parcelas cadastradas no Omie
  const parcelas = await fetchParcelasOmie(creds)
  
  const fpNorm = normalizeParcela(fp)
  
  // 1. Exact match (normalized)
  for (const p of parcelas) {
    const descNorm = normalizeParcela(p.descricao)
    if (descNorm === fpNorm) {
      log.info({ formaPagamento, codigo: p.codigo, descricao: p.descricao }, '✅ Match exato de parcela Omie')
      return { codigo: p.codigo, usarListaParcelas: false }
    }
  }
  
  // 2. Check if the normalized CRM string contains ONLY the same day-numbers as a parcela
  //    Parse "7/14/21" → [7,14,21] and compare sets
  const fpDias = fpNorm.split('/').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0)
  if (fpDias.length > 0) {
    for (const p of parcelas) {
      const descNorm = normalizeParcela(p.descricao)
      const descDias = descNorm.split('/').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0)
      if (descDias.length === fpDias.length && descDias.every((d, i) => d === fpDias[i])) {
        log.info({ formaPagamento, codigo: p.codigo, descricao: p.descricao, diasMatch: fpDias }, '✅ Match por dias de parcela Omie')
        return { codigo: p.codigo, usarListaParcelas: false }
      }
    }
  }
  
  // 3. Single day match: "28 dias" → parcela "028" or "28"
  const matchSingleDay = fp.match(/^(\d+)\s*dias?$/)
  if (matchSingleDay) {
    const dia = parseInt(matchSingleDay[1], 10)
    for (const p of parcelas) {
      const descNorm = normalizeParcela(p.descricao)
      const descDias = descNorm.split('/').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0)
      if (descDias.length === 1 && descDias[0] === dia) {
        log.info({ formaPagamento, codigo: p.codigo, descricao: p.descricao }, '✅ Match single-day parcela Omie')
        return { codigo: p.codigo, usarListaParcelas: false }
      }
    }
  }
  
  // Se não encontrou match, usar código 999 (parcelas customizadas via lista_parcelas)
  log.info({ formaPagamento, fpNorm, parcelasDisponiveis: parcelas.map(p => ({ codigo: p.codigo, desc: p.descricao, norm: normalizeParcela(p.descricao) })) }, '⚠️ Nenhum match de parcela, usando customizado (999)')
  return { codigo: '999', usarListaParcelas: true }
}

// ============================================
// Dados da Empresa (estado para CFOP)
// ============================================

export async function getEstadoEmpresa(creds?: OmieCredentials): Promise<string> {
  const cached = getCached<string>('empresa_estado')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  try {
    const response = await omieCall<any>(
      '/geral/empresas/',
      'ListarEmpresas',
      [{ nPagina: 1, nRegPorPagina: 10 }],
      { credentials }
    )
    const empresas = response.empresasCadastro || []
    const empresa = empresas[0]
    if (empresa?.estado) {
      const estado = String(empresa.estado).toUpperCase()
      setCache('empresa_estado', estado)
      log.info({ estado }, 'Estado da empresa obtido do Omie')
      return estado
    }
  } catch (err) {
    log.warn({ err }, 'Erro ao buscar estado da empresa no Omie')
  }
  // Fallback: tentar buscar das configurações locais
  const { data: config } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'omie_empresa_estado')
    .maybeSingle()
  if (config?.valor) return config.valor.toUpperCase()
  // Default: MG
  return 'MG'
}

// ============================================
// Helper: calcular 7 dias úteis
// ============================================

export function calcularDataPrevisao(diasUteis: number = 7): string {
  const date = new Date()
  let count = 0
  while (count < diasUteis) {
    date.setDate(date.getDate() + 1)
    const dow = date.getDay()
    if (dow !== 0 && dow !== 6) count++ // pula sáb/dom
  }
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
