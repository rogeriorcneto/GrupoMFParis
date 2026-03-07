import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

describe('useNetworkStatus', () => {
  it('retorna true (online) por padrão', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current).toBe(true)
  })

  it('retorna false quando offline event é disparado', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    const { result } = renderHook(() => useNetworkStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toBe(false)
  })

  it('retorna true quando online event é disparado após offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    const { result } = renderHook(() => useNetworkStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toBe(false)
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(result.current).toBe(true)
  })

  it('cleanup remove event listeners no unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useNetworkStatus())
    unmount()
    const removedEvents = removeSpy.mock.calls.map(c => c[0])
    expect(removedEvents).toContain('online')
    expect(removedEvents).toContain('offline')
    removeSpy.mockRestore()
  })
})
