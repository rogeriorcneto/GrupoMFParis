import { describe, it, expect } from 'vitest'
import { mapEtapaAgendor, mapCategoriaPerdaAgendor } from '../utils/funil-logic'

// Reimplementar lógica de detecção de separador e parsing CSV para testar
function detectSeparator(firstLine: string): string {
  const countSemicolon = (firstLine.match(/;/g) || []).length
  const countComma = (firstLine.match(/,/g) || []).length
  const countTab = (firstLine.match(/\t/g) || []).length
  return countTab > countComma && countTab > countSemicolon ? '\t' : countSemicolon > countComma ? ';' : ','
}

function parseLine(line: string, sep: string): string[] {
  const result: string[] = []
  let current = '', inQuotes = false
  for (let j = 0; j < line.length; j++) {
    const ch = line[j]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === sep && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += ch
  }
  result.push(current.trim())
  return result
}

function normalizeEmpresa(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\b(ltda|me|epp|eireli|s\.?a\.?|s\/a|cia|comercio|comércio|industria|indústria|distribui(dora|cao|ção)?|com\.?|ind\.?|imp\.?|exp\.?)\b/gi, '')
    .replace(/[.\-\/,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('CSV Import — detectSeparator', () => {
  it('detecta ponto-e-vírgula como separador', () => {
    expect(detectSeparator('nome;email;telefone')).toBe(';')
  })

  it('detecta vírgula como separador', () => {
    expect(detectSeparator('nome,email,telefone')).toBe(',')
  })

  it('detecta tab como separador', () => {
    expect(detectSeparator('nome\temail\ttelefone')).toBe('\t')
  })

  it('vírgula como fallback quando empate', () => {
    expect(detectSeparator('abc')).toBe(',')
  })

  it('ponto-e-vírgula tem prioridade sobre vírgula', () => {
    expect(detectSeparator('a;b;c,d')).toBe(';')
  })
})

describe('CSV Import — parseLine', () => {
  it('parse simples com ponto-e-vírgula', () => {
    expect(parseLine('João;31999;teste@test.com', ';')).toEqual(['João', '31999', 'teste@test.com'])
  })

  it('parse com vírgula', () => {
    expect(parseLine('João,31999,teste@test.com', ',')).toEqual(['João', '31999', 'teste@test.com'])
  })

  it('lida com campos entre aspas contendo separador', () => {
    expect(parseLine('"Empresa, LTDA";31999;email', ';')).toEqual(['Empresa, LTDA', '31999', 'email'])
  })

  it('trim nos campos', () => {
    expect(parseLine(' João ; 31999 ; email ', ';')).toEqual(['João', '31999', 'email'])
  })

  it('campo vazio', () => {
    expect(parseLine(';;email', ';')).toEqual(['', '', 'email'])
  })

  it('lida com BOM UTF-8', () => {
    const withBom = '\uFEFFnome;email'
    const headers = parseLine(withBom, ';').map(h => h.replace(/^\uFEFF/, '').toLowerCase().trim())
    expect(headers).toEqual(['nome', 'email'])
  })
})

describe('CSV Import — normalizeEmpresa', () => {
  it('remove LTDA', () => {
    expect(normalizeEmpresa('Empresa ABC LTDA')).toBe('empresa abc')
  })

  it('remove ME', () => {
    expect(normalizeEmpresa('Comércio Silva ME')).toBe('silva')
  })

  it('remove EIRELI', () => {
    expect(normalizeEmpresa('Tech Solutions EIRELI')).toBe('tech solutions')
  })

  it('remove pontuação', () => {
    expect(normalizeEmpresa('A.B.C. Ind.')).toBe('a b c')
  })

  it('normaliza espaços múltiplos', () => {
    expect(normalizeEmpresa('  Empresa   Teste  ')).toBe('empresa teste')
  })

  it('remove S/A e S.A.', () => {
    expect(normalizeEmpresa('Empresa S/A')).toBe('empresa')
    expect(normalizeEmpresa('Empresa S.A.')).toBe('empresa')
  })
})

describe('CSV Import — mapeamento Agendor completo', () => {
  it('CONTATO INICIAL (ativo) → prospecção', () => {
    expect(mapEtapaAgendor('CONTATO INICIAL', 'Ativo')).toBe('prospecção')
  })

  it('PROPOSTA ENVIADA (ativo) → negociacao', () => {
    expect(mapEtapaAgendor('PROPOSTA ENVIADA', 'Ativo')).toBe('negociacao')
  })

  it('ENVIO DO PEDIDO (ativo) → homologado', () => {
    expect(mapEtapaAgendor('ENVIO DO PEDIDO', 'Ativo')).toBe('homologado')
  })

  it('FOLLOW-UP (ativo) → pos_venda', () => {
    expect(mapEtapaAgendor('FOLLOW-UP', 'Ativo')).toBe('pos_venda')
  })

  it('qualquer etapa com status Perdido → perdido', () => {
    expect(mapEtapaAgendor('CONTATO INICIAL', 'Perdido')).toBe('perdido')
    expect(mapEtapaAgendor('PROPOSTA ENVIADA', 'Perdido')).toBe('perdido')
  })

  it('categoriaPerda: preço alto → preco', () => {
    expect(mapCategoriaPerdaAgendor('Preço alto demais')).toBe('preco')
  })

  it('categoriaPerda: concorrente → concorrencia', () => {
    expect(mapCategoriaPerdaAgendor('Perdeu para concorrente')).toBe('concorrencia')
  })

  it('categoriaPerda: sem contato → sem_resposta', () => {
    expect(mapCategoriaPerdaAgendor('Não retornou contato')).toBe('sem_resposta')
  })
})
