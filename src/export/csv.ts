import type { Project } from '../types'

const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** Flat requirement-to-scenario traceability, for review spreadsheets. */
export function traceabilityToCsv(project: Project): string {
  const rows: string[][] = [
    ['Feature Key', 'Feature', 'Requirement ID', 'Requirement', 'Type', 'Status', 'Scenario IDs', 'Methods', 'Covered'],
  ]
  for (const feature of project.features) {
    for (const requirement of feature.requirements) {
      const scenarios = feature.verification.scenarios.filter((scenario) => scenario.linkedRequirements.includes(requirement.id))
      rows.push([
        feature.key,
        feature.title,
        requirement.id,
        requirement.title,
        requirement.type,
        requirement.status,
        scenarios.map((scenario) => scenario.id).join(' '),
        [...new Set(scenarios.map((scenario) => scenario.method))].join(' '),
        scenarios.length > 0 ? 'yes' : 'no',
      ])
    }
  }
  return rows.map((row) => row.map(cell).join(',')).join('\n')
}
