const fs = require('fs')
const path = require('path')

const htmlPath = path.join(__dirname, '..', 'public', 'simulador.html')
const outPath = path.join(__dirname, '..', 'src', 'data', 'simuladorPrecos.ts')
const html = fs.readFileSync(htmlPath, 'utf8')

function extractConst(name, nextToken) {
  const regex = new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?)\\s*;\\s*\\n(?:const|function)\\s+${nextToken}`)
  const match = html.match(regex)
  if (!match) throw new Error(`Não achou constante ${name}`)
  try {
    return JSON.parse(match[1])
  } catch (e) {
    throw new Error(`Erro ao parsear ${name}: ${e.message}`)
  }
}

const produtos = extractConst('PRODUTOS', 'PRAZOS')
const prazos = extractConst('PRAZOS', 'FRETES')
const fretes = extractConst('FRETES', 'entrar')

const content = `export interface SimuladorProduto {
  custo: number
  comA: number
  comB: number
  margA: number
  margB: number
}

export const SIMULADOR_PRODUTOS: Record<string, SimuladorProduto> = ${JSON.stringify(produtos, null, 2)}

export const SIMULADOR_PRAZOS: Record<string, number> = ${JSON.stringify(prazos, null, 2)}

export interface SimuladorFrete {
  key: string
  label: string
  valor: number
}

export const SIMULADOR_FRETES: SimuladorFrete[] = ${JSON.stringify(fretes, null, 2)}

export function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function encontrarProdutoSimulador(nomeProduto: string): string | null {
  const alvo = normalizarNome(nomeProduto)
  if (!alvo) return null
  const chaves = Object.keys(SIMULADOR_PRODUTOS)
  // exata
  for (const chave of chaves) {
    if (normalizarNome(chave) === alvo) return chave
  }
  // contém (um no outro) — usa o mais curto que contém o alvo ou o alvo contém
  let melhor: string | null = null
  for (const chave of chaves) {
    const norm = normalizarNome(chave)
    if (norm.includes(alvo) || alvo.includes(norm)) {
      if (!melhor || chave.length < melhor.length) melhor = chave
    }
  }
  return melhor
}

export interface PrecosCalculados {
  precoA: number
  precoB: number
  comA: number
  comB: number
}

export function calcularPrecosTabela(
  nomeProduto: string,
  prazo: string,
  freteKey: string
): PrecosCalculados | null {
  const prodKey = encontrarProdutoSimulador(nomeProduto)
  if (!prodKey) return null
  const prod = SIMULADOR_PRODUTOS[prodKey]
  const taxa = SIMULADOR_PRAZOS[prazo]
  const freteObj = SIMULADOR_FRETES.find(f => f.key === freteKey)
  if (taxa === undefined || !freteObj) return null
  const base = prod.custo + freteObj.valor
  const denomA = 1 - taxa - prod.comA - prod.margA
  const denomB = 1 - taxa - prod.comB - prod.margB
  if (denomA <= 0 || denomB <= 0) return null
  return {
    precoA: base / denomA,
    precoB: base / denomB,
    comA: prod.comA,
    comB: prod.comB,
  }
}

export function formatarMoeda(value: number): string {
  return \`R$ \${value.toFixed(2).replace('.', ',')}\`
}
`

fs.writeFileSync(outPath, content, 'utf8')
console.log('simuladorPrecos.ts gerado em', outPath)
