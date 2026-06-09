import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Operator refund path (overnight QA audit, WARNING — money path untested).
// Branches on live Stripe PI status: requires_capture → cancel, succeeded →
// refund, else 400. Guards a double-refund (refundedAt → 409). These assert
// each branch and the guard against the mocked Stripe/DB boundary.

vi.mock('@/lib/operator-role', () => ({
  requireRole: vi.fn(() => Promise.resolve({ ok: true, userId: 'u_1', workspaceId: 'ws_1', role: 'ADMIN' })),
}));
vi.mock('@/lib/db', () => ({ db: { rSVP: { findFirst: vi.fn(), update: vi.fn() } } }));
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { retrieve: vi.fn(), cancel: vi.fn() },
    refunds: { create: vi.fn() },
  },
}));
vi.mock('@/lib/emit-event', () => ({ emitEvent: vi.fn(() => Promise.resolve()) }));

import { POST } from '@/app/api/stripe/refund/route';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';

function req(rsvpId = 'rsvp_1'): NextRequest {
  return new NextRequest('http://localhost/api/stripe/refund', {
    method: 'POST',
    body: JSON.stringify({ rsvpId }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('refund route', () => {
  it('returns 409 for an already-refunded RSVP without calling Stripe', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue({
      id: 'rsvp_1', stripePaymentIntentId: 'pi_1', paymentStatus: 'CAPTURED', refundedAt: new Date(),
    } as never);
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(db.rSVP.update).not.toHaveBeenCalled();
  });

  it('cancels an authorized (requires_capture) PI and records its amount', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue({
      id: 'rsvp_1', stripePaymentIntentId: 'pi_1', paymentStatus: 'AUTHORIZED', refundedAt: null,
    } as never);
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture', amount: 5000 } as never);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_1');
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(db.rSVP.update).toHaveBeenCalledWith({
      where: { id: 'rsvp_1' },
      data: expect.objectContaining({ paymentStatus: 'REFUNDED', ticketStatus: 'refunded', refundAmountCents: 5000 }),
    });
  });

  it('refunds a captured (succeeded) PI for the refund amount', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue({
      id: 'rsvp_1', stripePaymentIntentId: 'pi_1', paymentStatus: 'CAPTURED', refundedAt: null,
    } as never);
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded', amount: 5000 } as never);
    vi.mocked(stripe.refunds.create).mockResolvedValue({ amount: 5000 } as never);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' });
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(db.rSVP.update).toHaveBeenCalledWith({
      where: { id: 'rsvp_1' },
      data: expect.objectContaining({ paymentStatus: 'REFUNDED', refundAmountCents: 5000 }),
    });
  });

  it('rejects a PI in any other status with 400 and no DB write', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue({
      id: 'rsvp_1', stripePaymentIntentId: 'pi_1', paymentStatus: 'PENDING', refundedAt: null,
    } as never);
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'processing', amount: 5000 } as never);

    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(db.rSVP.update).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('404s an RSVP not in the workspace', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue(null as never);
    const res = await POST(req());
    expect(res.status).toBe(404);
  });
});
