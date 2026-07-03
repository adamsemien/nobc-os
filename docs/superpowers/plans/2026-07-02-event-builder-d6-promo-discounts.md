# D6 - Partial-Discount Promo Codes Through the PAY Verifier

> Build contract for Phase 1 of the 2026-07-02 two-phase directive. The prior
> report's follow-up #2: partial-discount codes validate but refuse redemption
> because the PAY verifier's amount >= price replay defense would reject a
> discounted charge. Fix shape: server-stamped discount metadata. No schema
> changes (the PromoCode model is confirmed sufficient).

**Goal:** percent and fixed discount codes redeem end to end at the gate PAY
step - discount computed and stamped server-side at intent mint, validated by
the verifier against the stamp, recorded on the Order with a PromoRedemption
row, raced safely on maxUses, surfaced in the builder rail.

## Decisions (D6-1 .. D6-10)

- **D6-1 - one guest input, server classifies.** The pay step keeps a single
  "Have a code?" field. The mint route resolves the code: comp-class codes
  (discountType `comp`, or `percent` at 100) get `{ compCode: true }` and the
  client routes them through the EXISTING `redeem_comp` zero-Stripe machinery -
  no second zero-charge path exists (directive requirement 5, ROUTE option).
  Partial codes mint a discounted intent.
- **D6-2 - discount math.** percent: `discountCents = round(base * pct / 100)`
  (creation caps percent at 1-99). flat: `discountCents = value` in cents (the
  schema's fixed-amount DiscountType value is named `flat` - the directive's
  "fixed" maps to it; no schema change). Any code whose discount would zero or
  invert the price at redemption is REFUSED (flat > price = refuse, not clamp)
  with guest copy
  "That code covers the full ticket - ask your host for a comp code instead."
- **D6-3 - fee on the discounted price.** The service fee is computed on what
  the guest actually pays: `applyServiceFee(base - discount, policy)`. Line
  items: Ticket (base) / Discount (-d) / Service fee / Total, and
  `total = base - discount + fee` exactly.
- **D6-4 - server stamp at mint.** The mint route stamps
  `promoCodeId, promoCode, baseCents, discountCents, discountedCents` into the
  intent metadata next to the existing split. The idempotency key gains a
  promo segment only when a code applies, so code changes mint fresh intents.
- **D6-5 - verifier honors the stamp only node-bound.** The PAY verifier
  accepts the discounted amount ONLY when the intent metadata is our own mint
  stamp (`kind === "gate-pay"`), names THIS node and workspace, and carries a
  sane discounted price (integer, 0 < discounted < configured price). Then the
  defense is `amount_received >= discountedCents`. Any other intent keeps the
  untouched `amount_received >= config.priceCents` defense - a discounted
  intent minted for a cheap node can never satisfy an expensive one.
  `VerifyArgs` gains `nodeId` (additive; the orchestrator supplies it).
- **D6-6 - claim point = the record transaction (D9 reuse).** The guarded
  `usedCount < maxUses` increment runs inside `recordPaidAdmission`'s
  transaction, exactly like comp codes. A race loser after a real charge gets
  the Phase F capacity-race treatment: admission rolls back, the charge is
  auto-refunded, the proof is expired, `gate.promo_race_refunded` alerts. The
  mint route pre-checks the code non-atomically so the practical window is
  mint-to-confirm seconds.
- **D6-7 - scope.** Gate PAY redeems event-scoped codes only (workspace +
  eventId match, case-insensitive). Codes carrying `tierId` or `seriesId` do
  not redeem at a gate - a PAY node has no tier, and series redemption is out
  of scope for this phase.
- **D6-8 - per-customer cap.** `maxUsesPerCustomer` counts PromoRedemption
  rows through `order.buyerMemberId` (comp parity), checked at mint and
  re-checked inside the record transaction.
- **D6-9 - honest records.** Order: `subtotalCents = base`,
  `promoDiscountCents = discount`, `totalCents = amount received`,
  `promoCodeId` linked. PromoRedemption: `amountSavedCents = discount`, linked
  to the Order. The proof payload carries the promo facts the bridge reads.
- **D6-10 - builder surface.** Discount create (code, percent/fixed, value,
  maxUses, per-customer cap, window) lives inside the existing codes area of
  the rail - no new top-level section. Deactivate reuses validUntil = now.

## Files

- `lib/gate-engine/types.ts` - VerifyArgs.nodeId (additive)
- `lib/gate-engine/orchestrate.ts` - pass node.id at the verify call
- `lib/gate-engine/conditions/pay.ts` - stamp-aware replay defense + payload
- `lib/commerce/service-fee.ts` - discount-aware line items
- `lib/commerce/promo-codes.ts` - checkDiscountCode (+ shared window/caps)
- `app/api/gate/[token]/payment-intent/route.ts` - promoCode body + stamping
- `lib/commerce/orders.ts` - promo-aware recordPaidAdmission + guarded claim
- `lib/commerce/gate-bridge.ts` - promo payload + race-lose refund path
- `app/gate/[token]/_components/PayStep.tsx` - unified code entry + Discount row
- `lib/builder/actions.ts` - createDiscountCode + discountCodes state
- `app/operator/events/[id]/builder/BuilderShell.tsx` - discount codes UI
- `tests/unit/service-fee.test.ts` (extend), `tests/unit/gate-engine/promo-discount.db.test.ts` (new)

## Acceptance (all on real ep-sweet-term rows)

1. percent applied correctly (exact cents)
2. fixed applied correctly (exact cents)
3. fixed > price refused (documented choice: refuse, comp-code copy)
4. expired code refused
5. maxUses cap raced - exactly one of two concurrent redemptions lands
6. wrong-event scope refused
7. replay defense intact: non-discounted intent below price rejected;
   discounted stamp for a DIFFERENT node rejected at full price
8. fee math on the discounted base: 2500 with 1500 off -> 1000 ->
   pass_stripe_only gross-up -> total 1061, fee 61; line items sum exactly
