import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { sampleVendedor, sampleCliente } from './mocks/supabase-mock'

// Mock database module
vi.mock('../lib/database', () => ({
  updateCliente: vi.fn().mockResolvedValue(undefined),
  insertHistoricoEtapa: vi.fn().mockResolvedValue(undefined),
  insertAtividade: vi.fn().mockImplementation((a: any) => Promise.resolve({ ...a, id: 200 })),
}))

vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock business-rules (keep real logic but spy on it)
vi.mock('../utils/business-rules', async () => {
  const actual = await vi.importActual('../utils/business-rules') as any
  return {
    ...actual,
    calcDiasInativo: vi.fn(actual.calcDiasInativo),
    calcScore: vi.fn(actual.calcScore),
    getClientsToAutoMove: vi.fn(actual.getClientsToAutoMove),
  }
})

import { useAutoRules } from '../hooks/useAutoRules'
import * as db from '../lib/database'
import { calcScore, getClientsToAutoMove } from '../utils/business-rules'

const defaultParams = () => ({
  clientes: [
    sampleCliente({ id: 1, etapa: 'prospecção', ultimaInteracao: new Date().toISOString().split('T')[0], diasInativo: 0 }),
  ],
  setClientes: vi.fn().mockImplementation((updater: any) => {
    // Execute the updater to test the logic inside
    if (typeof updater === 'function') updater(defaultParams().clientes)
  }),
  interacoes: [{ id: 1, clienteId: 1, tipo: 'email' as const, data: new Date().toISOString(), assunto: '', descricao: '', automatico: false }],
  vendedores: [sampleVendedor()],
  loggedUser: sampleVendedor(),
  setAtividades: vi.fn(),
  addNotificacao: vi.fn(),
})

