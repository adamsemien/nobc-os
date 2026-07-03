/** PAY node availability windows + quantity caps (mid-run addendum, ADD 4).
 *  Pure offer-layer logic - the evaluator is never involved. */
import { describe, expect, it } from "vitest";
import { payNodeAvailability } from "@/lib/gate-engine/conditions/pay";

const now = new Date("2026-07-05T20:00:00.000Z");

describe("payNodeAvailability", () => {
  it("no window, no cap - always available", () => {
    expect(payNodeAvailability({}, { now, soldCount: 999 })).toEqual({
      available: true,
    });
  });

  it("before the window opens: not offered", () => {
    expect(
      payNodeAvailability(
        { availableFrom: "2026-07-06T00:00:00.000Z" },
        { now, soldCount: 0 },
      ),
    ).toEqual({ available: false, reason: "not_yet" });
  });

  it("after the window closes: not offered (boundary is exclusive)", () => {
    expect(
      payNodeAvailability(
        { availableUntil: "2026-07-05T20:00:00.000Z" },
        { now, soldCount: 0 },
      ),
    ).toEqual({ available: false, reason: "closed" });
    expect(
      payNodeAvailability(
        { availableUntil: "2026-07-05T20:00:01.000Z" },
        { now, soldCount: 0 },
      ),
    ).toEqual({ available: true });
  });

  it("at the quantity cap: sold out", () => {
    expect(
      payNodeAvailability({ maxQuantity: 50 }, { now, soldCount: 50 }),
    ).toEqual({ available: false, reason: "sold_out" });
    expect(
      payNodeAvailability({ maxQuantity: 50 }, { now, soldCount: 49 }),
    ).toEqual({ available: true });
  });

  it("Early Bird / GA / Door composition works on windows alone", () => {
    const earlyBird = { availableUntil: "2026-07-01T00:00:00.000Z" };
    const ga = {
      availableFrom: "2026-07-01T00:00:00.000Z",
      availableUntil: "2026-07-11T00:00:00.000Z",
    };
    const door = { availableFrom: "2026-07-11T00:00:00.000Z" };
    expect(payNodeAvailability(earlyBird, { now, soldCount: 0 }).available).toBe(false);
    expect(payNodeAvailability(ga, { now, soldCount: 0 }).available).toBe(true);
    expect(payNodeAvailability(door, { now, soldCount: 0 }).available).toBe(false);
  });
});
