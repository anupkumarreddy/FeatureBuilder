import { describe, expect, it } from 'vitest'
import { validateProject } from '../shared/schema.js'
import { sampleProject } from './sample'
import type { Feature, Project } from './types'

const clone = (): Project => structuredClone(sampleProject)

const bareFeature = (id: string, parentId: string | null): Feature => ({
  id,
  key: `K-${id}`,
  title: 'Feature',
  parentId,
  order: 0,
  description: '',
  owner: '',
  priority: 'Medium',
  tags: [],
  statuses: { specification: 'draft', design: 'draft', dv: 'draft' },
  requirements: [],
  design: { architecture: '', interfaces: '', behavior: '', resetAndErrors: '', performance: '' },
  verification: { strategy: '', assertions: '', coverage: '', exclusions: '', scenarios: [] },
  dependencies: [],
  openQuestions: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('project schema', () => {
  it('accepts the bundled sample project', () => {
    expect(() => validateProject(sampleProject)).not.toThrow()
  })

  // BUG-02
  it('rejects a parent cycle instead of letting it reach the renderer', () => {
    const project = clone()
    project.features = [bareFeature('a', 'b'), bareFeature('b', 'a')]
    expect(() => validateProject(project)).toThrow(/its own ancestor/)
  })

  it('rejects a feature that is its own parent', () => {
    const project = clone()
    project.features = [bareFeature('a', 'a')]
    expect(() => validateProject(project)).toThrow(/its own ancestor/)
  })

  it('accepts a deep but acyclic chain', () => {
    const project = clone()
    project.features = [bareFeature('a', null), bareFeature('b', 'a'), bareFeature('c', 'b')]
    expect(() => validateProject(project)).not.toThrow()
  })

  // BUG-12
  it('requires a usable feature key prefix', () => {
    const project = clone()
    delete (project as Partial<Project>).prefix
    expect(() => validateProject(project)).toThrow(/prefix/)
    expect(() => validateProject({ ...clone(), prefix: '9bad' })).toThrow(/prefix/)
    expect(() => validateProject({ ...clone(), prefix: 'AUR' })).not.toThrow()
  })

  it('requires a project id and description', () => {
    expect(() => validateProject({ ...clone(), id: '../escape' })).toThrow(/Project ID/)
    expect(() => validateProject({ ...clone(), description: null })).toThrow(/description/)
  })

  it('rejects duplicate requirement identifiers inside a feature', () => {
    const project = clone()
    const feature = project.features[0]
    feature.requirements = [
      { id: 'REQ-1', title: 'a', description: '', type: 'Functional', status: 'Draft' },
      { id: 'REQ-1', title: 'b', description: '', type: 'Functional', status: 'Draft' },
    ]
    expect(() => validateProject(project)).toThrow(/Duplicate requirement ID/)
  })

  it('rejects unknown parents and unsafe identifiers', () => {
    const project = clone()
    project.features = [bareFeature('a', 'ghost')]
    expect(() => validateProject(project)).toThrow(/parent that is not in this project/)

    const unsafe = clone()
    unsafe.features = [bareFeature('../../etc/passwd', null)]
    expect(() => validateProject(unsafe)).toThrow(/unsupported characters/)
  })

  it('rejects a project written by another schema version', () => {
    expect(() => validateProject({ ...clone(), schemaVersion: 2 })).toThrow(/different version/)
  })
})
