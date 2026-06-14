import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Money-path concurrency guards (EVENT-READINESS-AUDIT F3, F5, F7).
 *
 * The operator approve + promote-waitlist routes used to count-then-write on the
 * plain client: two concurrent operators could confirm two people into one seat.
 * Contract under test: the capacity count + the write run on ONE $transaction
 * client behind the Event row lock (SELECT ... FOR UPDATE), and a full event is
 * a 409 instead of an oversell. The capture route used to be auth()-only; it now
 * requires STAFF+ so a READ_ONLY org member can't self-capture.
 *
 * Only the DB, role gate, transaction, emit, and Stripe are mocked.
 */

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  eventFindFirst: vi.fn(),
  rsvpFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  rsvpUpdate: vi.fn(),
  transaction: vi.fn(),
  emitEvent: vi.fn(),
  // tx-client fns — distinct from db-level so a test proves the write ran on the tx
  txQueryRaw: vi.fn(),
  txRsvpCount: vi.fn(),
  txRsvpFindFirst: vi.fn(),
  txRsvpUpdate: vi.fn(),
  // stripe (capture route)
  piRetrieve: vi.fn(),
  piCapture: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@/lib/operator-role', () => ({ requireRole: m.requireRole }));
vi.mock('@/lib/db', () => ({
  db: {
    event: { findFirst: m.eventFindFirst },
    rSVP: { findFirst: m.rsvpFindFirst, update: m.rsvpUpdate },
    auditEvent: { create: m.auditCreate },
    $transaction: m.transaction,
  },
}));
vi.mock('@/lib/emit-event', () => ({ emitEvent: m.emitEvent }));
vi.mock('@/lib/stripe', () => ({
  stripe: { paymentIntents: { retrieve: m.piRetrieve, capture: m.piCapture } },
}));
vi.mock('@/lib/alerting', () => ({ alert: m.alert }));

import { POST as approvePost } from '@/app/api/operator/rsvps/[id]/approve/route';
import { POST as promotePost } from '@/app/api/operator/events/[id]/promote-waitlist/route';
import { POST as capturePost } from '@/app/api/stripe/capture/route';

const STAFF_GATE = { ok: true, userId: 'op1', workspaceId: 'w1', role: 'STAFF' };

const tx = {
  $queryRaw: m.txQueryRaw,
  rSVP: { count: m.txRsvpCount, findFirst: m.txRsvpFindFirst, update: m.txRsvpUpdate },
};

const approve = (id = 'r1') =>
  approvePost({} as never, { params: Promise.resolve({ id }) } as never);
const promote = (id = 'ev1') =>
  promotePost({} as never, { params: Promise.resolve({ id }) } as never);
const capture = (rsvpId = 'r1') =>
  capturePost({ json: async () => ({ rsvpId }) } as never);

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requireRole.mockResolvedValue(STAFF_GATE);
  m.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  m.txQueryRaw.mockResolvedValue([]);
  m.emitEvent.mockResolvedValue(undefined);
  m.auditCreate.mockResolvedValue({});
});

