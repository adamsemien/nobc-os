/**
 * Pure helpers for the ticketed-purchase confirmation email pipeline.
 *
 * Kept separate so they are unit-testable without DB/Stripe imports.
 */

/** Canonical recipient for a confirmation email.
 *
 * For both member and guest buyers, the Member row is the source of truth:
 * `findOrCreateGuestMember` stores the typed email on `Member.email`, so the
 * lookup is identical. `RSVP.guestEmail` is a defensive fallback only.
 */
export function resolveTicketRecipient(
  member: { email: string; firstName: string; lastName: string },
  rsvp: { guestEmail: string | null; guestName: string | null },
): { email: string; name: string } {
  const email = member.email.trim() || rsvp.guestEmail?.trim() || '';
  const name = rsvp.guestName?.trim()
    ? rsvp.guestName.trim()
    : `${member.firstName} ${member.lastName}`.trim();
  return { email, name };
}

/**
 * Dedup guard: returns true only when the RSVP has NOT yet been authorized.
 *
 * Stripe can re-deliver `payment_intent.amount_capturable_updated` on retry.
 * We check the existing `paymentStatus` BEFORE the update — if it's already
 * `AUTHORIZED` or `CAPTURED`, the email was already sent on the first delivery
 * and we must not send again.
 *
 * No schema change needed: `paymentStatus` is an existing column on `RSVP`.
 */
export function shouldSendConfirmationEmail(
  currentPaymentStatus: string | null | undefined,
): boolean {
  return currentPaymentStatus !== 'AUTHORIZED' && currentPaymentStatus !== 'CAPTURED';
}
