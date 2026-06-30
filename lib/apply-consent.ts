import { NextRequest } from 'next/server';

/**
 * Phase B — consent de-overloading.
 *
 * The legacy `Application.consentEmail` boolean is overloaded: historically it has
 * meant BOTH "agreed to membership terms" AND "email communications consent". This
 * module derives the structured consent columns added in Phase A
 * (`agreedToMembershipTerms`, `termsAcceptedAt`, `termsVersion`, `emailOptIn`,
 * `emailOptInAt`, `smsOptInAt`, `consentIp`, `consentUserAgent`) from the same
 * booleans the apply flow already sends, so every consent write dual-writes the
 * structured fields WITHOUT any client/UX change. The legacy `consentEmail` /
 * `consentSms` writes stay exactly as they are in the route handlers.
 */

/**
 * Terms-of-service version tag stamped alongside an agreement. This is the VERSION
 * tag only — the actual T&C wording is attorney-gated and unfinalized. The
 * "-attorney-pending" suffix forces a deliberate bump once counsel signs off, so a
 * stamped `termsVersion` can never be mistaken for a finalized legal version.
 */
export const TERMS_VERSION = '2026-06-30-attorney-pending';

/**
 * Client IP for consent provenance: first hop of `x-forwarded-for` (Vercel sets
 * this reliably). Mirrors the extraction in `lib/public-rate-limit.ts`. Null when
 * the header is absent.
 */
export function getConsentIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : null;
}

/** Already-persisted consent timestamps, used for stamp-once semantics. */
interface ExistingConsentTimestamps {
  termsAcceptedAt?: Date | null;
  emailOptInAt?: Date | null;
  smsOptInAt?: Date | null;
}

/** The structured-consent columns this helper may set. All optional. */
export interface StructuredConsentWrites {
  agreedToMembershipTerms?: boolean;
  emailOptIn?: boolean;
  termsAcceptedAt?: Date;
  termsVersion?: string;
  emailOptInAt?: Date;
  smsOptInAt?: Date;
  consentIp?: string | null;
  consentUserAgent?: string | null;
}

/**
 * Build the structured-consent portion of an Application create/update from the
 * legacy booleans. Returns ONLY the new Phase-A columns — the caller still writes
 * `consentEmail` / `consentSms` itself, unchanged.
 *
 * Stamp-once: a timestamp is set only when not already present in `existing`, so
 * the ORIGINAL acceptance time is preserved across a later re-PATCH (e.g. the
 * final-submit PATCH that re-sends `consentEmail: true`). For a fresh create, pass
 * `existing` undefined → timestamps stamp unconditionally when the boolean is true.
 */
export function structuredConsentWrites(args: {
  consentEmail?: boolean;
  consentSms?: boolean;
  now: Date;
  ip: string | null;
  userAgent: string | null;
  existing?: ExistingConsentTimestamps;
}): StructuredConsentWrites {
  const { consentEmail, consentSms, now, ip, userAgent, existing } = args;
  const out: StructuredConsentWrites = {};

  if (consentEmail !== undefined) {
    out.agreedToMembershipTerms = consentEmail;
    // PHASE B: `emailOptIn` MIRRORS `agreedToMembershipTerms` because the apply
    // flow still has a SINGLE agree checkbox — email consent is implied by T&C §3,
    // not given as a separate, deliberate choice. `emailOptIn` is therefore NOT yet
    // an independent signal and MUST NOT be treated as a deliberate email opt-in
    // until Phase C splits the agree + email-consent checkboxes into distinct
    // controls. Until then it is exactly as (un)reliable as the terms agreement.
    out.emailOptIn = consentEmail;
    if (consentEmail === true) {
      // Capture provenance + first-acceptance timestamps at the terms-agreement
      // write. Stamp-once preserves the original time across the final-submit
      // re-PATCH; IP/UA are refreshed to the request that recorded agreement.
      if (!existing?.termsAcceptedAt) {
        out.termsAcceptedAt = now;
        out.termsVersion = TERMS_VERSION;
      }
      if (!existing?.emailOptInAt) out.emailOptInAt = now;
      out.consentIp = ip;
      out.consentUserAgent = userAgent;
    }
  }

  if (consentSms === true && !existing?.smsOptInAt) {
    out.smsOptInAt = now;
  }

  return out;
}
