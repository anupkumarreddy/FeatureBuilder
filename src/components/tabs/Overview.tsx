import { BookOpen } from 'lucide-react'
import type { Feature } from '../../types'
import { Field, ListEditor } from './shared'

interface Props {
  feature: Feature
  features: Feature[]
  update: (patch: Partial<Feature>, coalesce?: string) => void
}

export function Overview({ feature, features, update }: Props) {
  const candidates = features.filter((item) => item.id !== feature.id)
  const toggleDependency = (id: string, on: boolean) =>
    update({ dependencies: on ? [...feature.dependencies, id] : feature.dependencies.filter((item) => item !== id) })

  return (
    <div className="panel-stack">
      <div className="section-intro">
        <div className="section-icon mint" aria-hidden="true">
          <BookOpen size={18} />
        </div>
        <div>
          <h2>Feature intent</h2>
          <p>Define why this feature exists and who is responsible for it.</p>
        </div>
      </div>

      <Field label="Description" hint="Required">
        <textarea
          rows={5}
          placeholder="Describe the user-visible or architectural outcome…"
          value={feature.description}
          onChange={(event) => update({ description: event.target.value }, `description:${feature.id}`)}
        />
      </Field>

      <div className="two-col">
        <Field label="Owner">
          <input
            placeholder="Assign an owner"
            value={feature.owner}
            onChange={(event) => update({ owner: event.target.value }, `owner:${feature.id}`)}
          />
        </Field>
        <Field label="Priority">
          <select value={feature.priority} onChange={(event) => update({ priority: event.target.value as Feature['priority'] })}>
            {['Critical', 'High', 'Medium', 'Low'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Tags" hint="Comma separated">
        <input
          placeholder="power, low-power, v1.0"
          value={feature.tags.join(', ')}
          onChange={(event) =>
            update({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }, `tags:${feature.id}`)
          }
        />
      </Field>

      <div className="section-divider" />

      {/* `dependencies` was stored and validated but had no editor at all. */}
      <div className="subheading">
        <div>
          <h3>Depends on</h3>
          <p>Features that must be specified before this one can be completed.</p>
        </div>
      </div>
      {candidates.length === 0 ? (
        <p className="muted-note">Add another feature to record a dependency.</p>
      ) : (
        <div className="chip-grid">
          {candidates.map((candidate) => {
            const active = feature.dependencies.includes(candidate.id)
            return (
              <label key={candidate.id} className={`link-chip ${active ? 'active' : ''}`}>
                <input type="checkbox" checked={active} onChange={(event) => toggleDependency(candidate.id, event.target.checked)} />
                {candidate.key} · {candidate.title}
              </label>
            )
          })}
        </div>
      )}

      <div className="section-divider" />

      <ListEditor
        key={feature.id}
        title="Open questions"
        subtitle="Capture decisions that still block specification approval."
        values={feature.openQuestions}
        placeholder="What needs to be resolved?"
        onChange={(openQuestions) => update({ openQuestions })}
      />
    </div>
  )
}
