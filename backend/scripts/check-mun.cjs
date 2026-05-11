const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Pega todos os registros com código de 4 dígitos, agrupados por código+uf
  const { data } = await s.from('leads_rf')
    .select('municipio,uf,razao_social,municipio_cod')
    .not('municipio_cod', 'is', null)
    .order('municipio_cod')
    .limit(300)

  // Mostra pares únicos codigo -> uf com exemplo de empresa
  const seen = new Map()
  for (const r of data || []) {
    if (!seen.has(r.municipio_cod)) {
      seen.set(r.municipio_cod, { uf: r.uf, atual: r.municipio, empresa: r.razao_social })
    }
  }
  const sorted = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [cod, info] of sorted) {
    console.log(`${cod} | ${info.uf} | atual="${info.atual}" | ex: ${info.empresa?.substring(0,40)}`)
  }
}
main().catch(console.error)
