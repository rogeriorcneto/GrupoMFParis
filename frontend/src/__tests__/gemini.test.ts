import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}))

import { buildCRMContext } from '../lib/gemini'

describe('buildCRMContext', () => {
  const vendedores = [
    { id: 1, nome: 'Rafael', cargo: 'gerente', metaVendas: 100000, email: '', telefone: '', avatar: '', metaLeads: 0, metaConversao: 0, ativo: true },
    { id: 2, nome: 'Ana', cargo: 'vendedor', metaVendas: 50000, email: '', telefone: '', avatar: '', metaLeads: 0, metaConversao: 0, ativo: true },
  ]

  const clientes = [
    { id: 1, razaoSocial: 'Empresa A', nomeFantasia: 'A', cnpj: '111', etapa: 'prospecção', score: 80, valorEstimado: 10000, vendedorId: 1, diasInativo: 5, enderecoEstado: 'SP', contatoNome: 'João', contatoTelefone: '119', contatoEmail: 'j@a.com', enderecoMunicipio: 'São Paulo' },
    { id: 2, razaoSocial: 'Empresa B', nomeFantasia: '', cnpj: '222', etapa: 'negociacao', score: 60, valorEstimado: 20000, vendedorId: 2, diasInativo: 35, enderecoEstado: 'MG', contatoNome: 'Maria', contatoTelefone: '319', contatoEmail: 'm@b.com', enderecoMunicipio: 'BH' },
    { id: 3, razaoSocial: 'Empresa C', nomeFantasia: '', cnpj: '333', etapa: 'perdido', score: 10, valorEstimado: 5000, vendedorId: 1, diasInativo: 100, enderecoEstado: 'RJ', contatoNome: '', contatoTelefone: '', contatoEmail: '', enderecoMunicipio: '' },
  ]

  const pedidos = [
    { numero: 'PED-001', status: 'enviado', totalValor: 5000, dataCriacao: '2025-01-01' },
    { numero: 'PED-002', status: 'confirmado', totalValor: 15000, dataCriacao: '2025-01-15' },
  ]

  const interacoes = [
    { id: 1, clienteId: 1, tipo: 'whatsapp', data: '2025-01-01' },
  ]

  const loggedUser = { id: 1, nome: 'Rafael Silva', cargo: 'gerente' }

  it('contém resumo executivo com totais corretos', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('Total clientes: 3')
    expect(ctx).toContain('2 ativos')
    expect(ctx).toContain('1 perdidos')
  })

  it('contém dados do usuário logado', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('Rafael Silva')
    expect(ctx).toContain('gerente')
  })

  it('contém seção POR ETAPA', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('POR ETAPA')
    expect(ctx).toContain('prospecção')
    expect(ctx).toContain('negociacao')
    expect(ctx).toContain('perdido')
  })

  it('contém seção POR ESTADO', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('POR ESTADO')
    expect(ctx).toContain('SP')
    expect(ctx).toContain('MG')
  })

  it('contém seção EQUIPE com vendedores e metas', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('EQUIPE')
    expect(ctx).toContain('Rafael')
    expect(ctx).toContain('Ana')
  })

  it('contém TOP 10 SCORE e TOP 10 VALOR', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('TOP 10 SCORE')
    expect(ctx).toContain('TOP 10 VALOR')
    expect(ctx).toContain('Empresa A')
  })

  it('contém TOP 10 MAIS INATIVOS', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('TOP 10 MAIS INATIVOS')
  })

  it('contém pedidos recentes', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('PEDIDOS RECENTES')
    expect(ctx).toContain('PED-001')
    expect(ctx).toContain('PED-002')
  })

  it('contém inativos +30d e +60d (somente ativos)', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    // Empresa B (35d inativo, ativo) counts for +30d; Empresa C (100d) is perdido so excluded
    expect(ctx).toContain('Inativos +30d: 1')
    expect(ctx).toContain('+60d: 0')
  })

  it('contém personalidade e regras de comportamento', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    expect(ctx).toContain('Grupo MF Paris')
    expect(ctx).toContain('Rogério Reis')
    expect(ctx).toContain('INSTRUÇÕES')
  })

  it('faturamento confirmado calculado corretamente', () => {
    const ctx = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })
    // PED-002 confirmado = R$ 15.000
    expect(ctx).toContain('15.000')
  })

  it('funciona com arrays vazios', () => {
    const ctx = buildCRMContext({ clientes: [], pedidos: [], vendedores: [], interacoes: [], loggedUser: undefined })
    expect(ctx).toContain('Total clientes: 0')
    expect(ctx).toContain('Grupo MF Paris')
  })
})
