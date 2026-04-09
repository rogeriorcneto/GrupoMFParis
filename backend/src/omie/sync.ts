import { omieCall, omieCallAllPages, getOmieCredentials } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'
import type { OmieCliente, OmieClienteListResponse } from './types.js'

// ============================================
// Mapeamento CRM ↔ Omie
// ============================================

export function crmToOmie(cliente: any): Partial<OmieCliente> {
  return {
    razao_social: cliente.razao_social || cliente.razaoSocial || '',
    nome_fantasia: cliente.nome_fantasia || cliente.nomeFantasia || '',
    cnpj_cpf: cliente.cnpj || '',
    contato: cliente.contato_nome || cliente.contatoNome || '',
    email: cliente.contato_email || cliente.contatoEmail || '',
    telefone1_numero: cliente.contato_telefone || cliente.contatoTelefone || '',
    telefone2_numero: cliente.contato_celular || cliente.contatoCelular || '',
    endereco: cliente.endereco_rua || cliente.enderecoRua || '',
    endereco_numero: cliente.endereco_numero || cliente.enderecoNumero || '',
    complemento: cliente.endereco_complemento || cliente.enderecoComplemento || '',
    bairro: cliente.endereco_bairro || cliente.enderecoBairro || '',
    cidade: cliente.endereco_cidade || cliente.enderecoCidade || '',
    estado: cliente.endereco_estado || cliente.enderecoEstado || '',
    cep: cliente.endereco_cep || cliente.enderecoCep || '',
    cnae: cliente.cnae_primario || cliente.cnaePrimario || '',
    observacao: cliente.notas || '',
    contribuinte: 'S',
  }
}

export function omieToDbRow(omie: OmieCliente): Record<string, any> {
  return {
    razao_social: omie.razao_social || '',
    nome_fantasia: omie.nome_fantasia || '',
    cnpj: omie.cnpj_cpf || '',
    contato_nome: omie.contato || '',
    contato_email: omie.email || '',
    contato_telefone: omie.telefone1_numero || '',
    contato_celular: omie.telefone2_numero || '',
    endereco_rua: omie.endereco || '',
    endereco_numero: omie.endereco_numero || '',
    endereco_complemento: omie.complemento || '',
    endereco_bairro: omie.bairro || '',
    endereco_cidade: omie.cidade || '',
    endereco_estado: omie.estado || '',
    endereco_cep: omie.cep || '',
    cnae_primario: omie.cnae || '',
    omie_codigo: String(omie.codigo_cliente_omie || ''),
  }
}

// ============================================
// Diff — Preview antes de sync
// ============================================

export interface SyncDiffItem {
  omieCodigo: number
  cnpj: string
  razaoSocial: string
  status: 'novo' | 'atualizado' | 'sem_alteracao'
  crmId?: number
}

export interface SyncDiffResult {
  novos: SyncDiffItem[]
  atualizados: SyncDiffItem[]
  semAlteracao: SyncDiffItem[]
  totalOmie: number
  totalCrm: number
}

export async function getSyncDiff(): Promise<SyncDiffResult> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  // Buscar todos os clientes do Omie
  const omieClientes = await omieCallAllPages<OmieCliente>(
    '/geral/clientes/',
    'ListarClientes',
    {},
    'clientes_cadastro',
    100,
    { credentials: creds }
  )

  // Buscar todos os clientes do CRM que já têm omie_codigo
  const { data: crmClientes, error } = await supabase
    .from('clientes')
    .select('id, cnpj, razao_social, omie_codigo')

  if (error) throw new Error(`Erro ao buscar clientes do CRM: ${error.message}`)

  const crmByCnpj = new Map<string, any>()
  const crmByOmie = new Map<string, any>()
  for (const c of crmClientes || []) {
    if (c.cnpj) crmByCnpj.set(c.cnpj.replace(/\D/g, ''), c)
    if (c.omie_codigo) crmByOmie.set(String(c.omie_codigo), c)
  }

  const novos: SyncDiffItem[] = []
  const atualizados: SyncDiffItem[] = []
  const semAlteracao: SyncDiffItem[] = []

  for (const omie of omieClientes) {
    const cnpjClean = (omie.cnpj_cpf || '').replace(/\D/g, '')
    const omieCode = String(omie.codigo_cliente_omie || '')

    const crmMatch = crmByOmie.get(omieCode) || crmByCnpj.get(cnpjClean)

    if (!crmMatch) {
      novos.push({
        omieCodigo: omie.codigo_cliente_omie || 0,
        cnpj: omie.cnpj_cpf || '',
        razaoSocial: omie.razao_social || '',
        status: 'novo',
      })
    } else {
      // Verificar se houve atualização (comparação simples por razão social e email)
      const changed = (omie.razao_social || '') !== (crmMatch.razao_social || '')
      if (changed) {
        atualizados.push({
          omieCodigo: omie.codigo_cliente_omie || 0,
          cnpj: omie.cnpj_cpf || '',
          razaoSocial: omie.razao_social || '',
          status: 'atualizado',
          crmId: crmMatch.id,
        })
      } else {
        semAlteracao.push({
          omieCodigo: omie.codigo_cliente_omie || 0,
          cnpj: omie.cnpj_cpf || '',
          razaoSocial: omie.razao_social || '',
          status: 'sem_alteracao',
          crmId: crmMatch.id,
        })
      }
    }
  }

  return {
    novos,
    atualizados,
    semAlteracao,
    totalOmie: omieClientes.length,
    totalCrm: (crmClientes || []).length,
  }
}

