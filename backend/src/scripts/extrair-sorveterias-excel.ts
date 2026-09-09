import * as XLSX from 'xlsx'
import * as fs from 'fs/promises'
import * as path from 'path'

const INPUT_FILE = 'C:\\Users\\Rogério\\Downloads\\leads_por_estado.xlsx'
const OUTPUT_FILE = 'C:\\Users\\Rogério\\gm paris\\sorveterias_mg_zonas.xlsx'

const MUNICIPIOS_TEXTO = `Zona da Mata

Abre Campo, Acaiaca, Além Paraíba, Alto Caparaó, Alto Jequitibá, Alto Rio Doce, Amparo da Serra, Antônio Prado de Minas, Aracitaba, Araponga, Argirita, Astolfo Dutra, Barão de Monte Alto, Belmiro Braga, Bias Fortes, Bicas, Brás Pires, Caiana, Cajuri, Canaã, Caparaó, Caputira, Carangola, Chácara, Chalé, Chiador, Cipotânea, Coimbra, Coronel Pacheco, Descoberto, Diogo de Vasconcelos, Divinésia, Divino, Dom Silvério, Dona Euzébia, Dores do Turvo, Durandé, Ervália, Espera Feliz, Estrela Dalva, Eugenópolis, Ewbank da Câmara, Faria Lemos, Fervedouro, Goianá, Guaraciaba, Guarani, Guarará, Guidoval, Guiricema, Itamarati de Minas, Jequeri, Juiz de Fora, Lajinha, Laranjal, Leopoldina, Lima Duarte, Luisburgo, Manhuaçu, Manhumirim, Mar de Espanha, Maripá de Minas, Martins Soares, Matias Barbosa, Matipó, Mercês, Miradouro, Miraí, Muriaé, Olaria, Oratórios, Paiva, Palma, Patrocínio do Muriaé, Paula Cândido, Pedra Bonita, Pedra do Anta, Pedra Dourada, Pedro Teixeira, Pequeri, Piau, Piedade de Ponte Nova, Piraúba, Pirapetinga, Ponte Nova, Porto Firme, Raul Soares, Recreio, Reduto, Rio Casca, Rio Doce, Rio Espera, Rio Novo, Rio Pomba, Rio Preto, Rochedo de Minas, Rodeiro, Rosário da Limeira, Santa Bárbara do Monte Verde, Santa Cruz do Escalvado, Santa Margarida, Santa Rita de Ibitipoca, Santana de Cataguases, Santana do Deserto, Santana do Manhuaçu, Santo Antônio do Aventureiro, Santos Dumont, São Francisco do Glória, São Geraldo, São João do Manhuaçu, São João Nepomuceno, São José do Mantimento, São Miguel do Anta, São Pedro dos Ferros, São Sebastião da Vargem Alegre, Sem-Peixe, Senador Cortes, Senador Firmino, Sericita, Silveirânia, Simonésia, Tabuleiro, Teixeiras, Tocantins, Tombos, Ubá, Urucânia, Vermelho Novo, Viçosa, Vieiras, Visconde do Rio Branco e Volta Grande. 

Vale do Rio Doce

Açucena, Aimorés, Alpercata, Alvarenga, Antônio Dias, Belo Oriente, Bom Jesus do Galho, Braúnas, Bugre, Campanário, Cantagalo, Capitão Andrade, Caratinga, Central de Minas, Coluna, Conselheiro Pena, Coroaci, Coronel Fabriciano, Córrego Novo, Cuparaque, Divino das Laranjeiras, Divinolândia de Minas, Dom Cavati, Engenheiro Caldas, Fernandes Tourinho, Frei Inocêncio, Galileia, Goiabeira, Gonzaga, Governador Valadares, Iapu, Inhapim, Ipaba, Ipatinga, Itabira, Itambacuri, Itanhomi, Jampruca, Joanésia, José Raydan, Marilac, Marliéria, Materlândia, Mathias Lobato, Mesquita, Naque, Nacip Raydan, Nova Belém, Nova Era, Nova Módica, Pescador, Peçanha, Periquito, Resplendor, Rio Piracicaba, Sabinópolis, Santa Bárbara do Leste, Santa Efigênia de Minas, Santa Maria de Itabira, Santa Rita de Minas, Santana do Paraíso, São Domingos das Dores, São Geraldo da Piedade, São Geraldo do Baixio, São João do Oriente, São João Evangelista, São José da Safira, São José do Goiabal, São José do Jacuri, São Pedro do Suaçuí, São Sebastião do Anta, Sardoá, Senhora do Porto, Serra Azul de Minas, Tarumirim, Timóteo, Tumiritinga, Ubaporanga, Vargem Alegre, Virginópolis e Virgolândia. 

Vale do Mucuri

Águas Formosas, Bertópolis, Carlos Chagas, Catuji, Crisólita, Fronteira dos Vales, Itaipé, Ladainha, Machacalis, Malacacheta, Nanuque, Ouro Verde de Minas, Pavão, Poté, Serra dos Aimorés, Setubinha, Teófilo Otoni e Umburatiba. 

Vale do Jequitinhonha

Almenara, Angelândia, Araçuaí, Aricanduva, Bandeira, Berilo, Cachoeira de Pajeú, Capelinha, Caraí, Carbonita, Chapada do Norte, Comercinho, Coronel Murta, Couto de Magalhães de Minas, Datas, Diamantina, Felício dos Santos, Francisco Badaró, Gouveia, Itaobim, Itinga, Jacinto, Jequitinhonha, Jenipapo de Minas, Joaíma, Jordânia, José Gonçalves de Minas, Leme do Prado, Mata Verde, Medina, Minas Novas, Monte Formoso, Novo Cruzeiro, Padre Paraíso, Palmópolis, Pedra Azul, Ponto dos Volantes, Presidente Kubitschek, Rio do Prado, Rubelita, Salto da Divisa, Santa Maria do Salto, Santo Antônio do Jacinto, Senador Modestino Gonçalves, Turmalina, Veredinha e Virgem da Lapa.`

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

