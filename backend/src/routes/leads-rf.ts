import { Router } from 'express'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'

export const leadsRfRouter = Router()

// GET /api/leads-rf/buscar
// Query: uf, municipio, cnae, q (palavra-chave), page, limit
leadsRfRouter.get('/buscar', async (req, res) => {
  try {
    const uf       = String(req.query.uf       || '').trim().toUpperCase()
    const municipio= String(req.query.municipio|| '').trim().toUpperCase()
    const cnae     = String(req.query.cnae     || '').trim()
    const q        = String(req.query.q        || '').trim()
    const page     = Math.max(1, parseInt(String(req.query.page  || '1'),  10))
    const limit    = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '50'), 10)))
    const offset   = (page - 1) * limit

    let query = supabase
      .from('leads_rf')
      .select(
        'cnpj,cnpj_basico,razao_social,nome_fantasia,cnae,municipio,uf,logradouro,bairro,cep,telefone,email,importado',
        { count: 'exact' }
      )

    if (uf)        query = query.eq('uf', uf)
    if (cnae)      query = query.eq('cnae', cnae)
    if (municipio) query = query.ilike('municipio', `%${municipio}%`)
    if (q)         query = query.or(`razao_social.ilike.%${q}%,nome_fantasia.ilike.%${q}%`)

    const { data, error, count } = await query
      .order('razao_social', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      log.error({ error }, 'Erro ao buscar leads RF')
      res.status(500).json({ success: false, error: error.message })
      return
    }

    res.json({
      success: true,
      leads: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (err: any) {
    log.error({ err }, 'Erro em /leads-rf/buscar')
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/leads-rf/importar — marca CNPJs como importados
leadsRfRouter.post('/importar', async (req, res) => {
  const { cnpjs } = req.body
  if (!cnpjs || !Array.isArray(cnpjs) || cnpjs.length === 0) {
    res.status(400).json({ success: false, error: 'Campo obrigatorio: cnpjs[]' })
    return
  }
  if (cnpjs.length > 200) {
    res.status(400).json({ success: false, error: 'Maximo 200 CNPJs por vez' })
    return
  }
  try {
    const { error } = await supabase
      .from('leads_rf')
      .update({ importado: true })
      .in('cnpj', cnpjs)
    if (error) { res.status(500).json({ success: false, error: error.message }); return }
    res.json({ success: true, atualizados: cnpjs.length })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/leads-rf/municipios?uf=SP
leadsRfRouter.get('/municipios', async (req, res) => {
  const uf = String(req.query.uf || '').trim().toUpperCase()
  if (!uf) { res.status(400).json({ success: false, error: 'Parametro uf obrigatorio' }); return }
  try {
    const { data, error } = await supabase
      .from('leads_rf')
      .select('municipio')
      .eq('uf', uf)
      .order('municipio', { ascending: true })
    if (error) { res.status(500).json({ success: false, error: error.message }); return }
    const municipios = [...new Set((data || []).map((r: any) => r.municipio).filter(Boolean))].sort()
    res.json({ success: true, municipios })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
