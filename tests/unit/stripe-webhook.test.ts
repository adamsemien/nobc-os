import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Stripe webhook money-state contract — /api/webhooks/nobc/stripe.
 *
 * Stripe delivers at-least-once, so the handler MUST be idempotent and the
 * money-state writes MUST be synchronous inside one db.$transaction that also
 * records the StripeEvent dedup row, returning 200 only after it commits. Side
 * effects (email/Svix/audit/alert) are deferred to after() and never gate the
 * money write. This suite pins:
 *   - signature handling (missing / invalid -> 400)
 *   - dedup short-circuit (seen event -> no transaction, no money write)
 *   - payment_intent.succeeded -> CAPTURED with do-not-regress status guard
 *   - charge.refunded full -> REFUNDED via updateMany
 *   - charge.refunded partial -> monotonic raw UPDATE (NOT updateMany), so a
 *     second partial is reconciled instead of frozen out (regression guard, C1)
 *   - the dedup row is written in the same transaction
 *   - P2002 (concurrent duplicate) -> 200 deduped; other failure -> 500 (retry)
 *
 * Only next/server's after(), stripe.webhooks.constructEvent, and db are mocked.
 * Prisma (the error class) is real. RESEND_API_KEY is unset so the deferred
 * email closures no-op and need no mocks.
 */

const m = vi.hoisted(() => ({
  after: vi.fn(),
  constructEvent: vi.fn(),
  // db (outside tx)
  stripeEventFindUnique: vi.fn(),
  transaction: vi.fn(),
  // tx client
  txRsvpFindUnique: vi.fn(),
  txRsvpFindFirst: vi.fn(),
  txRsvpUpdate: vi.fn(),
  txRsvpUpdateMany: vi.fn(),
  txStripeEventCreate: vi.fn(),
  txExecuteRaw: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: m.after };
});
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: m.constructEvent } },
}));
vi.mock('@/lib/db', () => ({
  db: {
    stripeEvent: { findUnique: m.stripeEventFindUnique },
    $transaction: m.transaction,
    // Deferred closures read via db; unused because after() is a no-op here.
    auditEvent: { create: vi.fn() },
    event: { findUnique: vi.fn() },
    member: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/resend', () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock('@/lib/email-templates', () => ({ rsvpConfirmedEmail: vi.fn(() => ({ subject: '', html: '' })) }));
vi.mock('@/lib/emit-event', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/ticket-confirmation', () => ({
  resolveTicketRecipient: vi.fn(() => ({ email: 'x@y.com', name: 'X' })),
  shouldSendConfirmationEmail: vi.fn(() => false),
}));
vi.mock('@/lib/alerting', () => ({ alert: m.alert }));

import { POST } from '@/app/api/webhooks/nobc/stripe/route';

const tx = {
  rSVP: {
    findUnique: m.txRsvpFindUnique,
    findFirst: m.txRsvpFindFirst,
    update: m.txRsvpUpdate,
    updateMany: m.txRsvpUpdateMany,
  },
  stripeEvent: { create: m.txStripeEventCreate },
  $executeRaw: m.txExecuteRaw,
};

const makeReq = (sig: string | null, raw = '{}') =>
  ({
    text: async () => raw,
    headers: { get: (h: string) => (h === 'stripe-signature' ? sig : null) },
  }) as never;

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  delete process.env.RESEND_API_KEY;
  m.stripeEventFindUnique.mockResolvedValue(null); // not seen by default
  m.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  m.txStripeEventCreate.mockResolvedValue({});
  m.txRsvpUpdateMany.mockResolvedValue({ count: 1 });
  m.txExecuteRaw.mockResolvedValue(1);
});

