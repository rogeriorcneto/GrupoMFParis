import { Router } from 'express'
import { omieCall, omieCallAllPages, testOmieConnection, getOmieCredentials } from '../omie/client.js'
import { getSyncDiff, syncPullClientes, syncPushClientes } from '../omie/sync.js'
import { loadConfig, saveConfig } from '../config-store.js'
import { encrypt, decrypt } from '../crypto.js'
import { OMIE_MODULES } from '../omie/types.js'
import { log } from '../logger.js'
import { rateLimit } from '../middleware/rate-limit.js'

export const omieRouter = Router()

// ─── Config ───

omieRouter.get('/config', async (_req, res) => {
  try {
    const cfg = await loadConfig()
    const hasKey = !!cfg.omieAppKey
    const hasSecret = !!cfg.omieAppSecret
    res.json({
      configured: hasKey && hasSecret,
      appKey: hasKey ? '••••••••' + (decrypt(cfg.omieAppKey) || '').slice(-4) : '',
      appSecret: hasSecret ? '••••••••' : '',
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

omieRouter.post('/config', rateLimit(10, 60_000), async (req, res) => {
  const { appKey, appSecret } = req.body

  if (!appKey || !appSecret) {
    res.status(400).json({ success: false, error: 'App Key e App Secret são obrigatórios.' })
    return
  }

  try {
    // Testar a conexão antes de salvar
    const testResult = await testOmieConnection({ appKey, appSecret })
    if (!testResult.success) {
      res.status(400).json({ success: false, error: `Falha ao conectar: ${testResult.error}` })
      return
    }

    // Salvar as credenciais (serão encriptadas pelo config-store)
    await saveConfig({ omieAppKey: appKey, omieAppSecret: appSecret })

    res.json({
      success: true,
      message: 'Credenciais Omie salvas e testadas com sucesso!',
      empresa: testResult.empresa,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

omieRouter.get('/status', async (_req, res) => {
  try {
    const result = await testOmieConnection()
    res.json(result)
  } catch (err: any) {
    res.json({ success: false, error: err.message })
  }
})

// ─── Módulos disponíveis ───

omieRouter.get('/modules', (_req, res) => {
  const modules: Record<string, any[]> = {}
  for (const [group, mods] of Object.entries(OMIE_MODULES)) {
    modules[group] = Object.entries(mods).map(([key, cfg]) => ({
      key,
      label: cfg.label,
      description: cfg.description,
      methods: Object.keys(cfg.methods),
    }))
  }
  res.json(modules)
})

// ─── Chamada genérica a qualquer módulo Omie ───

omieRouter.post('/call', rateLimit(60, 60_000), async (req, res) => {
  const { group, module, action, params } = req.body

  if (!group || !module || !action) {
    res.status(400).json({ success: false, error: 'group, module e action são obrigatórios.' })
    return
  }

  const moduleConfig = OMIE_MODULES[group]?.[module]
  if (!moduleConfig) {
    res.status(400).json({ success: false, error: `Módulo ${group}.${module} não encontrado.` })
    return
  }

  const callName = moduleConfig.methods[action]
  if (!callName) {
    res.status(400).json({ success: false, error: `Ação ${action} não disponível para ${group}.${module}. Ações: ${Object.keys(moduleConfig.methods).join(', ')}` })
    return
  }

  try {
    const result = await omieCall(moduleConfig.endpoint, callName, params ? [params] : [{}], { skipCache: false })
    res.json({ success: true, data: result })
  } catch (err: any) {
    log.error({ err, group, module, action }, 'Erro na chamada Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Paginação completa ───

omieRouter.post('/call-all', rateLimit(10, 60_000), async (req, res) => {
  const { group, module, action, params, resultKey } = req.body

  if (!group || !module || !action || !resultKey) {
    res.status(400).json({ success: false, error: 'group, module, action e resultKey são obrigatórios.' })
    return
  }

  const moduleConfig = OMIE_MODULES[group]?.[module]
  if (!moduleConfig) {
    res.status(400).json({ success: false, error: `Módulo ${group}.${module} não encontrado.` })
    return
  }

  const callName = moduleConfig.methods[action]
  if (!callName) {
    res.status(400).json({ success: false, error: `Ação ${action} não disponível.` })
    return
  }

  try {
    const result = await omieCallAllPages(moduleConfig.endpoint, callName, params || {}, resultKey)
    res.json({ success: true, data: result, total: result.length })
  } catch (err: any) {
    log.error({ err, group, module, action }, 'Erro na chamada paginada Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Sync Clientes ───

omieRouter.post('/sync/diff', rateLimit(5, 60_000), async (_req, res) => {
  try {
    const diff = await getSyncDiff()
    res.json({ success: true, data: diff })
  } catch (err: any) {
    log.error({ err }, 'Erro ao calcular diff Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

omieRouter.post('/sync/pull', rateLimit(3, 60_000), async (req, res) => {
  const { vendedorIdPadrao } = req.body || {}
  try {
    const result = await syncPullClientes(vendedorIdPadrao)
    res.json({ success: true, data: result })
  } catch (err: any) {
    log.error({ err }, 'Erro no sync pull Omie → CRM')
    res.status(500).json({ success: false, error: err.message })
  }
})

omieRouter.post('/sync/push', rateLimit(3, 60_000), async (_req, res) => {
  try {
    const result = await syncPushClientes()
    res.json({ success: true, data: result })
  } catch (err: any) {
    log.error({ err }, 'Erro no sync push CRM → Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})
