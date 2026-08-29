import { validateProject as validateSchema } from '../shared/schema.js'
import type { Feature, Project, StageStatus, ValidationIssue } from './types'

export const uid = () => crypto.randomUUID()

const KEY_SUFFIX = /-(\d+)$/

/**
 * BUG-16: the old implementation filtered with Number.isFinite, but Number('')
 * is 0 rather than NaN, so a key ending in a hyphen reset the sequence to zero
 * and the next feature collided with an existing key.
 */
export function nextFeatureKey(project: Project, extraKeys: string[] = []) {
  const highest = [...project.features.map((feature) => feature.key), ...extraKeys].reduce((max, key) => {
    const match = KEY_SUFFIX.exec(key)
    if (!match) return max
    const value = Number.parseInt(match[1], 10)
    return Number.isSafeInteger(value) && value > max ? value : max
  }, 0)
  return `${project.prefix}-${String(highest + 1).padStart(3, '0')}`
}

/** Siblings of `parentId`, in display order. */
export function siblingsOf(features: Feature[], parentId: string | null) {
  return features.filter((feature) => feature.parentId === parentId).sort((a, b) => a.order - b.order)
}

/**
 * BUG-11: new siblings used `siblings.length` as their order, which reused an
 * existing value after any middle sibling was deleted.
 */
export function nextOrder(features: Feature[], parentId: string | null) {
  const orders = features.filter((feature) => feature.parentId === parentId).map((feature) => feature.order)
  return orders.length === 0 ? 0 : Math.max(...orders) + 1
}

/** Rewrites sibling orders to a dense 0..n-1 sequence, preserving arrangement. */
export function normalizeOrder(features: Feature[]): Feature[] {
  const byParent = new Map<string | null, Feature[]>()
  for (const feature of features) {
    const group = byParent.get(feature.parentId)
    if (group) group.push(feature)
    else byParent.set(feature.parentId, [feature])
  }
  const orderById = new Map<string, number>()
  for (const group of byParent.values()) {
    group.sort((a, b) => a.order - b.order).forEach((feature, index) => orderById.set(feature.id, index))
  }
  return features.map((feature) => {
    const order = orderById.get(feature.id)
    return order === feature.order ? feature : { ...feature, order: order ?? feature.order }
  })
}

export function createFeature(project: Project, parentId: string | null = null, extraKeys: string[] = []): Feature {
  return {
    id: uid(),
    key: nextFeatureKey(project, extraKeys),
    title: 'Untitled feature',
    parentId,
    order: nextOrder(project.features, parentId),
    description: '',
    owner: '',
    priority: 'Medium',
    tags: [],
    statuses: { specification: 'draft', design: 'not-started', dv: 'not-started' },
    requirements: [],
    design: { architecture: '', interfaces: '', behavior: '', resetAndErrors: '', performance: '' },
    verification: { strategy: '', assertions: '', coverage: '', exclusions: '', scenarios: [] },
    dependencies: [],
    openQuestions: [],
    updatedAt: new Date().toISOString(),
  }
}

/** Index of parent id -> children, so the tree never rescans the whole list. */
export function buildChildIndex(features: Feature[]) {
  const index = new Map<string | null, Feature[]>()
  for (const feature of features) {
    const group = index.get(feature.parentId)
    if (group) group.push(feature)
    else index.set(feature.parentId, [feature])
  }
  for (const group of index.values()) group.sort((a, b) => a.order - b.order)
  return index
}

/**
 * BUG-02: unguarded recursion overflowed the stack on a cyclic parent chain.
 * The schema now rejects cycles at the boundary, and this walk is iterative and
 * visited-guarded so a cycle can never take the renderer down.
 */
export function descendants(features: Feature[], id: string): string[] {
  const index = buildChildIndex(features)
  const collected: string[] = []
  const seen = new Set<string>([id])
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const child of index.get(current) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      collected.push(child.id)
      queue.push(child.id)
    }
  }
  return collected
}

export function ancestors(features: Feature[], id: string): Feature[] {
  const byId = new Map(features.map((feature) => [feature.id, feature]))
  const chain: Feature[] = []
  const seen = new Set<string>([id])
  let cursor = byId.get(id)?.parentId ?? null
  while (cursor !== null) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const parent = byId.get(cursor)
    if (!parent) break
    chain.unshift(parent)
    cursor = parent.parentId
  }
  return chain
}

export function validateProject(project: Project): ValidationIssue[] {
  return project.features.flatMap((feature) => {
    const issues: ValidationIssue[] = []
    const add = (field: ValidationIssue['field'], message: string, severity: ValidationIssue['severity']) =>
      issues.push({ featureId: feature.id, field, message, severity })

    if (!feature.description.trim()) add('overview', 'Feature intent is missing', 'error')
    if (!feature.owner.trim()) add('overview', 'No owner assigned', 'warning')
    if (feature.requirements.length === 0) add('requirements', 'No requirements defined', 'error')
    if (!feature.design.behavior.trim()) add('design', 'Expected behavior is missing', 'error')
    if (!feature.verification.strategy.trim()) add('verification', 'Verification strategy is missing', 'warning')

    const requirementIds = new Set(feature.requirements.map((requirement) => requirement.id))
    const duplicates = new Set<string>()
    const seen = new Set<string>()
    for (const requirement of feature.requirements) {
      if (seen.has(requirement.id)) duplicates.add(requirement.id)
      seen.add(requirement.id)
      if (!requirement.id.trim()) add('requirements', 'A requirement has an empty identifier', 'error')
    }
    for (const duplicate of duplicates) add('requirements', `Requirement ID ${duplicate} is used more than once`, 'error')

    const linked = new Set(feature.verification.scenarios.flatMap((scenario) => scenario.linkedRequirements))
    for (const requirement of feature.requirements) {
      if (!linked.has(requirement.id)) add('traceability', `${requirement.id} has no verification scenario`, 'error')
    }
    for (const scenario of feature.verification.scenarios) {
      for (const link of scenario.linkedRequirements) {
        if (!requirementIds.has(link)) add('traceability', `${scenario.id} links to unknown requirement ${link}`, 'error')
      }
      if (scenario.linkedRequirements.length === 0) add('traceability', `${scenario.id} verifies nothing`, 'warning')
    }
    return issues
  })
}

