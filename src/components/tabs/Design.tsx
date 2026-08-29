import { Settings2 } from 'lucide-react'
import type { Feature } from '../../types'
import { Field } from './shared'

interface Props {
  feature: Feature
  update: (patch: Partial<Feature>, coalesce?: string) => void
}

const FIELDS: { key: keyof Feature['design']; label: string; hint?: string; rows: number; placeholder?: string }[] = [
  { key: 'architecture', label: 'Architecture', rows: 4, placeholder: 'Blocks, responsibilities, and data flow…' },
  { key: 'interfaces', label: 'Interfaces and signals', rows: 4, placeholder: 'Ports, protocols, registers, and configuration…' },
  { key: 'behavior', label: 'Expected behavior', hint: 'Required', rows: 5, placeholder: 'State transitions, ordering, and observable behavior…' },
]

export function Design({ feature, update }: Props) {
  const change = (key: keyof Feature['design'], value: string) =>
    update({ design: { ...feature.design, [key]: value } }, `design:${key}:${feature.id}`)

  return (
    <div className="panel-stack">
      <div className="section-intro">
        <div className="section-icon amber" aria-hidden="true">
          <Settings2 size={18} />
        </div>
        <div>
          <h2>Design specification</h2>
          <p>Describe the implementation contract without tying it to DV execution.</p>
        </div>
      </div>

      {FIELDS.map((field) => (
        <Field key={field.key} label={field.label} hint={field.hint}>
          <textarea
            rows={field.rows}
            placeholder={field.placeholder}
            value={feature.design[field.key]}
            onChange={(event) => change(field.key, event.target.value)}
          />
        </Field>
      ))}

      <div className="two-col">
        <Field label="Reset and error behavior">
          <textarea rows={5} value={feature.design.resetAndErrors} onChange={(event) => change('resetAndErrors', event.target.value)} />
        </Field>
        <Field label="Performance constraints">
          <textarea rows={5} value={feature.design.performance} onChange={(event) => change('performance', event.target.value)} />
        </Field>
      </div>
    </div>
  )
}
