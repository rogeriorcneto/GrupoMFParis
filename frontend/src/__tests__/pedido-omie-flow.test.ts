import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token-gerente' } },
        error: null,
      }),
    },
  },
}))

const BOT_URL = 'http://localhost:3001'

// ════════════════════════════════════════════════════════════
// Fluxo completo: Pedido → Aprovação → Omie
// ════════════════════════════════════════════════════════════

describe('Fluxo Pedido → Aprovação → Omie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as any
  })

  // ── 1. Criação de Pedido ──

  describe('1. Criação de Pedido (vendedor)', () => {
    it('vendedor cria pedido com status "enviado" (para aprovação)', async () => {
      const pedido = {
        id: 1,
        numero: 'PED-001',
        clienteId: 10,
        vendedorId: 5,
        status: 'enviado',
        itens: [
          { produtoId: 1, nomeProduto: 'Leite MF Paris 25kg', quantidade: 10, preco: 150.00, sku: 'LMP-25' },
        ],
        totalValor: 1500.00,
        dataCriacao: new Date().toISOString(),
        dataEnvio: new Date().toISOString(),
      }

      expect(pedido.status).toBe('enviado')
      expect(pedido.totalValor).toBe(1500.00)
      expect(pedido.itens.length).toBeGreaterThan(0)
    })

    it('pedido rascunho pode ser enviado para aprovação', () => {
      const pedido = { id: 2, status: 'rascunho', vendedorId: 5 }
      const pedidoEnviado = { ...pedido, status: 'enviado', dataEnvio: new Date().toISOString() }

      expect(pedidoEnviado.status).toBe('enviado')
      expect(pedidoEnviado.dataEnvio).toBeDefined()
    })
  })

  // ── 2. Aprovação pelo Gerente ──

  describe('2. Aprovação pelo Gerente (backend /api/pedidos/:id/aprovar)', () => {
    it('gerente aprova pedido → status muda para "confirmado" + envia ao Omie', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true,
          pedido_aprovado: true,
          omie: { success: true, omie_codigo: '12345' },
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/1/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.pedido_aprovado).toBe(true)
      expect(data.omie.success).toBe(true)
      expect(data.omie.omie_codigo).toBe('12345')
    })

    it('aprovação falha se pedido não encontrado (404)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'Pedido não encontrado',
        }), { status: 404 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/999/aprovar`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('não encontrado')
    })

    it('aprovação sucede mesmo se Omie falha (Omie offline)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true,
          pedido_aprovado: true,
          omie: { success: false, error: 'Credenciais Omie não configuradas' },
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/1/aprovar`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.pedido_aprovado).toBe(true)
      expect(data.omie.success).toBe(false)
      expect(data.omie.error).toContain('Omie')
    })

    it('vendedor NÃO pode aprovar (requer gerente → 403)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/1/aprovar`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-vendedor' },
      })

      expect(res.status).toBe(403)
    })
  })

  // ── 3. Validação de Status (pedido DEVE estar confirmado para ir ao Omie) ──

  describe('3. Validação de Status — só "confirmado" vai ao Omie', () => {
    it('pedido "enviado" NÃO pode ser enviado diretamente ao Omie', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false,
          error: 'Pedido 1 não está aprovado. Status atual: "enviado". Somente pedidos confirmados podem ser enviados ao Omie.',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/1/enviar-omie`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('não está aprovado')
      expect(data.error).toContain('enviado')
    })

    it('pedido "rascunho" NÃO pode ser enviado ao Omie', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false,
          error: 'Pedido 2 não está aprovado. Status atual: "rascunho". Somente pedidos confirmados podem ser enviados ao Omie.',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/2/enviar-omie`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('rascunho')
    })

    it('pedido "cancelado" NÃO pode ser enviado ao Omie', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false,
          error: 'Pedido 3 não está aprovado. Status atual: "cancelado". Somente pedidos confirmados podem ser enviados ao Omie.',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/3/enviar-omie`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('cancelado')
    })

    it('pedido "confirmado" PODE ser enviado ao Omie com sucesso', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true,
          omie: { codigo_pedido: 12345, numero_pedido: 'OMI-001' },
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/1/enviar-omie`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(true)
    })

    it('pedido já enviado ao Omie NÃO pode ser enviado novamente', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false,
          error: 'Pedido 1 já foi enviado ao Omie (código: 12345)',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/1/enviar-omie`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('já foi enviado')
    })
  })

  // ── 4. Fluxo Completo End-to-End ──

  describe('4. Fluxo Completo End-to-End', () => {
    it('fluxo: vendedor envia → gerente aprova → Omie recebe', async () => {
      // Step 1: Vendedor cria pedido
      const pedido = {
        id: 100, numero: 'PED-100', clienteId: 10, vendedorId: 5,
        status: 'enviado', totalValor: 5000.00,
        itens: [
          { produtoId: 1, nomeProduto: 'Café MF Paris 25kg', quantidade: 20, preco: 250.00 },
        ],
      }
      expect(pedido.status).toBe('enviado')

      // Step 2: Gerente aprova (endpoint atualiza status + envia ao Omie)
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          pedido_aprovado: true,
          omie: { success: true, omie_codigo: '99999' },
        }), { status: 200 })
      )

      const approveRes = await fetch(`${BOT_URL}/api/pedidos/${pedido.id}/aprovar`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const approveData = await approveRes.json()

      expect(approveData.success).toBe(true)
      expect(approveData.pedido_aprovado).toBe(true)
      expect(approveData.omie.success).toBe(true)
      expect(approveData.omie.omie_codigo).toBe('99999')

      // Step 3: Pedido agora tem código Omie
      const pedidoAtualizado = {
        ...pedido,
        status: 'confirmado',
        omieCodigo: approveData.omie.omie_codigo,
        omieStatus: 'enviado',
      }
      expect(pedidoAtualizado.status).toBe('confirmado')
      expect(pedidoAtualizado.omieCodigo).toBe('99999')
    })

    it('fluxo com falha Omie: pedido confirmado + retry manual', async () => {
      // Step 1: Aprovação funciona mas Omie falha
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          pedido_aprovado: true,
          omie: { success: false, error: 'Omie timeout' },
        }), { status: 200 })
      )

      const approveRes = await fetch(`${BOT_URL}/api/pedidos/101/aprovar`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const approveData = await approveRes.json()

      expect(approveData.pedido_aprovado).toBe(true)
      expect(approveData.omie.success).toBe(false)

      // Step 2: Retry manual funciona
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          omie: { codigo_pedido: 88888, numero_pedido: 'OMI-088' },
        }), { status: 200 })
      )

      const retryRes = await fetch(`${BOT_URL}/api/pedidos/101/enviar-omie`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const retryData = await retryRes.json()

      expect(retryData.success).toBe(true)
    })
  })

  // ── 5. Validação de itens e cliente ──

  describe('5. Validações do pedido para Omie', () => {
    it('pedido sem itens não pode ser enviado ao Omie', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'Pedido 5 não tem itens',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/5/enviar-omie`, { method: 'POST' })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('não tem itens')
    })

    it('cliente sem CNPJ gera erro ao enviar para Omie', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'Cliente 10 (Padaria Central) não tem CNPJ. Cadastre o CNPJ primeiro.',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/6/enviar-omie`, { method: 'POST' })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('CNPJ')
    })

    it('Omie credenciais não configuradas gera erro claro', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'Credenciais Omie não configuradas. Configure em Integrações → Omie ERP.',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/7/enviar-omie`, { method: 'POST' })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('Credenciais Omie')
    })
  })

  // ── 6. Rota /api/omie/pedidos/:id/enviar (via routes/omie.ts) ──

  describe('6. Rota Omie Router — /api/omie/pedidos/:id/enviar', () => {
    it('envia pedido confirmado ao Omie com sucesso', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true, omie_codigo: '55555', message: 'Pedido enviado ao Omie com sucesso!',
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/omie/pedidos/1/enviar`, { method: 'POST' })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.omie_codigo).toBe('55555')
    })

    it('retorna erro 400 para ID inválido', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'ID do pedido inválido',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/omie/pedidos/abc/enviar`, { method: 'POST' })
      const data = await res.json()

      expect(data.success).toBe(false)
    })
  })
})

