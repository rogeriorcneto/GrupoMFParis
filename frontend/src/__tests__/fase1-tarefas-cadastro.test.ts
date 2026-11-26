import { describe, expect, it } from 'vitest'
import type { Cliente, Pedido, Tarefa } from '../types'
import { classificarSituacaoCompra, obterSituacaoCompraCliente } from '../utils/situacaoCompra'
import { avaliarCadastroCliente, CAMPOS_CADASTRO_PADRAO } from '../utils/cadastroCompleto'
import {
  addDiasISO,
  clienteJaTemOutraTarefaAberta,
  ehTarefaIncluirProdutos,
  montarTarefasIniciaisCliente,
  validarFinalizacaoTarefa,
} from '../utils/tarefaFluxo'

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
  it('não permite finalizar sem próximo passo quando não há outra tarefa aberta nem com data no passado', () => {
    const ref = new Date('2026-11-25T12:00:00')
    expect(validarFinalizacaoTarefa({ canalUsado: 'ligacao', conclusao: 'Falei com o comprador' }, ref, { exigeProximoPasso: true })).toMatch(/tipo/i)
    expect(validarFinalizacaoTarefa({ ...base, proximoPasso: { ...base.proximoPasso, data: '2026-11-20' } }, ref)).toMatch(/passado/i)
    // Apenas tipo + data + objetivo (sem descrição manual) já é aceito
    expect(validarFinalizacaoTarefa({
      canalUsado: 'ligacao',
      conclusao: 'Contato realizado',
      proximoPasso: { tipo: 'whatsapp', objetivo: 'relacionamento', data: '2026-11-26' },
    }, ref)).toBeNull()
  })
  it('permite finalizar apenas com canal + conclusão quando já existe outra tarefa futura em aberto para o cliente', () => {
    const ref = new Date('2026-11-25T12:00:00')
    const cli = clienteBase({ id: 10 })
    const tAtual: Tarefa = { id: 1, titulo: 'Incluir produtos de interesse do cliente', data: '2026-11-25', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId: 10, vendedorId: 1 }
    const tFutura: Tarefa = { id: 2, titulo: 'Completar cadastro', data: '2026-12-05', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId: 10, vendedorId: 1 }
    const outra = clienteJaTemOutraTarefaAberta(tAtual, [tAtual, tFutura], [cli], ref)
    expect(outra?.id).toBe(2)
    expect(validarFinalizacaoTarefa({ canalUsado: 'whatsapp', conclusao: 'Contato feito' }, ref, { exigeProximoPasso: !outra })).toBeNull()
  })
  it('aceite Item 4: cliente com 4 tarefas abertas (mesmo vencidas) finaliza 3 sem exigir nova e exige próximo passo somente na 4ª', () => {
    const ref = new Date('2026-11-26T16:26:00')
    const cli = clienteBase({ id: 10 })
    const t1: Tarefa = { id: 1, titulo: 'T1', data: '2026-11-24', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId: 10, vendedorId: 1 }
    const t2: Tarefa = { id: 2, titulo: 'T2', data: '2026-11-24', tipo: 'email', status: 'pendente', prioridade: 'media', clienteId: 10, vendedorId: 1 }
    const t3: Tarefa = { id: 3, titulo: 'T3', data: '2026-11-24', tipo: 'whatsapp', status: 'pendente', prioridade: 'media', clienteId: 10, vendedorId: 1 }
    const t4: Tarefa = { id: 4, titulo: 'T4', data: '2026-11-24', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId: 10, vendedorId: 1 }

    // 1ª, 2ª e 3ª finalizações: ainda restam outras abertas -> não exige próximo passo
    expect(clienteJaTemOutraTarefaAberta(t1, [t1, t2, t3, t4], [cli], ref)?.id).toBe(2)
    expect(validarFinalizacaoTarefa({ canalUsado: 'email', conclusao: 'Enviado' }, ref, { exigeProximoPasso: false })).toBeNull()

    const apos1 = [{ ...t1, status: 'concluida' as const }, t2, t3, t4]
    expect(clienteJaTemOutraTarefaAberta(t2, apos1, [cli], ref)?.id).toBe(3)

    const apos2 = [{ ...t1, status: 'concluida' as const }, { ...t2, status: 'concluida' as const }, t3, t4]
    expect(clienteJaTemOutraTarefaAberta(t3, apos2, [cli], ref)?.id).toBe(4)

    // 4ª finalização (última aberta): exige próximo passo obrigatoriamente!
    const apos3 = [{ ...t1, status: 'concluida' as const }, { ...t2, status: 'concluida' as const }, { ...t3, status: 'concluida' as const }, t4]
    const outra4 = clienteJaTemOutraTarefaAberta(t4, apos3, [cli], ref)
    expect(outra4).toBeUndefined()
    expect(validarFinalizacaoTarefa({ canalUsado: 'whatsapp', conclusao: 'Concluída' }, ref, { exigeProximoPasso: !outra4 })).toMatch(/próximo passo/i)
  })
  it('exige registro de produtos com consumo mensal > 0 ao concluir tarefa de incluir produtos', () => {
    const ref = new Date('2026-11-25T12:00:00')
    expect(ehTarefaIncluirProdutos({ titulo: 'Incluir produtos de interesse do cliente' })).toBe(true)
    expect(
      validarFinalizacaoTarefa({ canalUsado: 'ligacao', conclusao: 'Levantado' }, ref, { exigeProximoPasso: false, exigeProdutosInteresse: true })
    ).toMatch(/produto/i)
    expect(
      validarFinalizacaoTarefa({
        canalUsado: 'ligacao',
        conclusao: 'Levantado',
        produtosInteresseRegistro: { produtosInteresse: ['Leite Pó'], produtosQuantidadesMensais: { 'Leite Pó': { kgMes: 0, atualizadoEm: ref.toISOString(), vendedorNome: 'Ana' } } },
      }, ref, { exigeProximoPasso: false, exigeProdutosInteresse: true })
    ).toMatch(/consumo mensal/i)
    expect(
      validarFinalizacaoTarefa({
        canalUsado: 'ligacao',
        conclusao: 'Levantado',
        produtosInteresseRegistro: { produtosInteresse: ['Leite Pó'], produtosQuantidadesMensais: { 'Leite Pó': { kgMes: 150, atualizadoEm: ref.toISOString(), vendedorNome: 'Ana' } } },
      }, ref, { exigeProximoPasso: false, exigeProdutosInteresse: true })
    ).toBeNull()
  })
  it('exige justificativa quando próximo passo passa de 15 dias', () => {
    const ref = new Date('2026-11-25T12:00:00')
    const data = addDiasISO(ref, 16)
    expect(validarFinalizacaoTarefa({ ...base, proximoPasso: { ...base.proximoPasso, data } }, ref)).toMatch(/justificativa/i)
    expect(validarFinalizacaoTarefa({ ...base, proximoPasso: { ...base.proximoPasso, data, justificativaPrazoLongo: 'Cliente parou a linha' } }, ref)).toBeNull()
  })
})

