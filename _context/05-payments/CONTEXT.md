# Stage 05 — Payments

> Stripe authorize/capture for ticketed events, operator-triggered refunds, Stripe webhook handling, compliance pages.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #9, #10, #21 (comp tickets — payment-side bookkeeping), #25 (compliance pages) |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | Compliance pages legal review |
| **Next** | Verify compliance pages are live + legally reviewed before flipping to live Stripe keys |

## Scope

All Stripe interactions. Authorize-on-RSVP, capture-on-check-in (or scheduled), operator-triggered refunds. Stripe webhook receiver. Compliance pages (terms, privacy, refund policy).

## Files in play

```
app/api/stripe/authorize/route.ts               ← create PaymentIntent, authorize-only
app/api/stripe/capture/route.ts                 ← capture authorized payment
app/api/stripe/refund/route.ts                  ← operator-triggered refund
app/api/stripe/webhook/route.ts                 ← Stripe webhook receiver
app/api/cron/capture-payments/route.ts          ← scheduled capture for confirmed events (no-shows / post-event)
app/legal/terms/page.tsx                        ← compliance page
app/legal/privacy/page.tsx                      ← compliance page
app/legal/refund-policy/page.tsx                ← compliance page
lib/stripe/client.ts                            ← Stripe SDK singleton
lib/stripe/idempotency.ts                       ← idempotency key generation
```

## Schema models owned

- **Order**: workspaceId, memberId, total, currency, status — the top-level commerce record
- **Payment**: order-level Stripe PaymentIntent record (authorize / capture / refund states)
- **Ticket**: issued ticket row attached to an Access (RSVP) for a ticketed event
- **TicketHold**: short-lived inventory hold during checkout
- **TicketTier**: lives in Stage 03 (event-side definition); referenced here at purchase time
- **PromoCode** + **PromoRedemption**: discount / comp eligibility

## Inputs

- RSVP submission for ticketed event (from stage 04) → triggers authorize
- Check-in event (from stage 06) → triggers capture
- Operator clicking refund (from stage 07) → triggers refund
- Stripe webhook events (`payment_intent.succeeded`, `charge.refunded`, etc.)

## Outputs

- Stripe PaymentIntent created
- `RSVP.stripePaymentIntentId` written
- `RSVP.refundedAt` set on refund
- Wallet pass revocation triggered on refund → stage 06
- `AuditEvent` for every payment action

## Rules — DO NOT VIOLATE

1. **Authorize/capture pattern, not charge-immediately.** Authorize on RSVP, capture on check-in (or scheduled job 24h post-event for no-shows).
2. **Refunds are operator-triggered only.** No member-facing self-refund. No auto-refund logic.
3. **Test mode until compliance pages are live AND legally reviewed.** Do not flip `STRIPE_SECRET_KEY` to live keys without sign-off.
4. **Every Stripe API call uses an idempotency key** derived from RSVP ID + action.
5. **Webhook signatures must be verified** using `STRIPE_WEBHOOK_SECRET`. Reject unsigned or invalidly-signed webhooks.
6. **On refund, fire the wallet pass revocation** (stage 06 will listen). Don't leave a refunded RSVP with an active pass.
7. **No PII in Stripe metadata beyond what's required.** Member name + event title is fine. No emails, no phones, no addresses.

## Environment variables

- `STRIPE_SECRET_KEY` — server-side Stripe API key (test mode for now)
- `STRIPE_WEBHOOK_SECRET` — for webhook signature verification
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — client-side for Stripe Elements

## What this stage does NOT own

- Access (RSVP) creation logic → `04-access/`
- Capacity enforcement → `04-access/`
- Wallet pass generation/revocation → `06-wallet-checkin/`
- Check-in trigger → `06-wallet-checkin/`
- Operator refund UI → `07-operator-dashboard/`
