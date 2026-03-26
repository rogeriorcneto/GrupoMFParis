import { omieCallAllPages } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'
import type { OmieProduto } from './types.js'

export interface SyncProdutosResult {
  inseridos: number
  atualizados: number
  removidos: number
  totalOmie: number
  erros: { codigo: string; erro: string }[]
}

/**
 * Mapeia campos do produto Omie para o formato da tabela `produtos` do CRM.
 */
function omieProdutoToDbRow(p: OmieProduto): Record<string, any> {
  const recomFiscais = p.recomendacoes_fiscais || {}
  return {
    nome: p.descricao || '',
    descricao: p.descricao_detalhada || p.observacoes || p.descricao || '',
    categoria: inferCategoria(p),
    preco: p.valor_unitario || 0,
    unidade: (p.unidade || 'un').toLowerCase(),
    sku: String(p.codigo_produto || p.codigo || ''),
    peso_kg: p.peso_liq || p.peso_bruto || null,
    ativo: (p.inativo ?? 'N') !== 'S',
    destaque: false,
    omie_codigo: String(p.codigo_produto || ''),
    marca: p.marca || null,
    especie_volume: p.especie || null,
    ncm: p.ncm || null,
    cfop_interno: recomFiscais.cfop_dentro_estado || recomFiscais.cCFOPDentroEstado || null,
    cfop_externo: recomFiscais.cfop_fora_estado || recomFiscais.cCFOPForaEstado || null,
    local_estoque: p.local_estoque || null,
  }
}

/**
 * Tenta inferir a categoria do produto baseado no nome/descrição.
 */
function inferCategoria(p: OmieProduto): string {
  const nome = (p.descricao || '').toLowerCase()
  if (nome.includes('okey lac') || nome.includes('okeylac')) return 'okey_lac'
  if (nome.includes('sacaria') || nome.includes('25kg') || nome.includes('saco')) return 'sacaria'
  if (nome.includes('café') || nome.includes('cafe')) return 'cafe'
  if (nome.includes('varejo') || nome.includes('lácteo') || nome.includes('lacteo')) return 'varejo_lacteo'
  return 'outros'
}

/**
 * Puxa todos os produtos do Omie e faz upsert na tabela `produtos` do CRM.
 * Usa `omie_codigo` como chave para identificar duplicatas.
 */
export async function syncPullProdutos(): Promise<SyncProdutosResult> {
  log.info('Iniciando sync de produtos Omie → CRM...')

  // 1. Buscar todos os produtos do Omie (paginado)
  const omieProdutos = await omieCallAllPages<OmieProduto>(
    '/geral/produtos/',
    'ListarProdutos',
    {},
    'produto_servico_cadastro',
    100,
  )

  log.info({ total: omieProdutos.length }, 'Produtos recebidos do Omie')

  // 2. Buscar produtos existentes no CRM que já têm omie_codigo
  const { data: existentes } = await supabase
    .from('produtos')
    .select('id, omie_codigo')
    .not('omie_codigo', 'is', null)

  const mapExistentes = new Map<string, number>()
  for (const row of existentes || []) {
    if (row.omie_codigo) mapExistentes.set(row.omie_codigo, row.id)
  }

  let inseridos = 0
  let atualizados = 0
  const erros: { codigo: string; erro: string }[] = []

  // 3. Upsert cada produto
  for (const omieProd of omieProdutos) {
    const codigoStr = String(omieProd.codigo_produto || '')
    if (!codigoStr) continue

    const dbRow = omieProdutoToDbRow(omieProd)

    try {
      const existingId = mapExistentes.get(codigoStr)
      if (existingId) {
        // Atualizar existente (não sobrescrever foto, destaque, margem_lucro)
        const { error } = await supabase.from('produtos').update({
          nome: dbRow.nome,
          descricao: dbRow.descricao,
          categoria: dbRow.categoria,
          preco: dbRow.preco,
          unidade: dbRow.unidade,
          sku: dbRow.sku,
          peso_kg: dbRow.peso_kg,
          ativo: dbRow.ativo,
          marca: dbRow.marca,
          especie_volume: dbRow.especie_volume,
          ncm: dbRow.ncm,
          cfop_interno: dbRow.cfop_interno,
          cfop_externo: dbRow.cfop_externo,
          local_estoque: dbRow.local_estoque,
        }).eq('id', existingId)
        if (error) throw error
        atualizados++
      } else {
        // Inserir novo
        const { error } = await supabase.from('produtos').insert(dbRow)
        if (error) throw error
        inseridos++
      }
    } catch (err: any) {
      log.warn({ err, codigo: codigoStr }, 'Erro ao sincronizar produto')
      erros.push({ codigo: codigoStr, erro: err.message })
    }
  }

  // 4. Remover produtos que NÃO vieram do Omie (testes, seeds, manuais)
  //    Também remover produtos cujo omie_codigo não está mais na lista do Omie
  let removidos = 0
  const omieCodigos = new Set(omieProdutos.map(p => String(p.codigo_produto || '')).filter(Boolean))

  // 4a. Deletar produtos sem omie_codigo (foram criados manualmente / seeds)
  const { data: semOmie } = await supabase
    .from('produtos')
    .select('id')
    .is('omie_codigo', null)
  if (semOmie && semOmie.length > 0) {
    const ids = semOmie.map(r => r.id)
    const { error: delErr } = await supabase.from('produtos').delete().in('id', ids)
    if (!delErr) {
      removidos += ids.length
      log.info({ count: ids.length }, '🗑️ Produtos sem omie_codigo removidos')
    }
  }

  // 4b. Deletar produtos com omie_codigo que não existe mais no Omie
  const { data: comOmie } = await supabase
    .from('produtos')
    .select('id, omie_codigo')
    .not('omie_codigo', 'is', null)
  if (comOmie) {
    const idsParaRemover = comOmie
      .filter(r => r.omie_codigo && !omieCodigos.has(r.omie_codigo))
      .map(r => r.id)
    if (idsParaRemover.length > 0) {
      const { error: delErr } = await supabase.from('produtos').delete().in('id', idsParaRemover)
      if (!delErr) {
        removidos += idsParaRemover.length
        log.info({ count: idsParaRemover.length }, '🗑️ Produtos obsoletos (não mais no Omie) removidos')
      }
    }
  }

  log.info({ inseridos, atualizados, removidos, erros: erros.length, totalOmie: omieProdutos.length }, 'Sync de produtos concluído')

  return { inseridos, atualizados, removidos, totalOmie: omieProdutos.length, erros }
}
