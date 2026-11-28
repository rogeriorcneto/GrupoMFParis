import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../lib/database', () => ({ registrarAtividade: vi.fn() }))

import { chaveAtiva, estadoBloco } from '../lib/academia'

const baseData = (overrides: any = {}) => ({
  blocos: [
    { id: 1, ordem: 1, nome: 'Empresa', nota_corte: 70, ativo: true },
    { id: 2, ordem: 2, nome: 'Legislação', nota_corte: 70, ativo: true },
  ],
  competencias: [], biblioteca: [], aulas: [], questoes: [], progresso: [], chaves: [],
  chavesFuncao: [], chavesPessoa: [], termos: [], treinos: [], umAum: [], historico: [],
  ...overrides,
}) as any

const vendedor = { id: 10, funcao: 'RCA' } as any

describe('Academia Rodada 1 — regras puras', () => {
  it('usa a chave da função quando não existe exceção por pessoa', () => {
    const data = baseData({
      chavesFuncao: [{ funcao: 'RCA', chave: 'alerta_atraso', ativo: false }],
    })
    expect(chaveAtiva(data, vendedor, 'alerta_atraso')).toBe(false)
  })

  it('exceção por pessoa sobrepõe o padrão da função', () => {
    const data = baseData({
      chavesFuncao: [{ funcao: 'RCA', chave: 'alerta_atraso', ativo: false }],
      chavesPessoa: [{ vendedor_id: 10, chave: 'alerta_atraso', ativo: true }],
    })
    expect(chaveAtiva(data, vendedor, 'alerta_atraso')).toBe(true)
  })

  it('primeiro bloco começa disponível e o seguinte fica bloqueado até conclusão', () => {
    const data = baseData()
    expect(estadoBloco(data, data.blocos[0])).toBe('disponivel')
    expect(estadoBloco(data, data.blocos[1])).toBe('bloqueado')
  })

  it('não libera o próximo bloco quando o anterior está em reforço', () => {
    const data = baseData({
      progresso: [{ vendedor_id: 10, bloco_id: 1, estado: 'em_reforco', nota_final: 55 }],
    })
    expect(estadoBloco(data, data.blocos[0])).toBe('em_reforco')
    expect(estadoBloco(data, data.blocos[1])).toBe('bloqueado')
  })

  it('libera o próximo bloco somente após concluir o anterior', () => {
    const data = baseData({
      progresso: [{ vendedor_id: 10, bloco_id: 1, estado: 'concluido', nota_final: 90 }],
    })
    expect(estadoBloco(data, data.blocos[0])).toBe('concluido')
    expect(estadoBloco(data, data.blocos[1])).toBe('disponivel')
  })
})