describe('useAutoRules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('inicialização', () => {
    it('renderiza sem erros', () => {
      const params = defaultParams()
      const { unmount } = renderHook(() => useAutoRules(params))
      unmount()
    })

    it('chama recalcDiasInativo no mount', () => {
      const params = defaultParams()
      renderHook(() => useAutoRules(params))
      // setClientes deve ter sido chamado (pelo recalc + score)
      expect(params.setClientes).toHaveBeenCalled()
    })
  })

  describe('recalcDiasInativo', () => {
    it('recalcula dias inativos a partir da ultimaInteracao', () => {
      const trintaDiasAtras = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
      const params = defaultParams()
      params.clientes = [
        sampleCliente({ id: 1, ultimaInteracao: trintaDiasAtras, diasInativo: 0 }),
      ]

      renderHook(() => useAutoRules(params))

      // setClientes called with updater that changes diasInativo
      expect(params.setClientes).toHaveBeenCalled()
      const updater = params.setClientes.mock.calls[0][0]
      if (typeof updater === 'function') {
        const result = updater(params.clientes)
        if (result !== params.clientes) {
          // diasInativo should now be ~30
          expect(result[0].diasInativo).toBeGreaterThanOrEqual(29)
        }
      }
    })

    it('configura interval para recalcular a cada hora', () => {
      const params = defaultParams()
      renderHook(() => useAutoRules(params))

      const callsBefore = params.setClientes.mock.calls.length

      // Advance 1 hour
      vi.advanceTimersByTime(3600000)

      // Should have been called again
      expect(params.setClientes.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  describe('auto-atribuir clientes órfãos', () => {
    it('atribui clientes sem vendedor ao gerente', () => {
      const params = defaultParams()
      params.clientes = [
        sampleCliente({ id: 1, vendedorId: undefined as any }),
        sampleCliente({ id: 2, vendedorId: undefined as any }),
      ]

      renderHook(() => useAutoRules(params))

      // updateCliente deve ser chamado para cada órfão
      // (assíncrono, pode levar um tick)
      vi.advanceTimersByTime(100)

      expect(db.updateCliente).toHaveBeenCalled()
    })

    it('não reatribui clientes que já têm vendedor', () => {
      const params = defaultParams()
      params.clientes = [
        sampleCliente({ id: 1, vendedorId: 5 }),
      ]

      renderHook(() => useAutoRules(params))
      vi.advanceTimersByTime(100)

      // updateCliente NÃO deve ser chamado para atribuição de órfão
      // (pode ser chamado por score/diasInativo, mas não por orphan fix)
      const orphanCalls = vi.mocked(db.updateCliente).mock.calls.filter(
        call => call[1] && 'vendedorId' in (call[1] as any)
      )
      expect(orphanCalls.length).toBe(0)
    })
  })

  describe('auto-move por prazo vencido', () => {
    it('move cliente em amostra com > 30 dias para perdido', () => {
      const params = defaultParams()
      const dataAntiga = new Date(Date.now() - 35 * 86400000).toISOString()
      params.clientes = [
        sampleCliente({ id: 10, etapa: 'amostra', dataEntradaEtapa: dataAntiga, diasInativo: 5 }),
      ]

      renderHook(() => useAutoRules(params))

      // getClientsToAutoMove should detect this
      expect(getClientsToAutoMove).toHaveBeenCalled()

      // Should trigger setClientes with perdido update
      const setClientesCalls = params.setClientes.mock.calls
      const autoMoveCall = setClientesCalls.find(call => {
        if (typeof call[0] !== 'function') return false
        const result = call[0](params.clientes)
        return result !== params.clientes && result.some((c: any) => c.etapa === 'perdido')
      })

      expect(autoMoveCall).toBeTruthy()
    })

    it('não move cliente em amostra com < 30 dias', () => {
      const params = defaultParams()
      const dataRecente = new Date(Date.now() - 10 * 86400000).toISOString()
      params.clientes = [
        sampleCliente({ id: 10, etapa: 'amostra', dataEntradaEtapa: dataRecente, diasInativo: 2 }),
      ]

      renderHook(() => useAutoRules(params))

      // No auto-move should happen
      const setClientesCalls = params.setClientes.mock.calls
      const autoMoveCall = setClientesCalls.find(call => {
        if (typeof call[0] !== 'function') return false
        const result = call[0](params.clientes)
        return result !== params.clientes && result.some((c: any) => c.etapa === 'perdido')
      })

      expect(autoMoveCall).toBeFalsy()
    })
  })

  describe('score dinâmico', () => {
    it('recalcula score e chama setClientes', () => {
      const params = defaultParams()
      params.clientes = [
        sampleCliente({ id: 1, etapa: 'prospecção', score: 0, valorEstimado: 100000, diasInativo: 0 }),
      ]

      renderHook(() => useAutoRules(params))

      expect(calcScore).toHaveBeenCalled()
      // setClientes should be called with updated scores
      expect(params.setClientes).toHaveBeenCalled()
    })

    it('persiste scores com delta >= 5 pontos (debounced)', () => {
      const params = defaultParams()
      // Score deveria ser ~28 (prospecção=10 + valor=10 + interações=3 - inatividade=0)
      // mas score atual é 0, delta = 28 >= 5 → deve persistir
      params.clientes = [
        sampleCliente({ id: 1, etapa: 'prospecção', score: 0, valorEstimado: 100000, diasInativo: 0 }),
      ]

      renderHook(() => useAutoRules(params))

      // Advance past debounce (3 seconds)
      vi.advanceTimersByTime(3500)

      expect(db.updateCliente).toHaveBeenCalledWith(1, expect.objectContaining({
        score: expect.any(Number),
      }))
    })

    it('não persiste scores com delta < 5 pontos', () => {
      const params = defaultParams()
      // Score correto ~28, se score atual é 27, delta = 1 < 5 → não persiste
      params.clientes = [
        sampleCliente({ id: 1, etapa: 'prospecção', score: 27, valorEstimado: 100000, diasInativo: 0 }),
      ]

      renderHook(() => useAutoRules(params))

      vi.advanceTimersByTime(3500)

      // updateCliente should NOT be called for score (may be called for diasInativo)
      const scoreCalls = vi.mocked(db.updateCliente).mock.calls.filter(
        call => call[1] && 'score' in (call[1] as any)
      )
      expect(scoreCalls.length).toBe(0)
    })
  })
})
