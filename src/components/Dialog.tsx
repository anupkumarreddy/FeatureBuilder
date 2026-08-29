import { useEffect, useId, useRef, useState } from 'react'

export interface PromptRequest {
  kind: 'prompt'
  title: string
  label: string
  initialValue: string
  confirmLabel?: string
  placeholder?: string
  validate?: (value: string) => string | null
}

export interface ConfirmRequest {
  kind: 'confirm'
  title: string
  body: string
  confirmLabel?: string
  destructive?: boolean
}

export interface AlertRequest {
  kind: 'alert'
  title: string
  body: string
}

export type DialogRequest = PromptRequest | ConfirmRequest | AlertRequest

interface Props {
  request: DialogRequest
  onResolve: (value: string | boolean | null) => void
}

/**
 * BUG-01: the project name was edited through window.prompt(), which Electron
 * does not implement — it throws "prompt() is not supported.", so renaming a
 * project was impossible in the packaged app. Everything modal now runs
 * in-window instead of relying on the host dialogs.
 */
export function Dialog({ request, onResolve }: Props) {
  const [value, setValue] = useState(request.kind === 'prompt' ? request.initialValue : '')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    const target = request.kind === 'prompt' ? inputRef.current : confirmRef.current
    target?.focus()
    if (request.kind === 'prompt') inputRef.current?.select()
  }, [request])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onResolve(request.kind === 'prompt' ? null : false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [request, onResolve])

  const submit = () => {
    if (request.kind !== 'prompt') return onResolve(true)
    const trimmed = value.trim()
    const problem = request.validate?.(trimmed) ?? null
    if (problem) return setError(problem)
    onResolve(trimmed)
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onResolve(request.kind === 'prompt' ? null : false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{request.title}</h2>

        {request.kind === 'prompt' ? (
          <label className="field">
            <span className="field-label">{request.label}</span>
            <input
              ref={inputRef}
              value={value}
              placeholder={request.placeholder}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setValue(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
            />
            {error && <small className="dialog-error">{error}</small>}
          </label>
        ) : (
          <p>{request.kind === 'confirm' ? request.body : request.body}</p>
        )}

        <div className="dialog-actions">
          {request.kind !== 'alert' && (
            <button type="button" onClick={() => onResolve(request.kind === 'prompt' ? null : false)}>
              Cancel
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`primary-button ${request.kind === 'confirm' && request.destructive ? 'destructive' : ''}`}
            onClick={submit}
          >
            {request.kind === 'alert' ? 'Close' : (request.confirmLabel ?? (request.kind === 'prompt' ? 'Save' : 'Confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}
