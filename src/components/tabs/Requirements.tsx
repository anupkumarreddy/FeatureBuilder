import { CircleDot, ClipboardCheck, Plus, Trash2 } from 'lucide-react'
import type { Feature, Requirement } from '../../types'
import { renameRequirement } from '../../model'
import { EmptyState } from './shared'

interface Props {
  feature: Feature
  update: (patch: Partial<Feature>, coalesce?: string) => void
  replace: (next: Feature) => void
}

export function Requirements({ feature, update, replace }: Props) {
  const add = () =>
    update({
      requirements: [
        ...feature.requirements,
        {
          id: `REQ-${feature.key}-${String(feature.requirements.length + 1).padStart(2, '0')}`,
          title: 'New requirement',
          description: '',
          type: 'Functional',
          status: 'Draft',
        },
      ],
    })

  const change = (index: number, patch: Partial<Requirement>, coalesce?: string) =>
    update(
      { requirements: feature.requirements.map((item, position) => (position === index ? { ...item, ...patch } : item)) },
      coalesce,
    )

  const duplicateIds = new Set(
    feature.requirements.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index),
  )

  return (
    <div className="panel-stack">
      <div className="section-intro with-action">
        <div className="section-icon blue" aria-hidden="true">
          <CircleDot size={18} />
        </div>
        <div>
          <h2>Requirements</h2>
          <p>Write atomic, testable statements with stable identifiers.</p>
        </div>
        <button className="secondary-button" type="button" onClick={add}>
          <Plus size={15} aria-hidden="true" />
          Add requirement
        </button>
      </div>

      {feature.requirements.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={25} />}
          title="No requirements yet"
          text="Add the first testable requirement for this feature."
          action={
            <button className="primary-button" type="button" onClick={add}>
              <Plus size={15} aria-hidden="true" />
              Add requirement
            </button>
          }
        />
      ) : (
        <div className="card-list">
          {feature.requirements.map((requirement, index) => {
            const linkCount = feature.verification.scenarios.filter((scenario) =>
              scenario.linkedRequirements.includes(requirement.id),
            ).length
            return (
              <article className="item-card" key={index}>
                <div className="item-card-top">
                  <input
                    className={`id-input ${duplicateIds.has(requirement.id) ? 'invalid' : ''}`}
                    value={requirement.id}
                    aria-label={`Requirement ${index + 1} identifier`}
                    // BUG-13: renaming used to orphan every scenario link that
                    // pointed at the old identifier.
                    onChange={(event) => replace(renameRequirement(feature, index, event.target.value))}
                  />
                  <select
                    aria-label={`Requirement ${index + 1} type`}
                    value={requirement.type}
                    onChange={(event) => change(index, { type: event.target.value as Requirement['type'] })}
                  >
                    {['Functional', 'Performance', 'Safety', 'Interface'].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Requirement ${index + 1} status`}
                    value={requirement.status}
                    onChange={(event) => change(index, { status: event.target.value as Requirement['status'] })}
                  >
                    <option>Draft</option>
                    <option>Approved</option>
                  </select>
                  <span className={`coverage-pill ${linkCount ? 'covered' : 'gap'}`}>{linkCount ? `${linkCount} linked` : 'Gap'}</span>
                  <button
                    className="danger-ghost"
                    type="button"
                    aria-label={`Delete requirement ${requirement.id}`}
                    onClick={() => update({ requirements: feature.requirements.filter((_, position) => position !== index) })}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                {duplicateIds.has(requirement.id) && <p className="inline-error">This identifier is used by another requirement.</p>}
                <input
                  className="card-title-input"
                  aria-label={`Requirement ${index + 1} title`}
                  value={requirement.title}
                  onChange={(event) => change(index, { title: event.target.value }, `req-title:${feature.id}:${index}`)}
                />
                <textarea
                  rows={3}
                  placeholder="The system shall…"
                  aria-label={`Requirement ${index + 1} description`}
                  value={requirement.description}
                  onChange={(event) => change(index, { description: event.target.value }, `req-body:${feature.id}:${index}`)}
                />
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
