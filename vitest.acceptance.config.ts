import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// DB-acceptance layer: tests in tests/acceptance run against the REAL database
// resolved from .env.local (dev Neon), so they are excluded from the default
// `npm run test:unit` suite and run explicitly:
//   npx vitest run --config vitest.acceptance.config.ts
export default defineConfig({
  test: {
    include: ['tests/acceptance/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    setupFiles: ['tests/acceptance/setup-env.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
