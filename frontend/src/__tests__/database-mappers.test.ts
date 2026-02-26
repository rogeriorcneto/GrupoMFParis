import { describe, it, expect } from 'vitest'
import { clienteFromDb } from '../lib/database'

describe('clienteFromDb', () => {
  const fullRow = {
    id: 42,
    razao_social: 'Empresa X LTDA',
    nome_fantasia: 'Empresa X',
    cnpj: '12.345.678/0001-99',
    contato_nome: 'João Silva',
    contato_telefone: '(31) 99999-1234',
    contato_email: 'joao@empresax.com',
    endereco: 'Rua ABC, 123',
    whatsapp: '5531999991234',
    omie_codigo: 'OMI-001',
    etapa: 'negociacao',
    etapa_anterior: 'homologado',
    data_entrada_etapa: '2025-01-15T10:00:00Z',
    vendedor_id: 5,
    score: 85,
    valor_estimado: 150000,
    produtos_interesse: ['Sacaria', 'Café'],
    ultima_interacao: '2025-02-01',
    dias_inativo: 3,
    data_envio_amostra: '2025-01-10',
    status_amostra: 'aprovada',
    data_homologacao: '2025-01-12',
    proximo_pedido_previsto: '2025-03-01',
    valor_proposta: 120000,
    data_proposta: '2025-01-20',
    status_entrega: 'em_transito',
    data_entrega_prevista: '2025-02-15',
    data_entrega_realizada: null,
    status_faturamento: 'a_faturar',
    data_ultimo_pedido: '2025-01-25',
    motivo_perda: null,
    categoria_perda: null,
    data_perda: null,
    origem_lead: 'indicação',
    notas: 'Cliente prioritário',
  }

  it('mapeia todos os campos snake_case para camelCase', () => {
    const c = clienteFromDb(fullRow)
    expect(c.id).toBe(42)
    expect(c.razaoSocial).toBe('Empresa X LTDA')
    expect(c.nomeFantasia).toBe('Empresa X')
    expect(c.cnpj).toBe('12.345.678/0001-99')
    expect(c.contatoNome).toBe('João Silva')
    expect(c.contatoTelefone).toBe('(31) 99999-1234')
    expect(c.contatoEmail).toBe('joao@empresax.com')
    expect(c.endereco).toBe('Rua ABC, 123')
    expect(c.whatsapp).toBe('5531999991234')
    expect(c.omieCodigo).toBe('OMI-001')
    expect(c.etapa).toBe('negociacao')
    expect(c.etapaAnterior).toBe('homologado')
    expect(c.dataEntradaEtapa).toBe('2025-01-15T10:00:00Z')
    expect(c.vendedorId).toBe(5)
    expect(c.score).toBe(85)
    expect(c.valorEstimado).toBe(150000)
    expect(c.produtosInteresse).toEqual(['Sacaria', 'Café'])
    expect(c.ultimaInteracao).toBe('2025-02-01')
    expect(c.diasInativo).toBe(3)
    expect(c.dataEnvioAmostra).toBe('2025-01-10')
    expect(c.statusAmostra).toBe('aprovada')
    expect(c.dataHomologacao).toBe('2025-01-12')
    expect(c.proximoPedidoPrevisto).toBe('2025-03-01')
    expect(c.valorProposta).toBe(120000)
    expect(c.dataProposta).toBe('2025-01-20')
    expect(c.statusEntrega).toBe('em_transito')
    expect(c.dataEntregaPrevista).toBe('2025-02-15')
    expect(c.statusFaturamento).toBe('a_faturar')
    expect(c.dataUltimoPedido).toBe('2025-01-25')
    expect(c.origemLead).toBe('indicação')
    expect(c.notas).toBe('Cliente prioritário')
  })

  it('inicializa historicoEtapas como array vazio', () => {
    const c = clienteFromDb(fullRow)
    expect(c.historicoEtapas).toEqual([])
  })

  it('trata campos null/undefined com defaults seguros', () => {
    const minimalRow = { id: 1, etapa: 'prospecção', vendedor_id: 1 }
    const c = clienteFromDb(minimalRow)
    expect(c.razaoSocial).toBe('')
    expect(c.cnpj).toBe('')
    expect(c.contatoNome).toBe('')
    expect(c.contatoTelefone).toBe('')
    expect(c.contatoEmail).toBe('')
    expect(c.score).toBe(0)
    expect(c.diasInativo).toBe(0)
    expect(c.produtosInteresse).toEqual([])
    expect(c.historicoEtapas).toEqual([])
  })

  it('campos opcionais ficam undefined quando null no DB', () => {
    const minimalRow = { id: 1, etapa: 'prospecção', vendedor_id: 1 }
    const c = clienteFromDb(minimalRow)
    expect(c.nomeFantasia).toBeUndefined()
    expect(c.endereco).toBeUndefined()
    expect(c.whatsapp).toBeUndefined()
    expect(c.motivoPerda).toBeUndefined()
    expect(c.categoriaPerda).toBeUndefined()
    expect(c.dataPerda).toBeUndefined()
    expect(c.origemLead).toBeUndefined()
    expect(c.notas).toBeUndefined()
    expect(c.dataEntregaRealizada).toBeUndefined()
    expect(c.dataEntregaPrevista).toBeUndefined()
  })

  it('preserva tipos numéricos', () => {
    const c = clienteFromDb(fullRow)
    expect(typeof c.id).toBe('number')
    expect(typeof c.vendedorId).toBe('number')
    expect(typeof c.score).toBe('number')
    expect(typeof c.valorEstimado).toBe('number')
    expect(typeof c.diasInativo).toBe('number')
  })

  it('preserva arrays', () => {
    const c = clienteFromDb(fullRow)
    expect(Array.isArray(c.produtosInteresse)).toBe(true)
    expect(Array.isArray(c.historicoEtapas)).toBe(true)
  })
})
