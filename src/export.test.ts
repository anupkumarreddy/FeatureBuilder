import { describe, expect, it } from 'vitest'
import { traceabilityToCsv } from './export/csv'
import { projectToMarkdown } from './export/markdown'
import { sampleProject } from './sample'
import type { Project } from './types'

describe('markdown export', () => {
  const markdown = projectToMarkdown(sampleProject)

  it('leads with the project and includes every feature', () => {
    expect(markdown.startsWith(`# ${sampleProject.name}`)).toBe(true)
    for (const feature of sampleProject.features) expect(markdown).toContain(feature.title)
  })

  it('nests child features under their parent heading level', () => {
    const parent = markdown.indexOf('## AUR-001')
    const child = markdown.indexOf('### AUR-002')
    expect(parent).toBeGreaterThan(-1)
    expect(child).toBeGreaterThan(parent)
  })

  it('renders requirements as a table with their identifiers', () => {
    expect(markdown).toContain('| ID | Type | Status | Requirement |')
    expect(markdown).toContain('`REQ-PWR-01`')
  })

  it('escapes pipes so a stray character cannot break the table', () => {
    const project: Project = structuredClone(sampleProject)
    project.features[0].requirements[0].title = 'A | B'
    expect(projectToMarkdown(project)).toContain('A \\| B')
  })
})

describe('traceability csv', () => {
  const csv = traceabilityToCsv(sampleProject)
  const lines = csv.split('\n')

  it('writes one header and one row per requirement', () => {
    const requirementCount = sampleProject.features.reduce((total, feature) => total + feature.requirements.length, 0)
    expect(lines).toHaveLength(requirementCount + 1)
    expect(lines[0]).toContain('Requirement ID')
  })

  it('marks covered and uncovered requirements', () => {
    expect(csv).toMatch(/,yes$/m)
    expect(csv).toMatch(/,no$/m)
  })

  it('quotes fields containing commas or quotes', () => {
    const project: Project = structuredClone(sampleProject)
    project.features[0].requirements[0].title = 'Reset, then "hold"'
    expect(traceabilityToCsv(project)).toContain('"Reset, then ""hold"""')
  })
})
