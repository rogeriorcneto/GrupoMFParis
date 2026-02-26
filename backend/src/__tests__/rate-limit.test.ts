import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rateLimit } from '../middleware/rate-limit.js'

// Mock de Request, Response e NextFunction do Express
function mockReq(overrides: Record<string, any> = {}): any {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  }
}

function mockRes(): any {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    status(code: number) { res.statusCode = code; return res },
    json(data: any) { res.body = data; return res },
    setHeader(key: string, value: string) { res.headers[key] = value },
  }
  return res
}

describe('rateLimit middleware', () => {
  it('permite requisições dentro do limite', () => {
    const middleware = rateLimit(5, 60_000)
    const req = mockReq({ userId: 'test-user-allow' })
    const res = mockRes()
    const next = vi.fn()

    for (let i = 0; i < 5; i++) {
      middleware(req, res, next)
    }

    expect(next).toHaveBeenCalledTimes(5)
    expect(res.statusCode).toBe(200)
  })

  it('bloqueia com 429 quando excede o limite', () => {
    const middleware = rateLimit(3, 60_000)
    const req = mockReq({ userId: 'test-user-block' })
    const next = vi.fn()

    // 3 permitidas
    for (let i = 0; i < 3; i++) {
      const res = mockRes()
      middleware(req, res, next)
    }
    expect(next).toHaveBeenCalledTimes(3)

    // 4ª bloqueada
    const resBlocked = mockRes()
    middleware(req, resBlocked, next)
    expect(next).toHaveBeenCalledTimes(3) // não chamou next de novo
    expect(resBlocked.statusCode).toBe(429)
    expect(resBlocked.body.success).toBe(false)
  })

  it('usa IP quando não há userId', () => {
    const middleware = rateLimit(2, 60_000)
    const next = vi.fn()

    const req1 = mockReq({ ip: '192.168.1.100' })
    const req2 = mockReq({ ip: '192.168.1.200' })

    // Cada IP tem seu próprio contador
    middleware(req1, mockRes(), next)
    middleware(req1, mockRes(), next)
    middleware(req2, mockRes(), next)

    expect(next).toHaveBeenCalledTimes(3)

    // IP1 bloqueado, IP2 ainda tem espaço
    const resBlocked = mockRes()
    middleware(req1, resBlocked, next)
    expect(resBlocked.statusCode).toBe(429)

    middleware(req2, mockRes(), next)
    expect(next).toHaveBeenCalledTimes(4)
  })

  it('adiciona headers X-RateLimit-*', () => {
    const middleware = rateLimit(10, 60_000)
    const req = mockReq({ userId: 'test-user-headers' })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(res.headers['X-RateLimit-Limit']).toBe('10')
    expect(res.headers['X-RateLimit-Remaining']).toBe('9')
  })
})
