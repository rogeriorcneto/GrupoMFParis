import { supabase } from './supabase.js'
import { encrypt, decrypt } from './crypto.js'
import { log } from './logger.js'

export interface BotConfigData {
  emailHost: string
  emailPort: number
  emailUser: string
  emailPass: string
  emailFrom: string
  whatsappNumero: string
}

const DEFAULT_CONFIG: BotConfigData = {
  emailHost: '',
  emailPort: 587,
  emailUser: '',
  emailPass: '',
  emailFrom: '',
  whatsappNumero: '',
}

// In-memory cache to avoid hitting DB on every request
let cachedConfig: BotConfigData = { ...DEFAULT_CONFIG }
let cacheLoaded = false

export async function loadConfig(): Promise<BotConfigData> {
  if (cacheLoaded) return { ...cachedConfig }

  try {
    const { data, error } = await supabase
      .from('bot_config')
      .select('*')
      .eq('id', 1)
      .single()

    if (error || !data) {
      log.warn('⚠️ bot_config não encontrado no Supabase, usando defaults + env vars')
      cachedConfig = configFromEnv()
      cacheLoaded = true
      return { ...cachedConfig }
    }

    cachedConfig = {
      emailHost: data.email_host || process.env.EMAIL_HOST || '',
      emailPort: data.email_port || parseInt(process.env.EMAIL_PORT || '587', 10),
      emailUser: data.email_user || process.env.EMAIL_USER || '',
      emailPass: decrypt(data.email_pass) || process.env.EMAIL_PASS || '',
      emailFrom: data.email_from || process.env.EMAIL_FROM || '',
      whatsappNumero: data.whatsapp_numero || '',
    }
    cacheLoaded = true
    return { ...cachedConfig }
  } catch (err) {
    log.error({ err }, 'Erro ao carregar bot_config')
    cachedConfig = configFromEnv()
    cacheLoaded = true
    return { ...cachedConfig }
  }
}

/** Synchronous getter for cached config (used by email.ts after initial load) */
export function loadConfigSync(): BotConfigData {
  return { ...cachedConfig }
}

export async function saveConfig(data: Partial<BotConfigData>): Promise<BotConfigData> {
  const current = await loadConfig()
  const updated = { ...current, ...data }

  try {
    const { error } = await supabase
      .from('bot_config')
      .upsert({
        id: 1,
        email_host: updated.emailHost,
        email_port: updated.emailPort,
        email_user: updated.emailUser,
        email_pass: updated.emailPass ? encrypt(updated.emailPass) : '',
        email_from: updated.emailFrom,
        whatsapp_numero: updated.whatsappNumero,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      log.error({ error: error.message }, 'Erro ao salvar bot_config no Supabase')
      throw new Error(error.message)
    }

    cachedConfig = updated
    log.info('💾 Configurações salvas no Supabase (bot_config)')
  } catch (err) {
    log.error({ err }, 'Erro ao salvar config')
    throw err
  }
  return updated
}

export async function getEmailConfig(): Promise<{ host: string; port: number; user: string; pass: string; from: string } | null> {
  const cfg = await loadConfig()
  const host = cfg.emailHost || ''
  const user = cfg.emailUser || ''
  const pass = cfg.emailPass || ''

  if (!host || !user || !pass) return null

  return {
    host,
    port: cfg.emailPort || 587,
    user,
    pass,
    from: cfg.emailFrom || user,
  }
}

function configFromEnv(): BotConfigData {
  return {
    emailHost: process.env.EMAIL_HOST || '',
    emailPort: parseInt(process.env.EMAIL_PORT || '587', 10),
    emailUser: process.env.EMAIL_USER || '',
    emailPass: process.env.EMAIL_PASS || '',
    emailFrom: process.env.EMAIL_FROM || '',
    whatsappNumero: '',
  }
}
