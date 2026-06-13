# Stripe Checkout — Test Harness

> Repeatable harness for every payment flow. Companion to
> `EVENT-LAUNCH-ACTION-PLAN.md`. Use Stripe **test mode** keys and the **dev**
> Neon branch — never live keys, never the production DB.

---

## The four flows (and the code paths that serve them)

| # | Flow | Trigger | Capture | Webhook signal that confirms |
|---|---|---|---|---|
| 1 | **Ticketed** (no approval) | guest/member pays | **immediate** (`capture_method: 'automatic'`) | `payment_intent.succeeded` → `CAPTURED` + confirmation email |
| 2 | **Apply-or-pay** (`approvalRequired`) | buyer authorizes a hold (`capture_method: 'manual'`) | on **operator approval** via `POST /api/stripe/capture` | `payment_intent.amount_capturable_updated` → `AUTHORIZED` + email; `payment_intent.succeeded` on capture → `CAPTURED` |
| 3 | **Waitlist** | full event → email-notify, then **re-checkout** | n/a (no held PI on a waitlist entry) | — (re-checkout follows Flow 1/2) |
| 4 | **Refund** | operator `POST /api/stripe/refund` (full or partial), or Stripe Dashboard | full → `REFUNDED`; partial → `PARTIALLY_REFUNDED` | `charge.refunded` reconciles (cumulative `amount_refunded`) |

Webhook endpoint (canonical): **`/api/webhooks/nobc/stripe`**. It is idempotent
(`StripeEvent.stripeId` dedup), writes money state synchronously inside one
transaction before returning 200, and defers email/Svix/audit to `after()`.

> **Flow 3 is intentionally not off-session capture.** Every `WAITLISTED` RSVP is
> created by the free `/access/submit` routes and never carries a
> `stripePaymentIntentId`, so there is nothing to capture on promotion. The
> product's waitlist is notify-by-email then re-checkout.

---

## Prerequisites

1. **Test keys in `.env.local`**: `STRIPE_SECRET_KEY=sk_test_…`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`.
2. **Dev DB**: `DATABASE_URL` pointed at the Neon **dev** branch (not prod).
3. **Stripe CLI**: `brew install stripe/stripe-cli/stripe` then `stripe login`.
4. **CRON_SECRET** set if you want to test the capture backstop.

---

## Automated tests

```bash
# Unit (Vitest) — money-path logic, mocked Stripe/DB. Fast, no network.
npm run test:unit

# Just the payment-path suites:
node_modules/.bin/vitest run \
  tests/unit/stripe-webhook.test.ts \
  tests/unit/stripe-refund-route.test.ts \
  tests/unit/create-payment-intent-route.test.ts \
  tests/unit/guest-checkout-capacity.test.ts \
  tests/unit/waitlist-promote.test.ts \
  tests/unit/ticketing-pricing.test.ts

# E2E (Playwright) — full guest checkout, access gates, capacity/waitlist.
npm run test:e2e
```

**Webhook coverage** (`tests/unit/stripe-webhook.test.ts`): signature handling,
idempotency dedup short-circuit, `payment_intent.succeeded` capture with the
do-not-regress status guard + dedup-row write, `charge.refunded` full vs partial
(the partial path uses a monotonic raw `UPDATE` so a second partial reconciles
instead of being frozen out), P2002 → 200 deduped, other failure → 500.

**Refund coverage** (`tests/unit/stripe-refund-route.test.ts`): full, partial,
cumulative-to-full, over-refund 400, hold-cancel records $0, partial-on-hold 400,
already-refunded 409, ADMIN gate.

---

## Live test mode (Stripe CLI)

In one terminal, forward Stripe webhooks to your local app and copy the printed
`whsec_…` into `STRIPE_WEBHOOK_SECRET`:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/nobc/stripe
```

Then drive a real test-mode checkout in the browser, or fire events directly:

```bash
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.amount_capturable_updated
stripe trigger charge.refunded
stripe trigger charge.dispute.created
stripe trigger payment_intent.payment_failed
```

> `stripe trigger` events carry synthetic metadata, so they exercise the webhook's
> branching and idempotency but won't match a real RSVP. For end-to-end state
> changes, pay through the UI so the PI metadata carries the real
> `workspaceId`/`memberId`/`rsvpId`.

### Test cards

