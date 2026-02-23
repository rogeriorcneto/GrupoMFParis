// Encrypted localStorage utility
// Prevents casual inspection/editing of CRM data via DevTools

const STORAGE_KEY = 'mfp_crm_v2_'
const CIPHER_KEY = 'MFParis2024!CRM@Secure#Data'

function xorCipher(text: string, key: string): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return result
}

function encode(data: string): string {
  const ciphered = xorCipher(data, CIPHER_KEY)
  return btoa(unescape(encodeURIComponent(ciphered)))
}

function decode(encoded: string): string {
  const ciphered = decodeURIComponent(escape(atob(encoded)))
  return xorCipher(ciphered, CIPHER_KEY)
}

function checksum(data: string): string {
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const prefixedKey = STORAGE_KEY + key
    const raw = localStorage.getItem(prefixedKey)
    if (raw) {
      // Try new encrypted format first
      try {
        const parsed = JSON.parse(raw) as { d: string; c: string }
        if (parsed.d && parsed.c) {
          const decoded = decode(parsed.d)
          if (checksum(decoded) === parsed.c) {
            return JSON.parse(decoded)
          }
          // Checksum mismatch — data was tampered with, return fallback
          console.warn(`[CRM] Dados de "${key}" foram adulterados. Restaurando padrão.`)
          localStorage.removeItem(prefixedKey)
          return fallback
        }
      } catch {
        // Not encrypted format, try plain JSON (migration from old format)
      }
      // Try plain JSON (old format migration)
      return JSON.parse(raw)
    }

    // Migration: check if old unencrypted key exists
    const oldKey = 'crm_' + key.replace('crm_', '')
    const oldRaw = localStorage.getItem(oldKey)
    if (oldRaw) {
      try {
        const data = JSON.parse(oldRaw)
        // Save in new encrypted format
        saveToStorage(key, data)
        // Remove old unencrypted key
        localStorage.removeItem(oldKey)
        return data
      } catch {
        return fallback
      }
    }

    return fallback
  } catch {
    return fallback
  }
}

export function saveToStorage<T>(key: string, data: T): void {
  try {
    const prefixedKey = STORAGE_KEY + key
    const json = JSON.stringify(data)
    const encoded = encode(json)
    const cs = checksum(json)
    localStorage.setItem(prefixedKey, JSON.stringify({ d: encoded, c: cs }))
  } catch {
    // Storage full or other error — silently fail
  }
}

export function clearAllStorage(): void {
  const keys = Object.keys(localStorage)
  keys.forEach(k => {
    if (k.startsWith(STORAGE_KEY) || k.startsWith('crm_')) {
      localStorage.removeItem(k)
    }
  })
}
