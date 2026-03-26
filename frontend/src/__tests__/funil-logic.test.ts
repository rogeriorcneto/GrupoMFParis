import { describe, it, expect } from 'vitest'
import {
  diasDesde,
  getCardUrgencia,
  getNextAction,
  mapEtapaAgendor,
  mapCategoriaPerdaAgendor,
  sortCards,
  prazosEtapa,
} from '../utils/funil-logic'
import type { Cliente } from '../types'

function makeCliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 1,
    razaoSocial: 'Empresa Teste',
    cnpj: '',
    contatoNome: '',
    contatoTelefone: '',
    contatoEmail: '',
    etapa: 'prospecção',
    vendedorId: 1,
    score: 50,
    diasInativo: 0,
    historicoEtapas: [],
    ...overrides,
  }
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

// ─── diasDesde ───

describe('diasDesde', () => {
  it('retorna 0 para undefined', () => {
    expect(diasDesde(undefined)).toBe(0)
  })

  it('retorna 0 para data de hoje', () => {
    expect(diasDesde(new Date().toISOString())).toBe(0)
  })

  it('retorna número correto de dias', () => {
    const tenDaysAgo = daysAgo(10)
    expect(diasDesde(tenDaysAgo)).toBeGreaterThanOrEqual(9)
    expect(diasDesde(tenDaysAgo)).toBeLessThanOrEqual(11)
  })
})

// ─── prazosEtapa ───

describe('prazosEtapa', () => {
  it('amostra tem prazo de 45 dias', () => {
    expect(prazosEtapa['amostra']).toBe(45)
  })

  it('proposta tem prazo de 60 dias', () => {
    expect(prazosEtapa['proposta']).toBe(60)
  })

  it('negociacao tem prazo de 45 dias', () => {
    expect(prazosEtapa['negociacao']).toBe(45)
  })

  it('follow_up tem prazo de 60 dias', () => {
    expect(prazosEtapa['follow_up']).toBe(60)
  })

  it('prospecção não tem prazo', () => {
    expect(prazosEtapa['prospecção']).toBeUndefined()
  })
})

// ─── getCardUrgencia ───

describe('getCardUrgencia', () => {
  it('retorna normal para cliente recém-criado em amostra', () => {
    const c = makeCliente({ etapa: 'amostra', dataEntradaEtapa: daysAgo(5) })
    expect(getCardUrgencia(c)).toBe('normal')
  })

  it('retorna atencao em 83% do prazo de amostra (~37d)', () => {
    const c = makeCliente({ etapa: 'amostra', dataEntradaEtapa: daysAgo(38) })
    expect(getCardUrgencia(c)).toBe('atencao')
  })

  it('retorna critico quando prazo de amostra vence (45d)', () => {
    const c = makeCliente({ etapa: 'amostra', dataEntradaEtapa: daysAgo(46) })
    expect(getCardUrgencia(c)).toBe('critico')
  })

  it('retorna atencao em 83% do prazo de proposta (~50d)', () => {
    const c = makeCliente({ etapa: 'proposta', dataEntradaEtapa: daysAgo(50) })
    expect(getCardUrgencia(c)).toBe('atencao')
  })

  it('retorna critico quando prazo de proposta vence (60d)', () => {
    const c = makeCliente({ etapa: 'proposta', dataEntradaEtapa: daysAgo(61) })
    expect(getCardUrgencia(c)).toBe('critico')
  })

  it('retorna atencao em 83% do prazo de negociacao (~37d)', () => {
    const c = makeCliente({ etapa: 'negociacao', dataEntradaEtapa: daysAgo(38) })
    expect(getCardUrgencia(c)).toBe('atencao')
  })

  it('retorna critico quando prazo de negociacao vence (45d)', () => {
    const c = makeCliente({ etapa: 'negociacao', dataEntradaEtapa: daysAgo(46) })
    expect(getCardUrgencia(c)).toBe('critico')
  })

  it('retorna atencao quando dias inativo > 14 (sem prazo de etapa)', () => {
    const c = makeCliente({ etapa: 'prospecção', diasInativo: 15, dataEntradaEtapa: daysAgo(3) })
    expect(getCardUrgencia(c)).toBe('atencao')
  })

  it('retorna normal para prospecção ativa', () => {
    const c = makeCliente({ etapa: 'prospecção', diasInativo: 5, dataEntradaEtapa: daysAgo(3) })
    expect(getCardUrgencia(c)).toBe('normal')
  })
})

