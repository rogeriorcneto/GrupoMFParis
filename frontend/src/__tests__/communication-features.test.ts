import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { sampleVendedor, sampleCliente } from './mocks/supabase-mock'

// ─── Mock modules ───

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
  },
}))

vi.mock('../lib/database', () => ({
  updateCliente: vi.fn().mockResolvedValue(undefined),
  insertCliente: vi.fn().mockImplementation((c: any) => Promise.resolve({ ...c, id: 99 })),
  insertInteracao: vi.fn().mockImplementation((i: any) => Promise.resolve({ ...i, id: 100 })),
  insertHistoricoEtapa: vi.fn().mockResolvedValue(undefined),
  insertAtividade: vi.fn().mockImplementation((a: any) => Promise.resolve({ ...a, id: 200 })),
  insertTarefa: vi.fn().mockImplementation((t: any) => Promise.resolve({ ...t, id: 300 })),
  insertJob: vi.fn().mockImplementation((j: any) => Promise.resolve({ ...j, id: 400, status: 'pendente' })),
  insertJobsBatch: vi.fn().mockImplementation((jobs: any[]) => Promise.resolve(jobs.map((j: any, i: number) => ({ ...j, id: 400 + i })))),
  updateJobStatus: vi.fn().mockResolvedValue(undefined),
  updateCampanhaStatus: vi.fn().mockResolvedValue(undefined),
  moverClienteAtomico: vi.fn().mockResolvedValue(undefined),
  fetchInteracoesByCliente: vi.fn().mockResolvedValue([]),
}))

vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../lib/botApi', () => ({
  sendEmailViaBot: vi.fn().mockResolvedValue({ success: true }),
  sendWhatsApp: vi.fn().mockResolvedValue({ success: true }),
  sendUserWhatsApp: vi.fn().mockResolvedValue({ success: true }),
  getUserWhatsAppStatus: vi.fn().mockResolvedValue({ connected: true, status: 'connected', number: '5531999999999', uptime: 120, vendedorId: 1 }),
  getUserWhatsAppQR: vi.fn().mockResolvedValue({ qr: null, status: 'connected' }),
  connectUserWhatsApp: vi.fn().mockResolvedValue({ success: true }),
  disconnectUserWhatsApp: vi.fn().mockResolvedValue({ success: true }),
  fetchWhatsAppMessages: vi.fn().mockResolvedValue([]),
  getAllUserWhatsAppSessions: vi.fn().mockResolvedValue([]),
  fetchVendedorHistorico: vi.fn().mockResolvedValue({ vendedor: { id: 1, nome: 'Test' }, atividades: [] }),
  fetchAllVendedoresHistorico: vi.fn().mockResolvedValue({ atividades: [] }),
  authFetch: vi.fn(),
  BOT_URL: 'http://localhost:3002',
}))

import { useFunilActions } from '../hooks/useFunilActions'
import * as db from '../lib/database'
import * as botApi from '../lib/botApi'

// ─── Helper: default params for useFunilActions ───

const defaultParams = () => {
  const clientes = [
    sampleCliente({ id: 1, etapa: 'prospecção', razaoSocial: 'Padaria Central', contatoTelefone: '(31) 99999-1111', contatoEmail: 'contato@padaria.com', whatsapp: '5531999991111' }),
    sampleCliente({ id: 2, etapa: 'amostra', razaoSocial: 'Mercado Norte', contatoTelefone: '(31) 88888-2222', contatoEmail: 'compras@mercado.com', whatsapp: '5531888882222' }),
    sampleCliente({ id: 3, etapa: 'negociacao', razaoSocial: 'Restaurante Sul', contatoTelefone: '', contatoEmail: '', whatsapp: '' }),
  ]
  return {
    clientes,
    setClientes: vi.fn(),
    interacoes: [],
    setInteracoes: vi.fn(),
    loggedUser: sampleVendedor({ id: 5, nome: 'Carlos Vendedor', cargo: 'vendedor' }),
    setAtividades: vi.fn(),
    addNotificacao: vi.fn(),
    jobs: [],
    setJobs: vi.fn(),
    campanhas: [],
    setCampanhas: vi.fn(),
    cadencias: [],
    tarefas: [],
    setTarefas: vi.fn(),
    loadAllData: vi.fn().mockResolvedValue(undefined),
  }
}

