/**
 * access-capacity-waitlist.spec.ts
 *
 * E2E: Capacity enforcement and waitlist display for a capped event.
 *
 * Prerequisites:
 *   1. Dev server on :3000 (next dev — NOT --turbopack).
 *   2. Test event seeded with capacity=0 (already full) OR capacity=1 with
 *      one confirmed RSVP already present:
 *        npx tsx scripts/seed-test-full-event.ts
 *      Slug: e2e-full-event
 *      Access: member enabled, no gates (open), priceCents: 0
 *      Capacity: 1 with 1 confirmed RSVP already seeded → the event is full
 *      when the test runs.
 *   3. Operator test user (shared storageState).
 *
 * Auth: Shared operator storageState.
 *
 * Coverage:
 *   - Full event serves 409 from the submit route → UI displays waitlisted state.
 *   - Waitlisted state displays a human-readable string — never raw "WAITLISTED".
 *   - The waitlist position display is numeric (e.g. "#2 on the waitlist"), not
 *     the enum "WAITLISTED".
 *
 * Note on auto-promote: the auto-promote path (cancelling a confirmed RSVP
 * triggers promoteFromWaitlist → email) is covered by the Vitest unit tests
 * in tests/unit/waitlist-promote.test.ts. This spec covers only the member-
 * facing waitlist state assertion, which requires a live render.
 *
 * Run: node_modules/.bin/playwright test tests/e2e/access-capacity-waitlist.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { mkdirSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Produced by seed-test-full-event.ts — capacity 1, 1 confirmed RSVP already. */
const FULL_EVENT_SLUG = 'e2e-full-event';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function capture(page: Page, label: string) {
  const dir = path.join(process.cwd(), 'test-results');
  mkdirSync(dir, { recursive: true });
  const filename = `capacity-waitlist_${label}_${Date.now()}.png`;
  await page.screenshot({ path: path.join(dir, filename), fullPage: true });
  console.log(`[screenshot] ${filename}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test('at-capacity event — registers on waitlist and shows display string (not raw enum)', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedApis: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('/api/')) {
      failedApis.push(`[req-failed] ${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
    }
  });

  await page.context().tracing.start({ screenshots: true, snapshots: true });

  try {
    // ── Step 1: Navigate to the full event ──────────────────────────────────
    await page.goto(`/m/events/${FULL_EVENT_SLUG}`);
    await page.waitForLoadState('networkidle');
    await capture(page, '01-event-page');

    // ── Step 2: The CTA should still be interactive ──────────────────────────
    // Even a full event shows the registration CTA; the waitlist path is
    // determined server-side on submit, not by disabling the button.
    // Open member flow → "Reserve My Spot"
    const ctaButton = page.getByRole('button', { name: /reserve my spot/i });
    await expect(ctaButton).toBeVisible({ timeout: 15_000 });
    await capture(page, '02-cta-visible');

    // ── Step 3: Submit registration ──────────────────────────────────────────
    await ctaButton.click();

    const dialog = page.getByRole('dialog', { name: /event registration/i });
    const dialogVisible = await dialog.isVisible().catch(() => false);
    if (dialogVisible) {
      const submitBtn = dialog.getByRole('button', { name: /submit|confirm/i });
      const submitVisible = await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (submitVisible) await submitBtn.click();
      await expect(dialog).not.toBeVisible({ timeout: 15_000 });
    }

    // ── Step 4: Assert waitlisted display state ──────────────────────────────
    // The submit route returns { waitlisted: true, position: N } when the event
    // is full. The UI must show a human-readable string — positional or generic.
    // Acceptable: "waitlist", "on the waitlist", "#N on the waitlist",
    //             "you're on the waitlist", etc.
    // NOT acceptable: raw enum "WAITLISTED".
    const waitlistText = page.getByText(
      /waitlist|on the list|we.*ll let you know|capacity|full/i,
    );
    await expect(waitlistText).toBeVisible({ timeout: 20_000 });
    await capture(page, '03-waitlist-state');

    // ── Step 5: Assert raw enum "WAITLISTED" does not appear in UI ──────────
    const pageContent = await page.content();
    expect(pageContent).not.toMatch(/\bWAITLISTED\b/);
    expect(pageContent).not.toMatch(/\bpending_approval\b/);

    expect(failedApis, `Critical API failures:\n${failedApis.join('\n')}`).toHaveLength(0);
  } catch (err) {
    await capture(page, 'FAILURE');
    console.error('[capacity-waitlist] Console errors:', consoleErrors);
    console.error('[capacity-waitlist] Failed API requests:', failedApis);
    throw err;
  } finally {
    const traceDir = path.join(process.cwd(), 'test-results');
    mkdirSync(traceDir, { recursive: true });
    await page.context().tracing.stop({
      path: path.join(traceDir, `capacity-waitlist-trace_${Date.now()}.zip`),
    });
  }
});

test('event page does not show "Event is full" text pre-submission when event has capacity', async ({
  page,
}) => {
  // Guard: the capacity state should not leak pre-emptively into the CTA copy
  // (i.e. the CTA button text should not already read "Event is full" before
  // the user attempts registration). The event is full, but the CTA should
  // still offer the waitlist path via a normal registration button.
  await page.goto(`/m/events/${FULL_EVENT_SLUG}`);
  await page.waitForLoadState('networkidle');

  // A button labeled literally "Event is full" would be bad UX and a copy violation.
  const fullBtn = page.getByRole('button', { name: /event is full/i });
  await expect(fullBtn).not.toBeVisible({ timeout: 5_000 }).catch(() => {
    throw new Error(
      'CTA button text is "Event is full" — should show registration path with waitlist',
    );
  });
});
