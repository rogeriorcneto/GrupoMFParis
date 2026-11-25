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

export function clearCache(key?: string): void {
  if (key) memCache.delete(key)
  else memCache.clear()
}

// ============================================
// Cenários Fiscais
// ============================================

export interface OmieCenario {
  nCodigo: number
  cDescricao: string
  cPadrao?: string
}

export async function fetchCenariosFiscais(creds?: OmieCredentials, skipCache = false): Promise<OmieCenario[]> {
  if (!skipCache) {
    const cached = getCached<OmieCenario[]>('cenarios')
    if (cached) return cached
  }

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  const response = await omieCall<any>(
    '/geral/cenarios/',
    'ListarCenarios',
    [{ nPagina: 1, nRegPorPagina: 200 }],
    { credentials }
  )

  log.info({ responseKeys: Object.keys(response || {}), rawSample: JSON.stringify(response).slice(0, 500) }, '🔍 Omie ListarCenarios resposta bruta')
  // Omie retorna a lista em 'cenariosEncontrados' com campos cNome/nCodigo/padrao
  const lista = response.cenariosEncontrados || response.cadastros || response.cenariosCadastro || response.cenario_cadastro || []
  const cenarios: OmieCenario[] = lista
    .filter((c: any) => c.inativo !== 'S')
    .map((c: any) => ({
      nCodigo: c.nCodigo || c.codigo || 0,
      cDescricao: c.cNome || c.cDescricao || c.descricao || '',
      cPadrao: c.padrao === true ? 'S' : (c.cPadrao || ''),
    }))

  setCache('cenarios', cenarios)
  log.info({ count: cenarios.length, cenarios: cenarios.map(c => ({ id: c.nCodigo, desc: c.cDescricao })) }, 'Cenários fiscais carregados do Omie')
  return cenarios
}

export async function getCenarioVendas(creds?: OmieCredentials, skipCache = false): Promise<number> {
  const cenarios = await fetchCenariosFiscais(creds, skipCache)
  const vendas = cenarios.find(c =>
    c.cPadrao === 'S' ||
    c.cDescricao.toLowerCase().includes('venda') ||
    c.cDescricao.toLowerCase().includes('padrão') ||
    c.cDescricao.toLowerCase().includes('padrao')
  )
  return vendas?.nCodigo || 0
}

export async function getCenarioAmostra(creds?: OmieCredentials, skipCache = false): Promise<number> {
  const cenarios = await fetchCenariosFiscais(creds, skipCache)
  log.info({ cenarios: cenarios.map(c => ({ id: c.nCodigo, desc: c.cDescricao, padrao: c.cPadrao })) }, '🔍 Cenários fiscais disponíveis no Omie')
  const normalizar = (s: string) =>
    s.toLowerCase()
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, '') // remove acentos
  const amostra = cenarios.find(c => {
    const desc = normalizar(c.cDescricao)
    return desc.includes('amostra') || desc.includes('bonifica')
  })
  if (!amostra) {
    log.warn({ descricoes: cenarios.map(c => c.cDescricao) }, '⚠️ Cenário de Bonificação não encontrado no Omie. Verifique se o cenário "Bonificação" está cadastrado.')
  } else {
    log.info({ codigo: amostra.nCodigo, descricao: amostra.cDescricao }, '✅ Cenário de bonificação/amostra encontrado')
  }
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

/** Busca TODAS as páginas de vendedores do Omie (a API pagina de 100 em 100). */
export async function fetchTodosVendedoresOmie(creds?: OmieCredentials): Promise<OmieVendedor[]> {
  const cached = getCached<OmieVendedor[]>('vendedores_omie_all')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  const todos: OmieVendedor[] = []
  let pagina = 1
  let totalPaginas = 1
  do {
    const response = await omieCall<any>(
      '/geral/vendedores/',
      'ListarVendedores',
      [{ pagina, registros_por_pagina: 100 }],
      { credentials, skipCache: pagina === 1 }
    )
    totalPaginas = Number(response?.total_de_paginas) || 1
    for (const v of response?.cadastro || []) {
      todos.push({ codigo: v.codigo || 0, codInt: v.codInt || '', nome: v.nome || '', email: v.email || '', inativo: v.inativo || 'N' })
    }
    pagina++
  } while (pagina <= totalPaginas && pagina <= 10)

  setCache('vendedores_omie_all', todos)
  return todos
}

