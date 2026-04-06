import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock config-store
vi.mock('../config-store.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    omieAppKey: 'ENC:fake-app-key',
    omieAppSecret: 'ENC:fake-app-secret',
  }),
}))

// Mock crypto
vi.mock('../crypto.js', () => ({
  encrypt: (text: string) => `ENC:${text}`,
  decrypt: (text: string) => text.startsWith('ENC:') ? text.slice(4) : text,
}))

// Mock logger
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { getOmieCredentials, omieCall, omieCallAllPages, testOmieConnection } from '../omie/client.js'

describe('Omie Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getOmieCredentials', () => {
    it('retorna credenciais decriptadas do config-store', async () => {
      const creds = await getOmieCredentials()
      expect(creds).toEqual({ appKey: 'fake-app-key', appSecret: 'fake-app-secret' })
    })

    it('retorna null quando appKey está vazia', async () => {
      const { loadConfig } = await import('../config-store.js')
      vi.mocked(loadConfig).mockResolvedValueOnce({
        omieAppKey: '', omieAppSecret: 'ENC:secret',
        emailHost: '', emailPort: 587, emailUser: '', emailPass: '',
        emailFrom: '', emailImapHost: '', emailImapPort: 993, emailImapUser: '', emailImapPass: '', emailImapSecure: true, whatsappNumero: '',
        twilioAccountSid: '', twilioAuthToken: '', twilioPhoneNumber: '', twilioTwimlAppSid: '', twilioApiKey: '', twilioApiSecret: '',
      })
      const creds = await getOmieCredentials()
      expect(creds).toBeNull()
    })

    it('retorna null quando appSecret está vazia', async () => {
      const { loadConfig } = await import('../config-store.js')
      vi.mocked(loadConfig).mockResolvedValueOnce({
        omieAppKey: 'ENC:key', omieAppSecret: '',
        emailHost: '', emailPort: 587, emailUser: '', emailPass: '',
        emailFrom: '', emailImapHost: '', emailImapPort: 993, emailImapUser: '', emailImapPass: '', emailImapSecure: true, whatsappNumero: '',
        twilioAccountSid: '', twilioAuthToken: '', twilioPhoneNumber: '', twilioTwimlAppSid: '', twilioApiKey: '', twilioApiSecret: '',
      })
      const creds = await getOmieCredentials()
      expect(creds).toBeNull()
    })
  })

  describe('omieCall', () => {
    it('lança erro quando credenciais não configuradas', async () => {
      const { loadConfig } = await import('../config-store.js')
      vi.mocked(loadConfig).mockResolvedValueOnce({
        omieAppKey: '', omieAppSecret: '',
        emailHost: '', emailPort: 587, emailUser: '', emailPass: '',
        emailFrom: '', emailImapHost: '', emailImapPort: 993, emailImapUser: '', emailImapPass: '', emailImapSecure: true, whatsappNumero: '',
        twilioAccountSid: '', twilioAuthToken: '', twilioPhoneNumber: '', twilioTwimlAppSid: '', twilioApiKey: '', twilioApiSecret: '',
      })
      await expect(
        omieCall('/geral/clientes/', 'ListarClientes', [{}])
      ).rejects.toThrow('Credenciais Omie não configuradas')
    })

    it('envia body com app_key, app_secret, call e param', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ clientes_cadastro: [] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await omieCall(
        '/geral/clientes/',
        'ListarClientes',
        [{ pagina: 1, registros_por_pagina: 10 }],
        { credentials: { appKey: 'KEY', appSecret: 'SECRET' }, skipCache: true }
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.omie.com.br/api/v1/geral/clientes/',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.app_key).toBe('KEY')
      expect(body.app_secret).toBe('SECRET')
      expect(body.call).toBe('ListarClientes')
      expect(body.param).toEqual([{ pagina: 1, registros_por_pagina: 10 }])

      vi.unstubAllGlobals()
    })

    it('lança erro quando API retorna faultstring', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ faultstring: 'APP_KEY inválida' }),
      }))

      await expect(
        omieCall('/geral/clientes/', 'ListarClientes', [{}], {
          credentials: { appKey: 'BAD', appSecret: 'BAD' }, skipCache: true,
        })
      ).rejects.toThrow('APP_KEY inválida')

      vi.unstubAllGlobals()
    })

    it('lança erro quando HTTP 425 (bloqueio por excesso)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 425,
        json: () => Promise.resolve({}),
      }))

      await expect(
        omieCall('/geral/clientes/', 'ListarClientes', [{}], {
          credentials: { appKey: 'K', appSecret: 'S' }, skipCache: true,
        })
      ).rejects.toThrow('bloqueou requisições')

      vi.unstubAllGlobals()
    })

    it('usa cache em chamadas idênticas (sem skipCache)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ resultado: 'ok' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const creds = { appKey: 'K', appSecret: 'S' }
      const r1 = await omieCall('/test/', 'TestCall', [{ x: 1 }], { credentials: creds })
      const r2 = await omieCall('/test/', 'TestCall', [{ x: 1 }], { credentials: creds })

      expect(r1).toEqual(r2)
      // Primeira chamada faz fetch, segunda usa cache
      expect(mockFetch).toHaveBeenCalledTimes(1)

      vi.unstubAllGlobals()
    })
  })

  describe('omieCallAllPages', () => {
    it('concatena resultados de múltiplas páginas', async () => {
      let callCount = 0
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve(
            callCount === 1
              ? { total_de_paginas: 2, items: [{ id: 1 }, { id: 2 }] }
              : { total_de_paginas: 2, items: [{ id: 3 }] }
          ),
        })
      }))

      const results = await omieCallAllPages(
        '/test/', 'ListAll', {}, 'items', 2,
        { credentials: { appKey: 'K', appSecret: 'S' } }
      )

      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
      expect(results).toHaveLength(3)

      vi.unstubAllGlobals()
    })

    it('retorna array vazio quando API retorna sem registros', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ total_de_paginas: 1 }),
      }))

      const results = await omieCallAllPages(
        '/test/', 'List', {}, 'registros', 100,
        { credentials: { appKey: 'K', appSecret: 'S' } }
      )

      expect(results).toEqual([])

      vi.unstubAllGlobals()
    })
  })

  describe('testOmieConnection', () => {
    it('retorna success com empresa quando conecta', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({
          clientes_cadastro: [{ razao_social: 'MF Paris LTDA' }],
        }),
      }))

      const result = await testOmieConnection({ appKey: 'K', appSecret: 'S' })
      expect(result.success).toBe(true)
      expect(result.empresa).toBe('MF Paris LTDA')

      vi.unstubAllGlobals()
    })

    it('retorna erro quando credenciais não configuradas', async () => {
      const { loadConfig } = await import('../config-store.js')
      vi.mocked(loadConfig).mockResolvedValueOnce({
        omieAppKey: '', omieAppSecret: '',
        emailHost: '', emailPort: 587, emailUser: '', emailPass: '',
        emailFrom: '', emailImapHost: '', emailImapPort: 993, emailImapUser: '', emailImapPass: '', emailImapSecure: true, whatsappNumero: '',
        twilioAccountSid: '', twilioAuthToken: '', twilioPhoneNumber: '', twilioTwimlAppSid: '', twilioApiKey: '', twilioApiSecret: '',
      })

      const result = await testOmieConnection()
      expect(result.success).toBe(false)
      expect(result.error).toContain('não configuradas')
    })

    it('retorna erro quando API rejeita credenciais', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ faultstring: 'Chave de acesso inválida' }),
      }))

      const result = await testOmieConnection({ appKey: 'BAD', appSecret: 'BAD' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Chave de acesso inválida')

      vi.unstubAllGlobals()
    })
  })
})
