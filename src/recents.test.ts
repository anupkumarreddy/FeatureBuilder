import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { coerce } = require('../electron/recents.cjs') as { coerce(value: unknown): string[] }

describe('recent projects cache', () => {
  // BUG-03: a cache file holding anything but an array made every save fail
  // with "current.filter is not a function".
  it('survives a cache file that is not an array', () => {
    expect(coerce(JSON.parse('{}'))).toEqual([])
    expect(coerce(null)).toEqual([])
    expect(coerce('/some/path')).toEqual([])
    expect(coerce(42)).toEqual([])
  })

  it('drops non-string and empty entries', () => {
    expect(coerce(['/a', 42, null, '', '/b'])).toEqual(['/a', '/b'])
  })

  it('caps the list', () => {
    expect(coerce(Array.from({ length: 30 }, (_, index) => `/p${index}`))).toHaveLength(8)
  })
})
