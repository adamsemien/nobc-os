/** PAY verifier discount stamp (D6) - pure truth table, no DB, no Stripe.
 *
 *  The stamp lowers the required amount ONLY when it binds to exactly the
 *  node + workspace under verification and its integers reconcile. Every
 *  other shape falls back to the full-price replay defense - proven here
 *  alongside the untouched non-discounted path.
 */
import { describe, expect, it } from "vitest";
import type { Member } from "@prisma/client";
import {
  createPayCondition,
  readDiscountStamp,
  type StripeIntentSnapshot,
} from "@/lib/gate-engine/conditions/pay";
import { discountForPromo } from "@/lib/commerce/promo-codes";

const WORKSPACE = "ws_paydisc";
const NODE = "node_paydisc";
const MEMBER = { id: "mem_paydisc" } as Member;
const RESOURCE = { type: "EVENT" as const, id: "ev_paydisc" };

const config = { priceCents: 2500, currency: "usd" };

/** A discounted intent as our mint route stamps it: $25.00 ticket, $15.00
 *  off, $10.00 received (absorb - no fee), bound to NODE in WORKSPACE. */
function stampedIntent(
  overrides: Partial<StripeIntentSnapshot> & {
    metadata?: Record<string, string>;
  } = {},
): StripeIntentSnapshot {
  return {
    id: "pi_disc_1",
    status: "succeeded",
    amount_received: 1000,
    currency: "usd",
    ...overrides,
    metadata: {
      kind: "gate-pay",
      workspaceId: WORKSPACE,
      nodeId: NODE,
      memberId: MEMBER.id,
      promoCodeId: "promo_1",
      promoCode: "SUMMER",
      baseCents: "2500",
      discountCents: "1500",
      discountedCents: "1000",
      ...(overrides.metadata ?? {}),
    },
  };
}

function payWith(intent: StripeIntentSnapshot | null) {
  return createPayCondition({
    readIntent: async () => intent,
    ownsIntent: async () => false,
  });
}

function args(nodeId: string = NODE) {
  return {
    config: config as never,
    submission: { paymentIntentId: "pi_disc_1" },
    member: MEMBER,
    workspaceId: WORKSPACE,
    resource: RESOURCE,
    nodeId,
  };
}

describe("PAY discount stamp (D6)", () => {
  it("honors a node-bound stamp: the discounted amount satisfies", async () => {
    const outcome = await payWith(stampedIntent()).verify(args());
    expect(outcome.outcome).toBe("SATISFIED");
    expect(outcome.payload).toMatchObject({
      promoCodeId: "promo_1",
      promoCode: "SUMMER",
      baseCents: 2500,
      discountCents: 1500,
    });
  });

  it("a stamp minted for a DIFFERENT node never lowers this node's price", async () => {
    const outcome = await payWith(stampedIntent()).verify(args("node_other"));
    expect(outcome).toMatchObject({
      outcome: "REJECTED",
      reason: "amount_below_price",
    });
  });

  it("a stamp from another workspace never lowers the price", async () => {
    const foreign = stampedIntent({ metadata: { workspaceId: "ws_other" } });
    const outcome = await payWith(foreign).verify(args());
    expect(outcome).toMatchObject({
      outcome: "REJECTED",
      reason: "amount_below_price",
    });
  });

  it("inconsistent integers (base - discount != discounted) fall back to full price", async () => {
    const crooked = stampedIntent({ metadata: { discountedCents: "900" } });
    const outcome = await payWith(crooked).verify(args());
    expect(outcome).toMatchObject({
      outcome: "REJECTED",
      reason: "amount_below_price",
    });
  });

  it("a stamp at or above the configured price is ignored (a discount only lowers)", async () => {
    const inflated = stampedIntent({
      amount_received: 2600,
      metadata: {
        baseCents: "4100",
        discountCents: "1500",
        discountedCents: "2600",
      },
    });
    // Ignored stamp -> full-price defense -> 2600 >= 2500 still satisfies,
    // but WITHOUT promo facts in the payload (nothing to record).
    const outcome = await payWith(inflated).verify(args());
    expect(outcome.outcome).toBe("SATISFIED");
    expect(outcome.payload).not.toHaveProperty("promoCodeId");
  });

  it("underpaying the discounted price is rejected with the discounted reason", async () => {
    const short = stampedIntent({ amount_received: 999 });
    const outcome = await payWith(short).verify(args());
    expect(outcome).toMatchObject({
      outcome: "REJECTED",
      reason: "amount_below_discounted_price",
    });
  });

  it("replay defense intact: no stamp, below price is rejected exactly as before", async () => {
    const plain = stampedIntent({ metadata: { promoCodeId: "" } });
    const outcome = await payWith(plain).verify(args());
    expect(outcome).toMatchObject({
      outcome: "REJECTED",
      reason: "amount_below_price",
    });
  });
});

describe("readDiscountStamp", () => {
  const bind = { nodeId: NODE, workspaceId: WORKSPACE, priceCents: 2500 };

  it("reads a well-formed stamp", () => {
    expect(readDiscountStamp(stampedIntent().metadata, bind)).toEqual({
      promoCodeId: "promo_1",
      promoCode: "SUMMER",
      baseCents: 2500,
      discountCents: 1500,
      discountedCents: 1000,
    });
  });

  it.each([
    { label: "missing metadata", meta: undefined },
    { label: "foreign kind", meta: stampedIntent({ metadata: { kind: "v1-pay" } }).metadata },
    { label: "non-integer cents", meta: stampedIntent({ metadata: { discountedCents: "ten" } }).metadata },
    { label: "zero discount", meta: stampedIntent({ metadata: { discountCents: "0", discountedCents: "2500" } }).metadata },
  ])("returns null on $label", ({ meta }) => {
    expect(readDiscountStamp(meta, bind)).toBeNull();
  });
});

describe("discountForPromo (D6-2 math)", () => {
  it("percent rounds on the cent: 33% of $9.99 is $3.30", () => {
    expect(
      discountForPromo({ discountType: "percent", discountValue: 33 }, 999),
    ).toBe(330);
  });

  it("percent: 20% of $25.00 is $5.00", () => {
    expect(
      discountForPromo({ discountType: "percent", discountValue: 20 }, 2500),
    ).toBe(500);
  });

  it("flat is the authored cents regardless of base", () => {
    expect(
      discountForPromo({ discountType: "flat", discountValue: 1500 }, 2500),
    ).toBe(1500);
  });

  it("comp is not a partial type", () => {
    expect(
      discountForPromo({ discountType: "comp", discountValue: 100 }, 2500),
    ).toBeNull();
  });
});
