import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutosave, useLocalMirror } from './hooks/useProjectPersistence'
import { sampleProject } from './sample'
import type { DesktopApi, Project } from './types'

const project = (name: string): Project => ({ ...sampleProject, name })

function stubDesktop(saveProject: DesktopApi['saveProject']) {
  const api = { saveProject } as unknown as DesktopApi
  window.featureBuilder = api
  return api
}

afterEach(() => {
  delete window.featureBuilder
  vi.useRealTimers()
})

describe('autosave', () => {
  /**
   * BUG-04: a write that resolved after further edits cleared the dirty flag,
   * so the header read "Saved" while newer edits were still only in memory.
   */
  it('does not report saved when the project changed while the write was in flight', async () => {
    let release: (() => void) | null = null
    const saveProject = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          release = () => resolve({ ok: true })
        }),
    )
    stubDesktop(saveProject as unknown as DesktopApi['saveProject'])

    const onSaved = vi.fn()
    const onError = vi.fn()
    const { rerender } = renderHook(
      ({ value }: { value: Project }) =>
        useAutosave({ project: value, projectPath: '/tmp/p', dirty: true, onSaved, onError }),
      { initialProps: { value: project('first') } },
    )

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1))

    // The user keeps typing before the write comes back.
    rerender({ value: project('second') })
    await act(async () => {
      release?.()
      await Promise.resolve()
    })

    expect(onSaved).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports saved when nothing changed during the write', async () => {
    stubDesktop(vi.fn(async () => ({ ok: true })) as unknown as DesktopApi['saveProject'])
    const onSaved = vi.fn()

    renderHook(() => useAutosave({ project: project('only'), projectPath: '/tmp/p', dirty: true, onSaved, onError: vi.fn() }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })

  // BUG-05: failures were swallowed with no else branch.
  it('surfaces a write failure instead of swallowing it', async () => {
    stubDesktop(vi.fn(async () => ({ error: 'the disk is full.' })) as unknown as DesktopApi['saveProject'])
    const onError = vi.fn()
    const onSaved = vi.fn()

    renderHook(() => useAutosave({ project: project('x'), projectPath: '/tmp/p', dirty: true, onSaved, onError }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('the disk is full.'))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('surfaces a rejected write', async () => {
    stubDesktop(vi.fn(async () => {
      throw new Error('EACCES')
    }) as unknown as DesktopApi['saveProject'])
    const onError = vi.fn()

    renderHook(() => useAutosave({ project: project('x'), projectPath: '/tmp/p', dirty: true, onSaved: vi.fn(), onError }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('EACCES'))
  })

  it('does nothing without a project path or when clean', async () => {
    const saveProject = vi.fn(async () => ({ ok: true }))
    stubDesktop(saveProject as unknown as DesktopApi['saveProject'])

    renderHook(() => useAutosave({ project: project('a'), projectPath: null, dirty: true, onSaved: vi.fn(), onError: vi.fn() }))
    renderHook(() => useAutosave({ project: project('b'), projectPath: '/tmp/p', dirty: false, onSaved: vi.fn(), onError: vi.fn() }))

    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(saveProject).not.toHaveBeenCalled()
  })
})

describe('local mirror', () => {
  /** BUG-08: the write was synchronous, unguarded, and ran on every keystroke. */
  it('reports failure instead of throwing when storage rejects the write', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    const { result } = renderHook(() => useLocalMirror(project('big'), true))
    await waitFor(() => expect(result.current).toBe(true))
    setItem.mockRestore()
  })

  it('writes the project when storage accepts it', async () => {
    renderHook(() => useLocalMirror(project('fits'), true))
    await waitFor(() => {
      const stored = window.localStorage.getItem('featurebuilder-project')
      expect(stored && JSON.parse(stored).name).toBe('fits')
    })
  })
})
