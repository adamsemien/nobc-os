import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Public guest checkout oversell guard — /api/e/[slug]/access/payment-intent.
 *
 * A TICKETED event with no existing RSVP used to count-then-write on the plain
 * client: two concurrent guest checkouts could both pass the earlier
 * hasCapacity() check and both write, overselling the last seat. Contract under
 * test: the first-time RSVP create runs inside ONE serializable $transaction
 * that re-counts taken seats (confirmed/held) against event.capacity, throws a
 * FULL error when at capacity, and on FULL cancels the PaymentIntent we just
 * minted (so it doesn't dangle as a 7-day hold) and returns 409. The existing
 * idempotency key on paymentIntents.create is preserved.
 *
 * Amounts: the buyer covers the Stripe fee (lib/ticketing/buyer-fee.ts), so
 * the $50.00 gate price below charges 5180 cents ($50.00 + $1.80 fee).
 *
 * Only the DB, stripe, access helpers, rate limit, and loader are mocked.
 */

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  // db-level
  eventFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  tierFindFirst: vi.fn(),
  rsvpFindFirst: vi.fn(),
  rsvpCreate: vi.fn(),
  rsvpUpdate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  // tx-client — distinct so a test proves the write ran on the tx
  txRsvpCount: vi.fn(),
  txRsvpCreate: vi.fn(),
  // stripe
  piCreate: vi.fn(),
  piRetrieve: vi.fn(),
  piCancel: vi.fn(),
  // access helpers
  resolveViewer: vi.fn(),
  loadAccessContext: vi.fn(),
  priceForResolved: vi.fn(),
  findOrCreateGuestMember: vi.fn(),
  hasCapacity: vi.fn(),
  resolvePublishedEventBySlug: vi.fn(),
  publicRateLimit: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }));
vi.mock('@/lib/db', () => ({
  db: {
    event: { findFirst: m.eventFindFirst },
    member: { findFirst: m.memberFindFirst },
    ticketTier: { findFirst: m.tierFindFirst },
    rSVP: { findFirst: m.rsvpFindFirst, create: m.rsvpCreate, update: m.rsvpUpdate },
    auditEvent: { create: m.auditCreate },
    $transaction: m.transaction,
  },
}));
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { create: m.piCreate, retrieve: m.piRetrieve, cancel: m.piCancel },
  },
}));
vi.mock('@/lib/event-access', () => ({ resolveViewer: m.resolveViewer }));
vi.mock('@/lib/event-access-submit', () => ({
  loadAccessContext: m.loadAccessContext,
  priceForResolved: m.priceForResolved,
  findOrCreateGuestMember: m.findOrCreateGuestMember,
  hasCapacity: m.hasCapacity,
}));
vi.mock('@/lib/public-event-loader', () => ({ resolvePublishedEventBySlug: m.resolvePublishedEventBySlug }));
vi.mock('@/lib/public-rate-limit', () => ({ publicRateLimit: m.publicRateLimit }));

import { POST } from '@/app/api/e/[slug]/access/payment-intent/route';

const tx = { rSVP: { count: m.txRsvpCount, create: m.txRsvpCreate } };

const post = (body: Record<string, unknown> = { guestEmail: 'g@x.com', guestName: 'Guest' }) =>
  POST(
    { json: async () => body } as never,
    { params: Promise.resolve({ slug: 'gala' }) } as never,
  );

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  // Happy-path guest checkout for a capped TICKETED event with no existing RSVP.
  m.publicRateLimit.mockReturnValue({ allowed: true });
  m.auth.mockResolvedValue({ userId: null });
  m.resolvePublishedEventBySlug.mockResolvedValue({ workspaceId: 'w1', eventId: 'ev1' });
  m.eventFindFirst.mockResolvedValue({ id: 'ev1' });
  m.memberFindFirst.mockResolvedValue(null);
  m.resolveViewer.mockReturnValue('guest');
  m.loadAccessContext.mockResolvedValue({
    ok: true,
    resolved: { kind: 'guest', flow: 'guest' },
    event: { capacity: 2, title: 'Gala' },
  });
  m.priceForResolved.mockReturnValue(5000);
  m.findOrCreateGuestMember.mockResolvedValue({ id: 'g1', email: 'g@x.com' });
  m.hasCapacity.mockResolvedValue(true);
  m.rsvpFindFirst.mockResolvedValue(null); // no existing RSVP → else branch
  m.piCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'cs_1', amount: 5180, status: 'requires_payment_method' });
  m.piCancel.mockResolvedValue({});
  m.auditCreate.mockResolvedValue({});
  // $transaction runs the callback against the tx client by default.
  m.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  m.txRsvpCreate.mockResolvedValue({ id: 'r-new' });
});

describe('public guest checkout: serializable capacity re-check on first-time RSVP', () => {
  it('keeps the idempotency key on paymentIntents.create', async () => {
    m.txRsvpCount.mockResolvedValue(1);
    await post();
    expect(m.piCreate).toHaveBeenCalledOnce();
    // 2nd arg carries the idempotency key scoped to (workspace, event, member,
    // amount, capture_method) — amount+mode in the key so a price/mode change
    // mints a fresh PI instead of reusing the stale one.
    expect(m.piCreate.mock.calls[0][1]).toMatchObject({ idempotencyKey: 'pi-w1-ev1-g1-5180-automatic' });
  });

  it('seat available: re-counts taken seats and creates the RSVP on the SAME transaction', async () => {
    m.txRsvpCount.mockResolvedValue(1);
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ clientSecret: 'cs_1', rsvpId: 'r-new', amountCents: 5180 });

    expect(m.transaction).toHaveBeenCalledOnce();
    expect(m.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
    expect(m.txRsvpCount).toHaveBeenCalledWith({
      where: { workspaceId: 'w1', eventId: 'ev1', ticketStatus: { in: ['confirmed', 'held'] } },
    });
    expect(m.txRsvpCreate).toHaveBeenCalledOnce();
    expect(m.txRsvpCreate.mock.calls[0][0].data).toMatchObject({
      ticketStatus: 'held',
      // PENDING (not AUTHORIZED) at create — AUTHORIZED is written only by the
      // amount_capturable_updated webhook. Writing AUTHORIZED here would gate off
      // the immediate-capture confirmation email (shouldSendConfirmationEmail).
      paymentStatus: 'PENDING',
      stripePaymentIntentId: 'pi_1',
    });
    // The plain-client create is NOT used for first-time RSVPs.
    expect(m.rsvpCreate).not.toHaveBeenCalled();
    expect(m.piCancel).not.toHaveBeenCalled();
  });

  it('full event inside the transaction: 409 and cancels the dangling PaymentIntent', async () => {
    m.txRsvpCount.mockResolvedValue(2); // at capacity
    const res = await post();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Event is full' });

    expect(m.txRsvpCreate).not.toHaveBeenCalled();
    // The minted PI is cancelled so it doesn't dangle as a 7-day hold.
    expect(m.piCancel).toHaveBeenCalledWith('pi_1');
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('uncapped event: skips the re-count and creates directly', async () => {
    m.loadAccessContext.mockResolvedValue({
      ok: true,
      resolved: { kind: 'guest', flow: 'guest' },
      event: { capacity: null, title: 'Gala' },
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect(m.txRsvpCount).not.toHaveBeenCalled();
    expect(m.txRsvpCreate).toHaveBeenCalledOnce();
    expect(m.piCancel).not.toHaveBeenCalled();
  });
});
