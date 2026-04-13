import { Router } from 'express'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'
import { encrypt, decrypt } from '../crypto.js'

export const traficoRouter = Router()

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MetaCreds { adAccountId: string; accessToken: string }
interface GoogleCreds { customerId: string; developerToken: string; clientId: string; clientSecret: string; refreshToken: string }
interface TraficoCreds { meta: MetaCreds; google: GoogleCreds }

async function loadCreds(): Promise<TraficoCreds | null> {
  const { data } = await supabase.from('configuracoes').select('valor').eq('chave', 'trafico_creds').maybeSingle()
  if (!data?.valor) return null
  try { return JSON.parse(decrypt(data.valor)) } catch { return null }
}

async function saveCreds(creds: TraficoCreds): Promise<void> {
  const encrypted = encrypt(JSON.stringify(creds))
  await supabase.from('configuracoes').upsert({ chave: 'trafico_creds', valor: encrypted }, { onConflict: 'chave' })
}

function dateRange(range: string): { since: string; until: string } {
  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - (range === '7d' ? 7 : range === '90d' ? 90 : 30))
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { since: fmt(since), until: fmt(until) }
}

// ─── Meta Ads helpers ─────────────────────────────────────────────────────────

const META_BASE = 'https://graph.facebook.com/v19.0'
const META_FIELDS = 'name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights{impressions,clicks,spend,cpc,ctr,actions}'

async function metaFetch(path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, access_token: token })
  const res = await fetch(`${META_BASE}${path}?${qs}`)
  const data = await res.json()
  if (data.error) throw new Error(`Meta API: ${data.error.message}`)
  return data
}

async function getMetaCampanhas(creds: MetaCreds, range: string): Promise<any[]> {
  const { since, until } = dateRange(range)
  const timeRange = JSON.stringify({ since, until })
  const data = await metaFetch(`/${creds.adAccountId}/campaigns`, {
    fields: `name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.time_range(${timeRange}){impressions,clicks,spend,cpc,ctr,actions}`,
    limit: '100',
  }, creds.accessToken)
  return data.data || []
}

async function updateMetaStatus(campaignId: string, status: string, token: string) {
  const res = await fetch(`${META_BASE}/${campaignId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, access_token: token }),
  })
  return res.json()
}

async function createMetaCampanha(creds: MetaCreds, form: any) {
  const body: any = {
    name: form.nome,
    objective: form.objetivo,
    status: 'PAUSED',
    access_token: creds.accessToken,
  }
  if (form.orcamentoDiario) body.daily_budget = Math.round(parseFloat(form.orcamentoDiario) * 100)
  if (form.dataInicio) body.start_time = new Date(form.dataInicio).toISOString()
  if (form.dataFim) body.stop_time = new Date(form.dataFim).toISOString()

  const res = await fetch(`${META_BASE}/${creds.adAccountId}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Meta API: ${data.error.message}`)
  return data
}

// ─── Google Ads helpers ───────────────────────────────────────────────────────

async function getGoogleToken(creds: GoogleCreds): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Google OAuth: falha ao obter access token')
  return data.access_token
}

async function getGoogleCampanhas(creds: GoogleCreds, range: string): Promise<any[]> {
  if (!creds.customerId || !creds.developerToken) return []
  const { since, until } = dateRange(range)
  let accessToken: string
  try { accessToken = await getGoogleToken(creds) } catch { return [] }

  const customerId = creds.customerId.replace(/-/g, '')
  const query = `
    SELECT
      campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
      campaign.start_date, campaign.end_date,
      campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `

  const res = await fetch(`https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': creds.developerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) {
    log.warn({ status: res.status }, 'Google Ads API error')
    return []
  }

  const text = await res.text()
  try {
    const results: any[] = []
    // searchStream returns newline-delimited JSON objects
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const obj = JSON.parse(line)
        if (obj.results) results.push(...obj.results)
      } catch { /* skip */ }
    }
    return results
  } catch { return [] }
}

