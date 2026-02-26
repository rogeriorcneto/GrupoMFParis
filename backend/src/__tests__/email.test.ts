import { describe, it, expect } from 'vitest'

// Testar renderTemplate como função pura (precisa exportar ou reimplementar)
// Como renderTemplate é privada em email.ts, testamos a lógica de substituição diretamente

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

describe('renderTemplate', () => {
  it('substitui variáveis simples', () => {
    const result = renderTemplate('Olá {nome}, bem-vindo!', { nome: 'Rafael' })
    expect(result).toBe('Olá Rafael, bem-vindo!')
  })

  it('substitui múltiplas variáveis', () => {
    const result = renderTemplate('{nome} da {empresa}', { nome: 'João', empresa: 'MF Paris' })
    expect(result).toBe('João da MF Paris')
  })

  it('substitui múltiplas ocorrências da mesma variável', () => {
    const result = renderTemplate('{nome} e {nome}', { nome: 'Ana' })
    expect(result).toBe('Ana e Ana')
  })

  it('mantém variável quando não há substituição', () => {
    const result = renderTemplate('Olá {nome}!', {})
    expect(result).toBe('Olá {nome}!')
  })

  it('lida com template vazio', () => {
    const result = renderTemplate('', { nome: 'Test' })
    expect(result).toBe('')
  })

  it('lida com variáveis vazias', () => {
    const result = renderTemplate('Olá {nome}!', { nome: '' })
    expect(result).toBe('Olá !')
  })

  it('preserva texto sem variáveis', () => {
    const result = renderTemplate('Texto sem variáveis', { nome: 'Test' })
    expect(result).toBe('Texto sem variáveis')
  })

  it('substitui variáveis em template HTML', () => {
    const result = renderTemplate('<p>Olá <b>{nome}</b>, {empresa} agradece!</p>', {
      nome: 'Cliente',
      empresa: 'Grupo MF Paris',
    })
    expect(result).toBe('<p>Olá <b>Cliente</b>, Grupo MF Paris agradece!</p>')
  })
})
