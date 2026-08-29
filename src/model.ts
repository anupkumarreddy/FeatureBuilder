import type { Feature, Project, StageStatus, ValidationIssue } from './types'

export const uid = () => crypto.randomUUID()

export function nextFeatureKey(project: Project) {
  const numbers = project.features.map((feature) => Number(feature.key.split('-').at(-1))).filter(Number.isFinite)
  return `${project.prefix}-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`
}

export function createFeature(project: Project, parentId: string | null = null): Feature {
  return {
    id: uid(), key: nextFeatureKey(project), title: 'Untitled feature', parentId,
    order: project.features.filter((item) => item.parentId === parentId).length,
    description: '', owner: '', priority: 'Medium', tags: [],
    statuses: { specification: 'draft', design: 'not-started', dv: 'not-started' },
    requirements: [],
    design: { architecture: '', interfaces: '', behavior: '', resetAndErrors: '', performance: '' },
    verification: { strategy: '', assertions: '', coverage: '', exclusions: '', scenarios: [] },
    dependencies: [], openQuestions: [], updatedAt: new Date().toISOString(),
  }
}

export function descendants(features: Feature[], id: string): string[] {
  const direct = features.filter((feature) => feature.parentId === id).map((feature) => feature.id)
  return [...direct, ...direct.flatMap((child) => descendants(features, child))]
}

export function validateProject(project: Project): ValidationIssue[] {
  return project.features.flatMap((feature) => {
    const issues: ValidationIssue[] = []
    if (!feature.description.trim()) issues.push({ featureId: feature.id, field: 'overview', message: 'Feature intent is missing', severity: 'error' })
    if (!feature.owner.trim()) issues.push({ featureId: feature.id, field: 'overview', message: 'No owner assigned', severity: 'warning' })
    if (feature.requirements.length === 0) issues.push({ featureId: feature.id, field: 'requirements', message: 'No requirements defined', severity: 'error' })
    if (!feature.design.behavior.trim()) issues.push({ featureId: feature.id, field: 'design', message: 'Expected behavior is missing', severity: 'error' })
    if (!feature.verification.strategy.trim()) issues.push({ featureId: feature.id, field: 'verification', message: 'Verification strategy is missing', severity: 'warning' })
    const linked = new Set(feature.verification.scenarios.flatMap((scenario) => scenario.linkedRequirements))
    feature.requirements.forEach((requirement) => {
      if (!linked.has(requirement.id)) issues.push({ featureId: feature.id, field: 'traceability', message: `${requirement.id} has no verification scenario`, severity: 'error' })
    })
    return issues
  })
}

export const statusLabel = (status: StageStatus) => ({
  'not-started': 'Not started', draft: 'Draft', 'in-review': 'In review', approved: 'Approved',
  'in-progress': 'In progress', complete: 'Complete', blocked: 'Blocked',
}[status])

export function readiness(feature: Feature) {
  const checks = [feature.description, feature.owner, feature.requirements.length, feature.design.behavior, feature.verification.strategy, feature.verification.scenarios.length]
  return Math.round(checks.filter(Boolean).length / checks.length * 100)
}
