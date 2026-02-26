import crypto from 'node:crypto'

/**
 * Encriptação AES-256-GCM para dados sensíveis (ex: senha de email SMTP).
 * Usa ENCRYPTION_KEY do ambiente, ou fallback para SUPABASE_ANON_KEY.
 * Zero dependências externas — usa node:crypto nativo.
 */

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.SUPABASE_ANON_KEY || ''
  if (!secret) throw new Error('ENCRYPTION_KEY ou SUPABASE_ANON_KEY necessária para encriptação')
  return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encripta um texto usando AES-256-GCM.
 * Retorna string no formato "iv:tag:encrypted" (hex).
 */
export function encrypt(text: string): string {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decripta um texto encriptado com encrypt().
 * Backwards-compatible: se o valor não tem o formato "iv:tag:data", retorna como está (plain text).
 */
export function decrypt(data: string): string {
  if (!data) return ''
  // Backwards-compatible: plain text não tem formato hex:hex:hex
  const parts = data.split(':')
  if (parts.length !== 3) return data
  // Validar que são hex válidos (iv=32chars, tag=32chars, data=variável)
  if (!/^[0-9a-f]{32}$/.test(parts[0]) || !/^[0-9a-f]{32}$/.test(parts[1])) return data

  try {
    const [ivHex, tagHex, encHex] = parts
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    // Se falhar a decriptação (chave mudou, dados corrompidos), retorna string original
    console.warn('⚠️ Falha ao decriptar valor — retornando como plain text')
    return data
  }
}