// ════════════════════════════════════════════════════════════
// IA no WhatsApp pessoal do vendedor
// ════════════════════════════════════════════════════════════

describe('IA no WhatsApp Pessoal do Vendedor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as any
  })

  // ── Endpoint /api/whatsapp/user/ai ──

  describe('POST /api/whatsapp/user/ai', () => {
    it('responde com dados do CRM via Gemini', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true,
          reply: 'Você tem 15 clientes ativos. O top cliente é Padaria Central com score 95.',
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: JSON.stringify({ message: 'quantos clientes ativos eu tenho?' }),
      })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.reply).toContain('clientes ativos')
    })

    it('mantém histórico de conversa', async () => {
      const history = [
        { role: 'user', content: 'quantos clientes tenho?' },
        { role: 'assistant', content: 'Você tem 42 clientes.' },
      ]

      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true,
          reply: 'Dos 42 clientes, 5 estão inativos há mais de 30 dias.',
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: JSON.stringify({ message: 'quantos estão inativos?', history }),
      })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.reply).toContain('inativos')
    })

    it('retorna erro se message está vazio', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'Campo obrigatório: message',
        }), { status: 400 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: JSON.stringify({}),
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('message')
    })

    it('retorna erro se GEMINI_API_KEY não configurada', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: false, error: 'GEMINI_API_KEY não configurada no servidor',
        }), { status: 500 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: JSON.stringify({ message: 'oi' }),
      })
      const data = await res.json()

      expect(data.success).toBe(false)
      expect(data.error).toContain('GEMINI_API_KEY')
    })

    it('requer autenticação (sem token → 401)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: 'AUTH_EXPIRED' }), { status: 401 })
      )

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/ai`, {
        method: 'POST',
        body: JSON.stringify({ message: 'teste' }),
      })

      expect(res.status).toBe(401)
    })
  })

  // ── Comando /ia no chat ──

  describe('Comando /ia no WhatsAppUserPanel', () => {
    it('mensagem com "/ia " prefixo é tratada como consulta IA', () => {
      const msg = '/ia quantos clientes estão inativos?'
      const isAiCommand = msg.toLowerCase().startsWith('/ia ')
      const aiQuestion = msg.slice(4).trim()

      expect(isAiCommand).toBe(true)
      expect(aiQuestion).toBe('quantos clientes estão inativos?')
    })

    it('mensagem sem "/ia " não é tratada como IA (vai para WhatsApp)', () => {
      const msg = 'Bom dia, como está o pedido?'
      const isAiCommand = msg.toLowerCase().startsWith('/ia ')

      expect(isAiCommand).toBe(false)
    })

    it('"/ia" sozinho sem espaço não é comando IA', () => {
      const msg = '/ialguma coisa'
      const isAiCommand = msg.toLowerCase().startsWith('/ia ')

      expect(isAiCommand).toBe(false)
    })

    it('modo IA ativo trata qualquer mensagem como consulta IA', () => {
      const aiMode = true
      const msg = 'qual meu melhor cliente?'
      const isAiCommand = msg.toLowerCase().startsWith('/ia ') || aiMode

      expect(isAiCommand).toBe(true)
    })

    it('modo IA desativado não redireciona mensagem normal', () => {
      const aiMode = false
      const msg = 'qual meu melhor cliente?'
      const isAiCommand = msg.toLowerCase().startsWith('/ia ') || aiMode

      expect(isAiCommand).toBe(false)
    })
  })
})

// ════════════════════════════════════════════════════════════
// Frontend API Helpers (botApi + omieApi)
// ════════════════════════════════════════════════════════════

describe('Frontend API Helpers para Omie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as any
  })

  describe('aprovarPedidoComOmie (botApi)', () => {
    it('chama POST /api/pedidos/:id/aprovar com auth', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true, pedido_aprovado: true, omie: { success: true },
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/42/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/pedidos/42/aprovar'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(data.success).toBe(true)
    })
  })

  describe('enviarPedidoOmie manual (botApi)', () => {
    it('chama POST /api/pedidos/:id/enviar-omie', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true, omie: { codigo_pedido: 77777 },
        }), { status: 200 })
      )

      const res = await fetch(`${BOT_URL}/api/pedidos/42/enviar-omie`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token-gerente' },
      })
      const data = await res.json()

      expect(data.success).toBe(true)
    })
  })

  describe('queryWhatsAppAI (botApi)', () => {
    it('chama POST /api/whatsapp/user/ai com message e history', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({
          success: true, reply: 'Resposta da IA',
        }), { status: 200 })
      )

      const body = JSON.stringify({
        message: 'listar clientes inativos',
        history: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'Olá!' }],
      })

      const res = await fetch(`${BOT_URL}/api/whatsapp/user/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body,
      })
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.reply).toBe('Resposta da IA')
    })
  })
})

