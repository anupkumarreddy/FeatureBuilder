import { useState } from 'react'
import { Plus, X } from 'lucide-react'

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode
  title: string
  text: string
  action: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

interface ListEditorProps {
  title: string
  subtitle: string
  values: string[]
  placeholder: string
  onChange: (values: string[]) => void
}

/**
 * BUG-15: rows were keyed by array index with autoFocus on every empty input,
 * so deleting an entry moved text between reused DOM nodes and stole focus.
 * Rows now carry their own identity, created and removed alongside the values
 * they belong to. Parents pass key={feature.id} so switching feature remounts.
 */
export function ListEditor({ title, subtitle, values, placeholder, onChange }: ListEditorProps) {
  const [rowKeys, setRowKeys] = useState<number[]>(() => values.map((_, index) => index))
  const [nextKey, setNextKey] = useState(values.length)
  const [focusKey, setFocusKey] = useState<number | null>(null)

  // If the value list changed underneath us (undo, for instance) the tracked
  // identities no longer line up; fall back to positional keys for this render.
  const keys = rowKeys.length === values.length ? rowKeys : values.map((_, index) => index)

  const add = () => {
    setRowKeys([...keys, nextKey])
    setFocusKey(nextKey)
    setNextKey(nextKey + 1)
    onChange([...values, ''])
  }

  const remove = (index: number) => {
    setRowKeys(keys.filter((_, position) => position !== index))
    onChange(values.filter((_, position) => position !== index))
  }

  return (
    <div>
      <div className="subheading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <button className="secondary-button" type="button" onClick={add}>
          <Plus size={15} aria-hidden="true" />
          Add
        </button>
      </div>
      <div className="simple-list">
        {values.map((value, index) => (
          <div key={keys[index]}>
            <span aria-hidden="true">{index + 1}</span>
            <input
              autoFocus={keys[index] === focusKey}
              placeholder={placeholder}
              aria-label={`${title} ${index + 1}`}
              value={value}
              onChange={(event) => onChange(values.map((item, position) => (position === index ? event.target.value : item)))}
            />
            <button type="button" aria-label={`Remove ${title} ${index + 1}`} onClick={() => remove(index)}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
