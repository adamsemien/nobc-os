/**
 * access-comp-ticket.spec.ts
 *
 * E2E: Operator comp-ticket bypass on a paid (ticketed) event.
 *
 * The payment-intent route has a first-class "operator bypass" path: a STAFF+
 * operator of the workspace completes a paid RSVP WITHOUT a Stripe charge —
 * a COMPLIMENTARY ticket is minted instead. This lets operators test/preview
 * the full paid flow end-to-end without real money.
 *
 * This spec exercises that path directly, since the operator test user is the
 * shared storageState user.
 *
 * Prerequisites:
 *   1. Dev server on :3000 (NOT --turbopack).
 *   2. The standard ticketed test event seeded:
 *        npx tsx scripts/seed-test-ticketed-event.ts
 *      Slug: e2e-stripe-ticket  (same event used by guest-checkout.spec.ts)
 *   3. Operator test user (operator-e2e@thenobadcompany.com) with STAFF role
 *      and an approved Member row in the DB.
 *
 * Auth: Shared operator storageState.
 *
 * Assertions:
 *   - CTA reads "Get Ticket — $X" (not "RSVP")
 *   - Operator path completes with comp ticket (no Stripe payment needed)
 *   - Final state shows "You're on the list" (confirmed access, comp origin)
 *   - No raw enum values (TICKETED, CONFIRMED) in the page
 *
 * Note: This spec does NOT test real Stripe payment for operators. Real Stripe
 * payment (guest path) is tested in guest-checkout.spec.ts.
 *
 * Run: node_modules/.bin/playwright test tests/e2e/access-comp-ticket.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { mkdirSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Same event used by guest-checkout.spec.ts — $25 guest ticket */
const TICKETED_EVENT_SLUG = 'e2e-stripe-ticket';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function capture(page: Page, label: string) {
  const dir = path.join(process.cwd(), 'test-results');
  mkdirSync(dir, { recursive: true });
  const filename = `comp-ticket_${label}_${Date.now()}.png`;
  await page.screenshot({ path: path.join(dir, filename), fullPage: true });
  console.log(`[screenshot] ${filename}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test('operator completes paid event via comp bypass — "You\'re on the list"', async ({
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

  try {
    // ── Step 1: Navigate to the ticketed event ───────────────────────────────
    await page.goto(`/m/events/${TICKETED_EVENT_SLUG}`);
    await page.waitForLoadState('networkidle');
    await capture(page, '01-event-page');

    // ── Step 2: Verify CTA — "Get Ticket — $X" ──────────────────────────────
    // For an operator (member viewer) on a guest-ticketed event, the operator
    // bypass in the payment-intent route applies. The CTA is still the canonical
    // "Get Ticket — $X" format. We match by prefix since the seed price may
    // change; what matters is it includes "Get Ticket" and a dollar amount.
    const ctaButton = page.getByRole('button', { name: /get ticket.*\$/i });
    await expect(ctaButton).toBeVisible({ timeout: 15_000 });

    // Verify it contains a price (numeric digit after $)
    const ctaText = await ctaButton.textContent();
    expect(ctaText).toMatch(/get ticket — \$\d+/i);
    await capture(page, '02-cta-visible');

    // ── Step 3: Click — EventAccessFlow opens ───────────────────────────────
    await ctaButton.click();

    const dialog = page.getByRole('dialog', { name: /event registration/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await capture(page, '03-dialog-open');

    // ── Step 4: Operator bypass — the payment-intent route mints a comp ticket
    // The operator path on the payment-intent endpoint bypasses Stripe and
    // returns { comp: true, rsvpId, ticketStatus: 'confirmed' } directly.
    // The EventAccessFlow should handle this response and show the DoneScreen
    // without rendering the Stripe PaymentElement.
    //
    // Since the operator sends to POST /api/m/events/[slug]/access/payment-intent
    // and the route detects isOperator=true, the response bypasses Stripe entirely.
    //
    // Wait for the dialog to complete — either auto-close or show a done state.
    // The done screen headline for a comp is "Ticket confirmed" or similar.
    const doneText = dialog.getByText(/ticket confirmed|you.*re on the list|access confirmed/i);
    await expect(doneText).toBeVisible({ timeout: 30_000 });
    await capture(page, '04-done-screen');

    // ── Step 5: Close and verify on-page confirmed state ────────────────────
    const doneButton = dialog.getByRole('button', { name: /^done$/i });
    const doneVisible = await doneButton.isVisible({ timeout: 3_000 }).catch(() => false);
    if (doneVisible) await doneButton.click();

    // After modal closes, the RsvpCard should show the confirmed state.
    const successText = page.getByText(/you.*re on the list/i);
    await expect(successText).toBeVisible({ timeout: 10_000 });
    await capture(page, '05-success-state');

    // ── Step 6: Assert no raw enum values ───────────────────────────────────
    const pageContent = await page.content();
    expect(pageContent).not.toMatch(/\bTICKETED\b/);
    expect(pageContent).not.toMatch(/\bCONFIRMED\b/);

    expect(failedApis, `Critical API failures:\n${failedApis.join('\n')}`).toHaveLength(0);
  } catch (err) {
    await capture(page, 'FAILURE');
    console.error('[comp-ticket] Console errors:', consoleErrors);
    console.error('[comp-ticket] Failed API requests:', failedApis);
    throw err;
  }
});

test('ticketed event CTA shows price in dollars — never $0 (price-integrity guard)', async ({
  page,
}) => {
  // Price-integrity regression: if EventAccess Zod parsing silently strips
  // the 'gate' key (legacy format), guest.gates falls back to [] and
  // priceForResolved returns 0 — the CTA shows "Get Ticket — $0".
  // The seed script already uses the canonical gates[] format, so this
  // assertion guards against a regression where seed or app-code reverts
  // to the legacy shape.
  //
  // This test is stateless — it only reads the page and asserts the CTA label.

  await page.goto(`/m/events/${TICKETED_EVENT_SLUG}`);
  await page.waitForLoadState('networkidle');

  // The CTA must show a non-zero dollar amount.
  const ctaButton = page.getByRole('button', { name: /get ticket.*\$/i });
  await expect(ctaButton).toBeVisible({ timeout: 15_000 });

  const ctaText = await ctaButton.textContent() ?? '';

  // Guard: never $0
  expect(ctaText, 'Price-integrity regression: CTA shows $0 — EventAccess Zod parsing dropped the gates').not.toMatch(/get ticket — \$0(\.00)?$/i);

  // Must include a positive dollar amount
  const priceMatch = ctaText.match(/\$(\d+(?:\.\d+)?)/);
  expect(priceMatch, 'No dollar amount found in CTA').toBeTruthy();
  const priceValue = parseFloat(priceMatch![1]);
  expect(priceValue, 'CTA price must be > 0').toBeGreaterThan(0);
});
