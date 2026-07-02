import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Buyer-pays-Stripe-fee at the two LIVE checkout routes:
 *   - /api/e/[slug]/access/payment-intent  (public guest surface)
 *   - /api/m/events/[slug]/access/payment-intent  (member surface)
 *
 * Contract under test (both routes):
 *   - The PaymentIntent is created for the GROSSED-UP amount, not the ticket
 *     price: $25.00 gate price -> 2606 charged, metadata.feeCents '106' so the
 *     Stripe record shows the ticket/fee split.
 *   - The idempotency key carries the charged amount (a price change still
 *     mints a fresh PI).
 *   - The RSVP row and the JSON response both carry the charged total (what
 *     the refund math and the pay-step display consume).
 *   - Tier-priced checkouts gross up the tier price the same way.
 *
 * The gross-up math itself (exactness, netting within a cent) is proven in
 * tests/unit/buyer-fee.test.ts; only the DB, stripe, auth, and access helpers
 * are mocked here — grossUpForBuyer runs for real inside the routes.
 */

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  // db
  eventFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  tierFindFirst: vi.fn(),
  rsvpFindFirst: vi.fn(),
  rsvpCount: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
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
  findOrCreateOperatorMember: vi.fn(),
  hasCapacity: vi.fn(),
  resolvePublishedEventBySlug: vi.fn(),
  publicRateLimit: vi.fn(),
  // member-route deps
  getMemberWorkspaceId: vi.fn(),
  isStaff: vi.fn(),
  runSerializable: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }));
vi.mock('@/lib/db', () => ({
  db: {
    event: { findFirst: m.eventFindFirst },
    member: { findFirst: m.memberFindFirst },
    ticketTier: { findFirst: m.tierFindFirst },
    rSVP: { findFirst: m.rsvpFindFirst, count: m.rsvpCount },
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
  findOrCreateOperatorMember: m.findOrCreateOperatorMember,
  hasCapacity: m.hasCapacity,
}));
vi.mock('@/lib/public-event-loader', () => ({ resolvePublishedEventBySlug: m.resolvePublishedEventBySlug }));
vi.mock('@/lib/public-rate-limit', () => ({ publicRateLimit: m.publicRateLimit }));
vi.mock('@/lib/auth', () => ({ getMemberWorkspaceId: m.getMemberWorkspaceId }));
vi.mock('@/lib/operator-role', () => ({ isStaff: m.isStaff }));
vi.mock('@/lib/serializable-retry', () => ({ runSerializable: m.runSerializable }));
vi.mock('@/lib/alerting', () => ({ alert: m.alert }));

import { POST as publicPost } from '@/app/api/e/[slug]/access/payment-intent/route';
import { POST as memberPost } from '@/app/api/m/events/[slug]/access/payment-intent/route';

const tx = { rSVP: { count: m.txRsvpCount, create: m.txRsvpCreate } };

const callPublic = (body: Record<string, unknown> = { guestEmail: 'g@x.com', guestName: 'Guest' }) =>
  publicPost(
    { json: async () => body } as never,
    { params: Promise.resolve({ slug: 'no-bad-saturday' }) } as never,
  );

const callMember = (body: Record<string, unknown> = {}) =>
  memberPost(
    { json: async () => body } as never,
    { params: Promise.resolve({ slug: 'no-bad-saturday' }) } as never,
  );

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  // Shared happy path: uncapped published TICKETED event, $25.00 gate price,
  // no existing RSVP. 2500 grosses up to 2606 charged / 106 fee.
  m.publicRateLimit.mockReturnValue({ allowed: true });
  m.auth.mockResolvedValue({ userId: null });
  m.resolvePublishedEventBySlug.mockResolvedValue({ workspaceId: 'w1', eventId: 'ev1' });
  m.eventFindFirst.mockResolvedValue({ id: 'ev1' });
  m.resolveViewer.mockReturnValue('guest');
  m.loadAccessContext.mockResolvedValue({
    ok: true,
    resolved: { kind: 'guest', flow: ['pay'] },
    event: { capacity: null, title: 'No Bad Saturday', approvalRequired: false },
  });
  m.priceForResolved.mockReturnValue(2500);
  m.findOrCreateGuestMember.mockResolvedValue({ id: 'g1', email: 'g@x.com' });
  m.hasCapacity.mockResolvedValue(true);
  m.memberFindFirst.mockResolvedValue(null);
  m.rsvpFindFirst.mockResolvedValue(null);
  m.piCreate.mockResolvedValue({
    id: 'pi_1',
    client_secret: 'cs_1',
    amount: 2606,
    status: 'requires_payment_method',
  });
  m.auditCreate.mockResolvedValue({});
  m.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  m.runSerializable.mockImplementation(
    async (_db: unknown, fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  );
  m.txRsvpCreate.mockResolvedValue({ id: 'r-new' });
});

