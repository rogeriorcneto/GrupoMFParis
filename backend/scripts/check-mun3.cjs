const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Busca apenas registros onde municipio é numérico de 4 dígitos (ainda não convertido)
  const seen = new Map()
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await s.from('leads_rf')
      .select('municipio,uf,razao_social')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) { console.error(error); break }
    if (!data || data.length === 0) break

    for (const r of data) {
      if (/^\d{4}$/.test(r.municipio) && !seen.has(r.municipio)) {
        seen.set(r.municipio, { uf: r.uf, empresa: r.razao_social?.substring(0,35) })
      }
    }
    if (data.length < pageSize) break
    page++
    process.stdout.write(`\r  página ${page+1}, ${seen.size} códigos únicos...`)
  }
  console.log()

  const sorted = [...seen.entries()].sort((a,b) => a[0].localeCompare(b[0]))
  for (const [cod, info] of sorted) {
    console.log(`${cod}\t${info.uf}\t${info.empresa}`)
  }
  console.log(`\nTotal únicos: ${sorted.length}`)
}
main().catch(console.error)
