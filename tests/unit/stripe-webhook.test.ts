import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// The Stripe webhook is the source of truth that turns payment events into seat
// confirmations — the entire money state machine (overnight QA audit, CRITICAL
// #7). It was completely untested. These tests mock the external boundary
// (stripe/db/resend/emit) and assert each event branch produces the exact
// RSVP mutation, that a bad signature is rejected, and that a replayed capture
// is idempotent.

vi.mock('@/lib/stripe', () => ({ stripe: { webhooks: { constructEvent: vi.fn() } } }));
vi.mock('@/lib/db', () => ({
  db: {
    rSVP: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    event: { findUnique: vi.fn() },
    member: { findFirst: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
}));
vi.mock('@/lib/resend', () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock('@/lib/emit-event', () => ({ emitEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/email-templates', () => ({ rsvpConfirmedEmail: () => ({ subject: 's', html: 'h' }) }));

import { POST } from '@/app/api/webhooks/nobc/stripe/route';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';

const constructEvent = vi.mocked(stripe.webhooks.constructEvent);

function req(): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: '{}',
    headers: { 'stripe-signature': 'sig_test' },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setEvent(e: any) {
  constructEvent.mockReturnValue(e);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  delete process.env.RESEND_API_KEY; // skip the email branch; not under test here
});

describe('signature gate', () => {
  it('rejects a missing signature with 400 (no event parsed)', async () => {
    const r = new NextRequest('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}' });
    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('rejects a bad signature with 400', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(db.rSVP.update).not.toHaveBeenCalled();
  });

  it('400s when the webhook secret is unset', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(req());
    expect(res.status).toBe(400);
  });
});

describe('checkout.session.completed', () => {
  it('confirms the RSVP and writes the audit event', async () => {
    vi.mocked(db.rSVP.findUnique).mockResolvedValue({ id: 'rsvp_1', eventId: 'evt_1' } as never);
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: 'evt_1', title: 'T', slug: 's', startAt: new Date(), location: 'L',
    } as never);
    setEvent({
      type: 'checkout.session.completed',
      data: { object: { metadata: { rsvpId: 'rsvp_1', workspaceId: 'ws_1', memberId: 'mem_1' } } },
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.rSVP.update).toHaveBeenCalledWith({
      where: { id: 'rsvp_1' },
      data: { ticketStatus: 'confirmed', status: 'CONFIRMED' },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'rsvp.payment_completed', entityId: 'rsvp_1' }) }),
    );
  });

  it('no-ops on malformed metadata (missing rsvpId) — never touches the RSVP', async () => {
    setEvent({
      type: 'checkout.session.completed',
      data: { object: { metadata: { workspaceId: 'ws_1' } } }, // no rsvpId
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.rSVP.findUnique).not.toHaveBeenCalled();
    expect(db.rSVP.update).not.toHaveBeenCalled();
  });
});

describe('payment_intent.amount_capturable_updated (authorize)', () => {
  it('marks the RSVP confirmed + AUTHORIZED by payment-intent id', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue({ id: 'rsvp_1', eventId: 'evt_1' } as never);
    setEvent({
      type: 'payment_intent.amount_capturable_updated',
      data: { object: { id: 'pi_1', metadata: { workspaceId: 'ws_1', memberId: 'mem_1' } } },
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.rSVP.updateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: 'pi_1' },
      data: { ticketStatus: 'confirmed', status: 'CONFIRMED', paymentStatus: 'AUTHORIZED' },
    });
  });
});

describe('payment_intent.succeeded (capture)', () => {
  function captureEvent() {
    return {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', metadata: { workspaceId: 'ws_1', memberId: 'mem_1' } } },
    };
  }

  it('captures: sets CAPTURED + capturedAt by payment-intent id', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue({ id: 'rsvp_1' } as never);
    setEvent(captureEvent());

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.rSVP.updateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: 'pi_1' },
      data: { ticketStatus: 'confirmed', paymentStatus: 'CAPTURED', capturedAt: expect.any(Date) },
    });
  });

  it('is idempotent on replay — re-applying converges to the same CAPTURED state', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue({ id: 'rsvp_1' } as never);
    setEvent(captureEvent());

    await POST(req());
    await POST(req());

    expect(db.rSVP.updateMany).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(db.rSVP.updateMany).mock.calls;
    expect(second[0].where).toEqual(first[0].where);
    expect(second[0].data).toMatchObject({ ticketStatus: 'confirmed', paymentStatus: 'CAPTURED' });
  });
});

describe('payment_intent.payment_failed / canceled', () => {
  it('only flips RSVPs still in held state', async () => {
    vi.mocked(db.rSVP.findFirst).mockResolvedValue({ id: 'rsvp_1' } as never);
    setEvent({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_1', metadata: { workspaceId: 'ws_1', memberId: 'mem_1' } } },
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.rSVP.updateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: 'pi_1', ticketStatus: { in: ['held'] } },
      data: { ticketStatus: 'payment_failed', status: 'DECLINED', paymentStatus: 'FAILED' },
    });
  });
});
