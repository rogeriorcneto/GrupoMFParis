export interface SimuladorProduto {
  custo: number
  comA: number
  comB: number
  margA: number
  margB: number
}

export const SIMULADOR_PRODUTOS: Record<string, SimuladorProduto> = {
  "ACHOCOLATADO CHOCOMINAS CESTA 200G": {
    "custo": 6.929158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.175,
    "margB": 0.125
  },
  "CAFE VACUO BELVEDER 250G L2002": {
    "custo": 12.489158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.325,
    "margB": 0.275
  },
  "CAFE VACUO VILLA RICA TRADICIONAL 500G": {
    "custo": 24.579158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.105,
    "margB": 0.075
  },
  "CD - GLUCOSE EM PO - 25KG": {
    "custo": 5.49,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.33,
    "margB": 0.28
  },
  "CD - LEITE EM PO DESNATADO IMPORTADO 25KG": {
    "custo": 22.29,
    "comA": 0.015,
    "comB": 0.01,
    "margA": 0.115,
    "margB": 0.065
  },
  "CD - LEITE EM PO INTEGRAL IMPORTADO 25KG": {
    "custo": 22.29,
    "comA": 0.015,
    "comB": 0.01,
    "margA": 0.115,
    "margB": 0.065
  },
  "CD - MANIMALTO - MALTODEXTRINA 25KG": {
    "custo": 5.49,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.265,
    "margB": 0.215
  },
  "CD - PERMEADO LITORAL 25KG": {
    "custo": 5.19,
    "comA": 0.02,
    "comB": 0.01,
    "margA": 0.155,
    "margB": 0.105
  },
  "CD - SORO DE LEITE EM PO 25KG": {
    "custo": 9.09,
    "comA": 0.02,
    "comB": 0.01,
    "margA": 0.125,
    "margB": 0.075
  },
  "COMPOSTO LACTEO HORIZONTE COM MALTODEXTRINA 200G": {
    "custo": 13.969158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.125,
    "margB": 0.075
  },
  "LEITE EM PO DESNATADO HORIZONTE 25KG": {
    "custo": 23.000158338,
    "comA": 0.015,
    "comB": 0.01,
    "margA": 0.115,
    "margB": 0.065
  },
  "LEITE EM PO INTEGRAL HORIZONTE 200g": {
    "custo": 25.939158338,
    "comA": 0.015,
    "comB": 0.01,
    "margA": 0.115,
    "margB": 0.065
  },
  "LEITE EM PO INTEGRAL HORIZONTE 25KG": {
    "custo": 23.000158338,
    "comA": 0.015,
    "comB": 0.01,
    "margA": 0.115,
    "margB": 0.065
  },
  "OKEY LAC 300 25KG": {
    "custo": 11.240158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.155,
    "margB": 0.105
  },
  "OKEY LAC ACAI 1 KG": {
    "custo": 15.179158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.125,
    "margB": 0.075
  },
  "OKEY LAC ACAI 25KG": {
    "custo": 12.240158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.155,
    "margB": 0.105
  },
  "OKEY LAC CREAM 25KG": {
    "custo": 16.540158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.155,
    "margB": 0.105
  },
  "OKEY LAC GOURMET 25KG": {
    "custo": 12.390158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.155,
    "margB": 0.105
  },
  "OKEY LAC PANIFICACAO 1KG": {
    "custo": 13.579158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.125,
    "margB": 0.075
  },
  "OKEY LAC PANIFICACAO 25KG": {
    "custo": 10.640158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.155,
    "margB": 0.105
  },
  "OKEY LAC PRO 25KG": {
    "custo": 12.900158338,
    "comA": 0.03,
    "comB": 0.02,
    "margA": 0.155,
    "margB": 0.105
  },
  "PERMEADO LITORAL 25KG": {
    "custo": 5.900158338,
    "comA": 0.02,
    "comB": 0.01,
    "margA": 0.155,
    "margB": 0.105
  },
  "SORO DE LEITE EM PO HORIZONTE 25KG": {
    "custo": 9.800158338,
    "comA": 0.02,
    "comB": 0.01,
    "margA": 0.125,
    "margB": 0.075
  }
}

