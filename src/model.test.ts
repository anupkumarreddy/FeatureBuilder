import { describe, expect, it } from 'vitest'
import { createFeature, descendants, nextFeatureKey, readiness, validateProject } from './model'
import { sampleProject } from './sample'

describe('feature model', () => {
  it('allocates stable sequential feature keys', () => {
    expect(nextFeatureKey(sampleProject)).toBe('AUR-005')
    expect(createFeature(sampleProject, 'power').key).toBe('AUR-005')
  })

  it('finds the complete subtree for safe deletion and moves', () => {
    expect(descendants(sampleProject.features, 'power').sort()).toEqual(['clock-gating', 'wakeup'])
    expect(descendants(sampleProject.features, 'clock-gating')).toEqual([])
  })

  it('reports missing content and traceability gaps', () => {
    const issues = validateProject(sampleProject)
    expect(issues.some((issue) => issue.featureId === 'clock-gating' && issue.field === 'traceability')).toBe(true)
    expect(issues.some((issue) => issue.featureId === 'power' && issue.field === 'traceability')).toBe(false)
  })

  it('derives readiness from authored evidence', () => {
    const complete = sampleProject.features.find((feature) => feature.id === 'power')!
    const incomplete = sampleProject.features.find((feature) => feature.id === 'wakeup')!
    expect(readiness(complete)).toBe(100)
    expect(readiness(incomplete)).toBeLessThan(50)
  })
})
