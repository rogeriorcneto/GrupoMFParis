import { supabase as defaultSupabase } from './supabase.js'
import { encrypt, decrypt } from './crypto.js'
import { log } from './logger.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface BotConfigData {
  emailHost: string
  emailPort: number
  emailUser: string
  emailPass: string
  emailFrom: string
  whatsappNumero: string
  omieAppKey: string
  omieAppSecret: string
  twilioAccountSid: string
  twilioAuthToken: string
  twilioPhoneNumber: string
  twilioTwimlAppSid: string
  twilioApiKey: string
  twilioApiSecret: string
}

const DEFAULT_CONFIG: BotConfigData = {
  emailHost: '',
  emailPort: 587,
  emailUser: '',
  emailPass: '',
  emailFrom: '',
  whatsappNumero: '',
  omieAppKey: '',
  omieAppSecret: '',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioPhoneNumber: '',
  twilioTwimlAppSid: '',
  twilioApiKey: '',
  twilioApiSecret: '',
}

// In-memory cache to avoid hitting DB on every request
let cachedConfig: BotConfigData = { ...DEFAULT_CONFIG }
let cacheLoaded = false

/** Force next loadConfig to re-read from DB */
export function invalidateConfigCache(): void {
  cacheLoaded = false
}

export async function loadConfig(client?: SupabaseClient): Promise<BotConfigData> {
  if (cacheLoaded) return { ...cachedConfig }

  const supabase = client || defaultSupabase
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
      omieAppKey: data.omie_app_key || '',
      omieAppSecret: data.omie_app_secret || '',
      twilioAccountSid: data.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || '',
      twilioAuthToken: decrypt(data.twilio_auth_token) || process.env.TWILIO_AUTH_TOKEN || '',
      twilioPhoneNumber: data.twilio_phone_number || process.env.TWILIO_PHONE_NUMBER || '',
      twilioTwimlAppSid: data.twilio_twiml_app_sid || process.env.TWILIO_TWIML_APP_SID || '',
      twilioApiKey: data.twilio_api_key || process.env.TWILIO_API_KEY || '',
      twilioApiSecret: decrypt(data.twilio_api_secret) || process.env.TWILIO_API_SECRET || '',
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

export async function saveConfig(data: Partial<BotConfigData>, client?: SupabaseClient): Promise<BotConfigData> {
  const supabase = client || defaultSupabase
  const current = await loadConfig(client)
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
        omie_app_key: updated.omieAppKey ? encrypt(updated.omieAppKey) : '',
        omie_app_secret: updated.omieAppSecret ? encrypt(updated.omieAppSecret) : '',
        twilio_account_sid: updated.twilioAccountSid || '',
        twilio_auth_token: updated.twilioAuthToken ? encrypt(updated.twilioAuthToken) : '',
        twilio_phone_number: updated.twilioPhoneNumber || '',
        twilio_twiml_app_sid: updated.twilioTwimlAppSid || '',
        twilio_api_key: updated.twilioApiKey || '',
        twilio_api_secret: updated.twilioApiSecret ? encrypt(updated.twilioApiSecret) : '',
        updated_at: new Date().toISOString(),
      })

    if (error) {
      log.error({ error: error.message }, 'Erro ao salvar bot_config no Supabase')
      throw new Error(error.message)
    }

    cachedConfig = updated
    cacheLoaded = true
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
    omieAppKey: process.env.OMIE_APP_KEY || '',
    omieAppSecret: process.env.OMIE_APP_SECRET || '',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    twilioTwimlAppSid: process.env.TWILIO_TWIML_APP_SID || '',
    twilioApiKey: process.env.TWILIO_API_KEY || '',
    twilioApiSecret: process.env.TWILIO_API_SECRET || '',
  }
}