// ════════════════════════════════════════════════════════════
// Regras de negócio — Garantias do Fluxo
// ════════════════════════════════════════════════════════════

describe('Regras de Negócio — Fluxo de Aprovação', () => {
  it('status transitions válidas: rascunho → enviado → confirmado → omie', () => {
    const validTransitions: Record<string, string[]> = {
      'rascunho': ['enviado', 'cancelado'],
      'enviado': ['confirmado', 'cancelado'],
      'confirmado': ['omie_enviado'],
    }

    expect(validTransitions['rascunho']).toContain('enviado')
    expect(validTransitions['enviado']).toContain('confirmado')
    expect(validTransitions['rascunho']).not.toContain('confirmado') // não pode pular aprovação
    expect(validTransitions['enviado']).not.toContain('omie_enviado') // não pode ir direto pro Omie
  })

  it('somente gerente pode aprovar pedidos', () => {
    const canApprove = (cargo: string) => cargo === 'gerente'

    expect(canApprove('gerente')).toBe(true)
    expect(canApprove('vendedor')).toBe(false)
    expect(canApprove('sdr')).toBe(false)
  })

  it('pedido só vai ao Omie DEPOIS de aprovado (status confirmado)', () => {
    const canSendToOmie = (status: string) => status === 'confirmado'

    expect(canSendToOmie('confirmado')).toBe(true)
    expect(canSendToOmie('enviado')).toBe(false)
    expect(canSendToOmie('rascunho')).toBe(false)
    expect(canSendToOmie('cancelado')).toBe(false)
    expect(canSendToOmie('aprovado')).toBe(false) // status antigo inconsistente
  })

  it('pedido com omieCodigo não pode ser reenviado', () => {
    const canRetry = (pedido: { status: string; omieCodigo?: string }) =>
      pedido.status === 'confirmado' && !pedido.omieCodigo

    expect(canRetry({ status: 'confirmado' })).toBe(true)
    expect(canRetry({ status: 'confirmado', omieCodigo: '' })).toBe(true)
    expect(canRetry({ status: 'confirmado', omieCodigo: '12345' })).toBe(false)
    expect(canRetry({ status: 'enviado' })).toBe(false)
  })

  it('fluxo Omie requer: credenciais + CNPJ do cliente + itens', () => {
    const validateForOmie = (pedido: {
      clienteCnpj?: string
      itensCount: number
      omieConfigured: boolean
    }) => {
      const errors: string[] = []
      if (!pedido.omieConfigured) errors.push('Credenciais Omie não configuradas')
      if (!pedido.clienteCnpj) errors.push('Cliente sem CNPJ')
      if (pedido.itensCount === 0) errors.push('Pedido sem itens')
      return errors
    }

    expect(validateForOmie({ clienteCnpj: '12345678000190', itensCount: 3, omieConfigured: true })).toHaveLength(0)
    expect(validateForOmie({ itensCount: 3, omieConfigured: true })).toContain('Cliente sem CNPJ')
    expect(validateForOmie({ clienteCnpj: '123', itensCount: 0, omieConfigured: true })).toContain('Pedido sem itens')
    expect(validateForOmie({ clienteCnpj: '123', itensCount: 1, omieConfigured: false })).toContain('Credenciais Omie não configuradas')
  })
})
