import { describe, it, expect } from 'vitest'
import { stageLabels, transicoesPermitidas, subStatusAmostraLabels, subStatusFollowUpLabels } from '../utils/constants'

describe('stageLabels', () => {
  const ALL_STAGES = ['prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up', 'cliente_ativo', 'perdido']

  it('deve ter label para cada etapa do funil', () => {
    for (const stage of ALL_STAGES) {
      expect(stageLabels[stage]).toBeDefined()
      expect(stageLabels[stage].length).toBeGreaterThan(0)
    }
  })

  it('labels devem ser strings legíveis (sem underscores no valor)', () => {
    // follow_up e cliente_ativo são chaves com _, mas os labels não
    expect(stageLabels['follow_up']).toBe('Follow-up')
    expect(stageLabels['cliente_ativo']).toBe('Cliente Ativo')
  })
})

describe('transicoesPermitidas', () => {
  const ALL_STAGES = ['prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up', 'cliente_ativo', 'perdido']

  it('deve definir transições para cada etapa', () => {
    for (const stage of ALL_STAGES) {
      expect(transicoesPermitidas[stage]).toBeDefined()
      expect(Array.isArray(transicoesPermitidas[stage])).toBe(true)
    }
  })

  it('prospecção só pode ir para amostra ou perdido', () => {
    expect(transicoesPermitidas['prospecção']).toEqual(['amostra', 'perdido'])
  })

  it('amostra só pode ir para proposta ou perdido', () => {
    expect(transicoesPermitidas['amostra']).toEqual(['proposta', 'perdido'])
  })

  it('proposta pode ir para negociacao ou perdido', () => {
    expect(transicoesPermitidas['proposta']).toEqual(['negociacao', 'perdido'])
  })

  it('negociacao pode ir para follow_up, proposta ou perdido', () => {
    expect(transicoesPermitidas['negociacao']).toEqual(['follow_up', 'proposta', 'perdido'])
  })

  it('follow_up pode ir para cliente_ativo ou perdido', () => {
    expect(transicoesPermitidas['follow_up']).toEqual(['cliente_ativo', 'perdido'])
  })

  it('cliente_ativo pode voltar para negociacao ou perdido', () => {
    expect(transicoesPermitidas['cliente_ativo']).toEqual(['negociacao', 'perdido'])
  })

  it('perdido pode voltar para prospecção ou proposta', () => {
    expect(transicoesPermitidas['perdido']).toEqual(['prospecção', 'proposta'])
  })

  it('transições ilegais não devem existir', () => {
    // prospecção não pode pular direto para cliente_ativo
    expect(transicoesPermitidas['prospecção']).not.toContain('cliente_ativo')
    expect(transicoesPermitidas['prospecção']).not.toContain('negociacao')
    expect(transicoesPermitidas['prospecção']).not.toContain('follow_up')
    // amostra não pode pular para negociacao
    expect(transicoesPermitidas['amostra']).not.toContain('negociacao')
    expect(transicoesPermitidas['amostra']).not.toContain('cliente_ativo')
    // perdido não pode ir direto para cliente_ativo
    expect(transicoesPermitidas['perdido']).not.toContain('cliente_ativo')
    expect(transicoesPermitidas['perdido']).not.toContain('negociacao')
  })

  it('todas as transições devem apontar para etapas válidas', () => {
    for (const [_from, targets] of Object.entries(transicoesPermitidas)) {
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

describe('subStatusAmostraLabels', () => {
  it('deve ter labels para todos os sub-status de amostra', () => {
    const expected = ['solicitada', 'aguardando_gerente', 'liberada', 'coletada', 'entregue', 'em_teste', 'aprovada', 'reprovada']
    for (const s of expected) {
      expect(subStatusAmostraLabels[s]).toBeDefined()
    }
  })
})

describe('subStatusFollowUpLabels', () => {
  it('deve ter labels para todos os sub-status de follow-up', () => {
    const expected = ['pedido_aprovado', 'em_producao', 'faturado', 'expedido', 'entregue', 'satisfacao_pendente', 'concluido']
    for (const s of expected) {
      expect(subStatusFollowUpLabels[s]).toBeDefined()
    }
  })
})