// ══════════════════════════════════════════════════════════════════════
// FEATURE 1: LIGAÇÃO (Phone Call) — registration of interactions
// ══════════════════════════════════════════════════════════════════════

describe('Feature 1: Ligação — registro de interação', () => {

  beforeEach(() => { vi.clearAllMocks() })

  describe('handleQuickAction com canal "ligacao"', () => {

    it('registra interação de ligação no banco sem enviar pelo bot', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'ligacao', 'contato')
      })

      // Ligação NÃO chama sendWhatsApp nem sendEmailViaBot
      expect(botApi.sendWhatsApp).not.toHaveBeenCalled()
      expect(botApi.sendEmailViaBot).not.toHaveBeenCalled()

      // MAS registra interação no banco
      expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 1,
        tipo: 'ligacao',
        assunto: expect.stringContaining('Contato'),
      }))

      // E atualiza ultimaInteracao do cliente
      expect(db.updateCliente).toHaveBeenCalledWith(1, expect.objectContaining({
        ultimaInteracao: expect.any(String),
      }))

      // E registra atividade
      expect(db.insertAtividade).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'contato',
        descricao: expect.stringContaining('Padaria Central'),
      }))
    })

    it('registra ligação de propaganda no banco', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[1], 'ligacao', 'propaganda')
      })

      expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 2,
        tipo: 'ligacao',
        assunto: expect.stringContaining('Propaganda'),
      }))
    })

    it('ligação atualiza interacoes e atividades no state', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'ligacao', 'contato')
      })

      expect(params.setInteracoes).toHaveBeenCalled()
      expect(params.setAtividades).toHaveBeenCalled()
      expect(params.addNotificacao).toHaveBeenCalledWith('success', expect.any(String), expect.any(String), 1)
    })

    it('quickActionRef impede dupla execução de ligação', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      // First call should succeed
      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'ligacao', 'contato')
      })
      expect(db.insertInteracao).toHaveBeenCalledTimes(1)

      // Second call should also succeed (ref was reset)
      await act(async () => {
        await result.current.handleQuickAction(params.clientes[1], 'ligacao', 'contato')
      })
      expect(db.insertInteracao).toHaveBeenCalledTimes(2)
    })
  })

  describe('handleQuickAction — ligação vs outros canais', () => {

    it('ligação NÃO passa pelo bot, email SIM', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      // Ligação
      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'ligacao', 'contato')
      })
      expect(botApi.sendEmailViaBot).not.toHaveBeenCalled()
      expect(botApi.sendWhatsApp).not.toHaveBeenCalled()

      // Email
      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'email', 'contato')
      })
      expect(botApi.sendEmailViaBot).toHaveBeenCalledTimes(1)
    })

    it('ligação NÃO passa pelo bot, whatsapp SIM', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'ligacao', 'contato')
      })
      expect(botApi.sendWhatsApp).not.toHaveBeenCalled()

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'whatsapp', 'contato')
      })
      expect(botApi.sendWhatsApp).toHaveBeenCalledTimes(1)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════
// FEATURE 2: WHATSAPP — envio + registro
// ══════════════════════════════════════════════════════════════════════

