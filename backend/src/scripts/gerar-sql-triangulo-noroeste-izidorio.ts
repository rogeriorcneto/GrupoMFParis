import * as XLSX from 'xlsx'
import * as fs from 'fs/promises'
import { supabase } from '../supabase.js'

const INPUT_FILE = 'C:\\Users\\Rogério\\gm paris\\sorveterias_triangulo_noroeste_mg.xlsx'
const OUTPUT_SQL = 'C:\\Users\\Rogério\\gm paris\\insert_sorveterias_triangulo_noroeste_izidorio.sql'
const VENDEDOR_EMAIL = 'izidorio_izi_kn@hotmail.com'

function normalizeCnpj(cnpj: string): string {
  return (cnpj || '').toString().replace(/\D/g, '')
}

function fmtCep(cep: string): string | undefined {
  const c = (cep || '').toString().replace(/\D/g, '')
  return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : (cep || undefined)
}

function sqlStr(v: any): string {
  if (v === null || v === undefined || v === '') return 'NULL'
  return `'${v.toString().replace(/'/g, "''")}'`
}

async function main() {
  console.log('Buscando vendedor Izidório...')
  const { data: vendedor, error: vErr } = await supabase
    .from('vendedores')
    .select('id, nome, email')
    .eq('email', VENDEDOR_EMAIL)
    .single()

  if (vErr || !vendedor) {
    console.error('Vendedor não encontrado:', vErr?.message)
    process.exit(1)
  }
  console.log(`Vendedor: ${vendedor.nome} (id ${vendedor.id})`)

  const { data: existentes } = await supabase.from('clientes').select('cnpj')
  const cnpjsExistentes = new Set((existentes || []).map(c => normalizeCnpj(c.cnpj)))

  const buf = await fs.readFile(INPUT_FILE)
  const workbook = XLSX.read(buf, { type: 'buffer' })

  const hoje = new Date().toISOString().split('T')[0]
  const valuesList: string[] = []
  const seen = new Set<string>()
  let totalDuplicados = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (rows.length < 2) continue

    const headers: string[] = rows[0].map((h: any) => String(h || '').toUpperCase())
    const idx = (name: string) => headers.indexOf(name)

    const iCnpj = idx('CNPJ')
    const iRazao = idx('RAZAO_SOCIAL')
    const iFantasia = idx('NOME_FANTASIA')
    const iCnae = idx('CNAE')
    const iUf = idx('ESTADO_SIGLA')
    const iMunicipio = idx('MUNICIPIO')
    const iLogradouro = idx('LOGRADOURO')
    const iBairro = idx('BAIRRO')
    const iCep = idx('CEP')
    const iTelefone = idx('TELEFONE')
    const iEmail = idx('EMAIL')

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const cnpjNorm = normalizeCnpj(row[iCnpj])
      if (!cnpjNorm) continue

      if (cnpjsExistentes.has(cnpjNorm) || seen.has(cnpjNorm)) {
        totalDuplicados++
        continue
      }
      seen.add(cnpjNorm)

      const razaoSocial = row[iRazao] || row[iFantasia] || 'Sem nome'
      const logradouro = row[iLogradouro] || ''
      const bairro = row[iBairro] || ''
      const municipio = row[iMunicipio] || ''
      const uf = row[iUf] || ''
      const enderecoCompleto = [logradouro, bairro, municipio, uf].filter(Boolean).join(', ')

      valuesList.push(
        `(${sqlStr(razaoSocial)}, ${sqlStr(row[iFantasia])}, ${sqlStr(cnpjNorm)}, ${sqlStr('')}, ` +
        `${sqlStr(row[iTelefone])}, ${sqlStr(row[iEmail])}, ${sqlStr(enderecoCompleto)}, ${sqlStr(logradouro)}, ` +
        `${sqlStr(bairro)}, ${sqlStr(municipio)}, ${sqlStr(uf)}, ${sqlStr(fmtCep(row[iCep]))}, ${sqlStr(row[iCnae])}, ` +
        `'prospecção', 'base_rf', 15, ${sqlStr(hoje)}, 0, ${vendedor.id})`
      )
    }
  }

  const sql = `-- Importação de sorveterias (Triângulo Norte/Sul + Noroeste de Minas)
-- Vendedor: ${vendedor.nome} (id ${vendedor.id})
-- Total de registros: ${valuesList.length}
-- Duplicados ignorados (já existentes na base): ${totalDuplicados}

INSERT INTO clientes (
  razao_social, nome_fantasia, cnpj, contato_nome,
  contato_telefone, contato_email, endereco, endereco_rua,
  endereco_bairro, endereco_cidade, endereco_estado, endereco_cep, cnae_primario,
  etapa, origem_lead, score, ultima_interacao, dias_inativo, vendedor_id
) VALUES
${valuesList.join(',\n')}
ON CONFLICT (cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '' DO NOTHING;
`

  await fs.writeFile(OUTPUT_SQL, sql, 'utf-8')
  console.log(`\nArquivo SQL gerado: ${OUTPUT_SQL}`)
  console.log(`Registros a inserir: ${valuesList.length}`)
  console.log(`Duplicados ignorados: ${totalDuplicados}`)
}

main().catch(err => { console.error(err); process.exit(1) })