describe('F5 — approve route: transactional capacity gate', () => {
  beforeEach(() => {
    m.rsvpFindFirst.mockResolvedValue({ id: 'r1', ticketStatus: 'pending_approval', eventId: 'ev1' });
    m.eventFindFirst.mockResolvedValue({ capacity: 2 });
    m.txRsvpUpdate.mockResolvedValue({ id: 'r1' });
  });

  it('non-STAFF caller gets the gate response, no DB work', async () => {
    m.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await approve();
    expect(res.status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('seat available: count + update run on the SAME transaction behind the row lock', async () => {
    m.txRsvpCount.mockResolvedValue(1);
    const res = await approve();
    expect(res.status).toBe(200);

    expect(m.transaction).toHaveBeenCalledOnce();
    expect(m.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
    // Lock first, then count.
    expect(m.txQueryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(m.txQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      m.txRsvpCount.mock.invocationCallOrder[0],
    );
    expect(m.txRsvpCount).toHaveBeenCalledWith({
      where: { workspaceId: 'w1', eventId: 'ev1', ticketStatus: { in: ['confirmed', 'held'] } },
    });
    expect(m.txRsvpUpdate).toHaveBeenCalledOnce();
    expect(m.txRsvpUpdate.mock.calls[0][0].data).toMatchObject({
      ticketStatus: 'confirmed',
      status: 'CONFIRMED',
    });
    expect(m.auditCreate.mock.calls[0][0].data).toMatchObject({ action: 'rsvp.approved' });
  });

  it('full event: 409, no update, no audit', async () => {
    m.txRsvpCount.mockResolvedValue(2);
    const res = await approve();
    expect(res.status).toBe(409);
    expect(m.txRsvpUpdate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('uncapped event: skips the lock + count and confirms directly', async () => {
    m.eventFindFirst.mockResolvedValue({ capacity: null });
    const res = await approve();
    expect(res.status).toBe(200);
    expect(m.txQueryRaw).not.toHaveBeenCalled();
    expect(m.txRsvpCount).not.toHaveBeenCalled();
    expect(m.txRsvpUpdate).toHaveBeenCalledOnce();
  });

  it('not pending_approval: 409 before any transaction', async () => {
    m.rsvpFindFirst.mockResolvedValue({ id: 'r1', ticketStatus: 'confirmed', eventId: 'ev1' });
    const res = await approve();
    expect(res.status).toBe(409);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});

describe('F3 — promote-waitlist route: transactional capacity gate', () => {
  beforeEach(() => {
    m.eventFindFirst.mockResolvedValue({ id: 'ev1', capacity: 2 });
    m.txRsvpFindFirst.mockResolvedValue({ id: 'r-wl', memberId: 'm9' });
    m.txRsvpUpdate.mockResolvedValue({ id: 'r-wl' });
  });

  it('non-STAFF caller gets the gate response, no DB work', async () => {
    m.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await promote();
    expect(res.status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('seat available: lock → count → claim → update all on the same transaction', async () => {
    m.txRsvpCount.mockResolvedValue(1);
    const res = await promote();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, rsvpId: 'r-wl' });

    expect(m.transaction).toHaveBeenCalledOnce();
    expect(m.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
    expect(m.txQueryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(m.txQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      m.txRsvpCount.mock.invocationCallOrder[0],
    );
    expect(m.txRsvpUpdate.mock.calls[0][0].data).toMatchObject({
      status: 'CONFIRMED',
      ticketStatus: 'confirmed',
    });
    expect(m.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rsvp.confirmed', entityId: 'r-wl' }),
    );
  });

  it('full event: 409, no one promoted, no emit', async () => {
    m.txRsvpCount.mockResolvedValue(2);
    const res = await promote();
    expect(res.status).toBe(409);
    expect(m.txRsvpUpdate).not.toHaveBeenCalled();
    expect(m.emitEvent).not.toHaveBeenCalled();
  });

  it('empty waitlist with a seat free: 404, nothing promoted', async () => {
    m.txRsvpCount.mockResolvedValue(0);
    m.txRsvpFindFirst.mockResolvedValue(null);
    const res = await promote();
    expect(res.status).toBe(404);
    expect(m.txRsvpUpdate).not.toHaveBeenCalled();
    expect(m.emitEvent).not.toHaveBeenCalled();
  });

  it('unknown event: 404 before any transaction', async () => {
    m.eventFindFirst.mockResolvedValue(null);
    const res = await promote();
    expect(res.status).toBe(404);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});

describe('F7 — capture route: STAFF+ role gate', () => {
  beforeEach(() => {
    m.rsvpFindFirst.mockResolvedValue({
      id: 'r1',
      stripePaymentIntentId: 'pi_1',
      paymentStatus: 'AUTHORIZED',
      capturedAt: null,
    });
    m.piRetrieve.mockResolvedValue({ status: 'requires_capture' });
    m.piCapture.mockResolvedValue({});
    m.rsvpUpdate.mockResolvedValue({});
  });

  it('a READ_ONLY / non-STAFF caller is rejected by the gate before any work', async () => {
    m.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await capture();
    expect(res.status).toBe(403);
    expect(m.piCapture).not.toHaveBeenCalled();
    expect(m.rsvpUpdate).not.toHaveBeenCalled();
  });

  it('gates on STAFF (capture is an operational write)', async () => {
    await capture();
    expect(m.requireRole).toHaveBeenCalledWith('STAFF');
  });

  it('STAFF caller captures the held payment and marks it CAPTURED', async () => {
    const res = await capture();
    expect(res.status).toBe(200);
    expect(m.piCapture).toHaveBeenCalledWith('pi_1');
    expect(m.rsvpUpdate.mock.calls[0][0].data).toMatchObject({ paymentStatus: 'CAPTURED' });
    expect(m.auditCreate.mock.calls[0][0].data).toMatchObject({ action: 'rsvp.payment_captured' });
  });
});
