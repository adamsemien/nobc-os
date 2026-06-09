/**
 * Pure money-path decisions, extracted from the Stripe route handlers so they can be
 * unit-tested without mocking Stripe/DB/auth — and so the upcoming Stripe Connect work
 * (platform fee on the selected price; Connect-aware refunds) has one tested seam to extend.
 *
 * These are behavior-preserving extractions of logic that previously lived inline in:
 *   - app/api/m/events/[slug]/access/payment-intent/route.ts (tier price selection)
 *   - app/api/stripe/refund/route.ts                          (refund state machine)
 *
 * NO I/O here. Callers retain all Stripe/DB calls; these only decide.
 */

/**
 * Which price a viewer pays for a ticket tier.
 *
 * A non-member ("guest") pays the tier's non-member price; everyone else (an approved
 * member) pays the member price. Returns null when the tier has no price for that
 * viewer — the caller treats null as "tier not available for this access level" (403).
 *
 * @param viewerKind the resolved access kind — only `'guest'` is special-cased
 * @param tier       the tier's two price columns (either may be null)
 */
export function selectTierPriceCents(
  viewerKind: string,
  tier: { memberPriceCents: number | null; nonMemberPriceCents: number | null },
): number | null {
  return viewerKind === 'guest' ? tier.nonMemberPriceCents : tier.memberPriceCents;
}

/**
 * What to do with a PaymentIntent when an operator refunds an RSVP.
 *
 * - `requires_capture` → the charge was authorized but never captured: cancel the PI
 *   (no money moved; the authorization is released).
 * - `succeeded`        → the charge was captured: issue a Stripe refund.
 * - anything else      → not refundable from this surface; reject with a message that
 *   names the status (preserves the original 400 error copy exactly).
 */
export type RefundAction =
  | { kind: 'cancel' }
  | { kind: 'refund' }
  | { kind: 'reject'; reason: string };

export function refundActionForStatus(status: string): RefundAction {
  if (status === 'requires_capture') return { kind: 'cancel' };
  if (status === 'succeeded') return { kind: 'refund' };
  return { kind: 'reject', reason: `Cannot refund payment in status: ${status}` };
}
