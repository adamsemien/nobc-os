import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Capacity-counter race regression (audit: non-transactional counters).
 *
 * The capacity gate used to be count-then-create on the plain client: two
 * concurrent submits both saw `taken < capacity` and both created an RSVP,
 * overselling the room; concurrent waitlist joins computed the same
 * max(position)+1. Contract under test: the count, the waitlist insert, and
 * the RSVP create all run on ONE $transaction client, serialized by the
 * Event row lock (SELECT ... FOR UPDATE) — plus the surrounding access rules
 * (red list, approval, paid-event redirect, plus-ones).
 */

const {
  eventFindFirst,
  eventFindUnique,
  memberFindFirst,
  rsvpFindFirst,
  auditCreate,
  dbTransaction,
  txQueryRaw,
  txRsvpCount,
  txRsvpCreate,
  txWaitlistAggregate,
  txWaitlistCreate,
  getUserMock,
  getOrCreateFromClerk,
  logEngagement,
  resolveMemberMock,
  platformSettingFindUnique,
} = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  eventFindUnique: vi.fn(),
  memberFindFirst: vi.fn(),
  rsvpFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  platformSettingFindUnique: vi.fn(),
  dbTransaction: vi.fn(),
  txQueryRaw: vi.fn(),
  txRsvpCount: vi.fn(),
  txRsvpCreate: vi.fn(),
  txWaitlistAggregate: vi.fn(),
  txWaitlistCreate: vi.fn(),
  getUserMock: vi.fn(),
  getOrCreateFromClerk: vi.fn(),
  logEngagement: vi.fn(),
  resolveMemberMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    event: { findFirst: eventFindFirst, findUnique: eventFindUnique },
    member: { findFirst: memberFindFirst },
    rSVP: { findFirst: rsvpFindFirst },
    auditEvent: { create: auditCreate },
    // The confirmation-email path reads `rsvp.send_confirmation`; null falls
    // back to the default (true), then exits at the unset event.findUnique.
    platformSetting: { findUnique: platformSettingFindUnique },
    $transaction: dbTransaction,
  },
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { getUser: getUserMock } }),
}));
vi.mock('@/lib/clerk-member', () => ({
  getOrCreateMemberFromClerk: getOrCreateFromClerk,
}));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: logEngagement }));
vi.mock('@/lib/member-identity', () => ({ resolveMember: resolveMemberMock }));

import { submitMemberRsvp } from '@/lib/rsvp-submit';
import { attachEventRsvpAfterApply } from '@/lib/apply-event-rsvp';

const tx = {
  $queryRaw: txQueryRaw,
  rSVP: { count: txRsvpCount, create: txRsvpCreate },
  waitlistEntry: { aggregate: txWaitlistAggregate, create: txWaitlistCreate },
};

const baseEvent = {
  id: 'ev1',
  accessMode: 'OPEN',
  approvalRequired: false,
  capacity: null as number | null,
  priceInCents: 0,
  nonMemberPriceInCents: null,
  plusOnesAllowed: false,
};
const memberRow = {
  id: 'm1',
  approved: true,
  memberQrCode: 'qr-m1',
  firstName: 'Ana',
  lastName: 'Lee',
};

