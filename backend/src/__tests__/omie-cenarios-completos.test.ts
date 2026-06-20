/**
 * Testes completos de cenários Omie: Venda e Bonificação
 * Cobre: itens múltiplos, parcelas, frete, endereço diferente,
 *        clientes novos/existentes no Omie, intra/interestadual.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks Supabase ──────────────────────────────────────────────────────────

const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })

function singleChain(data: any) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({ eq: mockUpdateEq }),
  }
}

function arrayChain(data: any[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  }
}

function updateChain() {
  return {
    select: vi.fn(),
    update: vi.fn().mockReturnValue({ eq: mockUpdateEq }),
  }
}

const mockFrom = vi.fn()

vi.mock('../supabase.js', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}))

vi.mock('../config-store.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ omieAppKey: 'ENC:key', omieAppSecret: 'ENC:secret' }),
}))

vi.mock('../crypto.js', () => ({
  encrypt: (t: string) => `ENC:${t}`,
  decrypt: (t: string) => (t.startsWith('ENC:') ? t.slice(4) : t),
}))

vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const mockOmieCall = vi.fn()
const mockGetCreds = vi.fn()

vi.mock('../omie/client.js', () => ({
  omieCall: (...args: any[]) => mockOmieCall(...args),
  getOmieCredentials: () => mockGetCreds(),
}))

import { criarPedidoOmie } from '../omie/pedidos.js'

// ─── Helpers de dados ─────────────────────────────────────────────────────────

const CREDS = { appKey: 'key', appSecret: 'secret' }

function pedidoBase(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    status: 'confirmado',
    cliente_id: 10,
    vendedor_id: 5,
    tipo: 'venda',
    omie_codigo: null,
    forma_pagamento: 'À vista',
    tipo_frete: 'CIF',
    total_valor: 1000,
    endereco_diferente: false,
    observacoes: '',
    ...overrides,
  }
}

const CLIENTE_COM_OMIE = {
  id: 10,
  razao_social: 'CLIENTE TESTE LTDA',
  cnpj: '12345678000190',
  omie_codigo: '9999',
  contato_email: 'contato@teste.com',
  endereco_rua: 'Rua Teste',
  endereco_numero: '100',
  endereco_bairro: 'Centro',
  endereco_cidade: 'Belo Horizonte',
  endereco_estado: 'MG',
  endereco_cep: '30100000',
}

const CLIENTE_SEM_OMIE = {
  ...CLIENTE_COM_OMIE,
  omie_codigo: null,
}

const VENDEDOR_COM_OMIE = {
  id: 5,
  nome: 'Rafael',
  email: 'rafael@grupoparis.com',
  omie_codigo: '111',
}

function produtoComOmie(id = 1) {
  return {
    id,
    nome: `Produto ${id}`,
    omie_codigo: String(5000 + id),
    sku: `SKU-${id}`,
    unidade: 'KG',
    ncm: '04021090',
    cfop_interno: '5102',
    cfop_externo: '6102',
  }
}

function item(produtoId = 1, quantidade = 10, preco = 100) {
  return { produto_id: produtoId, quantidade, preco }
}

const CENARIOS_FISCAIS = {
  cadastros: [
    { nCodigo: 100, cDescricao: 'Venda Padrão', cPadrao: 'S' },
    { nCodigo: 200, cDescricao: 'Bonificação', cPadrao: 'N' },
  ],
}

const OMIE_PEDIDO_RESPONSE = {
  codigo_pedido: 7777,
  numero_pedido: '000000100001',
  codigo_status: '0',
  descricao_status: 'Pedido incluído com sucesso.',
}

/**
 * Configura os mocks para um cenário de sucesso.
 * Parâmetros permitem personalizar cada aspecto.
 */
