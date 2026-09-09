import * as XLSX from 'xlsx'
import * as fs from 'fs/promises'
import * as path from 'path'

const INPUT_FILE = 'C:\\Users\\Rogério\\Downloads\\leads_por_estado.xlsx'
const OUTPUT_FILE = 'C:\\Users\\Rogério\\gm paris\\sorveterias_norte_mg_go.xlsx'

const NORTE_NOROESTE_MG = `
Águas Vermelhas, Berizal, Bocaiuva, Bonito de Minas, Botumirim, Brasília de Minas, Buritizeiro, Campo Azul, Capitão Enéas, Catuti, Chapada Gaúcha, Claro dos Poções, Cônego Marinho, Coração de Jesus, Cristália, Curral de Dentro, Divisa Alegre, Engenheiro Navarro, Espinosa, Francisco Dumont, Francisco Sá, Fruta de Leite, Gameleiras, Glaucilândia, Grão Mogol, Guaraciama, Ibiaí, Ibiracatu, Icaraí de Minas, Indaiabira, Itacambira, Itacarambi, Jaíba, Janaúba, Januária, Japonvar, Jequitaí, Josenópolis, Juramento, Juvenília, Lagoa dos Patos, Lassance, Lontra, Luislândia, Mamonas, Manga, Matias Cardoso, Mato Verde, Mirabela, Miravânia, Montalvânia, Monte Azul, Montes Claros, Montezuma, Ninheira, Nova Porteirinha, Novorizonte, Olhos-d'Água, Padre Carvalho, Pai Pedro, Patis, Pedras de Maria da Cruz, Pintópolis, Pirapora, Ponto Chique, Porteirinha, Riachinho, Riacho dos Machados, Rio Pardo de Minas, Rubelita, Salinas, Santa Cruz de Salinas, Santa Fé de Minas, Santo Antônio do Retiro, São Francisco, São João da Lagoa, São João da Ponte, São João das Missões, São João do Pacuí, São João do Paraíso, São Romão, Serranópolis de Minas, Taiobeiras, Ubaí, Urucuia, Vargem Grande do Rio Pardo, Várzea da Palma, Varzelândia, Verdelândia,
Arinos, Bonfinópolis de Minas, Brasilândia de Minas, Buritis, Cabeceira Grande, Dom Bosco, Formoso, Guarda-Mor, João Pinheiro, Lagoa Grande, Natalândia, Paracatu, Presidente Olegário, Unaí, Uruana de Minas, Vazante
`

const GOIAS_REGIOES = `
Abadiânia, Água Fria de Goiás, Águas Lindas de Goiás, Alexânia, Cabeceiras, Cidade Ocidental, Cocalzinho de Goiás, Corumbá de Goiás, Cristalina, Formosa, Luziânia, Mimoso de Goiás, Novo Gama, Padre Bernardo, Pirenópolis, Planaltina, Santo Antônio do Descoberto, Valparaíso de Goiás, Vila Boa, Vila Propício,
Alvorada do Norte, Buritinópolis, Damianópolis, Divinópolis de Goiás, Flores de Goiás, Guarani de Goiás, Iaciara, Mambaí, Posse, São Domingos, Simolândia, Sítio d'Abadia,
Alto Horizonte, Amaralina, Bonópolis, Campinaçu, Campinorte, Campos Verdes, Crixás, Estrela do Norte, Mara Rosa, Minaçu, Montividiu do Norte, Mozarlândia, Mundo Novo, Mutunópolis, Niquelândia, Nova Crixás, Nova Iguaçu de Goiás, Novo Planalto, Porangatu, Santa Tereza de Goiás, Santa Terezinha de Goiás, São Miguel do Araguaia, Trombas, Uirapuru, Uruaçu,
Araçu, Araguapaz, Aruanã, Faina, Goiás, Guaraíta, Heitoraí, Itaberaí, Itaguari, Itaguaru, Itapuranga, Itauçu, Matrinchã,
Anápolis, Barro Alto, Campo Limpo de Goiás, Carmo do Rio Verde, Ceres, Damolândia, Goianésia, Guarinos, Hidrolina, Ipiranga de Goiás, Itapaci, Jaraguá, Jesúpolis, Morro Agudo de Goiás, Nova América, Nova Glória, Ouro Verde de Goiás, Petrolina de Goiás, Pilar de Goiás, Rialma, Rianápolis, Rubiataba, Santa Isabel, Santa Rita do Novo Destino, Santa Rosa de Goiás, São Francisco de Goiás, São Luiz do Norte, São Patrício, Taquaral de Goiás, Uruana, Vila Propício
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

const citiesMG = buildCitySet(NORTE_NOROESTE_MG)
const citiesGO = buildCitySet(GOIAS_REGIOES)

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

async function processState(workbook: XLSX.WorkBook, uf: string, citySet: Set<string>): Promise<{ headers: string[], rows: any[] }> {
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
    if (!citySet.has(munNorm)) continue
    out.push(row)
  }
  console.log(`[${uf}] Sorveterias no estado: ${totalSorv} — nos municípios filtrados: ${out.length}`)
  return { headers, rows: out }
}

async function main() {
  console.log(`Lendo ${INPUT_FILE}...`)
  const buf = await fs.readFile(INPUT_FILE)
  const workbook = XLSX.read(buf, { type: 'buffer' })

  const mg = await processState(workbook, 'MG', citiesMG)
  const go = await processState(workbook, 'GO', citiesGO)

  const wb = XLSX.utils.book_new()

  if (mg.headers.length) {
    const wsMG = XLSX.utils.aoa_to_sheet([mg.headers, ...mg.rows])
    XLSX.utils.book_append_sheet(wb, wsMG, 'Sorveterias MG')
  }
  if (go.headers.length) {
    const wsGO = XLSX.utils.aoa_to_sheet([go.headers, ...go.rows])
    XLSX.utils.book_append_sheet(wb, wsGO, 'Sorveterias GO')
  }

  const outDir = path.dirname(OUTPUT_FILE)
  await fs.mkdir(outDir, { recursive: true })
  XLSX.writeFile(wb, OUTPUT_FILE)
  console.log(`\nArquivo salvo: ${OUTPUT_FILE}`)
  console.log(`Total geral: MG=${mg.rows.length} | GO=${go.rows.length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
