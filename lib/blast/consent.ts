/** Consent verdicts for the attendee messaging layer (Stage 18, 4A-6).
 *
 *  CHANNEL-axis truth, and nothing else:
 *   - Home: Member.marketingEmailOptIn / marketingSmsOptIn (this branch's
 *     columns) - the profile signal.
 *   - Documented fallback for members who applied pre-rebuild: the member's
 *     LATEST Application row - emailOptIn for email, smsOptInAt IS NOT NULL
 *     for SMS. The fallback may only GRANT where the profile is silent: a
 *     false opt-in boolean with a surviving marketing*OptInAt stamp is an
 *     explicit revoke (the consent writer keeps the historical grant time
 *     when it mirrors an UNSUBSCRIBED/CLEANED state, and nothing else ever
 *     stamps *OptInAt without setting the boolean true), and a revoke beats
 *     a stale Application opt-in.
 *   - Guests with no consent record resolve to no-consent; the dry run shows
 *     them so operators see reach honestly.
 *
 *  redListed / RedList (the ACCESS axis) is deliberately absent from every
 *  signature here - asserted by test. Pure functions, no DB.
 */

export type ConsentSource = "profile" | "application";

export type ConsentVerdict =
  | { ok: true; source: ConsentSource }
  | { ok: false };

export function emailConsent(
  member: { marketingEmailOptIn: boolean; marketingEmailOptInAt: Date | null },
  latestApplication: { emailOptIn: boolean } | null,
): ConsentVerdict {
  if (member.marketingEmailOptIn) return { ok: true, source: "profile" };
  // Explicit revoke (false boolean + surviving grant stamp) - the stale
  // Application opt-in must not resurrect an unsubscribed member.
  if (member.marketingEmailOptInAt != null) return { ok: false };
  if (latestApplication?.emailOptIn) return { ok: true, source: "application" };
  return { ok: false };
}

export function smsConsent(
  member: { marketingSmsOptIn: boolean; marketingSmsOptInAt: Date | null },
  latestApplication: { smsOptInAt: Date | null } | null,
): ConsentVerdict {
  if (member.marketingSmsOptIn) return { ok: true, source: "profile" };
  // Explicit revoke (false boolean + surviving grant stamp) - see above.
  if (member.marketingSmsOptInAt != null) return { ok: false };
  if (latestApplication?.smsOptInAt != null) {
    return { ok: true, source: "application" };
  }
  return { ok: false };
}

/** The operator-facing sentence naming which signal authorizes a send -
 *  shown on the compose surface (TCPA-adjacent honesty, 4D). */
export function consentBasisCopy(channel: "EMAIL" | "SMS"): string {
  return channel === "SMS"
    ? "Texts go only to guests who opted in on their application or member profile."
    : "Emails go only to guests who opted in on their application or member profile.";
}
