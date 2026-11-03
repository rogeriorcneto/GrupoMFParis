import { describe, expect, it } from 'vitest'
import type { Cliente, Pedido } from '../types'
import { calcularIndicadoresComerciais, calcularIndicadoresOperacionais, criarIndiceEmpresas } from '../utils/indicadores-comerciais'

const cliente = (id: number, extra: Partial<Cliente> = {}): Cliente => ({ id, razaoSocial: 'Empresa Paris', cnpj: '', contatoNome: '', contatoTelefone: '', contatoEmail: '', etapa: 'proposta', ...extra })
const pedido = (id: number, extra: Partial<Pedido> = {}): Pedido => ({ id, numero: String(id), clienteId: 1, vendedorId: 1, itens: [], observacoes: '', status: 'confirmado', dataCriacao: '2026-03-15', totalValor: 100, ...extra })
const periodo = { inicio: '2026-03-01', fim: '2026-03-31' }

describe('indicadores comerciais somente leitura', () => {
  it('associa ciclo sem documento quando o nome tem uma única identidade documentada', () => {
    const indice = criarIndiceEmpresas([cliente(1, { cnpj: '12.345.678/0001-90' }), cliente(2, { razaoSocial: ' EMPRESA  PARIS ' })])
    expect(indice.get(1)).toBe(indice.get(2))
  })

  it('não une documentos diferentes nem associa nome ambíguo', () => {
    const indice = criarIndiceEmpresas([cliente(1, { cnpj: '111' }), cliente(2, { cnpj: '222' }), cliente(3)])
    expect(new Set(indice.values()).size).toBe(3)
  })

  it('mantém registros anônimos separados', () => {
    const indice = criarIndiceEmpresas([cliente(1, { razaoSocial: '' }), cliente(2, { razaoSocial: '' })])
    expect(indice.get(1)).not.toBe(indice.get(2))
  })

  it('conta pedidos e empresas separadamente e detecta primeira compra entre ciclos', () => {
    const resultado = calcularIndicadoresComerciais([cliente(1), cliente(2)], [pedido(1, { dataCriacao: '2026-02-10' }), pedido(2), pedido(3, { clienteId: 2 })], periodo)
    expect(resultado.vendasConfirmadas).toBe(200)
    expect(resultado.pedidosFechados).toBe(2)
    expect(resultado.clientesAtivos).toBe(1)
    expect(resultado.novosClientes).toBe(0)
    expect(resultado.ticketMedioPedido).toBe(100)
    expect(resultado.atingimentoMeta).toBeNull()
  })

  it('exclui rascunhos, pendentes, cancelados e bonificações', () => {
    const pedidos = [pedido(1), pedido(2, { status: 'rascunho' }), pedido(3, { status: 'enviado' }), pedido(4, { status: 'cancelado' }), pedido(5, { status: 'cancelamento_solicitado' }), pedido(6, { tipo: 'bonificacao' })]
    expect(calcularIndicadoresComerciais([cliente(1)], pedidos, periodo).pedidosFechados).toBe(1)
  })

  it('usa aprovação quando disponível e inclui ambos os limites do período', () => {
    const pedidos = [pedido(1, { dataCriacao: '2026-02-01', dataAprovacao: '2026-03-01T03:00:00Z' }), pedido(2, { dataCriacao: '2026-03-31' }), pedido(3, { dataAprovacao: '2026-04-01' })]
    expect(calcularIndicadoresComerciais([cliente(1)], pedidos, periodo, { meta: 100 }).atingimentoMeta).toBe(200)
  })

  it('filtra vendedor sem perder o histórico de primeira compra da empresa', () => {
    const pedidos = [pedido(1, { vendedorId: 2, dataCriacao: '2026-02-01' }), pedido(2)]
    const resultado = calcularIndicadoresComerciais([cliente(1)], pedidos, periodo, { vendedorId: 1 })
    expect(resultado.pedidosFechados).toBe(1)
    expect(resultado.novosClientes).toBe(0)
  })

  it('não altera entradas e retorna valores seguros sem vendas', () => {
    const clientes = [cliente(1)]
    const pedidos = [pedido(1, { dataCriacao: 'invalida' })]
    const antes = JSON.stringify({ clientes, pedidos })
    const resultado = calcularIndicadoresComerciais(clientes, pedidos, periodo)
    expect(resultado.ticketMedioPedido).toBeNull()
    expect(JSON.stringify({ clientes, pedidos })).toBe(antes)
  })

  it('considera o calendário de São Paulo nos limites UTC', () => {
    const pedidos = [pedido(1, { dataAprovacao: '2026-03-01T02:59:59Z' }), pedido(2, { dataAprovacao: '2026-04-01T02:59:59Z' })]
    expect(calcularIndicadoresComerciais([cliente(1)], pedidos, periodo).pedidosFechados).toBe(1)
  })

  it('não aceita valores não finitos ou negativos', () => {
    const pedidos = [pedido(1, { totalValor: NaN }), pedido(2, { totalValor: Infinity }), pedido(3, { totalValor: -100 })]
    expect(calcularIndicadoresComerciais([cliente(1)], pedidos, periodo).vendasConfirmadas).toBe(0)
  })

  it('rejeita períodos inválidos ou invertidos', () => {
    expect(() => calcularIndicadoresComerciais([], [], { inicio: '2026-02-30', fim: '2026-03-31' })).toThrow()
    expect(() => calcularIndicadoresComerciais([], [], { inicio: '2026-04-01', fim: '2026-03-31' })).toThrow()
  })
})

