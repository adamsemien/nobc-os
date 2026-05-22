import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit-test layer. Scoped to tests/unit so it never collides with the
// Playwright E2E suite in tests/e2e (*.spec.ts). Resolves the single TS
// path alias from tsconfig.json: "@/*" -> project root.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
