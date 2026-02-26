import { describe, it, expect } from 'vitest'
import { stageLabels, transicoesPermitidas } from '../utils/constants'

describe('stageLabels', () => {
  const ALL_STAGES = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda', 'perdido']

  it('deve ter label para cada etapa do funil', () => {
    for (const stage of ALL_STAGES) {
      expect(stageLabels[stage]).toBeDefined()
      expect(stageLabels[stage].length).toBeGreaterThan(0)
    }
  })

  it('labels devem ser strings legíveis (sem underscores)', () => {
    for (const label of Object.values(stageLabels)) {
      expect(label).not.toContain('_')
    }
  })
})

describe('transicoesPermitidas', () => {
  const ALL_STAGES = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda', 'perdido']

  it('deve definir transições para cada etapa', () => {
    for (const stage of ALL_STAGES) {
      expect(transicoesPermitidas[stage]).toBeDefined()
      expect(Array.isArray(transicoesPermitidas[stage])).toBe(true)
    }
  })

  it('prospecção só pode ir para amostra ou perdido', () => {
    expect(transicoesPermitidas['prospecção']).toEqual(['amostra', 'perdido'])
  })

  it('amostra só pode ir para homologado ou perdido', () => {
    expect(transicoesPermitidas['amostra']).toEqual(['homologado', 'perdido'])
  })

  it('homologado só pode ir para negociacao ou perdido', () => {
    expect(transicoesPermitidas['homologado']).toEqual(['negociacao', 'perdido'])
  })

  it('negociacao pode ir para pos_venda, homologado ou perdido', () => {
    expect(transicoesPermitidas['negociacao']).toEqual(['pos_venda', 'homologado', 'perdido'])
  })

  it('pos_venda só pode voltar para negociacao', () => {
    expect(transicoesPermitidas['pos_venda']).toEqual(['negociacao'])
  })

  it('perdido só pode voltar para prospecção (reconquista)', () => {
    expect(transicoesPermitidas['perdido']).toEqual(['prospecção'])
  })

  it('transições ilegais não devem existir', () => {
    // prospecção não pode pular direto para pos_venda
    expect(transicoesPermitidas['prospecção']).not.toContain('pos_venda')
    expect(transicoesPermitidas['prospecção']).not.toContain('negociacao')
    expect(transicoesPermitidas['prospecção']).not.toContain('homologado')
    // amostra não pode pular para negociacao
    expect(transicoesPermitidas['amostra']).not.toContain('negociacao')
    expect(transicoesPermitidas['amostra']).not.toContain('pos_venda')
    // perdido não pode ir direto para pos_venda
    expect(transicoesPermitidas['perdido']).not.toContain('pos_venda')
    expect(transicoesPermitidas['perdido']).not.toContain('negociacao')
  })

  it('todas as transições devem apontar para etapas válidas', () => {
    for (const [from, targets] of Object.entries(transicoesPermitidas)) {
      for (const to of targets) {
        expect(ALL_STAGES).toContain(to)
      }
    }
  })

  it('stageLabels e transicoesPermitidas devem cobrir as mesmas etapas', () => {
    const labelKeys = Object.keys(stageLabels).sort()
    const transKeys = Object.keys(transicoesPermitidas).sort()
    expect(labelKeys).toEqual(transKeys)
  })
})
