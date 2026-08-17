import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useDebouncedCommit } from './use-debounced-commit'

describe('useDebouncedCommit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initial local value equals externalValue', () => {
    const { result } = renderHook(() => useDebouncedCommit('hello', vi.fn()))
    expect(result.current[0]).toBe('hello')
  })

  it('setValue updates the local value immediately and onChange is not called before the delay', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useDebouncedCommit('a', onChange))

    act(() => {
      result.current[1]('b')
    })
    expect(result.current[0]).toBe('b')
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('rapid successive setValue calls fire exactly one onChange with the last value after the delay', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useDebouncedCommit('a', onChange))

    act(() => {
      result.current[1]('b')
      result.current[1]('c')
      result.current[1]('d')
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('d')
  })

  it('commitNow fires onChange immediately with the local value and cancels the pending timer', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useDebouncedCommit('a', onChange))

    act(() => {
      result.current[1]('b')
    })
    act(() => {
      result.current[2]()
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('b')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('syncs the local value when externalValue changes while idle', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedCommit(value, onChange),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'b' })
    expect(result.current[0]).toBe('b')
  })

  it('does not apply an externalValue change while a local edit is pending, and the pending commit still fires with the typed value', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedCommit(value, onChange),
      { initialProps: { value: 'a' } }
    )

    act(() => {
      result.current[1]('typed')
    })
    rerender({ value: 'external' })
    expect(result.current[0]).toBe('typed')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('typed')
  })

  it('fires no onChange after unmount with a pending timer', () => {
    const onChange = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCommit('a', onChange))

    act(() => {
      result.current[1]('b')
    })
    unmount()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('honors the delayMs prop', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useDebouncedCommit('a', onChange, 500))

    act(() => {
      result.current[1]('b')
    })
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
