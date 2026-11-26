import { describe, expect, it } from 'vitest'
import type { Cliente, Pedido } from '../types'
import { classificarSituacaoCompra, obterSituacaoCompraCliente } from '../utils/situacaoCompra'
import { avaliarCadastroCliente, CAMPOS_CADASTRO_PADRAO } from '../utils/cadastroCompleto'
import { validarFinalizacaoTarefa, addDiasISO } from '../utils/tarefaFluxo'

const clienteBase = (over: Partial<Cliente> = {}): Cliente => ({
  id: 1,
  razaoSocial: 'Empresa Teste',
  cnpj: '12345678000190',
  contatoNome: 'Comprador',
  contatoTelefone: '31999990000',
  contatoEmail: 'compras@teste.com',
  etapa: 'proposta',
  vendedorId: 1,
  score: 0,
  produtosInteresse: [],
  criadoEm: new Date().toISOString(),
  ...over,
} as Cliente)

const pedidoBase = (over: Partial<Pedido> = {}): Pedido => ({
  id: 1,
  numero: 'PED-1',
  clienteId: 1,
  vendedorId: 1,
  observacoes: '',
  status: 'confirmado',
  itens: [],
  totalValor: 100,
  dataCriacao: '2026-01-01T00:00:00Z',
  dataEnvio: '2026-01-01T00:00:00Z',
  tipo: 'venda',
  formaPagamento: 'À vista',
  ...over,
} as Pedido)

describe('Fase 1 — situação de compra', () => {
  it('classifica as faixas oficiais de 40/60/90/180 dias', () => {
    const ref = new Date('2026-11-25T12:00:00')
    expect(classificarSituacaoCompra('2026-10-16', ref)).toMatchObject({ situacao: 'ativo', dias: 40 })
    expect(classificarSituacaoCompra('2026-10-15', ref)).toMatchObject({ situacao: 'em_atencao', dias: 41 })
    expect(classificarSituacaoCompra('2026-09-25', ref)).toMatchObject({ situacao: 'em_risco', dias: 61 })
    expect(classificarSituacaoCompra('2026-08-26', ref)).toMatchObject({ situacao: 'inativo_recente', dias: 91 })
    expect(classificarSituacaoCompra('2026-05-28', ref)).toMatchObject({ situacao: 'inativo_antigo', dias: 180 + 1 })
    expect(classificarSituacaoCompra(null, ref).situacao).toBe('prospecto')
  })

  it('aceita o caso de aceite: 22/06/2026 em 25/11/2026 = 156 dias, inativo recente', () => {
    const r = classificarSituacaoCompra('2026-06-22', new Date('2026-11-25T12:00:00'))
    expect(r).toEqual({ situacao: 'inativo_recente', dias: 156 })
  })

  it('não conta bonificação nem pedido não aprovado como última venda', () => {
    const cli = clienteBase()
    const bonificacao = pedidoBase({ id: 1, tipo: 'bonificacao', omieCodigo: '10', dataAprovacao: '2026-11-20' })
    const pendente = pedidoBase({ id: 2, status: 'enviado', omieCodigo: '11', dataAprovacao: undefined })
    const venda = pedidoBase({ id: 3, omieCodigo: '12', dataAprovacao: '2026-10-20T10:00:00Z' })
    const r = obterSituacaoCompraCliente(cli, [cli], [bonificacao, pendente, venda], new Date('2026-11-25T12:00:00'))
    expect(r.ultimaVenda).toBe('2026-10-20T10:00:00Z')
    expect(r.situacao).toBe('ativo')
  })
})

describe('Fase 1 — cadastro completo', () => {
  const completo = clienteBase({
    contatoComprasNome: 'Ana', contatoComprasTelefone: '31999990000', contatoComprasSetor: 'Compras',
    contatoFinanceiroNome: 'João', contatoFinanceiroTelefone: '31988880000', contatoFinanceiroSetor: 'Financeiro',
    emailBoleto: 'boletos@teste.com',
    enderecoRua: 'Rua A', enderecoNumero: '10', enderecoBairro: 'Centro', enderecoCidade: 'BH', enderecoEstado: 'MG', enderecoCep: '30000000',
    segmento: 'Indústria', instagram: '@empresa',
    produtosInteresse: ['Leite Pó'], produtosQuantidadesMensais: { 'Leite Pó': 100 },
  })

  it('marca incompleto com 1 campo quando falta só e-mail de boleto', () => {
    const r = avaliarCadastroCliente({ ...completo, emailBoleto: '' }, [completo], CAMPOS_CADASTRO_PADRAO, new Date())
    expect(r.situacao).toBe('incompleto')
    expect(r.faltantes).toEqual(['email_boleto'])
  })

  it('Instagram sozinho cumpre presença digital', () => {
    const r = avaliarCadastroCliente(completo, [completo], CAMPOS_CADASTRO_PADRAO, new Date())
    expect(r.situacao).toBe('completo')
  })

  it('produto sem consumo mensal deixa cadastro incompleto', () => {
    const c = { ...completo, produtosQuantidadesMensais: { 'Leite Pó': 0 } }
    const r = avaliarCadastroCliente(c, [c], CAMPOS_CADASTRO_PADRAO, new Date())
    expect(r.faltantes).toContain('produtos_interesse')
  })

  it('campo marcado como Não possui conta como cumprido com justificativa', () => {
    const c = {
      ...completo,
      emailBoleto: '',
      cadastroJustificativas: [{ campo: 'email_boleto', justificativa: 'Cliente recebe pelo financeiro geral', autor: 'Gestor', criadoEm: new Date().toISOString(), ativo: true }],
    } as Cliente
    const r = avaliarCadastroCliente(c, [c], CAMPOS_CADASTRO_PADRAO, new Date())
    expect(r.situacao).toBe('completo_com_justificativa')
    expect(r.justificados).toEqual(['email_boleto'])
  })

  it('incompleto há mais de 15 dias vira incompleto vencido', () => {
    const c = { ...completo, emailBoleto: '', criadoEm: '2026-11-01T00:00:00Z' }
    const r = avaliarCadastroCliente(c, [c], CAMPOS_CADASTRO_PADRAO, new Date('2026-11-25T12:00:00'))
    expect(r.situacao).toBe('incompleto_vencido')
  })
})

describe('Fase 1 — fluxo de finalização de tarefa', () => {
  const base = {
    canalUsado: 'ligacao' as const,
    conclusao: 'Falei com o comprador',
    proximoPasso: {
      tipo: 'whatsapp' as const,
      objetivo: 'relacionamento' as const,
      data: '2026-11-26',
      descricao: 'Verificar estoque',
    },
  }
  it('não permite finalizar sem próximo passo completo', () => {
    expect(validarFinalizacaoTarefa({ ...base, proximoPasso: { ...base.proximoPasso, descricao: '' } }, new Date('2026-11-25T12:00:00'))).toMatch(/descrição/i)
  })
  it('exige justificativa quando próximo passo passa de 15 dias', () => {
    const ref = new Date('2026-11-25T12:00:00')
    const data = addDiasISO(ref, 16)
    expect(validarFinalizacaoTarefa({ ...base, proximoPasso: { ...base.proximoPasso, data } }, ref)).toMatch(/justificativa/i)
    expect(validarFinalizacaoTarefa({ ...base, proximoPasso: { ...base.proximoPasso, data, justificativaPrazoLongo: 'Cliente parou a linha' } }, ref)).toBeNull()
  })
})
