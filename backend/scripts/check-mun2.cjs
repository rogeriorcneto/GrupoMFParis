const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const { data } = await s.from('leads_rf')
    .select('municipio,uf,razao_social')
    .order('municipio')
    .limit(500)

  const seen = new Map()
  for (const r of data || []) {
    if (/^\d{4}$/.test(r.municipio) && !seen.has(r.municipio)) {
      seen.set(r.municipio, { uf: r.uf, empresa: r.razao_social?.substring(0,35) })
    }
  }
  const sorted = [...seen.entries()].sort((a,b) => a[0].localeCompare(b[0]))
  for (const [cod, info] of sorted) {
    console.log(`${cod}\t${info.uf}\t${info.empresa}`)
  }
  console.log(`\nTotal únicos: ${sorted.length}`)
}
main().catch(console.error)