// ─── getNextAction ───

describe('getNextAction', () => {
  it('prospecção inativo >= 5d sugere ligar', () => {
    const c = makeCliente({ etapa: 'prospecção', diasInativo: 5 })
    const action = getNextAction(c)
    expect(action?.text).toContain('URGENTE')
    expect(action?.color).toBe('text-red-600')
  })

  it('prospecção inativo > 3d sugere ligar', () => {
    const c = makeCliente({ etapa: 'prospecção', diasInativo: 4 })
    const action = getNextAction(c)
    expect(action?.text).toContain('Ligar agora')
    expect(action?.color).toBe('text-orange-600')
  })

  it('prospecção ativa sugere apresentação', () => {
    const c = makeCliente({ etapa: 'prospecção', diasInativo: 1 })
    const action = getNextAction(c)
    expect(action?.text).toContain('apresentação')
  })

  it('amostra sub-status solicitada sugere aguardar gerente', () => {
    const c = makeCliente({ etapa: 'amostra', statusAmostra: 'solicitada' as any, dataEntradaEtapa: daysAgo(3) })
    const action = getNextAction(c)
    expect(action?.text).toContain('aprovação gerente')
  })

  it('amostra sub-status em_teste >= 40d sugere cobrar URGENTE', () => {
    const c = makeCliente({ etapa: 'amostra', statusAmostra: 'em_teste' as any, dataEntradaEtapa: daysAgo(41) })
    const action = getNextAction(c)
    expect(action?.text).toContain('URGENTE')
    expect(action?.color).toBe('text-red-600')
  })

  it('amostra >= 40d (sem sub-status) sugere cobrar retorno urgente', () => {
    const c = makeCliente({ etapa: 'amostra', dataEntradaEtapa: daysAgo(41) })
    const action = getNextAction(c)
    expect(action?.text).toContain('URGENTE')
    expect(action?.color).toBe('text-red-600')
  })

  it('amostra >= 20d sugere follow-up', () => {
    const c = makeCliente({ etapa: 'amostra', dataEntradaEtapa: daysAgo(21) })
    const action = getNextAction(c)
    expect(action?.text).toContain('Follow-up')
  })

  it('amostra recente sugere aguardar', () => {
    const c = makeCliente({ etapa: 'amostra', dataEntradaEtapa: daysAgo(3) })
    const action = getNextAction(c)
    expect(action?.text).toContain('Aguardar')
  })

  it('proposta >= 50d sugere enviar URGENTE', () => {
    const c = makeCliente({ etapa: 'proposta', dataEntradaEtapa: daysAgo(51) })
    const action = getNextAction(c)
    expect(action?.text).toContain('URGENTE')
  })

  it('proposta >= 30d sugere follow-up', () => {
    const c = makeCliente({ etapa: 'proposta', dataEntradaEtapa: daysAgo(31) })
    const action = getNextAction(c)
    expect(action?.text).toContain('Follow-up')
  })

  it('proposta recente sugere preparar proposta', () => {
    const c = makeCliente({ etapa: 'proposta', dataEntradaEtapa: daysAgo(3) })
    const action = getNextAction(c)
    expect(action?.text).toContain('proposta comercial')
  })

  it('negociacao >= 35d sugere cobrar resposta', () => {
    const c = makeCliente({ etapa: 'negociacao', dataEntradaEtapa: daysAgo(36) })
    const action = getNextAction(c)
    expect(action?.text).toContain('Cobrar resposta')
  })

  it('negociacao recente sugere aguardar decisão', () => {
    const c = makeCliente({ etapa: 'negociacao', dataEntradaEtapa: daysAgo(5) })
    const action = getNextAction(c)
    expect(action?.text).toContain('Aguardar decisão')
  })

  it('follow_up pedido_aprovado sugere aguardar produção', () => {
    const c = makeCliente({ etapa: 'follow_up', statusFollowUp: 'pedido_aprovado' as any })
    const action = getNextAction(c)
    expect(action?.text).toContain('produção')
  })

  it('follow_up entregue sugere avaliar satisfação', () => {
    const c = makeCliente({ etapa: 'follow_up', statusFollowUp: 'entregue' as any })
    const action = getNextAction(c)
    expect(action?.text).toContain('satisfação')
  })

  it('follow_up concluido sugere ciclo concluído', () => {
    const c = makeCliente({ etapa: 'follow_up', statusFollowUp: 'concluido' as any })
    const action = getNextAction(c)
    expect(action).toBeDefined()
  })

  it('lead sugere encaminhar para prospecção', () => {
    const c = makeCliente({ etapa: 'lead', diasInativo: 0 })
    const action = getNextAction(c)
    expect(action?.text).toContain('prospecção')
  })

  it('amostra_perdida com tentativa < 2 sugere 2ª tentativa', () => {
    const c = makeCliente({ etapa: 'amostra_perdida', tentativaAmostra: 1 })
    const action = getNextAction(c)
    expect(action?.text).toContain('2ª tentativa')
  })

  it('amostra_perdida com tentativa >= 2 sugere mover para Perdido', () => {
    const c = makeCliente({ etapa: 'amostra_perdida', tentativaAmostra: 2 })
    const action = getNextAction(c)
    expect(action?.text).toContain('Perdido')
  })

  it('inativo sugere reativação', () => {
    const c = makeCliente({ etapa: 'inativo', diasInativo: 100 })
    const action = getNextAction(c)
    expect(action?.text).toContain('reativação')
  })

  it('perdido há 60+ dias sugere reconquista', () => {
    const c = makeCliente({ etapa: 'perdido', dataPerda: daysAgo(61) })
    const action = getNextAction(c)
    expect(action?.text).toContain('reconquista')
  })

  it('perdido recente retorna null', () => {
    const c = makeCliente({ etapa: 'perdido', dataPerda: daysAgo(10) })
    expect(getNextAction(c)).toBeNull()
  })

  it('etapa desconhecida retorna null', () => {
    const c = makeCliente({ etapa: 'etapa_fake' as any })
    expect(getNextAction(c)).toBeNull()
  })
})

