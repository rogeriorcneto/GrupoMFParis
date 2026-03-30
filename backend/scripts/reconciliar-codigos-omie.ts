import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'
import path from 'node:path'

const SUPABASE_URL = 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'
const BACKEND_URL = 'https://grupomfparis-production.up.railway.app'
const GERENTE_EMAIL = 'rafael@mfparis.com.br'
const GERENTE_SENHA = 'MFParis2024!'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

type ProdutoCRM = {
  id: number
  nome: string
  omie_codigo: string | null
}

type MatchResult = {
  id: number
  nome: string
  omie_codigo_atual: string | null
  status: 'ok_codigo_produto' | 'resolvido_por_busca' | 'nao_encontrado'
  codigo_produto_api: string | null
  codigo_ui: string | null
  descricao_omie: string | null
}

function normalize(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function extractProdutosFromAnyPayload(data: any): any[] {
  if (!data) return []

  const candidateKeys = [
    'produto_servico_cadastro',
    'produtos',
    'lista_produtos',
    'produto',
    'itens',
  ]

  for (const key of candidateKeys) {
    if (Array.isArray(data[key])) return data[key]
  }

  for (const [_, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length > 0) {
      const sample: any = v[0]
      if (sample && (sample.codigo_produto || sample.codigo || sample.descricao)) {
        return v as any[]
      }
    }
  }

  return []
}

async function omieCall(token: string, payload: any) {
  const resp = await fetch(`${BACKEND_URL}/api/omie/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const body: any = await resp.json()
  return { status: resp.status, body }
}

async function main() {
  console.log('=== RECONCILIAÇÃO DE CÓDIGOS OMIE ===')

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: GERENTE_EMAIL,
    password: GERENTE_SENHA,
  })
  if (authErr || !authData.session) {
    throw new Error(`Login falhou: ${authErr?.message || 'sem sessão'}`)
  }
  const token = authData.session.access_token

  const { data: produtosCRM, error } = await supabase
    .from('produtos')
    .select('id, nome, omie_codigo')
    .not('omie_codigo', 'is', null)
    .order('id', { ascending: true })

  if (error) throw error

  const items = (produtosCRM || []) as ProdutoCRM[]
  console.log(`Produtos CRM com omie_codigo: ${items.length}`)

  const results: MatchResult[] = []

  for (const p of items) {
    const codigoAtual = String(p.omie_codigo || '').trim()
    const codigoNum = Number(codigoAtual)

    let okInterno = false
    if (!Number.isNaN(codigoNum) && codigoAtual !== '') {
      const consult = await omieCall(token, {
        group: 'vendas',
        module: 'produtos',
        action: 'consultar',
        params: { codigo_produto: codigoNum },
      })

      if (consult.status === 200 && consult.body?.success && consult.body?.data?.codigo_produto) {
        const d = consult.body.data
        results.push({
          id: p.id,
          nome: p.nome,
          omie_codigo_atual: p.omie_codigo,
          status: 'ok_codigo_produto',
          codigo_produto_api: String(d.codigo_produto),
          codigo_ui: d.codigo ? String(d.codigo) : null,
          descricao_omie: d.descricao || null,
        })
        okInterno = true
      }
    }

    if (okInterno) continue

    const search = await omieCall(token, {
      group: 'vendas',
      module: 'produtos',
      action: 'listar',
      params: { pagina: 1, registros_por_pagina: 200, filtrar_apenas_descricao: p.nome },
    })

    if (!(search.status === 200 && search.body?.success)) {
      results.push({
        id: p.id,
        nome: p.nome,
        omie_codigo_atual: p.omie_codigo,
        status: 'nao_encontrado',
        codigo_produto_api: null,
        codigo_ui: null,
        descricao_omie: null,
      })
      continue
    }

    const encontrados = extractProdutosFromAnyPayload(search.body.data)
    const nomeNorm = normalize(p.nome)

    const match = encontrados.find((x: any) => {
      const codigoProd = String(x?.codigo_produto || '')
      const codigoUi = String(x?.codigo || '')
      const codigoInt = String(x?.codigo_produto_integracao || '')
      const desc = normalize(x?.descricao)
      return (
        codigoProd === codigoAtual ||
        codigoUi === codigoAtual ||
        codigoInt === codigoAtual ||
        (desc.length > 0 && desc === nomeNorm)
      )
    })

    if (match?.codigo_produto) {
      results.push({
        id: p.id,
        nome: p.nome,
        omie_codigo_atual: p.omie_codigo,
        status: 'resolvido_por_busca',
        codigo_produto_api: String(match.codigo_produto),
        codigo_ui: match.codigo ? String(match.codigo) : null,
        descricao_omie: match.descricao || null,
      })
    } else {
      results.push({
        id: p.id,
        nome: p.nome,
        omie_codigo_atual: p.omie_codigo,
        status: 'nao_encontrado',
        codigo_produto_api: null,
        codigo_ui: null,
        descricao_omie: null,
      })
    }
  }

  const ok = results.filter((r) => r.status === 'ok_codigo_produto').length
  const resolved = results.filter((r) => r.status === 'resolvido_por_busca').length
  const missing = results.filter((r) => r.status === 'nao_encontrado').length

  console.log(`OK interno: ${ok}`)
  console.log(`Resolvidos por busca: ${resolved}`)
  console.log(`Não encontrados: ${missing}`)

  const updates = results.filter(
    (r) => (r.status === 'resolvido_por_busca' || r.status === 'ok_codigo_produto') && r.codigo_produto_api && String(r.omie_codigo_atual) !== String(r.codigo_produto_api)
  )

  const sqlLines = [
    '-- Gerado por scripts/reconciliar-codigos-omie.ts',
    '-- Atualiza produtos.omie_codigo para codigo_produto (ID interno da API Omie)',
    'BEGIN;',
    ...updates.map((u) => `UPDATE produtos SET omie_codigo = '${u.codigo_produto_api}' WHERE id = ${u.id};`),
    'COMMIT;',
    '',
  ]

  const outDir = path.resolve('scripts', 'output')
  await fs.mkdir(outDir, { recursive: true })

  await fs.writeFile(path.join(outDir, 'reconciliacao-codigos-omie.json'), JSON.stringify({ summary: { ok, resolved, missing, total: results.length }, results }, null, 2), 'utf8')
  await fs.writeFile(path.join(outDir, 'reconciliacao-codigos-omie.sql'), sqlLines.join('\n'), 'utf8')

  console.log(`Arquivo JSON: ${path.join(outDir, 'reconciliacao-codigos-omie.json')}`)
  console.log(`Arquivo SQL: ${path.join(outDir, 'reconciliacao-codigos-omie.sql')}`)

  await supabase.auth.signOut()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
