/** Draft preview tokens (Event Builder Rebuild, Phase B). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintPreviewToken, verifyPreviewToken } from "@/lib/preview-token";

const SCOPE = { workspaceId: "w1", eventId: "ev1" };
let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.CHECKIN_SECRET;
  process.env.CHECKIN_SECRET = "test-secret-never-real";
});
afterEach(() => {
  if (originalSecret === undefined) delete process.env.CHECKIN_SECRET;
  else process.env.CHECKIN_SECRET = originalSecret;
});

describe("preview tokens", () => {
  it("round-trips an event scope", () => {
    const token = mintPreviewToken(SCOPE);
    expect(token).toBeTruthy();
    expect(verifyPreviewToken(token)).toEqual(SCOPE);
  });

  it("expires", () => {
    const past = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    const token = mintPreviewToken(SCOPE, past);
    expect(verifyPreviewToken(token)).toBeNull();
  });

  it("rejects tampered payloads and signatures", () => {
    const token = mintPreviewToken(SCOPE)!;
    const [payload, sig] = token.split(".");
    const other = Buffer.from(
      JSON.stringify({ v: "evprev", workspaceId: "w2", eventId: "ev1", exp: 9999999999 }),
    ).toString("base64url");
    expect(verifyPreviewToken(`${other}.${sig}`)).toBeNull();
    expect(verifyPreviewToken(`${payload}.AAAA${sig.slice(4)}`)).toBeNull();
    expect(verifyPreviewToken("garbage")).toBeNull();
    expect(verifyPreviewToken(null)).toBeNull();
  });

  it("fails closed with no secret - mints nothing, verifies nothing", () => {
    const token = mintPreviewToken(SCOPE)!;
    delete process.env.CHECKIN_SECRET;
    expect(mintPreviewToken(SCOPE)).toBeNull();
    expect(verifyPreviewToken(token)).toBeNull();
  });
});
