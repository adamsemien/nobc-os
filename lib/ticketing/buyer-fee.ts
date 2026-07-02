/**
 * Buyer-pays-Stripe-fee gross-up. Pure money math, no I/O — same contract as
 * the rest of lib/ticketing: routes call it, tests prove it.
 *
 * NoBC nets the full ticket price; the buyer covers Stripe's processing fee
 * (2.9% + 30c on a standard US card charge). Solving
 *
 *   charged - (charged * 0.029 + 30) = price
 *
 * for the charged amount gives  charged = (price + 30) / (1 - 0.029),
 * rounded to the nearest cent.
 *
 * Integer-math notes: 1 - 0.029 = 971/1000 exactly, so
 * charged = round((price + 30) * 1000 / 971). 971 is prime, so the quotient
 * can never land exactly on a .5 rounding boundary; every intermediate is an
 * exact integer far below 2^53, so Math.round is deterministic here.
 *
 * The split is recoverable from the charged total alone:
 * base = round(charged * 971/1000 - 30) is EXACT for every integer price
 * (the forward rounding error e satisfies |e * 0.971| <= 0.4855 < 0.5).
 * That is what lets the checkout UI derive its line items from the single
 * amount the existing flow already threads down to the pay step. Proven by
 * a full sweep in tests/unit/buyer-fee.test.ts.
 *
 * Scope (2026-07-02 directive): always-on for every paid v1 gate. The
 * per-event toggle belongs to the dormant Event.serviceFee* columns in a
 * later pass — deliberately not wired here.
 */

const FLAT_CENTS = 30;
/** 1 - 2.9% as an exact rational: 971/1000. */
const NET_NUM = 971;
const NET_DEN = 1000;

export type BuyerFeeSplit = {
  /** The ticket price NoBC nets, in cents. */
  baseCents: number;
  /** The service fee the buyer covers, in cents. */
  feeCents: number;
  /** baseCents + feeCents — what the card is actually charged. */
  chargedCents: number;
};

/**
 * Gross a ticket price up so the buyer covers the Stripe fee. Free or
 * non-positive prices pass through unchanged with no fee — the fee only ever
 * rides on a real charge (callers gate the free path before charging anyway).
 */
export function grossUpForBuyer(priceCents: number): BuyerFeeSplit {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return { baseCents: priceCents, feeCents: 0, chargedCents: priceCents };
  }
  const chargedCents = Math.round(((priceCents + FLAT_CENTS) * NET_DEN) / NET_NUM);
  return { baseCents: priceCents, feeCents: chargedCents - priceCents, chargedCents };
}

/**
 * Recover the ticket/fee split from a charged total produced by
 * grossUpForBuyer — exact for every integer price (see module comment).
 * Display code uses this to render "Ticket / Service fee / Total" line items
 * from the single charged amount it receives.
 */
export function splitChargedCents(chargedCents: number): BuyerFeeSplit {
  if (!Number.isInteger(chargedCents) || chargedCents <= 0) {
    return { baseCents: chargedCents, feeCents: 0, chargedCents };
  }
  const baseCents = Math.round((chargedCents * NET_NUM) / NET_DEN - FLAT_CENTS);
  return { baseCents, feeCents: chargedCents - baseCents, chargedCents };
}