export const SIMULADOR_PRAZOS: Record<string, number> = {
  "7": 0.009,
  "14": 0.016,
  "15": 0.017,
  "21": 0.023,
  "28": 0.03,
  "30": 0.032,
  "35": 0.037,
  "42": 0.044,
  "45": 0.047,
  "49": 0.051,
  "56": 0.058,
  "60": 0.062,
  "À vista": 0,
  "7/14": 0.0125,
  "7/14/21": 0.016,
  "15/30": 0.0245,
  "14/21": 0.0195,
  "14/21/28": 0.023,
  "21/28": 0.0265,
  "21/28/35": 0.03,
  "15/30/45": 0.032,
  "28/35": 0.0335,
  "21/28/35/42": 0.0335,
  "30/35": 0.0345,
  "28/35/42": 0.037,
  "30/35/42": 0.0377,
  "21/28/35/42/49": 0.037,
  "30/45": 0.0395,
  "35/42": 0.0405,
  "21/28/35/42/49/56": 0.0405,
  "30/60": 0.047,
  "28/35/42/49": 0.0405,
  "35/42/49": 0.044,
  "42/49/56": 0.051,
  "45/60": 0.0545,
  "21/28/35/42/49/56/63": 0.044
}

export interface SimuladorFrete {
  key: string
  label: string
  valor: number
}

