import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { sampleVendedor, sampleCliente, sampleTarefa } from './mocks/supabase-mock'

// Mock database module
vi.mock('../lib/database', () => ({
  updateCliente: vi.fn().mockResolvedValue(undefined),
  insertCliente: vi.fn().mockImplementation((c: any) => Promise.resolve({ ...c, id: 99 })),
  insertInteracao: vi.fn().mockImplementation((i: any) => Promise.resolve({ ...i, id: 100 })),
  insertHistoricoEtapa: vi.fn().mockResolvedValue(undefined),
  insertAtividade: vi.fn().mockImplementation((a: any) => Promise.resolve({ ...a, id: 200 })),
  insertTarefa: vi.fn().mockImplementation((t: any) => Promise.resolve({ ...t, id: 300 })),
  insertJob: vi.fn().mockImplementation((j: any) => Promise.resolve({ ...j, id: 400, status: 'pendente' })),
  updateJobStatus: vi.fn().mockResolvedValue(undefined),
  updateCampanhaStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../lib/botApi', () => ({
  sendEmailViaBot: vi.fn().mockResolvedValue({ success: true }),
  sendWhatsApp: vi.fn().mockResolvedValue({ success: true }),
}))

import { useFunilActions } from '../hooks/useFunilActions'
import * as db from '../lib/database'