function normalizarNomeVendedor(nome: string): string {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Nome-base do cadastro de vendedor, sem o sufixo de tabela.
 * Omie usa variantes por tabela: "Eridiane Couto - A", "Artur Parente - FDS RJ - TABELA B",
 * "Ursulla Lopes   A", "Izidório Santos - Interno  Tabela A".
 * Base = trecho antes do primeiro " - "; sem hífen, remove " A"/" B" solto no fim.
 */
export function extrairBaseVendedor(nome: string): string {
  const n = normalizarNomeVendedor(nome)
  const idx = n.indexOf(' - ')
  let base = idx > 0 ? n.slice(0, idx) : n
  base = base.replace(/\s+[ab]$/, '')
  return base.trim()
}

/** Sufixo de tabela do cadastro ("- A", "  B", "TABELA A", "Interno Tabela B") → 'A' | 'B' | null */
export function tagTabelaVendedor(nome: string): 'A' | 'B' | null {
  const m = normalizarNomeVendedor(nome).match(/[\s-]+(?:tabela\s+)?([ab])$/)
  return m ? (m[1].toUpperCase() as 'A' | 'B') : null
}

function tokensCompativeis(base: string, cand: string): boolean {
  const tBase = new Set(base.split(' ').filter(Boolean))
  const tCand = new Set(cand.split(' ').filter(Boolean))
  if (!tBase.size || !tCand.size) return false
  const baseFirst = base.split(' ')[0]
  const candFirst = cand.split(' ')[0]
  if (baseFirst !== candFirst) return false
  const sub = (a: Set<string>, b: Set<string>) => [...a].every(t => b.has(t))
  return sub(tCand, tBase) || sub(tBase, tCand)
}

/**
 * Resolve o cadastro de vendedor no Omie conforme a tabela de preço (A/B)
 * escolhida na aprovação. No Omie, cada vendedor tem cadastros-irmãos com
 * sufixo de tabela ("Nome - A", "Nome - Interno - Tabela B" etc.) — o pedido
 * herda preços/comissão do cadastro usado. Sem variante, cai no código base.
 */
export async function resolverVendedorOmie(vendedorCrmId: number, creds?: OmieCredentials, tabela?: 'A' | 'B'): Promise<number> {
  const codigoBase = await garantirVendedorOmie(vendedorCrmId, creds)
  if (!tabela || !codigoBase) return codigoBase

  const credentials = creds || await getOmieCredentials()
  if (!credentials) return codigoBase

  const { data: crm } = await supabase.from('vendedores').select('nome').eq('id', vendedorCrmId).single()
  const todos = await fetchTodosVendedoresOmie(credentials)
  const registroBase = todos.find(v => v.codigo === codigoBase)
  const baseNome = registroBase ? extrairBaseVendedor(registroBase.nome) : extrairBaseVendedor(crm?.nome || '')
  if (!baseNome) return codigoBase

  const candidatos = todos.filter(v => v.inativo !== 'S' && tokensCompativeis(baseNome, extrairBaseVendedor(v.nome)))
  const comTabela = candidatos.filter(v => tagTabelaVendedor(v.nome) === tabela)
  if (comTabela.length === 0) {
    log.warn({ vendedorCrmId, codigoBase, tabela, baseNome }, '⚠️ Nenhum cadastro de vendedor com a tabela escolhida — usando código base')
    return codigoBase
  }
  const escolhido = comTabela[0]
  if (escolhido.codigo !== codigoBase) {
    log.info({ vendedorCrmId, codigoBase, escolhido: escolhido.codigo, nome: escolhido.nome, tabela }, `🔄 Vendedor Omie resolvido para tabela ${tabela}`)
  }
  return escolhido.codigo
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

export async function fetchParcelasOmie(creds?: OmieCredentials, skipCache = false): Promise<OmieParcela[]> {
  if (!skipCache) {
    const cached = getCached<OmieParcela[]>('parcelas')
    if (cached) return cached
  }

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  try {
    const todas: OmieParcela[] = []
    let pagina = 1
    let totalPaginas = 1
    do {
      const response = await omieCall<any>(
        '/geral/parcelas/',
        'ListarParcelas',
        [{ pagina, registros_por_pagina: 200 }],
        { credentials, skipCache: pagina === 1 && skipCache }
      )
      totalPaginas = Number(response?.total_de_paginas) || 1
      for (const p of response?.cadastros || response?.parcelas || []) {
        const codigo = String(p.nCodigo ?? p.cCodigo ?? p.codigo ?? '').trim()
        const descricao = String(p.cDescricao ?? p.descricao ?? '').trim()
        if (codigo && descricao) todas.push({ codigo, descricao })
      }
      pagina++
    } while (pagina <= totalPaginas && pagina <= 10)

    setCache('parcelas', todas)
    log.info({ count: todas.length }, 'Parcelas carregadas do Omie')
    return todas
  } catch (err) {
    log.warn({ err }, 'Erro ao buscar parcelas do Omie')
    return []
  }
}

function normalizeParcela(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(c\)/gi, '')
    .replace(/\bdd\b/gi, '')
    .replace(/\bdias?\b/gi, '')
    .replace(/\bpara\b/gi, '')
    .replace(/\s+/g, '')
    .replace(/\b0+(\d)/g, '$1')
    .trim()
}

function ehDescricaoQtdParcelasGenerica(descricao: string): boolean {
  return /^\d+\s*parcelas?$/i.test(descricao.trim())
}

/**
 * Resolve o código oficial da condição de pagamento cadastrada no Omie (ex.: "14/21/28" → "S21",
 * "21/28/35" → "S03", "7 dias" → "A07", "À vista" → "000").
 * Se a condição não existir no Omie, NÃO inventa código personalizado ('999') nem cadastra nada:
 * lança erro claro informando qual prazo falta cadastrar no Omie.
 */
export async function resolverCodigoParcelaOmie(
  formaPagamento: string,
  creds?: OmieCredentials
): Promise<string> {
  const raw = String(formaPagamento || 'À vista').trim()
  const semAcento = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  if (semAcento === 'a vista' || semAcento === 'avista') {
    return '000'
  }

  let parcelas = await fetchParcelasOmie(creds)
  if (parcelas.length === 0) {
    parcelas = await fetchParcelasOmie(creds, true)
  }

  const candidatas = parcelas.filter(p => !ehDescricaoQtdParcelasGenerica(p.descricao))
  const fpNorm = normalizeParcela(raw)

  // Preferir cadastro sem sufixo "(C)" quando existir duplicata exata (ex.: "Para 30 dias" vs "Para 30 dias (C)")
  const exatos = candidatas.filter(p => normalizeParcela(p.descricao) === fpNorm)
  if (exatos.length > 0) {
    const preferido = exatos.find(p => !/\(c\)/i.test(p.descricao)) || exatos[0]
    log.info({ formaPagamento: raw, codigo: preferido.codigo, descricao: preferido.descricao }, '✅ Condição de pagamento localizada no Omie')
    return preferido.codigo
  }

  const fpDias = fpNorm.split('/').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 0)
  if (fpDias.length > 0 && fpNorm.split('/').every(seg => /^\d+$/.test(seg))) {
    const porDias = candidatas.filter(p => {
      const dNorm = normalizeParcela(p.descricao)
      if (!dNorm.split('/').every(seg => /^\d+$/.test(seg))) return false
      const descDias = dNorm.split('/').map(n => parseInt(n, 10))
      return descDias.length === fpDias.length && descDias.every((d, i) => d === fpDias[i])
    })
    if (porDias.length > 0) {
      const preferido = porDias.find(p => !/\(c\)/i.test(p.descricao)) || porDias[0]
      log.info({ formaPagamento: raw, codigo: preferido.codigo, descricao: preferido.descricao }, '✅ Condição de pagamento localizada por dias no Omie')
      return preferido.codigo
    }
  }

  // Caso "N dias <observação>" sem barra (ex.: "45 dias exclusivo" -> "Para 45 dias")
  if (!raw.includes('/')) {
    const mUnicoDia = semAcento.match(/(\d+)\s*dias?\b/)
    if (mUnicoDia) {
      const diaAlvo = parseInt(mUnicoDia[1], 10)
      const porDiaUnico = candidatas.filter(p => {
        const dNorm = normalizeParcela(p.descricao)
        return /^\d+$/.test(dNorm) && parseInt(dNorm, 10) === diaAlvo
      })
      if (porDiaUnico.length > 0) {
        const preferido = porDiaUnico.find(p => !/\(c\)/i.test(p.descricao)) || porDiaUnico[0]
        return preferido.codigo
      }
    }
  }

  throw new Error(
    `Condição de pagamento "${raw}" não está cadastrada no Omie ERP. Cadastre o prazo "${raw}" nas Condições de Pagamento do Omie antes de aprovar este pedido.`
  )
}

