/** Pure proof helpers: expiry computation and liveness (Stage 17). */
import { describe, expect, it } from "vitest";
import {
  addMonthsUtc,
  computeExpiry,
  isProofLive,
  policyCarries,
} from "@/lib/gate-engine/proofs";

const AT = new Date("2026-07-01T12:00:00.000Z");

describe("computeExpiry", () => {
  it("MONTHS sets expiry N months from verification (the answers 12-month window)", () => {
    expect(computeExpiry({ kind: "MONTHS", months: 12 }, AT)).toEqual(
      new Date("2027-07-01T12:00:00.000Z")
    );
  });

  it("NEVER, ALWAYS, and LIVE proofs have no timestamp expiry", () => {
    expect(computeExpiry({ kind: "NEVER" }, AT)).toBeNull();
    expect(computeExpiry({ kind: "ALWAYS" }, AT)).toBeNull();
    expect(computeExpiry({ kind: "LIVE" }, AT)).toBeNull();
  });
});

describe("addMonthsUtc", () => {
  it("month-end overflow rolls forward per JS Date semantics (documented)", () => {
    // Jan 31 + 1 month -> Mar 3 (2026 is not a leap year; Feb 31 rolls over).
    expect(addMonthsUtc(new Date("2026-01-31T00:00:00.000Z"), 1)).toEqual(
      new Date("2026-03-03T00:00:00.000Z")
    );
  });
});

describe("isProofLive", () => {
  it("only SATISFIED counts", () => {
    expect(isProofLive({ status: "REJECTED", expiresAt: null }, AT)).toBe(false);
    expect(isProofLive({ status: "PENDING_REVIEW", expiresAt: null }, AT)).toBe(false);
    expect(isProofLive({ status: "SATISFIED", expiresAt: null }, AT)).toBe(true);
  });

  it("expiry boundary: expiresAt === now is expired", () => {
    expect(isProofLive({ status: "SATISFIED", expiresAt: AT }, AT)).toBe(false);
    expect(
      isProofLive({ status: "SATISFIED", expiresAt: new Date(AT.getTime() + 1) }, AT)
    ).toBe(true);
  });
});

describe("policyCarries", () => {
  it("only ALWAYS and MONTHS carry forward; NEVER and LIVE do not", () => {
    expect(policyCarries({ kind: "ALWAYS" })).toBe(true);
    expect(policyCarries({ kind: "MONTHS", months: 12 })).toBe(true);
    expect(policyCarries({ kind: "NEVER" })).toBe(false);
    expect(policyCarries({ kind: "LIVE" })).toBe(false);
  });
});
