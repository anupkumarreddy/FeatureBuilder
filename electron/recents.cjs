'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')

const FILE = 'recent-projects.json'
const LIMIT = 8

/**
 * BUG-03: this used to return whatever JSON.parse produced. A cache file
 * holding anything other than an array made every subsequent save fail with
 * "current.filter is not a function".
 */
function coerce(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.length > 0).slice(0, LIMIT)
}

function createRecents(userDataPath) {
  const filePath = path.join(userDataPath, FILE)

  async function read() {
    try {
      return coerce(JSON.parse(await fs.readFile(filePath, 'utf8')))
    } catch {
      return []
    }
  }

  async function remember(projectPath) {
    try {
      const current = await read()
      const next = [projectPath, ...current.filter((item) => item !== projectPath)].slice(0, LIMIT)
      await fs.writeFile(filePath, JSON.stringify(next, null, 2))
    } catch {
      // Recents are a convenience; never let them break a save.
    }
  }

  async function forget(projectPath) {
    try {
      const next = (await read()).filter((item) => item !== projectPath)
      await fs.writeFile(filePath, JSON.stringify(next, null, 2))
    } catch {
      // ignored
    }
  }

  return { coerce, forget, read, remember }
}

module.exports = { LIMIT, coerce, createRecents }
