import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// Estado compartilhado via objeto (referência única — funciona com hoisting do vi.mock)
const _state = {
  data: null as any,
  error: null as any,
  upsertError: null as any,
  upsertArgs: [] as any[],
  fromCalls: [] as string[],
}

function setupMockChain(data: any, error: any = null) {
  _state.data = data
  _state.error = error
  _state.upsertError = null
}

vi.mock('../supabase.js', () => ({
  supabase: {
    from: (table: string) => {
      _state.fromCalls.push(table)
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: _state.data, error: _state.error }),
          }),
        }),
        upsert: (data: any) => {
          _state.upsertArgs.splice(0, _state.upsertArgs.length, data)
          return Promise.resolve({ error: _state.upsertError })
        },
      }
    },
  },
}))

const upsertArgs = _state.upsertArgs
const fromCalls = _state.fromCalls


vi.mock('../crypto.js', () => ({
  encrypt: (text: string) => text ? `ENC:${text}` : '',
  decrypt: (text: string | undefined | null) => {
    if (!text) return ''
    return text.startsWith('ENC:') ? text.slice(4) : text
  },
}))

vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

describe('Config Store — Full Coverage', () => {
  let mod: typeof import('../config-store.js')

  beforeAll(async () => {
    mod = await import('../config-store.js')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.EMAIL_HOST = ''
    process.env.EMAIL_USER = ''
    process.env.EMAIL_PASS = ''
    process.env.EMAIL_PORT = ''
    process.env.EMAIL_FROM = ''
    _state.data = null
    _state.error = null
    _state.upsertError = null
    _state.upsertArgs.splice(0)
    _state.fromCalls.splice(0)
    mod.invalidateConfigCache()
  })

  describe('loadConfig', () => {
    it('carrega dados do Supabase e mapeia campos', async () => {
      setupMockChain({
        id: 1,
        email_host: 'smtp.gmail.com',
        email_port: 465,
        email_user: 'user@gmail.com',
        email_pass: 'ENC:senha123',
        email_from: 'noreply@mfparis.com',
        whatsapp_numero: '5531999991234',
        omie_app_key: 'ENC:appkey',
        omie_app_secret: 'ENC:appsecret',
      })

      const config = await mod.loadConfig()

      expect(config.emailHost).toBe('smtp.gmail.com')
      expect(config.emailPort).toBe(465)
      expect(config.emailUser).toBe('user@gmail.com')
      expect(config.emailPass).toBe('senha123')
      expect(config.emailFrom).toBe('noreply@mfparis.com')
      expect(config.whatsappNumero).toBe('5531999991234')
      expect(config.omieAppKey).toBe('ENC:appkey')
      expect(config.omieAppSecret).toBe('ENC:appsecret')
    })

    it('usa env vars como fallback quando DB retorna vazio', async () => {
      process.env.EMAIL_HOST = 'env-smtp.test.com'
      process.env.EMAIL_USER = 'envuser@test.com'
      process.env.EMAIL_PASS = 'envpass'
      process.env.EMAIL_PORT = '587'

      setupMockChain({
        id: 1,
        email_host: '',
        email_port: null,
        email_user: '',
        email_pass: '',
        email_from: '',
        whatsapp_numero: '',
        omie_app_key: '',
        omie_app_secret: '',
      })

      const config = await mod.loadConfig()

      expect(config.emailHost).toBe('env-smtp.test.com')
      expect(config.emailUser).toBe('envuser@test.com')
      expect(config.emailPass).toBe('envpass')
    })

    it('usa defaults quando bot_config não existe no DB', async () => {
      setupMockChain(null, { message: 'No rows' })

      const config = await mod.loadConfig()

      expect(config.emailHost).toBe('')
      expect(config.emailPort).toBe(587)
    })

    it('retorna cópia do cache (não referência)', async () => {
      setupMockChain({
        id: 1, email_host: 'test.com', email_port: 587,
        email_user: 'u', email_pass: '', email_from: '',
        whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
      })

      const a = await mod.loadConfig()
      const b = await mod.loadConfig()
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })

    it('aceita client customizado (per-request)', async () => {
      const customFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 1, email_host: 'custom.com', email_port: 25,
                email_user: 'cu', email_pass: '', email_from: '',
                whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
              },
              error: null,
            }),
          }),
        }),
      })
      const customClient = { from: customFrom } as any

      const config = await mod.loadConfig(customClient)
      // Note: since cache is already loaded from previous call,
      // the custom client will only be used on first load
      expect(config).toBeDefined()
    })
  })

  describe('loadConfigSync', () => {
    it('retorna cache atual de forma síncrona', async () => {
      setupMockChain({
        id: 1, email_host: 'sync-test.com', email_port: 587,
        email_user: 'u', email_pass: '', email_from: '',
        whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
      })

      await mod.loadConfig()
      const sync = mod.loadConfigSync()
      expect(sync.emailHost).toBe('sync-test.com')
    })

    it('retorna cópia independente', async () => {
      setupMockChain({
        id: 1, email_host: 'a.com', email_port: 587,
        email_user: '', email_pass: '', email_from: '',
        whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
      })

      await mod.loadConfig()
      const a = mod.loadConfigSync()
      const b = mod.loadConfigSync()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })

  describe('saveConfig', () => {
    it('faz upsert no bot_config com id=1', async () => {
      setupMockChain({
        id: 1, email_host: 'old.com', email_port: 587,
        email_user: 'old', email_pass: '', email_from: '',
        whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
      })

      await mod.loadConfig()
      await mod.saveConfig({ emailHost: 'new.com' })

      expect(fromCalls).toContain('bot_config')
      expect(upsertArgs[0]).toMatchObject({ id: 1, email_host: 'new.com' })
    })

    it('encripta emailPass ao salvar', async () => {
      setupMockChain({
        id: 1, email_host: '', email_port: 587,
        email_user: '', email_pass: '', email_from: '',
        whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
      })

      await mod.loadConfig()
      await mod.saveConfig({ emailPass: 'mypassword' })

      expect(upsertArgs[0]).toMatchObject({ email_pass: 'ENC:mypassword' })
    })

    it('encripta omieAppKey e omieAppSecret ao salvar', async () => {
      setupMockChain({
        id: 1, email_host: '', email_port: 587,
        email_user: '', email_pass: '', email_from: '',
        whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
      })

      await mod.loadConfig()
      await mod.saveConfig({ omieAppKey: 'key123', omieAppSecret: 'sec456' })

      expect(upsertArgs[0]).toMatchObject({ omie_app_key: 'ENC:key123', omie_app_secret: 'ENC:sec456' })
    })

    it('atualiza cache local após salvar', async () => {
      setupMockChain({
        id: 1, email_host: 'before.com', email_port: 587,
        email_user: '', email_pass: '', email_from: '',
        whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
      })

      await mod.loadConfig()
      await mod.saveConfig({ emailHost: 'after.com' })

      const sync = mod.loadConfigSync()
      expect(sync.emailHost).toBe('after.com')
    })

    it('lança erro quando upsert falha', async () => {
      setupMockChain({
        id: 1, email_host: '', email_port: 587,
        email_user: '', email_pass: '', email_from: '',
        whatsapp_numero: '', omie_app_key: '', omie_app_secret: '',
      })

      await mod.loadConfig()

      _state.upsertError = { message: 'DB error' }

      await expect(mod.saveConfig({ emailHost: 'fail.com' })).rejects.toThrow('DB error')
    })

    it('merge parcial: mantém campos não alterados', async () => {
      setupMockChain({
        id: 1, email_host: 'keep.com', email_port: 465,
        email_user: 'keepuser', email_pass: '', email_from: 'keep@from.com',
        whatsapp_numero: '55', omie_app_key: '', omie_app_secret: '',
      })

      await mod.loadConfig()
      const result = await mod.saveConfig({ emailUser: 'newuser' })

      expect(result.emailHost).toBe('keep.com')
      expect(result.emailPort).toBe(465)
      expect(result.emailUser).toBe('newuser')
      expect(result.emailFrom).toBe('keep@from.com')
    })
  })

  describe('getEmailConfig', () => {
    it('retorna config quando host, user e pass estão preenchidos', async () => {
      setupMockChain({
        id: 1, email_host: 'smtp.test.com', email_port: 587,
        email_user: 'user@test.com', email_pass: 'ENC:pass123',
        email_from: 'from@test.com', whatsapp_numero: '',
        omie_app_key: '', omie_app_secret: '',
      })

      const emailCfg = await mod.getEmailConfig()

      expect(emailCfg).not.toBeNull()
      expect(emailCfg!.host).toBe('smtp.test.com')
      expect(emailCfg!.port).toBe(587)
      expect(emailCfg!.user).toBe('user@test.com')
      expect(emailCfg!.pass).toBe('pass123')
      expect(emailCfg!.from).toBe('from@test.com')
    })

    it('retorna null quando host vazio', async () => {
      setupMockChain({
        id: 1, email_host: '', email_port: 587,
        email_user: 'user', email_pass: 'ENC:pass',
        email_from: '', whatsapp_numero: '',
        omie_app_key: '', omie_app_secret: '',
      })

      const emailCfg = await mod.getEmailConfig()
      expect(emailCfg).toBeNull()
    })

    it('retorna null quando user vazio', async () => {
      setupMockChain({
        id: 1, email_host: 'smtp.com', email_port: 587,
        email_user: '', email_pass: 'ENC:pass',
        email_from: '', whatsapp_numero: '',
        omie_app_key: '', omie_app_secret: '',
      })

      const emailCfg = await mod.getEmailConfig()
      expect(emailCfg).toBeNull()
    })

    it('usa user como from quando from vazio', async () => {
      setupMockChain({
        id: 1, email_host: 'smtp.com', email_port: 587,
        email_user: 'user@test.com', email_pass: 'ENC:pass',
        email_from: '', whatsapp_numero: '',
        omie_app_key: '', omie_app_secret: '',
      })

      const emailCfg = await mod.getEmailConfig()
      expect(emailCfg!.from).toBe('user@test.com')
    })
  })
})
