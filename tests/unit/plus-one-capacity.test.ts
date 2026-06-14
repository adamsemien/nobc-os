import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Plus-one capacity guard (EVENT-READINESS-AUDIT F6).
 *
 * The plus-one route created a confirmed-seat RSVP with no capacity check, so a
 * member could silently oversell a full event. Contract under test: the seat
 * count + the RSVP create run on ONE $transaction client behind the Event row
 * lock (SELECT ... FOR UPDATE), and a full event is a 409 with no write.
 */

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getMemberWorkspaceId: vi.fn(),
  eventFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  rsvpFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  resolveMember: vi.fn(),
  logEngagement: vi.fn(),
  resendSend: vi.fn(),
  // tx-client fns
  txQueryRaw: vi.fn(),
  txRsvpCount: vi.fn(),
  txRsvpCreate: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }));
vi.mock('@/lib/auth', () => ({ getMemberWorkspaceId: m.getMemberWorkspaceId }));
vi.mock('@/lib/db', () => ({
  db: {
    event: { findFirst: m.eventFindFirst },
    member: { findFirst: m.memberFindFirst },
    rSVP: { findFirst: m.rsvpFindFirst },
    auditEvent: { create: m.auditCreate },
    $transaction: m.transaction,
  },
}));
vi.mock('@/lib/member-identity', () => ({ resolveMember: m.resolveMember }));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: m.logEngagement }));
vi.mock('@/lib/resend', () => ({ resend: { emails: { send: m.resendSend } } }));

import { POST } from '@/app/api/rsvp/plus-one/route';

const tx = {
  $queryRaw: m.txQueryRaw,
  rSVP: { count: m.txRsvpCount, create: m.txRsvpCreate },
};

const body = { eventId: 'ev1', guestName: 'Jo Park', guestEmail: 'jo@example.com' };
const post = (b: unknown = body) => POST({ json: async () => b } as never);

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.auth.mockResolvedValue({ userId: 'user_1' });
  m.getMemberWorkspaceId.mockResolvedValue('w1');
  m.eventFindFirst.mockResolvedValue({
    id: 'ev1', title: 'Dinner', slug: 'dinner', startAt: new Date(), capacity: 2,
  });
  m.memberFindFirst.mockResolvedValue({ id: 'm1', approved: true, firstName: 'A', lastName: 'B' });
  // host RSVP lookup → exists; existing plus-one lookup → none
  m.rsvpFindFirst
    .mockResolvedValueOnce({ id: 'host' }) // host RSVP
    .mockResolvedValueOnce(null); // existing plus-one
  m.resolveMember.mockResolvedValue({ id: 'g1' });
  m.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  m.txQueryRaw.mockResolvedValue([]);
  m.auditCreate.mockResolvedValue({});
  m.logEngagement.mockReturnValue(undefined);
});

describe('F6 — plus-one route: transactional capacity gate', () => {
  it('seat available: lock → count → create on the same transaction', async () => {
    m.txRsvpCount.mockResolvedValue(1);
    m.txRsvpCreate.mockResolvedValue({ id: 'r-plus' });

    const res = await post();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ rsvpId: 'r-plus' });

    expect(m.transaction).toHaveBeenCalledOnce();
    expect(m.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
    expect(m.txQueryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(m.txQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      m.txRsvpCount.mock.invocationCallOrder[0],
    );
    expect(m.txRsvpCount).toHaveBeenCalledWith({
      where: { workspaceId: 'w1', eventId: 'ev1', ticketStatus: { in: ['confirmed', 'held'] } },
    });
    expect(m.txRsvpCreate.mock.calls[0][0].data).toMatchObject({
      memberId: 'g1',
      origin: 'plus_one',
      plusOneOfMemberId: 'm1',
      ticketStatus: 'confirmed',
    });
  });

  it('full event: 409, no create, no audit', async () => {
    m.txRsvpCount.mockResolvedValue(2);

    const res = await post();
    expect(res.status).toBe(409);
    expect(m.txRsvpCreate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('uncapped event: skips the lock + count and creates directly', async () => {
    m.eventFindFirst.mockResolvedValue({
      id: 'ev1', title: 'Dinner', slug: 'dinner', startAt: new Date(), capacity: null,
    });
    m.txRsvpCreate.mockResolvedValue({ id: 'r-plus' });

    const res = await post();
    expect(res.status).toBe(200);
    expect(m.txQueryRaw).not.toHaveBeenCalled();
    expect(m.txRsvpCount).not.toHaveBeenCalled();
    expect(m.txRsvpCreate).toHaveBeenCalledOnce();
  });
});