const EXCLUIR = new Set([
  '',
  'ZONA DA MATA',
  'VALE DO RIO DOCE',
  'VALE DO MUCURI',
  'VALE DO JEQUITINHONHA',
])

const citySet = new Set<string>()
const tokens = MUNICIPIOS_TEXTO.split(/,|\n|\s+e\s+/i)
for (const raw of tokens) {
  const t = normalize(raw)
  if (EXCLUIR.has(t)) continue
  citySet.add(t)
}

function findHeader(h: string, headers: string[]): number {
  const idx = headers.findIndex(x => normalize(x) === normalize(h))
  return idx
}

function findHeaderLike(partial: string, headers: string[]): number {
  const idx = headers.findIndex(x => normalize(x).includes(normalize(partial)))
  return idx
}

function isSorveteria(row: any[], headers: string[]): boolean {
  const idxCnae = findHeader('cnae', headers)
  const idxSubclasse = findHeaderLike('subclasse', headers)
  const idxAtividade = findHeaderLike('atividade', headers)
  const idxRamo = findHeaderLike('ramo', headers)
  const idxSegmento = findHeaderLike('segmento', headers)

  const vals = [
    idxCnae >= 0 ? row[idxCnae] : '',
    idxSubclasse >= 0 ? row[idxSubclasse] : '',
    idxAtividade >= 0 ? row[idxAtividade] : '',
    idxRamo >= 0 ? row[idxRamo] : '',
    idxSegmento >= 0 ? row[idxSegmento] : '',
  ]

  for (const v of vals) {
    if (v == null) continue
    const s = normalize(v)
    const nums = s.replace(/\D/g, '')
    // CNAE exato/fabricação de sorvetes
    if (nums === '1053800' || s.includes('SORVETE') || s.includes('FABRICACAO DE SORVETES') || s.includes('FABRICACAO DE MASSAS E SORVETES') || s.includes('SORVETES')) return true
  }
  return false
}

async function main() {
  console.log(`Lendo ${INPUT_FILE}...`)
  const buf = await fs.readFile(INPUT_FILE)
  const workbook = XLSX.read(buf, { type: 'buffer' })
  console.log('Abas:', workbook.SheetNames)

  const sheetName = workbook.SheetNames.find(n => n.toUpperCase() === 'MG') || workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  console.log(`Aba selecionada: "${sheetName}" — total de linhas: ${rows.length}`)
  if (rows.length < 2) {
    console.log('Aba vazia ou sem dados.')
    return
  }

  const headers: string[] = rows[0].map((h: any) => String(h || ''))
  console.log('Colunas:', headers.join(' | '))

  const idxMun = findHeader('municipio', headers) >= 0
    ? findHeader('municipio', headers)
    : findHeaderLike('municipio', headers)
  const idxCidade = findHeader('cidade', headers) >= 0
    ? findHeader('cidade', headers)
    : findHeaderLike('cidade', headers)
  const idxUf = findHeader('uf', headers) >= 0
    ? findHeader('uf', headers)
    : findHeaderLike('uf', headers)

  if (idxMun < 0 && idxCidade < 0) {
    console.error('Coluna de município/cidade não encontrada.')
    return
  }

  const municipioIndex = idxMun >= 0 ? idxMun : idxCidade

  const outRows: any[] = [headers]
  let totalSorveterias = 0
  let fora = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!isSorveteria(row, headers)) continue
    totalSorveterias++

    const uf = idxUf >= 0 ? normalize(row[idxUf]) : ''
    if (uf && uf !== 'MG' && uf !== 'MINAS GERAIS') {
      fora++
      continue
    }

    const municipio = row[municipioIndex]
    if (!municipio) continue
    const munNorm = normalize(municipio)
    if (!citySet.has(munNorm)) continue

    outRows.push(row)
  }

  console.log(`Total de sorveterias no arquivo: ${totalSorveterias}`)
  console.log(`Fora de MG (ignorados): ${fora}`)
  console.log(`Sorveterias nos municípios filtrados: ${outRows.length - 1}`)

  const ws = XLSX.utils.aoa_to_sheet(outRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sorveterias MG')

  const outDir = path.dirname(OUTPUT_FILE)
  await fs.mkdir(outDir, { recursive: true })
  XLSX.writeFile(wb, OUTPUT_FILE)
  console.log(`Arquivo salvo: ${OUTPUT_FILE}`)
}

main().catch(err => { console.error(err); process.exit(1) })
