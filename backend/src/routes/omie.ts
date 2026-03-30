import { Router } from 'express'
import { omieCall, omieCallAllPages, testOmieConnection, getOmieCredentials } from '../omie/client.js'
import { getSyncDiff, syncPullClientes, syncPushClientes, syncPushSingleCliente } from '../omie/sync.js'
import { syncOmieLogistics } from '../omie/sync-logistics.js'
import { listarPedidosOmieAcompanhamento, consultarEntregaOmie, obterResumoFinanceiro, buscarPedidoOmie, onPedidoAprovado } from '../omie/pedidos.js'
import { loadConfig, saveConfig } from '../config-store.js'
import { encrypt, decrypt } from '../crypto.js'
import { OMIE_MODULES } from '../omie/types.js'
import { log } from '../logger.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { createClient } from '@supabase/supabase-js'

export const omieRouter = Router()

// ─── Config ───

omieRouter.get('/config', async (req, res) => {
  try {
    const cfg = await loadConfig((req as any).supabase)
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
    await saveConfig({ omieAppKey: appKey, omieAppSecret: appSecret }, (req as any).supabase)

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

// ─── Pedidos Omie — Acompanhamento ───

omieRouter.get('/pedidos/acompanhamento', rateLimit(10, 60_000), async (_req, res) => {
  try {
    const data = await listarPedidosOmieAcompanhamento()
    res.json({ success: true, data })
  } catch (err: any) {
    log.error({ err }, 'Erro ao listar acompanhamento de pedidos Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

omieRouter.get('/pedidos/buscar', rateLimit(15, 60_000), async (req, res) => {
  const termo = String(req.query.q || '').trim()
  if (!termo) { res.status(400).json({ success: false, error: 'Parâmetro q obrigatório' }); return }

  try {
    const data = await buscarPedidoOmie(termo)
    res.json({ success: true, data })
  } catch (err: any) {
    log.error({ err, termo }, 'Erro ao buscar pedido no Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

omieRouter.post('/pedidos/:id/consultar-entrega', rateLimit(30, 60_000), async (req, res) => {
  const pedidoId = parseInt(req.params.id, 10)
  if (isNaN(pedidoId)) { res.status(400).json({ success: false, error: 'ID inválido' }); return }

  try {
    const data = await consultarEntregaOmie(pedidoId)
    res.json({ success: true, data })
  } catch (err: any) {
    log.error({ err, pedidoId }, 'Erro ao consultar entrega do pedido no Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Enviar Pedido ao Omie (quando gerente confirma venda) ───

omieRouter.post('/pedidos/:id/enviar', rateLimit(10, 60_000), async (req, res) => {
  const pedidoId = parseInt(req.params.id, 10)
  if (!pedidoId || isNaN(pedidoId)) {
    res.status(400).json({ success: false, error: 'ID do pedido inválido' })
    return
  }

  try {
    const result = await onPedidoAprovado(pedidoId)
    if (result.success) {
      res.json({ success: true, omie_codigo: result.omie_codigo, message: 'Pedido enviado ao Omie com sucesso!' })
    } else {
      res.status(400).json({ success: false, error: result.error })
    }
  } catch (err: any) {
    log.error({ err, pedidoId }, 'Erro ao enviar pedido para Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Financeiro Omie — Resumo ───

omieRouter.get('/financeiro/resumo', rateLimit(5, 60_000), async (_req, res) => {
  try {
    const data = await obterResumoFinanceiro()
    res.json({ success: true, data })
  } catch (err: any) {
    log.error({ err }, 'Erro ao obter resumo financeiro Omie')
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

omieRouter.post('/sync/cliente/:id', rateLimit(10, 60_000), async (req, res) => {
  try {
    const clienteId = Number(req.params.id)
    if (!clienteId) { res.status(400).json({ success: false, error: 'ID inválido' }); return }
    const result = await syncPushSingleCliente(clienteId)
    res.json(result)
  } catch (err: any) {
    log.error({ err }, 'Erro ao enviar cliente ao Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

omieRouter.post('/sync/produtos', rateLimit(3, 60_000), async (req, res) => {
  try {
    const { syncPullProdutos } = await import('../omie/sync-produtos.js')
    const result = await syncPullProdutos()
    res.json({ success: true, data: result })
  } catch (err: any) {
    log.error({ err }, 'Erro no sync de produtos Omie → CRM')
    res.status(500).json({ success: false, error: err.message })
  }
})

omieRouter.post('/sync/logistics', rateLimit(3, 60_000), async (_req, res) => {
  try {
    const result = await syncOmieLogistics()
    res.json({ success: true, data: result })
  } catch (err: any) {
    log.error({ err }, 'Erro no sync logístico Omie')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Teste Fluxo Omie ───
omieRouter.post('/test-flow', async (req, res) => {
  try {
    console.log('=== INICIANDO TESTE FLUXO OMIE ===')
    
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!
    )
    
    // 1. Buscar credenciais Omie
    const creds = await getOmieCredentials()
    if (!creds) {
      return res.json({ 
        success: false, 
        error: 'Credenciais Omie não configuradas' 
      })
    }
    
    console.log('✅ Credenciais Omie encontradas')
    
    // 2. Testar conexão com Omie
    try {
      const testResult = await testOmieConnection(creds)
      console.log('✅ Conexão Omie OK:', testResult)
    } catch (err: any) {
      console.log('❌ Erro conexão Omie:', err.message)
      return res.json({ 
        success: false, 
        error: 'Erro na conexão Omie: ' + err.message 
      })
    }
    
    // 3. Buscar produto com código Omie
    const { data: produtos } = await supabase
      .from('produtos')
      .select('id, nome, omie_codigo')
      .not('omie_codigo', 'is', null)
      .limit(1)
    
    if (!produtos || produtos.length === 0) {
      return res.json({ 
        success: false, 
        error: 'Nenhum produto com código Omie encontrado' 
      })
    }
    
    const produto = produtos[0]
    console.log(`✅ Produto encontrado: ${produto.nome} (código: ${produto.omie_codigo})`)
    
    // 4. Verificar se produto existe no Omie
    try {
      const consulta = await omieCall(
        '/geral/produtos/',
        'ConsultarProduto',
        [{ codigo_produto: parseInt(produto.omie_codigo!) }],
        { credentials: creds, skipCache: true }
      )
      
      if (consulta?.codigo_produto) {
        console.log('✅ Produto encontrado no Omie:', consulta.codigo_produto)
        console.log('   Nome:', consulta.descricao)
        
        res.json({ 
          success: true, 
          message: 'Teste concluído com sucesso!',
          data: {
            produto: produto,
            omie: {
              codigo: consulta.codigo_produto,
              nome: consulta.descricao,
              preco: consulta.preco_venda
            }
          }
        })
      } else {
        console.log('❌ Produto não encontrado no Omie')
        res.json({ 
          success: false, 
          error: `Produto ${produto.omie_codigo} não encontrado no Omie` 
        })
      }
    } catch (err: any) {
      console.log('❌ Erro ao consultar produto Omie:', err.message)
      res.json({ 
        success: false, 
        error: 'Erro ao consultar produto Omie: ' + err.message 
      })
    }
    
  } catch (err: any) {
    console.error('❌ Erro geral no teste:', err)
    res.status(500).json({ 
      success: false, 
      error: err.message 
    })
  }
})
