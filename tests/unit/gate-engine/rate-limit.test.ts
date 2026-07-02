/** Sliding-window limiter truth table (Stage 17, M4 hardening). */
import { describe, expect, it } from "vitest";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit inside one window, then refuses", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect(limiter.allow("k", t0)).toBe(true);
    expect(limiter.allow("k", t0 + 1)).toBe(true);
    expect(limiter.allow("k", t0 + 2)).toBe(true);
    expect(limiter.allow("k", t0 + 3)).toBe(false);
  });

  it("the window slides: a fresh window resets the budget", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    const t0 = 5_000;
    expect(limiter.allow("k", t0)).toBe(true);
    expect(limiter.allow("k", t0 + 999)).toBe(false);
    expect(limiter.allow("k", t0 + 1_000)).toBe(true);
  });

  it("keys are isolated from each other", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const t0 = 0;
    expect(limiter.allow("a", t0)).toBe(true);
    expect(limiter.allow("b", t0)).toBe(true);
    expect(limiter.allow("a", t0 + 1)).toBe(false);
    expect(limiter.allow("b", t0 + 1)).toBe(false);
  });

  it("retryAfterSeconds points at the window end, minimum 1s", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 30_000 });
    const t0 = 100_000;
    limiter.allow("k", t0);
    expect(limiter.retryAfterSeconds("k", t0 + 10_000)).toBe(20);
    expect(limiter.retryAfterSeconds("k", t0 + 29_900)).toBe(1);
    expect(limiter.retryAfterSeconds("missing", t0)).toBe(0);
  });
});

describe("clientIpFrom", () => {
  it("prefers the first x-forwarded-for entry, then x-real-ip, then unknown", () => {
    expect(
      clientIpFrom(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }))
    ).toBe("1.2.3.4");
    expect(
      clientIpFrom(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } }))
    ).toBe("9.9.9.9");
    expect(clientIpFrom(new Request("http://x"))).toBe("unknown");
  });
});
