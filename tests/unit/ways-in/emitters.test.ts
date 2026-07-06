/** Ways-In Phase A fact emitters - lib layer (spec §4).
 *
 *  Each new emitter fires EXACTLY ONCE on its trigger path and never on the
 *  idempotent re-walk. Route-level dual-writes are covered in
 *  emitter-routes.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const { logEngagement } = vi.hoisted(() => ({ logEngagement: vi.fn() }));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: logEngagement }));
// waitlist.ts pulls the resend client + email templates at module scope.
vi.mock('@/lib/resend', () => ({ resend: { emails: { send: vi.fn() } } }));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    rSVP: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    auditEvent: { create: vi.fn() },
    event: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/agent/registry', () => ({ registerTool: vi.fn() }));

import {
  ensureOpenAdmission,
  recordCompAdmission,
  recordPaidAdmission,
} from '@/lib/commerce/orders';
import { cancelRsvp } from '@/lib/waitlist';
import promoteRsvp from '@/lib/agent/tools/rsvps/promote';

const MEMBER = { id: 'm1', email: 'guest@x.com', firstName: 'G', lastName: 'T', personId: 'p1' };

function emittedTypes(): string[] {
  return logEngagement.mock.calls.map((c) => c[0].eventType);
}

beforeEach(() => {
  logEngagement.mockReset();
  dbMock.rSVP.findFirst.mockReset();
  dbMock.rSVP.updateMany.mockReset();
  dbMock.rSVP.update.mockReset();
  dbMock.auditEvent.create.mockReset();
  dbMock.event.findUnique.mockReset();
});

/** Injected fake for the orders.ts functions (db is a parameter there). */
function ordersDb(opts: { existingOrder?: unknown; existingRsvp?: unknown }) {
  const tx = {
    promoCode: { findFirst: vi.fn().mockResolvedValue({ maxUses: null, maxUsesPerCustomer: null }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    promoRedemption: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'pr1' }) },
    order: { create: vi.fn().mockResolvedValue({ id: 'o1' }) },
    rSVP: {
      findFirst: vi.fn().mockResolvedValue(opts.existingRsvp ?? null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'r1' }),
      update: vi.fn().mockResolvedValue({ id: 'r1' }),
    },
    ticket: { create: vi.fn().mockResolvedValue({ id: 't1' }) },
  };
  return {
    order: { findFirst: vi.fn().mockResolvedValue(opts.existingOrder ?? null) },
    ticket: { findFirst: vi.fn().mockResolvedValue({ id: 't1' }) },
    event: { findFirst: vi.fn().mockResolvedValue({ capacity: null }) },
    rSVP: {
      findFirst: vi.fn().mockResolvedValue(opts.existingRsvp ?? null),
      update: vi.fn().mockResolvedValue({ id: 'r1' }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
}

describe('recordPaidAdmission - ticket_purchased + rsvp_confirmed', () => {
  it('emits both facts exactly once on a fresh paid admission', async () => {
    await recordPaidAdmission(ordersDb({}), {
      workspaceId: 'w1',
      eventId: 'ev1',
      member: MEMBER,
      paymentIntentId: 'pi_1',
      subtotalCents: 2600,
      amountReceivedCents: 2600,
      currency: 'usd',
      gateSessionId: 's1',
    });
    expect(emittedTypes().sort()).toEqual(['rsvp_confirmed', 'ticket_purchased']);
    const purchased = logEngagement.mock.calls.find((c) => c[0].eventType === 'ticket_purchased')![0];
    expect(purchased).toMatchObject({
      workspaceId: 'w1',
      memberId: 'm1',
      personId: 'p1',
      eventId: 'ev1',
    });
    expect(purchased.metadata).toMatchObject({ paymentIntentId: 'pi_1', amountCents: 2600 });
  });

  it('emits NOTHING on the idempotent re-walk (order already recorded)', async () => {
    await recordPaidAdmission(
      ordersDb({ existingOrder: { id: 'o1', rsvps: [{ id: 'r1' }] } }),
      {
        workspaceId: 'w1',
        eventId: 'ev1',
        member: MEMBER,
        paymentIntentId: 'pi_1',
        subtotalCents: 2600,
        amountReceivedCents: 2600,
        currency: 'usd',
        gateSessionId: 's1',
      },
    );
    expect(logEngagement).not.toHaveBeenCalled();
  });
});

describe('recordCompAdmission - rsvp_confirmed only (nothing was purchased)', () => {
  it('emits rsvp_confirmed once, never ticket_purchased', async () => {
    await recordCompAdmission(ordersDb({}), {
      workspaceId: 'w1',
      eventId: 'ev1',
      member: MEMBER,
      promoCodeId: 'promo1',
      promoMaxUses: 10,
      subtotalCents: 2600,
    });
    expect(emittedTypes()).toEqual(['rsvp_confirmed']);
    expect(logEngagement.mock.calls[0][0].metadata).toMatchObject({ origin: 'gate_comp' });
  });

  it('emits nothing when the comp was already recorded', async () => {
    await recordCompAdmission(
      ordersDb({ existingOrder: { id: 'o1', rsvps: [{ id: 'r1' }] } }),
      {
        workspaceId: 'w1',
        eventId: 'ev1',
        member: MEMBER,
        promoCodeId: 'promo1',
        promoMaxUses: 10,
        subtotalCents: 2600,
      },
    );
    expect(logEngagement).not.toHaveBeenCalled();
  });
});

describe('ensureOpenAdmission - rsvp_confirmed exactly once per admission', () => {
  const ARGS = { workspaceId: 'w1', eventId: 'ev1', memberId: 'm1', personId: 'p1' };

  it('creates the seat and emits once', async () => {
    const result = await ensureOpenAdmission(ordersDb({}), ARGS);
    expect(result).toEqual({ newlyConfirmed: true, rsvpId: 'r1' });
    expect(emittedTypes()).toEqual(['rsvp_confirmed']);
    expect(logEngagement.mock.calls[0][0]).toMatchObject({ memberId: 'm1', personId: 'p1' });
  });

  it('flips a held seat to confirmed and emits once', async () => {
    const result = await ensureOpenAdmission(
      ordersDb({ existingRsvp: { id: 'r1', ticketStatus: 'held' } }),
      ARGS,
    );
    expect(result).toEqual({ newlyConfirmed: true, rsvpId: 'r1' });
    expect(emittedTypes()).toEqual(['rsvp_confirmed']);
  });

  it('an already-confirmed seat emits nothing (idempotent re-walk)', async () => {
    const result = await ensureOpenAdmission(
      ordersDb({ existingRsvp: { id: 'r1', ticketStatus: 'confirmed' } }),
      ARGS,
    );
    expect(result).toEqual({ newlyConfirmed: false, rsvpId: 'r1' });
    expect(logEngagement).not.toHaveBeenCalled();
  });
});

describe('cancelRsvp - rsvp_cancelled exactly once', () => {
  it('emits once when the flip lands', async () => {
    dbMock.rSVP.findFirst.mockResolvedValue({ id: 'r1', memberId: 'm1', eventId: 'ev1' });
    dbMock.rSVP.updateMany.mockResolvedValue({ count: 1 });
    dbMock.auditEvent.create.mockResolvedValue({ id: 'a1' });
    dbMock.event.findUnique.mockResolvedValue(null); // promoteFromWaitlist no-ops

    await cancelRsvp('r1', 'w1');
    expect(emittedTypes()).toEqual(['rsvp_cancelled']);
    expect(logEngagement.mock.calls[0][0]).toMatchObject({
      workspaceId: 'w1',
      memberId: 'm1',
      eventId: 'ev1',
    });
  });

  it('a double-cancel emits nothing (conditional flip lost)', async () => {
    dbMock.rSVP.findFirst.mockResolvedValue({ id: 'r1', memberId: 'm1', eventId: 'ev1' });
    dbMock.rSVP.updateMany.mockResolvedValue({ count: 0 });

    await cancelRsvp('r1', 'w1');
    expect(logEngagement).not.toHaveBeenCalled();
    expect(dbMock.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe('agent rsvps.promote - waitlist_promoted exactly once', () => {
  const ctx = { workspaceId: 'w1' } as Parameters<typeof promoteRsvp.handler>[1];

  it('emits once on a real promotion', async () => {
    dbMock.rSVP.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'WAITLISTED',
      ticketStatus: 'waitlisted',
      eventId: 'ev1',
      memberId: 'm1',
      member: { firstName: 'G', lastName: 'T', personId: 'p1' },
    });
    dbMock.rSVP.update.mockResolvedValue({ id: 'r1' });

    const result = await promoteRsvp.handler({ rsvpId: 'r1' }, ctx);
    expect(result).toMatchObject({ ok: true, rsvpId: 'r1' });
    expect(emittedTypes()).toEqual(['waitlist_promoted']);
    expect(logEngagement.mock.calls[0][0]).toMatchObject({
      memberId: 'm1',
      personId: 'p1',
      eventId: 'ev1',
    });
  });

  it('a non-waitlisted RSVP emits nothing', async () => {
    dbMock.rSVP.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'CONFIRMED',
      ticketStatus: 'confirmed',
      eventId: 'ev1',
      memberId: 'm1',
      member: { firstName: 'G', lastName: 'T', personId: null },
    });
    const result = await promoteRsvp.handler({ rsvpId: 'r1' }, ctx);
    expect(result).toMatchObject({ ok: false, error: 'not_waitlisted' });
    expect(logEngagement).not.toHaveBeenCalled();
  });
});
