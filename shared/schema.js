// Canonical project validation, shared by both processes so files on disk and
// imported archives are checked by exactly the same rules.
//
// This is ESM on purpose. Vite's dev server serves source .cjs files
// untransformed, so a CommonJS module here cannot be imported by the renderer
// during development even though bundling it for production works. The main
// process loads it with a dynamic import instead.

export const MAX_FEATURES = 5000
export const MAX_JSON_BYTES = 10 * 1024 * 1024
export const MAX_PROJECT_BYTES = 100 * 1024 * 1024
export const MAX_LIST_ITEMS = 10000
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
export const PRIORITIES = new Set(['Critical', 'High', 'Medium', 'Low'])
export const STAGE_STATUSES = new Set(['not-started', 'draft', 'in-review', 'approved', 'in-progress', 'complete', 'blocked'])
export const REQUIREMENT_TYPES = new Set(['Functional', 'Performance', 'Safety', 'Interface'])
export const REQUIREMENT_STATUSES = new Set(['Draft', 'Approved'])
export const SCENARIO_METHODS = new Set(['Simulation', 'Formal', 'Emulation', 'Inspection'])

// This module is bundled into the sandboxed renderer as well as required by
// the main process, so it must not reach for Node globals such as Buffer.
const encoder = new TextEncoder()
export function utf8Bytes(value) {
  return encoder.encode(value).length
}

export class SchemaError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SchemaError'
  }
}

function fail(message) {
  throw new SchemaError(message)
}

export function assertString(value, label) {
  if (typeof value !== 'string') fail(`${label} must be text`)
  return value
}

export function assertStringArray(value, label, maximum = MAX_LIST_ITEMS) {
  if (!Array.isArray(value)) fail(`${label} must be a list`)
  if (value.length > maximum) fail(`${label} may contain at most ${maximum} entries`)
  if (value.some((item) => typeof item !== 'string')) fail(`${label} must contain only text`)
  return value
}

export function assertSafeId(value, label = 'ID') {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(`${label} contains unsupported characters`)
  return value
}

// BUG-02: a parent chain that loops passed every earlier check and then
// overflowed the stack during render. Reject it at the boundary instead.
export function assertAcyclic(features) {
  const parents = new Map(features.map((feature) => [feature.id, feature.parentId]))
  for (const feature of features) {
    const seen = new Set([feature.id])
    let cursor = feature.parentId
    while (cursor !== null && cursor !== undefined) {
      if (seen.has(cursor)) fail(`Feature "${feature.id}" is its own ancestor`)
      seen.add(cursor)
      if (!parents.has(cursor)) break
      cursor = parents.get(cursor)
    }
  }
}

function validateRequirement(requirement, seenIds) {
  if (!requirement || typeof requirement !== 'object') fail('Every requirement must be an object')
  assertString(requirement.id, 'Requirement ID')
  if (!requirement.id.trim()) fail('Requirement ID cannot be empty')
  if (seenIds.has(requirement.id)) fail(`Duplicate requirement ID: ${requirement.id}`)
  seenIds.add(requirement.id)
  assertString(requirement.title, 'Requirement title')
  assertString(requirement.description, 'Requirement description')
  if (!REQUIREMENT_TYPES.has(requirement.type)) fail(`Requirement "${requirement.id}" has an unknown type`)
  if (!REQUIREMENT_STATUSES.has(requirement.status)) fail(`Requirement "${requirement.id}" has an unknown status`)
}

function validateScenario(scenario, seenIds) {
  if (!scenario || typeof scenario !== 'object') fail('Every verification scenario must be an object')
  assertString(scenario.id, 'Scenario ID')
  if (!scenario.id.trim()) fail('Scenario ID cannot be empty')
  if (seenIds.has(scenario.id)) fail(`Duplicate scenario ID: ${scenario.id}`)
  seenIds.add(scenario.id)
  assertString(scenario.title, 'Scenario title')
  assertString(scenario.description, 'Scenario description')
  if (!SCENARIO_METHODS.has(scenario.method)) fail(`Scenario "${scenario.id}" has an unknown method`)
  assertStringArray(scenario.linkedRequirements, 'Scenario requirement links')
}

