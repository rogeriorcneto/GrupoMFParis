/**
 * Regras determinísticas da Aba Missões — Viagens dos Vendedores (Primeira Versão).
 * Funções 100% puras, sem IA nos cálculos numéricos.
 */

export const CLASSES_DESPESA_MISSAO = [
  'PASSAGEM',
  'HOSPEDAGEM',
  'PEDAGIO',
  'UBER',
  'OUTROS',
  'COMBUSTIVEL',
  'REFEICAO',
  'PECAS_SERV',
] as const

export type ClasseDespesaMissao = typeof CLASSES_DESPESA_MISSAO[number]

export const CLASSE_DESPESA_LABEL: Record<ClasseDespesaMissao, string> = {
  PASSAGEM: 'PASSAGEM',
  HOSPEDAGEM: 'HOSPEDAGEM',
  PEDAGIO: 'PEDÁGIO',
  UBER: 'UBER',
  OUTROS: 'OUTROS',
  COMBUSTIVEL: 'COMBUSTÍVEL',
  REFEICAO: 'REFEIÇÃO',
  PECAS_SERV: 'PEÇAS/SERV.',
}

export function normalizarClasseDespesa(raw: string): ClasseDespesaMissao {
  const clean = String(raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

  if (clean === 'PASSAGEM' || clean === 'PASSAGENS') return 'PASSAGEM'
  if (clean === 'HOSPEDAGEM' || clean === 'HOTEL') return 'HOSPEDAGEM'
  if (clean === 'PEDAGIO') return 'PEDAGIO'
  if (clean === 'UBER' || clean === 'TAXI' || clean === 'TRANSPORTE_APP') return 'UBER'
  if (clean === 'COMBUSTIVEL' || clean === 'GASOLINA' || clean === 'DIESEL' || clean === 'ETANOL') return 'COMBUSTIVEL'
  if (clean === 'REFEICAO' || clean === 'ALIMENTACAO') return 'REFEICAO'
  if (clean === 'PECAS_SERV' || clean === 'PECAS' || clean === 'SERVICOS' || clean === 'MANUTENCAO') return 'PECAS_SERV'
  return 'OUTROS'
}

export interface CoordenadaGeo {
  lat: number
  lon: number
}

/** Distância geodésica exata (Haversine) em metros entre dois pontos GPS. */
export function distanciaMetrosHaversine(a: CoordenadaGeo, b: CoordenadaGeo): number {
  const R = 6371000 // raio médio da Terra em metros
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  return Math.round(R * c)
}

export function distanciaKmHaversine(a: CoordenadaGeo, b: CoordenadaGeo): number {
  return Math.round((distanciaMetrosHaversine(a, b) / 1000) * 10) / 10
}

export function formatarDistanciaHumana(metros: number | null | undefined): string {
  if (metros == null || !Number.isFinite(metros)) return '—'
  if (metros < 1000) return `${Math.round(metros)} m`
  return `${(metros / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

/**
 * Avaliação determinística do check-in da visita (Item 4):
 * - Até `raioMetros` (padrão 300 m): check-in válido (`foraDoLocal = false`).
 * - Acima disso: check-in aceito, mas marcado `foraDoLocal = true` com a distância.
 */
export function avaliarCheckinVisita(
  gpsAparelho: CoordenadaGeo,
  coordCliente: CoordenadaGeo,
  raioMetros = 300,
): { distanciaMetros: number; validoNoRaio: boolean; foraDoLocal: boolean } {
  const raio = Number.isFinite(raioMetros) && raioMetros > 0 ? raioMetros : 300
  const distanciaMetros = distanciaMetrosHaversine(gpsAparelho, coordCliente)
  const validoNoRaio = distanciaMetros <= raio
  return {
    distanciaMetros,
    validoNoRaio,
    foraDoLocal: !validoNoRaio,
  }
}

/** Calcula quantidade de dias da missão (inclusivo: saída = retorno → 1 dia). */
export function calcularDiasMissao(dataSaida?: string, dataRetorno?: string): number {
  if (!dataSaida || !dataRetorno) return 1
  const ini = Date.parse(`${dataSaida.slice(0, 10)}T00:00:00Z`)
  const fim = Date.parse(`${dataRetorno.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return 1
  return Math.floor((fim - ini) / 86400000) + 1
}

export function dataDoDiaMissao(dataSaida: string, diaNumero: number): string {
  const base = Date.parse(`${dataSaida.slice(0, 10)}T12:00:00Z`)
  if (!Number.isFinite(base)) return dataSaida.slice(0, 10)
  const offset = Math.max(0, (diaNumero || 1) - 1)
  return new Date(base + offset * 86400000).toISOString().slice(0, 10)
}

/**
 * Calcula o km total do roteiro (Item 3):
 * Saída (origem) → paradas na ordem definida (dia_numero ASC, ordem ASC) → retorno.
 * Aplica fator de tortuosidade rodoviária (1.28) quando calculado por coordenadas,
 * caso não haja distância rodoviária exata fornecida pelo Google Directions.
 */
export const FATOR_RODOVIARIO_ESTIMADO = 1.28

export interface PontoRoteiro {
  id?: number | string
  coord: CoordenadaGeo | null
}

export function calcularKmRoteiroPorCoordenadas(
  origem: CoordenadaGeo | null,
  paradasOrdenadas: (CoordenadaGeo | null)[],
  retorno?: CoordenadaGeo | null,
  fatorRodoviario = FATOR_RODOVIARIO_ESTIMADO,
): number {
  const pontosValidos: CoordenadaGeo[] = []
  if (origem) pontosValidos.push(origem)
  for (const p of paradasOrdenadas) {
    if (p) pontosValidos.push(p)
  }
  const destRetorno = retorno ?? origem
  if (destRetorno && paradasOrdenadas.some(Boolean)) {
    pontosValidos.push(destRetorno)
  }
  if (pontosValidos.length < 2) return 0

  let metrosLinhaReta = 0
  for (let i = 1; i < pontosValidos.length; i++) {
    metrosLinhaReta += distanciaMetrosHaversine(pontosValidos[i - 1], pontosValidos[i])
  }
  const kmEstimado = (metrosLinhaReta / 1000) * fatorRodoviario
  return Math.round(kmEstimado * 10) / 10
}

/**
 * Fórmula oficial do Custo Previsto (Item 3):
 * custo_previsto = km × valor_do_km + diárias × dias + hospedagem_informada
 */
export function calcularCustoPrevistoMissao(params: {
  kmTotal: number
  valorKm: number
  valorDiaria: number
  dias: number
  hospedagem: number
}): {
  custoKm: number
  custoDiarias: number
  custoHospedagem: number
  custoPrevistoTotal: number
} {
  const km = Math.max(0, Number(params.kmTotal) || 0)
  const vKm = Math.max(0, Number(params.valorKm) || 0)
  const vDia = Math.max(0, Number(params.valorDiaria) || 0)
  const dias = Math.max(1, Math.floor(Number(params.dias) || 1))
  const hosp = Math.max(0, Number(params.hospedagem) || 0)

  const custoKm = Math.round(km * vKm * 100) / 100
  const custoDiarias = Math.round(vDia * dias * 100) / 100
  const custoHospedagem = Math.round(hosp * 100) / 100
  const custoPrevistoTotal = Math.round((custoKm + custoDiarias + custoHospedagem) * 100) / 100

  return { custoKm, custoDiarias, custoHospedagem, custoPrevistoTotal }
}

/** Agrupa despesas por classe oficial e calcula previsto × realizado (Item 6). */
export function resumirDespesasMissao(
  despesas: { tipo: string; valor: number }[],
  custoPrevisto: number,
): {
  porClasse: Record<ClasseDespesaMissao, number>
  totalRealizado: number
  custoPrevisto: number
  saldoPrevistoMenosRealizado: number
} {
  const porClasse: Record<ClasseDespesaMissao, number> = {
    PASSAGEM: 0,
    HOSPEDAGEM: 0,
    PEDAGIO: 0,
    UBER: 0,
    OUTROS: 0,
    COMBUSTIVEL: 0,
    REFEICAO: 0,
    PECAS_SERV: 0,
  }
  let totalRealizado = 0
  for (const d of despesas) {
    const val = Number(d.valor) || 0
    const cls = normalizarClasseDespesa(d.tipo)
    porClasse[cls] = Math.round((porClasse[cls] + val) * 100) / 100
    totalRealizado = Math.round((totalRealizado + val) * 100) / 100
  }
  const prev = Math.round((Number(custoPrevisto) || 0) * 100) / 100
  return {
    porClasse,
    totalRealizado,
    custoPrevisto: prev,
    saldoPrevistoMenosRealizado: Math.round((prev - totalRealizado) * 100) / 100,
  }
}

export function normalizarTextoCidade(s?: string | null): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function limparDigitosCnpj(raw?: string | null): string {
  return String(raw || '').replace(/\D/g, '')
}

export function formatarCnpj14(digitos14: string): string {
  const d = limparDigitosCnpj(digitos14)
  if (d.length !== 14) return d
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

export interface LeadPlanilhaExtraido {
  cnpjDigitos: string
  cnpjFormatado: string
  razaoSocial: string
  nomeFantasia: string
  segmento: string
  cnaePrimario: string
  enderecoRua: string
  enderecoBairro: string
  enderecoCidade: string
  enderecoEstado: string
  enderecoCep: string
  contatoTelefone: string
  contatoEmail: string
  contatoNome: string
  latitude?: number
  longitude?: number
}

function pickCol(row: Record<string, any>, candidatos: string[]): string {
  const keys = Object.keys(row)
  for (const cand of candidatos) {
    const alvo = normalizarTextoCidade(cand).replace(/[^a-z0-9]/g, '')
    const achada = keys.find(k => normalizarTextoCidade(k).replace(/[^a-z0-9]/g, '') === alvo)
    if (achada && String(row[achada] ?? '').trim() !== '') {
      return String(row[achada]).trim()
    }
  }
  return ''
}

/**
 * Extrai e deduplica linhas de uma planilha Excel de leads (Item 1):
 * - Ignora linhas sem CNPJ válido (14 dígitos) ou sem nome/razão social;
 * - Deduplica CNPJs repetidos dentro da própria planilha;
 * - Separa o que já existe no CRM (`duplicadosNoCrm`) do que é novo (`novosLeads`).
 */
export function classificarPlanilhaLeadsPorCnpj(
  linhasBrutas: Record<string, any>[],
  cnpjsExistentesNoCrm: Iterable<string>,
): {
  novosLeads: LeadPlanilhaExtraido[]
  duplicadosNoCrm: { cnpj: string; razaoSocial: string }[]
  duplicadosNaPlanilha: string[]
  invalidosSemCnpj: number
} {
  const cnpjsCrmSet = new Set<string>()
  for (const c of cnpjsExistentesNoCrm) {
    const d = limparDigitosCnpj(c)
    if (d.length >= 11) cnpjsCrmSet.add(d)
  }

  const vistosPlanilha = new Set<string>()
  const novosLeads: LeadPlanilhaExtraido[] = []
  const duplicadosNoCrm: { cnpj: string; razaoSocial: string }[] = []
  const duplicadosNaPlanilha: string[] = []
  let invalidosSemCnpj = 0

  for (const row of linhasBrutas) {
    const cnpjRaw = pickCol(row, ['CNPJ', 'CNPJ_CPF', 'CPF_CNPJ', 'DOCUMENTO'])
    const cnpjDigitos = limparDigitosCnpj(cnpjRaw)
    if (cnpjDigitos.length !== 14) {
      invalidosSemCnpj++
      continue
    }

    const razao = pickCol(row, ['RAZAO_SOCIAL', 'RAZAO SOCIAL', 'EMPRESA', 'CLIENTE', 'NOME'])
    const fantasia = pickCol(row, ['NOME_FANTASIA', 'NOME FANTASIA', 'FANTASIA'])
    const razaoFinal = razao || fantasia
    if (!razaoFinal) {
      invalidosSemCnpj++
      continue
    }

    if (vistosPlanilha.has(cnpjDigitos)) {
      duplicadosNaPlanilha.push(formatarCnpj14(cnpjDigitos))
      continue
    }
    vistosPlanilha.add(cnpjDigitos)

    if (cnpjsCrmSet.has(cnpjDigitos)) {
      duplicadosNoCrm.push({ cnpj: formatarCnpj14(cnpjDigitos), razaoSocial: razaoFinal })
      continue
    }

    const latRaw = pickCol(row, ['LATITUDE', 'LAT'])
    const lonRaw = pickCol(row, ['LONGITUDE', 'LON', 'LNG'])
    const lat = latRaw ? Number(String(latRaw).replace(',', '.')) : undefined
    const lon = lonRaw ? Number(String(lonRaw).replace(',', '.')) : undefined

    novosLeads.push({
      cnpjDigitos,
      cnpjFormatado: formatarCnpj14(cnpjDigitos),
      razaoSocial: razaoFinal,
      nomeFantasia: fantasia || razaoFinal,
      segmento: pickCol(row, ['SEGMENTO', 'RAMO', 'ATIVIDADE']),
      cnaePrimario: pickCol(row, ['CNAE', 'CNAE_PRIMARIO', 'CNAE PRIMARIO']),
      enderecoRua: pickCol(row, ['LOGRADOURO', 'ENDERECO', 'RUA', 'ENDERECO_RUA']),
      enderecoBairro: pickCol(row, ['BAIRRO', 'ENDERECO_BAIRRO']),
      enderecoCidade: pickCol(row, ['MUNICIPIO', 'CIDADE', 'ENDERECO_CIDADE']),
      enderecoEstado: pickCol(row, ['ESTADO_SIGLA', 'UF', 'ESTADO', 'ENDERECO_ESTADO']).slice(0, 2).toUpperCase(),
      enderecoCep: pickCol(row, ['CEP', 'ENDERECO_CEP']),
      contatoTelefone: pickCol(row, ['TELEFONE', 'CELULAR', 'WHATSAPP', 'FONE', 'CONTATO_TELEFONE']),
      contatoEmail: pickCol(row, ['EMAIL', 'E_MAIL', 'CONTATO_EMAIL']),
      contatoNome: pickCol(row, ['CONTATO', 'CONTATO_NOME', 'COMPRADOR', 'RESPONSAVEL']),
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lon) ? lon : undefined,
    })
  }

  return { novosLeads, duplicadosNoCrm, duplicadosNaPlanilha, invalidosSemCnpj }
}

export interface FiltroLeadsMissao {
  busca?: string
  uf?: string
  cidades?: string[] // lista de cidades selecionadas (uma ou várias)
  cidadesCentroRaio?: CoordenadaGeo[] // 1 ou mais cidades de referência para o raio
  raioKm?: number // se > 0 e cidadesCentroRaio não vazio, inclui pontos dentro do raio de qualquer centro
}

/**
 * Filtra clientes/leads para montagem da missão (Item 2):
 * - Por UF;
 * - Por cidade ou região (várias cidades);
 * - Por raio em km a partir de uma ou mais cidades escolhidas (ex.: 2 cidades + raio de 50 km).
 *   Quando `cidades` E `raioKm > 0` estão preenchidos juntos, um cliente entra se estiver
 *   em alguma das cidades escolhidas OU dentro de `raioKm` km de qualquer uma delas!
 */
export function filtrarClientesParaMissao<T extends {
  razaoSocial?: string
  nomeFantasia?: string
  cnpj?: string
  enderecoCidade?: string
  enderecoEstado?: string
  latitude?: number
  longitude?: number
}>(
  clientes: T[],
  filtro: FiltroLeadsMissao,
  coordenadasPorCidadeNorm?: Map<string, CoordenadaGeo>,
): T[] {
  const buscaNorm = normalizarTextoCidade(filtro.busca)
  const ufNorm = String(filtro.uf || '').trim().toUpperCase()
  const cidadesNorm = new Set((filtro.cidades || []).map(normalizarTextoCidade).filter(Boolean))
  const centros = (filtro.cidadesCentroRaio || []).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon))
  const raio = Number(filtro.raioKm) || 0

  return clientes.filter(c => {
    if (buscaNorm) {
      const hay = `${normalizarTextoCidade(c.razaoSocial)} ${normalizarTextoCidade(c.nomeFantasia)} ${limparDigitosCnpj(c.cnpj)} ${normalizarTextoCidade(c.enderecoCidade)}`
      if (!hay.includes(buscaNorm)) return false
    }

    // Se há raio ativo com centros geocodificados, não restringimos pela UF estrita
    // (ex.: divisa MG/SP ou MG/GO num raio de 50 km), a menos que não haja raio.
    if (ufNorm && !(raio > 0 && centros.length > 0)) {
      if (String(c.enderecoEstado || '').trim().toUpperCase() !== ufNorm) return false
    }

    const cidNorm = normalizarTextoCidade(c.enderecoCidade)
    const temFiltroCidade = cidadesNorm.size > 0
    const temFiltroRaio = raio > 0 && centros.length > 0

    if (!temFiltroCidade && !temFiltroRaio) return true

    // Match exato por nome de cidade
    if (temFiltroCidade && cidNorm && cidadesNorm.has(cidNorm)) {
      return true
    }

    // Match por raio geográfico (km) a partir de qualquer cidade-centro selecionada
    if (temFiltroRaio) {
      let pt: CoordenadaGeo | undefined
      if (c.latitude != null && c.longitude != null && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
        pt = { lat: c.latitude, lon: c.longitude }
      } else if (cidNorm && coordenadasPorCidadeNorm) {
        const chaveUf = `${cidNorm}|${String(c.enderecoEstado || '').trim().toUpperCase()}`
        pt = coordenadasPorCidadeNorm.get(chaveUf) || coordenadasPorCidadeNorm.get(cidNorm)
      }
      if (pt) {
        for (const centro of centros) {
          if (distanciaKmHaversine(centro, pt) <= raio) return true
        }
      }
    }

    return false
  })
}

