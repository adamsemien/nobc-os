/**
 * guest-checkout.spec.ts
 *
 * E2E test: guest (non-member) Stripe ticketed checkout flow.
 *
 * Prerequisites before running:
 *   1. Dev server running on :3000 with plain webpack (NOT --turbopack):
 *        node_modules/.bin/next dev
 *   2. Test event seeded:
 *        npx tsx scripts/seed-test-ticketed-event.ts
 *   3. A Clerk user exists with NO approved Member row in the DB:
 *        CLERK_TEST_GUEST_EMAIL and CLERK_TEST_GUEST_PASSWORD in .env.test.local
 *      This user resolves as viewer="guest" because resolveViewer() returns
 *      "guest" when clerkUserId is set but member.status !== "APPROVED".
 *      Create the Clerk user in the dev dashboard; do NOT add them to any
 *      workspace org (they must have no approved Member record).
 *
 * Auth: This spec does NOT use the shared operator storageState. It signs in
 * as the guest test user inline so the Clerk session resolves to viewer="guest".
 *
 * Run: node_modules/.bin/playwright test tests/e2e/guest-checkout.spec.ts
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import path from 'path';
import { mkdirSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Matches the slug produced by seed-test-ticketed-event.ts */
const EVENT_SLUG = 'e2e-stripe-ticket';