function setupMocks({
  pedido = pedidoBase(),
  itens = [item()],
  estadoCliente = 'MG',
  estadoEmpresa = 'MG',
  cliente = CLIENTE_COM_OMIE,
  vendedor = VENDEDOR_COM_OMIE,
  produtos = [produtoComOmie(1)],
  omieResponse = OMIE_PEDIDO_RESPONSE,
  formaPagamento = 'À vista',
  parcelasOmie = [] as { codigo: string; descricao: string }[],
  clienteFoundInOmie = true,
}: {
  pedido?: any
  itens?: any[]
  estadoCliente?: string
  estadoEmpresa?: string
  cliente?: any
  vendedor?: any
  produtos?: any[]
  omieResponse?: any
  formaPagamento?: string
  parcelasOmie?: { codigo: string; descricao: string }[]
  clienteFoundInOmie?: boolean
} = {}) {
  mockGetCreds.mockResolvedValue(CREDS)

  // ── Sequência de calls Supabase ──────────────────────────────────────────
  let callCount = 0
  const extraCalls: Record<number, any> = {}

  // Construir sequência dinâmica baseada nos produtos
  // Call 1 = pedido, 2 = itens, 3 = clientes/estado, 4 = clientes (garantirClienteOmie),
  // 4 ou 5 = update clientes omie_codigo (se cliente sem Omie),
  // N = vendedores, N+1..N+P = produtos (por item), LAST = pedidos.update
  
  const calls: any[] = [
    singleChain(pedido),                            // 1: pedidos.select
    arrayChain(itens),                              // 2: itens_pedido.select
    singleChain({ endereco_estado: estadoCliente }), // 3: clientes/estado
    singleChain(cliente),                           // 4: clientes/* (garantirClienteOmie)
  ]

  if (!cliente.omie_codigo) {
    // 5: clientes.update (save omie_codigo after Omie create/find)
    calls.push(updateChain())
  }

  // Vendedores (dentro do Promise.all)
  calls.push(singleChain(vendedor))               // N: vendedores

  // Produtos (sequential, após Promise.all)
  for (const prod of produtos) {
    calls.push(singleChain(prod))                  // N+k: produtos.select
    if (!prod.omie_codigo) {
      calls.push(updateChain())                    // N+k+1: produtos.update (se novo)
    }
  }

  // Pedidos update final
  calls.push(updateChain())

  mockFrom.mockImplementation(() => {
    callCount++
    const idx = callCount - 1
    return calls[idx] || updateChain()
  })

  // ── omieCall por método ───────────────────────────────────────────────────
  mockOmieCall.mockImplementation((_endpoint: string, method: string, _params: any) => {
    switch (method) {
      case 'ListarEmpresas':
        return Promise.resolve({ empresasCadastro: [{ estado: estadoEmpresa }] })

      case 'ListarCenarios':
        return Promise.resolve(CENARIOS_FISCAIS)

      case 'ListarDepartamentos':
        return Promise.resolve({ departamentos: [] })

      case 'ListarCategoria':
        return Promise.resolve({ categoria_cadastro: [] })

      case 'ListarContasCorrentes':
        return Promise.resolve({ lista_contas_correntes: [] })

      case 'ListarLocaisEstoque':
        return Promise.resolve({ locaisEstoque: [] })

      case 'ListarVendedores':
        return Promise.resolve({ cadastro: [] })

      case 'ListarClientes':
        if (clienteFoundInOmie && cliente.omie_codigo) {
          return Promise.resolve({
            clientes_cadastro: [{ codigo_cliente_omie: parseInt(cliente.omie_codigo, 10) }],
          })
        }
        return Promise.resolve({ clientes_cadastro: [] })

      case 'UpsertClienteCpfCnpj':
        return Promise.resolve({ codigo_cliente_omie: 9999 })

      case 'ConsultarProduto': {
        const paramsObj = Array.isArray(_params) ? _params[0] : _params
        const codigoBuscado = paramsObj?.codigo_produto
        const prod = produtos.find(
          p => p.omie_codigo && parseInt(p.omie_codigo, 10) === codigoBuscado
        )
        if (prod) return Promise.resolve({ codigo_produto: parseInt(prod.omie_codigo, 10) })
        return Promise.reject(new Error('Produto não encontrado'))
      }

      case 'ListarProdutos': {
        const mappedProds = produtos.map(p => ({
          codigo_produto: parseInt(p.omie_codigo || '0', 10),
          descricao: p.nome,
          codigo: p.omie_codigo,
        }))
        return Promise.resolve({ produto_servico_cadastro: mappedProds })
      }

      case 'ListarParcelas':
        return Promise.resolve({
          cadastros: parcelasOmie.map(p => ({ cCodigo: p.codigo, cDescricao: p.descricao })),
        })

      case 'IncluirPedido':
        return Promise.resolve(omieResponse)

      default:
        return Promise.resolve({})
    }
  })
}

// ─── SUITE: Vendas ────────────────────────────────────────────────────────────

