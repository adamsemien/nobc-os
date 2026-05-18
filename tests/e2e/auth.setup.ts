import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';

const authDir = path.join(__dirname, '.auth');
const authFile = path.join(authDir, 'operator.json');

setup('authenticate operator', async ({ page }) => {
  // clerkSetup() in global.setup runs in a different Playwright worker process —
  // CLERK_TESTING_TOKEN doesn't propagate across process boundaries. Re-fetch here
  // so the route handler receives the token and can bypass rate-limits + 2FA.
  await clerkSetup();
  await setupClerkTestingToken({ page });

  // Navigate to a public page so Clerk JS initialises without a middleware redirect.
  // /apply is listed as public in the route matcher — no auth.protect() call.
  await page.goto('/apply');
  await page.waitForFunction(() => !!(window as any).Clerk?.loaded, { timeout: 15_000 });

  // Programmatic sign-in via the Clerk JS client running on the page.
  // This bypasses the hosted sign-in page, the dev-browser redirect loop, and 2FA
  // (which Clerk skips when the testing token is present in FAPI requests).
  const result = await page.evaluate(
    async ({ email, password }: { email: string; password: string }) => {
      const Clerk = (window as any).Clerk;
      try {
        const attempt = await Clerk.client.signIn.create({
          identifier: email,
          password,
          strategy: 'password',
        });
        if (attempt.status === 'complete') {
          await Clerk.setActive({ session: attempt.createdSessionId });
          return { ok: true };
        }
        return { ok: false, status: attempt.status };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    },
    {
      email: process.env.CLERK_TEST_OPERATOR_EMAIL!,
      password: process.env.CLERK_TEST_OPERATOR_PASSWORD!,
    },
  );

  if (!result.ok) {
    throw new Error(`Clerk programmatic sign-in failed: ${JSON.stringify(result)}`);
  }

  // Confirm the session lands on the protected operator page.
  await page.goto('/operator/applications');
  await page.waitForURL('**/operator/applications', { timeout: 30_000 });

  mkdirSync(authDir, { recursive: true });
  await page.context().storageState({ path: authFile });
});