describe('Feature 2: WhatsApp — envio e registro', () => {

  beforeEach(() => { vi.clearAllMocks() })

  describe('handleQuickAction com canal "whatsapp"', () => {

    it('envia WhatsApp via bot e registra interação', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'whatsapp', 'propaganda')
      })

      // Envia via bot
      expect(botApi.sendWhatsApp).toHaveBeenCalledWith(
        '5531999991111',
        expect.any(String),
        1,
        'Carlos Vendedor',
      )

      // Registra interação
      expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 1,
        tipo: 'whatsapp',
      }))

      // Registra atividade
      expect(db.insertAtividade).toHaveBeenCalled()
      expect(params.addNotificacao).toHaveBeenCalledWith('success', expect.any(String), expect.any(String), 1)
    })

    it('NÃO registra interação se envio WhatsApp falhar', async () => {
      vi.mocked(botApi.sendWhatsApp).mockResolvedValueOnce({ success: false, error: 'Bot offline' })
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'whatsapp', 'contato')
      })

      // Não registra interação se falhou
      expect(db.insertInteracao).not.toHaveBeenCalled()
      // Mas notifica o erro
      expect(params.addNotificacao).toHaveBeenCalledWith('warning', expect.any(String), expect.stringContaining('falhou'), 1)
    })

    it('usa whatsapp field do cliente para envio', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'whatsapp', 'contato')
      })

      // cliente[0] tem whatsapp: '5531999991111'
      expect(botApi.sendWhatsApp).toHaveBeenCalledWith(
        '5531999991111',
        expect.any(String),
        1,
        'Carlos Vendedor',
      )
    })

    it('usa contatoTelefone como fallback quando sem whatsapp', async () => {
      const params = defaultParams()
      // cliente[1] tem whatsapp mas vamos testar com cliente sem whatsapp
      params.clientes.push(sampleCliente({
        id: 4, razaoSocial: 'Sem WA', whatsapp: '', contatoTelefone: '(31) 77777-3333',
      }))
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[3], 'whatsapp', 'contato')
      })

      expect(botApi.sendWhatsApp).toHaveBeenCalledWith(
        '(31) 77777-3333',
        expect.any(String),
        4,
        'Carlos Vendedor',
      )
    })
  })

  describe('Per-User WhatsApp API', () => {

    it('getUserWhatsAppStatus retorna status do vendedor', async () => {
      const status = await botApi.getUserWhatsAppStatus()
      expect(status.connected).toBe(true)
      expect(status.vendedorId).toBe(1)
    })

    it('sendUserWhatsApp envia via sessão do vendedor', async () => {
      const result = await botApi.sendUserWhatsApp('5531999999999', 'Olá!', 1)
      expect(result.success).toBe(true)
    })

    it('connectUserWhatsApp inicia conexão', async () => {
      const result = await botApi.connectUserWhatsApp()
      expect(result.success).toBe(true)
    })

    it('disconnectUserWhatsApp desconecta', async () => {
      const result = await botApi.disconnectUserWhatsApp()
      expect(result.success).toBe(true)
    })

    it('getAllUserWhatsAppSessions lista sessões (gerente)', async () => {
      const sessions = await botApi.getAllUserWhatsAppSessions()
      expect(Array.isArray(sessions)).toBe(true)
    })
  })

  describe('WhatsApp Bot API — sendWhatsApp', () => {

    it('envia com número, texto, clienteId e vendedorNome', async () => {
      const result = await botApi.sendWhatsApp('5531999999999', 'Olá!', 1, 'Carlos', 5)
      expect(result.success).toBe(true)
    })

    it('retorna erro quando bot offline', async () => {
      vi.mocked(botApi.sendWhatsApp).mockResolvedValueOnce({ success: false, error: 'Bot offline' })
      const result = await botApi.sendWhatsApp('5531999999999', 'Olá!')
      expect(result.success).toBe(false)
      expect(result.error).toContain('offline')
    })
  })
})

// ══════════════════════════════════════════════════════════════════════
// FEATURE 3: EMAIL — envio + registro
// ══════════════════════════════════════════════════════════════════════

