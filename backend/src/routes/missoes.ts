import { Router } from 'express'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'
import { getVendedorByAuthId } from '../database.js'
import { requireAuth, requireGerente } from '../middleware/auth.js'

export const missoesRouter = Router()
missoesRouter.use(requireAuth)

// ─── Mapeamento DB ↔ API ─────────────────────────────────────────────────────

function missaoFromDb(row: any) {
  return {
    id: row.id,
    nome: row.nome,
    objetivo: row.objetivo || '',
    vendedorId: row.vendedor_id,
    estado: row.estado || '',
    cidades: row.cidades || [],
    dataSaida: row.data_saida,
    dataRetorno: row.data_retorno,
    veiculo: row.veiculo || '',
    hotel: row.hotel || '',
    status: row.status,
    metas: row.metas || {},
    custoEstimado: Number(row.custo_estimado) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function despesaFromDb(row: any) {
  return {
    id: row.id,
    missaoId: row.missao_id,
    vendedorId: row.vendedor_id,
    tipo: row.tipo,
    valor: Number(row.valor),
    data: row.data,
    comprovanteUrl: row.comprovante_url,
    observacao: row.observacao || '',
    createdAt: row.created_at,
  }
}

function tarefaFromDb(row: any) {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || '',
    data: row.data,
    hora: row.hora || '',
    tipo: row.tipo,
    status: row.status,
    prioridade: row.prioridade,
    clienteId: row.cliente_id,
    vendedorId: row.vendedor_id,
    missaoId: row.missao_id,
    diaMissao: row.dia_missao,
    ordem: row.ordem,
    chegadaEm: row.chegada_em,
    saidaEm: row.saida_em,
    localizacaoChegada: row.localizacao_chegada,
    localizacaoSaida: row.localizacao_saida,
    resultado: row.resultado,
    interesse: row.interesse,
    produtosApresentados: row.produtos_apresentados || [],
    proximosPassos: row.proximos_passos,
    amostrasEntregues: row.amostras_entregues,
    conclusao: row.conclusao,
  }
}

async function currentVendedor(req: any) {
  const userId = req.userId
  return userId ? getVendedorByAuthId(userId) : null
}

async function canAccessMission(vendedor: any, missao: any) {
  return !!vendedor && (vendedor.cargo === 'gerente' || missao.vendedor_id === vendedor.id)
}

// ─── Missões ───────────────────────────────────────────────────────────────────

missoesRouter.get('/', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const { status } = req.query
    let query = supabase.from('missoes').select('*').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error

    const list = (data || []).filter((m: any) => vendedor.cargo === 'gerente' || m.vendedor_id === vendedor.id)
    res.json({ success: true, data: list.map(missaoFromDb) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao listar missões')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const body = req.body
    if (!body.nome || !body.dataSaida || !body.dataRetorno) {
      res.status(400).json({ success: false, error: 'nome, dataSaida e dataRetorno são obrigatórios' })
      return
    }

    const vendedorId = vendedor.cargo === 'gerente' ? (body.vendedorId || vendedor.id) : vendedor.id
    const { data, error } = await supabase.from('missoes').insert({
      nome: body.nome,
      objetivo: body.objetivo || '',
      vendedor_id: vendedorId,
      estado: body.estado || '',
      cidades: body.cidades || [],
      data_saida: body.dataSaida,
      data_retorno: body.dataRetorno,
      veiculo: body.veiculo || '',
      hotel: body.hotel || '',
      status: body.status || 'planejada',
      metas: body.metas || null,
      custo_estimado: body.custoEstimado || null,
    }).select().single()

    if (error || !data) { res.status(400).json({ success: false, error: error?.message || 'Erro ao criar missão' }); return }
    res.json({ success: true, data: missaoFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao criar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.get('/:id', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!(await canAccessMission(vendedor, missao))) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const [{ data: tarefas }, { data: despesas }] = await Promise.all([
      supabase.from('tarefas').select('*').eq('missao_id', id).order('dia_missao', { ascending: true }).order('ordem', { ascending: true }),
      supabase.from('missao_despesas').select('*').eq('missao_id', id).order('data', { ascending: false }),
    ])

    res.json({
      success: true,
      data: {
        missao: missaoFromDb(missao),
        tarefas: (tarefas || []).map(tarefaFromDb),
        despesas: (despesas || []).map(despesaFromDb),
      },
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.put('/:id', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: missao, error: findError } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (findError || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!(await canAccessMission(vendedor, missao))) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const body = req.body
    const payload: any = {}
    const fields = ['nome','objetivo','vendedorId','estado','cidades','dataSaida','dataRetorno','veiculo','hotel','status','metas','custoEstimado'] as const
    for (const k of fields) if (body[k] !== undefined) {
      const db = k.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
      payload[db === 'vendedorId' ? 'vendedor_id' : db === 'custoEstimado' ? 'custo_estimado' : db === 'dataSaida' ? 'data_saida' : db === 'dataRetorno' ? 'data_retorno' : db] = body[k]
    }
    payload.updated_at = new Date().toISOString()

    const { data, error } = await supabase.from('missoes').update(payload).eq('id', id).select().single()
    if (error || !data) { res.status(400).json({ success: false, error: error?.message || 'Erro ao atualizar' }); return }
    res.json({ success: true, data: missaoFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao atualizar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.delete('/:id', requireGerente, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id)
    const { error } = await supabase.from('missoes').delete().eq('id', id)
    if (error) { res.status(400).json({ success: false, error: error.message }); return }
    res.json({ success: true })
  } catch (err: any) {
    log.error({ err }, 'Erro ao deletar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

// ─── Status / Roteiro ──────────────────────────────────────────────────────────

missoesRouter.post('/:id/iniciar', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!(await canAccessMission(vendedor, missao))) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data, error: updError } = await supabase.from('missoes').update({ status: 'em_andamento', updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (updError || !data) { res.status(400).json({ success: false, error: updError?.message || 'Erro' }); return }
    res.json({ success: true, data: missaoFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao iniciar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/:id/concluir', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!(await canAccessMission(vendedor, missao))) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data, error: updError } = await supabase.from('missoes').update({ status: 'concluida', updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (updError || !data) { res.status(400).json({ success: false, error: updError?.message || 'Erro' }); return }
    res.json({ success: true, data: missaoFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao concluir missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/:id/roteiro', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!(await canAccessMission(vendedor, missao))) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const visitas: any[] = req.body.visitas
    if (!Array.isArray(visitas) || visitas.length === 0) {
      res.status(400).json({ success: false, error: 'visitas (array) é obrigatório' })
      return
    }

    const inserts = visitas.map((v: any) => ({
      titulo: v.titulo || 'Visita',
      descricao: v.descricao || '',
      data: v.data,
      hora: v.hora || '',
      tipo: 'visita',
      status: 'pendente',
      prioridade: 'alta',
      cliente_id: v.clienteId || null,
      vendedor_id: missao.vendedor_id,
      missao_id: id,
      dia_missao: v.dia,
      ordem: v.ordem,
      amostras_entregues: 0,
    }))

    const { data: tarefas, error: insertError } = await supabase.from('tarefas').insert(inserts).select()
    if (insertError) { res.status(400).json({ success: false, error: insertError.message }); return }

    await supabase.from('missoes').update({ status: 'em_andamento', updated_at: new Date().toISOString() }).eq('id', id)
    res.json({ success: true, data: (tarefas || []).map(tarefaFromDb) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao criar roteiro')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

// ─── Despesas ─────────────────────────────────────────────────────────────────

missoesRouter.get('/:id/despesas', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('vendedor_id').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!(await canAccessMission(vendedor, missao))) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data, error: qError } = await supabase.from('missao_despesas').select('*').eq('missao_id', id).order('data', { ascending: false })
    if (qError) throw qError
    res.json({ success: true, data: (data || []).map(despesaFromDb) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao listar despesas')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/:id/despesas', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('vendedor_id').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!(await canAccessMission(vendedor, missao))) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const body = req.body
    if (!body.tipo || body.valor === undefined || !body.data) {
      res.status(400).json({ success: false, error: 'tipo, valor e data são obrigatórios' })
      return
    }

    const { data, error: insertError } = await supabase.from('missao_despesas').insert({
      missao_id: id,
      vendedor_id: vendedor.id,
      tipo: body.tipo,
      valor: body.valor,
      data: body.data,
      comprovante_url: body.comprovanteUrl || null,
      observacao: body.observacao || '',
    }).select().single()

    if (insertError || !data) { res.status(400).json({ success: false, error: insertError?.message || 'Erro' }); return }
    res.json({ success: true, data: despesaFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao criar despesa')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

// ─── Check-in / Check-out de visitas ─────────────────────────────────────────────

missoesRouter.post('/tarefas/:id/checkin', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: tarefa, error } = await supabase.from('tarefas').select('*, missao:vendedor_id').eq('id', id).single()
    // select vendedor_id via missão? simpler: select * misses
    if (error || !tarefa) { res.status(404).json({ success: false, error: 'Tarefa não encontrada' }); return }
    if (vendedor.cargo !== 'gerente' && tarefa.vendedor_id !== vendedor.id) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data, error: upd } = await supabase.from('tarefas').update({
      chegada_em: new Date().toISOString(),
      localizacao_chegada: req.body.location || null,
      status: 'em_andamento' as any, // permissão para check-in sem concluir
    }).eq('id', id).select().single()
    if (upd || !data) { res.status(400).json({ success: false, error: upd?.message || 'Erro' }); return }
    res.json({ success: true, data: tarefaFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro no check-in')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/tarefas/:id/checkout', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: tarefa, error } = await supabase.from('tarefas').select('*').eq('id', id).single()
    if (error || !tarefa) { res.status(404).json({ success: false, error: 'Tarefa não encontrada' }); return }
    if (vendedor.cargo !== 'gerente' && tarefa.vendedor_id !== vendedor.id) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const body = req.body
    const { data, error: upd } = await supabase.from('tarefas').update({
      saida_em: new Date().toISOString(),
      localizacao_saida: body.location || null,
      resultado: body.resultado || null,
      interesse: body.interesse || null,
      produtos_apresentados: body.produtosApresentados || [],
      proximos_passos: body.proximosPassos || null,
      amostras_entregues: body.amostrasEntregues ?? 0,
      status: 'concluida',
      conclusao: body.resultado || null,
    }).eq('id', id).select().single()
    if (upd || !data) { res.status(400).json({ success: false, error: upd?.message || 'Erro' }); return }
    res.json({ success: true, data: tarefaFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro no check-out')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

// ─── Dashboard / Relatório do gerente ───────────────────────────────────────────

missoesRouter.get('/dashboard', requireGerente, async (req: any, res: any) => {
  try {
    const { data: missoes, error } = await supabase.from('missoes').select('*, tarefas:tarefas(*)')
    if (error) throw error

    const ativas = (missoes || []).filter((m: any) => m.status === 'em_andamento')
    const totalVisitas = ativas.reduce((s: number, m: any) => s + (m.tarefas?.length || 0), 0)
    const visitasConcluidas = ativas.reduce((s: number, m: any) => s + (m.tarefas?.filter((t: any) => t.status === 'concluida').length || 0), 0)
    const despesas = ativas.length
    const vendedoresEmCampo = new Set(ativas.map((m: any) => m.vendedor_id)).size

    res.json({
      success: true,
      data: {
        missoesAtivas: ativas.length,
        vendedoresEmCampo,
        totalVisitas,
        visitasConcluidas,
        despesas,
        missoes: (missoes || []).map(missaoFromDb),
      },
    })
  } catch (err: any) {
    log.error({ err }, 'Erro no dashboard')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})
