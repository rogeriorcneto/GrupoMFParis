/**
 * fix-municipios.cjs
 * Converte códigos MUNIC da Receita Federal para nomes de municípios
 * na tabela leads_rf do Supabase.
 *
 * Fontes:
 *  1. Tabela TSE (cobre códigos > 1000)
 *  2. API IBGE (cobre todos os municípios por UF, para cruzar sequencialmente)
 *
 * Uso: railway run -- node scripts/fix-municipios.cjs
 */

const { createClient } = require('@supabase/supabase-js')
const https = require('https')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch(e) { reject(e) } })
    }).on('error', reject)
  })
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

async function buildMap() {
  const map = new Map()

  // ── 1. Tenta baixar Municipios.zip da Receita Federal ────────────────────
  const rfUrls = [
    'https://dadosabertos.rfb.gov.br/CNPJ/Municipios.zip',
    'https://dadosabertos.rfb.gov.br/CNPJ/dados/Municipios.zip',
  ]
  let rfLoaded = false
  for (const url of rfUrls) {
    try {
      console.log(`📥 Tentando RF: ${url}`)
      const AdmZip = require('adm-zip')
      const buf = await fetchBuffer(url)
      const zip = new AdmZip(buf)
      const entry = zip.getEntries().find(e => /municipio/i.test(e.entryName))
      if (entry) {
        const csv = entry.getData().toString('latin1')
        for (const line of csv.split('\n')) {
          const [cod, nome] = line.split(';').map(s => s.trim().replace(/^"|"$/g, ''))
          if (cod && nome && /^\d+$/.test(cod)) {
            map.set(cod, nome.toUpperCase())
            map.set(cod.padStart(4, '0'), nome.toUpperCase())
          }
        }
        console.log(`  ✅ ${map.size / 2} municípios RF carregados`)
        rfLoaded = true
        break
      }
    } catch (e) {
      console.log(`  ⚠️  Falhou: ${e.message}`)
    }
  }

  // ── 2. Fallback: Tabela TSE (cobre a maioria dos códigos > 1000) ──────────
  if (!rfLoaded || map.size < 100) {
    console.log('📥 Carregando tabela TSE como fallback...')
    const tseData = await fetchJson(
      'https://raw.githubusercontent.com/betafcc/Municipios-Brasileiros-TSE/master/municipios_brasileiros_tse.json'
    )
    for (const m of tseData) {
      const cod = String(m.codigo_tse)
      const nome = m.nome_municipio
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
      if (!map.has(cod))        map.set(cod, nome)
      if (!map.has(cod.padStart(4, '0'))) map.set(cod.padStart(4, '0'), nome)
    }
    console.log(`  ✅ ${tseData.length} municípios TSE adicionados`)
  }

  // ── 3. Para códigos ainda pendentes, usa API IBGE por UF ────────────────
  // Coleta pares código→UF ainda sem nome
  console.log('🔍 Coletando códigos pendentes...')
  const pending = new Map()
  let pg = 0
  while (true) {
    const { data } = await supabase.from('leads_rf')
      .select('municipio,uf').range(pg * 1000, (pg + 1) * 1000 - 1)
    if (!data || data.length === 0) break
    for (const r of data) {
      if (r.municipio && /^\d{1,6}$/.test(r.municipio) && !map.has(r.municipio)) {
        if (!pending.has(r.municipio)) pending.set(r.municipio, new Set())
        if (r.uf) pending.get(r.municipio).add(r.uf)
      }
    }
    if (data.length < 1000) break
    pg++
  }
  console.log(`  ${pending.size} códigos pendentes após TSE`)

  if (pending.size > 0) {
    // Coleta UFs únicas com pendências
    const ufs = new Set()
    for (const v of pending.values()) v.forEach(u => ufs.add(u))

    for (const uf of ufs) {
      try {
        const munis = await fetchJson(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`
        )
        // Códigos RF para esta UF, em ordem numérica crescente
        // A RF atribui os códigos em ordem alfabética de município por UF
        const codsUf = [...pending.entries()]
          .filter(([, us]) => us.has(uf))
          .map(([c]) => c)
          .sort((a, b) => parseInt(a) - parseInt(b))

        for (let i = 0; i < codsUf.length && i < munis.length; i++) {
          const nome = munis[i].nome
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
          map.set(codsUf[i], nome)
        }
        process.stdout.write(`  ${uf}(${codsUf.length}) `)
      } catch (e) {
        console.warn(`  ⚠️  ${uf}: ${e.message}`)
      }
    }
    console.log()
  }

  return map
}

async function main() {
  const map = await buildMap()
  console.log(`\n📋 Total no mapa: ${map.size} entradas`)

  // Busca todos os códigos numéricos únicos ainda na tabela
  const allCods = new Set()
  let page = 0
  while (true) {
    const { data } = await supabase.from('leads_rf')
      .select('municipio')
      .range(page * 1000, (page + 1) * 1000 - 1)
    if (!data || data.length === 0) break
    for (const r of data) {
      if (r.municipio && /^\d+$/.test(r.municipio)) allCods.add(r.municipio)
    }
    if (data.length < 1000) break
    page++
  }

  console.log(`\n🔄 Atualizando ${allCods.size} códigos únicos...`)
  let ok = 0, skip = 0
  for (const cod of allCods) {
    const nome = map.get(cod)
    if (!nome) { skip++; continue }
    const { error } = await supabase.from('leads_rf')
      .update({ municipio: nome })
      .eq('municipio', cod)
    if (error) { console.error(`Erro ${cod}:`, error.message) }
    else { process.stdout.write('.'); ok++ }
  }
  console.log(`\n\n✅ ${ok} convertidos, ${skip} não encontrados`)
}

main().catch(console.error)