// ============================================
// Sync Pull — Omie → CRM
// ============================================

export interface SyncPullResult {
  inseridos: number
  atualizados: number
  erros: { cnpj: string; erro: string }[]
}

export async function syncPullClientes(vendedorIdPadrao?: number): Promise<SyncPullResult> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  const omieClientes = await omieCallAllPages<OmieCliente>(
    '/geral/clientes/',
    'ListarClientes',
    {},
    'clientes_cadastro',
    100,
    { credentials: creds }
  )

  // Buscar clientes existentes no CRM
  const { data: crmClientes } = await supabase
    .from('clientes')
    .select('id, cnpj, omie_codigo')

  const crmByCnpj = new Map<string, any>()
  const crmByOmie = new Map<string, any>()
  for (const c of crmClientes || []) {
    if (c.cnpj) crmByCnpj.set(c.cnpj.replace(/\D/g, ''), c)
    if (c.omie_codigo) crmByOmie.set(String(c.omie_codigo), c)
  }

  // Buscar o primeiro vendedor se não informado
  if (!vendedorIdPadrao) {
    const { data: vendedores } = await supabase.from('vendedores').select('id').limit(1)
    vendedorIdPadrao = vendedores?.[0]?.id || 1
  }

  let inseridos = 0
  let atualizados = 0
  const erros: { cnpj: string; erro: string }[] = []

  for (const omie of omieClientes) {
    const cnpjClean = (omie.cnpj_cpf || '').replace(/\D/g, '')
    const omieCode = String(omie.codigo_cliente_omie || '')
    const dbRow = omieToDbRow(omie)

    try {
      const existing = crmByOmie.get(omieCode) || crmByCnpj.get(cnpjClean)

      if (existing) {
        // Update
        const { error } = await supabase
          .from('clientes')
          .update({ ...dbRow, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) throw new Error(error.message)
        atualizados++
      } else {
        // Insert
        const { error } = await supabase
          .from('clientes')
          .insert({
            ...dbRow,
            etapa: 'prospecção',
            vendedor_id: vendedorIdPadrao,
            data_entrada_etapa: new Date().toISOString().split('T')[0],
          })
        if (error) throw new Error(error.message)
        inseridos++
      }
    } catch (err: any) {
      erros.push({ cnpj: omie.cnpj_cpf || '', erro: err.message })
      log.error({ err, cnpj: omie.cnpj_cpf }, 'Erro ao importar cliente do Omie')
    }
  }

  log.info({ inseridos, atualizados, erros: erros.length }, 'Sync pull Omie → CRM concluído')
  return { inseridos, atualizados, erros }
}

// ============================================
// Push Single Client — CRM → Omie (após cadastro)
// ============================================

export interface SinglePushResult {
  success: boolean
  omieCodigo?: string
  error?: string
}

export async function syncPushSingleCliente(clienteId: number): Promise<SinglePushResult> {
  const creds = await getOmieCredentials()
  if (!creds) return { success: false, error: 'Credenciais Omie não configuradas' }

  const { data: cliente, error: fetchErr } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', clienteId)
    .single()

  if (fetchErr || !cliente) return { success: false, error: 'Cliente não encontrado no CRM' }

  const omieData = crmToOmie(cliente)

  // Omie exige cnpj_cpf para UpsertClienteCpfCnpj
  if (!omieData.cnpj_cpf || omieData.cnpj_cpf.replace(/\D/g, '').length < 11) {
    return { success: false, error: 'Cliente sem CNPJ/CPF válido — não pode ser enviado ao Omie' }
  }

  try {
    const response = await omieCall<any>(
      '/geral/clientes/',
      'UpsertClienteCpfCnpj',
      [omieData],
      { skipCache: true, credentials: creds }
    )

    const omieCodigo = String(response.codigo_cliente_omie || '')

    // Salvar omie_codigo no CRM
    if (omieCodigo && !cliente.omie_codigo) {
      await supabase
        .from('clientes')
        .update({ omie_codigo: omieCodigo })
        .eq('id', clienteId)
    }

    log.info({ clienteId, omieCodigo }, 'Cliente enviado ao Omie com sucesso')
    return { success: true, omieCodigo }
  } catch (err: any) {
    log.error({ err, clienteId }, 'Erro ao enviar cliente ao Omie')
    return { success: false, error: err.message }
  }
}

