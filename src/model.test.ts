import { describe, expect, it } from 'vitest'
import {
  ancestors, createFeature, descendants, duplicateFeature, moveFeature, nextFeatureKey,
  nextOrder, normalizeOrder, projectCoverage, readiness, renameRequirement, siblingsOf, validateProject,
} from './model'
import { sampleProject } from './sample'
import type { Feature, Project } from './types'

const clone = (): Project => structuredClone(sampleProject)

describe('feature keys', () => {
  it('allocates stable sequential feature keys', () => {
    expect(nextFeatureKey(sampleProject)).toBe('AUR-005')
    expect(createFeature(sampleProject, 'power').key).toBe('AUR-005')
  })

  // BUG-10: two adds before a re-render both read the same snapshot.
  it('does not repeat a key when several features are minted from one snapshot', () => {
    const minted: string[] = []
    for (let index = 0; index < 4; index += 1) minted.push(nextFeatureKey(sampleProject, minted))
    expect(new Set(minted).size).toBe(4)
    expect(minted).toEqual(['AUR-005', 'AUR-006', 'AUR-007', 'AUR-008'])
  })

  // BUG-16: Number('') is 0, not NaN, so a trailing dash reset the sequence.
  it('ignores keys with no numeric suffix instead of restarting at zero', () => {
    const project = clone()
    project.features[0].key = 'AUR-'
    project.features[1].key = 'legacy'
    expect(nextFeatureKey(project)).toBe('AUR-005')
  })
})

describe('tree structure', () => {
  it('finds the complete subtree for safe deletion and moves', () => {
    expect(descendants(sampleProject.features, 'power').sort()).toEqual(['clock-gating', 'wakeup'])
    expect(descendants(sampleProject.features, 'clock-gating')).toEqual([])
  })

  // BUG-02: this used to overflow the stack.
  it('terminates on a cyclic parent chain rather than overflowing the stack', () => {
    const cyclic = [
      { ...sampleProject.features[0], id: 'a', parentId: 'b' },
      { ...sampleProject.features[0], id: 'b', parentId: 'a' },
    ] as Feature[]
    expect(() => descendants(cyclic, 'a')).not.toThrow()
    expect(() => ancestors(cyclic, 'a')).not.toThrow()
  })

  // BUG-11: order reused an existing value after a middle sibling was deleted.
  it('never reuses a sibling order after a deletion', () => {
    const features = [
      { id: 'a', parentId: null, order: 0 },
      { id: 'b', parentId: null, order: 1 },
      { id: 'c', parentId: null, order: 2 },
    ] as Feature[]
    const remaining = features.filter((feature) => feature.id !== 'b')
    const order = nextOrder(remaining, null)
    expect(remaining.some((feature) => feature.order === order)).toBe(false)
  })

  it('renumbers siblings densely without changing their arrangement', () => {
    const features = [
      { id: 'a', parentId: null, order: 5 },
      { id: 'b', parentId: null, order: 9 },
      { id: 'c', parentId: 'a', order: 3 },
    ] as Feature[]
    const normalized = normalizeOrder(features)
    expect(siblingsOf(normalized, null).map((feature) => [feature.id, feature.order])).toEqual([
      ['a', 0],
      ['b', 1],
    ])
    expect(siblingsOf(normalized, 'a')[0].order).toBe(0)
  })
})

describe('moving features', () => {
  const tree = () =>
    [
      { id: 'a', parentId: null, order: 0 },
      { id: 'b', parentId: null, order: 1 },
      { id: 'c', parentId: null, order: 2 },
      { id: 'a1', parentId: 'a', order: 0 },
    ] as Feature[]

  it('reparents a feature', () => {
    const moved = moveFeature(tree(), 'c', 'a', 'inside')
    expect(moved.find((feature) => feature.id === 'c')!.parentId).toBe('a')
  })

  it('reorders siblings, which drag-and-drop could not do before', () => {
    const moved = moveFeature(tree(), 'c', 'a', 'before')
    expect(siblingsOf(moved, null).map((feature) => feature.id)).toEqual(['c', 'a', 'b'])
  })

  it('places a feature after its target', () => {
    const moved = moveFeature(tree(), 'a', 'b', 'after')
    expect(siblingsOf(moved, null).map((feature) => feature.id)).toEqual(['b', 'a', 'c'])
  })

  it('refuses a move that would make a feature its own ancestor', () => {
    const before = tree()
    expect(moveFeature(before, 'a', 'a1', 'inside')).toBe(before)
    expect(moveFeature(before, 'a', 'a', 'inside')).toBe(before)
  })

  it('leaves every sibling order distinct after a move', () => {
    const moved = moveFeature(tree(), 'c', 'a', 'before')
    const orders = siblingsOf(moved, null).map((feature) => feature.order)
    expect(new Set(orders).size).toBe(orders.length)
  })
})

