import { log } from '../logger.js'
import { loadConfig } from '../config-store.js'
import { decrypt } from '../crypto.js'

const OMIE_BASE = 'https://app.omie.com.br/api/v1'

// Rate limiter: max 4 concurrent per IP+AppKey+Method
const activeCalls = new Map<string, number>()
const MAX_CONCURRENT = 4
const RETRY_DELAY_MS = 2000
const MAX_RETRIES = 3

// Cache simples em memória (60s) — Omie bloqueia consultas repetidas ao mesmo ID em 60s
const cache = new Map<string, { data: any; expiresAt: number }>()
const CACHE_TTL = 60_000

function getCacheKey(endpoint: string, call: string, param: any[]): string {
  return `${endpoint}:${call}:${JSON.stringify(param)}`
}

async function waitForSlot(methodKey: string): Promise<void> {
  while ((activeCalls.get(methodKey) || 0) >= MAX_CONCURRENT) {
    await new Promise(r => setTimeout(r, 200))
  }
  activeCalls.set(methodKey, (activeCalls.get(methodKey) || 0) + 1)
}

function releaseSlot(methodKey: string): void {
  const current = activeCalls.get(methodKey) || 1
  if (current <= 1) activeCalls.delete(methodKey)
  else activeCalls.set(methodKey, current - 1)
}

export interface OmieCredentials {
  appKey: string
  appSecret: string
}

export async function getOmieCredentials(): Promise<OmieCredentials | null> {
  const cfg = await loadConfig()
  const appKey = cfg.omieAppKey ? decrypt(cfg.omieAppKey) : ''
  const appSecret = cfg.omieAppSecret ? decrypt(cfg.omieAppSecret) : ''
  if (!appKey || !appSecret) return null
  return { appKey, appSecret }
}

/**
 * Chamada genérica à API Omie.
 * - Retry automático com backoff em HTTP 429
 * - Rate limiter interno (max 4 simultâneas por método)
 * - Cache em memória de 60s para consultas
 */
export async function omieCall<T = any>(
  endpoint: string,
  call: string,
  param: any[],
  options?: { skipCache?: boolean; credentials?: OmieCredentials }
): Promise<T> {
  const creds = options?.credentials || await getOmieCredentials()
  if (!creds) {
    throw new Error('Credenciais Omie não configuradas. Configure App Key e App Secret em Integrações.')
  }

  // Check cache
  if (!options?.skipCache) {
    const cacheKey = getCacheKey(endpoint, call, param)
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T
    }
  }

  const methodKey = `${creds.appKey}:${call}`
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForSlot(methodKey)
    try {
      const url = `${OMIE_BASE}${endpoint}`
      const body = JSON.stringify({
        app_key: creds.appKey,
        app_secret: creds.appSecret,
        call,
        param,
      })

      log.info({ endpoint, call, attempt }, 'Omie API call')

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      if (res.status === 429) {
        releaseSlot(methodKey)
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
        log.warn({ call, delay }, 'Omie rate limited, retrying...')
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      if (res.status === 425) {
        releaseSlot(methodKey)
        throw new Error('Omie bloqueou requisições por excesso de erros. Aguarde 30 minutos.')
      }

      const data = await res.json()

      if (data.faultstring) {
        releaseSlot(methodKey)
        throw new Error(`Omie ${call}: ${data.faultstring}`)
      }

      releaseSlot(methodKey)

      // Cache the result
      if (!options?.skipCache) {
        const cacheKey = getCacheKey(endpoint, call, param)
        cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL })
      }

      return data as T
    } catch (err: any) {
      releaseSlot(methodKey)
      lastError = err
      if (err.message?.includes('rate') || err.message?.includes('429')) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }

  throw lastError || new Error(`Omie ${call}: falhou após ${MAX_RETRIES} tentativas`)
}

/**
 * Busca TODAS as páginas de um endpoint paginado do Omie.
 * Retorna array com todos os registros concatenados.
 */
export async function omieCallAllPages<T = any>(
  endpoint: string,
  call: string,
  baseParam: Record<string, any>,
  resultKey: string,
  registrosPorPagina = 100,
  options?: { credentials?: OmieCredentials }
): Promise<T[]> {
  const allResults: T[] = []
  let pagina = 1
  let totalPaginas = 1

  do {
    const param = { ...baseParam, pagina, registros_por_pagina: registrosPorPagina }
    const response = await omieCall<any>(endpoint, call, [param], {
      skipCache: true,
      credentials: options?.credentials,
    })

    totalPaginas = response.total_de_paginas || response.nTotPaginas || 1
    const records = response[resultKey] || []
    allResults.push(...records)

    log.info({ call, pagina, totalPaginas, fetched: records.length, total: allResults.length }, 'Omie pagination')
    pagina++
  } while (pagina <= totalPaginas)

  return allResults
}

/**
 * Testa a conexão com o Omie usando as credenciais salvas.
 */
export async function testOmieConnection(credentials?: OmieCredentials): Promise<{ success: boolean; error?: string; empresa?: string }> {
  try {
    const creds = credentials || await getOmieCredentials()
    if (!creds) {
      return { success: false, error: 'Credenciais não configuradas' }
    }

    const response = await omieCall<any>(
      '/geral/clientes/',
      'ListarClientes',
      [{ pagina: 1, registros_por_pagina: 1 }],
      { skipCache: true, credentials: creds }
    )

    return {
      success: true,
      empresa: response?.clientes_cadastro?.[0]?.razao_social || 'Conectado',
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// Cleanup cache periodicamente
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k)
  }
}, 5 * 60_000)
