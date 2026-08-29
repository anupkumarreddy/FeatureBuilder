import { useCallback, useMemo, useRef, useState } from 'react'

const LIMIT = 100

interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

export interface CommitOptions {
  /**
   * Consecutive commits sharing a coalesce key collapse into one undo step, so
   * typing a sentence is a single undo rather than one per keystroke.
   */
  coalesce?: string
}

/** IMP-08: the app had no undo, and delete removed an entire subtree. */
export function useHistory<T>(initial: T | (() => T)) {
  const [state, setState] = useState<HistoryState<T>>(() => ({
    past: [],
    present: typeof initial === 'function' ? (initial as () => T)() : initial,
    future: [],
  }))
  const lastCoalesceKey = useRef<string | null>(null)

  const commit = useCallback((updater: (current: T) => T, options: CommitOptions = {}) => {
    const { coalesce } = options
    setState((current) => {
      const next = updater(current.present)
      if (next === current.present) return current
      const merge = coalesce !== undefined && coalesce === lastCoalesceKey.current && current.past.length > 0
      lastCoalesceKey.current = coalesce ?? null
      const past = merge ? current.past : [...current.past, current.present].slice(-LIMIT)
      return { past, present: next, future: [] }
    })
  }, [])

  /** Replace the value outright and clear history (opening a different project). */
  const reset = useCallback((value: T) => {
    lastCoalesceKey.current = null
    setState({ past: [], present: value, future: [] })
  }, [])

  const undo = useCallback(() => {
    lastCoalesceKey.current = null
    setState((current) => {
      if (current.past.length === 0) return current
      const previous = current.past[current.past.length - 1]
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, LIMIT),
      }
    })
  }, [])

  const redo = useCallback(() => {
    lastCoalesceKey.current = null
    setState((current) => {
      if (current.future.length === 0) return current
      return {
        past: [...current.past, current.present].slice(-LIMIT),
        present: current.future[0],
        future: current.future.slice(1),
      }
    })
  }, [])

  return useMemo(
    () => ({
      value: state.present,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      commit,
      redo,
      reset,
      undo,
    }),
    [state.present, state.past.length, state.future.length, commit, redo, reset, undo],
  )
}
