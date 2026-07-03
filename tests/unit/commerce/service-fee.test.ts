/** Service-fee math (Event Builder Rebuild, Phase A - Decision 3).
 *
 *  The four ServiceFeeMode behaviors at the directive's price points, with
 *  net-within-a-cent proofs for the Stripe pass-through modes. Pure - no DB,
 *  no Stripe.
 */
import { describe, expect, it } from "vitest";
import {
  applyServiceFee,
  applyServiceFeeWithDiscount,
  feePolicyFromEvent,
} from "@/lib/commerce/service-fee";

/** Stripe's cut on a charged amount: 2.9% (rounded) + 30c. */
const stripeCut = (chargedCents: number) => Math.round(chargedCents * 0.029) + 30;

const absorb = { mode: "absorb" as const, percentBps: null, flatCents: null };
const passStripe = { mode: "pass_stripe_only" as const, percentBps: null, flatCents: null };

describe("applyServiceFee - absorb (default)", () => {
  it.each([2500, 1700, 1050, 9999])("charges the flat price at %i cents", (price) => {
    expect(applyServiceFee(price, absorb)).toEqual({
      subtotalCents: price,
      serviceFeeCents: 0,
      discountCents: 0,
      totalCents: price,
    });
  });
});

describe("applyServiceFee - pass_stripe_only", () => {
  it.each([
    { price: 2500, total: 2606, fee: 106 },
    { price: 1700, total: 1782, fee: 82 },
    { price: 1050, total: 1112, fee: 62 },
    { price: 9999, total: 10329, fee: 330 },
  ])("grosses up $price -> $total (fee $fee)", ({ price, total, fee }) => {
    expect(applyServiceFee(price, passStripe)).toEqual({
      subtotalCents: price,
      serviceFeeCents: fee,
      discountCents: 0,
      totalCents: total,
    });
  });

  it.each([2500, 1700, 1050, 9999])(
    "nets the operator the ticket price within a cent at %i",
    (price) => {
      const { totalCents } = applyServiceFee(price, passStripe);
      const net = totalCents - stripeCut(totalCents);
      expect(Math.abs(net - price)).toBeLessThanOrEqual(1);
    },
  );
});

describe("applyServiceFee - pass_stripe_plus_markup", () => {
  it("nets price + markup within a cent (250 bps on $25.00)", () => {
    const items = applyServiceFee(2500, {
      mode: "pass_stripe_plus_markup",
      percentBps: 250,
      flatCents: null,
    });
    const markup = Math.round((2500 * 250) / 10_000); // 63
    const net = items.totalCents - stripeCut(items.totalCents);
    expect(items.subtotalCents).toBe(2500);
    expect(Math.abs(net - (2500 + markup))).toBeLessThanOrEqual(1);
    expect(items.serviceFeeCents).toBe(items.totalCents - 2500);
  });

  it("treats a missing or non-positive bps as zero markup", () => {
    expect(
      applyServiceFee(2500, { mode: "pass_stripe_plus_markup", percentBps: null, flatCents: null }),
    ).toEqual(applyServiceFee(2500, passStripe));
  });
});

describe("applyServiceFee - flat_per_ticket", () => {
  it("adds the flat fee without any Stripe gross-up", () => {
    expect(
      applyServiceFee(2500, { mode: "flat_per_ticket", percentBps: null, flatCents: 200 }),
    ).toEqual({
      subtotalCents: 2500,
      serviceFeeCents: 200,
      discountCents: 0,
      totalCents: 2700,
    });
  });

  it("missing flat value charges the plain price", () => {
    expect(
      applyServiceFee(2500, { mode: "flat_per_ticket", percentBps: null, flatCents: null }),
    ).toMatchObject({ serviceFeeCents: 0, totalCents: 2500 });
  });
});

describe("applyServiceFee - guards", () => {
  it.each([0, -100, 25.5])("passes through a non-chargeable price (%d) fee-free", (price) => {
    expect(applyServiceFee(price, passStripe)).toEqual({
      subtotalCents: price,
      serviceFeeCents: 0,
      discountCents: 0,
      totalCents: price,
    });
  });
});

describe("applyServiceFeeWithDiscount (D6) - fee on the discounted price", () => {
  it("absorb: $25.00 with $5.00 off charges $20.00, split honest", () => {
    expect(applyServiceFeeWithDiscount(2500, 500, absorb)).toEqual({
      subtotalCents: 2500,
      serviceFeeCents: 0,
      discountCents: 500,
      totalCents: 2000,
    });
  });

  it("pass_stripe_only: the directive's exact cents - 2500 with 1500 off -> 1000 -> total 1061, fee 61", () => {
    const items = applyServiceFeeWithDiscount(2500, 1500, passStripe);
    expect(items).toEqual({
      subtotalCents: 2500,
      serviceFeeCents: 61,
      discountCents: 1500,
      totalCents: 1061,
    });
    // The line items sum exactly: base - discount + fee = total.
    expect(items.subtotalCents - items.discountCents + items.serviceFeeCents).toBe(
      items.totalCents,
    );
  });

  it("nets the operator the discounted price within a cent under gross-up", () => {
    const { totalCents } = applyServiceFeeWithDiscount(2500, 1500, passStripe);
    const net = totalCents - stripeCut(totalCents);
    expect(Math.abs(net - 1000)).toBeLessThanOrEqual(1);
  });

  it.each([
    { discount: 0, label: "zero" },
    { discount: -100, label: "negative" },
    { discount: 2500, label: "equal to the price" },
    { discount: 3000, label: "above the price" },
    { discount: 12.5, label: "non-integer" },
  ])("fails closed to the undiscounted items when the discount is $label", ({ discount }) => {
    expect(applyServiceFeeWithDiscount(2500, discount, passStripe)).toEqual(
      applyServiceFee(2500, passStripe),
    );
  });
});

describe("feePolicyFromEvent", () => {
  it("maps the Event columns straight through", () => {
    expect(
      feePolicyFromEvent({
        serviceFeeMode: "pass_stripe_only",
        serviceFeePercentBps: 250,
        serviceFeeFlatCents: 200,
      }),
    ).toEqual({ mode: "pass_stripe_only", percentBps: 250, flatCents: 200 });
  });
});
