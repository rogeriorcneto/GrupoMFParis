import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('logger', () => {
  const originalConsoleLog = console.log
  const originalConsoleWarn = console.warn
  const originalConsoleError = console.error

  beforeEach(() => {
    console.log = vi.fn()
    console.warn = vi.fn()
    console.error = vi.fn()
    // Reset module cache to re-evaluate import.meta.env.DEV
    vi.resetModules()
  })

  afterEach(() => {
    console.log = originalConsoleLog
    console.warn = originalConsoleWarn
    console.error = originalConsoleError
  })

  it('em DEV: logger.log chama console.log', async () => {
    // Vitest roda em mode test, que é DEV por padrão
    const { logger } = await import('../utils/logger')
    logger.log('teste')
    expect(console.log).toHaveBeenCalledWith('teste')
  })

  it('em DEV: logger.warn chama console.warn', async () => {
    const { logger } = await import('../utils/logger')
    logger.warn('aviso')
    expect(console.warn).toHaveBeenCalledWith('aviso')
  })

  it('em DEV: logger.error chama console.error', async () => {
    const { logger } = await import('../utils/logger')
    logger.error('erro', new Error('test'))
    expect(console.error).toHaveBeenCalledWith('erro', expect.any(Error))
  })

  it('aceita múltiplos argumentos', async () => {
    const { logger } = await import('../utils/logger')
    logger.log('a', 'b', 123)
    expect(console.log).toHaveBeenCalledWith('a', 'b', 123)
  })
})
