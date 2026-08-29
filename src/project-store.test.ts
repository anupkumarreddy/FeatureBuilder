import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sampleProject } from './sample'

const require = createRequire(import.meta.url)
const store = require('../electron/project-store.cjs') as {
  assertSafeId(value: unknown): string
  readProject(projectPath: string): Promise<typeof sampleProject>
  writeProject(projectPath: string, project: typeof sampleProject): Promise<typeof sampleProject>
}
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('desktop project storage', () => {
  it('round-trips the Git-friendly project folder format', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'featurebuilder-test-'))
    temporaryDirectories.push(directory)
    await store.writeProject(directory, sampleProject)
    await expect(store.readProject(directory)).resolves.toEqual(sampleProject)
  })

  it('rejects feature IDs that could escape the project folder', () => {
    expect(() => store.assertSafeId('../../outside')).toThrow(/unsupported characters/)
    expect(() => store.assertSafeId('valid_feature-01')).not.toThrow()
  })
})
