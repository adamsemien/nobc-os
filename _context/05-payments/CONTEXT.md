# Stage 05 — Payments

> Stripe authorize/capture for ticketed events, operator-triggered refunds, Stripe webhook handling, compliance pages.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #9, #10, #21 (comp tickets — payment-side bookkeeping), #25 (compliance pages) |
| **Last updated** | 2026-06-09 |
| **Owner** | Adam |
| **Blocked on** | Compliance pages legal review |
| **Next** | **2026-06-09:** checkout-flow fix agent dispatched (branch `fix/checkout-flow`, PR to follow — verify + fix the ticketed money path: error map surfaced to the user, double-submit/idempotency, capacity race, past-event purchase gate, webhook-delay UX). Stripe confirmed **test mode** locally (`sk_test`/`pk_test` in `.env.local`); going live remains blocked on compliance-page legal review. — Verify compliance pages are live + legally reviewed before flipping to live Stripe keys. (2026-05-21: the link-only confirmation email now embeds a scannable QR — see Audit findings → "The gap". Test a full purchase in Stripe test mode to confirm the QR arrives + scans.) |

## Scope

All Stripe interactions. Authorize-on-RSVP, capture-on-check-in (or scheduled), operator-triggered refunds. Stripe webhook receiver. Compliance pages (terms, privacy, refund policy).

## Files in play

```
app/api/stripe/create-payment-intent/route.ts   ← create PaymentIntent, authorize-only (capture_method: manual). [was listed as stripe/authorize — that path does not exist]
app/api/stripe/checkout/route.ts                 ← hosted Stripe Checkout Session path (alternative to inline Elements)
app/api/stripe/capture/route.ts                 ← capture authorized payment
app/api/stripe/refund/route.ts                  ← operator-triggered refund
app/api/webhooks/nobc/stripe/route.ts           ← canonical Stripe webhook receiver (status flips + confirmation email + Svix). [was listed as app/api/stripe/webhook — that path does not exist]
app/api/webhooks/stripe/route.ts                ← flat re-export of the canonical handler above
app/api/cron/capture-payments/route.ts          ← scheduled capture for confirmed events (no-shows / post-event)
app/terms/page.tsx                              ← compliance page (route: /terms)
app/privacy/page.tsx                            ← compliance page (route: /privacy)
app/refund-policy/page.tsx                      ← compliance page (route: /refund-policy)
lib/email-templates.ts                          ← rsvpConfirmedEmail (purchase, link-only) + compTicketEmail (comp, QR embedded)
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

## Audit findings — purchase → confirmation pipeline (2026-05-21, code-verified, read-only)

End-to-end traced. Two parallel pay paths feed one webhook; both end at a link-only email.

**Pipeline (file:line):**
1. Buyer clicks Get Ticket → either `app/api/stripe/checkout/route.ts:74-102` (hosted, RSVP `ticketStatus:'held'` + Checkout Session, `rsvpId/workspaceId/memberId/eventId` in metadata) **or** `app/api/stripe/create-payment-intent/route.ts:98-129` (inline Elements, `capture_method:'manual'`).
2. Stripe fires → webhook `app/api/webhooks/nobc/stripe/route.ts`:
   - `checkout.session.completed` (`:25`) → RSVP `ticketStatus:'confirmed', status:'CONFIRMED'` (`:43-46`)
   - `payment_intent.amount_capturable_updated` (`:93`) → `+ paymentStatus:'AUTHORIZED'` (`:101-104`)
   - `payment_intent.succeeded` (`:158`) → `paymentStatus:'CAPTURED', capturedAt` (`:166-169`)
   - Each writes an `AuditEvent` + emits Svix `rsvp.confirmed`.
3. Confirmation email sent inline via `resend.emails.send` (`:82-87` / `:149-151`), `from: NoBC <team@thenobadcompany.com>` ✅, template `rsvpConfirmedEmail` (`lib/email-templates.ts:10-40`).
4. Email body = **a text link only** (`lib/email-templates.ts:35-36`) to `/m/events/[slug]/confirmed?rsvpId=…`. The QR is rendered live on that authenticated page, **not in the email**.

**Models written on payment:** only `RSVP` + `AuditEvent`. The `Ticket` model (`schema.prisma:450-472`) is **never created** (`db.ticket.create` exists only in the dev reset's `deleteMany`) — the RSVP *is* the ticket. The `Order`/`Payment` models this CONTEXT lists as "owned" are **defined but unwritten** in the purchase path (`ticketing.order.create` is a stub, `lib/mcp/legacy-tools.ts:456`); buyer identity rides on `RSVP.memberId` + `RSVP.stripePaymentIntentId`.

**The gap (the main ask) — FIXED 2026-05-21:** the webhook now computes `QRCode.toDataURL(member.memberQrCode, { width: 400, margin: 1 })` at both send sites (added `memberQrCode` to the member `select`) and passes it to `rsvpConfirmedEmail`, which embeds the QR `<img>` (mirrors `compTicketEmail`) while keeping the confirmed-page link as a fallback. The QR encodes the buyer's `memberQrCode`, which is exactly what the door scanner matches — see `06-wallet-checkin` → "Fix applied" for the Member-QR minting change (new buyers now always have a `memberQrCode`) and the wallet-button removal.

## What this stage does NOT own

- Access (RSVP) creation logic → `04-access/`
- Capacity enforcement → `04-access/`
- Wallet pass generation/revocation → `06-wallet-checkin/`
- Check-in trigger → `06-wallet-checkin/`
- QR generation + delivery-to-buyer mechanics (the email *send* is here; the QR *content* gap is tracked in `06-wallet-checkin`)
- Operator refund UI → `07-operator-dashboard/`

## Backlog (V1.5)

- **Door sales flow** — staff-facing one-screen checkout on `/check-in/[slug]`. Name + phone/email, Apple Pay or Stripe tap-to-pay, instant QR via SMS or on-screen. Under 30 seconds per transaction. *(SMS delivery routes through Stage 14 House Phone — outbound Twilio in nobc-os via `lib/twilio.ts` + `/api/sms/reply`. Runtype was scratched for SMS; the Twilio override in root `CLAUDE.md` is scoped to House Phone only.)* **V1.5.**
- **Ticket tier cutoffs** — a tier auto-closes when its cutoff time passes OR sold quantity hits its limit. Critical for early bird pricing. **Schema check (done):** `TicketTier` already carries the needed fields — `startsAt` / `endsAt` (DateTime?) for the time window and `quantity` + `soldCount` for the inventory cap, plus `manuallyOpened` / `manuallyClosed` and `autoOpenTrigger` for progression. **No `cutoffAt` column is needed** (`endsAt` is the cutoff time, `startsAt` the open time). What's missing is the *enforcement logic* that closes a tier when `endsAt` passes or `soldCount >= quantity`. **V1.5.**
