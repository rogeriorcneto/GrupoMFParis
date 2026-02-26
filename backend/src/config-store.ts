import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.join(__dirname, '..', 'bot-config.json')

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

export function loadConfig(): BotConfigData {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch (err) {
    console.error('Erro ao ler bot-config.json:', err)
  }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(data: Partial<BotConfigData>): BotConfigData {
  const current = loadConfig()
  const updated = { ...current, ...data }
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8')
    console.log('💾 Configurações salvas em bot-config.json')
  } catch (err) {
    console.error('Erro ao salvar bot-config.json:', err)
    throw err
  }
  return updated
}

export function getEmailConfig(): { host: string; port: number; user: string; pass: string; from: string } | null {
  const cfg = loadConfig()
  // Prioridade: bot-config.json > env vars
  const host = cfg.emailHost || process.env.EMAIL_HOST || ''
  const user = cfg.emailUser || process.env.EMAIL_USER || ''
  const pass = cfg.emailPass || process.env.EMAIL_PASS || ''

  if (!host || !user || !pass) return null

  return {
    host,
    port: cfg.emailPort || parseInt(process.env.EMAIL_PORT || '587', 10),
    user,
    pass,
    from: cfg.emailFrom || process.env.EMAIL_FROM || user,
  }
}