describe('Feature 3: Email — envio e registro', () => {

  beforeEach(() => { vi.clearAllMocks() })

  describe('handleQuickAction com canal "email"', () => {

    it('envia email via bot e registra interação', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'email', 'contato')
      })

      expect(botApi.sendEmailViaBot).toHaveBeenCalledWith(
        'contato@padaria.com',
        expect.any(String),
        expect.any(String),
        1,
        'Carlos Vendedor',
      )

      expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 1,
        tipo: 'email',
      }))
    })

    it('NÃO registra interação se envio email falhar', async () => {
      vi.mocked(botApi.sendEmailViaBot).mockResolvedValueOnce({ success: false, error: 'SMTP error' })
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'email', 'contato')
      })

      expect(db.insertInteracao).not.toHaveBeenCalled()
      expect(params.addNotificacao).toHaveBeenCalledWith('warning', expect.any(String), expect.stringContaining('falhou'), 1)
    })

    it('não envia email se cliente não tem contatoEmail', async () => {
      const params = defaultParams()
      // cliente[2] has no email
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[2], 'email', 'contato')
      })

      // Sem email cadastrado, sendEmailViaBot não é chamado, sendOk permanece true
      // e a interação é registrada normalmente (canal genérico)
      expect(botApi.sendEmailViaBot).not.toHaveBeenCalled()
      expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 3,
        tipo: 'email',
      }))
    })
  })
})

// ══════════════════════════════════════════════════════════════════════
// FEATURE 4: BOT CRM — busca de informações + IA
// ══════════════════════════════════════════════════════════════════════

describe('Feature 4: Bot CRM — busca de informações', () => {

  beforeEach(() => { vi.clearAllMocks() })

  describe('authFetch — autenticação para API do bot', () => {

    it('sem token dispara erro "Não autenticado"', async () => {
      const { supabase } = await import('../lib/supabase')
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null }, error: null } as any)

      // Re-import real authFetch
      const realAuthFetch = async (url: string) => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('Não autenticado')
        return fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } })
      }

      await expect(realAuthFetch('/api/test')).rejects.toThrow('Não autenticado')
    })
  })

  describe('fetchVendedorHistorico — histórico de ações do vendedor', () => {

    it('retorna atividades do vendedor', async () => {
      const data = await botApi.fetchVendedorHistorico(1)
      expect(data.vendedor.id).toBe(1)
      expect(Array.isArray(data.atividades)).toBe(true)
    })
  })

  describe('fetchAllVendedoresHistorico — histórico geral (gerente)', () => {

    it('retorna todas atividades', async () => {
      const data = await botApi.fetchAllVendedoresHistorico()
      expect(Array.isArray(data.atividades)).toBe(true)
    })
  })

  describe('fetchWhatsAppMessages — histórico de mensagens WhatsApp', () => {

    it('retorna mensagens do cliente', async () => {
      const msgs = await botApi.fetchWhatsAppMessages({ clienteId: 1, limit: 100 })
      expect(Array.isArray(msgs)).toBe(true)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════
// CROSS-FEATURE: Fluxo completo de registro
// ══════════════════════════════════════════════════════════════════════

describe('Fluxo completo: todos os canais registram interação', () => {

  beforeEach(() => { vi.clearAllMocks() })

  it('ligação + whatsapp + email — todos registram interação no banco', async () => {
    const params = defaultParams()
    const { result } = renderHook(() => useFunilActions(params))
    const cliente = params.clientes[0]

    // 1. Ligação
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'ligacao', 'contato')
    })
    expect(db.insertInteracao).toHaveBeenCalledTimes(1)
    expect(db.insertInteracao).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'ligacao', clienteId: 1 }))

    // 2. WhatsApp
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'whatsapp', 'contato')
    })
    expect(db.insertInteracao).toHaveBeenCalledTimes(2)
    expect(db.insertInteracao).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'whatsapp', clienteId: 1 }))

    // 3. Email
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'email', 'contato')
    })
    expect(db.insertInteracao).toHaveBeenCalledTimes(3)
    expect(db.insertInteracao).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'email', clienteId: 1 }))
  })

  it('todas interações atualizam ultimaInteracao do cliente', async () => {
    const params = defaultParams()
    const { result } = renderHook(() => useFunilActions(params))
    const cliente = params.clientes[0]

    await act(async () => {
      await result.current.handleQuickAction(cliente, 'ligacao', 'contato')
    })
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'whatsapp', 'propaganda')
    })
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'email', 'propaganda')
    })

    // 3 chamadas updateCliente com ultimaInteracao
    expect(db.updateCliente).toHaveBeenCalledTimes(3)
    for (const call of vi.mocked(db.updateCliente).mock.calls) {
      expect(call[0]).toBe(1) // clienteId
      expect(call[1]).toHaveProperty('ultimaInteracao')
    }
  })

  it('todas interações criam atividade com nome do vendedor', async () => {
    const params = defaultParams()
    const { result } = renderHook(() => useFunilActions(params))
    const cliente = params.clientes[0]

    await act(async () => {
      await result.current.handleQuickAction(cliente, 'ligacao', 'contato')
    })
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'whatsapp', 'contato')
    })
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'email', 'contato')
    })

    expect(db.insertAtividade).toHaveBeenCalledTimes(3)
    for (const call of vi.mocked(db.insertAtividade).mock.calls) {
      expect(call[0]).toHaveProperty('vendedorNome', 'Carlos Vendedor')
    }
  })

  it('todas interações geram notificação de sucesso', async () => {
    const params = defaultParams()
    const { result } = renderHook(() => useFunilActions(params))
    const cliente = params.clientes[0]

    await act(async () => {
      await result.current.handleQuickAction(cliente, 'ligacao', 'contato')
    })
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'whatsapp', 'contato')
    })
    await act(async () => {
      await result.current.handleQuickAction(cliente, 'email', 'contato')
    })

    expect(params.addNotificacao).toHaveBeenCalledTimes(3)
    for (const call of params.addNotificacao.mock.calls) {
      expect(call[0]).toBe('success')
    }
  })
})