// ============================================
// Associar clientes CRM ↔ Omie por CNPJ
// ============================================

export interface AssociacaoResult {
  associados: number
  jaVinculados: number
  semCnpj: number
  naoEncontradosOmie: number
  erros: { crmId: number; razaoSocial: string; erro: string }[]
  detalhes: { crmId: number; razaoSocial: string; omieId: string; cnpj: string }[]
}

export async function associarClientesPorCnpj(): Promise<AssociacaoResult> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  // 1. Buscar todos os clientes do CRM
  const { data: crmClientes, error: crmErr } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj, omie_codigo')
  if (crmErr) throw new Error(`Erro ao buscar clientes CRM: ${crmErr.message}`)

  // 2. Buscar todos os clientes do Omie (paginação)
  const omieClientes: any[] = []
  let page = 1
  const PER_PAGE = 200
  while (true) {
    const result = await omieCall<any>(
      '/geral/clientes/',
      'ListarClientesResumido',
      [{ pagina: page, registros_por_pagina: PER_PAGE, apenas_importado_api: 'N' }],
      { credentials: creds, skipCache: true }
    )
    const items = result?.clientes_cadastro_resumido || result?.clientes_cadastro || []
    omieClientes.push(...items)
    if (items.length < PER_PAGE) break
    page++
  }

  log.info({ total: omieClientes.length }, 'Clientes Omie carregados para associação por CNPJ')

  // 3. Montar mapa CNPJ (só números) → codigo_cliente_omie
  const omiePorCnpj = new Map<string, number>()
  for (const oc of omieClientes) {
    const cnpj = (oc.cnpj_cpf || '').replace(/\D/g, '')
    const codigo = oc.codigo_cliente || oc.codigo_cliente_omie || 0
    if (cnpj && codigo) omiePorCnpj.set(cnpj, codigo)
  }

  const result: AssociacaoResult = {
    associados: 0, jaVinculados: 0, semCnpj: 0,
    naoEncontradosOmie: 0, erros: [], detalhes: [],
  }

  // 4. Iterar clientes CRM e vincular
  for (const c of crmClientes || []) {
    const cnpjClean = (c.cnpj || '').replace(/\D/g, '')

    if (!cnpjClean || cnpjClean.length < 11) {
      result.semCnpj++
      continue
    }

    if (c.omie_codigo) {
      result.jaVinculados++
      continue
    }

    const omieId = omiePorCnpj.get(cnpjClean)
    if (!omieId) {
      result.naoEncontradosOmie++
      continue
    }

    try {
      await supabase
        .from('clientes')
        .update({ omie_codigo: String(omieId) })
        .eq('id', c.id)

      result.associados++
      result.detalhes.push({ crmId: c.id, razaoSocial: c.razao_social, omieId: String(omieId), cnpj: c.cnpj })
      log.info({ crmId: c.id, omieId, cnpj: cnpjClean, razao: c.razao_social }, '🔗 Cliente CRM vinculado ao Omie por CNPJ')
    } catch (err: any) {
      result.erros.push({ crmId: c.id, razaoSocial: c.razao_social, erro: err.message })
    }
  }

  log.info(result, 'Associação CRM ↔ Omie por CNPJ concluída')
  return result
}

// ============================================
// Sync Push — CRM → Omie
// ============================================

export interface SyncPushResult {
  enviados: number
  erros: { cnpj: string; erro: string }[]
}

export async function syncPushClientes(): Promise<SyncPushResult> {
  const creds = await getOmieCredentials()
  if (!creds) throw new Error('Credenciais Omie não configuradas')

  // Buscar clientes do CRM
  const { data: crmClientes, error } = await supabase
    .from('clientes')
    .select('*')

  if (error) throw new Error(`Erro ao buscar clientes: ${error.message}`)

  let enviados = 0
  const erros: { cnpj: string; erro: string }[] = []

  for (const cliente of crmClientes || []) {
    if (!cliente.cnpj) continue // Pular clientes sem CNPJ

    const omieData = crmToOmie(cliente)

    try {
      const response = await omieCall<any>(
        '/geral/clientes/',
        'UpsertClienteCpfCnpj',
        [omieData],
        { skipCache: true, credentials: creds }
      )

      // Salvar o codigo_cliente_omie retornado
      if (response.codigo_cliente_omie && !cliente.omie_codigo) {
        await supabase
          .from('clientes')
          .update({ omie_codigo: String(response.codigo_cliente_omie) })
          .eq('id', cliente.id)
      }

      enviados++
    } catch (err: any) {
      erros.push({ cnpj: cliente.cnpj, erro: err.message })
      log.error({ err, cnpj: cliente.cnpj }, 'Erro ao exportar cliente para Omie')
    }
  }

  log.info({ enviados, erros: erros.length }, 'Sync push CRM → Omie concluído')
  return { enviados, erros }
}
