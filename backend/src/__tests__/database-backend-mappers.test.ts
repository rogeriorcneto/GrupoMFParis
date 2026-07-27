import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('../supabase.js', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}))

vi.mock('../config.js', () => ({
  CONFIG: {
    supabaseUrl: 'http://localhost:54321',
    supabaseAnonKey: 'test-key',
  },
}))

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

// Build a chainable query builder mock and wire it to mockFrom
function resetChain(resolvedValue: any = { data: null, error: null }) {
  const chain: any = {}
  for (const key of ['select', 'insert', 'update', 'eq', 'or', 'in', 'order', 'limit', 'range']) {
    chain[key] = vi.fn().mockReturnValue(chain)
  }
  // Terminal methods resolve a value
  chain.single = vi.fn().mockResolvedValue(resolvedValue)
  chain.range = vi.fn().mockResolvedValue(resolvedValue)
  mockFrom.mockReturnValue(chain)
  return chain
}

import * as db from '../database.js'

describe('database.ts — mappers (tested via exported functions)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── clienteFromDb (via fetchClienteById) ───

  describe('clienteFromDb', () => {
    it('maps snake_case DB row to camelCase Cliente', async () => {
      const dbRow = {
        id: 1,
        razao_social: 'Empresa ABC',
        nome_fantasia: 'ABC',
        cnpj: '12345678000100',
        contato_nome: 'João',
        contato_telefone: '31999990000',
        contato_email: 'joao@abc.com',
        endereco: 'Rua X',
        whatsapp: '5531999990000',
        etapa: 'prospecção',
        score: 75,
        ultima_interacao: '2025-01-01',
        dias_inativo: 5,
        valor_estimado: 50000,
        produtos_interesse: ['Produto A'],
        vendedor_id: 2,
        data_entrada_etapa: '2025-01-01',
        notas: 'Notas do cliente',
        origem_lead: 'Google',
        status_entrega: 'pendente',
        data_entrega_prevista: '2025-02-01',
        data_entrega_realizada: null,
        status_faturamento: 'faturado',
        data_ultimo_pedido: '2025-01-15',
        etapa_anterior: 'amostra',
        categoria_perda: null,
        motivo_perda: null,
        data_perda: null,
        data_proposta: '2025-01-10',
        valor_proposta: '75000',
      }
      const chain = resetChain({ data: dbRow, error: null })
      chain.single = vi.fn().mockResolvedValue({ data: dbRow, error: null })
      const result = await db.fetchClienteById(1)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(1)
      expect(result!.razaoSocial).toBe('Empresa ABC')
      expect(result!.nomeFantasia).toBe('ABC')
      expect(result!.cnpj).toBe('12345678000100')
      expect(result!.contatoNome).toBe('João')
      expect(result!.contatoTelefone).toBe('31999990000')
      expect(result!.contatoEmail).toBe('joao@abc.com')
      expect(result!.etapa).toBe('prospecção')
      expect(result!.score).toBe(75)
      expect(result!.valorEstimado).toBe(50000)
      expect(result!.vendedorId).toBe(2)
      expect(result!.origemLead).toBe('Google')
      expect(result!.valorProposta).toBe(75000)
    })

    it('handles null/undefined optional fields gracefully', async () => {
      const dbRow = {
        id: 2,
        razao_social: 'Test',
        nome_fantasia: null,
        cnpj: null,
        contato_nome: null,
        contato_telefone: null,
        contato_email: null,
        endereco: null,
        whatsapp: null,
        etapa: 'prospecção',
        score: null,
        ultima_interacao: null,
        dias_inativo: null,
        valor_estimado: null,
        produtos_interesse: null,
        vendedor_id: null,
        data_entrada_etapa: null,
        notas: null,
        origem_lead: null,
        status_entrega: null,
        data_entrega_prevista: null,
        data_entrega_realizada: null,
        status_faturamento: null,
        data_ultimo_pedido: null,
        etapa_anterior: null,
        categoria_perda: null,
        motivo_perda: null,
        data_perda: null,
        data_proposta: null,
        valor_proposta: null,
      }
      const chain = resetChain({ data: dbRow, error: null })
      chain.single = vi.fn().mockResolvedValue({ data: dbRow, error: null })
      const result = await db.fetchClienteById(2)
      expect(result).not.toBeNull()
      expect(result!.nomeFantasia).toBe('')
      expect(result!.cnpj).toBe('')
      expect(result!.score).toBe(0)
      expect(result!.diasInativo).toBe(0)
      expect(result!.valorEstimado).toBe(0)
      expect(result!.produtosInteresse).toEqual([])
      expect(result!.valorProposta).toBeUndefined()
    })

    it('returns null when not found', async () => {
      const chain = resetChain({ data: null, error: { message: 'Not found' } })
      chain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      const result = await db.fetchClienteById(999)
      expect(result).toBeNull()
    })
  })

  // ─── vendedorFromDb (via fetchVendedores) ───

  describe('vendedorFromDb', () => {
    it('maps DB row to Vendedor with Number conversions', async () => {
      const rows = [{
        id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '31999',
        cargo: 'gerente', avatar: 'url', meta_vendas: '100000', meta_leads: 50,
        meta_conversao: '0.15', ativo: true,
      }]
      const chain = resetChain()
      // fetchVendedores calls .from('vendedores').select('*').order('id')
      // The chain resolves at the end
      chain.order = vi.fn().mockResolvedValue({ data: rows, error: null })
      const result = await db.fetchVendedores()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
      expect(result[0].nome).toBe('Rafael')
      expect(result[0].metaVendas).toBe(100000)
      expect(result[0].metaConversao).toBe(0.15)
      expect(result[0].ativo).toBe(true)
    })
  })

  // ─── tarefaFromDb (via fetchTarefasByVendedor) ───

  describe('tarefaFromDb', () => {
    it('maps DB row to Tarefa', async () => {
      const rows = [{
        id: 1, titulo: 'Ligar', descricao: 'Desc', data: '2025-01-01', hora: '10:00',
        tipo: 'ligacao', status: 'pendente', prioridade: 'alta',
        cliente_id: 5, vendedor_id: 1,
      }]
      const chain = resetChain()
      chain.order = vi.fn().mockResolvedValue({ data: rows, error: null })
      const result = await db.fetchTarefasByVendedor(1)
      expect(result[0].id).toBe(1)
      expect(result[0].titulo).toBe('Ligar')
      expect(result[0].clienteId).toBe(5)
      expect(result[0].vendedorId).toBe(1)
      expect(result[0].prioridade).toBe('alta')
    })

    it('handles null descricao and hora', async () => {
      const rows = [{
        id: 2, titulo: 'T', descricao: null, data: '2025-01-01', hora: null,
        tipo: 'email', status: 'concluida', prioridade: 'baixa',
        cliente_id: null, vendedor_id: 1,
      }]
      const chain = resetChain()
      chain.order = vi.fn().mockResolvedValue({ data: rows, error: null })
      const result = await db.fetchTarefasByVendedor(1)
      expect(result[0].descricao).toBe('')
      expect(result[0].hora).toBe('')
      expect(result[0].clienteId).toBeNull()
    })
  })

  // ─── produtoFromDb (via fetchProdutosAtivos) ───

  describe('produtoFromDb', () => {
    it('maps DB row to Produto with preco as Number', async () => {
      const rows = [{
        id: 1, nome: 'Leite', descricao: 'Integral', categoria: 'varejo_lacteo',
        preco: '12.50', unidade: 'litro', sku: 'SKU-001', ativo: true,
      }]
      const chain = resetChain()
      chain.order = vi.fn().mockResolvedValue({ data: rows, error: null })
      const result = await db.fetchProdutosAtivos()
      expect(result[0].preco).toBe(12.5)
      expect(result[0].nome).toBe('Leite')
      expect(result[0].sku).toBe('SKU-001')
    })
  })

  // ─── templateFromDb (via fetchTemplates) ───

  describe('templateFromDb', () => {
    it('maps DB row to Template', async () => {
      const rows = [{
        id: 1, nome: 'Welcome', canal: 'whatsapp', etapa: 'prospecção',
        assunto: 'Olá', corpo: 'Bem-vindo {{nome}}',
      }]
      const chain = resetChain()
      chain.order = vi.fn().mockResolvedValue({ data: rows, error: null })
      const result = await db.fetchTemplates()
      expect(result[0].nome).toBe('Welcome')
      expect(result[0].canal).toBe('whatsapp')
      expect(result[0].etapa).toBe('prospecção')
      expect(result[0].corpo).toBe('Bem-vindo {{nome}}')
    })

    it('filters by canal when provided', async () => {
      const chain = resetChain()
      chain.order = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockResolvedValue({ data: [], error: null })
      await db.fetchTemplates('email')
      // eq should have been called with 'canal', 'email'
      expect(chain.eq).toHaveBeenCalled()
    })
  })

  // ─── clienteToDb (via insertCliente / updateCliente) ───

  describe('clienteToDb', () => {
    it('converts camelCase fields to snake_case for insert', async () => {
      const chain = resetChain()
      chain.single = vi.fn().mockResolvedValue({
        data: { id: 1, razao_social: 'Test', etapa: 'prospecção', cnpj: '', contato_nome: '', contato_telefone: '', contato_email: '' },
        error: null,
      })
      await db.insertCliente({
        razaoSocial: 'Test',
        cnpj: '123',
        contatoNome: 'João',
        contatoTelefone: '31999',
        contatoEmail: 'j@t.com',
        etapa: 'prospecção',
      } as any)
      // Check the insert was called with snake_case
      expect(chain.insert).toHaveBeenCalled()
      const insertedRow = chain.insert.mock.calls[0][0]
      expect(insertedRow.razao_social).toBe('Test')
      expect(insertedRow.cnpj).toBe('123')
      expect(insertedRow.contato_nome).toBe('João')
      expect(insertedRow.contato_telefone).toBe('31999')
      expect(insertedRow.contato_email).toBe('j@t.com')
      expect(insertedRow.etapa).toBe('prospecção')
    })

    it('skips undefined fields in partial update', async () => {
      const chain = resetChain()
      chain.eq = vi.fn().mockResolvedValue({ error: null })
      await db.updateCliente(1, { razaoSocial: 'New Name' })
      const updatedRow = chain.update.mock.calls[0][0]
      expect(updatedRow.razao_social).toBe('New Name')
      expect(updatedRow).not.toHaveProperty('cnpj')
      expect(updatedRow).not.toHaveProperty('etapa')
      expect(updatedRow.updated_at).toBeDefined()
    })
  })

  // ─── findClienteByPhone ───

  describe('findClienteByPhone', () => {
    it('cleans phone number and searches', async () => {
      const chain = resetChain()
      chain.limit = vi.fn().mockResolvedValue({
        data: [{ id: 1, razao_social: 'Test', etapa: 'prospecção', cnpj: '', contato_nome: '', contato_telefone: '', contato_email: '' }],
        error: null,
      })
      const result = await db.findClienteByPhone('(31) 99999-0000')
      expect(result).not.toBeNull()
      // Check the or() was called with cleaned number
      expect(chain.or).toHaveBeenCalled()
      const orArg = chain.or.mock.calls[0][0] as string
      expect(orArg).toContain('31999990000')
    })

    it('returns null for empty phone', async () => {
      const result = await db.findClienteByPhone('')
      expect(result).toBeNull()
    })

    it('returns null for no matches', async () => {
      const chain = resetChain()
      chain.limit = vi.fn().mockResolvedValue({ data: [], error: null })
      const result = await db.findClienteByPhone('0000000')
      expect(result).toBeNull()
    })
  })

  // ─── fetchClientesByIds ───

  describe('fetchClientesByIds', () => {
    it('returns empty array for empty ids', async () => {
      const result = await db.fetchClientesByIds([])
      expect(result).toEqual([])
    })
  })

  // ─── searchClientes ───

  describe('searchClientes', () => {
    it('escapes PostgREST special characters', async () => {
      const chain = resetChain()
      chain.limit = vi.fn().mockResolvedValue({ data: [], error: null })
      await db.searchClientes('test%_\\special')
      const orArg = chain.or.mock.calls[0][0] as string
      expect(orArg).toContain('\\%')
      expect(orArg).toContain('\\_')
      expect(orArg).toContain('\\\\')
    })

    it('filters by vendedorId when provided', async () => {
      const chain = resetChain()
      // searchClientes chains: .or().order().limit(10).eq() then awaits
      // eq is the last call so it must resolve
      chain.eq = vi.fn().mockResolvedValue({ data: [], error: null })
      await db.searchClientes('test', 5)
      expect(chain.eq).toHaveBeenCalledWith('vendedor_id', 5)
    })
  })

  // ─── claimJobsPendentes ───

  describe('claimJobsPendentes', () => {
    it('calls RPC and maps result', async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: 1, cliente_id: 10, canal: 'whatsapp', template_id: 5, assunto: 'Test' }],
        error: null,
      })
      const result = await db.claimJobsPendentes()
      expect(mockRpc).toHaveBeenCalledWith('claim_jobs_pendentes', { p_limit: 50 })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
      expect(result[0].clienteId).toBe(10)
      expect(result[0].canal).toBe('whatsapp')
      expect(result[0].templateId).toBe(5)
    })

    it('returns empty array on error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })
      const result = await db.claimJobsPendentes()
      expect(result).toEqual([])
    })
  })

  // ─── updateJobStatus ───

  describe('updateJobStatus', () => {
    it('updates with status and executado_em', async () => {
      const chain = resetChain()
      chain.eq = vi.fn().mockResolvedValue({ error: null })
      await db.updateJobStatus(1, 'enviado')
      expect(chain.update).toHaveBeenCalled()
      const updates = chain.update.mock.calls[0][0]
      expect(updates.status).toBe('enviado')
      expect(updates.executado_em).toBeDefined()
      expect(updates.erro).toBeUndefined()
    })

    it('includes erro field when provided', async () => {
      const chain = resetChain()
      chain.eq = vi.fn().mockResolvedValue({ error: null })
      await db.updateJobStatus(1, 'erro', 'Falha de conexão')
      const updates = chain.update.mock.calls[0][0]
      expect(updates.status).toBe('erro')
      expect(updates.erro).toBe('Falha de conexão')
    })
  })

  // ─── fetchWhatsAppMessages ───

  describe('fetchWhatsAppMessages', () => {
    it('cleans numero and fetches by variations', async () => {
      const chain = resetChain()
      chain.limit = vi.fn().mockResolvedValue({
        data: [{
          id: 1, numero: '5531999990000', cliente_id: 10, vendedor_id: 1,
          direcao: 'enviada', mensagem: 'Olá', tipo: 'text', created_at: '2025-01-01',
        }],
        error: null,
      })
      const result = await db.fetchWhatsAppMessages('(31) 99999-0000')
      expect(result).toHaveLength(1)
      expect(result[0].numero).toBe('5531999990000')
      expect(result[0].clienteId).toBe(10)
      expect(result[0].direcao).toBe('enviada')
      expect(chain.in).toHaveBeenCalled()
      const inArgs = chain.in.mock.calls[0]
      expect(inArgs[0]).toBe('numero')
      expect(inArgs[1]).toEqual(['5531999990000', '553199990000'])
    })
  })

  // ─── updatePedidoStatus ───

  describe('updatePedidoStatus', () => {
    it('sets data_envio when status is "enviado"', async () => {
      const chain = resetChain()
      chain.eq = vi.fn().mockResolvedValue({ error: null })
      await db.updatePedidoStatus(1, 'enviado')
      const row = chain.update.mock.calls[0][0]
      expect(row.status).toBe('enviado')
      expect(row.data_envio).toBeDefined()
    })

    it('does not set data_envio for other statuses', async () => {
      const chain = resetChain()
      chain.eq = vi.fn().mockResolvedValue({ error: null })
      await db.updatePedidoStatus(1, 'confirmado')
      const row = chain.update.mock.calls[0][0]
      expect(row.status).toBe('confirmado')
      expect(row.data_envio).toBeUndefined()
    })
  })
})