describe('stripe webhook: signature', () => {
  it('missing signature -> 400, no DB touched', async () => {
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
    expect(m.stripeEventFindUnique).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('invalid signature -> 400, no money write', async () => {
    m.constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const res = await POST(makeReq('t=1,v1=bad'));
    expect(res.status).toBe(400);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});

describe('stripe webhook: idempotency dedup', () => {
  it('already-seen event short-circuits before any money write', async () => {
    m.constructEvent.mockReturnValue({ id: 'evt_seen', type: 'payment_intent.succeeded', data: { object: {} } });
    m.stripeEventFindUnique.mockResolvedValue({ id: 'row' });
    const res = await POST(makeReq('sig'));
    expect(await res.json()).toMatchObject({ received: true, deduped: true });
    // The whole point: no transaction, so no money state is re-applied.
    expect(m.transaction).not.toHaveBeenCalled();
  });
});

describe('stripe webhook: payment_intent.succeeded', () => {
  beforeEach(() => {
    m.constructEvent.mockReturnValue({
      id: 'evt_ok',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', metadata: { workspaceId: 'w1', memberId: 'm1' } } },
    });
    m.txRsvpFindFirst.mockResolvedValue({
      id: 'r1', eventId: 'e1', paymentStatus: 'AUTHORIZED', guestEmail: null, guestName: null,
    });
  });

  it('captures with the do-not-regress status guard and records the dedup row', async () => {
    const res = await POST(makeReq('sig'));
    expect(await res.json()).toMatchObject({ received: true });

    expect(m.txRsvpUpdateMany).toHaveBeenCalledOnce();
    const call = m.txRsvpUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      stripePaymentIntentId: 'pi_1',
      workspaceId: 'w1',
      paymentStatus: { notIn: ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'] },
    });
    expect(call.data).toMatchObject({ ticketStatus: 'confirmed', status: 'CONFIRMED', paymentStatus: 'CAPTURED' });
    expect(call.data.capturedAt).toBeInstanceOf(Date);

    // Dedup row written in the SAME transaction, tagged with the resolved workspace.
    expect(m.txStripeEventCreate).toHaveBeenCalledWith({
      data: { stripeId: 'evt_ok', type: 'payment_intent.succeeded', workspaceId: 'w1' },
    });
  });
});

describe('stripe webhook: charge.refunded', () => {
  it('full refund -> REFUNDED via updateMany (refundedAt set)', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_full',
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_1', amount: 5000, amount_refunded: 5000 } },
    });
    m.txRsvpFindFirst.mockResolvedValue({ id: 'r1', workspaceId: 'w1' });

    const res = await POST(makeReq('sig'));
    expect(await res.json()).toMatchObject({ received: true });

    expect(m.txRsvpUpdateMany).toHaveBeenCalledOnce();
    const call = m.txRsvpUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ stripePaymentIntentId: 'pi_1', workspaceId: 'w1', paymentStatus: { notIn: ['REFUNDED', 'DISPUTED'] } });
    expect(call.data).toMatchObject({ paymentStatus: 'REFUNDED', ticketStatus: 'refunded', refundAmountCents: 5000 });
    expect(call.data.refundedAt).toBeInstanceOf(Date);
    // The full branch must NOT use the raw partial path.
    expect(m.txExecuteRaw).not.toHaveBeenCalled();
  });

  it('partial refund -> monotonic raw UPDATE, never frozen out (C1 regression guard)', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_partial',
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_1', amount: 5000, amount_refunded: 2000 } },
    });
    m.txRsvpFindFirst.mockResolvedValue({ id: 'r1', workspaceId: 'w1' });

    const res = await POST(makeReq('sig'));
    expect(await res.json()).toMatchObject({ received: true });

    // Partial reconciliation goes through $executeRaw (a notIn updateMany would
    // freeze a second partial). updateMany must NOT be used for the partial.
    expect(m.txExecuteRaw).toHaveBeenCalledOnce();
    expect(m.txRsvpUpdateMany).not.toHaveBeenCalled();
    // Dedup row still recorded.
    expect(m.txStripeEventCreate).toHaveBeenCalledOnce();
  });

  it('charge with no payment_intent records dedup row and writes nothing', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_nopi',
      type: 'charge.refunded',
      data: { object: { payment_intent: null, amount: 5000, amount_refunded: 5000 } },
    });
    const res = await POST(makeReq('sig'));
    expect(await res.json()).toMatchObject({ received: true });
    expect(m.txRsvpUpdateMany).not.toHaveBeenCalled();
    expect(m.txExecuteRaw).not.toHaveBeenCalled();
    expect(m.txStripeEventCreate).toHaveBeenCalledOnce();
  });
});

