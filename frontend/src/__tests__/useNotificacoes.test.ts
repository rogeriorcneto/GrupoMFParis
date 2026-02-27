import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { sampleVendedor, sampleCliente, sampleTarefa } from './mocks/supabase-mock'

// Mock database module
vi.mock('../lib/database', () => ({
  insertNotificacao: vi.fn().mockImplementation((n: any) => Promise.resolve({
    ...n, id: Date.now(), lida: false, timestamp: new Date().toISOString(),
  })),
  markNotificacaoLida: vi.fn().mockResolvedValue(undefined),
  markAllNotificacoesLidas: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { useNotificacoes } from '../hooks/useNotificacoes'
import * as db from '../lib/database'

describe('useNotificacoes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const vendedores = [sampleVendedor()]
  const tarefas = [sampleTarefa()]

  describe('estado inicial', () => {
    it('inicia com array vazio sem dados iniciais', () => {
      const { result } = renderHook(() => useNotificacoes([], [], []))
      expect(result.current.notificacoes).toEqual([])
    })

    it('carrega notificações iniciais do DB', () => {
      const initial = [
        { id: 1, tipo: 'info' as const, titulo: 'Teste', mensagem: 'Msg', lida: false, timestamp: '2025-01-01' },
      ]
      const { result } = renderHook(() => useNotificacoes([], [], [], initial))
      expect(result.current.notificacoes.length).toBeGreaterThanOrEqual(1)
      expect(result.current.notificacoes.find(n => n.id === 1)).toBeTruthy()
    })
  })

  describe('auto-geração de notificações', () => {
    it('gera notificação para cliente inativo > 10 dias', () => {
      const clientes = [sampleCliente({ diasInativo: 15, razaoSocial: 'Empresa Inativa' })]
      const { result } = renderHook(() => useNotificacoes(clientes, tarefas, vendedores))

      const inativoNotif = result.current.notificacoes.find(n =>
        n.titulo === 'Cliente inativo' && n.mensagem.includes('Empresa Inativa')
      )
      expect(inativoNotif).toBeTruthy()
      expect(inativoNotif?.tipo).toBe('warning')
    })

    it('gera notificação de prazo vencido para amostra >= 30 dias', () => {
      const dataEntrada = new Date(Date.now() - 35 * 86400000).toISOString()
      const clientes = [sampleCliente({
        etapa: 'amostra',
        dataEntradaEtapa: dataEntrada,
        razaoSocial: 'Empresa Amostra',
        diasInativo: 5,
      })]
      const { result } = renderHook(() => useNotificacoes(clientes, tarefas, vendedores))

      const prazoNotif = result.current.notificacoes.find(n =>
        n.titulo.includes('Prazo vencido') && n.mensagem.includes('Empresa Amostra')
      )
      expect(prazoNotif).toBeTruthy()
      expect(prazoNotif?.tipo).toBe('error')
    })

    it('gera warning para amostra >= 25 dias mas < 30', () => {
      const dataEntrada = new Date(Date.now() - 27 * 86400000).toISOString()
      const clientes = [sampleCliente({
        etapa: 'amostra',
        dataEntradaEtapa: dataEntrada,
        razaoSocial: 'Empresa Quase',
        diasInativo: 3,
      })]
      const { result } = renderHook(() => useNotificacoes(clientes, tarefas, vendedores))

      const prazoNotif = result.current.notificacoes.find(n =>
        n.titulo.includes('Prazo vencendo') && n.mensagem.includes('Empresa Quase')
      )
      expect(prazoNotif).toBeTruthy()
      expect(prazoNotif?.tipo).toBe('warning')
    })

    it('gera notificação de meta em risco quando vendedor < 50%', () => {
      const vendedor = sampleVendedor({ metaVendas: 1000000, nome: 'Vendedor Fraco' })
      // Cliente com valor baixo = pipeline abaixo de 50% da meta
      const clientes = [sampleCliente({ vendedorId: vendedor.id, valorEstimado: 100000, diasInativo: 0 })]
      const { result } = renderHook(() => useNotificacoes(clientes, tarefas, [vendedor]))

      const metaNotif = result.current.notificacoes.find(n =>
        n.titulo === 'Meta em risco' && n.mensagem.includes('Vendedor Fraco')
      )
      expect(metaNotif).toBeTruthy()
      expect(metaNotif?.tipo).toBe('error')
    })

    it('limita a 50 notificações', () => {
      // Criar muitos clientes inativos para gerar muitas notificações
      const clientes = Array.from({ length: 60 }, (_, i) =>
        sampleCliente({ id: i + 1, diasInativo: 15 + i, razaoSocial: `Empresa ${i}` })
      )
      const { result } = renderHook(() => useNotificacoes(clientes, tarefas, vendedores))
      expect(result.current.notificacoes.length).toBeLessThanOrEqual(50)
    })
  })

  describe('addNotificacao', () => {
    it('adiciona notificação e persiste no DB', async () => {
      const { result } = renderHook(() => useNotificacoes([], [], []))

      await act(async () => {
        await result.current.addNotificacao('success', 'Teste', 'Mensagem de teste')
      })

      expect(result.current.notificacoes.find(n => n.titulo === 'Teste')).toBeTruthy()
      expect(db.insertNotificacao).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'success',
        titulo: 'Teste',
        mensagem: 'Mensagem de teste',
      }))
    })

    it('auto-dismiss após 5 segundos', async () => {
      const { result } = renderHook(() => useNotificacoes([], [], []))

      await act(async () => {
        await result.current.addNotificacao('info', 'Auto Dismiss', 'Vai sumir')
      })

      // Find by titulo — id may have been replaced by DB mock
      const notifBefore = result.current.notificacoes.find(n => n.titulo === 'Auto Dismiss')
      expect(notifBefore).toBeTruthy()
      expect(notifBefore!.lida).toBe(false)

      // Advance 5 seconds — auto-dismiss fires
      act(() => { vi.advanceTimersByTime(5100) })

      const notifAfter = result.current.notificacoes.find(n => n.titulo === 'Auto Dismiss')
      expect(notifAfter).toBeTruthy()
      expect(notifAfter!.lida).toBe(true)
    })

    it('inclui clienteId quando fornecido', async () => {
      const { result } = renderHook(() => useNotificacoes([], [], []))

      await act(async () => {
        await result.current.addNotificacao('warning', 'Cliente', 'Alerta', 42)
      })

      expect(db.insertNotificacao).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 42,
      }))
    })
  })

  describe('markRead', () => {
    it('marca notificação como lida localmente', async () => {
      const initial = [
        { id: 10, tipo: 'info' as const, titulo: 'Não lida', mensagem: 'msg', lida: false, timestamp: '2025-01-01' },
      ]
      const { result } = renderHook(() => useNotificacoes([], [], [], initial))

      await act(async () => {
        await result.current.markRead(10)
      })

      const notif = result.current.notificacoes.find(n => n.id === 10)
      expect(notif?.lida).toBe(true)
      expect(db.markNotificacaoLida).toHaveBeenCalledWith(10)
    })

    it('não chama DB para IDs negativos (auto-gerados)', async () => {
      const { result } = renderHook(() =>
        useNotificacoes([sampleCliente({ diasInativo: 20 })], [], [sampleVendedor()])
      )

      const autoNotif = result.current.notificacoes.find(n => n.id < 0)
      if (autoNotif) {
        await act(async () => {
          await result.current.markRead(autoNotif.id)
        })
        expect(db.markNotificacaoLida).not.toHaveBeenCalled()
      }
    })
  })

  describe('markAllRead', () => {
    it('marca todas como lidas', async () => {
      const initial = [
        { id: 1, tipo: 'info' as const, titulo: 'A', mensagem: 'a', lida: false, timestamp: '2025-01-01' },
        { id: 2, tipo: 'warning' as const, titulo: 'B', mensagem: 'b', lida: false, timestamp: '2025-01-01' },
      ]
      const { result } = renderHook(() => useNotificacoes([], [], [], initial))

      await act(async () => {
        await result.current.markAllRead()
      })

      expect(result.current.notificacoes.every(n => n.lida)).toBe(true)
      expect(db.markAllNotificacoesLidas).toHaveBeenCalledTimes(1)
    })
  })
})
