const fs = require('node:fs/promises')
const path = require('node:path')

const MAX_FEATURES = 5000
const MAX_JSON_BYTES = 10 * 1024 * 1024
const MAX_PROJECT_BYTES = 100 * 1024 * 1024
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const PRIORITIES = new Set(['Critical', 'High', 'Medium', 'Low'])
const STAGE_STATUSES = new Set(['not-started', 'draft', 'in-review', 'approved', 'in-progress', 'complete', 'blocked'])

function assertString(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
}

function assertStringArray(value, label, maximum = 10000) {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== 'string')) throw new Error(`${label} must be a text list`)
}

function assertSafeId(value, label = 'ID') {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error(`${label} contains unsupported characters`)
  return value
}

function validateProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('Project must be an object')
  if (project.schemaVersion !== 1) throw new Error('Unsupported project schema version')
  if (typeof project.name !== 'string' || !project.name.trim()) throw new Error('Project name is required')
  if (!Array.isArray(project.features) || project.features.length > MAX_FEATURES) throw new Error(`Project may contain at most ${MAX_FEATURES} features`)
  const ids = new Set()
  for (const feature of project.features) {
    if (!feature || typeof feature !== 'object') throw new Error('Every feature must be an object')
    assertSafeId(feature.id, 'Feature ID')
    if (ids.has(feature.id)) throw new Error(`Duplicate feature ID: ${feature.id}`)
    ids.add(feature.id)
    assertString(feature.key, 'Feature key')
    assertString(feature.title, 'Feature title')
    if (feature.parentId !== null) assertSafeId(feature.parentId, 'Parent feature ID')
    if (!Number.isFinite(feature.order)) throw new Error('Feature order must be a number')
    assertString(feature.description, 'Feature description')
    assertString(feature.owner, 'Feature owner')
    if (!PRIORITIES.has(feature.priority)) throw new Error('Feature priority is invalid')
    assertStringArray(feature.tags, 'Feature tags')
    if (!feature.statuses || !STAGE_STATUSES.has(feature.statuses.specification) || !STAGE_STATUSES.has(feature.statuses.design) || !STAGE_STATUSES.has(feature.statuses.dv)) throw new Error('Feature status is invalid')
    if (!Array.isArray(feature.requirements) || feature.requirements.length > 10000) throw new Error('Feature requirements are invalid')
    for (const requirement of feature.requirements) {
      assertString(requirement.id, 'Requirement ID'); assertString(requirement.title, 'Requirement title'); assertString(requirement.description, 'Requirement description')
      if (!['Functional', 'Performance', 'Safety', 'Interface'].includes(requirement.type) || !['Draft', 'Approved'].includes(requirement.status)) throw new Error('Requirement metadata is invalid')
    }
    for (const field of ['architecture', 'interfaces', 'behavior', 'resetAndErrors', 'performance']) assertString(feature.design?.[field], `Design ${field}`)
    for (const field of ['strategy', 'assertions', 'coverage', 'exclusions']) assertString(feature.verification?.[field], `Verification ${field}`)
    if (!Array.isArray(feature.verification?.scenarios) || feature.verification.scenarios.length > 10000) throw new Error('Verification scenarios are invalid')
    for (const scenario of feature.verification.scenarios) {
      assertString(scenario.id, 'Scenario ID'); assertString(scenario.title, 'Scenario title'); assertString(scenario.description, 'Scenario description')
      if (!['Simulation', 'Formal', 'Emulation', 'Inspection'].includes(scenario.method)) throw new Error('Scenario method is invalid')
      assertStringArray(scenario.linkedRequirements, 'Scenario requirement links')
    }
    assertStringArray(feature.dependencies, 'Feature dependencies')
    assertStringArray(feature.openQuestions, 'Feature open questions')
    assertString(feature.updatedAt, 'Feature update time')
  }
  for (const feature of project.features) if (feature.parentId !== null && !ids.has(feature.parentId)) throw new Error(`Unknown parent feature ID: ${feature.parentId}`)
  if (Buffer.byteLength(JSON.stringify(project), 'utf8') > MAX_PROJECT_BYTES) throw new Error('Project is too large')
  return project
}

async function readJson(filePath) {
  const stat = await fs.stat(filePath)
  if (!stat.isFile() || stat.size > MAX_JSON_BYTES) throw new Error(`Invalid or oversized JSON file: ${path.basename(filePath)}`)
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function atomicWrite(filePath, contents) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.writeFile(tempPath, contents, { encoding: 'utf8', mode: 0o600 })
    await fs.rename(tempPath, filePath)
  } finally {
    await fs.unlink(tempPath).catch(() => {})
  }
}

async function writeProject(projectPath, project) {
  validateProject(project)
  const featuresPath = path.join(projectPath, 'features')
  await fs.mkdir(featuresPath, { recursive: true })
  const { features, ...metadata } = project
  const manifest = { ...metadata, featureIds: features.map((feature) => feature.id) }
  await atomicWrite(path.join(projectPath, 'project.json'), JSON.stringify(manifest, null, 2))
  const expected = new Set()
  for (const feature of features) {
    const filename = `${assertSafeId(feature.id, 'Feature ID')}.json`
    expected.add(filename)
    const serialized = JSON.stringify(feature, null, 2)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_JSON_BYTES) throw new Error(`Feature is too large: ${feature.id}`)
    await atomicWrite(path.join(featuresPath, filename), serialized)
  }
  for (const entry of await fs.readdir(featuresPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json') && !expected.has(entry.name)) await fs.unlink(path.join(featuresPath, entry.name))
  }
  return project
}

async function readProject(projectPath) {
  const manifest = await readJson(path.join(projectPath, 'project.json'))
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 1) throw new Error('Unsupported or invalid project manifest')
  if (!Array.isArray(manifest.featureIds) || manifest.featureIds.length > MAX_FEATURES) throw new Error('Invalid feature index')
  const features = []
  const seen = new Set()
  for (const rawId of manifest.featureIds) {
    const id = assertSafeId(rawId, 'Feature ID')
    if (seen.has(id)) throw new Error(`Duplicate feature ID: ${id}`)
    seen.add(id)
    const feature = await readJson(path.join(projectPath, 'features', `${id}.json`))
    if (feature.id !== id) throw new Error(`Feature file identity mismatch: ${id}`)
    features.push(feature)
  }
  const metadata = { ...manifest }
  delete metadata.featureIds
  return validateProject({ ...metadata, features })
}

module.exports = { assertSafeId, readProject, validateProject, writeProject }
