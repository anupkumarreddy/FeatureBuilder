import { useEffect, useRef, useState } from 'react'
import type { Project } from '../types'

const MIRROR_KEY = 'featurebuilder-project'
const MIRROR_DEBOUNCE = 400
const AUTOSAVE_DEBOUNCE = 900

/**
 * BUG-08: the mirror was written synchronously on every keystroke with no
 * try/catch. The store allows 100 MB projects; browser storage caps near 5 MB,
 * so a large project threw QuotaExceededError from inside an effect.
 */
export function useLocalMirror(project: Project, enabled: boolean) {
  const [mirrorFailed, setMirrorFailed] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(MIRROR_KEY, JSON.stringify(project))
        setMirrorFailed(false)
      } catch {
        setMirrorFailed(true)
      }
    }, MIRROR_DEBOUNCE)
    return () => window.clearTimeout(timer)
  }, [project, enabled])

  return mirrorFailed
}

export function readLocalMirror(): unknown {
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLocalMirror() {
  try {
    window.localStorage.removeItem(MIRROR_KEY)
  } catch {
    // nothing to do
  }
}

interface AutosaveOptions {
  project: Project
  projectPath: string | null
  dirty: boolean
  onSaved: () => void
  onError: (message: string) => void
}

/**
 * BUG-04: a save that resolved after further edits cleared the dirty flag, so
 * the header read "Saved" while newer edits were still only in memory.
 * BUG-05: failures were swallowed entirely.
 *
 * Every write carries the generation it was started for; the flag is only
 * cleared when that generation is still the current one.
 */
export function useAutosave({ project, projectPath, dirty, onSaved, onError }: AutosaveOptions) {
  const generation = useRef(0)
  const inFlight = useRef(false)
  const callbacks = useRef({ onSaved, onError })
  useEffect(() => {
    callbacks.current = { onSaved, onError }
  })

  // Every observed change advances the generation.
  useEffect(() => {
    generation.current += 1
  }, [project])

  useEffect(() => {
    const api = window.featureBuilder
    if (!dirty || !projectPath || !api) return

    const timer = window.setTimeout(async () => {
      if (inFlight.current) return
      const startedAt = generation.current
      const snapshot = project
      inFlight.current = true
      try {
        const result = await api.saveProject(snapshot, projectPath)
        if (result?.error) {
          callbacks.current.onError(result.error)
          return
        }
        // Only trust this result if nothing changed while it was in flight.
        if (result?.ok && startedAt === generation.current) callbacks.current.onSaved()
      } catch (error) {
        callbacks.current.onError(error instanceof Error ? error.message : 'Autosave failed.')
      } finally {
        inFlight.current = false
      }
    }, AUTOSAVE_DEBOUNCE)

    return () => window.clearTimeout(timer)
  }, [project, projectPath, dirty])
}

/** IMP-03: keep the OS close button from discarding unsaved work. */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    window.featureBuilder?.setUnsavedChanges(dirty)
  }, [dirty])

  useEffect(() => {
    if (!dirty || window.featureBuilder) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
