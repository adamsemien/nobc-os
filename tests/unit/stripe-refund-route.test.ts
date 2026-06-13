import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Operator refund route — /api/stripe/refund (Flow 4: full + partial).
 *
 * Contract under test:
 *   - succeeded PI -> stripe.refunds.create; requires_capture hold -> cancel.
 *   - partial (amountCents < remaining) -> PARTIALLY_REFUNDED, cumulative tracked,
 *     refundedAt left null; reaching the full balance -> REFUNDED + refundedAt.
 *   - over-refund (amountCents > remaining) -> 400 before any Stripe call.
 *   - a hold cancel records $0 refunded (no money moved) but is fully resolved.
 *   - partial on an uncaptured hold -> 400 (Stripe cannot partially cancel).
 *   - already fully REFUNDED -> 409 (guarded on paymentStatus, the L2 fix).
 *   - Stripe calls carry idempotency keys; the DB write is workspace-scoped.
 *
 * refundActionForStatus is the real pure helper. Only the gate, stripe, db, and
 * emit/alert are mocked.
 */

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  rsvpFindFirst: vi.fn(),
  rsvpUpdateMany: vi.fn(),
  piRetrieve: vi.fn(),
  piCancel: vi.fn(),
  refundCreate: vi.fn(),
  emitEvent: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@/lib/operator-role', () => ({ requireRole: m.requireRole }));
vi.mock('@/lib/db', () => ({
  db: { rSVP: { findFirst: m.rsvpFindFirst, updateMany: m.rsvpUpdateMany } },
}));
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { retrieve: m.piRetrieve, cancel: m.piCancel },
    refunds: { create: m.refundCreate },
  },
}));
vi.mock('@/lib/emit-event', () => ({ emitEvent: m.emitEvent }));
vi.mock('@/lib/alerting', () => ({ alert: m.alert }));

import { POST } from '@/app/api/stripe/refund/route';

const post = (body: Record<string, unknown> = { rsvpId: 'r1' }) =>
  POST({ json: async () => body } as never);

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requireRole.mockResolvedValue({ ok: true, userId: 'u1', workspaceId: 'w1' });
  m.rsvpUpdateMany.mockResolvedValue({ count: 1 });
  m.emitEvent.mockResolvedValue(undefined);
  // Default RSVP: a captured $50 ticket, nothing refunded yet.
  m.rsvpFindFirst.mockResolvedValue({
    id: 'r1', stripePaymentIntentId: 'pi_1', paymentStatus: 'CAPTURED',
    refundedAt: null, amountCents: 5000, refundAmountCents: null,
  });
  m.piRetrieve.mockResolvedValue({ status: 'succeeded', amount: 5000 });
});

describe('refund route: full refund of a captured payment', () => {
  it('refunds the whole balance and marks REFUNDED', async () => {
    m.refundCreate.mockResolvedValue({ amount: 5000 });
    const res = await post();
    expect(await res.json()).toMatchObject({ ok: true, fully: true, refundAmountCents: 5000, cumulativeRefundCents: 5000 });

    // No amount sent -> full refund. Idempotency key encodes the cumulative target.
    const [params, opts] = m.refundCreate.mock.calls[0];
    expect(params).toMatchObject({ payment_intent: 'pi_1' });
    expect(params.amount).toBeUndefined();
    expect(opts).toMatchObject({ idempotencyKey: 'refund-r1-5000' });

    const call = m.rsvpUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'r1', workspaceId: 'w1' });
    expect(call.data).toMatchObject({ paymentStatus: 'REFUNDED', ticketStatus: 'refunded', refundAmountCents: 5000 });
    expect(call.data.refundedAt).toBeInstanceOf(Date);
  });
});