export const SIMULADOR_FRETES: SimuladorFrete[] = [
  {
    "key": "FOB",
    "label": "FOB",
    "valor": 0
  },
  {
    "key": "0.20",
    "label": "CIF – R$ 0,20",
    "valor": 0.2
  },
  {
    "key": "0.25",
    "label": "CIF – R$ 0,25",
    "valor": 0.25
  },
  {
    "key": "0.30",
    "label": "CIF – R$ 0,30",
    "valor": 0.3
  },
  {
    "key": "0.35",
    "label": "CIF – R$ 0,35",
    "valor": 0.35
  },
  {
    "key": "0.40",
    "label": "CIF – R$ 0,40",
    "valor": 0.4
  },
  {
    "key": "0.45",
    "label": "CIF – R$ 0,45",
    "valor": 0.45
  },
  {
    "key": "0.50",
    "label": "CIF – R$ 0,50",
    "valor": 0.5
  },
  {
    "key": "0.55",
    "label": "CIF – R$ 0,55",
    "valor": 0.55
  },
  {
    "key": "0.60",
    "label": "CIF – R$ 0,60",
    "valor": 0.6
  },
  {
    "key": "0.65",
    "label": "CIF – R$ 0,65",
    "valor": 0.65
  },
  {
    "key": "0.70",
    "label": "CIF – R$ 0,70",
    "valor": 0.7
  },
  {
    "key": "0.75",
    "label": "CIF – R$ 0,75",
    "valor": 0.75
  },
  {
    "key": "0.80",
    "label": "CIF – R$ 0,80",
    "valor": 0.8
  },
  {
    "key": "0.85",
    "label": "CIF – R$ 0,85",
    "valor": 0.85
  },
  {
    "key": "0.90",
    "label": "CIF – R$ 0,90",
    "valor": 0.9
  },
  {
    "key": "0.95",
    "label": "CIF – R$ 0,95",
    "valor": 0.95
  },
  {
    "key": "1.00",
    "label": "CIF – R$ 1,00",
    "valor": 1
  },
  {
    "key": "1.05",
    "label": "CIF – R$ 1,05",
    "valor": 1.05
  },
  {
    "key": "1.10",
    "label": "CIF – R$ 1,10",
    "valor": 1.1
  },
  {
    "key": "1.15",
    "label": "CIF – R$ 1,15",
    "valor": 1.15
  },
  {
    "key": "1.20",
    "label": "CIF – R$ 1,20",
    "valor": 1.2
  },
  {
    "key": "1.25",
    "label": "CIF – R$ 1,25",
    "valor": 1.25
  },
  {
    "key": "1.30",
    "label": "CIF – R$ 1,30",
    "valor": 1.3
  },
  {
    "key": "1.35",
    "label": "CIF – R$ 1,35",
    "valor": 1.35
  },
  {
    "key": "1.40",
    "label": "CIF – R$ 1,40",
    "valor": 1.4
  },
  {
    "key": "1.45",
    "label": "CIF – R$ 1,45",
    "valor": 1.45
  },
  {
    "key": "1.50",
    "label": "CIF – R$ 1,50",
    "valor": 1.5
  },
  {
    "key": "1.55",
    "label": "CIF – R$ 1,55",
    "valor": 1.55
  },
  {
    "key": "1.60",
    "label": "CIF – R$ 1,60",
    "valor": 1.6
  },
  {
    "key": "1.65",
    "label": "CIF – R$ 1,65",
    "valor": 1.65
  },
  {
    "key": "1.70",
    "label": "CIF – R$ 1,70",
    "valor": 1.7
  },
  {
    "key": "1.75",
    "label": "CIF – R$ 1,75",
    "valor": 1.75
  },
  {
    "key": "1.80",
    "label": "CIF – R$ 1,80",
    "valor": 1.8
  },
  {
    "key": "1.85",
    "label": "CIF – R$ 1,85",
    "valor": 1.85
  },
  {
    "key": "1.90",
    "label": "CIF – R$ 1,90",
    "valor": 1.9
  },
  {
    "key": "1.95",
    "label": "CIF – R$ 1,95",
    "valor": 1.95
  },
  {
    "key": "2.00",
    "label": "CIF – R$ 2,00",
    "valor": 2
  },
  {
    "key": "2.05",
    "label": "CIF – R$ 2,05",
    "valor": 2.05
  },
  {
    "key": "2.10",
    "label": "CIF – R$ 2,10",
    "valor": 2.1
  },
  {
    "key": "2.15",
    "label": "CIF – R$ 2,15",
    "valor": 2.15
  },
  {
    "key": "2.20",
    "label": "CIF – R$ 2,20",
    "valor": 2.2
  },
  {
    "key": "2.25",
    "label": "CIF – R$ 2,25",
    "valor": 2.25
  },
  {
    "key": "2.30",
    "label": "CIF – R$ 2,30",
    "valor": 2.3
  },
  {
    "key": "2.35",
    "label": "CIF – R$ 2,35",
    "valor": 2.35
  },
  {
    "key": "2.40",
    "label": "CIF – R$ 2,40",
    "valor": 2.4
  },
  {
    "key": "2.45",
    "label": "CIF – R$ 2,45",
    "valor": 2.45
  },
  {
    "key": "2.50",
    "label": "CIF – R$ 2,50",
    "valor": 2.5
  },
  {
    "key": "2.55",
    "label": "CIF – R$ 2,55",
    "valor": 2.55
  },
  {
    "key": "2.60",
    "label": "CIF – R$ 2,60",
    "valor": 2.6
  },
  {
    "key": "2.65",
    "label": "CIF – R$ 2,65",
    "valor": 2.65
  },
  {
    "key": "2.70",
    "label": "CIF – R$ 2,70",
    "valor": 2.7
  },
  {
    "key": "2.75",
    "label": "CIF – R$ 2,75",
    "valor": 2.75
  },
  {
    "key": "2.80",
    "label": "CIF – R$ 2,80",
    "valor": 2.8
  },
  {
    "key": "2.85",
    "label": "CIF – R$ 2,85",
    "valor": 2.85
  },
  {
    "key": "2.90",
    "label": "CIF – R$ 2,90",
    "valor": 2.9
  },
  {
    "key": "2.95",
    "label": "CIF – R$ 2,95",
    "valor": 2.95
  },
  {
    "key": "3.00",
    "label": "CIF – R$ 3,00",
    "valor": 3
  }
]

export function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}
