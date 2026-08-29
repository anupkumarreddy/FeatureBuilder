import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useHistory } from './history'

describe('undo history', () => {
  it('starts with nothing to undo or redo', () => {
    const { result } = renderHook(() => useHistory({ count: 0 }))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('walks backwards and forwards through commits', () => {
    const { result } = renderHook(() => useHistory({ count: 0 }))
    act(() => result.current.commit((current) => ({ count: current.count + 1 })))
    act(() => result.current.commit((current) => ({ count: current.count + 1 })))
    expect(result.current.value.count).toBe(2)

    act(() => result.current.undo())
    expect(result.current.value.count).toBe(1)
    act(() => result.current.undo())
    expect(result.current.value.count).toBe(0)
    expect(result.current.canUndo).toBe(false)

    act(() => result.current.redo())
    expect(result.current.value.count).toBe(1)
  })

  it('collapses consecutive edits that share a coalesce key', () => {
    const { result } = renderHook(() => useHistory({ text: '' }))
    for (const letter of 'abc') {
      act(() => result.current.commit((current) => ({ text: current.text + letter }), { coalesce: 'text' }))
    }
    expect(result.current.value.text).toBe('abc')

    act(() => result.current.undo())
    expect(result.current.value.text).toBe('')
  })

  it('keeps separate coalesce keys as separate steps', () => {
    const { result } = renderHook(() => useHistory({ a: '', b: '' }))
    act(() => result.current.commit((current) => ({ ...current, a: 'x' }), { coalesce: 'a' }))
    act(() => result.current.commit((current) => ({ ...current, b: 'y' }), { coalesce: 'b' }))

    act(() => result.current.undo())
    expect(result.current.value).toEqual({ a: 'x', b: '' })
  })

  it('drops the redo stack once a new commit lands', () => {
    const { result } = renderHook(() => useHistory({ count: 0 }))
    act(() => result.current.commit(() => ({ count: 1 })))
    act(() => result.current.undo())
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.commit(() => ({ count: 9 })))
    expect(result.current.canRedo).toBe(false)
    expect(result.current.value.count).toBe(9)
  })

  it('clears history when a different project is loaded', () => {
    const { result } = renderHook(() => useHistory({ count: 0 }))
    act(() => result.current.commit(() => ({ count: 5 })))
    act(() => result.current.reset({ count: 100 }))

    expect(result.current.value.count).toBe(100)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('ignores an updater that changes nothing', () => {
    const { result } = renderHook(() => useHistory({ count: 0 }))
    act(() => result.current.commit((current) => current))
    expect(result.current.canUndo).toBe(false)
  })
})