const STATUS_LABELS: Record<StageStatus, string> = {
  'not-started': 'Not started',
  draft: 'Draft',
  'in-review': 'In review',
  approved: 'Approved',
  'in-progress': 'In progress',
  complete: 'Complete',
  blocked: 'Blocked',
}

export const statusLabel = (status: StageStatus) => STATUS_LABELS[status] ?? status

export function readiness(feature: Feature) {
  const checks = [
    feature.description.trim(),
    feature.owner.trim(),
    feature.requirements.length,
    feature.design.behavior.trim(),
    feature.verification.strategy.trim(),
    feature.verification.scenarios.length,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

/** Coverage across the whole project, for the overview dashboard. */
export function projectCoverage(project: Project) {
  let requirements = 0
  let covered = 0
  for (const feature of project.features) {
    const linked = new Set(feature.verification.scenarios.flatMap((scenario) => scenario.linkedRequirements))
    for (const requirement of feature.requirements) {
      requirements += 1
      if (linked.has(requirement.id)) covered += 1
    }
  }
  return { requirements, covered, percent: requirements === 0 ? 0 : Math.round((covered / requirements) * 100) }
}

/**
 * BUG-13: requirement IDs are free text and scenarios link to them by string,
 * so renaming an ID silently orphaned every link that pointed at it.
 */
export function renameRequirement(feature: Feature, index: number, nextId: string): Feature {
  const previousId = feature.requirements[index]?.id
  const requirements = feature.requirements.map((requirement, position) =>
    position === index ? { ...requirement, id: nextId } : requirement,
  )
  if (previousId === undefined || previousId === nextId) return { ...feature, requirements }
  return {
    ...feature,
    requirements,
    verification: {
      ...feature.verification,
      scenarios: feature.verification.scenarios.map((scenario) =>
        scenario.linkedRequirements.includes(previousId)
          ? { ...scenario, linkedRequirements: scenario.linkedRequirements.map((link) => (link === previousId ? nextId : link)) }
          : scenario,
      ),
    },
  }
}

/** Deep copy of a feature and its subtree, with fresh ids and keys. */
export function duplicateFeature(project: Project, rootId: string): Feature[] {
  const subtree = [rootId, ...descendants(project.features, rootId)]
  const byId = new Map(project.features.map((feature) => [feature.id, feature]))
  const idMap = new Map(subtree.map((id) => [id, uid()]))
  const mintedKeys: string[] = []

  return subtree.flatMap((sourceId) => {
    const source = byId.get(sourceId)
    if (!source) return []
    const key = nextFeatureKey(project, mintedKeys)
    mintedKeys.push(key)
    const isRoot = sourceId === rootId
    const copy: Feature = {
      ...structuredClone(source),
      id: idMap.get(sourceId)!,
      key,
      title: isRoot ? `${source.title} (copy)` : source.title,
      parentId: isRoot ? source.parentId : (idMap.get(source.parentId ?? '') ?? source.parentId),
      order: isRoot ? nextOrder(project.features, source.parentId) : source.order,
      updatedAt: new Date().toISOString(),
    }
    return [copy]
  })
}

/** Validate an untrusted project (an imported file) before it reaches state. */
export function parseProject(value: unknown): Project {
  return validateSchema(value)
}

export type DropPosition = 'inside' | 'before' | 'after'

/**
 * Reparent or reorder a feature. Dragging previously only ever reparented, so
 * siblings could not be arranged even though `order` is persisted.
 * Returns the original array when the move would create a cycle.
 */
export function moveFeature(features: Feature[], id: string, targetId: string | null, position: DropPosition): Feature[] {
  if (!id || id === targetId) return features
  const moving = features.find((feature) => feature.id === id)
  if (!moving) return features

  const forbidden = new Set([id, ...descendants(features, id)])
  if (targetId !== null && forbidden.has(targetId)) return features

  const target = targetId === null ? null : (features.find((feature) => feature.id === targetId) ?? null)
  if (targetId !== null && target === null) return features

  const nextParent = target === null || position === 'inside' ? targetId : target.parentId
  if (nextParent !== null && forbidden.has(nextParent)) return features

  // Order the destination siblings, drop the moving feature in at the right
  // index, then renumber the whole group so no two siblings share an order.
  const siblings = features
    .filter((feature) => feature.parentId === nextParent && feature.id !== id)
    .sort((a, b) => a.order - b.order)

  let insertAt = siblings.length
  if (position !== 'inside' && target) {
    const targetIndex = siblings.findIndex((feature) => feature.id === target.id)
    if (targetIndex >= 0) insertAt = position === 'before' ? targetIndex : targetIndex + 1
  }

  const arranged = [...siblings.slice(0, insertAt), moving, ...siblings.slice(insertAt)]
  const orderById = new Map(arranged.map((feature, index) => [feature.id, index]))

  return features.map((feature) => {
    if (feature.id === id) {
      return { ...feature, parentId: nextParent, order: orderById.get(id) ?? 0, updatedAt: new Date().toISOString() }
    }
    const order = orderById.get(feature.id)
    return order === undefined || order === feature.order ? feature : { ...feature, order }
  })
}