async function updateGoogleStatus(campaignId: string, status: string, creds: GoogleCreds) {
  const accessToken = await getGoogleToken(creds)
  const customerId = creds.customerId.replace(/-/g, '')
  const res = await fetch(`https://googleads.googleapis.com/v16/customers/${customerId}/campaigns:mutate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': creds.developerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operations: [{ update: { resourceName: `customers/${customerId}/campaigns/${campaignId}`, status }, updateMask: 'status' }],
    }),
  })
  return res.json()
}

async function createGoogleCampanha(creds: GoogleCreds, form: any) {
  const accessToken = await getGoogleToken(creds)
  const customerId = creds.customerId.replace(/-/g, '')

  // 1. Create budget
  const budgetRes = await fetch(`https://googleads.googleapis.com/v16/customers/${customerId}/campaignBudgets:mutate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': creds.developerToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operations: [{
        create: {
          name: `Budget - ${form.nome}`,
          amountMicros: Math.round(parseFloat(form.orcamentoDiario) * 1_000_000),
          deliveryMethod: 'STANDARD',
        },
      }],
    }),
  })
  const budgetData = await budgetRes.json()
  const budgetResource = budgetData.results?.[0]?.resourceName
  if (!budgetResource) throw new Error('Google Ads: falha ao criar orçamento')

  // 2. Create campaign
  const campRes = await fetch(`https://googleads.googleapis.com/v16/customers/${customerId}/campaigns:mutate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': creds.developerToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operations: [{
        create: {
          name: form.nome,
          status: 'PAUSED',
          advertisingChannelType: form.objetivo || 'SEARCH',
          campaignBudget: budgetResource,
          startDate: form.dataInicio?.replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, ''),
          ...(form.dataFim ? { endDate: form.dataFim.replace(/-/g, '') } : {}),
        },
      }],
    }),
  })
  const campData = await campRes.json()
  if (campData.partialFailureError) throw new Error(`Google Ads: ${JSON.stringify(campData.partialFailureError)}`)
  return campData
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeMetaCampanha(raw: any): any {
  const ins = raw.insights?.data?.[0] || {}
  const leads = (ins.actions || []).find((a: any) => a.action_type === 'lead')?.value || 0
  const gasto = parseFloat(ins.spend || '0')
  const cliques = parseInt(ins.clicks || '0', 10)
  const impressoes = parseInt(ins.impressions || '0', 10)
  const ctr = parseFloat(ins.ctr || '0')
  const cpc = parseFloat(ins.cpc || '0')
  return {
    id: raw.id,
    nome: raw.name,
    plataforma: 'meta',
    status: raw.status,
    objetivo: raw.objective || '',
    orcamentoDiario: raw.daily_budget ? parseInt(raw.daily_budget, 10) / 100 : 0,
    dataInicio: raw.start_time?.split('T')[0] || '',
    dataFim: raw.stop_time?.split('T')[0] || undefined,
    impressoes, cliques, leads: parseInt(String(leads), 10), gasto, ctr, cpc,
    cpl: parseInt(String(leads), 10) > 0 ? gasto / parseInt(String(leads), 10) : 0,
  }
}

function normalizeGoogleCampanha(raw: any): any {
  const camp = raw.campaign || {}
  const metrics = raw.metrics || {}
  const budget = raw.campaignBudget || {}
  const gasto = (parseInt(metrics.costMicros || '0', 10)) / 1_000_000
  const cliques = parseInt(metrics.clicks || '0', 10)
  const impressoes = parseInt(metrics.impressions || '0', 10)
  const leads = Math.round(parseFloat(metrics.conversions || '0'))
  const ctr = parseFloat(metrics.ctr || '0') * 100
  const cpc = (parseInt(metrics.averageCpc || '0', 10)) / 1_000_000
  return {
    id: camp.id || '',
    nome: camp.name || '',
    plataforma: 'google',
    status: camp.status || 'UNKNOWN',
    objetivo: camp.advertisingChannelType || '',
    orcamentoDiario: (parseInt(budget.amountMicros || '0', 10)) / 1_000_000,
    dataInicio: camp.startDate || '',
    dataFim: camp.endDate || undefined,
    impressoes, cliques, leads, gasto, ctr, cpc,
    cpl: leads > 0 ? gasto / leads : 0,
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /trafico/config — retorna creds (sem tokens sensíveis)
traficoRouter.get('/config', async (_req, res) => {
  try {
    const creds = await loadCreds()
    if (!creds) { res.json({ success: true, data: null }); return }
    // Return only non-sensitive identifiers to frontend
    res.json({
      success: true,
      data: {
        meta: { adAccountId: creds.meta.adAccountId, accessToken: creds.meta.accessToken ? '***' : '' },
        google: { customerId: creds.google.customerId, developerToken: creds.google.developerToken ? '***' : '', clientId: '', clientSecret: '', refreshToken: '' },
      },
    })
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

// POST /trafico/config — salva creds
traficoRouter.post('/config', async (req, res) => {
  try {
    const { meta, google } = req.body
    await saveCreds({ meta, google })
    log.info('Credenciais de tráfego pago salvas')
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

// GET /trafico/campanhas — lista campanhas de todas as plataformas
traficoRouter.get('/campanhas', async (req, res) => {
  const range = String(req.query.range || '30d')
  try {
    const creds = await loadCreds()
    if (!creds) { res.json({ success: true, data: [] }); return }

    const results: any[] = []
    const errors: string[] = []

    if (creds.meta.adAccountId && creds.meta.accessToken) {
      try {
        const raw = await getMetaCampanhas(creds.meta, range)
        results.push(...raw.map(normalizeMetaCampanha))
      } catch (err: any) { errors.push(`Meta: ${err.message}`); log.warn({ err }, 'Erro Meta Ads') }
    }

    if (creds.google.customerId && creds.google.developerToken) {
      try {
        const raw = await getGoogleCampanhas(creds.google, range)
        results.push(...raw.map(normalizeGoogleCampanha))
      } catch (err: any) { errors.push(`Google: ${err.message}`); log.warn({ err }, 'Erro Google Ads') }
    }

    res.json({ success: true, data: results, errors: errors.length ? errors : undefined })
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

// POST /trafico/sync — força sincronização
traficoRouter.post('/sync', async (req, res) => {
  const range = String(req.body?.range || '30d')
  try {
    const creds = await loadCreds()
    if (!creds) { res.json({ success: true, data: [] }); return }

    const results: any[] = []
    if (creds.meta.adAccountId && creds.meta.accessToken) {
      try { results.push(...(await getMetaCampanhas(creds.meta, range)).map(normalizeMetaCampanha)) } catch (err: any) { log.warn({ err }, 'Sync Meta erro') }
    }
    if (creds.google.customerId && creds.google.developerToken) {
      try { results.push(...(await getGoogleCampanhas(creds.google, range)).map(normalizeGoogleCampanha)) } catch (err: any) { log.warn({ err }, 'Sync Google erro') }
    }
    res.json({ success: true, data: results })
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

// POST /trafico/campanha — cria campanha
traficoRouter.post('/campanha', async (req, res) => {
  try {
    const creds = await loadCreds()
    if (!creds) { res.status(400).json({ success: false, error: 'Credenciais não configuradas' }); return }
    const form = req.body
    if (form.plataforma === 'meta') {
      if (!creds.meta.adAccountId || !creds.meta.accessToken) { res.status(400).json({ success: false, error: 'Credenciais Meta não configuradas' }); return }
      const result = await createMetaCampanha(creds.meta, form)
      log.info({ result }, '✅ Campanha Meta criada')
      res.json({ success: true, data: result })
    } else if (form.plataforma === 'google') {
      if (!creds.google.customerId) { res.status(400).json({ success: false, error: 'Credenciais Google não configuradas' }); return }
      const result = await createGoogleCampanha(creds.google, form)
      log.info({ result }, '✅ Campanha Google criada')
      res.json({ success: true, data: result })
    } else {
      res.status(400).json({ success: false, error: 'Plataforma inválida' })
    }
  } catch (err: any) { log.error({ err }, 'Erro ao criar campanha'); res.status(500).json({ success: false, error: err.message }) }
})

// PATCH /trafico/campanha/:id/status — pausa/ativa
traficoRouter.patch('/campanha/:id/status', async (req, res) => {
  try {
    const creds = await loadCreds()
    if (!creds) { res.status(400).json({ success: false, error: 'Credenciais não configuradas' }); return }
    const { plataforma, status } = req.body
    const { id } = req.params
    if (plataforma === 'meta') {
      const r = await updateMetaStatus(id, status, creds.meta.accessToken)
      res.json({ success: !r.error, error: r.error?.message })
    } else if (plataforma === 'google') {
      const r = await updateGoogleStatus(id, status, creds.google)
      res.json({ success: !r.partialFailureError, error: r.partialFailureError ? JSON.stringify(r.partialFailureError) : undefined })
    } else {
      res.status(400).json({ success: false, error: 'Plataforma inválida' })
    }
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})
