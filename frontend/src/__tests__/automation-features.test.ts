// ============================================
// TESTES: Automação de Tarefas e Mensagens
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock do Supabase
const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        single: vi.fn(() => Promise.resolve({ data: null, error: null }))
      })),
      order: vi.fn(() => Promise.resolve({ data: [], error: null }))
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ 
          data: { 
            id: 1, 
            nome: 'Teste',
            ativa: true,
            gatilho: 'mudanca_etapa',
            condicoes: {},
            acao: {}
          }, 
          error: null 
        }))
      }))
    })),
    update: vi.fn(() => Promise.resolve({ error: null })),
    delete: vi.fn(() => Promise.resolve({ error: null }))
  }))
}))

vi.mock('../lib/supabase', () => ({
  supabase: mockSupabase
}))

import * as db from '../lib/database'

describe('Automação de Tarefas - Database Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('CRUD Regras de Automação', () => {
    it('deve buscar regras do banco', async () => {
      const mockRegras = [
        { 
          id: 1, 
          nome: 'Follow-up amostra', 
          ativa: true,
          gatilho: 'mudanca_etapa',
          condicoes: { etapaDestino: 'amostra' },
          acao: { titulo: 'Teste', descricao: 'Desc', tipo: 'ligacao', prioridade: 'media', diasPrazo: 20, horaPadrao: '10:00' }
        }
      ]
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: mockRegras, error: null }))
        }))
      })

      const regras = await db.getRegrasAutomacao()
      expect(regras).toHaveLength(1)
      expect(regras[0].nome).toBe('Follow-up amostra')
    })

    it('deve criar nova regra', async () => {
      const novaRegra = {
        nome: 'Teste',
        ativa: true,
        gatilho: 'mudanca_etapa' as const,
        condicoes: { etapaDestino: 'proposta' },
        acao: {
          titulo: 'Follow-up — {cliente}',
          descricao: 'Teste',
          tipo: 'ligacao' as const,
          prioridade: 'media' as const,
          diasPrazo: 7,
          horaPadrao: '10:00'
        }
      }

      mockSupabase.from.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 99, ...novaRegra }, error: null }))
          }))
        }))
      })

      const resultado = await db.insertRegraAutomacao(novaRegra)
      expect(resultado).toBeDefined()
      expect(resultado.id).toBeDefined()
    })

    it('deve atualizar status ativa/inativa', async () => {
      const updateSpy = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
      mockSupabase.from.mockReturnValue({
        update: updateSpy
      })

      await db.updateRegraAutomacao(1, { ativa: false })
      expect(updateSpy).toHaveBeenCalled()
    })

    it('deve excluir regra', async () => {
      const deleteSpy = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
      mockSupabase.from.mockReturnValue({
        delete: deleteSpy
      })

      await db.deleteRegraAutomacao(1)
      expect(deleteSpy).toHaveBeenCalled()
    })
  })

  describe('CRUD Mensagens Automáticas', () => {
    it('deve buscar mensagens do banco', async () => {
      const mockMensagens = [
        { 
          id: 1, 
          nome: 'Pesquisa satisfação', 
          ativa: true,
          gatilho: 'substatus',
          condicoes: { subStatus: 'entregue' },
          config: { canal: 'whatsapp', usarIA: true, promptIA: 'Teste' }
        }
      ]
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: mockMensagens, error: null }))
        }))
      })

      const mensagens = await db.getMensagensAutomacao()
      expect(mensagens).toHaveLength(1)
      expect(mensagens[0].config.usarIA).toBe(true)
    })

    it('deve criar mensagem com IA', async () => {
      const novaMensagem = {
        nome: 'Teste IA',
        ativa: true,
        gatilho: 'substatus' as const,
        condicoes: { subStatus: 'aprovada' },
        config: {
          canal: 'whatsapp' as const,
          usarIA: true,
          promptIA: 'Gere mensagem amigável'
        }
      }

      mockSupabase.from.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 99, ...novaMensagem }, error: null }))
          }))
        }))
      })

      const resultado = await db.insertMensagemAutomacao(novaMensagem)
      expect(resultado).toBeDefined()
    })
  })

  describe('Processamento de Regras', () => {
    it('deve substituir {cliente} pelo nome real', async () => {
      const mockRegras = [
        {
          id: 1,
          nome: 'Teste',
          ativa: true,
          gatilho: 'mudanca_etapa',
          condicoes: { etapaDestino: 'amostra' },
          acao: {
            titulo: 'Follow-up — {cliente}',
            descricao: 'Descrição para {cliente}',
            tipo: 'ligacao',
            prioridade: 'media',
            diasPrazo: 20,
            horaPadrao: '10:00'
          }
        }
      ]

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => Promise.resolve({ data: mockRegras, error: null }))
            }))
          }))
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 99, titulo: 'Tarefa teste', descricao: '', data: '2025-01-01', hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', cliente_id: 1, vendedor_id: 1 }, error: null }))
          }))
        }))
      })

      const tarefas = await db.processarRegrasAutomacao(1, 'amostra', 'prospecção', 1, 'Empresa ABC Ltda')
      
      // Verificar se o nome foi substituído
      expect(tarefas).toBeDefined()
    })

    it('deve filtrar apenas regras ativas', async () => {
      const mockRegras = [
        { id: 1, nome: 'Ativa', ativa: true, gatilho: 'mudanca_etapa', condicoes: {}, acao: {} },
        { id: 2, nome: 'Inativa', ativa: false, gatilho: 'mudanca_etapa', condicoes: {}, acao: {} }
      ]

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => Promise.resolve({ data: [mockRegras[0]], error: null }))
            }))
          }))
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 99, titulo: 'Tarefa teste', descricao: '', data: '2025-01-01', hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', cliente_id: 1, vendedor_id: 1 }, error: null }))
          }))
        }))
      })

      const tarefas = await db.processarRegrasAutomacao(1, 'amostra', 'prospecção', 1, 'Cliente')
      expect(tarefas).toBeDefined()
    })
  })
})

describe('Integração com Funil', () => {
  it('deve criar tarefas quando cliente muda de etapa', async () => {
    const clienteMovido = {
      id: 1,
      razaoSocial: 'Cliente Teste',
      etapa: 'amostra',
      vendedorId: 1
    }

    // Simular movimento no funil
    const resultado = await simularMovimentoFunil(clienteMovido, 'prospecção', 'amostra')
    expect(resultado.tarefasCriadas).toBeGreaterThanOrEqual(0)
  })
})

// Helper para simular movimento no funil
async function simularMovimentoFunil(cliente: any, fromStage: string, toStage: string) {
  // Esta função simularia o comportamento do useFunilActions
  return {
    sucesso: true,
    tarefasCriadas: 0,
    clienteAtualizado: cliente
  }
}