// ─── mapEtapaAgendor ───

describe('mapEtapaAgendor', () => {
  it('status perdido → etapa perdido', () => {
    expect(mapEtapaAgendor('Qualquer', 'Perdido')).toBe('perdido')
    expect(mapEtapaAgendor('Qualquer', 'lost')).toBe('perdido')
  })

  it('CONTATO → prospecção', () => {
    expect(mapEtapaAgendor('CONTATO INICIAL', 'ativo')).toBe('prospecção')
  })

  it('Prospecção → prospecção', () => {
    expect(mapEtapaAgendor('Prospecção Ativa', 'ativo')).toBe('prospecção')
  })

  it('PROPOSTA ENVIADA → proposta', () => {
    expect(mapEtapaAgendor('PROPOSTA ENVIADA', 'ativo')).toBe('proposta')
  })

  it('Negociação → negociacao', () => {
    expect(mapEtapaAgendor('Em Negociação', 'ativo')).toBe('negociacao')
  })

  it('ENVIO DO PEDIDO → negociacao', () => {
    expect(mapEtapaAgendor('ENVIO DO PEDIDO', 'ativo')).toBe('negociacao')
  })

  it('FOLLOW-UP → follow_up', () => {
    expect(mapEtapaAgendor('FOLLOW-UP', 'ativo')).toBe('follow_up')
  })

  it('Pós-Venda → follow_up', () => {
    expect(mapEtapaAgendor('Pós-Venda', 'ativo')).toBe('follow_up')
  })

  it('Amostra → amostra', () => {
    expect(mapEtapaAgendor('Amostra Enviada', 'ativo')).toBe('amostra')
  })

  it('Homologação → proposta', () => {
    expect(mapEtapaAgendor('Homologação', 'ativo')).toBe('proposta')
  })

  it('Cliente Ativo → follow_up', () => {
    expect(mapEtapaAgendor('Cliente Ativo', 'ativo')).toBe('follow_up')
    expect(mapEtapaAgendor('Carteira', 'ativo')).toBe('follow_up')
  })

  it('etapa desconhecida → prospecção (fallback)', () => {
    expect(mapEtapaAgendor('Etapa XYZ', 'ativo')).toBe('prospecção')
  })
})

