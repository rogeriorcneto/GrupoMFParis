import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockSubscribe = vi.fn().mockReturnThis()
const mockUnsubscribe = vi.fn()
const mockOn = vi.fn().mockReturnThis()

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: mockOn,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
    })),
  },
}))

import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription'
import { supabase } from '../lib/supabase'

describe('useRealtimeSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-setup mocks after clear
    mockSubscribe.mockReturnThis()
    mockOn.mockReturnValue({ subscribe: mockSubscribe, unsubscribe: mockUnsubscribe, on: mockOn })
    ;(supabase.channel as any).mockReturnValue({
      on: mockOn,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
    })
  })

  it('subscribe ao montar com enabled=true', () => {
    const onEvent = vi.fn()
    renderHook(() => useRealtimeSubscription('clientes', onEvent, true))
    expect(supabase.channel).toHaveBeenCalledWith('realtime-clientes')
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: '*', schema: 'public', table: 'clientes' }),
      expect.any(Function)
    )
    expect(mockSubscribe).toHaveBeenCalled()
  })

  it('não subscribe com enabled=false', () => {
    const onEvent = vi.fn()
    renderHook(() => useRealtimeSubscription('clientes', onEvent, false))
    expect(supabase.channel).not.toHaveBeenCalled()
  })

  it('unsubscribe no unmount', () => {
    const onEvent = vi.fn()
    const { unmount } = renderHook(() => useRealtimeSubscription('clientes', onEvent, true))
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('chama onEvent com payload correto via callback', () => {
    const onEvent = vi.fn()
    renderHook(() => useRealtimeSubscription('clientes', onEvent, true))
    // Get the callback passed to .on()
    const callback = mockOn.mock.calls[0][2]
    // Simulate a postgres_changes event
    callback({
      eventType: 'INSERT',
      new: { id: 1, razao_social: 'Test' },
      old: {},
    })
    expect(onEvent).toHaveBeenCalledWith({
      eventType: 'INSERT',
      new: { id: 1, razao_social: 'Test' },
      old: {},
    })
  })

  it('re-subscribe quando table muda', () => {
    const onEvent = vi.fn()
    const { rerender } = renderHook(
      ({ table }) => useRealtimeSubscription(table, onEvent, true),
      { initialProps: { table: 'clientes' } }
    )
    expect(supabase.channel).toHaveBeenCalledWith('realtime-clientes')
    rerender({ table: 'tarefas' })
    expect(mockUnsubscribe).toHaveBeenCalled()
    expect(supabase.channel).toHaveBeenCalledWith('realtime-tarefas')
  })
})
