'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
// The validator is ESM (see shared/schema.js); a CommonJS module there cannot
// be imported by the renderer through Vite's dev server. Cache the one import.
let schemaPromise = null
const schema = () => (schemaPromise ??= import('../shared/schema.js'))

const MANIFEST = 'project.json'
const FEATURES_DIR = 'features'

async function readJson(filePath) {
  const { MAX_JSON_BYTES, SchemaError } = await schema()
  const stat = await fs.stat(filePath)
  if (!stat.isFile() || stat.size > MAX_JSON_BYTES) throw new SchemaError(`Invalid or oversized JSON file: ${path.basename(filePath)}`)
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

async function directoryEntries(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

/**
 * BUG-19: writeProject deletes every unrecognised *.json under features/.
 * Refuse to adopt a directory that already holds unrelated content unless it
 * is already a FeatureBuilder project.
 */
async function assertWritableTarget(projectPath) {
  const { SchemaError } = await schema()
  const entries = await directoryEntries(projectPath)
  if (entries.length === 0) return
  const hasManifest = entries.some((entry) => entry.isFile() && entry.name === MANIFEST)
  if (hasManifest) return
  const stray = entries.filter((entry) => !entry.name.startsWith('.'))
  if (stray.length > 0) {
    throw new SchemaError('That folder already contains other files. Choose an empty folder or an existing FeatureBuilder project.')
  }
}

async function writeProject(projectPath, project, { adopt = false } = {}) {
  const { MAX_JSON_BYTES, SchemaError, assertSafeId, utf8Bytes, validateProject } = await schema()
  validateProject(project)
  if (!adopt) await assertWritableTarget(projectPath)

  const featuresPath = path.join(projectPath, FEATURES_DIR)
  await fs.mkdir(featuresPath, { recursive: true })

  const { features, ...metadata } = project
  const manifest = { ...metadata, featureIds: features.map((feature) => feature.id) }
  await atomicWrite(path.join(projectPath, MANIFEST), JSON.stringify(manifest, null, 2))

  const expected = new Set()
  for (const feature of features) {
    const filename = `${assertSafeId(feature.id, 'Feature ID')}.json`
    expected.add(filename)
    const serialized = JSON.stringify(feature, null, 2)
    if (utf8Bytes(serialized) > MAX_JSON_BYTES) throw new SchemaError(`Feature is too large to save: ${feature.key}`)
    await atomicWrite(path.join(featuresPath, filename), serialized)
  }

  for (const entry of await directoryEntries(featuresPath)) {
    if (entry.isFile() && entry.name.endsWith('.json') && !expected.has(entry.name)) {
      await fs.unlink(path.join(featuresPath, entry.name))
    }
  }
  return project
}

async function readProject(projectPath) {
  const { MAX_FEATURES, SchemaError, assertSafeId, validateProject } = await schema()
  const manifest = await readJson(path.join(projectPath, MANIFEST))
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 1) {
    throw new SchemaError('That folder does not contain a FeatureBuilder project')
  }
  if (!Array.isArray(manifest.featureIds) || manifest.featureIds.length > MAX_FEATURES) {
    throw new SchemaError('The project index is missing or damaged')
  }

  const features = []
  const seen = new Set()
  for (const rawId of manifest.featureIds) {
    const id = assertSafeId(rawId, 'Feature ID')
    if (seen.has(id)) throw new SchemaError(`Duplicate feature ID: ${id}`)
    seen.add(id)
    const feature = await readJson(path.join(projectPath, FEATURES_DIR, `${id}.json`))
    if (!feature || feature.id !== id) throw new SchemaError(`Feature file does not match its name: ${id}.json`)
    features.push(feature)
  }

  const metadata = { ...manifest }
  delete metadata.featureIds
  return validateProject({ ...metadata, features })
}

/** True when the directory already looks like a FeatureBuilder project. */
async function isProjectDirectory(projectPath) {
  try {
    const stat = await fs.stat(path.join(projectPath, MANIFEST))
    return stat.isFile()
  } catch {
    return false
  }
}

/** Validate a project without touching the filesystem. */
async function validateProject(project) {
  const { validateProject: validate } = await schema()
  return validate(project)
}

module.exports = { isProjectDirectory, readProject, validateProject, writeProject }
