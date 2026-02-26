import { config } from 'dotenv'
config()

function env(key: string, fallback?: string): string {
  const v = process.env[key] || fallback
  if (!v) throw new Error(`Variável de ambiente ${key} não definida. Copie env.example → .env`)
  return v
}

function envOptional(key: string): string | undefined {
  return process.env[key] || undefined
}

export const CONFIG = {
  supabaseUrl: env('SUPABASE_URL'),
  supabaseAnonKey: env('SUPABASE_ANON_KEY'),
  port: parseInt(env('BOT_PORT', '3001'), 10),
  corsOrigins: env('CORS_ORIGINS', 'http://localhost:5173,http://localhost:4173').split(',').map(s => s.trim()),
  email: {
    host: envOptional('EMAIL_HOST'),
    port: parseInt(envOptional('EMAIL_PORT') || '587', 10),
    user: envOptional('EMAIL_USER'),
    pass: envOptional('EMAIL_PASS'),
    from: envOptional('EMAIL_FROM'),
  },
  get emailConfigured(): boolean {
    return !!(this.email.host && this.email.user && this.email.pass)
  },
}