| Card | Behavior |
|---|---|
| `4242 4242 4242 4242` | succeeds immediately |
| `4000 0025 0000 3155` | requires 3-D Secure authentication |
| `4000 0000 0000 0002` | generic decline |
| `4000 0000 0000 9995` | insufficient funds |
| any future expiry, any CVC, any ZIP | accepted in test mode |

---

## Manual dress rehearsal (per flow)

Seed the events first (dev DB only — guarded):

```bash
npx tsx scripts/seed-test-ticketed-event.ts   # Flow 1 (slug e2e-stripe-ticket)
npx tsx scripts/seed-test-apply-event.ts       # Flow 2 (apply-or-pay)
npx tsx scripts/seed-payment-states.ts         # Flow 4 UI states (DB-only fixtures)
```

1. **Flow 1 — ticketed immediate capture.** Open `/e/e2e-stripe-ticket`, enter
   name/email, pay with `4242…`. Expect: `payment_intent.succeeded` →
   operator attendees tab shows **CAPTURED / confirmed**, buyer gets the
   confirmation email with QR. (Decision: ticketed captures immediately — no
   uncaptured hold to settle.)
2. **Flow 2 — apply-or-pay.** On the apply-required event, pay with `4242…`.
   Expect: `amount_capturable_updated` → **AUTHORIZED / held** + email. Operator
   **Approve** (or `POST /api/stripe/capture`) → **CAPTURED**. Operator **Reject**
   → PI canceled, hold released, no charge.
3. **Flow 3 — waitlist.** Fill the event to capacity; the next buyer is offered
   the waitlist (email-notify). When a seat frees, they receive the email and
   re-checkout through Flow 1/2.
4. **Flow 4 — refund.** On a CAPTURED ticket, open the attendees tab → refund
   modal. Issue a **full** refund (→ `REFUNDED`) and, on another, a **partial**
   (lower the amount → `PARTIALLY_REFUNDED`, still refundable up to the balance).
   On an uncaptured **hold**, the modal offers **Cancel authorization** (releases
   the hold, $0 moved). Verify `charge.refunded` reconciles the same state.

After each: confirm the **$1 live test** separately in production before the real
event (see the action plan) — test mode is the rehearsal, not the proof.

---

## Authorization expiry + the capture backstop

A manual-capture hold (Flow 2) **expires after ~7 days** if never captured — the
funds are released and the card is never charged. Backstops:

- **Primary capture** is the Stripe webhook (`payment_intent.succeeded` for Flow 1;
  the operator capture route for Flow 2).
- **Backstop**: `GET /api/cron/capture-payments` (Bearer `CRON_SECRET`) captures
  any `requires_capture` hold on a confirmed RSVP for events starting within 24h.
  Now scheduled in `vercel.json` (`0 12 * * *`). Requires `CRON_SECRET` set in the
  environment, or it fails closed (401).

Manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<host>/api/cron/capture-payments
```

---

## Reconciliation + idempotency (why the money state is trustworthy)

- **Dedup**: every event is recorded in `StripeEvent` (`stripeId` unique) in the
  same transaction as the money write. A redelivery short-circuits before
  re-applying state; a concurrent duplicate (P2002) returns 200.
- **PaymentIntent idempotency keys** are scoped to
  `(workspace, event, member, amount, capture_method)` so a double-tap reuses the
  same PI, but a price/mode change mints a fresh one (never charges a stale amount).
- **Refund idempotency keys** (`refund-<rsvp>-<cumulativeTarget>`, `cancel-<rsvp>`)
  make a retry after a failed DB write safe (no double-refund).
- **The webhook is the source of truth.** The operator refund route writes a fast
  path for immediate UI feedback; `charge.refunded` reconciles the final state
  (including Dashboard refunds and the second partial).

---

## Cleanup

```sql
DELETE FROM "RSVP"   WHERE "guestEmail" LIKE 'e2e-stripe+%@example.test';
DELETE FROM "RSVP"   WHERE "guestEmail" LIKE 'seed-paystate+%';
DELETE FROM "Member" WHERE email         LIKE 'e2e-stripe+%@example.test';
DELETE FROM "Member" WHERE email         LIKE 'seed-paystate+%';
DELETE FROM "Event"  WHERE slug = 'e2e-stripe-ticket';
```
