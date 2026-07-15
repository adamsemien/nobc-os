/** Pure verdict tests for the blast consent gate (lib/blast/consent.ts).
 *
 *  The load-bearing case is the explicit-revoke fingerprint: a false opt-in
 *  boolean with a surviving marketing*OptInAt stamp means "granted, later
 *  unsubscribed" (the consent writer keeps the historical grant time when it
 *  mirrors an UNSUBSCRIBED/CLEANED state; nothing else ever stamps *OptInAt
 *  without setting the boolean true). A revoke must beat a stale Application
 *  opt-in - the fallback may only grant where the profile is silent.
 */
import { describe, expect, it } from "vitest";
import { emailConsent, smsConsent } from "@/lib/blast/consent";

const GRANTED_AT = new Date("2026-01-15T00:00:00Z");

describe("emailConsent", () => {
  it("profile opt-in grants with source profile", () => {
    expect(
      emailConsent(
        { marketingEmailOptIn: true, marketingEmailOptInAt: GRANTED_AT },
        null,
      ),
    ).toEqual({ ok: true, source: "profile" });
  });

  it("silent profile falls back to the latest application opt-in", () => {
    expect(
      emailConsent(
        { marketingEmailOptIn: false, marketingEmailOptInAt: null },
        { emailOptIn: true },
      ),
    ).toEqual({ ok: true, source: "application" });
  });

  it("explicit revoke beats a stale application opt-in", () => {
    expect(
      emailConsent(
        { marketingEmailOptIn: false, marketingEmailOptInAt: GRANTED_AT },
        { emailOptIn: true },
      ),
    ).toEqual({ ok: false });
  });

  it("no signal anywhere resolves to no consent", () => {
    expect(
      emailConsent(
        { marketingEmailOptIn: false, marketingEmailOptInAt: null },
        { emailOptIn: false },
      ),
    ).toEqual({ ok: false });
    expect(
      emailConsent(
        { marketingEmailOptIn: false, marketingEmailOptInAt: null },
        null,
      ),
    ).toEqual({ ok: false });
  });
});

describe("smsConsent", () => {
  it("profile opt-in grants with source profile", () => {
    expect(
      smsConsent(
        { marketingSmsOptIn: true, marketingSmsOptInAt: GRANTED_AT },
        null,
      ),
    ).toEqual({ ok: true, source: "profile" });
  });

  it("silent profile falls back to the latest application opt-in", () => {
    expect(
      smsConsent(
        { marketingSmsOptIn: false, marketingSmsOptInAt: null },
        { smsOptInAt: GRANTED_AT },
      ),
    ).toEqual({ ok: true, source: "application" });
  });

  it("explicit revoke beats a stale application opt-in", () => {
    expect(
      smsConsent(
        { marketingSmsOptIn: false, marketingSmsOptInAt: GRANTED_AT },
        { smsOptInAt: GRANTED_AT },
      ),
    ).toEqual({ ok: false });
  });

  it("no signal anywhere resolves to no consent", () => {
    expect(
      smsConsent(
        { marketingSmsOptIn: false, marketingSmsOptInAt: null },
        { smsOptInAt: null },
      ),
    ).toEqual({ ok: false });
    expect(
      smsConsent(
        { marketingSmsOptIn: false, marketingSmsOptInAt: null },
        null,
      ),
    ).toEqual({ ok: false });
  });
});
