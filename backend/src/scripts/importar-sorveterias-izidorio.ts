import * as XLSX from 'xlsx'
import * as fs from 'fs/promises'
import { supabase } from '../supabase.js'

const INPUT_FILE = 'C:\\Users\\Rogério\\gm paris\\sorveterias_norte_mg_go.xlsx'
const VENDEDOR_EMAIL = 'izidorio_izi_kn@hotmail.com'

function normalizeCnpj(cnpj: string): string {
  return (cnpj || '').toString().replace(/\D/g, '')
}

function fmtCep(cep: string): string | undefined {
  const c = (cep || '').toString().replace(/\D/g, '')
  return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : (cep || undefined)
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

  const buf = await fs.readFile(INPUT_FILE)
  const workbook = XLSX.read(buf, { type: 'buffer' })

  const { data: existentes } = await supabase.from('clientes').select('cnpj')
  const cnpjsExistentes = new Set((existentes || []).map(c => normalizeCnpj(c.cnpj)))

  let totalInseridos = 0
  let totalDuplicados = 0
  let totalErros = 0

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

    console.log(`\n[${sheetName}] Processando ${rows.length - 1} registros...`)

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const cnpjRaw = row[iCnpj]
      const cnpjNorm = normalizeCnpj(cnpjRaw)
      if (!cnpjNorm) continue

      if (cnpjsExistentes.has(cnpjNorm)) {
        totalDuplicados++
        continue
      }

      const razaoSocial = row[iRazao] || row[iFantasia] || 'Sem nome'
      const logradouro = row[iLogradouro] || ''
      const bairro = row[iBairro] || ''
      const municipio = row[iMunicipio] || ''
      const uf = row[iUf] || ''
      const enderecoCompleto = [logradouro, bairro, municipio, uf].filter(Boolean).join(', ')

      const novoCliente = {
        razao_social: razaoSocial,
        nome_fantasia: row[iFantasia] || null,
        cnpj: cnpjNorm,
        contato_nome: '',
        contato_telefone: row[iTelefone] || '',
        contato_email: row[iEmail] || '',
        endereco: enderecoCompleto || null,
        endereco_rua: logradouro || null,
        endereco_bairro: bairro || null,
        endereco_cidade: municipio || null,
        endereco_estado: uf || null,
        endereco_cep: fmtCep(row[iCep]) || null,
        cnae_primario: row[iCnae] || null,
        etapa: 'prospecção',
        origem_lead: 'base_rf',
        score: 15,
        ultima_interacao: new Date().toISOString().split('T')[0],
        dias_inativo: 0,
        vendedor_id: vendedor.id,
      }

      const { error: insErr } = await supabase.from('clientes').insert(novoCliente)
      if (insErr) {
        totalErros++
        console.error(`Erro ao inserir ${razaoSocial} (${cnpjNorm}): ${insErr.message}`)
      } else {
        totalInseridos++
        cnpjsExistentes.add(cnpjNorm)
      }
    }
  }

  console.log(`\n=== Resumo ===`)
  console.log(`Inseridos: ${totalInseridos}`)
  console.log(`Duplicados (já existiam): ${totalDuplicados}`)
  console.log(`Erros: ${totalErros}`)
  console.log(`Todos atribuídos ao vendedor: ${vendedor.nome} (id ${vendedor.id})`)
}

main().catch(err => { console.error(err); process.exit(1) })
