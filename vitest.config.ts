import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit-test layer. Scoped to tests/unit so it never collides with the
// Playwright E2E suite in tests/e2e (*.spec.ts). Resolves the single TS
// path alias from tsconfig.json: "@/*" -> project root.
export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" for Next's compiler; without an
  // override vitest's transformer (oxc in vitest 4 / rolldown-vite) inherits it
  // and leaves JSX untransformed, so importing any .tsx (e.g.
  // emails/GuestAccessConfirmation.tsx via the apply submit route) fails at
  // collection. Match Next's automatic JSX runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  // Inline empty PostCSS config: stops Vite from loading postcss.config.mjs
  // (Tailwind 4's plugin shape breaks in the vitest context) when a test
  // imports a module that side-imports CSS, e.g. NoBCEmailEditor's editor
  // stylesheets. Tests never need real CSS output.
  css: { postcss: { plugins: [] } },
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
