import { Router } from 'express'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'

export const vendedoresRouter = Router()

/**
 * POST /api/vendedores
 * Cria um novo usuário no Supabase Auth + insere na tabela vendedores.
 * Usa Service Role Key (admin API) — só funciona no backend.
 * Requer requireAuth + requireGerente (montado no index.ts).
 */
vendedoresRouter.post('/', async (req, res) => {
  const { email, password, vendedorData } = req.body

  if (!email || !password || !vendedorData || !vendedorData.nome) {
    res.status(400).json({ success: false, error: 'email, password e vendedorData.nome são obrigatórios.' })
    return
  }

  try {
    // 1. Criar usuário no Supabase Auth com Service Role (admin API)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // pular confirmação de e-mail (fluxo administrativo)
      user_metadata: {
        nome: vendedorData.nome,
        cargo: vendedorData.cargo || 'vendedor',
      },
    })

    if (authError || !authData.user) {
      res.status(400).json({ success: false, error: `Erro ao criar login: ${authError?.message || 'Erro desconhecido'}` })
      return
    }

    // 2. Inserir na tabela vendedores COM auth_id
    const { data: vendedorRow, error: dbError } = await supabase
      .from('vendedores')
      .insert({
        auth_id: authData.user.id,
        nome: vendedorData.nome,
        email,
        telefone: vendedorData.telefone || null,
        cargo: vendedorData.cargo || 'vendedor',
        avatar: vendedorData.avatar || null,
        meta_vendas: vendedorData.metaVendas || null,
        meta_leads: vendedorData.metaLeads || null,
        meta_conversao: vendedorData.metaConversao || null,
        ativo: vendedorData.ativo !== undefined ? vendedorData.ativo : true,
      })
      .select()
      .single()

    if (dbError || !vendedorRow) {
      // Tentar limpar o usuário criado no Auth se falhou a inserção na tabela
      await supabase.auth.admin.deleteUser(authData.user.id)
      res.status(400).json({ success: false, error: `Erro ao salvar vendedor: ${dbError?.message || 'Erro desconhecido'}` })
      return
    }

    log.info({ userId: authData.user.id, email }, 'Vendedor criado via admin API')
    res.json({ success: true, data: vendedorRow })
  } catch (err: any) {
    log.error({ err }, 'Erro ao criar vendedor')
    res.status(500).json({ success: false, error: err?.message || 'Erro interno do servidor.' })
  }
})
