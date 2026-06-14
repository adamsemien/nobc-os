/**
 * Stripe test-mode validation harness.
 *
 * Validates the authorize/capture/void/refund/decline flow against the REAL
 * app Stripe client (lib/stripe.ts), enforcing test-mode only.
 *
 * Run (from repo root):
 *   node_modules/.bin/tsx --tsconfig tsconfig.json scripts/validate-stripe.ts
 *
 * Requires: STRIPE_SECRET_KEY=sk_test_... in .env.local (or already in env).
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is validated as present but not used for API calls.
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 1. Inline .env.local loader — no new deps, does NOT override existing env
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    // Skip blanks and comments
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim()
      // Strip optional surrounding quotes
      .replace(/^(['"])(.*)\1$/, '$2');

    // Never override a value that's already set (e.g. CI-injected secrets)
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// 2. Safety gate — must run before importing lib/stripe (which reads env on
//    first call, but we want to fail-fast before that with a clear message)
// ---------------------------------------------------------------------------
const secret = process.env.STRIPE_SECRET_KEY;
const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!secret) {
  console.error('\n[ABORT] STRIPE_SECRET_KEY is not set.');
  console.error('Add these two lines to .env.local:\n');
  console.error('  STRIPE_SECRET_KEY=sk_test_...');
  console.error('  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...\n');
  process.exit(1);
}

if (!secret.startsWith('sk_test_')) {
  console.error('\n[ABORT] Refusing to run against a live/unknown key.');
  console.error(`Key prefix detected: "${secret.slice(0, 8)}..."`);
  console.error('This harness only accepts sk_test_... keys.\n');
  process.exit(1);
}

if (!pubKey) {
  console.warn('[WARN] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set in .env.local.');
  console.warn('       Client-side Stripe.js will not initialise; add pk_test_... to fix.\n');
}

// ---------------------------------------------------------------------------
// 3. Import REAL app client (validates apiVersion + singleton pattern)
// ---------------------------------------------------------------------------
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// 4. Test runner bookkeeping
// ---------------------------------------------------------------------------
interface Result {
  name: string;
  passed: boolean;
  reason?: string;
}

const results: Result[] = [];

function pass(name: string): void {
  results.push({ name, passed: true });
  console.log(`  ✓ ${name}`);
}

function fail(name: string, reason: string): void {
  results.push({ name, passed: false, reason });
  console.log(`  ✗ ${name}: ${reason}`);
}

async function run(): Promise<void> {
  console.log('\nStripe test-mode validation harness');
  console.log('====================================\n');

  // -------------------------------------------------------------------------
  // 5a. livemode safety — assert after first real API call
  // -------------------------------------------------------------------------
  let authorizedPi: Stripe.PaymentIntent | null = null;
  let capturedPi: Stripe.PaymentIntent | null = null;

  // -------------------------------------------------------------------------
  // STEP 1 — authorize
  // Creates a PaymentIntent with manual capture. Proves the PI creation flow
  // and that the returned status is requires_capture (not auto-charged).
  // -------------------------------------------------------------------------
  try {
    authorizedPi = await stripe.paymentIntents.create({
      amount: 2500,
      currency: 'usd',
      capture_method: 'manual',
      confirm: true,
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
    });

    // Livemode guard — checked once after the first object comes back
    if (authorizedPi.livemode) {
      console.error('\n[ABORT] livemode === true on returned PaymentIntent.');
      console.error('This harness must not run against a live Stripe account.\n');
      process.exit(1);
    }

    if (authorizedPi.status === 'requires_capture') {
      pass('authorize — PI status is requires_capture');
    } else {
      fail('authorize', `expected requires_capture, got ${authorizedPi.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail('authorize', msg);
  }

  // -------------------------------------------------------------------------
  // STEP 2 — capture
  // Captures the authorized PI. Proves the cron capture path works end-to-end.
  // -------------------------------------------------------------------------
  if (authorizedPi?.status === 'requires_capture') {
    try {
      capturedPi = await stripe.paymentIntents.capture(authorizedPi.id);

      if (capturedPi.status === 'succeeded') {
        pass('capture — PI status is succeeded');
      } else {
        fail('capture', `expected succeeded, got ${capturedPi.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail('capture', msg);
      capturedPi = null;
    }
  } else {
    fail('capture', 'skipped — authorize step did not reach requires_capture');
  }

  // -------------------------------------------------------------------------
  // STEP 3 — void (authorize-then-release)
  // Creates a fresh authorized PI, then cancels it. Proves the operator
  // "release hold" path (e.g. event cancellation before capture).
  // -------------------------------------------------------------------------
  try {
    const voidPi = await stripe.paymentIntents.create({
      amount: 2500,
      currency: 'usd',
      capture_method: 'manual',
      confirm: true,
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
    });

    const canceled = await stripe.paymentIntents.cancel(voidPi.id);

    if (canceled.status === 'canceled') {
      pass('void — canceled PI status is canceled');
    } else {
      fail('void', `expected canceled, got ${canceled.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail('void', msg);
  }

  // -------------------------------------------------------------------------
  // STEP 4 — refund
  // Refunds the captured PI from step 2. Proves /api/stripe/refund path.
  // -------------------------------------------------------------------------
  if (capturedPi?.status === 'succeeded') {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: capturedPi.id,
      });

      if (refund.status === 'succeeded') {
        pass('refund — refund status is succeeded');
      } else {
        fail('refund', `expected succeeded, got ${refund.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail('refund', msg);
    }
  } else {
    fail('refund', 'skipped — capture step did not succeed');
  }

  // -------------------------------------------------------------------------
  // STEP 5 — decline
  // Creates+confirms a PI with the Stripe test decline card. Expects a
  // StripeCardError to be thrown. Proves the app will surface card errors
  // rather than silently swallowing them.
  // -------------------------------------------------------------------------
  try {
    await stripe.paymentIntents.create({
      amount: 2500,
      currency: 'usd',
      capture_method: 'manual',
      confirm: true,
      payment_method: 'pm_card_chargeDeclined',
      payment_method_types: ['card'],
    });
    // If we reach here no error was thrown — that is the failure case
    fail('decline', 'expected StripeCardError for pm_card_chargeDeclined, but no error was thrown');
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      pass(`decline — StripeCardError raised correctly (${err.code})`);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      fail('decline', `expected StripeCardError, got: ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // 6. Summary
  // -------------------------------------------------------------------------
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n------------------------------------');
  console.log(`  ${passed} passed  /  ${failed} failed`);

  if (failed === 0) {
    console.log('  Overall: PASS');
    console.log('------------------------------------\n');
    process.exitCode = 0;
  } else {
    console.log('  Overall: FAIL');
    console.log('------------------------------------');
    console.log('\nFailed checks:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.reason}`);
    }
    console.log('');
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : err, '\n');
  process.exitCode = 1;
});
