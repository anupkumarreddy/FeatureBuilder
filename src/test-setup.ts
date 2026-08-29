import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.useRealTimers()
})

// jsdom implements neither of these, and the app relies on both.
if (!('randomUUID' in crypto)) {
  Object.defineProperty(crypto, 'randomUUID', {
    value: () => `id-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`,
  })
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (typeof structuredClone === 'undefined') {
  globalThis.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value))
}
