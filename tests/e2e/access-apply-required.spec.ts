/**
 * access-apply-required.spec.ts
 *
 * E2E: Member applies to an approval-required event.
 *
 * Prerequisites:
 *   1. Dev server on :3000 (next dev — NOT --turbopack).
 *   2. Test event seeded:
 *        npx tsx scripts/seed-test-apply-event.ts
 *      Slug: e2e-apply-event
 *      Access: member enabled, gates: [{ type: 'application', approvalRequired: true }]
 *      priceCents: 0
 *   3. Operator test user (operator-e2e@thenobadcompany.com) with approved
 *      Member row — shared storageState handles auth.
 *
 * Auth: Shared operator storageState. operator resolveViewer → "member".
 * Because the operator is a Clerk org member + STAFF, loadAccessContext uses
 * the operator bypass if the member group is closed, but since this event's
 * member group is enabled with an application gate, the normal member path runs.
 *
 * Assertions lock canonical copy (CLAUDE.md §Canonical Terminology):
 *   - CTA: "Apply to Attend" (application gate with approvalRequired:true)
 *   - Pending state text: maps to a display string (never raw "WAITLISTED" or
 *     "pending_approval")
 *
 * Run: node_modules/.bin/playwright test tests/e2e/access-apply-required.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { mkdirSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Produced by seed-test-apply-event.ts */
const EVENT_SLUG = 'e2e-apply-event';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function capture(page: Page, label: string) {
  const dir = path.join(process.cwd(), 'test-results');
  mkdirSync(dir, { recursive: true });
  const filename = `apply-event_${label}_${Date.now()}.png`;
  await page.screenshot({ path: path.join(dir, filename), fullPage: true });
  console.log(`[screenshot] ${filename}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test('member applies to approval-required event — "Apply to Attend" → pending state', async ({
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
    // ── Step 1: Navigate to the event page ──────────────────────────────────
    await page.goto(`/m/events/${EVENT_SLUG}`);
    await page.waitForLoadState('networkidle');
    await capture(page, '01-event-page');

    // ── Step 2: Verify CTA — locked canonical term "Apply to Attend" ────────
    // application gate with approvalRequired:true → "Apply to Attend"
    // NEVER "RSVP", never "Register", never "Get Ticket"
    const ctaButton = page.getByRole('button', { name: /apply to attend/i });
    await expect(ctaButton).toBeVisible({ timeout: 15_000 });
    await capture(page, '02-cta-visible');

    // ── Step 3: Click CTA — modal opens ─────────────────────────────────────
    await ctaButton.click();

    const dialog = page.getByRole('dialog', { name: /event registration/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await capture(page, '03-dialog-open');

    // ── Step 4: Submit the application (no custom questions in the seed event)
    // The flow for an application gate with no visible questions is:
    //   buildSteps → ['submit'] for a member viewer with no visible questions
    // We look for a "Submit" button in the dialog.
    const submitBtn = dialog.getByRole('button', { name: /submit|apply|send application/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    await capture(page, '04-submit-visible');
    await submitBtn.click();

    // ── Step 5: Dialog closes (or shows a done screen) ───────────────────────
    // The application gate flow emits the RSVP with ticketStatus='pending_approval'.
    // The DoneScreen (or RsvpCard) should reflect a pending/applied state.
    // We do NOT assert "You're on the list" because that is for confirmed RSVPs.
    // We assert for a display string that maps to the pending state without
    // leaking the raw enum "pending_approval" or "WAITLISTED".
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
    await capture(page, '05-post-submit');

    // The RsvpCard for a pending_approval state shows a pending/applied label.
    // Match on common pending display text — the exact text is implementation-
    // defined but must never be the raw enum.
    const pendingText = page.getByText(
      /application (received|submitted|pending)|you.*ve applied|we.*ll be in touch|pending (review|approval)/i,
    );
    await expect(pendingText).toBeVisible({ timeout: 10_000 });
    await capture(page, '06-pending-state');

    // ── Step 6: Assert no raw enum values in the UI ─────────────────────────
    const pageContent = await page.content();
    expect(pageContent).not.toMatch(/\bWAITLISTED\b/);
    expect(pageContent).not.toMatch(/\bpending_approval\b/);

    expect(failedApis, `Critical API failures:\n${failedApis.join('\n')}`).toHaveLength(0);
  } catch (err) {
    await capture(page, 'FAILURE');
    console.error('[apply-event] Console errors:', consoleErrors);
    console.error('[apply-event] Failed API requests:', failedApis);
    throw err;
  } finally {
    const traceDir = path.join(process.cwd(), 'test-results');
    mkdirSync(traceDir, { recursive: true });
    await page.context().tracing.stop({
      path: path.join(traceDir, `apply-event-trace_${Date.now()}.zip`),
    });
  }
});

test('apply-required CTA reads "Apply to Attend" — not "RSVP" or "Register"', async ({
  page,
}) => {
  // Lightweight copy-compliance guard: confirms the locked label is present on
  // page load, without going through the full registration flow.
  await page.goto(`/m/events/${EVENT_SLUG}`);
  await page.waitForLoadState('networkidle');

  // Must show "Apply to Attend"
  const cta = page.getByRole('button', { name: /apply to attend/i });
  await expect(cta).toBeVisible({ timeout: 15_000 });

  // Must NOT show "RSVP" as a standalone CTA button
  const rsvpBtn = page.getByRole('button', { name: /^rsvp$/i });
  await expect(rsvpBtn).not.toBeVisible({ timeout: 3_000 }).catch(() => {
    throw new Error('CTA button labeled "RSVP" found on an apply-required event — violates locked copy');
  });

  // Must NOT show "Register" (that is the open-guest CTA)
  const registerBtn = page.getByRole('button', { name: /^register$/i });
  await expect(registerBtn).not.toBeVisible({ timeout: 3_000 }).catch(() => {
    throw new Error('"Register" CTA on an apply-required event — wrong copy branch');
  });
});
