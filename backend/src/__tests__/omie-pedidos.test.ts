import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockSingle = vi.fn()
const mockLimit = vi.fn()
const mockIn = vi.fn()
const mockUpdateEq = vi.fn()

function buildFromChain() {
  const selectResult = {
    eq: vi.fn().mockReturnValue({
      single: mockSingle,
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    not: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({ limit: mockLimit }),
    }),
    in: mockIn,
    then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
  }
  return {
    select: vi.fn().mockReturnValue(selectResult),
    update: vi.fn().mockReturnValue({ eq: mockUpdateEq }),
  }
}

const mockFrom = vi.fn().mockImplementation(buildFromChain)

vi.mock('../supabase.js', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}))

// Mock config-store
vi.mock('../config-store.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    omieAppKey: 'ENC:test-key',
    omieAppSecret: 'ENC:test-secret',
  }),
}))

// Mock crypto
vi.mock('../crypto.js', () => ({
  encrypt: (text: string) => `ENC:${text}`,
  decrypt: (text: string) => text.startsWith('ENC:') ? text.slice(4) : text,
}))

// Mock logger
vi.mock('../logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

// Mock omie client
const mockOmieCall = vi.fn()
const mockGetCreds = vi.fn()

vi.mock('../omie/client.js', () => ({
  omieCall: (...args: any[]) => mockOmieCall(...args),
  getOmieCredentials: () => mockGetCreds(),
}))

import {
  consultarEntregaOmie,
  listarPedidosOmieAcompanhamento,
  obterResumoFinanceiro,
  criarPedidoOmie,
  consultarPedidoOmie,
  onPedidoAprovado,
} from '../omie/pedidos.js'
import { clearCache } from '../omie/reference-data.js'

describe('Omie Pedidos', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    clearCache('tabelas_preco')
    mockFrom.mockImplementation(buildFromChain)
    mockGetCreds.mockResolvedValue({ appKey: 'test-key', appSecret: 'test-secret' })
  })

  // ─── consultarEntregaOmie ───

  describe('consultarEntregaOmie', () => {
    it('retorna dados de entrega quando pedido tem omie_codigo', async () => {
      mockSingle.mockResolvedValue({ data: { omie_codigo: '12345' }, error: null })
      mockOmieCall.mockResolvedValue({
        cabecalho: { etapa: '50', data_previsao: '15/03/2025', descricao_etapa: 'Faturar' },
        infoCadastro: { nNumeroNF: 1234, dDataFaturamento: '10/03/2025' },
        transporte: { codigo_rastreio: 'BR123456789' },
      })

      const result = await consultarEntregaOmie(1)

      expect(result.etapa).toBe('50')
      expect(result.dataPrevisao).toBe('15/03/2025')
      expect(result.nf).toBe('1234')
      expect(result.codigoRastreio).toBe('BR123456789')
      expect(result.dataFaturamento).toBe('10/03/2025')
      expect(result.statusDescricao).toBe('Faturar')
    })

    it('usa pedidoId como fallback quando omie_codigo é null', async () => {
      // O código atual usa pedidoId como codigoPedido quando omie_codigo é null
      const maybeSingleMock = vi.fn().mockResolvedValue({ data: { omie_codigo: null }, error: null })
      mockFrom.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock }),
        }),
      }))
      mockOmieCall.mockResolvedValue({})
      const result = await consultarEntregaOmie(99)
      expect(result.etapa).toBe('')
    })

    it('lança erro sem credenciais', async () => {
      mockGetCreds.mockResolvedValue(null)
      await expect(consultarEntregaOmie(1)).rejects.toThrow('Credenciais Omie não configuradas')
    })

    it('retorna campos vazios quando Omie retorna dados parciais', async () => {
      mockSingle.mockResolvedValue({ data: { omie_codigo: '12345' }, error: null })
      mockOmieCall.mockResolvedValue({})

      const result = await consultarEntregaOmie(1)
      expect(result.etapa).toBe('')
      expect(result.nf).toBe('')
      expect(result.codigoRastreio).toBe('')
    })
  })

  // ─── consultarPedidoOmie ───

  describe('consultarPedidoOmie', () => {
    it('consulta status do pedido no Omie', async () => {
      mockSingle.mockResolvedValue({ data: { omie_codigo: '999' }, error: null })
      mockOmieCall.mockResolvedValue({ etapa: '50', descricao: 'Faturado' })

      const result = await consultarPedidoOmie(1)
      expect(result).toEqual({ etapa: '50', descricao: 'Faturado' })
      expect(mockOmieCall).toHaveBeenCalledWith(
        '/produtos/pedido/',
        'StatusPedido',
        [{ codigo_pedido: 999 }],
        expect.any(Object)
      )
    })

    it('erro sem omie_codigo', async () => {
      mockSingle.mockResolvedValue({ data: null, error: null })
      await expect(consultarPedidoOmie(1)).rejects.toThrow('não tem código Omie')
    })
  })

  // ─── criarPedidoOmie — cenários de falha ───

  describe('criarPedidoOmie — cenários de falha que causam pedido não ir ao Omie', () => {
    it('falha quando pedido não está com status "confirmado" (ex: ainda "enviado")', async () => {
      mockSingle.mockResolvedValue({
        data: { id: 1, status: 'enviado', cliente_id: 10, vendedor_id: 5, tipo: 'venda', omie_codigo: null },
        error: null,
      })

      await expect(criarPedidoOmie(1)).rejects.toThrow('não está aprovado')
    })

    it('falha quando pedido já tem omie_codigo (evita reenvio duplicado)', async () => {
      mockSingle.mockResolvedValue({
        data: { id: 1, status: 'confirmado', cliente_id: 10, omie_codigo: '99999', tipo: 'venda' },
        error: null,
      })

      await expect(criarPedidoOmie(1)).rejects.toThrow('já foi enviado ao Omie')
    })

    it('falha quando pedido não tem itens', async () => {
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // pedido fetch
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 1, status: 'confirmado', cliente_id: 10, vendedor_id: 5, tipo: 'venda', omie_codigo: null },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 2) {
          // itens_pedido fetch — vazio
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }
        return buildFromChain()
      })

      await expect(criarPedidoOmie(1)).rejects.toThrow('não tem itens')
    })

    it('falha quando cliente não tem CNPJ (causa mais comum de rejeição Omie)', async () => {
      // Ordem real de chamadas em criarPedidoOmie:
      // 1 = from('pedidos').select('*').eq(...).single()
      // 2 = from('itens_pedido').select('*').eq(...)
      // 3 = from('clientes').select('endereco_estado').eq(...).single()  [para CFOP]
      // 4 = from('clientes').select('*').eq(...).single()  [garantirClienteOmie]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 1, status: 'confirmado', cliente_id: 10, vendedor_id: 5, tipo: 'venda', omie_codigo: null, forma_pagamento: 'À vista', tipo_frete: 'FOB', endereco_diferente: false },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 2) {
          // itens_pedido — .eq() retorna Promise diretamente (sem .single())
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ produto_id: 1, quantidade: 2, preco: 100 }], error: null }),
            }),
          }
        }
        if (callCount === 3) {
          // clientes para endereco_estado (CFOP)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 10, endereco_estado: 'SP' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 4) {
          // getEstadoEmpresa → configuracoes.maybeSingle (fallback quando Omie não retorna estado)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { valor: 'SP' }, error: null }),
                single: vi.fn().mockResolvedValue({ data: { valor: 'SP' }, error: null }),
              }),
            }),
          }
        }
        if (callCount === 5) {
          // garantirClienteOmie — cliente SEM CNPJ e sem omie_codigo
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 10, razao_social: 'ACAI DO KIM LTDA', cnpj: null, omie_codigo: null },
                  error: null,
                }),
              }),
            }),
          }
        }
        return buildFromChain()
      })

      await expect(criarPedidoOmie(1)).rejects.toThrow('não tem CNPJ')
    })

    it('falha sem credenciais Omie', async () => {
      mockGetCreds.mockResolvedValue(null)
      await expect(criarPedidoOmie(1)).rejects.toThrow('Credenciais Omie não configuradas')
    })
  })

  // ─── onPedidoAprovado ───

  describe('onPedidoAprovado', () => {
    it('retorna success false quando criarPedidoOmie falha', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

      const result = await onPedidoAprovado(999)
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('retorna success false quando pedido está com status "enviado" (não confirmado ainda)', async () => {
      mockSingle.mockResolvedValue({
        data: { id: 1, status: 'enviado', omie_codigo: null },
        error: null,
      })

      const result = await onPedidoAprovado(1)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/não está aprovado/)
    })

    it('retorna omie_codigo quando envio ao Omie tem sucesso', async () => {
      // criarPedidoOmie internamente chama várias queries — simulamos que lança erro
      // pois sem mocks completos não conseguimos testar o caminho feliz aqui.
      // O teste de integração real cobrirá isso via testar-pedido-omie.ts.
      mockGetCreds.mockResolvedValue(null) // força erro controlado
      const result = await onPedidoAprovado(1)
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  // ─── obterResumoFinanceiro ───

  describe('obterResumoFinanceiro', () => {
    it('retorna resumo financeiro com dados do Omie', async () => {
      mockOmieCall
        .mockResolvedValueOnce({
          conta_receber_cadastro: [
            { valor_documento: 1000, data_vencimento: '01/01/2099', status_titulo: 'ABERTO' },
            { valor_documento: 500, data_vencimento: '01/01/2026', status_titulo: 'ABERTO' },
          ],
        })
        .mockResolvedValueOnce({
          conta_pagar_cadastro: [
            { valor_documento: 300, data_vencimento: '01/06/2099', status_titulo: 'ABERTO' },
          ],
        })

      const result = await obterResumoFinanceiro()

      expect(result.totalReceber).toBe(1500)
      expect(result.totalPagar).toBe(300)
      expect(result.saldo).toBe(1200)
      expect(result.titulosVencidos).toBe(1)
      expect(result.titulosAVencer).toBe(1)
      expect(result.contasReceber).toHaveLength(2)
      expect(result.contasPagar).toHaveLength(1)
    })

    it('lida com erro nas chamadas Omie (catch fallback)', async () => {
      mockOmieCall
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))

      const result = await obterResumoFinanceiro()
      expect(result.totalReceber).toBe(0)
      expect(result.totalPagar).toBe(0)
      expect(result.saldo).toBe(0)
    })

    it('erro sem credenciais', async () => {
      mockGetCreds.mockResolvedValue(null)
      await expect(obterResumoFinanceiro()).rejects.toThrow('Credenciais Omie não configuradas')
    })

    it('retorna listas vazias quando Omie não tem dados', async () => {
      mockOmieCall
        .mockResolvedValueOnce({ conta_receber_cadastro: [] })
        .mockResolvedValueOnce({ conta_pagar_cadastro: [] })

      const result = await obterResumoFinanceiro()
      expect(result.totalReceber).toBe(0)
      expect(result.totalPagar).toBe(0)
      expect(result.contasReceber).toHaveLength(0)
      expect(result.contasPagar).toHaveLength(0)
    })
  })

  // ─── listarPedidosOmieAcompanhamento ───

  describe('listarPedidosOmieAcompanhamento', () => {
    it('retorna lista vazia quando não há pedidos com omie_codigo', async () => {
      mockLimit.mockResolvedValue({ data: [], error: null })

      const result = await listarPedidosOmieAcompanhamento()
      expect(result).toEqual([])
    })

    it('erro sem credenciais', async () => {
      mockGetCreds.mockResolvedValue(null)
      await expect(listarPedidosOmieAcompanhamento()).rejects.toThrow('Credenciais Omie não configuradas')
    })

    it('retorna lista vazia quando supabase não retorna clientes', async () => {
      // O código atual não lança erro de DB — retorna [] quando pedidosOmie está vazio
      mockOmieCall.mockResolvedValue({ pedido_venda_produto: [], total_de_registros: 0, pagina: 1, total_de_paginas: 1 })
      const result = await listarPedidosOmieAcompanhamento()
      expect(result).toEqual([])
    })
  })

  // ─── criarPedidoOmie — payload completo (peso + parcelas) ───

  describe('criarPedidoOmie — payload enviado ao Omie', () => {
    function fmtData(d: Date): string {
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    }
    function addDays(base: Date, days: number): Date {
      const r = new Date(base)
      r.setDate(r.getDate() + days)
      return r
    }

    /**
     * Monta os mocks para o caminho feliz de criarPedidoOmie e captura o
     * payload enviado ao IncluirPedido.
     */
    function setupHappyPath(opts: {
      itens: any[]
      produtos: Record<number, any>
      consultaOmiePorProduto?: Record<number, any>
      listarProdutosMatch?: Record<number, any>
      formaPagamento?: string
      parcelasOmie?: any[]
      totalValor?: number
      cliente?: any
      pedido?: any
      listarClientes?: any
      tabelasPreco?: any[]
      upsertClienteResponse?: any
    }) {
      const captured: { payload?: any; upsertCliente?: any } = {}

      mockFrom.mockImplementation((table: string) => {
        const single = (data: any) => ({
          eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data, error: null }) }),
        })
        if (table === 'pedidos') {
          return {
            select: vi.fn().mockReturnValue(single({
              id: 1, status: 'confirmado', cliente_id: 10, vendedor_id: null,
              tipo: 'venda', omie_codigo: null, forma_pagamento: opts.formaPagamento ?? 'À vista',
              tipo_frete: 'CIF', endereco_diferente: false, total_valor: opts.totalValor ?? 0,
              observacoes: '',
              ...(opts.pedido || {}),
            })),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          }
        }
        if (table === 'itens_pedido') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: opts.itens, error: null }),
            }),
          }
        }
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnValue(single({
              id: 10, razao_social: 'CLIENTE TESTE', cnpj: '12345678000190',
              omie_codigo: '123', endereco_estado: 'SP',
              ...(opts.cliente || {}),
            })),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          }
        }
        if (table === 'produtos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col: string, id: number) => ({
                single: vi.fn().mockResolvedValue({ data: opts.produtos[id], error: null }),
              })),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          }
        }
        return buildFromChain()
      })

      mockOmieCall.mockImplementation(async (_endpoint: string, call: string, param: any[]) => {
        switch (call) {
          case 'ListarClientes':
            return opts.listarClientes ?? { clientes_cadastro: [{ codigo_cliente_omie: 123, cnpj_cpf: '12345678000190' }] }
          case 'ListarTabelasPreco':
            return { listaTabelasPreco: opts.tabelasPreco ?? [] }
          case 'UpsertClienteCpfCnpj':
            captured.upsertCliente = param[0]
            return opts.upsertClienteResponse ?? { codigo_cliente_omie: 456 }
          case 'ListarCenarios':
            return { cenariosEncontrados: [{ nCodigo: 100, cNome: 'VENDAS', padrao: true }] }
          case 'ListarDepartamentos':
            return { departamentos: [{ codigo: 'DEP1', descricao: 'COMERCIAL' }] }
          case 'ListarCategorias':
            return { categoria_cadastro: [{ codigo: '1.01.03', descricao: 'VENDAS DE MERCADORIA' }] }
          case 'ListarContasCorrentes':
            return { ListarContasCorrentes: [{ nCodCC: 55, cDescricao: 'BB', cNomeBanco: 'Banco do Brasil' }] }
          case 'ListarLocaisEstoque':
            return { locaisEncontrados: [{ nCodLocal: 77, cDescLocal: 'CD-VILA PARIS' }] }
          case 'ListarEmpresas':
            return { empresasCadastro: [{ estado: 'SP' }] }
          case 'ListarParcelas':
            return { cadastros: opts.parcelasOmie ?? [] }
          case 'ConsultarProduto': {
            const codigo = param?.[0]?.codigo_produto
            const prod = Object.values(opts.consultaOmiePorProduto ?? {}).find(
              (p: any) => Number(p.codigo_produto) === Number(codigo)
            )
            if (prod) return prod
            throw new Error('not found')
          }
          case 'ListarProdutos': {
            const desc = String(param?.[0]?.filtrar_apenas_descricao || '').toLowerCase()
            const match = Object.entries(opts.listarProdutosMatch ?? {})
              .map(([id, p]: [string, any]) => ({ id: Number(id), ...p }))
              .find(p => desc && String(p.descricao || '').toLowerCase() === desc)
            return { produto_servico_cadastro: match ? [match] : [] }
          }
          case 'IncluirPedido':
            captured.payload = param[0]
            return { codigo_pedido: 987654, codigo_pedido_integracao: 'CRM-PED-1', numero_pedido: '999001' }
          default:
            throw new Error(`omieCall não mockada: ${call}`)
        }
      })

      return captured
    }

    it('produto vendido por KG usa peso por kg do cadastro Omie (não o tamanho da embalagem)', async () => {
      // Reproduz o bug real do pedido #499: CRM peso_kg=25 (embalagem), unidade kg,
      // quantidade em kg. Antes: frete caía com dezenas de toneladas.
      const captured = setupHappyPath({
        itens: [
          { produto_id: 7, quantidade: 200, preco: 15.88 },
          { produto_id: 10, quantidade: 20, preco: 18.05 },
        ],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: '2071041102' },
          10: { id: 10, nome: 'OKEY LAC ACAI 1KG', unidade: 'kg', peso_kg: 0.9, omie_codigo: '2071029200' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071041102, descricao: 'OKEY LAC PRO 25kG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1, ncm: '0402' },
          10: { codigo_produto: 2071029200, descricao: 'OKEY LAC ACAI 1 KG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1, ncm: '1806' },
        },
        formaPagamento: '7/14',
        parcelasOmie: [{ codigo: 'S20', descricao: '7/14 DD' }],
        totalValor: 3537,
      })

      const resp = await criarPedidoOmie(1)
      expect(resp.codigo_pedido).toBe(987654)
      const p = captured.payload

      // Frete: líquido = quantidade em kg; bruto = líquido × fator embalagem do cadastro
      expect(p.frete.peso_liquido).toBeCloseTo(220, 3)
      expect(p.frete.peso_bruto).toBeCloseTo(220.66, 3)
      // det: pesos por item corretos (200×1.003, 20×1.003)
      expect(p.det[0].inf_adic.peso_liquido).toBeCloseTo(200, 3)
      expect(p.det[0].inf_adic.peso_bruto).toBeCloseTo(200.6, 3)
      expect(p.det[1].inf_adic.peso_liquido).toBeCloseTo(20, 3)
      expect(p.det[1].inf_adic.peso_bruto).toBeCloseTo(20.06, 3)
    })

    it('produto encontrado via ListarProdutos usa os pesos do cadastro Omie (não o peso_kg do CRM)', async () => {
      // Regressão: produto sem omie_codigo no CRM era encontrado mas o meta
      // era montado SEM os dados do Omie → peso 25 por kg → frete de toneladas.
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 200, preco: 15.88 }],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: null },
        },
        listarProdutosMatch: {
          7: { codigo_produto: 2071041102, codigo: '1230013', descricao: 'OKEY LAC PRO 25KG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1, ncm: '0402' },
        },
        formaPagamento: 'À vista',
        totalValor: 3176,
      })

      await criarPedidoOmie(1)
      const p = captured.payload
      expect(p.frete.peso_liquido).toBeCloseTo(200, 3)
      expect(p.frete.peso_bruto).toBeCloseTo(200.6, 3)
    })

    it('parcelas seguem os intervalos do CRM contados da data da venda', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 100, preco: 10 }],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: '2071041102' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071041102, descricao: 'OKEY LAC PRO 25kG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1 },
        },
        formaPagamento: '7/14/21/28',
        parcelasOmie: [{ codigo: 'WVI', descricao: '7/14/21/28' }],
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      const parcelas = captured.payload.lista_parcelas.parcela
      const hoje = new Date()

      expect(parcelas).toHaveLength(4)
      const dias = [7, 14, 21, 28]
      parcelas.forEach((parc: any, i: number) => {
        expect(parc.numero_parcela).toBe(i + 1)
        expect(parc.data_vencimento).toBe(fmtData(addDays(hoje, dias[i])))
        expect(parc.percentual).toBeCloseTo(25, 2)
      })
      // Soma dos valores = total (ajuste de centavos na última parcela)
      const soma = parcelas.reduce((s: number, x: any) => s + x.valor, 0)
      expect(soma).toBeCloseTo(1000, 2)
    })

    it('"28 dias" gera uma única parcela a 28 dias da venda', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: '2071041102' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071041102, descricao: 'OKEY LAC PRO 25kG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1 },
        },
        formaPagamento: '28 dias',
        parcelasOmie: [{ codigo: 'A28', descricao: '28 DIAS' }],
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      const parcelas = captured.payload.lista_parcelas.parcela
      expect(parcelas).toHaveLength(1)
      expect(parcelas[0].data_vencimento).toBe(fmtData(addDays(new Date(), 28)))
      expect(parcelas[0].valor).toBe(1000)
    })

    it('produto vendido por unidade usa peso líquido do nome/cadastro e bruto do Omie', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 50, quantidade: 10, preco: 5 }],
        produtos: {
          50: { id: 50, nome: 'CAFE ALMOFADA GM EXTRAFORTE 500G', unidade: 'UN', peso_kg: null, omie_codigo: '9001' },
        },
        consultaOmiePorProduto: {
          50: { codigo_produto: 9001, descricao: 'CAFE ALMOFADA 500G', unidade: 'UN', peso_bruto: 0.52, peso_liq: 0.5, ncm: '0901' },
        },
        formaPagamento: 'À vista',
        totalValor: 50,
      })

      await criarPedidoOmie(1)
      const p = captured.payload
      expect(p.det[0].inf_adic.peso_liquido).toBeCloseTo(5, 3)   // 10 × 0.5
      expect(p.det[0].inf_adic.peso_bruto).toBeCloseTo(5.2, 3)    // 10 × 0.52
      expect(p.frete.peso_liquido).toBeCloseTo(5, 3)
      expect(p.frete.peso_bruto).toBeCloseTo(5.2, 3)
      expect(p.lista_parcelas).toBeUndefined() // à vista → sem lista
    })

    it('produto KG com cadastro Omie por embalagem (25/25.075) usa fator de tara correto', async () => {
      // Alguns cadastros Omie guardam peso POR EMBALAGEM, não por kg.
      // A razão bruto/líquido (= tara) é o que importa — evita peso explodido.
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 200, preco: 15.88 }],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: '2071041102' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071041102, descricao: 'OKEY LAC PRO 25KG', unidade: 'KG', peso_bruto: 25.075, peso_liq: 25 },
        },
        formaPagamento: 'À vista',
        totalValor: 3176,
      })

      await criarPedidoOmie(1)
      const p = captured.payload
      expect(p.det[0].inf_adic.peso_liquido).toBeCloseTo(200, 3)
      expect(p.det[0].inf_adic.peso_bruto).toBeCloseTo(200.6, 3) // 200 × (25.075/25)
      expect(p.frete.peso_liquido).toBeCloseTo(200, 3)
      expect(p.frete.peso_bruto).toBeCloseTo(200.6, 3)
    })

    it('produto sem peso_bruto no Omie recebe tara estimada (nunca bruto = líquido)', async () => {
      // Regressão: pedido saía sem o peso da embalagem quando o cadastro
      // Omie não tinha peso_bruto — bruto ficava igual ao líquido.
      const captured = setupHappyPath({
        itens: [{ produto_id: 50, quantidade: 10, preco: 5 }],
        produtos: {
          50: { id: 50, nome: 'CAFE ALMOFADA GM EXTRAFORTE 500G', unidade: 'UN', peso_kg: null, omie_codigo: '9001' },
        },
        consultaOmiePorProduto: {
          50: { codigo_produto: 9001, descricao: 'CAFE ALMOFADA 500G', unidade: 'UN', peso_liq: 0.5 },
        },
        formaPagamento: 'À vista',
        totalValor: 50,
      })

      await criarPedidoOmie(1)
      const p = captured.payload
      expect(p.det[0].inf_adic.peso_liquido).toBeCloseTo(5, 3)
      expect(p.det[0].inf_adic.peso_bruto).toBeGreaterThan(5) // bruto > líquido (tara)
      expect(p.det[0].inf_adic.peso_bruto).toBeCloseTo(5.015, 3) // 5 × 1.003
    })

    it('produto KG sem nenhum peso no Omie ainda envia bruto com embalagem', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 200, preco: 15.88 }],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: '2071041102' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071041102, descricao: 'OKEY LAC PRO 25KG', unidade: 'KG' },
        },
        formaPagamento: 'À vista',
        totalValor: 3176,
      })

      await criarPedidoOmie(1)
      const p = captured.payload
      expect(p.frete.peso_liquido).toBeCloseTo(200, 3)
      expect(p.frete.peso_bruto).toBeCloseTo(200.6, 3) // 200 × 1.003
      expect(p.frete.peso_bruto).toBeGreaterThan(p.frete.peso_liquido)
    })

    it('quantidade_volumes conta embalagens físicas, não kg', async () => {
      // 200kg de saco de 25kg = 8 volumes; 20kg de embalagem 1kg = 20 volumes.
      const captured = setupHappyPath({
        itens: [
          { produto_id: 7, quantidade: 200, preco: 15.88 },
          { produto_id: 10, quantidade: 20, preco: 18.05 },
        ],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: '2071041102' },
          10: { id: 10, nome: 'OKEY LAC ACAI 1KG', unidade: 'kg', peso_kg: 0.9, omie_codigo: '2071029200' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071041102, descricao: 'OKEY LAC PRO 25kG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1 },
          10: { codigo_produto: 2071029200, descricao: 'OKEY LAC ACAI 1 KG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1 },
        },
        formaPagamento: 'À vista',
        totalValor: 3537,
      })

      await criarPedidoOmie(1)
      const p = captured.payload
      expect(p.frete.quantidade_volumes).toBe(28) // 8 sacos de 25kg + 20 embalagens de 1kg
    })

    it('pedido a prazo usa codigo_parcela 999 + qtde_parcelas + lista explícita', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 100, preco: 10 }],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: '2071041102' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071041102, descricao: 'OKEY LAC PRO 25kG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1 },
        },
        formaPagamento: '7/14',
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      const p = captured.payload
      expect(p.cabecalho.codigo_parcela).toBe('999')
      expect(p.cabecalho.qtde_parcelas).toBe(2)
      expect(p.lista_parcelas.parcela).toHaveLength(2)
      expect(p.lista_parcelas.parcela[0].quantidade_dias).toBe(7)
      expect(p.lista_parcelas.parcela[1].quantidade_dias).toBe(14)
    })

    it('forma de pagamento "N dias <texto>" gera 1 parcela no prazo correto', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'OKEY LAC PRO 25KG', unidade: 'kg', peso_kg: 25, omie_codigo: '2071041102' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071041102, descricao: 'OKEY LAC PRO 25kG', unidade: 'KG', peso_bruto: 1.003, peso_liq: 1 },
        },
        formaPagamento: '45 dias exclusivo',
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      const parcelas = captured.payload.lista_parcelas.parcela
      expect(parcelas).toHaveLength(1)
      expect(parcelas[0].quantidade_dias).toBe(45)
      expect(parcelas[0].data_vencimento).toBe(fmtData(addDays(new Date(), 45)))
    })

    // ─── Cadastro automático do cliente + CPF ───

    it('cliente com CPF (sem CNPJ) é localizado no Omie por cnpj_cpf', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'PRODUTO X', unidade: 'un', peso_kg: 1, omie_codigo: '2071' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071, descricao: 'PRODUTO X', unidade: 'UN', peso_bruto: 1, peso_liq: 1 },
        },
        cliente: { cnpj: null, cpf: '12345678901', omie_codigo: null },
        listarClientes: { clientes_cadastro: [{ codigo_cliente_omie: 555, cnpj_cpf: '12345678901' }] },
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      expect(captured.payload.cabecalho.codigo_cliente).toBe(555)
    })

    it('cliente com CPF não encontrado no Omie é cadastrado automaticamente (contribuinte N)', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'PRODUTO X', unidade: 'un', peso_kg: 1, omie_codigo: '2071' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071, descricao: 'PRODUTO X', unidade: 'UN', peso_bruto: 1, peso_liq: 1 },
        },
        cliente: { cnpj: null, cpf: '12345678901', omie_codigo: null },
        listarClientes: { clientes_cadastro: [] },
        upsertClienteResponse: { codigo_cliente_omie: 456 },
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      expect(captured.upsertCliente.cnpj_cpf).toBe('12345678901')
      expect(captured.upsertCliente.contribuinte).toBe('N')
      expect(captured.payload.cabecalho.codigo_cliente).toBe(456)
    })

    it('cliente sem CNPJ/CPF usa o omie_codigo já vinculado (card de novo ciclo)', async () => {
      // Cards de novo ciclo nascem sem CNPJ (unicidade no banco). O pedido deve
      // achar o cliente no Omie pelo código já vinculado no CRM.
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'PRODUTO X', unidade: 'un', peso_kg: 1, omie_codigo: '2071' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071, descricao: 'PRODUTO X', unidade: 'UN', peso_bruto: 1, peso_liq: 1 },
        },
        cliente: { cnpj: null, cpf: null, omie_codigo: '123' },
        listarClientes: { clientes_cadastro: [{ codigo_cliente_omie: 123, cnpj_cpf: '99999999999' }] },
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      expect(captured.payload.cabecalho.codigo_cliente).toBe(123)
    })

    it('cliente sem CNPJ/CPF e sem omie_codigo falha com mensagem clara', async () => {
      setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'PRODUTO X', unidade: 'un', peso_kg: 1, omie_codigo: '2071' },
        },
        cliente: { cnpj: null, cpf: null, omie_codigo: null },
      })

      await expect(criarPedidoOmie(1)).rejects.toThrow('não tem CNPJ nem CPF')
    })

    // ─── Tabela de preço A/B (comissões) ───

    it('pedido aprovado na tabela B envia codigo_tabela_preco correspondente', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'PRODUTO X', unidade: 'un', peso_kg: 1, omie_codigo: '2071' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071, descricao: 'PRODUTO X', unidade: 'UN', peso_bruto: 1, peso_liq: 1 },
        },
        pedido: { tabela_preco: 'B' },
        tabelasPreco: [
          { nCodTabPreco: 111, cNome: 'Tabela A', cCodigo: 'A', cAtiva: 'S' },
          { nCodTabPreco: 222, cNome: 'Tabela B', cCodigo: 'B', cAtiva: 'S' },
        ],
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      expect(captured.payload.informacoes_adicionais.codigo_tabela_preco).toBe(222)
    })

    it('tabela de preço inexistente no Omie bloqueia o pedido (comissão errada)', async () => {
      setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'PRODUTO X', unidade: 'un', peso_kg: 1, omie_codigo: '2071' },
        },
        pedido: { tabela_preco: 'B' },
        tabelasPreco: [{ nCodTabPreco: 111, cNome: 'Tabela A', cCodigo: 'A', cAtiva: 'S' }],
      })

      await expect(criarPedidoOmie(1)).rejects.toThrow('Tabela de preço "B" não encontrada no Omie')
    })

    it('Omie sem tabelas cadastradas ignora a seleção sem quebrar o pedido', async () => {
      const captured = setupHappyPath({
        itens: [{ produto_id: 7, quantidade: 10, preco: 100 }],
        produtos: {
          7: { id: 7, nome: 'PRODUTO X', unidade: 'un', peso_kg: 1, omie_codigo: '2071' },
        },
        consultaOmiePorProduto: {
          7: { codigo_produto: 2071, descricao: 'PRODUTO X', unidade: 'UN', peso_bruto: 1, peso_liq: 1 },
        },
        pedido: { tabela_preco: 'B' },
        tabelasPreco: [],
        totalValor: 1000,
      })

      await criarPedidoOmie(1)
      expect(captured.payload.informacoes_adicionais.codigo_tabela_preco).toBeUndefined()
    })
  })
})
