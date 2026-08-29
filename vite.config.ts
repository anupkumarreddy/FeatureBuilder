/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * The single index.html has to allow the dev server's websocket, which has no
 * business being in a packaged build. Rewrite the policy at build time.
 */
function productionCsp(): Plugin {
  return {
    name: 'featurebuilder-production-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        const next = html.replace(
          /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/,
          (_match, start: string, end: string) => `${start}${PROD_CSP}${end}`,
        )
        if (next === html) throw new Error('Could not rewrite the Content-Security-Policy meta tag for production')
        return next
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), productionCsp()],
  base: './',
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
