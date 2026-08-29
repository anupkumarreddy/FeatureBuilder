import { Link2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { Feature, VerificationScenario } from '../../types'
import { Field } from './shared'

interface Props {
  feature: Feature
  update: (patch: Partial<Feature>, coalesce?: string) => void
}

export function Verification({ feature, update }: Props) {
  const change = (key: keyof Omit<Feature['verification'], 'scenarios'>, value: string) =>
    update({ verification: { ...feature.verification, [key]: value } }, `dv:${key}:${feature.id}`)

  const add = () =>
    update({
      verification: {
        ...feature.verification,
        scenarios: [
          ...feature.verification.scenarios,
          {
            id: `SCN-${feature.key}-${String(feature.verification.scenarios.length + 1).padStart(2, '0')}`,
            title: 'New verification scenario',
            description: '',
            method: 'Simulation',
            linkedRequirements: [],
          },
        ],
      },
    })

  const patchScenario = (index: number, patch: Partial<VerificationScenario>, coalesce?: string) =>
    update(
      {
        verification: {
          ...feature.verification,
          scenarios: feature.verification.scenarios.map((item, position) => (position === index ? { ...item, ...patch } : item)),
        },
      },
      coalesce,
    )

  const removeScenario = (index: number) =>
    update({
      verification: { ...feature.verification, scenarios: feature.verification.scenarios.filter((_, position) => position !== index) },
    })

  return (
    <div className="panel-stack">
      <div className="section-intro">
        <div className="section-icon violet" aria-hidden="true">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h2>DV plan</h2>
          <p>Define how the requirements will be proven and measured.</p>
        </div>
      </div>

      <Field label="Verification strategy" hint="Required">
        <textarea
          rows={5}
          placeholder="Describe environments, methods, stimulus, and checking…"
          value={feature.verification.strategy}
          onChange={(event) => change('strategy', event.target.value)}
        />
      </Field>

      <div className="two-col">
        <Field label="Assertions and checkers">
          <textarea rows={4} value={feature.verification.assertions} onChange={(event) => change('assertions', event.target.value)} />
        </Field>
        <Field label="Functional coverage">
          <textarea rows={4} value={feature.verification.coverage} onChange={(event) => change('coverage', event.target.value)} />
        </Field>
      </div>

      <Field label="Exclusions">
        <textarea
          rows={3}
          placeholder="What is intentionally verified elsewhere?"
          value={feature.verification.exclusions}
          onChange={(event) => change('exclusions', event.target.value)}
        />
      </Field>

      <div className="subheading">
        <div>
          <h3>Verification scenarios</h3>
          <p>Link every scenario to the requirements it proves.</p>
        </div>
        <button className="secondary-button" type="button" onClick={add}>
          <Plus size={15} aria-hidden="true" />
          Add scenario
        </button>
      </div>

      {feature.verification.scenarios.length === 0 && (
        <p className="muted-note">No scenarios yet. Requirements stay uncovered until at least one scenario verifies them.</p>
      )}

      {feature.verification.scenarios.map((scenario, index) => (
        <article className="item-card scenario-card" key={index}>
          <div className="item-card-top">
            <input
              className="id-input"
              aria-label={`Scenario ${index + 1} identifier`}
              value={scenario.id}
              onChange={(event) => patchScenario(index, { id: event.target.value }, `scn-id:${feature.id}:${index}`)}
            />
            <select
              aria-label={`Scenario ${index + 1} method`}
              value={scenario.method}
              onChange={(event) => patchScenario(index, { method: event.target.value as VerificationScenario['method'] })}
            >
              {['Simulation', 'Formal', 'Emulation', 'Inspection'].map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
            <button
              className="danger-ghost"
              type="button"
              aria-label={`Delete scenario ${scenario.id}`}
              onClick={() => removeScenario(index)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
          <input
            className="card-title-input"
            aria-label={`Scenario ${index + 1} title`}
            value={scenario.title}
            onChange={(event) => patchScenario(index, { title: event.target.value }, `scn-title:${feature.id}:${index}`)}
          />
          <textarea
            rows={3}
            aria-label={`Scenario ${index + 1} description`}
            value={scenario.description}
            onChange={(event) => patchScenario(index, { description: event.target.value }, `scn-body:${feature.id}:${index}`)}
          />
          <div className="link-row">
            <Link2 size={14} aria-hidden="true" />
            <span>Verifies</span>
            {feature.requirements.length === 0 && <em className="muted-note">Add requirements first.</em>}
            {feature.requirements.map((requirement) => {
              const active = scenario.linkedRequirements.includes(requirement.id)
              return (
                <label key={requirement.id} className={`link-chip ${active ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) =>
                      patchScenario(index, {
                        linkedRequirements: event.target.checked
                          ? [...scenario.linkedRequirements, requirement.id]
                          : scenario.linkedRequirements.filter((id) => id !== requirement.id),
                      })
                    }
                  />
                  {requirement.id}
                </label>
              )
            })}
          </div>
        </article>
      ))}
    </div>
  )
}
