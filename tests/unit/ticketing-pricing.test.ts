import { describe, it, expect } from 'vitest';
import { selectTierPriceCents, refundActionForStatus } from '@/lib/ticketing/pricing';

// Pure money-path decisions extracted from the Stripe routes. These pin the exact
// behavior the live charge/refund handlers relied on inline, so the upcoming Stripe
// Connect work can extend the seam without silently changing who-pays-what or which
// refund action fires.

describe('selectTierPriceCents', () => {
  const tier = { memberPriceCents: 5000, nonMemberPriceCents: 8000 };

  it('charges a guest the non-member price', () => {
    expect(selectTierPriceCents('guest', tier)).toBe(8000);
  });

  it('charges an approved member the member price', () => {
    expect(selectTierPriceCents('member', tier)).toBe(5000);
  });

  it('treats any non-guest kind as the member price (member is the default lane)', () => {
    // resolved.kind is only ever special-cased on 'guest'; everything else pays member.
    expect(selectTierPriceCents('approved', tier)).toBe(5000);
    expect(selectTierPriceCents('', tier)).toBe(5000);
  });

  it('returns null when the tier has no price for that viewer (caller → 403)', () => {
    expect(selectTierPriceCents('guest', { memberPriceCents: 5000, nonMemberPriceCents: null })).toBeNull();
    expect(selectTierPriceCents('member', { memberPriceCents: null, nonMemberPriceCents: 8000 })).toBeNull();
  });

  it('returns a zero price as 0, not null (free tier is a real value)', () => {
    expect(selectTierPriceCents('guest', { memberPriceCents: 5000, nonMemberPriceCents: 0 })).toBe(0);
    expect(selectTierPriceCents('member', { memberPriceCents: 0, nonMemberPriceCents: 8000 })).toBe(0);
  });
});

describe('refundActionForStatus', () => {
  it('cancels an authorized-but-uncaptured PaymentIntent', () => {
    expect(refundActionForStatus('requires_capture')).toEqual({ kind: 'cancel' });
  });

  it('refunds a captured PaymentIntent', () => {
    expect(refundActionForStatus('succeeded')).toEqual({ kind: 'refund' });
  });

  it.each([
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'canceled',
    '',
  ])('rejects status %s with a message that names the status', (status) => {
    const action = refundActionForStatus(status);
    expect(action.kind).toBe('reject');
    // Preserves the exact 400 error copy the route returned before extraction.
    expect(action).toEqual({ kind: 'reject', reason: `Cannot refund payment in status: ${status}` });
  });
});