/** Reordena visitas dentro de um dia ou movendo entre dias e renumera `ordem` 1..N em cada dia. */
export function reordenarVisitasPorDia<T extends { id: number; diaNumero: number; ordem: number }>(
  visitas: T[],
  visitaIdMovida: number,
  novoDiaNumero: number,
  novoIndiceZeroBased: number,
): T[] {
  const alvo = visitas.find(v => v.id === visitaIdMovida)
  if (!alvo) return visitas

  const restantes = visitas.filter(v => v.id !== visitaIdMovida)
  const porDia = new Map<number, T[]>()
  for (const v of restantes) {
    const arr = porDia.get(v.diaNumero) || []
    arr.push(v)
    porDia.set(v.diaNumero, arr)
  }
  for (const arr of porDia.values()) {
    arr.sort((a, b) => a.ordem - b.ordem)
  }

  const listaDestino = porDia.get(novoDiaNumero) || []
  const idxClamped = Math.max(0, Math.min(listaDestino.length, novoIndiceZeroBased))
  listaDestino.splice(idxClamped, 0, { ...alvo, diaNumero: novoDiaNumero })
  porDia.set(novoDiaNumero, listaDestino)

  const resultado: T[] = []
  const diasOrdenados = [...porDia.keys()].sort((a, b) => a - b)
  for (const d of diasOrdenados) {
    const arr = porDia.get(d)!
    arr.forEach((item, idx) => {
      resultado.push({ ...item, diaNumero: d, ordem: idx + 1 })
    })
  }
  return resultado
}

/**
 * Estimativa oficial de custo da transcrição + resumo estruturado via Gemini 2.5 Flash
 * (estrutura de IA já usada pelo CRM):
 * - Áudio no Gemini 2.5 Flash: 32 tokens/segundo = 1.920 tokens/min = 115.200 tokens/hora
 *   Tarifa oficial Gemini 2.5 Flash Audio Input: US$ 1,00 / 1M tokens → US$ 0,1152 / hora de áudio
 * - Prompt de sistema: ~400 tokens text input (US$ 0,30 / 1M → US$ 0,00012)
 * - Saída (transcrição completa ~9.000 palavras ≈ 12.000 tokens + JSON resumo ~600 tokens = ~12.600 tokens output)
 *   Tarifa oficial Gemini 2.5 Flash Output: US$ 2,50 / 1M tokens → US$ 0,0315 / hora
 * - Total por hora gravada: ~US$ 0,147 (~US$ 0,15 / hora ≈ R$ 0,85 a R$ 0,90 / hora gravada).
 */
export const CUSTO_ESTIMADO_IA_POR_HORA_USD = 0.15
export const CUSTO_ESTIMADO_IA_POR_HORA_BRL = 0.90