beforeEach(() => {
  for (const fn of [
    eventFindFirst, eventFindUnique, memberFindFirst, rsvpFindFirst, auditCreate,
    dbTransaction, txQueryRaw, txRsvpCount, txRsvpCreate, txWaitlistAggregate,
    txWaitlistCreate, getUserMock, getOrCreateFromClerk, logEngagement, resolveMemberMock,
    platformSettingFindUnique,
  ]) fn.mockReset();

  platformSettingFindUnique.mockResolvedValue(null);

  dbTransaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
  eventFindFirst.mockResolvedValue({ ...baseEvent });
  // member.findFirst serves two lookups: the member row (by clerkUserId) and
  // the red-list probe (by email + redListed) — answer by shape.
  memberFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.redListed ? null : memberRow,
  );
  rsvpFindFirst.mockResolvedValue(null);
  auditCreate.mockResolvedValue({ id: 'a1' });
  txQueryRaw.mockResolvedValue([]);
  txRsvpCount.mockResolvedValue(0);
  txRsvpCreate.mockResolvedValue({ id: 'r-new', ticketStatus: 'confirmed' });
  txWaitlistAggregate.mockResolvedValue({ _max: { position: null } });
  txWaitlistCreate.mockResolvedValue({ id: 'wl-new' });
  getUserMock.mockResolvedValue({ emailAddresses: [{ emailAddress: 'ana@example.com' }] });
  // Keep the confirmation-email branch off.
  vi.stubEnv('RESEND_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const submit = (body: Parameters<typeof submitMemberRsvp>[2] = { eventId: 'ev1' }) =>
  submitMemberRsvp('ws1', 'user_1', body);

describe('submitMemberRsvp — atomic capacity gate', () => {
  it('full event: joins the waitlist atomically instead of creating an RSVP', async () => {
    eventFindFirst.mockResolvedValue({ ...baseEvent, capacity: 2 });
    txRsvpCount.mockResolvedValue(2);
    txWaitlistAggregate.mockResolvedValue({ _max: { position: 4 } });

    const result = await submit();

    expect(result).toEqual({ ok: true, waitlisted: true, position: 5 });

    // Lock first, then count, then insert — all on the SAME transaction client.
    expect(dbTransaction).toHaveBeenCalledOnce();
    expect(txQueryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(txQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      txRsvpCount.mock.invocationCallOrder[0],
    );

    // Only confirmed + held seats consume capacity, workspace-scoped.
    expect(txRsvpCount).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1', eventId: 'ev1', ticketStatus: { in: ['confirmed', 'held'] } },
    });

    expect(txWaitlistCreate).toHaveBeenCalledOnce();
    expect(txWaitlistCreate.mock.calls[0][0].data).toMatchObject({
      workspaceId: 'ws1',
      eventId: 'ev1',
      memberId: 'm1',
      email: 'ana@example.com',
      name: 'Ana Lee',
      position: 5,
    });
    expect(txRsvpCreate).not.toHaveBeenCalled();
    expect(logEngagement).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'waitlist_joined' }),
    );
  });

  it('seat available: creates the RSVP inside the same transaction', async () => {
    eventFindFirst.mockResolvedValue({ ...baseEvent, capacity: 2 });
    txRsvpCount.mockResolvedValue(1);

    const result = await submit();

    expect(result).toMatchObject({ ok: true, rsvpId: 'r-new', ticketStatus: 'confirmed' });
    expect(txRsvpCreate).toHaveBeenCalledOnce();
    expect(txRsvpCreate.mock.calls[0][0].data).toMatchObject({
      workspaceId: 'ws1',
      eventId: 'ev1',
      memberId: 'm1',
      status: 'CONFIRMED',
      ticketStatus: 'confirmed',
    });
    expect(txWaitlistCreate).not.toHaveBeenCalled();
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({ action: 'rsvp.created' });
  });

  it('uncapped event: skips the lock + count and creates directly', async () => {
    const result = await submit();

    expect(result).toMatchObject({ ok: true, rsvpId: 'r-new' });
    expect(txQueryRaw).not.toHaveBeenCalled();
    expect(txRsvpCount).not.toHaveBeenCalled();
    expect(txRsvpCreate).toHaveBeenCalledOnce();
  });

  it('approval-required event: pending_approval + WAITLISTED', async () => {
    eventFindFirst.mockResolvedValue({ ...baseEvent, approvalRequired: true });
    txRsvpCreate.mockResolvedValue({ id: 'r-pend', ticketStatus: 'pending_approval' });

    const result = await submit();

    expect(result).toMatchObject({ ok: true, ticketStatus: 'pending_approval' });
    expect(txRsvpCreate.mock.calls[0][0].data).toMatchObject({
      status: 'WAITLISTED',
      ticketStatus: 'pending_approval',
    });
  });

  it('plus-one is persisted (trimmed) only when the event allows it', async () => {
    eventFindFirst.mockResolvedValue({ ...baseEvent, plusOnesAllowed: true });
    await submit({ eventId: 'ev1', plusOne: { name: '  Jo Park ', instagram: ' @jo ' } });
    expect(txRsvpCreate.mock.calls[0][0].data).toMatchObject({
      plusOneName: 'Jo Park',
      plusOneInstagram: '@jo',
    });

    txRsvpCreate.mockClear();
    eventFindFirst.mockResolvedValue({ ...baseEvent, plusOnesAllowed: false });
    await submit({ eventId: 'ev1', plusOne: { name: 'Jo Park', instagram: '@jo' } });
    expect(txRsvpCreate.mock.calls[0][0].data).toMatchObject({
      plusOneName: null,
      plusOneInstagram: null,
    });
  });

  it('paid ticketed event redirects to the checkout flow (no RSVP minted)', async () => {
    eventFindFirst.mockResolvedValue({ ...baseEvent, accessMode: 'TICKETED', priceInCents: 5000 });

    const result = await submit();

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it('red-listed email gets the silent fake success, audited, no writes', async () => {
    memberFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.redListed ? { id: 'm-red' } : memberRow,
    );

    const result = await submit();

    expect(result).toMatchObject({ ok: true, rsvpId: 'blocked' });
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({ action: 'rsvp.red_list_blocked' });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it('already confirmed: 409, nothing created', async () => {
    rsvpFindFirst.mockResolvedValue({ id: 'r-old', ticketStatus: 'confirmed' });

    const result = await submit();

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it('unknown event: 404', async () => {
    eventFindFirst.mockResolvedValue(null);
    expect(await submit()).toMatchObject({ ok: false, status: 404 });
  });
});

describe('attachEventRsvpAfterApply — atomic held-seat gate', () => {
  const applyParams = {
    workspaceId: 'ws1',
    clerkUserId: 'user_1',
    eventId: 'ev1',
    email: 'ana@example.com',
    fullName: 'Ana Lee',
    actorIdForAudit: 'user_1',
  };

  beforeEach(() => {
    eventFindFirst.mockResolvedValue({ id: 'ev1', approvalRequired: true, capacity: 10 });
    resolveMemberMock.mockResolvedValue({ id: 'm9' });
    txRsvpCreate.mockResolvedValue({ id: 'r-held', ticketStatus: 'held' });
  });

  it('holds a seat transactionally for an approval event', async () => {
    txRsvpCount.mockResolvedValue(3);

    await attachEventRsvpAfterApply(applyParams);

    expect(dbTransaction).toHaveBeenCalledOnce();
    expect(txQueryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(txRsvpCount).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1', eventId: 'ev1', ticketStatus: { in: ['confirmed', 'held'] } },
    });
    expect(txRsvpCreate.mock.calls[0][0].data).toMatchObject({
      memberId: 'm9',
      status: 'WAITLISTED',
      ticketStatus: 'held',
    });
    expect(auditCreate.mock.calls[0][0].data.metadata).toMatchObject({
      origin: 'apply_approval_holds_ticket',
    });
  });

  it('full event: returns silently without creating', async () => {
    txRsvpCount.mockResolvedValue(10);

    await attachEventRsvpAfterApply(applyParams);

    expect(txRsvpCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('existing RSVP: no-op', async () => {
    rsvpFindFirst.mockResolvedValue({ id: 'r-old' });

    await attachEventRsvpAfterApply(applyParams);

    expect(dbTransaction).not.toHaveBeenCalled();
  });
});
