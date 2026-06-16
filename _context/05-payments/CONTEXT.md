# Stage 05 — Payments

> Stripe authorize/capture for ticketed events, operator-triggered refunds, Stripe webhook handling, compliance pages.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped (🟡 checkout-hardening on branch `feat/stripe-checkout-hardening`, not yet merged) |
| **V1 item** | #9, #10, #21 (comp tickets — payment-side bookkeeping), #25 (compliance pages) |
| **Last updated** | 2026-06-16 |
| **Owner** | Adam |
| **Blocked on** | Compliance pages legal review. Apply `prisma/sql/stripe-event.sql` to **production** before June 20 (StripeEvent table; webhook idempotency fails closed without it). |
| **Next** | **2026-06-16: overnight email harden (branch `chore/overnight-harden-2026-06-15`, NOT merged).** `rsvpConfirmedEmail`/`compTicketEmail` now render in Central (`America/Chicago`, were Eastern); em dashes removed from every subject/body (subjects to colon form); a hardening test suite (`tests/unit/email-hardening.test.ts`, `email-no-em-dash.test.ts`, `qr-route.test.ts`) locks no `data:` URIs, hosted https `/api/qr` images, `app.thenobadcompany.com` fallback, zero em dashes, and fail-closed `/api/qr`. FLAGGED (not built, awaiting approval): confirmation/comp fallback links still point at Clerk-gated `/m/.../confirmed` and `/check-in/verify` (WS1c public-route plan); the wrong-greeting-name report is data, not a template bug (WS1b). See `_context/_audit/EMAIL-SENDER-AUDIT-2026-06-16.md`. Earlier: (2026-06-13: branch `feat/stripe-checkout-hardening`, 10 commits, NOT merged — all 7 hardening phases done.) Merge after review, then: (1) `prisma db execute --file prisma/sql/stripe-event.sql` against prod Neon; (2) set `CRON_SECRET` in Vercel (capture-payments cron now scheduled in vercel.json); (3) Stripe test-mode dress rehearsal per `_context/_audit/STRIPE-TESTING.md`; (4) $1 live test. Earlier 2026-06-10 ticket-confirmation-email note is now subsumed. |

## Checkout hardening (2026-06-13, branch `feat/stripe-checkout-hardening`)

Seven-phase money-path hardening for the June 20 all-guest paid event. Decisions: ticketed (no approval) = **immediate capture**; apply-or-pay = authorize/hold, capture on operator approval; waitlist = notify-and-recheckout (no held PI, so **no off-session capture**); refund = full + partial.

- **Phase 1** `StripeEvent` idempotency model + additive `prisma/sql/stripe-event.sql` (apply to prod before launch).
- **Phase 2** Webhook rewrite: signature → dedup short-circuit → money-state writes synchronous in one `db.$transaction` (dedup row written in the same tx) → 200 → side effects via `after()`. Status guards (`notIn`) prevent regressing CAPTURED/REFUNDED/PARTIALLY_REFUNDED/DISPUTED; all writes workspace-scoped; P2002 → 200 deduped, else 500 for Stripe retry.
- **Phase 3a** `capture_method` conditional on `approvalRequired`; PI-create paymentStatus PENDING (AUTHORIZED only from `amount_capturable_updated`) so the immediate-capture email isn't gated off.
- **Phase 3b** Serializable capacity transactions folded into approve + plus-one; (workspace,event,member,**amount,capture_method**) idempotency keys on all three PI routes.
- **Phase 4** Operator **partial refunds** + cumulative tracking, reconciled by `charge.refunded` (monotonic raw UPDATE so a second partial isn't frozen out); L2 guard on `paymentStatus==='REFUNDED'`; M3 via Stripe idempotency keys + webhook-as-source-of-truth; hold-cancel records $0. RefundModal gains a partial-amount input.
- **Phase 6** Unit coverage: `stripe-webhook` (9), `stripe-refund-route` (8), `create-payment-intent-route` (2). Suite: 49 files / 454 green.
- **Phases 5+7** `capture-payments` cron scheduled (`0 12 * * *`) + hardened to write CAPTURED/capturedAt; `assertNotProduction()` seed guard + `seed-payment-states.ts`; `_context/_audit/STRIPE-TESTING.md` harness.
- Two adversarial tonone passes (spine+warden) drove fixes C1/C2/H1 + DISPUTED-safe reconciliation + narrowed cron filter; raw-SQL table/column casing verified against migrations.

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
lib/email-templates.ts                          ← rsvpConfirmedEmail (purchase, QR embedded when memberQrCode present + link fallback) + compTicketEmail (comp, QR embedded)
lib/ticket-confirmation.ts                      ← resolveTicketRecipient + shouldSendConfirmationEmail (pure helpers, unit-tested)
prisma/sql/stripe-event.sql                      ← additive StripeEvent table (webhook idempotency) — apply to prod via db execute, never db push
scripts/_seed-guard.ts                           ← assertNotProduction() shared seed guard
scripts/seed-payment-states.ts                   ← DB-only RSVP fixtures in every payment state (refund/capture UI QA)
tests/unit/stripe-webhook.test.ts                ← webhook contract (signature, dedup, capture, refund full/partial, P2002/500)
tests/unit/stripe-refund-route.test.ts           ← refund route (full/partial/cumulative/cancel/guards)
tests/unit/create-payment-intent-route.test.ts   ← C2 succeeded-PI 409 + H1 idempotency key
_context/_audit/STRIPE-TESTING.md                ← repeatable test harness (Stripe CLI, cards, per-flow rehearsal)
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

**The gap (the main ask) — FIXED 2026-06-10 (PR feat/ticket-confirmation-email):** Three defects confirmed and fixed:
1. **QR missing from `rsvpConfirmedEmail`** — the 2026-05-21 audit note claimed this was fixed but the template was still link-only. Now: `rsvpConfirmedEmail` accepts an optional `qrDataUrl?: string`; when present, embeds `<img src="…">` (mirrors `compTicketEmail`) with confirmed-page link as fallback. Both webhook branches (`checkout.session.completed` and `payment_intent.amount_capturable_updated`) now compute `QRCode.toDataURL(member.memberQrCode, …)` and pass it in.
2. **Dedup missing** — webhook had no guard against Stripe retry → duplicate emails. Fixed: `amount_capturable_updated` reads `rsvp.paymentStatus` before writing; `shouldSendConfirmationEmail()` returns false if already `AUTHORIZED`/`CAPTURED`. `checkout.session.completed` reads `ticketStatus` and breaks early if already `'confirmed'`.
3. **Guest recipient** — `resolveTicketRecipient()` canonicalizes the email address: uses `member.email` (the guest Member row, which `findOrCreateGuestMember` always populates from the typed address) with `rsvp.guestEmail` as a defensive fallback. Both member and guest buyers now receive the email at the correct address.

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
