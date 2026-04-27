import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('../ai-functions.js', () => ({
  FUNCTION_DECLARATIONS: [],
  executeFunction: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
}))

vi.mock('../database.js', () => ({
  getVendedorByAuthId: vi.fn().mockResolvedValue(null),
}))

vi.mock('../whatsapp-multi.js', () => ({
  sendUserWhatsAppMessage: vi.fn(),
  getUserWhatsAppSession: vi.fn().mockReturnValue(null),
}))

vi.mock('../email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}))

import { geminiHandler } from '../gemini.js'

function mockReqRes(body: any = {}) {
  const req = { body } as any
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as any
  return { req, res }
}

describe('geminiHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GEMINI_API_KEY
    vi.unstubAllGlobals()
  })

  it('sem GEMINI_API_KEY retorna 500', async () => {
    const { req, res } = mockReqRes({ messages: [{ role: 'user', content: 'oi' }], systemInstruction: 'ctx' })
    await geminiHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
  })

  it('sem messages retorna 400', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const { req, res } = mockReqRes({ systemInstruction: 'ctx' })
    await geminiHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('obrigatórios'),
    }))
  })

  it('sem systemInstruction retorna 400', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const { req, res } = mockReqRes({ messages: [{ role: 'user', content: 'oi' }] })
    await geminiHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('Gemini API retorna erro HTTP → 500', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded'),
    }))
    const { req, res } = mockReqRes({
      messages: [{ role: 'user', content: 'oi' }],
      systemInstruction: 'ctx',
    })
    await geminiHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('429'),
    }))
  })

  it('Gemini API OK retorna resposta', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Olá!' }] } }],
      }),
    }))
    const { req, res } = mockReqRes({
      messages: [{ role: 'user', content: 'oi' }],
      systemInstruction: 'ctx',
    })
    await geminiHandler(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, response: 'Olá!' }))
  })

  it('Gemini sem candidates retorna fallback', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Sem resposta da IA.' }] } }] }),
    }))
    const { req, res } = mockReqRes({
      messages: [{ role: 'user', content: 'oi' }],
      systemInstruction: 'ctx',
    })
    await geminiHandler(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
  })

  it('constrói payload correto com system instruction e messages', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    })
    vi.stubGlobal('fetch', mockFetch)
    const { req, res } = mockReqRes({
      messages: [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'resp1' },
        { role: 'user', content: 'msg2' },
      ],
      systemInstruction: 'system-ctx',
    })
    await geminiHandler(req, res)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('test-key')
    const body = JSON.parse(opts.body)
    // systemInstruction é campo separado, não dentro de contents
    expect(body.systemInstruction.parts[0].text).toBe('system-ctx')
    // messages mapeadas: user/assistant → user/model
    expect(body.contents[0].role).toBe('user')
    expect(body.contents[0].parts[0].text).toBe('msg1')
    expect(body.contents[1].role).toBe('model')
    expect(body.contents[1].parts[0].text).toBe('resp1')
    expect(body.contents[2].role).toBe('user')
    expect(body.contents[2].parts[0].text).toBe('msg2')
    expect(body.generationConfig.temperature).toBe(0.7)
  })

  it('fetch throw → 500 com mensagem de erro', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
    const { req, res } = mockReqRes({
      messages: [{ role: 'user', content: 'oi' }],
      systemInstruction: 'ctx',
    })
    await geminiHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('Network down'),
    }))
  })
})