export async function mapFormaPagamentoToCodigoParcelaOmie(
  formaPagamento: string,
  creds?: OmieCredentials
): Promise<{ codigo: string; usarListaParcelas: boolean }> {
  const codigo = await resolverCodigoParcelaOmie(formaPagamento, creds)
  return { codigo, usarListaParcelas: codigo !== '000' }
}

// ============================================
// Tabelas de Preço (A/B — afetam comissões)
// ============================================

export interface OmieTabelaPreco {
  nCodTabPreco: number
  cNome: string
  cCodigo: string
  cAtiva: string
}

export async function fetchTabelasPreco(creds?: OmieCredentials): Promise<OmieTabelaPreco[]> {
  const cached = getCached<OmieTabelaPreco[]>('tabelas_preco')
  if (cached) return cached

  const credentials = creds || await getOmieCredentials()
  if (!credentials) throw new Error('Credenciais Omie não configuradas')

  try {
    const response = await omieCall<any>(
      '/produtos/tabelaprecos/',
      'ListarTabelasPreco',
      [{ nPagina: 1, nRegPorPagina: 100 }],
      { credentials }
    )
    const rawList = response.listaTabelasPreco || response.cadastros || []
    const tabelas: OmieTabelaPreco[] = (Array.isArray(rawList) ? rawList : []).map((t: any) => ({
      nCodTabPreco: t.nCodTabPreco || 0,
      cNome: t.cNome || '',
      cCodigo: t.cCodigo || '',
      cAtiva: t.cAtiva || 'S',
    }))
    setCache('tabelas_preco', tabelas)
    log.info({ count: tabelas.length, tabelas: tabelas.map(t => t.cNome) }, 'Tabelas de preço carregadas do Omie')
    return tabelas
  } catch (err: any) {
    // Omie retorna "Não existem registros" quando não há tabelas cadastradas.
    const msg = String(err?.message || '')
    if (!/n[aã]o existem registros/i.test(msg)) {
      log.warn({ err }, 'Não foi possível buscar tabelas de preço do Omie')
    }
    return []
  }
}

/**
 * Resolve o código interno (nCodTabPreco) da tabela de preço pelo nome/código
 * exibido no Omie. Aceita 'A', 'B', 'Tabela A', 'TABELA B' etc. 0 se não achar.
 */
export async function getCodigoTabelaPreco(nome: string, creds?: OmieCredentials): Promise<number> {
  const alvo = nome.trim().toLowerCase()
  if (!alvo) return 0
  const tabelas = await fetchTabelasPreco(creds)
  const norm = (s: string) => s.toLowerCase().replace(/^tabela\s+/, '').trim()
  const tabela = tabelas.find(t =>
    t.cAtiva !== 'N' &&
    (norm(t.cNome) === alvo || norm(t.cCodigo) === alvo)
  )
  if (!tabela) {
    log.warn({ nome, disponiveis: tabelas.map(t => t.cNome) }, '⚠️ Tabela de preço não encontrada no Omie')
    return 0
  }
  return tabela.nCodTabPreco
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
