import * as XLSX from 'xlsx'
import * as fs from 'fs/promises'
import * as path from 'path'

const INPUT_FILE = 'C:\\Users\\Rogério\\gm paris\\sorveterias_triangulo_noroeste_mg.xlsx'
const OUTPUT_FILE = 'C:\\Users\\Rogério\\gm paris\\sorveterias_exclusivas_triangulo_noroeste_mg.xlsx'

function normalize(s: string): string {
  return s
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function findHeaderLike(partial: string, headers: string[]): number {
  return headers.findIndex(x => normalize(x).includes(normalize(partial)))
}

function isSorveteriaExclusiva(row: any[], headers: string[]): boolean {
  const idxSegmento = findHeaderLike('segmento', headers)
  const idxRamo = findHeaderLike('ramo', headers)
  const idxCnae = findHeaderLike('cnae', headers)
  const idxRazao = findHeaderLike('razao', headers)

  const vals = [
    idxSegmento >= 0 ? row[idxSegmento] : '',
    idxRamo >= 0 ? row[idxRamo] : '',
    idxCnae >= 0 ? row[idxCnae] : '',
    idxRazao >= 0 ? row[idxRazao] : '',
  ]

  for (const v of vals) {
    if (v == null) continue
    const s = normalize(v)
    if (s.includes('SORVETERIA') || s.includes('FABR. SORVETE') || s.includes('FABRICA DE SORVETE')) return true
  }
  return false
}

async function main() {
  console.log(`Lendo ${INPUT_FILE}...`)
  const buf = await fs.readFile(INPUT_FILE)
  const workbook = XLSX.read(buf, { type: 'buffer' })

  const wb = XLSX.utils.book_new()

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (rows.length < 2) continue

    const headers: string[] = rows[0].map((h: any) => String(h || ''))
    const out: any[] = [headers]

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (isSorveteriaExclusiva(row, headers)) {
        out.push(row)
      }
    }

    if (out.length > 1) {
      const ws = XLSX.utils.aoa_to_sheet(out)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      console.log(`[${sheetName}] Registros filtrados: ${out.length - 1}`)
    }
  }

  const outDir = path.dirname(OUTPUT_FILE)
  await fs.mkdir(outDir, { recursive: true })
  XLSX.writeFile(wb, OUTPUT_FILE)
  console.log(`\nArquivo salvo: ${OUTPUT_FILE}`)
}

main().catch(err => { console.error(err); process.exit(1) })
