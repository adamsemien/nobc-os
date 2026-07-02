# Access Gate Engine v3 - In-page PAY flow

> **Status: GREENLIT AND BUILT (2026-07-02).** Adam resolved Decision 1 as
> **auto-capture** (Option B - an authorization hold can lapse unclaimed ~7 days;
> auto-capture removes that failure mode and refunds stay equally easy), so the
> Option A verifier extension below was never needed - the M1 verifier is untouched.
> Built on `feat/gate-engine-m4-pay` (stacked on `feat/gate-engine-m4`), own clean
> commit, revertible independent of the rest of M4.
>
> **Safety rail as built:** the mint route refuses to create intents on a non-test
> Stripe key unless `GATE_PAY_LIVE_CHARGES=1` is explicitly set (PAY-D3). Merging
> this branch enables zero live-charge capability - flipping that env var is a
> separate deliberate step Adam takes.
>
> **Open questions resolved under standing authority (see deviation table in the
> M4-PAY report):**
> - **Tier support (PAY-D4):** flat `priceCents` per PAY node stands. Tiered doors
>   are composed, not configured: multiple PAY nodes under an ANY_N group, one per
>   tier - visible in the Builder like every other rule, no hidden pricing logic.
> - **Refund-revokes-proof (PAY-D5):** NOT built in this milestone, deliberately.
>   The only correct wiring points (the ADMIN refund route or a Stripe webhook
>   route) are frozen money routes - touching them needs Adam's explicit gate. The
>   blast radius of the gap is one event (PAY proofs carry NEVER) and the operator
>   who issued the refund is looking right at it. Recommended follow-up: pair proof
>   revocation with the operator proof-visibility surface, under its own gate.
>
> The original plan follows, kept for the record; deltas from as-built are noted above.

## What exists today (context)

- The M1 `PAY` verifier is read-only: given `{ paymentIntentId }`, it checks the
  intent is `succeeded`, currency matches, `amount_received >= priceCents`, and the
  intent belongs to the member (`metadata.memberId` or an RSVP/Ticket row carrying
  the intent id). Proof carries NEVER (per-event payment, §16.4 LOCKED).
- The M2/M4 guest walkthrough renders the PAY step as state + prompt
  ("Get Ticket - $X") with no action. The public submit API already accepts
  `{ nodeId, submission: { paymentIntentId } }` programmatically.
- The frozen v1 payment routes (`/api/e/[slug]/access/payment-intent`,
  `/api/stripe/*`) are untouched and stay untouched - this plan creates PARALLEL
  new surfaces only.

## ⚠ Decision required from Adam before build (money semantics)

