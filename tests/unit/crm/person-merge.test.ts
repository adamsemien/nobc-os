import { describe, it, expect, vi, beforeEach } from 'vitest';

// Person merge engine (Phase 2B Campaign 1) — unit suite over a mocked Prisma
// client. No live database is touched (repo law: Adam runs all SQL; tests must
// run offline).

const mocks = vi.hoisted(() => {
  const tx = {
    contactSource: { findMany: vi.fn(), update: vi.fn() },
    personOrganization: { findMany: vi.fn(), update: vi.fn() },
    memberEngagementEvent: { updateMany: vi.fn() },
    channelSubscription: { updateMany: vi.fn() },
    suppressionEntry: { updateMany: vi.fn() },
    application: { updateMany: vi.fn() },
    member: { updateMany: vi.fn() },
    rSVP: { updateMany: vi.fn() },
    person: { update: vi.fn(), updateMany: vi.fn() },
  };
  return {
    tx,
    personFindFirst: vi.fn(),
    personFindMany: vi.fn(),
    auditEventCreate: vi.fn(),
    auditEventFindMany: vi.fn(),
    transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    logEngagementEvent: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    person: { findFirst: mocks.personFindFirst, findMany: mocks.personFindMany },
    auditEvent: { create: mocks.auditEventCreate, findMany: mocks.auditEventFindMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/engagement', () => ({ logEngagementEvent: mocks.logEngagementEvent }));

import {
  executePersonMerge,
  findDuplicatePairs,
  pickSurvivorDefault,
  pairKey,
} from '@/lib/crm/person-merge';

function person(over: Record<string, unknown> = {}) {
  return {
    id: 'p_a',
    workspaceId: 'w1',
    clerkUserId: null,
    email: null,
    emailVerified: false,
    phone: null,
    firstName: null,
    lastName: null,
    roles: [] as string[],
    potentialDuplicateOfId: null,
    mergedIntoId: null,
    mergedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    members: [] as Array<{ id: string }>,
    ...over,
  };
}

beforeEach(() => {
  mocks.personFindFirst.mockReset();
  mocks.personFindMany.mockReset();
  mocks.auditEventCreate.mockReset();
  mocks.auditEventFindMany.mockReset();
  mocks.logEngagementEvent.mockReset();
  mocks.auditEventCreate.mockResolvedValue({});
  mocks.auditEventFindMany.mockResolvedValue([]);
  mocks.personFindMany.mockResolvedValue([]);
  for (const model of Object.values(mocks.tx)) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  // Transaction defaults: empty child sets, zero-count bulk updates.
  mocks.tx.contactSource.findMany.mockResolvedValue([]);
  mocks.tx.personOrganization.findMany.mockResolvedValue([]);
  for (const m of [
    mocks.tx.memberEngagementEvent,
    mocks.tx.channelSubscription,
    mocks.tx.suppressionEntry,
    mocks.tx.application,
    mocks.tx.member,
    mocks.tx.rSVP,
  ]) {
    m.updateMany.mockResolvedValue({ count: 0 });
  }
  mocks.tx.person.update.mockResolvedValue({});
  mocks.tx.person.updateMany.mockResolvedValue({ count: 0 });
});

describe('pickSurvivorDefault', () => {
  it('verified email beats unverified', () => {
    const a = person({ id: 'a', emailVerified: false, clerkUserId: 'user_1' });
    const b = person({ id: 'b', emailVerified: true, createdAt: new Date('2026-06-01') });
    expect(pickSurvivorDefault(a, b).id).toBe('b');
  });

  it('real clerk account beats none when verification ties', () => {
    const a = person({ id: 'a', createdAt: new Date('2025-01-01') });
    const b = person({ id: 'b', clerkUserId: 'user_1', createdAt: new Date('2026-06-01') });
    expect(pickSurvivorDefault(a, b).id).toBe('b');
  });

  it('older createdAt breaks full ties', () => {
    const a = person({ id: 'a', createdAt: new Date('2026-02-01') });
    const b = person({ id: 'b', createdAt: new Date('2026-01-01') });
    expect(pickSurvivorDefault(a, b).id).toBe('b');
  });
});

describe('executePersonMerge guards', () => {
  it('refuses to merge a person into itself', async () => {
    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_a',
      loserId: 'p_a',
      actorId: 'op',
    });
    expect(res).toEqual({ ok: false, error: 'same_person' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('refuses when either side is missing from the workspace', async () => {
    mocks.personFindFirst.mockResolvedValueOnce(person()).mockResolvedValueOnce(null);
    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_a',
      loserId: 'p_b',
      actorId: 'op',
    });
    expect(res).toEqual({ ok: false, error: 'not_found' });
  });

  it('refuses an already-merged participant', async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(person({ id: 'p_a' }))
      .mockResolvedValueOnce(person({ id: 'p_b', mergedIntoId: 'p_z' }));
    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_a',
      loserId: 'p_b',
      actorId: 'op',
    });
    expect(res).toEqual({ ok: false, error: 'already_merged' });
  });

  it('HALTs when both persons have a linked Member', async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(person({ id: 'p_a', members: [{ id: 'm1' }] }))
      .mockResolvedValueOnce(person({ id: 'p_b', members: [{ id: 'm2' }] }));
    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_a',
      loserId: 'p_b',
      actorId: 'op',
    });
    expect(res).toEqual({ ok: false, error: 'both_have_members' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('HARD REFUSES two different real clerk accounts (D1)', async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(person({ id: 'p_a', clerkUserId: 'user_1' }))
      .mockResolvedValueOnce(person({ id: 'p_b', clerkUserId: 'user_2' }));
    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_a',
      loserId: 'p_b',
      actorId: 'op',
    });
    expect(res).toEqual({ ok: false, error: 'two_linked_accounts' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('executePersonMerge transaction', () => {
  it('re-points children, keeps collision rows on the loser, tombstones, audits', async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(
        person({ id: 'p_surv', email: 'a@x.com', emailVerified: true, roles: ['member'] }),
      )
      .mockResolvedValueOnce(
        person({
          id: 'p_loser',
          email: 'a@x.com',
          phone: '+15551234567',
          firstName: 'Ada',
          roles: ['subscriber'],
          createdAt: new Date('2026-03-01'),
        }),
      );
    // Survivor already has 'application'; loser has 'application' (collision,
    // stays) + 'clerk' (moves).
    mocks.tx.contactSource.findMany
      .mockResolvedValueOnce([{ source: 'application' }])
      .mockResolvedValueOnce([
        { id: 'cs1', source: 'application' },
        { id: 'cs2', source: 'clerk' },
      ]);
    mocks.tx.personOrganization.findMany
      .mockResolvedValueOnce([{ organizationId: 'org1' }])
      .mockResolvedValueOnce([
        { id: 'po1', organizationId: 'org1' },
        { id: 'po2', organizationId: 'org2' },
      ]);
    mocks.tx.memberEngagementEvent.updateMany.mockResolvedValue({ count: 3 });

    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_surv',
      loserId: 'p_loser',
      actorId: 'op',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repointed.contactSourcesMoved).toBe(1);
    expect(res.repointed.contactSourcesKept).toBe(1);
    expect(res.repointed.affiliationsMoved).toBe(1);
    expect(res.repointed.affiliationsKept).toBe(1);
    expect(res.repointed.engagementEvents).toBe(3);

    // Only the non-colliding rows moved.
    expect(mocks.tx.contactSource.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.contactSource.update).toHaveBeenCalledWith({
      where: { id: 'cs2' },
      data: { personId: 'p_surv' },
    });
    expect(mocks.tx.personOrganization.update).toHaveBeenCalledWith({
      where: { id: 'po2' },
      data: { personId: 'p_surv' },
    });

    // Bulk re-points are workspace-scoped and touch personId only.
    for (const m of [
      mocks.tx.channelSubscription,
      mocks.tx.suppressionEntry,
      mocks.tx.application,
      mocks.tx.member,
      mocks.tx.rSVP,
    ]) {
      expect(m.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'w1', personId: 'p_loser' },
        data: { personId: 'p_surv' },
      });
    }

    // Other duplicate flags re-point to the survivor.
    expect(mocks.tx.person.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w1',
        potentialDuplicateOfId: 'p_loser',
        id: { notIn: ['p_surv', 'p_loser'] },
      },
      data: { potentialDuplicateOfId: 'p_surv' },
    });

    // Enrich-fill: phone + firstName null-filled, roles unioned.
    const survivorUpdate = mocks.tx.person.update.mock.calls.find(
      (c) => c[0].where.id === 'p_surv',
    );
    expect(survivorUpdate?.[0].data).toMatchObject({
      phone: '+15551234567',
      firstName: 'Ada',
      roles: ['member', 'subscriber'],
    });

    // Tombstone with mergedAt.
    const tombstone = mocks.tx.person.update.mock.calls.find(
      (c) => c[0].where.id === 'p_loser' && c[0].data.mergedIntoId,
    );
    expect(tombstone?.[0].data.mergedIntoId).toBe('p_surv');
    expect(tombstone?.[0].data.mergedAt).toBeInstanceOf(Date);
    expect(tombstone?.[0].data.potentialDuplicateOfId).toBeNull();

    // Audit after commit + merged engagement signal on the survivor.
    expect(mocks.auditEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'w1',
        action: 'person.merged',
        entityType: 'PERSON',
        entityId: 'p_loser',
        metadata: expect.objectContaining({ survivorId: 'p_surv' }),
      }),
    });
    expect(mocks.logEngagementEvent).toHaveBeenCalledWith(
      expect.objectContaining({ personId: 'p_surv', eventType: 'merged' }),
    );
  });

  it('transfers the loser clerkUserId by freeing its unique slot first', async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(person({ id: 'p_surv' }))
      .mockResolvedValueOnce(person({ id: 'p_loser', clerkUserId: 'user_real' }));

    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_surv',
      loserId: 'p_loser',
      actorId: 'op',
    });
    expect(res.ok).toBe(true);

    const calls = mocks.tx.person.update.mock.calls;
    const freeIdx = calls.findIndex(
      (c) => c[0].where.id === 'p_loser' && c[0].data.clerkUserId === null,
    );
    const claimIdx = calls.findIndex(
      (c) => c[0].where.id === 'p_surv' && c[0].data.clerkUserId === 'user_real',
    );
    expect(freeIdx).toBeGreaterThanOrEqual(0);
    expect(claimIdx).toBeGreaterThan(freeIdx);
  });

  it('upgrades emailVerified when the loser proved the same address', async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(
        person({ id: 'p_surv', email: 'Same@X.com', emailVerified: false }),
      )
      .mockResolvedValueOnce(person({ id: 'p_loser', email: 'same@x.com', emailVerified: true }));

    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_surv',
      loserId: 'p_loser',
      actorId: 'op',
    });
    expect(res.ok).toBe(true);
    const survivorUpdate = mocks.tx.person.update.mock.calls.find(
      (c) => c[0].where.id === 'p_surv',
    );
    expect(survivorUpdate?.[0].data.emailVerified).toBe(true);
  });

  it('clears the survivor flag when it pointed at the loser', async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(person({ id: 'p_surv', potentialDuplicateOfId: 'p_loser' }))
      .mockResolvedValueOnce(person({ id: 'p_loser' }));

    const res = await executePersonMerge({
      workspaceId: 'w1',
      survivorId: 'p_surv',
      loserId: 'p_loser',
      actorId: 'op',
    });
    expect(res.ok).toBe(true);
    const survivorUpdate = mocks.tx.person.update.mock.calls.find(
      (c) => c[0].where.id === 'p_surv',
    );
    expect(survivorUpdate?.[0].data.potentialDuplicateOfId).toBeNull();
  });
});