describe('refund route: partial refunds', () => {
  it('partial below the balance -> PARTIALLY_REFUNDED, refundedAt stays null', async () => {
    m.refundCreate.mockResolvedValue({ amount: 2000 });
    const res = await post({ rsvpId: 'r1', amountCents: 2000 });
    expect(await res.json()).toMatchObject({ ok: true, fully: false, refundAmountCents: 2000, cumulativeRefundCents: 2000 });

    const [params, opts] = m.refundCreate.mock.calls[0];
    expect(params).toMatchObject({ payment_intent: 'pi_1', amount: 2000 });
    expect(opts).toMatchObject({ idempotencyKey: 'refund-r1-2000' });

    const call = m.rsvpUpdateMany.mock.calls[0][0];
    expect(call.data).toMatchObject({ paymentStatus: 'PARTIALLY_REFUNDED', refundAmountCents: 2000 });
    expect(call.data.refundedAt).toBeUndefined();
    expect(call.data.ticketStatus).toBeUndefined();
  });

  it('a partial that reaches the full balance -> REFUNDED (cumulative)', async () => {
    m.rsvpFindFirst.mockResolvedValue({
      id: 'r1', stripePaymentIntentId: 'pi_1', paymentStatus: 'PARTIALLY_REFUNDED',
      refundedAt: null, amountCents: 5000, refundAmountCents: 3000,
    });
    m.refundCreate.mockResolvedValue({ amount: 2000 });
    const res = await post({ rsvpId: 'r1', amountCents: 2000 });
    expect(await res.json()).toMatchObject({ fully: true, cumulativeRefundCents: 5000 });

    // cumulative target 3000 + 2000 = 5000 keys the idempotent refund.
    expect(m.refundCreate.mock.calls[0][1]).toMatchObject({ idempotencyKey: 'refund-r1-5000' });
    expect(m.rsvpUpdateMany.mock.calls[0][0].data).toMatchObject({ paymentStatus: 'REFUNDED', refundAmountCents: 5000 });
  });

  it('over-refund beyond the remaining balance -> 400, no Stripe call', async () => {
    const res = await post({ rsvpId: 'r1', amountCents: 6000 });
    expect(res.status).toBe(400);
    expect(m.refundCreate).not.toHaveBeenCalled();
    expect(m.rsvpUpdateMany).not.toHaveBeenCalled();
  });
});

describe('refund route: uncaptured hold (cancel)', () => {
  beforeEach(() => {
    m.rsvpFindFirst.mockResolvedValue({
      id: 'r1', stripePaymentIntentId: 'pi_1', paymentStatus: 'AUTHORIZED',
      refundedAt: null, amountCents: 5000, refundAmountCents: null,
    });
    m.piRetrieve.mockResolvedValue({ status: 'requires_capture', amount: 5000 });
  });

  it('releases the hold, records $0 refunded, fully resolved', async () => {
    const res = await post({ rsvpId: 'r1' });
    expect(await res.json()).toMatchObject({ ok: true, fully: true, refundAmountCents: 0 });

    expect(m.piCancel).toHaveBeenCalledWith('pi_1', {}, { idempotencyKey: 'cancel-r1' });
    expect(m.refundCreate).not.toHaveBeenCalled();
    const call = m.rsvpUpdateMany.mock.calls[0][0];
    expect(call.data).toMatchObject({ paymentStatus: 'REFUNDED', ticketStatus: 'refunded', refundAmountCents: 0 });
  });

  it('partial amount against an uncaptured hold -> 400', async () => {
    const res = await post({ rsvpId: 'r1', amountCents: 1000 });
    expect(res.status).toBe(400);
    expect(m.piCancel).not.toHaveBeenCalled();
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
});

describe('refund route: guards', () => {
  it('already fully REFUNDED -> 409 (L2: guard on paymentStatus)', async () => {
    m.rsvpFindFirst.mockResolvedValue({
      id: 'r1', stripePaymentIntentId: 'pi_1', paymentStatus: 'REFUNDED',
      refundedAt: null, amountCents: 5000, refundAmountCents: 5000,
    });
    const res = await post({ rsvpId: 'r1' });
    expect(res.status).toBe(409);
    expect(m.piRetrieve).not.toHaveBeenCalled();
  });

  it('non-admin gate is enforced', async () => {
    m.requireRole.mockResolvedValue({ ok: false, response: new Response('no', { status: 403 }) });
    const res = await post();
    expect(res.status).toBe(403);
    expect(m.rsvpFindFirst).not.toHaveBeenCalled();
  });
});