describe('requirement identity', () => {
  // BUG-13: renaming an id silently orphaned every scenario link.
  it('carries scenario links across a requirement rename', () => {
    const feature = structuredClone(sampleProject.features.find((item) => item.id === 'power')!)
    const originalId = feature.requirements[0].id
    expect(feature.verification.scenarios.some((s) => s.linkedRequirements.includes(originalId))).toBe(true)

    const renamed = renameRequirement(feature, 0, 'REQ-PWR-RENAMED')
    expect(renamed.requirements[0].id).toBe('REQ-PWR-RENAMED')
    expect(renamed.verification.scenarios.some((s) => s.linkedRequirements.includes('REQ-PWR-RENAMED'))).toBe(true)
    expect(renamed.verification.scenarios.some((s) => s.linkedRequirements.includes(originalId))).toBe(false)
    expect(validateProject({ ...clone(), features: [renamed] }).some((issue) => issue.field === 'traceability')).toBe(false)
  })

  it('leaves unrelated links alone', () => {
    const feature = structuredClone(sampleProject.features.find((item) => item.id === 'power')!)
    const second = feature.requirements[1].id
    const renamed = renameRequirement(feature, 0, 'NEW-ID')
    expect(renamed.verification.scenarios.some((s) => s.linkedRequirements.includes(second))).toBe(true)
  })
})

describe('duplication', () => {
  it('copies a subtree with fresh identifiers and keys', () => {
    const copies = duplicateFeature(sampleProject, 'power')
    expect(copies).toHaveLength(3)
    const originalIds = new Set(sampleProject.features.map((feature) => feature.id))
    expect(copies.every((feature) => !originalIds.has(feature.id))).toBe(true)
    expect(new Set(copies.map((feature) => feature.key)).size).toBe(3)
    expect(copies[0].title).toMatch(/\(copy\)$/)
  })

  it('rewires child parents to the copied root', () => {
    const copies = duplicateFeature(sampleProject, 'power')
    const copiedIds = new Set(copies.map((feature) => feature.id))
    for (const child of copies.slice(1)) expect(copiedIds.has(child.parentId!)).toBe(true)
  })

  it('produces a project that still validates', () => {
    const project = clone()
    const copies = duplicateFeature(project, 'power')
    expect(validateProject({ ...project, features: [...project.features, ...copies] })).toBeInstanceOf(Array)
  })
})

describe('validation and reporting', () => {
  it('reports missing content and traceability gaps', () => {
    const issues = validateProject(sampleProject)
    expect(issues.some((issue) => issue.featureId === 'clock-gating' && issue.field === 'traceability')).toBe(true)
    expect(issues.some((issue) => issue.featureId === 'power' && issue.field === 'traceability')).toBe(false)
  })

  it('flags a scenario pointing at a requirement that no longer exists', () => {
    const project = clone()
    const feature = project.features.find((item) => item.id === 'power')!
    feature.verification.scenarios[0].linkedRequirements = ['REQ-GONE']
    const issues = validateProject(project)
    expect(issues.some((issue) => issue.message.includes('unknown requirement REQ-GONE'))).toBe(true)
  })

  it('derives readiness from authored evidence', () => {
    const complete = sampleProject.features.find((feature) => feature.id === 'power')!
    const incomplete = sampleProject.features.find((feature) => feature.id === 'wakeup')!
    expect(readiness(complete)).toBe(100)
    expect(readiness(incomplete)).toBeLessThan(50)
  })

  it('ignores whitespace-only content when scoring readiness', () => {
    const feature = structuredClone(sampleProject.features.find((item) => item.id === 'power')!)
    feature.owner = '   '
    expect(readiness(feature)).toBeLessThan(100)
  })

  it('summarises coverage across the whole project', () => {
    const coverage = projectCoverage(sampleProject)
    expect(coverage.requirements).toBeGreaterThan(0)
    expect(coverage.covered).toBeLessThanOrEqual(coverage.requirements)
    expect(coverage.percent).toBe(Math.round((coverage.covered / coverage.requirements) * 100))
  })
})
