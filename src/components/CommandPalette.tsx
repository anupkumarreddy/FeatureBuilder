import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

export interface Command {
  id: string
  label: string
  hint?: string
  group: string
  run: () => void
}

interface Props {
  commands: Command[]
  onClose: () => void
}

/** IMP-01: the sidebar rendered a ⌘K badge that was wired to nothing. */
export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands.slice(0, 40)
    return commands
      .filter((command) => `${command.group} ${command.label} ${command.hint ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 40)
  }, [commands, query])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (matches.length === 0 ? 0 : (current + 1) % matches.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (matches.length === 0 ? 0 : (current - 1 + matches.length) % matches.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = matches[active]
      if (command) {
        onClose()
        command.run()
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="dialog-backdrop palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            placeholder="Search features and commands"
            aria-label="Search features and commands"
            aria-controls="palette-results"
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {matches.length === 0 && <p className="palette-empty">No matches for “{query}”.</p>}
          {matches.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === active}
              data-active={index === active}
              className={index === active ? 'active' : ''}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                onClose()
                command.run()
              }}
            >
              <span className="palette-group">{command.group}</span>
              <span className="palette-label">{command.label}</span>
              {command.hint && <span className="palette-hint">{command.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
