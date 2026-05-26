import { supabase as defaultSupabase } from './supabase.js'
import { encrypt, decrypt } from './crypto.js'
import { log } from './logger.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface OmieEmpresa {
  nome: string
  appKey: string
  appSecret: string
  ativo: boolean
}

export interface BotConfigData {
  emailHost: string
  emailPort: number
  emailUser: string
  emailPass: string
  emailFrom: string
  emailImapHost: string
  emailImapPort: number
  emailImapUser: string
  emailImapPass: string
  emailImapSecure: boolean
  whatsappNumero: string
  /** @deprecated Use omieEmpresas instead */
  omieAppKey: string
  /** @deprecated Use omieEmpresas instead */
  omieAppSecret: string
  omieEmpresas: OmieEmpresa[]
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
  emailImapHost: '',
  emailImapPort: 993,
  emailImapUser: '',
  emailImapPass: '',
  emailImapSecure: true,
  whatsappNumero: '',
  omieAppKey: '',
  omieAppSecret: '',
  omieEmpresas: [],
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

    // Carregar array de empresas Omie (multi-empresa)
    let omieEmpresas: OmieEmpresa[] = []
    if (data.omie_empresas && Array.isArray(data.omie_empresas)) {
      omieEmpresas = data.omie_empresas.map((e: any) => ({
        nome: e.nome || '',
        appKey: decrypt(e.appKey) || '',
        appSecret: decrypt(e.appSecret) || '',
        ativo: e.ativo !== false, // default true
      })).filter((e: OmieEmpresa) => e.appKey && e.appSecret)
    }
    // Fallback: se não tem empresas mas tem config antiga, converte para array
    const oldKey = decrypt(data.omie_app_key) || ''
    const oldSecret = decrypt(data.omie_app_secret) || ''
    if (omieEmpresas.length === 0 && oldKey && oldSecret) {
      omieEmpresas = [{ nome: 'Empresa Principal', appKey: oldKey, appSecret: oldSecret, ativo: true }]
    }

    cachedConfig = {
      emailHost: data.email_host || process.env.EMAIL_HOST || '',
      emailPort: data.email_port || parseInt(process.env.EMAIL_PORT || '587', 10),
      emailUser: data.email_user || process.env.EMAIL_USER || '',
      emailPass: decrypt(data.email_pass) || process.env.EMAIL_PASS || '',
      emailFrom: data.email_from || process.env.EMAIL_FROM || '',
      emailImapHost: data.email_imap_host || process.env.EMAIL_IMAP_HOST || '',
      emailImapPort: data.email_imap_port || parseInt(process.env.EMAIL_IMAP_PORT || '993', 10),
      emailImapUser: data.email_imap_user || process.env.EMAIL_IMAP_USER || '',
      emailImapPass: decrypt(data.email_imap_pass) || process.env.EMAIL_IMAP_PASS || '',
      emailImapSecure: data.email_imap_secure !== undefined && data.email_imap_secure !== null
        ? !!data.email_imap_secure
        : (String(process.env.EMAIL_IMAP_SECURE || 'true').toLowerCase() === 'true'),
      whatsappNumero: data.whatsapp_numero || '',
      omieAppKey: oldKey,
      omieAppSecret: oldSecret,
      omieEmpresas,
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

export async function getImapConfig(): Promise<{ host: string; port: number; user: string; pass: string; secure: boolean } | null> {
  const cfg = await loadConfig()
  const host = cfg.emailImapHost || ''
  const user = cfg.emailImapUser || ''
  const pass = cfg.emailImapPass || ''
  if (!host || !user || !pass) return null
  return {
    host,
    port: cfg.emailImapPort || 993,
    user,
    pass,
    secure: cfg.emailImapSecure !== undefined ? !!cfg.emailImapSecure : true,
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
    // Criptografar array de empresas Omie
    const omieEmpresasEncrypted = updated.omieEmpresas?.map(e => ({
      nome: e.nome,
      appKey: e.appKey ? encrypt(e.appKey) : '',
      appSecret: e.appSecret ? encrypt(e.appSecret) : '',
      ativo: e.ativo,
    })) || []

    const { error } = await supabase
      .from('bot_config')
      .upsert({
        id: 1,
        email_host: updated.emailHost,
        email_port: updated.emailPort,
        email_user: updated.emailUser,
        email_pass: updated.emailPass ? encrypt(updated.emailPass) : '',
        email_from: updated.emailFrom,
        email_imap_host: updated.emailImapHost || '',
        email_imap_port: updated.emailImapPort || 993,
        email_imap_user: updated.emailImapUser || '',
        email_imap_pass: updated.emailImapPass ? encrypt(updated.emailImapPass) : '',
        email_imap_secure: updated.emailImapSecure !== undefined ? !!updated.emailImapSecure : true,
        whatsapp_numero: updated.whatsappNumero,
        omie_app_key: updated.omieAppKey ? encrypt(updated.omieAppKey) : '',
        omie_app_secret: updated.omieAppSecret ? encrypt(updated.omieAppSecret) : '',
        omie_empresas: omieEmpresasEncrypted,
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
  // Carrega múltiplas empresas Omie de variáveis de ambiente se disponível
  // Formato: OMIE_EMPRESAS=[{"nome":"X","appKey":"Y","appSecret":"Z"}]
  let omieEmpresas: OmieEmpresa[] = []
  if (process.env.OMIE_EMPRESAS) {
    try {
      omieEmpresas = JSON.parse(process.env.OMIE_EMPRESAS)
    } catch { /* ignora */ }
  }
  // Fallback: config antiga única
  const oldKey = process.env.OMIE_APP_KEY || ''
  const oldSecret = process.env.OMIE_APP_SECRET || ''
  if (omieEmpresas.length === 0 && oldKey && oldSecret) {
    omieEmpresas = [{ nome: 'Empresa Principal', appKey: oldKey, appSecret: oldSecret, ativo: true }]
  }

  return {
    emailHost: process.env.EMAIL_HOST || '',
    emailPort: parseInt(process.env.EMAIL_PORT || '587', 10),
    emailUser: process.env.EMAIL_USER || '',
    emailPass: process.env.EMAIL_PASS || '',
    emailFrom: process.env.EMAIL_FROM || '',
    emailImapHost: process.env.EMAIL_IMAP_HOST || '',
    emailImapPort: parseInt(process.env.EMAIL_IMAP_PORT || '993', 10),
    emailImapUser: process.env.EMAIL_IMAP_USER || '',
    emailImapPass: process.env.EMAIL_IMAP_PASS || '',
    emailImapSecure: String(process.env.EMAIL_IMAP_SECURE || 'true').toLowerCase() === 'true',
    whatsappNumero: '',
    omieAppKey: oldKey,
    omieAppSecret: oldSecret,
    omieEmpresas,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    twilioTwimlAppSid: process.env.TWILIO_TWIML_APP_SID || '',
    twilioApiKey: process.env.TWILIO_API_KEY || '',
    twilioApiSecret: process.env.TWILIO_API_SECRET || '',
  }
}