describe('stripe webhook: payment_intent.payment_failed', () => {
  // The alert lives in a deferred closure (runs via after()). Capture the
  // after() callback and await it explicitly so the assertion is deterministic.
  let runDeferred: (() => Promise<void>) | undefined;
  beforeEach(() => {
    runDeferred = undefined;
    m.after.mockImplementation((fn: () => Promise<void>) => {
      runDeferred = fn;
    });
    m.constructEvent.mockReturnValue({
      id: 'evt_fail',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail', amount: 5000, metadata: { workspaceId: 'w1', memberId: 'm1' } } },
    });
    m.txRsvpFindFirst.mockResolvedValue({ id: 'r_fail' });
  });

  it('flips the held RSVP to payment_failed and records the dedup row', async () => {
    const res = await POST(makeReq('sig'));
    expect(await res.json()).toMatchObject({ received: true });

    expect(m.txRsvpUpdateMany).toHaveBeenCalledOnce();
    const call = m.txRsvpUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      stripePaymentIntentId: 'pi_fail',
      workspaceId: 'w1',
      ticketStatus: { in: ['held'] },
    });
    expect(call.data).toMatchObject({ ticketStatus: 'payment_failed', status: 'DECLINED', paymentStatus: 'FAILED' });

    // Dedup row written in the SAME transaction, tagged with the resolved workspace.
    expect(m.txStripeEventCreate).toHaveBeenCalledWith({
      data: { stripeId: 'evt_fail', type: 'payment_intent.payment_failed', workspaceId: 'w1' },
    });
  });

  it('fires an operator alert (severity error) instead of failing silently', async () => {
    await POST(makeReq('sig'));
    await runDeferred?.();

    expect(m.alert).toHaveBeenCalledOnce();
    const payload = m.alert.mock.calls[0][0];
    expect(payload).toMatchObject({
      severity: 'error',
      event: 'stripe.payment_intent.failed',
      workspaceId: 'w1',
    });
    expect(payload.context).toMatchObject({
      rsvpId: 'r_fail',
      paymentIntentId: 'pi_fail',
      reason: 'payment_intent.payment_failed',
    });
  });

  it('payment_intent.canceled also alerts (same branch)', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_cancel',
      type: 'payment_intent.canceled',
      data: { object: { id: 'pi_cancel', amount: 5000, metadata: { workspaceId: 'w1' } } },
    });
    await POST(makeReq('sig'));
    await runDeferred?.();

    expect(m.alert).toHaveBeenCalledOnce();
    expect(m.alert.mock.calls[0][0]).toMatchObject({
      event: 'stripe.payment_intent.failed',
      context: { reason: 'payment_intent.canceled' },
    });
  });
});

describe('stripe webhook: failure handling', () => {
  beforeEach(() => {
    m.constructEvent.mockReturnValue({
      id: 'evt_x',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', metadata: { workspaceId: 'w1' } } },
    });
  });

  it('P2002 (concurrent duplicate) -> 200 deduped, not 500', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' });
    m.transaction.mockRejectedValue(p2002);
    const res = await POST(makeReq('sig'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, deduped: true });
  });

  it('other transaction failure -> 500 so Stripe retries', async () => {
    m.transaction.mockRejectedValue(new Error('db down'));
    const res = await POST(makeReq('sig'));
    expect(res.status).toBe(500);
  });
});