describe('findDuplicatePairs', () => {
  it('combines flags with read-time email/phone detection, deduped', async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      // flagged pair (also same email — must not double-report)
      { id: 'p1', email: 'dup@x.com', phone: null, potentialDuplicateOfId: 'p2' },
      { id: 'p2', email: 'dup@x.com', phone: null, potentialDuplicateOfId: null },
      // read-time email match, case-insensitive
      { id: 'p3', email: 'Case@X.com', phone: null, potentialDuplicateOfId: null },
      { id: 'p4', email: 'case@x.com', phone: null, potentialDuplicateOfId: null },
      // read-time phone match
      { id: 'p5', email: null, phone: '+15550001111', potentialDuplicateOfId: null },
      { id: 'p6', email: null, phone: '+15550001111', potentialDuplicateOfId: null },
    ]);

    const pairs = await findDuplicatePairs('w1');
    expect(pairs).toHaveLength(3);
    expect(pairs.map((p) => p.matchType).sort()).toEqual(['email', 'flagged', 'phone']);
  });

  it('excludes dismissed pairs whatever the match type', async () => {
    mocks.auditEventFindMany.mockResolvedValueOnce([
      { metadata: { personAId: 'p1', personBId: 'p2', matchType: 'flagged' } },
    ]);
    mocks.personFindMany.mockResolvedValueOnce([
      { id: 'p1', email: 'dup@x.com', phone: null, potentialDuplicateOfId: null },
      { id: 'p2', email: 'dup@x.com', phone: null, potentialDuplicateOfId: null },
    ]);
    const pairs = await findDuplicatePairs('w1');
    expect(pairs).toHaveLength(0);
  });

  it('skips stale flags whose counterpart is merged or gone', async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      { id: 'p1', email: null, phone: null, potentialDuplicateOfId: 'p_gone' },
    ]);
    // Counterpart lookup outside the window: not found (merged/deleted) — the
    // beforeEach default ([]) covers the second findMany call.
    const pairs = await findDuplicatePairs('w1');
    expect(pairs).toHaveLength(0);
  });
});

describe('pairKey', () => {
  it('is order-insensitive', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});
