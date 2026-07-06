/** Ways-In Phase A fact emitters - route layer (spec §4).
 *
 *  The dual-writes on the operator cancel / promote-waitlist / comp routes
 *  and the anonymous -> identified access_requested emission on the gate
 *  token route: each fires exactly once on its trigger path, and never on
 *  the guarded (terminal / empty / duplicate / already-identified) paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const { logEngagement, emitEventMock, dbMock } = vi.hoisted(() => ({
  logEngagement: vi.fn(),
  emitEventMock: vi.fn().mockResolvedValue(undefined),
  dbMock: {
    rSVP: { findFirst: vi.fn(), update: vi.fn() },
    event: { findFirst: vi.fn() },
    member: { update: vi.fn() },
    auditEvent: { create: vi.fn() },
    gateSession: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: logEngagement }));
vi.mock('@/lib/emit-event', () => ({ emitEvent: emitEventMock }));
vi.mock('@/lib/operator-role', () => ({
  requireRole: vi.fn().mockResolvedValue({ ok: true, userId: 'u1', workspaceId: 'w1' }),
}));
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/event-access-submit', () => ({
  findOrCreateGuestMember: vi.fn().mockResolvedValue({
    id: 'm1',
    email: 'g@x.com',
    firstName: 'G',
    lastName: 'T',
    memberQrCode: 'qr1',
  }),
}));
// Gate token route surface: identify path only - everything downstream of
// the emission is stubbed.
vi.mock('@/lib/gate-engine/guest-session', () => ({
  identifyGuestSession: vi.fn(),
  loadGuestGateContext: vi.fn(),
  guestViewForSession: vi.fn().mockResolvedValue({ available: true }),
}));
vi.mock('@/lib/gate-engine', () => ({
  getGateEngine: () => ({}),
  getDefaultRegistry: () => ({}),
}));
vi.mock('@/lib/commerce/gate-bridge', () => ({ bridgeGateAdmission: vi.fn() }));
vi.mock('@/lib/commerce/confirmation', () => ({ sendTicketConfirmation: vi.fn() }));
vi.mock('@/lib/commerce/promo-codes', () => ({ checkCompCode: vi.fn(), redeemCompCode: vi.fn() }));

import { POST as cancelPost } from '@/app/api/operator/rsvps/[id]/cancel/route';
import { POST as promotePost } from '@/app/api/operator/events/[id]/promote-waitlist/route';
import { POST as compPost } from '@/app/api/operator/events/[id]/comp/route';
import { POST as gatePost } from '@/app/api/gate/[token]/route';
import { identifyGuestSession } from '@/lib/gate-engine/guest-session';

const params = (v: Record<string, string>) => ({ params: Promise.resolve(v) }) as never;
const req = (body?: unknown) =>
  new Request('http://localhost/x', {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  }) as unknown as NextRequest;

beforeEach(() => {
  logEngagement.mockReset();
  emitEventMock.mockReset();
  emitEventMock.mockResolvedValue(undefined);
  dbMock.rSVP.findFirst.mockReset();
  dbMock.rSVP.update.mockReset();
  dbMock.event.findFirst.mockReset();
  dbMock.auditEvent.create.mockReset();
  dbMock.gateSession.findUnique.mockReset();
  dbMock.$transaction.mockReset();
  vi.mocked(identifyGuestSession).mockReset();
});

describe('operator cancel route - rsvp_cancelled dual-write', () => {
  it('passes the engagement fact to emitEvent exactly once', async () => {
    dbMock.rSVP.findFirst.mockResolvedValue({
      id: 'r1',
      ticketStatus: 'confirmed',
      stripePaymentIntentId: null,
      paymentStatus: 'PENDING',
      eventId: 'ev1',
      memberId: 'm1',
      member: { personId: 'p1' },
    });
    dbMock.rSVP.update.mockResolvedValue({ id: 'r1' });

    const res = await cancelPost(req(), params({ id: 'r1' }));
    expect(res.status).toBe(200);
    expect(emitEventMock).toHaveBeenCalledOnce();
    expect(emitEventMock.mock.calls[0][0].engagement).toEqual({
      memberId: 'm1',
      personId: 'p1',
      eventType: 'rsvp_cancelled',
      eventId: 'ev1',
    });
  });

  it('a terminal RSVP 409s before any emit', async () => {
    dbMock.rSVP.findFirst.mockResolvedValue({
      id: 'r1',
      ticketStatus: 'cancelled',
      stripePaymentIntentId: null,
      paymentStatus: 'PENDING',
      eventId: 'ev1',
      memberId: 'm1',
      member: { personId: null },
    });
    const res = await cancelPost(req(), params({ id: 'r1' }));
    expect(res.status).toBe(409);
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});

describe('promote-waitlist route - waitlist_promoted dual-write', () => {
  function promoteTx(next: { id: string; memberId: string } | null) {
    dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn().mockResolvedValue([]),
        rSVP: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(next),
          update: vi.fn().mockResolvedValue({ id: next?.id ?? 'r1' }),
        },
      }),
    );
  }

  it('passes the engagement fact with the promoted member exactly once', async () => {
    dbMock.event.findFirst.mockResolvedValue({ id: 'ev1', capacity: null });
    promoteTx({ id: 'r1', memberId: 'm1' });

    const res = await promotePost(req(), params({ id: 'ev1' }));
    expect(res.status).toBe(200);
    expect(emitEventMock).toHaveBeenCalledOnce();
    expect(emitEventMock.mock.calls[0][0].engagement).toEqual({
      memberId: 'm1',
      eventType: 'waitlist_promoted',
      eventId: 'ev1',
    });
  });

  it('an empty waitlist 404s before any emit', async () => {
    dbMock.event.findFirst.mockResolvedValue({ id: 'ev1', capacity: null });
    promoteTx(null);

    const res = await promotePost(req(), params({ id: 'ev1' }));
    expect(res.status).toBe(404);
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});

describe('comp route - comp_issued alongside the audit write', () => {
  const body = { firstName: 'G', lastName: 'T', email: 'g@x.com', compType: 'Press' };

  function compTx(existing: { id: string } | null) {
    dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn().mockResolvedValue([]),
        rSVP: {
          findFirst: vi.fn().mockResolvedValue(existing),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 'r1', memberId: 'm1' }),
        },
      }),
    );
  }

  it('emits comp_issued exactly once on a fresh comp', async () => {
    dbMock.event.findFirst.mockResolvedValue({
      id: 'ev1', title: 'T', slug: 's', startAt: new Date(), location: null, capacity: null,
    });
    dbMock.auditEvent.create.mockResolvedValue({ id: 'a1' });
    compTx(null);

    const res = await compPost(req(body), params({ id: 'ev1' }));
    expect(res.status).toBe(200);
    expect(dbMock.auditEvent.create).toHaveBeenCalledOnce();
    expect(logEngagement).toHaveBeenCalledOnce();
    expect(logEngagement.mock.calls[0][0]).toMatchObject({
      workspaceId: 'w1',
      memberId: 'm1',
      eventType: 'comp_issued',
      eventId: 'ev1',
    });
  });

  it('an already-comped guest 409s before audit and emit', async () => {
    dbMock.event.findFirst.mockResolvedValue({
      id: 'ev1', title: 'T', slug: 's', startAt: new Date(), location: null, capacity: null,
    });
    compTx({ id: 'r-existing' });

    const res = await compPost(req(body), params({ id: 'ev1' }));
    expect(res.status).toBe(409);
    expect(dbMock.auditEvent.create).not.toHaveBeenCalled();
    expect(logEngagement).not.toHaveBeenCalled();
  });
});

describe('gate token route - access_requested on the anonymous -> identified transition', () => {
  const context = {
    session: { id: 's1', memberId: 'm-new', workspaceId: 'w1', gateId: 'g1' },
    gate: { id: 'g1', resourceType: 'EVENT', resourceId: 'ev1' },
  };
  const identifyBody = { action: 'identify', email: 'g@x.com', name: 'G T' };

  it('emits once when THIS call attached the member', async () => {
    dbMock.gateSession.findUnique.mockResolvedValue({ memberId: null }); // anonymous before
    vi.mocked(identifyGuestSession).mockResolvedValue(context as never);

    const res = await gatePost(req(identifyBody), params({ token: 'tok-fresh-1' }));
    expect(res.status).toBe(200);
    expect(logEngagement).toHaveBeenCalledOnce();
    expect(logEngagement.mock.calls[0][0]).toMatchObject({
      workspaceId: 'w1',
      memberId: 'm-new',
      eventType: 'access_requested',
      eventId: 'ev1',
    });
  });

  it('emits nothing when the session was already identified (capability re-open)', async () => {
    dbMock.gateSession.findUnique.mockResolvedValue({ memberId: 'm-old' });
    vi.mocked(identifyGuestSession).mockResolvedValue(context as never);

    const res = await gatePost(req(identifyBody), params({ token: 'tok-fresh-2' }));
    expect(res.status).toBe(200);
    expect(logEngagement).not.toHaveBeenCalled();
  });
});
