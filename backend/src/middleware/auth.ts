import type { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { CONFIG } from '../config.js'

/**
 * Middleware de autenticação para proteger endpoints da API.
 * Valida o token JWT do Supabase enviado no header Authorization.
 * 
 * O frontend deve enviar: Authorization: Bearer <supabase_access_token>
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Token de autenticação não fornecido.' })
    return
  }

  const token = authHeader.slice(7) // Remove 'Bearer '

  try {
    // Validate token by getting user from Supabase
    const tempClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: { user }, error } = await tempClient.auth.getUser(token)

    if (error || !user) {
      res.status(401).json({ success: false, error: 'Token inválido ou expirado.' })
      return
    }

    // Attach user to request for downstream use
    ;(req as any).userId = user.id
    ;(req as any).userEmail = user.email

    next()
  } catch (err) {
    console.error('Erro na autenticação:', err)
    res.status(401).json({ success: false, error: 'Erro ao validar token.' })
  }
}

/**
 * Middleware que verifica se o usuário é gerente.
 * Deve ser usado APÓS requireAuth.
 */
export async function requireGerente(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as any).userId
  if (!userId) {
    res.status(401).json({ success: false, error: 'Não autenticado.' })
    return
  }

  try {
    const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: false },
    })

    const { data, error } = await supabase
      .from('vendedores')
      .select('cargo')
      .eq('auth_id', userId)
      .single()

    if (error || !data || data.cargo !== 'gerente') {
      res.status(403).json({ success: false, error: 'Acesso restrito ao gerente.' })
      return
    }

    next()
  } catch (err) {
    console.error('Erro ao verificar cargo:', err)
    res.status(403).json({ success: false, error: 'Erro ao verificar permissões.' })
  }
}