describe('indicadores operacionais (PDFs gerente/vendedor)', () => {
  it('classifica clientes sem compra em janelas 30/60/90 dias', () => {
    const hoje = '2026-03-31'
    const clientes = [cliente(1, { razaoSocial: 'A' }), cliente(2, { razaoSocial: 'B' }), cliente(3, { razaoSocial: 'C' }), cliente(4, { razaoSocial: 'D' })]
    const pedidos = [
      pedido(1, { clienteId: 1, dataCriacao: '2026-03-10' }),        // 21 dias
      pedido(2, { clienteId: 2, dataCriacao: '2026-02-15' }),        // 44 dias
      pedido(3, { clienteId: 3, dataCriacao: '2026-01-20' }),        // 70 dias
      pedido(4, { clienteId: 4, dataCriacao: '2025-12-01' }),        // 120 dias
    ]
    const r = calcularIndicadoresOperacionais(clientes, pedidos, periodo, hoje)
    expect(r.semCompra).toEqual({ d30: 1, d60: 1, d90: 1, nunca: 0 })
  })

  it('pipeline aberto e ponderado por etapa; arquivados fora', () => {
    const clientes = [
      cliente(1, { etapa: 'proposta', valorProposta: 1000 }),
      cliente(2, { etapa: 'negociacao', valorProposta: 2000 }),
      cliente(3, { etapa: 'proposta', valorProposta: 9000, arquivadoDuplicata: true }),
    ]
    const r = calcularIndicadoresOperacionais(clientes, [], periodo, '2026-03-31')
    expect(r.pipelineAberto).toBe(3000)
    expect(r.pipelinePonderado).toBe(1000 * 0.8 + 2000 * 0.95)
    expect(r.semCompra.nunca).toBe(1) // mesma empresa (mesmo nome, sem doc) que nunca comprou
    expect(r.negociacoesAbertas).toBe(1)
  })

  it('mix por produto com quantidade, receita e participação', () => {
    const itens = [
      { produtoId: 1, nomeProduto: 'Açaí 10L', unidade: 'cx', preco: 50, quantidade: 4 },
      { produtoId: 2, nomeProduto: 'Picolé', unidade: 'cx', preco: 25, quantidade: 8 },
    ]
    const pedidos = [pedido(1, { itens })]
    const r = calcularIndicadoresOperacionais([cliente(1)], pedidos, periodo, '2026-03-31')
    const acai = r.porProduto.get('Açaí 10L')!
    expect(acai.quantidade).toBe(4)
    expect(acai.receita).toBe(200)
    expect(acai.participacao).toBe(50)
    expect(r.mixMedioItensPedido).toBe(2)
  })

  it('quebra por vendedor e por estado no período', () => {
    const clientes = [cliente(1, { razaoSocial: 'Alpha', enderecoEstado: 'MG' }), cliente(2, { razaoSocial: 'Beta', cnpj: '99', enderecoEstado: 'SP' })]
    const pedidos = [
      pedido(1, { clienteId: 1, vendedorId: 6 }),
      pedido(2, { clienteId: 2, vendedorId: 6 }),
      pedido(3, { clienteId: 2, vendedorId: 2, dataCriacao: '2026-04-05' }), // fora do período
    ]
    const r = calcularIndicadoresOperacionais(clientes, pedidos, periodo, '2026-03-31')
    expect(r.porVendedor.get(6)).toEqual({ receita: 200, pedidos: 2, clientes: 2 })
    expect(r.porEstado.get('MG')).toEqual({ receita: 100, pedidos: 1 })
    expect(r.porEstado.get('SP')).toEqual({ receita: 100, pedidos: 1 })
    expect(r.frequenciaMediaCompra).toBe(1)
  })

  it('cotações enviadas conta cards com dataProposta no período', () => {
    const clientes = [
      cliente(1, { dataProposta: '2026-03-10' }),
      cliente(2, { dataProposta: '2026-04-01' }),
      cliente(3, { dataProposta: '2026-03-20', arquivadoDuplicata: true }),
    ]
    const r = calcularIndicadoresOperacionais(clientes, [], periodo, '2026-03-31')
    expect(r.cotacoesEnviadas).toBe(1)
  })
})
