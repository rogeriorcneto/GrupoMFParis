/**
 * Script de extração da base CNPJ da Receita Federal
 * Filtra por CNAEs do setor alimentício e gera CSV para importar no Supabase
 *
 * Uso: node scripts/extrair-rf-cnpj.cjs
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { createWriteStream, existsSync, mkdirSync } = require('fs')
const { pipeline } = require('stream/promises')
const zlib = require('zlib')
const iconv = require('iconv-lite')

// ─── Configuração ───────────────────────────────────────────────────────────

// Espelho CDN Cloudflare — muito mais rápido que o servidor oficial da RF
const BASE_URL = 'https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-04-12/'
const OUTPUT_DIR = path.join(__dirname, '..', 'rf-cnpj-data')
const OUTPUT_CSV  = path.join(OUTPUT_DIR, 'leads_alimenticio.csv')
const OUTPUT_CSV1 = path.join(OUTPUT_DIR, 'leads_alimenticio_parte1.csv')
const OUTPUT_CSV2 = path.join(OUTPUT_DIR, 'leads_alimenticio_parte2.csv')

// CNAEs alvo — segmento GrupoMF Paris (sorvetes, laticínios, atacado de sorvetes/laticínios)
const CNAES_ALVO = new Set([
  '1053800', // Fabricação de sorvetes e outros gelados comestíveis
  '1052000', // Fabricação de laticínios
  '4637106', // Comércio atacadista de sorvetes
  '4729699', // Comércio varejista de produtos alimentícios em geral (outros)
  '4637199', // Comércio atacadista de sorvetes e outros — outros
])

const CNAE_LABELS = {
  '1053800': 'Sorveteria / Fabr. Sorvete',
  '1052000': 'Laticínios',
  '4637106': 'Atacado Sorvete',
  '4729699': 'Varejo Alimentício',
  '4637199': 'Atacado Alimentício',
}

const UF_NOMES = {
  'AC':'Acre','AL':'Alagoas','AM':'Amazonas','AP':'Amapá','BA':'Bahia',
  'CE':'Ceará','DF':'Distrito Federal','ES':'Espírito Santo','GO':'Goiás',
  'MA':'Maranhão','MG':'Minas Gerais','MS':'Mato Grosso do Sul','MT':'Mato Grosso',
  'PA':'Pará','PB':'Paraíba','PE':'Pernambuco','PI':'Piauí','PR':'Paraná',
  'RJ':'Rio de Janeiro','RN':'Rio Grande do Norte','RO':'Rondônia','RR':'Roraima',
  'RS':'Rio Grande do Sul','SC':'Santa Catarina','SE':'Sergipe','SP':'São Paulo','TO':'Tocantins'
}

function limpar(str) {
  return String(str || '').trim().replace(/^NULO$/i, '').replace(/^0+$/, '')
}

function formatarCnpj(cnpj) {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14) return cnpj
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`
}

function formatarCep(cep) {
  const n = cep.replace(/\D/g, '')
  if (n.length !== 8) return cep
  return `${n.slice(0,5)}-${n.slice(5)}`
}

function formatarTelefone(ddd, tel) {
  if (!ddd || !tel) return ''
  const t = tel.replace(/\D/g, '')
  if (!t || t === '00000000' || t === '0') return ''
  return `(${ddd.trim()}) ${t}`
}

function csvField(val) {
  const s = String(val || '').replace(/"/g, "'")
  return `"${s}"`
}

function splitCsvLine(line) {
  const result = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { result.push(cur); cur = '' }
    else { cur += c }
  }
  result.push(cur)
  return result
}

// ─── Utilitários ────────────────────────────────────────────────────────────

function log(msg) {
  const time = new Date().toLocaleTimeString('pt-BR')
  console.log(`[${time}] ${msg}`)
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (existsSync(destPath)) {
      log(`  ✓ Já existe: ${path.basename(destPath)} — pulando download`)
      return resolve(destPath)
    }

    log(`  ⬇ Baixando: ${path.basename(destPath)}`)
    const file = createWriteStream(destPath + '.tmp')
    let downloaded = 0
    let lastLog = 0

    const request = (urlStr, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Muitos redirecionamentos'))
      const mod = urlStr.startsWith('https') ? https : http
      mod.get(urlStr, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return request(res.headers.location, redirectCount + 1)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} para ${urlStr}`))
        }
        res.on('data', (chunk) => {
          downloaded += chunk.length
          if (Date.now() - lastLog > 3000) {
            process.stdout.write(`\r    ${formatBytes(downloaded)} baixados...`)
            lastLog = Date.now()
          }
        })
        res.pipe(file)
        file.on('finish', () => {
          process.stdout.write('\n')
          file.close()
          fs.renameSync(destPath + '.tmp', destPath)
          log(`  ✓ Download concluído: ${path.basename(destPath)} (${formatBytes(downloaded)})`)
          resolve(destPath)
        })
      }).on('error', reject)
    }

    request(url)
  })
}

// ─── Parser de CSV da RF (formato fixo com ";") ─────────────────────────────

function parseLine(line) {
  return line.split(';').map(f => f.replace(/^"|"$/g, '').trim())
}

function streamLinhas(filePath, onLine) {
  return new Promise((resolve, reject) => {
    const raw = fs.createReadStream(filePath)
    const decoded = raw.pipe(iconv.decodeStream('latin1'))
    const rl = readline.createInterface({ input: decoded, crlfDelay: Infinity })
    rl.on('line', onLine)
    rl.on('close', resolve)
    rl.on('error', reject)
    raw.on('error', reject)
  })
}

// ─── Processar Estabelecimentos ─────────────────────────────────────────────
// Layout do arquivo Estabelecimentos (posições):
// 0:CNPJ_BASICO, 1:CNPJ_ORDEM, 2:CNPJ_DV, 3:IDENTIFICADOR, 4:NOME_FANTASIA
// 5:SITUACAO_CADASTRAL, 6:DATA_SITUACAO, 7:MOTIVO_SITUACAO, 8:NOME_CIDADE_EXTERIOR
// 9:PAIS, 10:DATA_INICIO_ATIVIDADE, 11:CNAE_FISCAL_PRINCIPAL, 12:CNAE_FISCAL_SECUNDARIA
// 13:TIPO_LOGRADOURO, 14:LOGRADOURO, 15:NUMERO, 16:COMPLEMENTO, 17:BAIRRO
// 18:CEP, 19:UF, 20:MUNICIPIO, 21:DDD1, 22:TELEFONE1, 23:DDD2, 24:TELEFONE2
// 25:DDD_FAX, 26:FAX, 27:EMAIL, 28:SITUACAO_ESPECIAL, 29:DATA_SITUACAO_ESPECIAL

// Escreve matches direto no arquivo CSV (append) — sem acumular na memória
async function processarEstabelecimentosParaCSV(filePath, municipioMap, csvWriter, cnpjsColetados) {
  log(`  Processando: ${path.basename(filePath)}`)
  let count = 0
  let matched = 0
  let lastLog = Date.now()

  await streamLinhas(filePath, (line) => {
    if (!line.trim()) return
    count++
    if (Date.now() - lastLog > 4000) {
      process.stdout.write(`\r    ${count.toLocaleString('pt-BR')} linhas, ${matched} matches...`)
      lastLog = Date.now()
    }
    const fields = parseLine(line)
    if (fields.length < 28) return

    const cnpjBasico = fields[0]
    const situacao = fields[5] // '02' = ATIVA
    const cnae = fields[11]
    const uf = fields[19]
    const municipioCod = fields[20]

    if (situacao !== '02') return
    const cnaeNorm = cnae.replace(/\D/g, '').padStart(7, '0')
    if (!CNAES_ALVO.has(cnaeNorm)) return

    const cnpjOrdem = fields[1]
    const cnpjDv = fields[2]
    const cnpjCompleto = `${cnpjBasico}${cnpjOrdem}${cnpjDv}`

    // Deduplicação
    if (cnpjsColetados.has(cnpjCompleto)) return
    cnpjsColetados.add(cnpjCompleto)

    const nomeFantasia = limpar(fields[4])
    const tipoLogr = limpar(fields[13])
    const nomeLogr = limpar(fields[14])
    const numero   = limpar(fields[15])
    const compl    = limpar(fields[16])
    const logradouro = [tipoLogr, nomeLogr, numero, compl].filter(Boolean).join(' ')
    const bairro = limpar(fields[17])
    const cep = formatarCep(limpar(fields[18]))
    const telefone = formatarTelefone(limpar(fields[21]), limpar(fields[22]))
    const email = limpar(fields[27]).toLowerCase()
    const municipioNome = limpar(municipioMap[municipioCod] || municipioCod)
    const ufSigla = limpar(uf).toUpperCase()
    const estadoNome = UF_NOMES[ufSigla] || ufSigla
    const segmento = CNAE_LABELS[cnaeNorm] || cnaeNorm
    const cnpjFmt = formatarCnpj(cnpjCompleto)

    matched++
    // Escreve direto no CSV — sem guardar na memória
    const row = [cnpjFmt, '', nomeFantasia, segmento, cnaeNorm, ufSigla, estadoNome,
      municipioNome, logradouro, bairro, cep, telefone, email, '', '', cnpjBasico]
      .map(csvField)
      .join(',')
    csvWriter.write(row + '\n')
  })

  process.stdout.write('\n')
  log(`  → ${count.toLocaleString('pt-BR')} linhas, ${matched} matches`)
  return matched
}

async function processarMunicipios(filePath) {
  const map = {}
  await streamLinhas(filePath, (line) => {
    if (!line.trim()) return
    const fields = parseLine(line)
    if (fields.length >= 2) map[fields[0]] = fields[1]
  })
  log(`  → ${Object.keys(map).length} municípios carregados`)
  return map
}

// Fase 3: enriquece sócios no CSV já gerado
// Layout Socios: 0:CNPJ_BASICO, 1:IDENTIFICADOR, 2:NOME_SOCIO, 3:CNPJ_CPF, 4:QUALIFICACAO_SOCIO
async function enriquecerSocios(csvPath, socioFiles) {
  log('\n  Passo C: Enriquecendo sócios...')

  const linhasCSV = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean)
  // col 15 = CNPJ_BASICO
  const linhaMap = new Map()
  for (let i = 1; i < linhasCSV.length; i++) {
    const cols = splitCsvLine(linhasCSV[i])
    const cnpjBasico = cols[15]?.replace(/"/g, '').trim()
    if (cnpjBasico) linhaMap.set(cnpjBasico, i)
  }
  const cnpjsAlvo = new Set(linhaMap.keys())
  log(`  → ${cnpjsAlvo.size} CNPJs para enriquecer com sócios`)

  for (const socioFile of socioFiles) {
    log(`  Socios: ${socioFile}`)
    let count = 0
    await streamLinhas(path.join(OUTPUT_DIR, socioFile), (line) => {
      if (!line.trim()) return
      const fields = parseLine(line)
      if (fields.length < 4) return
      const cnpjBasico = fields[0]
      if (!cnpjsAlvo.has(cnpjBasico)) return
      const idx = linhaMap.get(cnpjBasico)
      if (idx === undefined) return
      // col 13 = SOCIO_NOME, col 14 = SOCIO_CPF
      const cols = splitCsvLine(linhasCSV[idx])
      const jaTemSocio = cols[13]?.replace(/"/g, '').trim()
      if (jaTemSocio) return
      count++
      cols[13] = csvField(limpar(fields[2]))
      cols[14] = csvField(limpar(fields[3]))
      linhasCSV[idx] = cols.join(',')
    })
    log(`  → ${count} enriquecidos`)
  }

  fs.writeFileSync(csvPath, linhasCSV.join('\n') + '\n', 'utf8')
  log(`  ✅ CSV final com sócios: ${csvPath}`)
}

// Fase 2: enriquece razão social no CSV já gerado (faz replace linha por linha)
async function enriquecerRazaoSocial(csvPath, empFiles) {
  log('\n  Passo B: Enriquecendo razão social...')

  // Lê o CSV parcial e monta mapa cnpjBasico → índice da linha
  log('  Lendo CSV parcial para enriquecimento...')
  const linhasCSV = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean)
  // linha 0 = header; col 15 = CNPJ_BASICO
  const linhaMap = new Map()
  for (let i = 1; i < linhasCSV.length; i++) {
    const cols = splitCsvLine(linhasCSV[i])
    const cnpjBasico = cols[15]?.replace(/"/g, '').trim()
    if (cnpjBasico) linhaMap.set(cnpjBasico, i)
  }
  const cnpjsAlvo = new Set(linhaMap.keys())
  log(`  → ${cnpjsAlvo.size} CNPJs base para enriquecer`)

  for (const csvFile of empFiles) {
    log(`  Empresas: ${csvFile}`)
    let count = 0
    await streamLinhas(path.join(OUTPUT_DIR, csvFile), (line) => {
      if (!line.trim()) return
      const fields = parseLine(line)
      if (fields.length < 2) return
      const cnpjBasico = fields[0]
      if (!cnpjsAlvo.has(cnpjBasico)) return
      count++
      const idx = linhaMap.get(cnpjBasico)
      if (idx === undefined) return
      // Substitui coluna razao_social (pos 0 no CSV = cnpj, mas precisamos inserir razão social)
      // Header: CNPJ,RAZAO_SOCIAL,NOME_FANTASIA,SEGMENTO,CNAE,ESTADO_SIGLA,ESTADO,MUNICIPIO,...
      // col 1 = RAZAO_SOCIAL
      const cols = splitCsvLine(linhasCSV[idx])
      cols[1] = csvField(limpar(fields[1]))
      linhasCSV[idx] = cols.join(',')
    })
    log(`  → ${count} enriquecidos`)
  }

  // Reescreve o CSV com razões sociais
  fs.writeFileSync(csvPath, linhasCSV.join('\n') + '\n', 'utf8')
  log(`  ✅ CSV final com razão social: ${csvPath}`)
}


// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Extrator CNPJ Receita Federal — Setor Alimentício')
  console.log('  GrupoMF Paris — CRM')
  console.log('═══════════════════════════════════════════════════════════\n')

  // Criar diretório de saída
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

  // ── Passo 1: Descobrir arquivos disponíveis ──
  log('Verificando arquivos disponíveis na Receita Federal...')

  // Arquivos a baixar
  const files = []
  for (let i = 0; i <= 9; i++) {
    files.push({ name: `Empresas${i}.zip`, type: 'empresa' })
    files.push({ name: `Estabelecimentos${i}.zip`, type: 'estabelecimento' })
    files.push({ name: `Socios${i}.zip`, type: 'socio' })
  }
  files.push({ name: 'Municipios.zip', type: 'municipio' })
  files.push({ name: 'Cnaes.zip', type: 'cnae' })

  // ── Passo 2: Download ──
  log('\n── Etapa 1/3: Download dos arquivos ──')
  const downloadedPaths = {}

  for (const file of files) {
    const url = BASE_URL + file.name
    const destPath = path.join(OUTPUT_DIR, file.name)
    try {
      await downloadFile(url, destPath)
      downloadedPaths[file.name] = { path: destPath, type: file.type }
    } catch (err) {
      log(`  ⚠ Erro ao baixar ${file.name}: ${err.message} — pulando`)
    }
  }

  // ── Passo 3: Descomprime ──
  log('\n── Etapa 2/3: Descomprimindo e processando ──')

  const { execSync } = require('child_process')

  function descomprimir(zipPath, destDir) {
    try {
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'pipe' })
    } catch {
      execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'pipe' })
    }
  }

  // leadMap: cnpjBasico → dados do estabelecimento (apenas CNAEs alvo, empresas ativas)
  // Estratégia: Estabelecimentos PRIMEIRO (filtro CNAE → mapa pequeno ~50k)
  //             depois Empresas só para enriquecer com razão social dos que já estão no mapa
  const leadMap = {}
  let municipioMap = {}

  // ── Municípios ──
  const munZip = path.join(OUTPUT_DIR, 'Municipios.zip')
  if (existsSync(munZip)) {
    const munFile = fs.readdirSync(OUTPUT_DIR).find(f => f.toUpperCase().includes('MUNIC') && !f.toLowerCase().endsWith('.zip'))
    if (!munFile) {
      log('  Descomprimindo Municipios.zip...')
      descomprimir(munZip, OUTPUT_DIR)
    }
    const munFileNow = fs.readdirSync(OUTPUT_DIR).find(f => f.toUpperCase().includes('MUNIC') && !f.toLowerCase().endsWith('.zip'))
    if (munFileNow) municipioMap = await processarMunicipios(path.join(OUTPUT_DIR, munFileNow))
  }

  // ── Passo A: Estabelecimentos → escreve CSV incrementalmente (zero acúmulo na memória) ──
  log('\n  Passo A: Estabelecimentos → filtrando e escrevendo CSV...')
  const estabFiles = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.toUpperCase().includes('ESTABE') && !f.toLowerCase().endsWith('.zip'))
    .sort()
  if (estabFiles.length === 0) {
    log('  ❌ Nenhum arquivo de Estabelecimentos. Aguarde a descompressão.')
    process.exit(1)
  }

  // Abre CSV para escrita incremental
  const BOM = '\uFEFF'
  const header = 'CNPJ,RAZAO_SOCIAL,NOME_FANTASIA,SEGMENTO,CNAE,ESTADO_SIGLA,ESTADO,MUNICIPIO,LOGRADOURO,BAIRRO,CEP,TELEFONE,EMAIL,SOCIO_NOME,SOCIO_CPF,CNPJ_BASICO\n'
  fs.writeFileSync(OUTPUT_CSV, BOM + header, 'utf8')
  const csvWriter = fs.createWriteStream(OUTPUT_CSV, { flags: 'a', encoding: 'utf8' })
  const cnpjsColetados = new Set()
  let totalMatches = 0

  for (const csvFile of estabFiles) {
    const n = await processarEstabelecimentosParaCSV(path.join(OUTPUT_DIR, csvFile), municipioMap, csvWriter, cnpjsColetados)
    totalMatches += n
  }

  csvWriter.end()
  log(`\n  Total leads coletados: ${totalMatches}`)

  // ── Passo B: Enriquecer razão social (o CSV já é pequeno — ~50k linhas, cabe na memória) ──
  const empFiles = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.toUpperCase().includes('EMPRE') && !f.toLowerCase().endsWith('.zip'))
    .sort()
  await enriquecerRazaoSocial(OUTPUT_CSV, empFiles)

  // ── Passo C: Enriquecer sócios ──
  // Descomprime Socios se necessário
  for (let i = 0; i <= 9; i++) {
    const socioZip = path.join(OUTPUT_DIR, `Socios${i}.zip`)
    if (!existsSync(socioZip)) continue
    const jaExiste = fs.readdirSync(OUTPUT_DIR).some(
      f => f.toUpperCase().startsWith(`SOCIOS${i}`) && !f.toLowerCase().endsWith('.zip')
    )
    if (!jaExiste) {
      log(`  Descomprimindo Socios${i}.zip...`)
      descomprimir(socioZip, OUTPUT_DIR)
    }
  }

  const socioFiles = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.toUpperCase().includes('SOCIO') && !f.toLowerCase().endsWith('.zip'))
    .sort()

  if (socioFiles.length > 0) {
    await enriquecerSocios(OUTPUT_CSV, socioFiles)
  } else {
    log('  ⚠ Nenhum arquivo de Sócios encontrado — pulando enriquecimento')
  }

  // ── Passo D: Dividir CSV em dois arquivos para importar no Supabase (limite 50MB) ──
  log('\n  Passo D: Dividindo CSV em duas partes...')
  const todasLinhas = fs.readFileSync(OUTPUT_CSV, 'utf8').split('\n').filter(Boolean)
  const headerLinha = todasLinhas[0]
  const dataLinhas = todasLinhas.slice(1)
  const metade = Math.ceil(dataLinhas.length / 2)
  const parte1 = [headerLinha, ...dataLinhas.slice(0, metade)].join('\n') + '\n'
  const parte2 = [headerLinha, ...dataLinhas.slice(metade)].join('\n') + '\n'
  const BOM2 = '\uFEFF'
  fs.writeFileSync(OUTPUT_CSV1, BOM2 + parte1, 'utf8')
  fs.writeFileSync(OUTPUT_CSV2, BOM2 + parte2, 'utf8')
  const sz1 = (fs.statSync(OUTPUT_CSV1).size / 1024 / 1024).toFixed(1)
  const sz2 = (fs.statSync(OUTPUT_CSV2).size / 1024 / 1024).toFixed(1)
  log(`  ✅ Parte 1: leads_alimenticio_parte1.csv (${sz1} MB, ${metade} linhas)`)
  log(`  ✅ Parte 2: leads_alimenticio_parte2.csv (${sz2} MB, ${dataLinhas.length - metade} linhas)`)

  // ── Passo 3: Concluído ──
  log('\n── Etapa 3/3: CSV gerado ──')

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  CNAE de Fábrica de Sorvete: 1053-8/00')
  console.log('  Arquivos gerados em rf-cnpj-data/:')
  console.log('    leads_alimenticio_parte1.csv  ← importar primeiro no Supabase')
  console.log('    leads_alimenticio_parte2.csv  ← importar segundo no Supabase')
  console.log('  Colunas: CNPJ, RAZAO_SOCIAL, NOME_FANTASIA, SEGMENTO, CNAE,')
  console.log('           ESTADO_SIGLA, ESTADO, MUNICIPIO, LOGRADOURO, BAIRRO,')
  console.log('           CEP, TELEFONE, EMAIL, SOCIO_NOME, SOCIO_CPF')
  console.log('  Próximo passo: importar os dois CSVs no Supabase (Table Editor → leads_rf)')
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message)
  process.exit(1)
})
