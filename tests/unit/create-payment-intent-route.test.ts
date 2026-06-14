import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Legacy member PI route — /api/stripe/create-payment-intent.
 *
 * Pins two hardening fixes:
 *   - C2: a held RSVP whose PI has already SUCCEEDED (webhook lag + member retry)
 *     must return 409, NOT call stripe.cancel() on a succeeded PI (that throws an
 *     unhandled 500 after the card was charged).
 *   - H1: the idempotency key encodes amount + capture_method, so a price/mode
 *     change between attempts mints a fresh PI instead of reusing a stale one.
 *
 * Only auth, workspace resolve, db, and stripe are mocked.
 */

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getMemberWorkspaceId: vi.fn(),
  getOrCreateMemberFromClerk: vi.fn(),
  eventFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  rsvpFindFirst: vi.fn(),
  rsvpCount: vi.fn(),
  rsvpCreate: vi.fn(),
  rsvpUpdate: vi.fn(),
  auditCreate: vi.fn(),
  piCreate: vi.fn(),
  piRetrieve: vi.fn(),
  piCancel: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }));
vi.mock('@/lib/auth', () => ({ getMemberWorkspaceId: m.getMemberWorkspaceId }));
vi.mock('@/lib/clerk-member', () => ({ getOrCreateMemberFromClerk: m.getOrCreateMemberFromClerk }));
vi.mock('@/lib/db', () => ({
  db: {
    event: { findFirst: m.eventFindFirst },
    member: { findFirst: m.memberFindFirst },
    rSVP: { findFirst: m.rsvpFindFirst, count: m.rsvpCount, create: m.rsvpCreate, update: m.rsvpUpdate },
    auditEvent: { create: m.auditCreate },
  },
}));
vi.mock('@/lib/stripe', () => ({
  stripe: { paymentIntents: { create: m.piCreate, retrieve: m.piRetrieve, cancel: m.piCancel } },
}));
vi.mock('@/lib/alerting', () => ({ alert: m.alert }));

import { POST } from '@/app/api/stripe/create-payment-intent/route';

const post = (body: Record<string, unknown> = { eventId: 'ev1' }) =>
  POST({ json: async () => body } as never);

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.auth.mockResolvedValue({ userId: 'u1' });
  m.getMemberWorkspaceId.mockResolvedValue('w1');
  m.eventFindFirst.mockResolvedValue({
    id: 'ev1', title: 'E', priceInCents: 5000, nonMemberPriceInCents: 5000,
    capacity: null, accessMode: 'TICKETED', approvalRequired: false,
  });
  m.memberFindFirst.mockResolvedValue({ id: 'mem1', approved: true, email: 'a@b.com', firstName: 'A', lastName: 'B' });
  m.rsvpCount.mockResolvedValue(0);
  m.auditCreate.mockResolvedValue({});
});

describe('create-payment-intent: C2 already-succeeded PI', () => {
  it('returns 409 and never cancels a succeeded PI', async () => {
    m.rsvpFindFirst.mockResolvedValue({ id: 'r1', ticketStatus: 'held', stripePaymentIntentId: 'pi_old' });
    m.piRetrieve.mockResolvedValue({ status: 'succeeded' });

    const res = await post();
    expect(res.status).toBe(409);
    expect(m.piCancel).not.toHaveBeenCalled(); // canceling a succeeded PI throws
    expect(m.piCreate).not.toHaveBeenCalled(); // never re-charge
  });
});

describe('create-payment-intent: H1 idempotency key', () => {
  it('encodes amount + capture_method', async () => {
    m.rsvpFindFirst.mockResolvedValue(null); // fresh RSVP
    m.piCreate.mockResolvedValue({ id: 'pi_new', client_secret: 'cs', status: 'requires_payment_method' });
    m.rsvpCreate.mockResolvedValue({ id: 'r_new' });

    await post();
    expect(m.piCreate).toHaveBeenCalledOnce();
    expect(m.piCreate.mock.calls[0][1]).toMatchObject({ idempotencyKey: 'pi-w1-ev1-mem1-5000-automatic' });
  });
});
