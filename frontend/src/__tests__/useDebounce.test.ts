import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '../hooks/useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna valor inicial imediatamente', () => {
    const { result } = renderHook(() => useDebounce('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('atualiza valor após delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    )
    expect(result.current).toBe('a')

    rerender({ value: 'b', delay: 300 })
    // Before delay, still old value
    expect(result.current).toBe('a')

    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('b')
  })

  it('reseta timer em mudança rápida (só último valor)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(100) })
    rerender({ value: 'c' })
    act(() => { vi.advanceTimersByTime(100) })
    rerender({ value: 'd' })

    // Still 'a' because no full 300ms elapsed
    expect(result.current).toBe('a')

    act(() => { vi.advanceTimersByTime(300) })
    // Only final value 'd'
    expect(result.current).toBe('d')
  })

  it('usa delay padrão de 300ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'x' } }
    )

    rerender({ value: 'y' })
    act(() => { vi.advanceTimersByTime(299) })
    expect(result.current).toBe('x')

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('y')
  })
})