describe('Fase 1 — tarefas automáticas no cadastro de cliente novo', () => {
  it('cria as duas tarefas (5d produtos + 15d completar cadastro com campos faltantes) quando cadastro está incompleto', () => {
    const ref = new Date('2026-11-25T12:00:00')
    const cli = clienteBase({ id: 50, vendedorId: 3 })
    const tarefas = montarTarefasIniciaisCliente(cli, { referencia: ref })
    expect(tarefas).toHaveLength(2)
    expect(tarefas[0]).toMatchObject({
      titulo: 'Incluir produtos de interesse do cliente',
      data: '2026-11-30',
      objetivo: 'relacionamento',
      origem: 'automatica',
      clienteId: 50,
      vendedorId: 3,
    })
    expect(tarefas[1]).toMatchObject({
      titulo: 'Completar cadastro',
      data: '2026-12-10',
      objetivo: 'relacionamento',
      origem: 'automatica',
      clienteId: 50,
      vendedorId: 3,
    })
    expect(tarefas[1].descricao).toContain('Contato Financeiro')
    expect(tarefas[1].descricao).toContain('E-mail para boleto')
  })

  it('cria apenas a tarefa de produtos (5d) quando o cadastro já está completo e respeita nomes customizados de Parâmetros', () => {
    const ref = new Date('2026-11-25T12:00:00')
    const completo = clienteBase({
      id: 51,
      contatoComprasNome: 'Ana', contatoComprasTelefone: '31999990000', contatoComprasSetor: 'Compras',
      contatoFinanceiroNome: 'João', contatoFinanceiroTelefone: '31988880000', contatoFinanceiroSetor: 'Financeiro',
      emailBoleto: 'boletos@teste.com',
      enderecoRua: 'Rua A', enderecoNumero: '10', enderecoBairro: 'Centro', enderecoCidade: 'BH', enderecoEstado: 'MG', enderecoCep: '30000000',
      segmento: 'Indústria', instagram: '@empresa',
      produtosInteresse: ['Leite Pó'], produtosQuantidadesMensais: { 'Leite Pó': 100 },
    })
    const tarefas = montarTarefasIniciaisCliente(completo, {
      referencia: ref,
      nomesTarefas: { incluirProdutos: 'Mapear mix do cliente', completarCadastro: 'Fechar ficha cadastral' },
    })
    expect(tarefas).toHaveLength(1)
    expect(tarefas[0].titulo).toBe('Mapear mix do cliente')
  })
})
