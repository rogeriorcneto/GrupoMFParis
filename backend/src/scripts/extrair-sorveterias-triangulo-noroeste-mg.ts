import * as XLSX from 'xlsx'
import * as fs from 'fs/promises'
import * as path from 'path'

const INPUT_FILE = 'C:\\Users\\Rogério\\Downloads\\leads_por_estado (1).xlsx'
const OUTPUT_FILE = 'C:\\Users\\Rogério\\gm paris\\sorveterias_triangulo_noroeste_mg.xlsx'

const TRIANGULO_NORTE = `
Araguari, Araporã, Cachoeira Dourada, Campina Verde, Canápolis, Capinópolis, Carneirinho, Cascalho Rico, Centralina, Comendador Gomes, Estrela do Sul, Fronteira, Frutal, Grupiara, Gurinhatã, Indianópolis, Ipiaçu, Itapagipe, Ituiutaba, Iturama, Limeira do Oeste, Monte Alegre de Minas, Monte Carmelo, Prata, Romaria, Santa Vitória, Tupaciguara, Uberlândia, União de Minas, Água Comprida, Aramina, Conceição das Alagoas, Conquista, Delta, Planura, Veríssimo
`

const TRIANGULO_SUL = `
Araxá, Campos Altos, Ibiá, Pedrinópolis, Perdizes, Pratinha, Sacramento, Santa Juliana, Tapira, Uberaba, Água Comprida, Campo Florido, Conceição das Alagoas, Conquista, Delta, Veríssimo, Fronteira, Frutal, Itapagipe, Pirajuba, Planura, São Francisco de Sales, Comendador Gomes, Iturama, Limeira do Oeste, Carneirinho, União de Minas, Campina Verde, Prata, Arapuá, Nova Ponte
`

const NOROESTE_MG = `
Arinos, Bonfinópolis de Minas, Brasilândia de Minas, Buritis, Cabeceira Grande, Dom Bosco, Formoso, Guarda-Mor, João Pinheiro, Lagamar, Lagoa Grande, Natalândia, Paracatu, Presidente Olegário, Riachinho, Santa Fé de Minas, Santo Antônio do Retiro, São Gonçalo do Abaeté, São Romão, Unaí, Uruana de Minas, Urucuia, Vazante, Varjão de Minas, Chapada Gaúcha, Pintópolis, Bonito de Minas, Cônego Marinho, Juvenília, Miravânia
`

function normalize(s: string): string {
  return s
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
}

function buildCitySet(text: string): Set<string> {
  const set = new Set<string>()
  const tokens = text.split(/,|\n/)
  for (const raw of tokens) {
    const t = normalize(raw)
    if (!t) continue
    set.add(t)
  }
  return set
}

const citiesSet = buildCitySet(TRIANGULO_NORTE + '\n' + TRIANGULO_SUL + '\n' + NOROESTE_MG)

function findHeader(h: string, headers: string[]): number {
  return headers.findIndex(x => normalize(x) === normalize(h))
}
function findHeaderLike(partial: string, headers: string[]): number {
  return headers.findIndex(x => normalize(x).includes(normalize(partial)))
}

function isSorveteria(row: any[], headers: string[]): boolean {
  const idxCnae = findHeader('cnae', headers)
  const idxSegmento = findHeaderLike('segmento', headers)
  const vals = [
    idxCnae >= 0 ? row[idxCnae] : '',
    idxSegmento >= 0 ? row[idxSegmento] : '',
  ]
  for (const v of vals) {
    if (v == null) continue
    const s = normalize(v)
    const nums = s.replace(/\D/g, '')
    if (nums === '1053800' || s.includes('SORVETE')) return true
  }
  return false
}

async function processState(workbook: XLSX.WorkBook, uf: string): Promise<{ headers: string[], rows: any[] }> {
  const sheetName = workbook.SheetNames.find(n => n.toUpperCase() === uf)
  if (!sheetName) {
    console.log(`Aba "${uf}" não encontrada.`)
    return { headers: [], rows: [] }
  }
  const sheet = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (rows.length < 2) return { headers: [], rows: [] }

  const headers: string[] = rows[0].map((h: any) => String(h || ''))
  const idxMun = findHeader('municipio', headers) >= 0 ? findHeader('municipio', headers) : findHeaderLike('municipio', headers)
  const idxCidade = findHeader('cidade', headers) >= 0 ? findHeader('cidade', headers) : findHeaderLike('cidade', headers)
  const municipioIndex = idxMun >= 0 ? idxMun : idxCidade

  if (municipioIndex < 0) {
    console.log(`Coluna de município não encontrada na aba ${uf}.`)
    return { headers, rows: [] }
  }

  const out: any[] = []
  let totalSorv = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!isSorveteria(row, headers)) continue
    totalSorv++
    const mun = row[municipioIndex]
    if (!mun) continue
    const munNorm = normalize(mun)
    if (!citiesSet.has(munNorm)) continue
    out.push(row)
  }
  console.log(`[${uf}] Sorveterias no estado: ${totalSorv} — nos municípios filtrados: ${out.length}`)
  return { headers, rows: out }
}

async function main() {
  console.log(`Lendo ${INPUT_FILE}...`)
  const buf = await fs.readFile(INPUT_FILE)
  const workbook = XLSX.read(buf, { type: 'buffer' })

  const mg = await processState(workbook, 'MG')

  const wb = XLSX.utils.book_new()

  if (mg.headers.length) {
    const wsMG = XLSX.utils.aoa_to_sheet([mg.headers, ...mg.rows])
    XLSX.utils.book_append_sheet(wb, wsMG, 'Sorveterias MG')
  }

  const outDir = path.dirname(OUTPUT_FILE)
  await fs.mkdir(outDir, { recursive: true })
  XLSX.writeFile(wb, OUTPUT_FILE)
  console.log(`\nArquivo salvo: ${OUTPUT_FILE}`)
  console.log(`Total geral: MG=${mg.rows.length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
