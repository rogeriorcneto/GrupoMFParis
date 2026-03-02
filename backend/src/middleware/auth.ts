import type { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { CONFIG } from '../config.js'
import { log } from '../logger.js'

// Shared Supabase client for auth operations (no session persistence needed)
const authClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// P1-6: TTL cache to avoid 1-2 DB queries per request
const AUTH_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const authCache = new Map<string, { userId: string; email: string; expiresAt: number }>()
const cargoCache = new Map<string, { cargo: string; expiresAt: number }>()

// Cleanup stale cache entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of authCache) if (v.expiresAt < now) authCache.delete(k)
  for (const [k, v] of cargoCache) if (v.expiresAt < now) cargoCache.delete(k)
}, 10 * 60_000)

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

  // Check cache first
  const cached = authCache.get(token)
  if (cached && cached.expiresAt > Date.now()) {
    ;(req as any).userId = cached.userId
    ;(req as any).userEmail = cached.email
    next()
    return
  }

  try {
    // Validate token by getting user from Supabase (reuses shared client)
    const { data: { user }, error } = await authClient.auth.getUser(token)

    if (error || !user) {
      authCache.delete(token)
      res.status(401).json({ success: false, error: 'Token inválido ou expirado.' })
      return
    }

    // Cache the result
    authCache.set(token, { userId: user.id, email: user.email || '', expiresAt: Date.now() + AUTH_CACHE_TTL })

    // Attach user to request for downstream use
    ;(req as any).userId = user.id
    ;(req as any).userEmail = user.email

    next()
  } catch (err) {
    log.error({ err }, 'Erro na autenticação')
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

  // Check cargo cache first
  const cached = cargoCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.cargo !== 'gerente') {
      res.status(403).json({ success: false, error: 'Acesso restrito ao gerente.' })
      return
    }
    next()
    return
  }

  try {
    const { data, error } = await authClient
      .from('vendedores')
      .select('cargo')
      .eq('auth_id', userId)
      .single()

    if (error || !data) {
      res.status(403).json({ success: false, error: 'Acesso restrito ao gerente.' })
      return
    }

    // Cache the cargo
    cargoCache.set(userId, { cargo: data.cargo, expiresAt: Date.now() + AUTH_CACHE_TTL })

    if (data.cargo !== 'gerente') {
      res.status(403).json({ success: false, error: 'Acesso restrito ao gerente.' })
      return
    }

    next()
  } catch (err) {
    log.error({ err }, 'Erro ao verificar cargo')
    res.status(403).json({ success: false, error: 'Erro ao verificar permissões.' })
  }
}
