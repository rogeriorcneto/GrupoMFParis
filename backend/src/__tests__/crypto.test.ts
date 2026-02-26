import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt } from '../crypto.js'

// Garantir que existe uma chave para os testes
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY && !process.env.SUPABASE_ANON_KEY) {
    process.env.ENCRYPTION_KEY = 'test-secret-key-for-unit-tests-only'
  }
})

describe('encrypt / decrypt', () => {
  it('encripta e decripta texto corretamente', () => {
    const original = 'minha-senha-smtp-123!'
    const encrypted = encrypt(original)
    expect(encrypted).not.toBe(original)
    expect(encrypted).toContain(':') // formato iv:tag:data
    const decrypted = decrypt(encrypted)
    expect(decrypted).toBe(original)
  })

  it('retorna string vazia para input vazio', () => {
    expect(encrypt('')).toBe('')
    expect(decrypt('')).toBe('')
  })

  it('gera ciphertext diferente a cada chamada (IV aleatório)', () => {
    const text = 'mesma-senha'
    const a = encrypt(text)
    const b = encrypt(text)
    expect(a).not.toBe(b) // IVs diferentes
    expect(decrypt(a)).toBe(text)
    expect(decrypt(b)).toBe(text)
  })

  it('decrypt retorna plain text quando input não é encriptado (backwards-compatible)', () => {
    expect(decrypt('senha-simples')).toBe('senha-simples')
    expect(decrypt('smtp.gmail.com')).toBe('smtp.gmail.com')
    expect(decrypt('abc:def')).toBe('abc:def') // 2 partes, não 3
  })

  it('lida com caracteres especiais e unicode', () => {
    const special = 'Ç@rãctères_espéci@is!#$%&*()+=ñ'
    const encrypted = encrypt(special)
    expect(decrypt(encrypted)).toBe(special)
  })

  it('lida com senhas longas', () => {
    const long = 'a'.repeat(500)
    const encrypted = encrypt(long)
    expect(decrypt(encrypted)).toBe(long)
  })
})