/** Stripe test card that always succeeds, no 3DS. */
const STRIPE_CARD = {
  number: '4242 4242 4242 4242',
  expiry: '12/34',
  cvc: '123',
  zip: '42424',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Screenshot + label at each major checkpoint. */
async function capture(page: Page, label: string) {
  const dir = path.join(process.cwd(), 'test-results');
  mkdirSync(dir, { recursive: true });
  const filename = `guest-checkout_${label.replace(/\s+/g, '-')}_${Date.now()}.png`;
  await page.screenshot({
    path: path.join(dir, filename),
    fullPage: true,
  });
  console.log(`[screenshot] ${filename}`);
}

/**
 * Sign in as the guest test user via the Clerk JS client running on the page.
 * This is the same programmatic approach used by auth.setup.ts.
 * The guest user must exist in Clerk but have NO approved Member row.
 */
async function signInAsGuest(page: Page): Promise<void> {
  const email = process.env.CLERK_TEST_GUEST_EMAIL;
  const password = process.env.CLERK_TEST_GUEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'CLERK_TEST_GUEST_EMAIL and CLERK_TEST_GUEST_PASSWORD must be set in .env.test.local.\n' +
        'Create a Clerk user with no approved Member row — this is the guest viewer path.',
    );
  }

  // Load a public page so Clerk JS boots without a middleware auth.protect() redirect.
  await page.goto('/apply');
  await page.waitForFunction(() => !!(window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded, {
    timeout: 15_000,
  });

  const result = await page.evaluate(
    async ({ email: e, password: p }: { email: string; password: string }) => {
      const Clerk = (window as unknown as { Clerk: { client: { signIn: { create: (opts: Record<string, string>) => Promise<{ status: string; createdSessionId: string }> } }; setActive: (opts: { session: string }) => Promise<void> } }).Clerk;
      try {
        const attempt = await Clerk.client.signIn.create({
          identifier: e,
          password: p,
          strategy: 'password',
        });
        if (attempt.status === 'complete') {
          await Clerk.setActive({ session: attempt.createdSessionId });
          return { ok: true };
        }
        return { ok: false, status: attempt.status };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    { email, password },
  );

  if (!result.ok) {
    throw new Error(`Guest Clerk sign-in failed: ${JSON.stringify(result)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * This spec runs standalone — it does NOT use the shared operator storageState.
 * We override the project storageState by using a fresh context (via test.use)
 * and signing in inline as the guest user.
 */
test.use({
  // No storageState — start every test with a clean browser context.
  storageState: undefined,
});

test.beforeAll(async () => {
  // Re-initialise the Clerk testing token for this isolated spec run.
  // clerkSetup() fetches a short-lived testing token that suppresses bot
  // detection + 2FA so programmatic sign-in works.
  await clerkSetup();
});

// ─────────────────────────────────────────────────────────────────────────────
// Main test
// ─────────────────────────────────────────────────────────────────────────────

test('guest completes Stripe ticketed checkout and lands on "You\'re on the list"', async ({
  page,
}) => {
  // ── Telemetry collectors ────────────────────────────────────────────────────
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[console.error] ${msg.text()}`);
    }
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`[req-failed] ${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
  });

  // ── Unique guest identity per run ───────────────────────────────────────────
  // Tag with timestamp so DB rows are identifiable; cleanup targets
  //   LIKE 'e2e-stripe+%@example.test'
  const guestEmail = `e2e-stripe+${Date.now()}@example.test`;
  const guestName = 'E2E Test Guest';

  // ── Start Playwright trace ──────────────────────────────────────────────────
  await page.context().tracing.start({ screenshots: true, snapshots: true });

  try {
    // ── Step 1: Sign in as guest user ─────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInAsGuest(page);
    await capture(page, '01-signed-in');

    // ── Step 2: Navigate to the seeded event page ─────────────────────────────
    await page.goto(`/m/events/${EVENT_SLUG}`);
    // Wait for the page to hydrate — the CTA button is rendered client-side.
    await page.waitForLoadState('networkidle');
    await capture(page, '02-event-page');

    // ── Step 3: Verify and click the "Get Ticket" CTA ─────────────────────────
    // The CTA label is formatted by formatGateCTA() in lib/event-access.ts.
    // For a guest with gate="pay" + priceCents=2500 it resolves to
    // "Get Ticket — $25". We match by text prefix to be price-agnostic in
    // case the seed price changes.
    const ctaButton = page.getByRole('button', { name: /get ticket/i });
    await expect(ctaButton).toBeVisible({ timeout: 15_000 });
    await capture(page, '03-cta-visible');

    await ctaButton.click();

    // ── Step 4: EventAccessFlow modal opens (dialog role) ─────────────────────
    const dialog = page.getByRole('dialog', { name: 'Event registration' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await capture(page, '04-modal-open');

    // ── Step 5: GuestInfoStep — fill name + email ─────────────────────────────
    // The GuestInfoStep has two inputs: placeholder "First and last name" and
    // placeholder "you@email.com". Both are plain <input> elements (not inside
    // the Stripe iframe). Selectors confirmed from EventAccessFlow.tsx lines
    // 589 and 605.
    const nameInput = dialog.getByPlaceholder('First and last name');
    const emailInput = dialog.getByPlaceholder('you@email.com');

    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill(guestName);
    await emailInput.fill(guestEmail);
    await capture(page, '05-guest-info-filled');

    // Continue → button is a submit button in the guestInfo form.
    const continueBtn = dialog.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // ── Step 6: PayStep — wait for Stripe PaymentElement iframe ───────────────
    // PaymentElement renders in a cross-origin Stripe iframe. Stripe names the
    // iframe element with a "__privateStripeFrame" prefix. We wait for the
    // iframe to appear, then use frameLocator to interact with it.
    //
    // The loading state shows "Preparing secure checkout…" while the PI is being
    // minted. Wait for it to disappear before interacting with the iframe.
    await expect(
      dialog.getByText(/preparing secure checkout/i),
    ).not.toBeVisible({ timeout: 20_000 });

    await capture(page, '06-payment-form-loaded');

    // Stripe PaymentElement renders multiple iframes; the card number field is
    // in the iframe whose name starts with "__privateStripeFrame" and which
    // contains a card number input. We locate it by its accessible label.
    //
    // NOTE: Stripe's PaymentElement (unified) renders a single iframe that
    // contains the full payment form. The iframe name pattern is
    // "__privateStripeFrame<N>". We use the first matching frame.
    const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

    // Card number field — Stripe labels it "Card number" in the unified element.
    const cardNumberInput = stripeFrame.getByLabel(/card number/i);
    await expect(cardNumberInput).toBeVisible({ timeout: 20_000 });
    await cardNumberInput.fill(STRIPE_CARD.number);
    await capture(page, '07-card-number-filled');

    // Expiry date
    const expiryInput = stripeFrame.getByLabel(/expir/i);
    await expect(expiryInput).toBeVisible({ timeout: 5_000 });
    await expiryInput.fill(STRIPE_CARD.expiry);

    // CVC
    const cvcInput = stripeFrame.getByLabel(/cvc|cvv|security code/i);
    await expect(cvcInput).toBeVisible({ timeout: 5_000 });
    await cvcInput.fill(STRIPE_CARD.cvc);

    // ZIP / postal code (Stripe may show this depending on country)
    const zipInput = stripeFrame.getByLabel(/zip|postal/i);
    const zipVisible = await zipInput.isVisible().catch(() => false);
    if (zipVisible) {
      await zipInput.fill(STRIPE_CARD.zip);
    }

    await capture(page, '08-card-details-filled');

    // ── Step 7: Submit payment ────────────────────────────────────────────────
    // "Complete registration" is the submit button in PayForm (EventAccessFlow.tsx
    // line 855). It is OUTSIDE the Stripe iframe, in the modal itself.
    const payButton = dialog.getByRole('button', { name: /complete registration/i });
    await expect(payButton).toBeEnabled({ timeout: 10_000 });
    await capture(page, '09-before-submit');

    await payButton.click();

    // Stripe confirmPayment() with redirect:"if_required" completes in-page
    // for the 4242 test card. It should NOT redirect.
    // The PayForm calls onSuccess() which sets result.paid=true in EventAccessFlow.
    // DoneScreen then shows with heading "Ticket confirmed".

    // ── Step 8: Verify DoneScreen "Ticket confirmed" ──────────────────────────
    const doneHeading = dialog.getByText(/ticket confirmed/i);
    await expect(doneHeading).toBeVisible({ timeout: 30_000 });
    await capture(page, '10-done-screen');

    // ── Step 9: Close modal — assert "You're on the list" in the RsvpCard ─────
    // DoneScreen has a "Done" button that calls finishAndClose() → onComplete().
    // After onComplete, the flow sets rsvpState="confirmed" in RsvpCard which
    // renders the "You're on the list" text.
    const doneButton = dialog.getByRole('button', { name: /^done$/i });
    await expect(doneButton).toBeVisible();
    await doneButton.click();

    // Modal should close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // RsvpCard confirmed state: "You're on the list"
    // The text is rendered as You&rsquo;re on the list — Playwright matches
    // the decoded Unicode, so getByText works directly.
    const successText = page.getByText(/you.*re on the list/i);
    await expect(successText).toBeVisible({ timeout: 10_000 });
    await capture(page, '11-success-state');

    // ── Pass: dump telemetry ──────────────────────────────────────────────────
    if (consoleErrors.length > 0) {
      console.warn(`[telemetry] ${consoleErrors.length} console error(s) during checkout:`);
      consoleErrors.forEach((e) => console.warn(e));
    }
    if (failedRequests.length > 0) {
      console.warn(`[telemetry] ${failedRequests.length} failed network request(s):`);
      failedRequests.forEach((r) => console.warn(r));
    }
    // Filter out known noise: Stripe CSP violations, analytics, etc.
    // Only fail on requests to /api/ routes that fail.
    const criticalFailures = failedRequests.filter((r) => r.includes('/api/'));
    expect(criticalFailures, `Critical API requests failed:\n${criticalFailures.join('\n')}`).toHaveLength(0);
  } catch (err) {
    // ── Failure evidence ──────────────────────────────────────────────────────
    await capture(page, 'FAILURE');
    console.error('[guest-checkout] Test failed. Console errors collected:');
    consoleErrors.forEach((e) => console.error(e));
    console.error('[guest-checkout] Failed network requests:');
    failedRequests.forEach((r) => console.error(r));
    throw err;
  } finally {
    // Always save trace so failures are inspectable with `playwright show-trace`.
    const traceDir = path.join(process.cwd(), 'test-results');
    mkdirSync(traceDir, { recursive: true });
    await page.context().tracing.stop({
      path: path.join(traceDir, `guest-checkout-trace_${Date.now()}.zip`),
    });
  }
});
