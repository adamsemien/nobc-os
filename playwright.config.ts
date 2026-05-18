import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Test-user creds come from .env.test.local; Clerk keys fall back to
// .env.local (dotenv never overrides an already-set var, so test creds win).
config({ path: '.env.test.local' });
config({ path: '.env.local' });

/** E2E config — Chromium only, drives the locally-running dev server on
 *  :3000. Auth is handled once by the setup projects, then reused via
 *  storageState so every spec starts already signed in as an operator. */
export default defineConfig({
  testDir: './tests/e2e',
  retries: 1,
  workers: 1,
  reporter: 'list',
  // Agent turns make several real AI round-trips — well past the 30s default.
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // Fetches the Clerk Testing Token for the whole run.
    { name: 'global setup', testMatch: /global\.setup\.ts/ },
    // Signs in the operator test user and saves storageState.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      dependencies: ['global setup'],
    },
    // The actual specs — start already authenticated.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/operator.json',
      },
      dependencies: ['setup'],
    },
  ],
});