// ─── mapCategoriaPerdaAgendor ───

describe('mapCategoriaPerdaAgendor', () => {
  it('preço/valor/caro → preco', () => {
    expect(mapCategoriaPerdaAgendor('Preço alto')).toBe('preco')
    expect(mapCategoriaPerdaAgendor('muito caro')).toBe('preco')
    expect(mapCategoriaPerdaAgendor('valor elevado')).toBe('preco')
  })

  it('prazo/demora → prazo', () => {
    expect(mapCategoriaPerdaAgendor('Prazo longo')).toBe('prazo')
    expect(mapCategoriaPerdaAgendor('demorou muito')).toBe('prazo')
  })

  it('qualidade/produto → qualidade', () => {
    expect(mapCategoriaPerdaAgendor('Qualidade ruim')).toBe('qualidade')
    expect(mapCategoriaPerdaAgendor('Produto inadequado')).toBe('qualidade')
  })

  it('concorrência → concorrencia', () => {
    expect(mapCategoriaPerdaAgendor('Perdeu para concorrente')).toBe('concorrencia')
  })

  it('sem resposta/retorno → sem_resposta', () => {
    expect(mapCategoriaPerdaAgendor('Sem resposta')).toBe('sem_resposta')
    expect(mapCategoriaPerdaAgendor('Não retornou contato')).toBe('sem_resposta')
  })

  it('motivo desconhecido → outro', () => {
    expect(mapCategoriaPerdaAgendor('Motivo desconhecido')).toBe('outro')
    expect(mapCategoriaPerdaAgendor('')).toBe('outro')
  })
})

// ─── sortCards ───

describe('sortCards', () => {
  it('por urgencia: critico > atencao > normal', () => {
    const critico = makeCliente({ id: 1, etapa: 'amostra', dataEntradaEtapa: daysAgo(46), score: 10 })
    const normal = makeCliente({ id: 2, etapa: 'prospecção', diasInativo: 0, score: 90, dataEntradaEtapa: daysAgo(1) })
    const atencao = makeCliente({ id: 3, etapa: 'amostra', dataEntradaEtapa: daysAgo(38), score: 50 })

    const sorted = sortCards([normal, critico, atencao], 'urgencia')
    expect(sorted[0].id).toBe(1) // critico
    expect(sorted[1].id).toBe(3) // atencao
    expect(sorted[2].id).toBe(2) // normal
  })

  it('por urgencia: mesma urgencia ordena por score desc', () => {
    const a = makeCliente({ id: 1, etapa: 'prospecção', score: 30, dataEntradaEtapa: daysAgo(1) })
    const b = makeCliente({ id: 2, etapa: 'prospecção', score: 80, dataEntradaEtapa: daysAgo(1) })
    const sorted = sortCards([a, b], 'urgencia')
    expect(sorted[0].id).toBe(2)
    expect(sorted[1].id).toBe(1)
  })

  it('por score: maior score primeiro', () => {
    const a = makeCliente({ id: 1, score: 30 })
    const b = makeCliente({ id: 2, score: 90 })
    const sorted = sortCards([a, b], 'score')
    expect(sorted[0].id).toBe(2)
  })

  it('por valor: maior valor primeiro', () => {
    const a = makeCliente({ id: 1, valorEstimado: 1000 })
    const b = makeCliente({ id: 2, valorEstimado: 50000 })
    const sorted = sortCards([a, b], 'valor')
    expect(sorted[0].id).toBe(2)
  })

  it('não muta o array original', () => {
    const arr = [makeCliente({ id: 1, score: 10 }), makeCliente({ id: 2, score: 90 })]
    const original = [...arr]
    sortCards(arr, 'score')
    expect(arr[0].id).toBe(original[0].id)
  })
})
