import type { Feature, Project } from '../types'
import { readiness, siblingsOf, statusLabel } from '../model'

const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()

function section(title: string, body: string) {
  return body.trim() ? `${title}\n\n${body.trim()}\n` : ''
}

function featureMarkdown(project: Project, feature: Feature, depth: number): string {
  const heading = '#'.repeat(Math.min(depth + 2, 6))
  const lines: string[] = [`${heading} ${feature.key} — ${feature.title}`, '']

  const meta = [
    `**Owner:** ${feature.owner || '_unassigned_'}`,
    `**Priority:** ${feature.priority}`,
    `**Readiness:** ${readiness(feature)}%`,
    `**Specification:** ${statusLabel(feature.statuses.specification)}`,
    `**Design:** ${statusLabel(feature.statuses.design)}`,
    `**DV:** ${statusLabel(feature.statuses.dv)}`,
  ]
  lines.push(meta.join(' · '), '')
  if (feature.tags.length) lines.push(`**Tags:** ${feature.tags.join(', ')}`, '')
  if (feature.description.trim()) lines.push(feature.description.trim(), '')

  if (feature.requirements.length) {
    lines.push(`${heading}# Requirements`, '')
    lines.push('| ID | Type | Status | Requirement |', '| --- | --- | --- | --- |')
    for (const requirement of feature.requirements) {
      lines.push(
        `| \`${escapeCell(requirement.id)}\` | ${requirement.type} | ${requirement.status} | ${escapeCell(requirement.title)}${
          requirement.description.trim() ? ` — ${escapeCell(requirement.description)}` : ''
        } |`,
      )
    }
    lines.push('')
  }

  const design = [
    section(`${heading}# Architecture`, feature.design.architecture),
    section(`${heading}# Interfaces and signals`, feature.design.interfaces),
    section(`${heading}# Expected behavior`, feature.design.behavior),
    section(`${heading}# Reset and error behavior`, feature.design.resetAndErrors),
    section(`${heading}# Performance constraints`, feature.design.performance),
  ].filter(Boolean)
  if (design.length) lines.push(`${heading}# Design specification`, '', ...design)

  const verification = [
    section(`${heading}# Verification strategy`, feature.verification.strategy),
    section(`${heading}# Assertions and checkers`, feature.verification.assertions),
    section(`${heading}# Functional coverage`, feature.verification.coverage),
    section(`${heading}# Exclusions`, feature.verification.exclusions),
  ].filter(Boolean)
  if (verification.length) lines.push(`${heading}# DV plan`, '', ...verification)

  if (feature.verification.scenarios.length) {
    lines.push(`${heading}# Verification scenarios`, '')
    lines.push('| ID | Method | Scenario | Verifies |', '| --- | --- | --- | --- |')
    for (const scenario of feature.verification.scenarios) {
      const links = scenario.linkedRequirements.length ? scenario.linkedRequirements.map((id) => `\`${id}\``).join(', ') : '_none_'
      lines.push(`| \`${escapeCell(scenario.id)}\` | ${scenario.method} | ${escapeCell(scenario.title)} | ${links} |`)
    }
    lines.push('')
  }

  if (feature.openQuestions.filter(Boolean).length) {
    lines.push(`${heading}# Open questions`, '')
    for (const question of feature.openQuestions.filter(Boolean)) lines.push(`- ${question}`)
    lines.push('')
  }

  const children = siblingsOf(project.features, feature.id)
  return [lines.join('\n'), ...children.map((child) => featureMarkdown(project, child, depth + 1))].join('\n')
}

export function projectToMarkdown(project: Project): string {
  const head = [`# ${project.name}`, '']
  if (project.description.trim()) head.push(project.description.trim(), '')
  head.push(`_${project.features.length} features · exported ${new Date().toISOString().slice(0, 10)}_`, '')
  const roots = siblingsOf(project.features, null)
  return [head.join('\n'), ...roots.map((feature) => featureMarkdown(project, feature, 0))].join('\n').replace(/\n{3,}/g, '\n\n')
}