**The house payment law is authorize/capture** (V1 item #9): v1 intents are created
with `capture_method: 'manual'`, and operators capture later. But a manually-captured
intent sits in `requires_capture` with `amount_received = 0` until capture - the M1
PAY verifier (which requires `succeeded` + `amount_received`) would call an
authorized-but-uncaptured ticket UNPAID. One of these must be chosen:

- **Option A (recommended): extend the verifier to accept authorization.**
  `requires_capture` with `amount_capturable >= priceCents` counts as SATISFIED, with
  `payload.captured: false` recorded honestly. Keeps the authorize/capture law: the
  gate opens on authorization exactly like a v1 ticket purchase holds a spot, and
  capture stays an operator action. Touches `lib/gate-engine/conditions/pay.ts`
  (one accepted-state branch + payload field + tests).
- **Option B: gate payments capture automatically.** `capture_method: 'automatic'` -
  the verifier needs no change, but gate tickets take money immediately, diverging
  from the house authorize/capture posture and from operator refund/capture muscle
  memory.

The rest of the plan is written assuming **Option A**; it works unchanged under B
minus the verifier edit.

## Design

### 1. Server: mint the payment intent (NEW route, nothing frozen touched)

`app/api/gate/[token]/payment-intent/route.ts` - POST, public token surface:

1. Rate limit: 6/min per token+IP (same limiter module as M4).
2. Load the session (`loadGuestGateContext`); 404 unknown/expired; 409 before identify.
3. Validate body `{ nodeId }`; the node must belong to the session's gate, be
   `conditionType: "PAY"`, and its config must parse (priceCents, currency).
4. **Established-truth guard:** if the member already holds a live SATISFIED proof on
   the node, return `{ alreadyPaid: true }` - never mint a second intent for a paid step.
5. Create the intent via the existing `lib/stripe.ts` singleton:
   - `amount: config.priceCents`, `currency: config.currency`
   - `capture_method: 'manual'` (Option A - house law)
   - `automatic_payment_methods: { enabled: true }`
   - `metadata: { kind: 'gate-pay', workspaceId, gateId, nodeId, memberId, gateSessionId }`
     - `metadata.memberId` is what the M1 verifier's ownership check reads - the
       intent is bound to the member at mint time, server-side.
   - **Stripe idempotency key:** `gate-pay:{sessionId}:{nodeId}:{priceCents}` - a
     double-click or retry reuses the same intent instead of minting duplicates; a
     price change by the operator changes the key, so a stale cheaper intent can
     never satisfy the new price (the verifier re-checks amount anyway - two layers).
6. Return `{ clientSecret }` only - never the full intent object.

### 2. Client: the pay step (NEW component)

- `lib/gate-engine/guest-view.ts`: `GuestStepAction` gains `"pay"` (PAY steps in
  `needed` state), mirroring the M4 `"apply"` pattern - still a designed union,
  never a registry key.
- `app/gate/[token]/_components/PayStep.tsx`: client component using
  `@stripe/react-stripe-js` `<PaymentElement>`:
  1. Button "Get Ticket - $X" (the engine's own prompt copy) → POST payment-intent →
     `clientSecret`.
  2. Render the Element inline in the step card (cream tokens; Stripe appearance API
     mapped to the design tokens - no hex literals in OUR code; Stripe's iframe
     styling uses its appearance variables).
  3. `stripe.confirmPayment({ redirect: 'if_required' })` - no redirect for cards.
  4. On confirm success → POST the existing public submit action
     `{ action: "submit", nodeId, submission: { paymentIntentId } }` → the M1
     verifier writes the proof → `router.refresh()` shows the step Done.
- Publishable key: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (already how the v1 flow
  loads Stripe on the client - confirm the exact var name at build time and reuse it).

### 3. Replay / abuse defenses (mostly already in place)

- **Replay a paid intent on another gate/member:** blocked today - ownership check
  (`metadata.memberId`) + per-event NEVER carry + the M1 "junk re-submission can
  never downgrade a real payment" established-truth guard.
- **Underpaid intent:** amount re-checked server-side at verification, not trusted
  from the client.
- **Duplicate mints:** Stripe idempotency key above; plus the alreadyPaid short-circuit.
- **Webhooks:** none needed - the verifier reads intent state server-side at submit
  time. (If Adam later wants async capture-state sync, that is a separate design.)

### 4. Test-mode rules

- All development and any demo run against `sk_test_` / `pk_test_` keys exclusively;
  the acceptance suite injects a fake `StripeIntentReader` (as M1 already does) so CI
  never touches Stripe at all.
- One optional E2E happy path with Stripe's `4242...` test card, env-gated off by
  default.

### 5. Exact files touched (all additive)

| File | Change |
|---|---|
| `app/api/gate/[token]/payment-intent/route.ts` | NEW - mint endpoint above |
| `app/gate/[token]/_components/PayStep.tsx` | NEW - Element flow |
| `app/gate/[token]/page.tsx` | render PayStep for `action: "pay"` |
| `lib/gate-engine/guest-view.ts` | `"pay"` arm on `GuestStepAction` |
| `lib/gate-engine/conditions/pay.ts` | Option A only: accept `requires_capture` + `amount_capturable`, `payload.captured` |
| `tests/unit/gate-engine/pay-flow.db.test.ts` | NEW - acceptance with injected intent reader |

Explicitly NOT touched: `/api/e/[slug]/access/payment-intent`, `/api/stripe/*`,
`EventAccessFlow.tsx`, `lib/event-access*.ts` - the frozen v1 money path stays frozen.

### 6. Open questions for Adam (beyond the capture decision)

1. Should a gate PAY step honor ticket tiers, or is flat `priceCents` per node the
   v3 model (tiers = multiple PAY nodes under an ANY group)? Plan assumes flat.
2. Refund semantics: v1 refunds are operator-driven via `/api/stripe/refund`. A
   refunded gate payment currently leaves the proof SATISFIED (per-event, no carry) -
   should a refund revoke the proof? Recommend: yes, as a small follow-up that
   deletes/expires the proof in the existing refund route's workspace-scoped flow -
   but that touches an ADMIN money route, so it needs its own explicit gate.