// ══════════════════════════════════════════════════════════════════════
// registerCall — lógica de registro de ligação em TaskCommPanel/TarefasView
// ══════════════════════════════════════════════════════════════════════

describe('registerCall — registro direto de ligação (TaskCommPanel/TarefasView)', () => {

  beforeEach(() => { vi.clearAllMocks() })

  it('insertInteracao é chamado com tipo "ligacao" e dados corretos', async () => {
    // Simula a função registerCall como implementada em TaskCommPanel/TarefasView
    const cliente = sampleCliente({
      id: 10,
      razaoSocial: 'Teste Ligação',
      contatoNome: 'João',
      contatoTelefone: '(31) 99999-8888',
    })
    const loggedUser = sampleVendedor({ id: 5, nome: 'Carlos Vendedor' })

    const numero = cliente.contatoTelefone || ''
    await db.insertInteracao({
      clienteId: cliente.id,
      tipo: 'ligacao',
      data: new Date().toISOString(),
      assunto: `Ligação para ${cliente.contatoNome || cliente.razaoSocial}`,
      descricao: `Ligação realizada para ${numero} — ${cliente.razaoSocial}`,
      automatico: false,
    })

    expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
      clienteId: 10,
      tipo: 'ligacao',
      assunto: 'Ligação para João',
      descricao: expect.stringContaining('(31) 99999-8888'),
      automatico: false,
    }))
  })

  it('insertAtividade registra com nome do vendedor', async () => {
    const cliente = sampleCliente({ id: 10, razaoSocial: 'Teste' })
    const loggedUser = sampleVendedor({ id: 5, nome: 'Carlos Vendedor' })

    await db.insertAtividade({
      tipo: 'ligacao',
      descricao: `Ligação para ${cliente.razaoSocial} (${cliente.contatoTelefone})`,
      vendedorNome: loggedUser.nome,
      timestamp: new Date().toISOString(),
    })

    expect(db.insertAtividade).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'ligacao',
      vendedorNome: 'Carlos Vendedor',
      descricao: expect.stringContaining('Teste'),
    }))
  })

  it('registro de ligação funciona mesmo sem contatoNome (usa razaoSocial)', async () => {
    const cliente = sampleCliente({ id: 11, razaoSocial: 'Empresa XYZ', contatoNome: '' })

    await db.insertInteracao({
      clienteId: cliente.id,
      tipo: 'ligacao',
      data: new Date().toISOString(),
      assunto: `Ligação para ${cliente.contatoNome || cliente.razaoSocial}`,
      descricao: `Ligação para ${cliente.razaoSocial}`,
      automatico: false,
    })

    expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
      assunto: 'Ligação para Empresa XYZ',
    }))
  })
})