function validateFeature(feature, seenFeatureIds) {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) fail('Every feature must be an object')
  assertSafeId(feature.id, 'Feature ID')
  if (seenFeatureIds.has(feature.id)) fail(`Duplicate feature ID: ${feature.id}`)
  seenFeatureIds.add(feature.id)
  assertString(feature.key, 'Feature key')
  assertString(feature.title, 'Feature title')
  if (feature.parentId !== null) assertSafeId(feature.parentId, 'Parent feature ID')
  if (!Number.isFinite(feature.order)) fail('Feature order must be a number')
  assertString(feature.description, 'Feature description')
  assertString(feature.owner, 'Feature owner')
  if (!PRIORITIES.has(feature.priority)) fail(`Feature "${feature.key}" has an unknown priority`)
  assertStringArray(feature.tags, 'Feature tags')

  const statuses = feature.statuses
  if (!statuses || typeof statuses !== 'object') fail('Feature statuses are missing')
  for (const stage of ['specification', 'design', 'dv']) {
    if (!STAGE_STATUSES.has(statuses[stage])) fail(`Feature "${feature.key}" has an unknown ${stage} status`)
  }

  if (!Array.isArray(feature.requirements)) fail('Feature requirements must be a list')
  if (feature.requirements.length > MAX_LIST_ITEMS) fail(`A feature may contain at most ${MAX_LIST_ITEMS} requirements`)
  const requirementIds = new Set()
  for (const requirement of feature.requirements) validateRequirement(requirement, requirementIds)

  if (!feature.design || typeof feature.design !== 'object') fail('Feature design section is missing')
  for (const field of ['architecture', 'interfaces', 'behavior', 'resetAndErrors', 'performance']) {
    assertString(feature.design[field], `Design ${field}`)
  }

  if (!feature.verification || typeof feature.verification !== 'object') fail('Feature verification section is missing')
  for (const field of ['strategy', 'assertions', 'coverage', 'exclusions']) {
    assertString(feature.verification[field], `Verification ${field}`)
  }
  if (!Array.isArray(feature.verification.scenarios)) fail('Verification scenarios must be a list')
  if (feature.verification.scenarios.length > MAX_LIST_ITEMS) fail(`A feature may contain at most ${MAX_LIST_ITEMS} scenarios`)
  const scenarioIds = new Set()
  for (const scenario of feature.verification.scenarios) validateScenario(scenario, scenarioIds)

  assertStringArray(feature.dependencies, 'Feature dependencies')
  assertStringArray(feature.openQuestions, 'Feature open questions')
  assertString(feature.updatedAt, 'Feature update time')
}

export function validateProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) fail('Project must be an object')
  if (project.schemaVersion !== 1) fail('This project was written by a different version of FeatureBuilder')

  // BUG-12: id, prefix, description and timestamps were never checked, so a
  // project missing `prefix` produced features keyed "undefined-001".
  assertSafeId(project.id, 'Project ID')
  if (typeof project.name !== 'string' || !project.name.trim()) fail('Project name is required')
  assertString(project.description, 'Project description')
  if (typeof project.prefix !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(project.prefix)) {
    fail('Project prefix must be 1-16 letters or digits, starting with a letter')
  }
  assertString(project.createdAt, 'Project creation time')
  assertString(project.updatedAt, 'Project update time')

  if (!Array.isArray(project.features)) fail('Project features must be a list')
  if (project.features.length > MAX_FEATURES) fail(`A project may contain at most ${MAX_FEATURES} features`)

  const featureIds = new Set()
  for (const feature of project.features) validateFeature(feature, featureIds)

  for (const feature of project.features) {
    if (feature.parentId !== null && !featureIds.has(feature.parentId)) {
      fail(`Feature "${feature.key}" refers to a parent that is not in this project`)
    }
  }
  assertAcyclic(project.features)

  if (utf8Bytes(JSON.stringify(project)) > MAX_PROJECT_BYTES) fail('Project is too large to save')
  return project
}
