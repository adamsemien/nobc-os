import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * THE phone normalizer for the SMS opt-in page (libphonenumber-js). Every
 * phone this page touches goes through here: the ConsentArtifact, the
 * ChannelSubscription write, the SuppressionEntry lookup, and the
 * Person.phone backfill — one library, one output shape (E.164).
 *
 * FOLLOW-ON (out of scope here): the three pre-existing, mutually
 * inconsistent normalizers — lib/validation.ts normalizePhone ("+digits"),
 * lib/watchlist.ts normalizePhone (bare 10 digits), and
 * lib/connectors/normalize.ts normalizePhone (trim only) — should be
 * consolidated onto libphonenumber-js in a separate pass.
 */

/** Parse to E.164, defaulting to US for bare national numbers. Returns null
 *  for anything libphonenumber-js considers invalid. */
export function toE164(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, 'US');
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}
