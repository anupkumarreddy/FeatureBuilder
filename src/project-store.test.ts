import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertSafeId } from '../shared/schema.js'
import { sampleProject } from './sample'
import type { Project } from './types'

const require = createRequire(import.meta.url)
const store = require('../electron/project-store.cjs') as {
  isProjectDirectory(path: string): Promise<boolean>
  readProject(path: string): Promise<Project>
  writeProject(path: string, project: Project, options?: { adopt?: boolean }): Promise<Project>
}

const directories: string[] = []
const temp = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'featurebuilder-test-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('desktop project storage', () => {
  it('round-trips the Git-friendly project folder format', async () => {
    const directory = await temp()
    await store.writeProject(directory, sampleProject)
    await expect(store.readProject(directory)).resolves.toEqual(sampleProject)
  })

  it('writes one file per feature plus a manifest', async () => {
    const directory = await temp()
    await store.writeProject(directory, sampleProject)
    const manifest = JSON.parse(await readFile(join(directory, 'project.json'), 'utf8'))
    expect(manifest.featureIds).toEqual(sampleProject.features.map((feature) => feature.id))
    expect(manifest.features).toBeUndefined()
    await expect(readFile(join(directory, 'features', 'power.json'), 'utf8')).resolves.toContain('"Power Management"')
  })

  it('rejects feature IDs that could escape the project folder', () => {
    expect(() => assertSafeId('../../outside')).toThrow(/unsupported characters/)
    expect(() => assertSafeId('valid_feature-01')).not.toThrow()
  })

  it('removes feature files that are no longer part of the project', async () => {
    const directory = await temp()
    await store.writeProject(directory, sampleProject)
    const trimmed = { ...sampleProject, features: sampleProject.features.filter((feature) => feature.parentId === null) }
    await store.writeProject(directory, trimmed, { adopt: true })
    await expect(readFile(join(directory, 'features', 'clock-gating.json'), 'utf8')).rejects.toThrow()
  })

  // BUG-19: this used to delete unrecognised *.json in any chosen folder.
  it('refuses to adopt a folder holding unrelated files', async () => {
    const directory = await temp()
    await mkdir(join(directory, 'features'), { recursive: true })
    await writeFile(join(directory, 'features', 'someone-elses-data.json'), '{"keep":true}')

    await expect(store.writeProject(directory, sampleProject)).rejects.toThrow(/already contains other files/)
    await expect(readFile(join(directory, 'features', 'someone-elses-data.json'), 'utf8')).resolves.toContain('keep')
  })

  it('still writes into an empty folder or an existing project', async () => {
    const empty = await temp()
    await expect(store.writeProject(empty, sampleProject)).resolves.toBeTruthy()
    expect(await store.isProjectDirectory(empty)).toBe(true)
    await expect(store.writeProject(empty, sampleProject)).resolves.toBeTruthy()
  })

  it('reports a folder that is not a project', async () => {
    const directory = await temp()
    expect(await store.isProjectDirectory(directory)).toBe(false)
    await expect(store.readProject(directory)).rejects.toThrow()
  })

  // BUG-02 at the storage boundary.
  it('refuses to load a project whose parents form a cycle', async () => {
    const directory = await temp()
    await store.writeProject(directory, sampleProject)
    const featurePath = join(directory, 'features', 'power.json')
    const feature = JSON.parse(await readFile(featurePath, 'utf8'))
    feature.parentId = 'wakeup'
    await writeFile(featurePath, JSON.stringify(feature))

    await expect(store.readProject(directory)).rejects.toThrow(/its own ancestor/)
  })

  it('refuses a feature file whose id does not match its name', async () => {
    const directory = await temp()
    await store.writeProject(directory, sampleProject)
    const featurePath = join(directory, 'features', 'wakeup.json')
    const feature = JSON.parse(await readFile(featurePath, 'utf8'))
    feature.id = 'somethingelse'
    await writeFile(featurePath, JSON.stringify(feature))

    await expect(store.readProject(directory)).rejects.toThrow(/does not match its name/)
  })
})
