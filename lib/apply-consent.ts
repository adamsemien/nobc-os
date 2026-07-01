import type { NextRequest } from 'next/server';

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
 * The EXACT consent language shown next to each House Rules checkbox, keyed by
 * terms version. This is the single source of truth: the apply UI renders these
 * strings verbatim as the checkbox labels, and `termsVersion` is stamped on the
 * application at agreement — so the version tag pins the precise wording the
 * applicant saw and agreed to. Bump `TERMS_VERSION` and add a new entry here
 * whenever any of this language changes.
 */
export const CONSENT_DISCLOSURES: Record<
  string,
  { membershipTerms: string; emailOptIn: string; smsOptIn: string }
> = {
  '2026-06-30-attorney-pending': {
    membershipTerms: 'I have read and agree to the No Bad Company membership terms.',
    emailOptIn:
      'Send me emails from No Bad Company - invitations, news, and the occasional note. Optional.',
    smsOptIn:
      'Text me from No Bad Company about events and access. Message and data rates may apply. Optional.',
  },
};

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
 * Build the structured-consent portion of an Application create/update. Returns
 * ONLY the Phase-A columns — the caller still writes `consentEmail` / `consentSms`
 * itself, unchanged.
 *
 * PHASE C: `agreedToMembershipTerms` and `emailOptIn` are INDEPENDENT, explicit
 * inputs — the three House Rules checkboxes at the end of the apply flow write each
 * one directly (a declined email opt-in stays `false`). The legacy single
 * `consentEmail` boolean is the fallback ONLY when an explicit field is `undefined`
 * (the untouched public [slug] path, where one agree box still implies both).
 * Nullish (`??`), never truthy (`||`): `false ?? x === false`, so an explicit
 * decline can never be coerced into a `true` by the legacy coupling.
 *
 * Stamp-once: a timestamp is set only when not already present in `existing`, so
 * the ORIGINAL acceptance time is preserved across a later re-PATCH (e.g. the
 * final-submit PATCH). For a fresh create, pass `existing` undefined → timestamps
 * stamp unconditionally when the corresponding consent is true.
 */
export function structuredConsentWrites(args: {
  consentEmail?: boolean;
  consentSms?: boolean;
  agreedToMembershipTerms?: boolean;
  emailOptIn?: boolean;
  now: Date;
  ip: string | null;
  userAgent: string | null;
  existing?: ExistingConsentTimestamps;
}): StructuredConsentWrites {
  const { consentEmail, consentSms, now, ip, userAgent, existing } = args;
  const out: StructuredConsentWrites = {};

  // Explicit Phase-C inputs win; fall back to the legacy `consentEmail` coupling
  // only when an explicit field is undefined. `??` (not `||`) keeps an explicit
  // `false` as `false` — a declined opt-in is never coerced true.
  const agreedTerms = args.agreedToMembershipTerms ?? consentEmail;
  const emailOpt = args.emailOptIn ?? consentEmail;

  if (agreedTerms !== undefined) {
    out.agreedToMembershipTerms = agreedTerms;
    if (agreedTerms === true) {
      // Provenance + first-acceptance stamps land at the terms agreement — the
      // anchor consent event and the gate for submit. Stamp-once preserves the
      // original time across the final-submit re-PATCH; IP/UA are refreshed to the
      // request that recorded agreement.
      if (!existing?.termsAcceptedAt) {
        out.termsAcceptedAt = now;
        out.termsVersion = TERMS_VERSION;
      }
      out.consentIp = ip;
      out.consentUserAgent = userAgent;
    }
  }

  if (emailOpt !== undefined) {
    out.emailOptIn = emailOpt;
    // Stamp only on an affirmative opt-in, never on false.
    if (emailOpt === true && !existing?.emailOptInAt) out.emailOptInAt = now;
  }

  if (consentSms === true && !existing?.smsOptInAt) {
    out.smsOptInAt = now;
  }

  return out;
}