describe('public route: buyer covers the Stripe fee', () => {
  it('mints the PI for the grossed-up amount with the fee split in metadata', async () => {
    const res = await callPublic();
    expect(res.status).toBe(200);

    expect(m.piCreate).toHaveBeenCalledOnce();
    const [params, opts] = m.piCreate.mock.calls[0];
    expect(params).toMatchObject({
      amount: 2606, // $25.00 ticket + $1.06 service fee
      currency: 'usd',
      metadata: { feeCents: '106', eventId: 'ev1', memberId: 'g1' },
    });
    // Charged amount (not the base price) keys idempotency.
    expect(opts).toMatchObject({ idempotencyKey: 'pi-w1-ev1-g1-2606-automatic' });

    // The RSVP row records what the card is actually charged.
    expect(m.txRsvpCreate.mock.calls[0][0].data).toMatchObject({ amountCents: 2606 });

    // The client displays line items derived from this same total.
    expect(await res.json()).toMatchObject({ clientSecret: 'cs_1', rsvpId: 'r-new', amountCents: 2606 });
  });

  it('grosses up a tier price the same way', async () => {
    m.tierFindFirst.mockResolvedValue({ memberPriceCents: null, nonMemberPriceCents: 1700 });
    const res = await callPublic({
      guestEmail: 'g@x.com',
      guestName: 'Guest',
      tierId: 'clfeepassthrough0001tier',
    });
    expect(res.status).toBe(200);
    expect(m.piCreate.mock.calls[0][0]).toMatchObject({
      amount: 1782, // $17.00 ticket + $0.82 service fee
      metadata: { feeCents: '82' },
    });
    expect(await res.json()).toMatchObject({ amountCents: 1782 });
  });

  it('leaves the free path alone: $0 still routes to submit with no fee', async () => {
    m.priceForResolved.mockReturnValue(0);
    const res = await callPublic();
    expect(res.status).toBe(400);
    expect(m.piCreate).not.toHaveBeenCalled();
  });
});

describe('member route: buyer covers the Stripe fee', () => {
  beforeEach(() => {
    m.auth.mockResolvedValue({ userId: 'u1' });
    m.getMemberWorkspaceId.mockResolvedValue('w1');
    m.isStaff.mockResolvedValue(false); // plain member — no operator comp bypass
    m.memberFindFirst.mockResolvedValue({
      id: 'm1',
      status: 'ACTIVE',
      email: 'm@x.com',
      memberQrCode: 'qr',
    });
    m.resolveViewer.mockReturnValue('member');
    m.loadAccessContext.mockResolvedValue({
      ok: true,
      resolved: { kind: 'member', flow: ['pay'] },
      event: { capacity: null, title: 'No Bad Saturday', approvalRequired: false },
    });
    m.piCreate.mockResolvedValue({
      id: 'pi_m',
      client_secret: 'cs_m',
      amount: 2606,
      status: 'requires_payment_method',
    });
    m.txRsvpCreate.mockResolvedValue({ id: 'r-m' });
  });

  it('mints the PI for the grossed-up amount with the fee split in metadata', async () => {
    const res = await callMember();
    expect(res.status).toBe(200);

    expect(m.piCreate).toHaveBeenCalledOnce();
    const [params, opts] = m.piCreate.mock.calls[0];
    expect(params).toMatchObject({
      amount: 2606,
      metadata: { feeCents: '106', eventId: 'ev1', memberId: 'm1' },
    });
    expect(opts).toMatchObject({ idempotencyKey: 'pi-w1-ev1-m1-2606-automatic' });

    expect(m.txRsvpCreate.mock.calls[0][0].data).toMatchObject({ amountCents: 2606 });
    expect(await res.json()).toMatchObject({ clientSecret: 'cs_m', rsvpId: 'r-m', amountCents: 2606 });
  });
});
