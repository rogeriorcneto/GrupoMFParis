import { describe, it, expect } from 'vitest'
import { stageLabels, transicoesPermitidas, subStatusAmostraLabels, subStatusFollowUpLabels } from '../utils/constants'

describe('stageLabels', () => {
  const ALL_STAGES = ['lead', 'prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up', 'inativo', 'perdido']

  it('deve ter label para cada etapa do funil', () => {
    for (const stage of ALL_STAGES) {
      expect(stageLabels[stage]).toBeDefined()
      expect(stageLabels[stage].length).toBeGreaterThan(0)
    }
  })

  it('labels devem ser strings legíveis', () => {
    expect(stageLabels['follow_up']).toBe('Follow-up')
    expect(stageLabels['inativo']).toBe('Clientes Inativos')
    expect(stageLabels['lead']).toBe('Leads')
    expect(stageLabels['amostra_perdida']).toBe('Amostra Perdida')
  })
})

describe('transicoesPermitidas', () => {
  const ALL_STAGES = ['lead', 'prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up', 'inativo', 'perdido']

  it('deve definir transições para cada etapa', () => {
    for (const stage of ALL_STAGES) {
      expect(transicoesPermitidas[stage]).toBeDefined()
      expect(Array.isArray(transicoesPermitidas[stage])).toBe(true)
    }
  })

  it('lead só pode ir para prospecção', () => {
    expect(transicoesPermitidas['lead']).toEqual(['prospecção'])
  })

  it('prospecção só pode ir para amostra ou perdido', () => {
    expect(transicoesPermitidas['prospecção']).toEqual(['amostra', 'perdido'])
  })

  it('amostra pode ir para proposta ou amostra_perdida', () => {
    expect(transicoesPermitidas['amostra']).toEqual(['proposta', 'amostra_perdida'])
  })

  it('amostra_perdida pode voltar para amostra ou ir para perdido', () => {
    expect(transicoesPermitidas['amostra_perdida']).toEqual(['amostra', 'perdido'])
  })

  it('proposta pode ir para negociacao ou perdido', () => {
    expect(transicoesPermitidas['proposta']).toEqual(['negociacao', 'perdido'])
  })

  it('negociacao pode ir para follow_up, proposta ou perdido', () => {
    expect(transicoesPermitidas['negociacao']).toEqual(['follow_up', 'proposta', 'perdido'])
  })

  it('follow_up pode ir para negociacao ou perdido', () => {
    expect(transicoesPermitidas['follow_up']).toEqual(['negociacao', 'perdido'])
  })

  it('inativo pode ir para prospecção ou perdido', () => {
    expect(transicoesPermitidas['inativo']).toEqual(['prospecção', 'perdido'])
  })

  it('perdido pode voltar para prospecção ou proposta', () => {
    expect(transicoesPermitidas['perdido']).toEqual(['prospecção', 'proposta'])
  })

  it('transições ilegais não devem existir', () => {
    expect(transicoesPermitidas['prospecção']).not.toContain('negociacao')
    expect(transicoesPermitidas['prospecção']).not.toContain('follow_up')
    expect(transicoesPermitidas['amostra']).not.toContain('negociacao')
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
