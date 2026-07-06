/** Apply Preview capability tokens (six-archetype recut, 2026-07). Mirrors the
 *  draft preview-token tests; verify returns a boolean (no scope to encode). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintApplyPreviewToken, verifyApplyPreviewToken } from "@/lib/apply-preview-token";

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.CHECKIN_SECRET;
  process.env.CHECKIN_SECRET = "test-secret-never-real";
});
afterEach(() => {
  if (originalSecret === undefined) delete process.env.CHECKIN_SECRET;
  else process.env.CHECKIN_SECRET = originalSecret;
});

describe("apply preview tokens", () => {
  it("round-trips a valid token", () => {
    const token = mintApplyPreviewToken();
    expect(token).toBeTruthy();
    expect(verifyApplyPreviewToken(token)).toBe(true);
  });

  it("expires after the 14-day window", () => {
    const past = new Date(Date.now() - 15 * 24 * 3600 * 1000);
    const token = mintApplyPreviewToken(past);
    expect(verifyApplyPreviewToken(token)).toBe(false);
  });

  it("rejects tampered payloads, signatures, and wrong version tags", () => {
    const token = mintApplyPreviewToken()!;
    const [payload, sig] = token.split(".");
    // wrong version tag re-signed would need the secret; a swapped payload breaks the sig
    const other = Buffer.from(
      JSON.stringify({ v: "evprev", exp: 9999999999 }),
    ).toString("base64url");
    expect(verifyApplyPreviewToken(`${other}.${sig}`)).toBe(false);
    expect(verifyApplyPreviewToken(`${payload}.AAAA${sig.slice(4)}`)).toBe(false);
    expect(verifyApplyPreviewToken("garbage")).toBe(false);
    expect(verifyApplyPreviewToken(null)).toBe(false);
    expect(verifyApplyPreviewToken(undefined)).toBe(false);
  });

  it("fails closed with no secret - mints nothing, verifies nothing", () => {
    const token = mintApplyPreviewToken()!;
    delete process.env.CHECKIN_SECRET;
    expect(mintApplyPreviewToken()).toBeNull();
    expect(verifyApplyPreviewToken(token)).toBe(false);
  });
});
