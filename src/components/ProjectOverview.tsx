import { useMemo } from 'react'
import { AlertTriangle, GitBranch, Link2 } from 'lucide-react'
import type { Project, ValidationIssue } from '../types'
import { projectCoverage, readiness, statusLabel } from '../model'

interface Props {
  project: Project
  issues: ValidationIssue[]
  onSelect: (featureId: string) => void
}

/**
 * The matrix used to exist only per feature, but sign-off happens across a
 * whole subsystem — this is the project-wide view of the same data.
 */
export function ProjectOverview({ project, issues, onSelect }: Props) {
  const coverage = useMemo(() => projectCoverage(project), [project])
  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.length - errorCount

  const rows = useMemo(
    () =>
      project.features.map((feature) => {
        const linked = new Set(feature.verification.scenarios.flatMap((scenario) => scenario.linkedRequirements))
        const uncovered = feature.requirements.filter((requirement) => !linked.has(requirement.id)).length
        return {
          feature,
          uncovered,
          score: readiness(feature),
          featureIssues: issues.filter((issue) => issue.featureId === feature.id).length,
        }
      }),
    [project, issues],
  )

  return (
    <div className="panel-stack project-overview">
      <div className="section-intro">
        <div className="section-icon mint" aria-hidden="true">
          <GitBranch size={18} />
        </div>
        <div>
          <h2>{project.name}</h2>
          <p>{project.description || 'Project-wide readiness and verification coverage.'}</p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span>Features</span>
          <strong>{project.features.length}</strong>
        </div>
        <div className="stat">
          <span>Requirements</span>
          <strong>{coverage.requirements}</strong>
        </div>
        <div className="stat">
          <span>Covered</span>
          <strong className={coverage.percent === 100 ? 'good' : coverage.percent >= 60 ? 'warn' : 'bad'}>{coverage.percent}%</strong>
        </div>
        <div className="stat">
          <span>Blocking issues</span>
          <strong className={errorCount ? 'bad' : 'good'}>{errorCount}</strong>
        </div>
        <div className="stat">
          <span>Warnings</span>
          <strong className={warningCount ? 'warn' : 'good'}>{warningCount}</strong>
        </div>
      </div>

      {project.features.length === 0 ? (
        <p className="muted-note">No features yet. Add one from the sidebar to begin.</p>
      ) : (
        <div className="matrix-wrap">
          <table className="matrix project-matrix">
            <caption className="visually-hidden">Readiness and coverage for every feature</caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Owner</th>
                <th scope="col">Priority</th>
                <th scope="col">Specification</th>
                <th scope="col">Requirements</th>
                <th scope="col">Uncovered</th>
                <th scope="col">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ feature, uncovered, score, featureIssues }) => (
                <tr key={feature.id}>
                  <th scope="row">
                    <button type="button" className="linkish" onClick={() => onSelect(feature.id)}>
                      <strong>{feature.key}</strong>
                      <span>{feature.title}</span>
                    </button>
                  </th>
                  <td>{feature.owner || <em className="muted-note">unassigned</em>}</td>
                  <td>
                    <span className={`priority priority-${feature.priority.toLowerCase()}`}>{feature.priority}</span>
                  </td>
                  <td>{statusLabel(feature.statuses.specification)}</td>
                  <td className="numeric">{feature.requirements.length}</td>
                  <td className="numeric">
                    <span className={`coverage-pill ${uncovered ? 'gap' : 'covered'}`}>{uncovered || 'none'}</span>
                  </td>
                  <td>
                    <div className="mini-track" role="img" aria-label={`${score}% ready, ${featureIssues} issues`}>
                      <span style={{ width: `${score}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errorCount > 0 && (
        <p className="muted-note">
          <AlertTriangle size={14} aria-hidden="true" /> {errorCount} blocking {errorCount === 1 ? 'issue' : 'issues'} across the
          project. <Link2 size={14} aria-hidden="true" /> Uncovered requirements are the most common cause.
        </p>
      )}
    </div>
  )
}
