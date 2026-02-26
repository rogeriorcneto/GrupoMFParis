import type { Request, Response, NextFunction } from 'express'

/**
 * Rate limiter in-memory por IP + userId (sliding window).
 * Sem dependências externas — usa Map nativo.
 */
const hits = new Map<string, number[]>()

// Limpar entradas antigas a cada 5 minutos para evitar memory leak
setInterval(() => {
  const now = Date.now()
  for (const [key, timestamps] of hits.entries()) {
    const recent = timestamps.filter(t => now - t < 120_000)
    if (recent.length === 0) hits.delete(key)
    else hits.set(key, recent)
  }
}, 5 * 60_000)

export function rateLimit(maxRequests: number = 60, windowMs: number = 60_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as any).userId || ''
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const key = userId ? `user:${userId}` : `ip:${ip}`

    const now = Date.now()
    const timestamps = (hits.get(key) || []).filter(t => now - t < windowMs)

    if (timestamps.length >= maxRequests) {
      res.status(429).json({
        success: false,
        error: 'Muitas requisições. Aguarde um momento antes de tentar novamente.',
      })
      return
    }

    timestamps.push(now)
    hits.set(key, timestamps)

    // Headers informativos (padrão RFC 6585)
    res.setHeader('X-RateLimit-Limit', maxRequests.toString())
    res.setHeader('X-RateLimit-Remaining', (maxRequests - timestamps.length).toString())

    next()
  }
}
