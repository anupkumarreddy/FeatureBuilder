import { Check, Link2 } from 'lucide-react'
import type { Feature } from '../../types'
import { EmptyState } from './shared'

export function Traceability({ feature }: { feature: Feature }) {
  if (feature.requirements.length === 0) {
    return (
      <EmptyState
        icon={<Link2 size={26} />}
        title="Nothing to trace yet"
        text="Add requirements first, then connect them to verification scenarios."
        action={<span className="empty-hint">Requirements → DV plan → Traceability</span>}
      />
    )
  }

  const { scenarios } = feature.verification

  return (
    <div className="panel-stack">
      <div className="section-intro">
        <div className="section-icon coral" aria-hidden="true">
          <Link2 size={18} />
        </div>
        <div>
          <h2>Traceability matrix</h2>
          <p>See which requirements are covered by planned verification scenarios.</p>
        </div>
      </div>

      <div className="matrix-wrap">
        <table className="matrix">
          <caption className="visually-hidden">Requirements against verification scenarios for {feature.key}</caption>
          <thead>
            <tr>
              <th scope="col">Requirement</th>
              {scenarios.map((scenario) => (
                <th scope="col" key={scenario.id}>
                  <span>{scenario.id}</span>
                  {scenario.title}
                </th>
              ))}
              <th scope="col">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {feature.requirements.map((requirement) => {
              const linked = scenarios.filter((scenario) => scenario.linkedRequirements.includes(requirement.id))
              return (
                <tr key={requirement.id}>
                  <th scope="row">
                    <strong>{requirement.id}</strong>
                    <span>{requirement.title}</span>
                  </th>
                  {scenarios.map((scenario) => {
                    const covered = scenario.linkedRequirements.includes(requirement.id)
                    return (
                      <td key={scenario.id}>
                        {covered ? (
                          <span className="matrix-check">
                            <Check size={15} aria-label={`${scenario.id} verifies ${requirement.id}`} />
                          </span>
                        ) : (
                          <span className="matrix-empty" aria-label="Not linked">
                            —
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td>
                    <span className={`coverage-pill ${linked.length ? 'covered' : 'gap'}`}>
                      {linked.length ? `${linked.length} linked` : 'Gap'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
