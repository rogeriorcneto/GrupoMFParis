import type { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { CONFIG } from '../config.js'
import { supabase as serviceSupabase } from '../supabase.js'
import { log } from '../logger.js'

// Shared Supabase client for auth operations (no session persistence needed)
const authClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface CachedVendedor {
  id: number
  nome: string
  email: string
  cargo: string
  ativo: boolean
}

const AUTH_CACHE_TTL = 60 * 1000 // 1 min para refletir desativações rapidamente
const authCache = new Map<string, { userId: string; email: string; vendedor: CachedVendedor | null; expiresAt: number }>()

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of authCache) if (v.expiresAt < now) authCache.delete(k)
}, 5 * 60_000)

async function fetchVendedorByAuth(userId: string): Promise<CachedVendedor | null> {
  const { data, error } = await serviceSupabase
    .from('vendedores')
    .select('id, nome, email, cargo, ativo')
    .eq('auth_id', userId)
    .order('ativo', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: Number(data.id),
    nome: String(data.nome || ''),
    email: String(data.email || ''),
    cargo: String(data.cargo || 'vendedor'),
    ativo: data.ativo !== false,
  }
}

/**
 * Middleware de autenticação para proteger endpoints da API.
 * Valida o JWT do Supabase E bloqueia imediatamente contas desativadas (ativo = false).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Token de autenticação não fornecido.' })
    return
  }

  const token = authHeader.slice(7)

  const cached = authCache.get(token)
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.vendedor && !cached.vendedor.ativo) {
      res.status(403).json({ success: false, error: 'Conta desativada.' })
      return
    }
    ;(req as any).userId = cached.userId
    ;(req as any).userEmail = cached.email
    ;(req as any).vendedor = cached.vendedor
    ;(req as any).supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    next()
    return
  }

  try {
    const { data: { user }, error } = await authClient.auth.getUser(token)

    if (error || !user) {
      authCache.delete(token)
      res.status(401).json({ success: false, error: 'Token inválido ou expirado.' })
      return
    }

    const vendedor = await fetchVendedorByAuth(user.id)
    if (vendedor && !vendedor.ativo) {
      authCache.delete(token)
      res.status(403).json({ success: false, error: 'Conta desativada.' })
      return
    }

    authCache.set(token, {
      userId: user.id,
      email: user.email || '',
      vendedor,
      expiresAt: Date.now() + AUTH_CACHE_TTL,
    })

    ;(req as any).userId = user.id
    ;(req as any).userEmail = user.email
    ;(req as any).vendedor = vendedor
    ;(req as any).supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    next()
  } catch (err) {
    log.error({ err }, 'Erro na autenticação')
    res.status(401).json({ success: false, error: 'Erro ao validar token.' })
  }
}

/**
 * Middleware que verifica se o usuário é gerente ativo.
 * Deve ser usado APÓS requireAuth.
 */
export async function requireGerente(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as any).userId
  if (!userId) {
    res.status(401).json({ success: false, error: 'Não autenticado.' })
    return
  }

  const vendReq = (req as any).vendedor as CachedVendedor | null | undefined
  if (vendReq) {
    if (!vendReq.ativo || vendReq.cargo !== 'gerente') {
      res.status(403).json({ success: false, error: 'Acesso restrito ao gerente.' })
      return
    }
    next()
    return
  }

  try {
    const vend = await fetchVendedorByAuth(userId)
    if (!vend || !vend.ativo || vend.cargo !== 'gerente') {
      res.status(403).json({ success: false, error: 'Acesso restrito ao gerente.' })
      return
    }
    ;(req as any).vendedor = vend
    next()
  } catch (err) {
    log.error({ err }, 'Erro ao verificar cargo')
    res.status(403).json({ success: false, error: 'Erro ao verificar permissões.' })
  }
}
