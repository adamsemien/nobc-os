/**
 * The TCPA/CTIA disclosure block for the SMS opt-in page.
 *
 * LEGALLY MANDATED CONTENT — NOT subject to copy edit. It must display
 * adjacent to the consent action (never behind a link) and contains: brand
 * name, what they are consenting to receive, message frequency, "Msg & data
 * rates may apply", "Reply STOP to cancel, HELP for help", and links to Terms
 * and Privacy Policy. Copy AROUND this block is Chloe's; this block is
 * counsel's.
 *
 * The rendered text is snapshotted VERBATIM into every ConsentArtifact —
 * the server rebuilds it at submit time from this same constant (never
 * trusting the client), so the artifact records exactly what this version
 * displayed. Any wording change REQUIRES a version bump.
 *
 * NUMBER: the block references the marketing toll-free number
 * (MARKETING_TWILIO_PHONE_NUMBER) because STOP/HELP are carrier-level replies
 * to the SENDING number. FLAGGED for Chloe + counsel: app/terms/page.tsx
 * names 737-727-4222 (the House Phone conversational line) in its SMS
 * Messaging section, but marketing texts originate from the toll-free number
 * — the Terms' STOP language points at a number that won't be sending
 * marketing traffic. Terms are legal copy; escalated, not touched.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const DISCLOSURE_VERSION = 'v1';

/** Build the exact disclosure text for this version. Deterministic within a
 *  deploy: same env, same string — render and submit see identical text.
 *
 *  The env var stays E.164 (the Twilio send path depends on it); only the
 *  RENDER is display-formatted here — a valid NANPA (+1) number becomes
 *  "(844) 393-0889"; non-US or unparseable input passes through verbatim.
 *
 *  THROWS when the number is null/empty: a disclosure that cannot identify
 *  the sender must not render at all. Both call sites are server-side, so
 *  this surfaces as a 500 — never a silently broken legal artifact. */
export function buildDisclosureText(marketingNumber: string | null): string {
  const trimmed = marketingNumber?.trim();
  if (!trimmed) {
    throw new Error(
      'buildDisclosureText: MARKETING_TWILIO_PHONE_NUMBER is unset — the SMS disclosure cannot identify its sender and must not render.',
    );
  }
  // countryCallingCode, not country: toll-free +1 numbers are NANPA-shared and
  // libphonenumber often cannot pin them to 'US' specifically.
  const parsed = parsePhoneNumberFromString(trimmed);
  const fromNumber =
    parsed && parsed.countryCallingCode === '1' && parsed.isValid()
      ? parsed.formatNational()
      : trimmed;
  return (
    'By checking this box, I agree to receive recurring marketing and event text messages ' +
    '(e.g. event invitations, announcements, and reminders) from No Bad Company at the phone ' +
    `number provided, sent from ${fromNumber}. Consent is not a condition of any purchase or ` +
    'membership. Message frequency varies. Msg & data rates may apply. ' +
    'Reply STOP to cancel, HELP for help. ' +
    'See our Terms of Service (/terms) and Privacy Policy (/privacy).'
  );
}