describe('criarPedidoOmie — Cenários de VENDA', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('✅ Venda 1: simples, à vista, CIF, intraestadual MG→MG', async () => {
    setupMocks({
      pedido: pedidoBase({ forma_pagamento: 'À vista', tipo_frete: 'CIF', total_valor: 1500 }),
      itens: [item(1, 15, 100)],
      estadoCliente: 'MG',
      estadoEmpresa: 'MG',
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)
    expect(result.numero_pedido).toBe('000000100001')

    // Verifica que IncluirPedido foi chamado
    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')
    expect(incluirCall).toBeDefined()

    const pedidoOmie = incluirCall![2][0]
    expect(pedidoOmie.cabecalho.codigo_cliente).toBe(9999) // omie_codigo do cliente
    expect(pedidoOmie.cabecalho.codigo_parcela).toBe('000') // à vista
    expect(pedidoOmie.cabecalho.codigo_cenario_impostos).toBe(100) // cenário Vendas
    expect(pedidoOmie.frete.modalidade).toBe('0') // CIF
    expect(pedidoOmie.det).toHaveLength(1)
    expect(pedidoOmie.det[0].produto.quantidade).toBe(15)
    expect(pedidoOmie.det[0].produto.valor_unitario).toBe(100)
  })

  it('✅ Venda 2: múltiplos itens (3 produtos diferentes)', async () => {
    setupMocks({
      pedido: pedidoBase({ total_valor: 5000 }),
      itens: [item(1, 10, 100), item(2, 5, 500), item(3, 20, 75)],
      produtos: [produtoComOmie(1), produtoComOmie(2), produtoComOmie(3)],
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]

    expect(pedidoOmie.det).toHaveLength(3)
    expect(pedidoOmie.det[0].produto.quantidade).toBe(10)
    expect(pedidoOmie.det[1].produto.quantidade).toBe(5)
    expect(pedidoOmie.det[2].produto.quantidade).toBe(20)
    expect(pedidoOmie.cabecalho.quantidade_itens).toBe(3)
  })

  it('✅ Venda 3: parcelada 30/60/90 dias — match por dias no Omie', async () => {
    setupMocks({
      pedido: pedidoBase({ forma_pagamento: '30/60/90 dias', total_valor: 3000 }),
      parcelasOmie: [
        { codigo: 'P30', descricao: '30 DD' },
        { codigo: 'P3X', descricao: '30/60/90 DD' },
      ],
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]

    // Deve usar o código da parcela 30/60/90
    expect(pedidoOmie.cabecalho.codigo_parcela).toBe('P3X')
  })

  it('✅ Venda 4: interestadual (cliente SP, empresa MG) — CFOP externo', async () => {
    setupMocks({
      pedido: pedidoBase({ total_valor: 2000 }),
      estadoCliente: 'SP',
      estadoEmpresa: 'MG',
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]
    // CFOP externo (interestadual) = 6102 (conforme produtoComOmie)
    expect(pedidoOmie.det[0].produto.cfop).toBe('6102')
  })

  it('✅ Venda 5: FOB (retirada) — modalidade frete = 1', async () => {
    setupMocks({
      pedido: pedidoBase({ tipo_frete: 'FOB', total_valor: 800 }),
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]
    expect(pedidoOmie.frete.modalidade).toBe('1') // FOB
  })

  it('✅ Venda 6: endereço de entrega diferente — campos entrega no infAdic', async () => {
    setupMocks({
      pedido: pedidoBase({
        total_valor: 1200,
        endereco_diferente: true,
        endereco_entrega_rua: 'Av. Entrega',
        endereco_entrega_numero: '500',
        endereco_entrega_bairro: 'Bairro Novo',
        endereco_entrega_cidade: 'São Paulo',
        endereco_entrega_estado: 'SP',
        endereco_entrega_cep: '01310100',
      }),
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]
    expect(pedidoOmie.informacoes_adicionais.endereco_entrega).toBe('Av. Entrega')
    expect(pedidoOmie.informacoes_adicionais.cidade_entrega).toBe('São Paulo')
    expect(pedidoOmie.informacoes_adicionais.estado_entrega).toBe('SP')
    expect(pedidoOmie.informacoes_adicionais.cep_entrega).toBe('01310100')
  })

  it('✅ Venda 7: cliente novo no Omie — cria via UpsertClienteCpfCnpj', async () => {
    setupMocks({
      pedido: pedidoBase({ total_valor: 500 }),
      cliente: CLIENTE_SEM_OMIE,
      clienteFoundInOmie: false,
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    // Deve ter chamado UpsertClienteCpfCnpj
    const upsertCall = mockOmieCall.mock.calls.find(c => c[1] === 'UpsertClienteCpfCnpj')
    expect(upsertCall).toBeDefined()
    expect(upsertCall![2][0].cnpj_cpf).toBe('12345678000190')
  })

  it('✅ Venda 8: parcela sem match — usa código 999 (personalizada)', async () => {
    setupMocks({
      pedido: pedidoBase({ forma_pagamento: '45 dias exclusivo', total_valor: 700 }),
      parcelasOmie: [{ codigo: 'P30', descricao: '30 DD' }],
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]
    expect(pedidoOmie.cabecalho.codigo_parcela).toBe('999')
  })
})

// ─── SUITE: Bonificação ───────────────────────────────────────────────────────

describe('criarPedidoOmie — Cenários de BONIFICAÇÃO (Amostra)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('✅ Bonif. 1: simples, 1 item, cenário Bonificação detectado pelo nome', async () => {
    setupMocks({
      pedido: pedidoBase({ tipo: 'bonificacao', forma_pagamento: 'À vista', total_valor: 0 }),
      itens: [item(1, 5, 0)],
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]

    // Cenário fiscal deve ser o de Bonificação (nCodigo: 200)
    expect(pedidoOmie.cabecalho.codigo_cenario_impostos).toBe(200)
    // código de integração deve conter 'AMT' (amostra)
    expect(pedidoOmie.cabecalho.codigo_pedido_integracao).toContain('AMT')
    expect(pedidoOmie.det[0].produto.valor_unitario).toBe(0)
  })

  it('✅ Bonif. 2: múltiplos itens, cenário Bonificação em todos os itens', async () => {
    setupMocks({
      pedido: pedidoBase({ tipo: 'bonificacao', total_valor: 0 }),
      itens: [item(1, 2, 0), item(2, 3, 0), item(3, 1, 0)],
      produtos: [produtoComOmie(1), produtoComOmie(2), produtoComOmie(3)],
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]

    expect(pedidoOmie.det).toHaveLength(3)
    // Todos os itens devem ter o cenário de Bonificação
    for (const detItem of pedidoOmie.det) {
      expect(detItem.ide.codigo_cenario_impostos_item).toBe(200)
    }
  })

  it('✅ Bonif. 3: cliente novo no Omie (sem omie_codigo) — cria e envia bonificação', async () => {
    setupMocks({
      pedido: pedidoBase({ tipo: 'bonificacao', total_valor: 0 }),
      cliente: CLIENTE_SEM_OMIE,
      clienteFoundInOmie: false,
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const upsertCall = mockOmieCall.mock.calls.find(c => c[1] === 'UpsertClienteCpfCnpj')
    expect(upsertCall).toBeDefined()

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]
    expect(pedidoOmie.cabecalho.codigo_cenario_impostos).toBe(200)
  })

  it('✅ Bonif. 4: interestadual (cliente RJ, empresa MG) — CFOP externo', async () => {
    setupMocks({
      pedido: pedidoBase({ tipo: 'bonificacao', total_valor: 0 }),
      estadoCliente: 'RJ',
      estadoEmpresa: 'MG',
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]
    expect(pedidoOmie.det[0].produto.cfop).toBe('6102') // CFOP externo
    expect(pedidoOmie.cabecalho.codigo_cenario_impostos).toBe(200) // ainda bonificação
  })

  it('✅ Bonif. 5: FOB, cliente já vinculado ao Omie (omie_codigo existente)', async () => {
    setupMocks({
      pedido: pedidoBase({ tipo: 'bonificacao', tipo_frete: 'FOB', total_valor: 0 }),
      cliente: CLIENTE_COM_OMIE,
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)

    // NÃO deve ter chamado UpsertClienteCpfCnpj (cliente já existe)
    const upsertCall = mockOmieCall.mock.calls.find(c => c[1] === 'UpsertClienteCpfCnpj')
    expect(upsertCall).toBeUndefined()

    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]
    expect(pedidoOmie.frete.modalidade).toBe('1') // FOB
    expect(pedidoOmie.cabecalho.codigo_cenario_impostos).toBe(200)
  })

  it('✅ Bonif. 6: cenário "Amostra" (não "Bonificação") também é detectado', async () => {
    // Omie tem "Amostra Grátis" em vez de "Bonificação"
    const cenarioAmostra = {
      cadastros: [
        { nCodigo: 100, cDescricao: 'Venda Padrão', cPadrao: 'S' },
        { nCodigo: 300, cDescricao: 'Amostra Grátis', cPadrao: 'N' },
      ],
    }

    setupMocks({
      pedido: pedidoBase({ tipo: 'bonificacao', total_valor: 0 }),
    })

    // Substituir resposta do ListarCenarios
    mockOmieCall.mockImplementation((_ep: string, method: string) => {
      if (method === 'ListarEmpresas') return Promise.resolve({ empresasCadastro: [{ estado: 'MG' }] })
      if (method === 'ListarCenarios') return Promise.resolve(cenarioAmostra)
      if (method === 'ListarDepartamentos') return Promise.resolve({ departamentos: [] })
      if (method === 'ListarCategoria') return Promise.resolve({ categoria_cadastro: [] })
      if (method === 'ListarContasCorrentes') return Promise.resolve({ lista_contas_correntes: [] })
      if (method === 'ListarLocaisEstoque') return Promise.resolve({ locaisEstoque: [] })
      if (method === 'ConsultarProduto') return Promise.resolve({ codigo_produto: 5001 })
      if (method === 'IncluirPedido') return Promise.resolve(OMIE_PEDIDO_RESPONSE)
      return Promise.resolve({})
    })

    const result = await criarPedidoOmie(1)

    expect(result.codigo_pedido).toBe(7777)
    const incluirCall = mockOmieCall.mock.calls.find(c => c[1] === 'IncluirPedido')!
    const pedidoOmie = incluirCall[2][0]
    expect(pedidoOmie.cabecalho.codigo_cenario_impostos).toBe(300) // detectou "Amostra Grátis"
  })
})

// ─── SUITE: Falhas ─────────────────────────────────────────────────────────────

describe('criarPedidoOmie — Cenários de Falha', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('❌ Pedido não confirmado → erro claro', async () => {
    mockGetCreds.mockResolvedValue(CREDS)
    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) return singleChain({ ...pedidoBase(), status: 'enviado' })
      return updateChain()
    })
    await expect(criarPedidoOmie(1)).rejects.toThrow('não está aprovado')
  })

  it('❌ Pedido já enviado ao Omie → erro duplicata', async () => {
    mockGetCreds.mockResolvedValue(CREDS)
    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) return singleChain({ ...pedidoBase(), omie_codigo: '7777' })
      return updateChain()
    })
    await expect(criarPedidoOmie(1)).rejects.toThrow('já foi enviado ao Omie')
  })

  it('❌ Pedido sem itens → erro', async () => {
    mockGetCreds.mockResolvedValue(CREDS)
    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) return singleChain(pedidoBase())
      if (call === 2) return arrayChain([]) // sem itens
      return updateChain()
    })
    await expect(criarPedidoOmie(1)).rejects.toThrow('não tem itens')
  })

  it('❌ Cliente sem CNPJ → erro antes de chamar Omie', async () => {
    mockGetCreds.mockResolvedValue(CREDS)
    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) return singleChain(pedidoBase())
      if (call === 2) return arrayChain([item()])
      if (call === 3) return singleChain({ endereco_estado: 'MG' })
      if (call === 4) return singleChain({ ...CLIENTE_COM_OMIE, omie_codigo: null, cnpj: null })
      return updateChain()
    })
    mockOmieCall.mockImplementation((_ep: string, method: string) => {
      if (method === 'ListarEmpresas') return Promise.resolve({ empresasCadastro: [{ estado: 'MG' }] })
      if (method === 'ListarClientes') return Promise.resolve({ clientes_cadastro: [] })
      return Promise.resolve({})
    })
    await expect(criarPedidoOmie(1)).rejects.toThrow('não tem CNPJ')
  })

  it('❌ Bonificação sem cenário fiscal configurado no Omie → erro descritivo', async () => {
    mockGetCreds.mockResolvedValue(CREDS)
    const cenariosSoVendas = { cadastros: [{ nCodigo: 100, cDescricao: 'Venda Padrão', cPadrao: 'S' }] }

    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) return singleChain(pedidoBase({ tipo: 'bonificacao' }))
      if (call === 2) return arrayChain([item()])
      if (call === 3) return singleChain({ endereco_estado: 'MG' })
      if (call === 4) return singleChain(CLIENTE_COM_OMIE)
      if (call === 5) return singleChain(VENDEDOR_COM_OMIE)
      return updateChain()
    })
    mockOmieCall.mockImplementation((_ep: string, method: string) => {
      if (method === 'ListarEmpresas') return Promise.resolve({ empresasCadastro: [{ estado: 'MG' }] })
      if (method === 'ListarCenarios') return Promise.resolve(cenariosSoVendas)
      if (method === 'ListarDepartamentos') return Promise.resolve({ departamentos: [] })
      if (method === 'ListarCategoria') return Promise.resolve({ categoria_cadastro: [] })
      if (method === 'ListarContasCorrentes') return Promise.resolve({ lista_contas_correntes: [] })
      if (method === 'ListarLocaisEstoque') return Promise.resolve({ locaisEstoque: [] })
      return Promise.resolve({})
    })
    await expect(criarPedidoOmie(1)).rejects.toThrow('Cenário fiscal')
  })
})