const defaultParams = () => {
  const clientes = [
    sampleCliente({ id: 1, etapa: 'prospecção', razaoSocial: 'Empresa A' }),
    sampleCliente({ id: 2, etapa: 'amostra', razaoSocial: 'Empresa B' }),
    sampleCliente({ id: 3, etapa: 'homologado', razaoSocial: 'Empresa C' }),
  ]
  return {
    clientes,
    setClientes: vi.fn(),
    interacoes: [],
    setInteracoes: vi.fn(),
    loggedUser: sampleVendedor(),
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

describe('useFunilActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('estado inicial', () => {
    it('inicia sem drag item, sem modais abertos', () => {
      const { result } = renderHook(() => useFunilActions(defaultParams()))
      expect(result.current.draggedItem).toBeNull()
      expect(result.current.showMotivoPerda).toBe(false)
      expect(result.current.showModalAmostra).toBe(false)
      expect(result.current.showModalProposta).toBe(false)
      expect(result.current.selectedClientePanel).toBeNull()
      expect(result.current.transicaoInvalida).toBe('')
    })
  })

  describe('handleDragStart', () => {
    it('registra cliente e etapa de origem', () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { dataTransfer: { effectAllowed: '' } } as any

      act(() => {
        result.current.handleDragStart(fakeEvent, params.clientes[0], 'prospecção')
      })

      expect(result.current.draggedItem).toEqual({
        cliente: params.clientes[0],
        fromStage: 'prospecção',
      })
      expect(fakeEvent.dataTransfer.effectAllowed).toBe('move')
    })
  })

  describe('handleDrop — transições', () => {
    it('rejeita transição inválida (prospecção → homologado)', () => {
      vi.useFakeTimers()
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { preventDefault: vi.fn(), dataTransfer: { effectAllowed: 'move' } } as any

      // Start drag
      act(() => {
        result.current.handleDragStart(fakeEvent, params.clientes[0], 'prospecção')
      })

      // Drop on invalid stage
      act(() => {
        result.current.handleDrop(fakeEvent, 'homologado')
      })

      expect(result.current.transicaoInvalida).toContain('Não é possível mover')
      expect(db.updateCliente).not.toHaveBeenCalled()

      // Advance timer inside act() so React processes the state update
      act(() => { vi.advanceTimersByTime(4000) })
      expect(result.current.transicaoInvalida).toBe('')
      vi.useRealTimers()
    })

    it('drop na mesma etapa é no-op', () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { preventDefault: vi.fn(), dataTransfer: { effectAllowed: 'move' } } as any

      act(() => {
        result.current.handleDragStart(fakeEvent, params.clientes[0], 'prospecção')
      })
      act(() => {
        result.current.handleDrop(fakeEvent, 'prospecção')
      })

      expect(result.current.draggedItem).toBeNull()
      expect(db.updateCliente).not.toHaveBeenCalled()
    })

    it('drop em "perdido" abre modal de motivo', () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { preventDefault: vi.fn(), dataTransfer: { effectAllowed: 'move' } } as any

      act(() => {
        result.current.handleDragStart(fakeEvent, params.clientes[0], 'prospecção')
      })
      act(() => {
        result.current.handleDrop(fakeEvent, 'perdido')
      })

      expect(result.current.showMotivoPerda).toBe(true)
      expect(result.current.draggedItem).not.toBeNull()
      // Não moveu ainda — precisa confirmar
      expect(db.updateCliente).not.toHaveBeenCalled()
    })

    it('drop em "amostra" abre modal de data', () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { preventDefault: vi.fn(), dataTransfer: { effectAllowed: 'move' } } as any

      act(() => {
        result.current.handleDragStart(fakeEvent, params.clientes[0], 'prospecção')
      })
      act(() => {
        result.current.handleDrop(fakeEvent, 'amostra')
      })

      expect(result.current.showModalAmostra).toBe(true)
    })

    it('drop em "negociacao" abre modal de proposta', () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { preventDefault: vi.fn(), dataTransfer: { effectAllowed: 'move' } } as any

      act(() => {
        result.current.handleDragStart(fakeEvent, params.clientes[2], 'homologado')
      })
      act(() => {
        result.current.handleDrop(fakeEvent, 'negociacao')
      })

      expect(result.current.showModalProposta).toBe(true)
    })
  })

  describe('moverCliente', () => {
    it('atualiza state otimisticamente e persiste no DB', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.moverCliente(1, 'amostra', { dataEnvioAmostra: '2025-02-01' })
      })

      expect(params.setClientes).toHaveBeenCalled()
      expect(db.updateCliente).toHaveBeenCalledWith(1, expect.objectContaining({
        etapa: 'amostra',
        etapaAnterior: 'prospecção',
        dataEnvioAmostra: '2025-02-01',
      }))
      expect(db.insertHistoricoEtapa).toHaveBeenCalledWith(1, expect.objectContaining({
        etapa: 'amostra',
        de: 'prospecção',
      }))
      expect(db.insertAtividade).toHaveBeenCalled()
      expect(params.setAtividades).toHaveBeenCalled()
    })

    it('cria tarefas automáticas ao mover para amostra', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.moverCliente(1, 'amostra')
      })

      // 2 tarefas: follow-up 15d + cobrar 25d
      expect(db.insertTarefa).toHaveBeenCalledTimes(2)
      expect(params.setTarefas).toHaveBeenCalled()
    })

    it('cria tarefas automáticas ao mover para homologado', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.moverCliente(2, 'homologado')
      })

      expect(db.insertTarefa).toHaveBeenCalledTimes(2)
    })

    it('cria tarefas automáticas ao mover para negociacao', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.moverCliente(3, 'negociacao')
      })

      expect(db.insertTarefa).toHaveBeenCalledTimes(1)
    })

    it('cria tarefas automáticas ao mover para pos_venda', async () => {
      const params = defaultParams()
      params.clientes.push(sampleCliente({ id: 4, etapa: 'negociacao' }))
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.moverCliente(4, 'pos_venda')
      })

      // 2 tarefas: confirmar entrega + pós-venda satisfação
      expect(db.insertTarefa).toHaveBeenCalledTimes(2)
    })

    it('faz rollback se persistência falhar', async () => {
      vi.mocked(db.updateCliente).mockRejectedValueOnce(new Error('DB error'))
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.moverCliente(1, 'amostra')
      })

      // setClientes called twice: optimistic + rollback
      expect(params.setClientes).toHaveBeenCalledTimes(2)
      expect(params.addNotificacao).toHaveBeenCalledWith('error', expect.any(String), expect.any(String))
      expect(params.loadAllData).toHaveBeenCalled()
    })

    it('protege contra double-move (movingRef)', async () => {
      // Make first move hang
      let resolveFirst: any
      vi.mocked(db.updateCliente).mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))

      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      // First move (will hang)
      const move1 = act(async () => {
        await result.current.moverCliente(1, 'amostra')
      })

      // Second move while first is pending — should be no-op
      await act(async () => {
        await result.current.moverCliente(2, 'homologado')
      })

      // Only 1 updateCliente call
      expect(db.updateCliente).toHaveBeenCalledTimes(1)

      resolveFirst(undefined)
      await move1
    })

    it('não faz nada para clienteId inexistente', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.moverCliente(999, 'amostra')
      })

      expect(db.updateCliente).not.toHaveBeenCalled()
    })
  })

  describe('confirmPerda', () => {
    it('move cliente para perdido com motivo e categoria', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { preventDefault: vi.fn(), dataTransfer: { effectAllowed: 'move' } } as any

      // Setup: drag + drop on perdido
      act(() => { result.current.handleDragStart(fakeEvent, params.clientes[0], 'prospecção') })
      act(() => { result.current.handleDrop(fakeEvent, 'perdido') })

      // Fill motivo
      act(() => {
        result.current.setMotivoPerdaTexto('Preço muito alto')
        result.current.setCategoriaPerdaSel('preco')
      })

      // Confirm
      await act(async () => {
        result.current.confirmPerda()
      })

      expect(db.updateCliente).toHaveBeenCalledWith(1, expect.objectContaining({
        etapa: 'perdido',
        motivoPerda: 'Preço muito alto',
        categoriaPerda: 'preco',
      }))
      expect(result.current.showMotivoPerda).toBe(false)
      expect(result.current.motivoPerdaTexto).toBe('')
      expect(result.current.draggedItem).toBeNull()
    })
  })

  describe('confirmAmostra', () => {
    it('move cliente para amostra com data de envio', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { preventDefault: vi.fn(), dataTransfer: { effectAllowed: 'move' } } as any

      act(() => { result.current.handleDragStart(fakeEvent, params.clientes[0], 'prospecção') })
      act(() => { result.current.handleDrop(fakeEvent, 'amostra') })
      act(() => { result.current.setModalAmostraData('2025-03-01') })

      await act(async () => {
        result.current.confirmAmostra()
      })

      expect(db.updateCliente).toHaveBeenCalledWith(1, expect.objectContaining({
        etapa: 'amostra',
        dataEnvioAmostra: '2025-03-01',
        statusAmostra: 'enviada',
      }))
      expect(result.current.showModalAmostra).toBe(false)
    })
  })

  describe('confirmProposta', () => {
    it('move cliente para negociação com valor da proposta', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))
      const fakeEvent = { preventDefault: vi.fn(), dataTransfer: { effectAllowed: 'move' } } as any

      act(() => { result.current.handleDragStart(fakeEvent, params.clientes[2], 'homologado') })
      act(() => { result.current.handleDrop(fakeEvent, 'negociacao') })
      act(() => { result.current.setModalPropostaValor('250000') })

      await act(async () => {
        result.current.confirmProposta()
      })

      expect(db.updateCliente).toHaveBeenCalledWith(3, expect.objectContaining({
        etapa: 'negociacao',
        valorProposta: 250000,
      }))
      expect(result.current.showModalProposta).toBe(false)
    })
  })

  describe('handleQuickAction', () => {
    it('registra interação e atualiza cliente', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'email', 'contato')
      })

      expect(db.insertInteracao).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 1,
        tipo: 'email',
      }))
      expect(db.updateCliente).toHaveBeenCalledWith(1, expect.objectContaining({
        ultimaInteracao: expect.any(String),
      }))
      expect(db.insertAtividade).toHaveBeenCalled()
      expect(params.addNotificacao).toHaveBeenCalledWith('success', expect.any(String), expect.any(String), 1)
    })

    it('quickActionRef volta a false após execução', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      // Execute quick action
      await act(async () => {
        await result.current.handleQuickAction(params.clientes[0], 'email', 'contato')
      })

      // Should be able to execute again (ref was reset)
      await act(async () => {
        await result.current.handleQuickAction(params.clientes[1], 'whatsapp', 'propaganda')
      })

      expect(db.insertInteracao).toHaveBeenCalledTimes(2)
    })
  })

  describe('scheduleJob', () => {
    it('cria job e notifica', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.scheduleJob({
          clienteId: 1,
          canal: 'email',
          tipo: 'propaganda',
          agendadoPara: '2025-03-01T10:00:00Z',
        })
      })

      expect(db.insertJob).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 1,
        canal: 'email',
        status: 'pendente',
      }))
      expect(params.setJobs).toHaveBeenCalled()
      expect(params.addNotificacao).toHaveBeenCalledWith('info', expect.any(String), expect.any(String), 1)
    })
  })

  describe('startCampanha', () => {
    it('cria jobs para cada step x cliente da audiência', async () => {
      const params = defaultParams()
      params.campanhas = [{
        id: 1, nome: 'Campanha Teste', cadenciaId: 1,
        etapa: 'prospecção', minScore: 0, diasInativoMin: 0, status: 'rascunho',
      }]
      params.cadencias = [{
        id: 1, nome: 'Cadência 1', pausarAoResponder: false,
        steps: [
          { id: 1, canal: 'email', delayDias: 0, templateId: 1 },
          { id: 2, canal: 'whatsapp', delayDias: 3, templateId: 2 },
        ],
      }]
      const { result } = renderHook(() => useFunilActions(params))

      await act(async () => {
        await result.current.startCampanha(1)
      })

      // 1 cliente em prospecção × 2 steps = 2 jobs
      expect(db.insertJob).toHaveBeenCalledTimes(2)
      expect(db.updateCampanhaStatus).toHaveBeenCalledWith(1, 'ativa')
      expect(params.setCampanhas).toHaveBeenCalled()
      expect(params.addNotificacao).toHaveBeenCalledWith('success', expect.any(String), expect.any(String))
    })
  })
})
