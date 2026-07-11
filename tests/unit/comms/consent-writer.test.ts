import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// THE consent writer (consent reconciliation, Phase 1). Pins:
//  1. The locked conflict rule as a pure decision table — most protective
//     explicit signal wins; recency breaks ties only within a tier; a missing
//     timestamp never wins; explicit mode is a fresh first-party signal that
//     stands (an operator may lawfully re-subscribe after an unsubscribe).
//  2. writeConsent's write set: person-keyed canonical row + member-keyed
//     mirror row(s) + Member marketing booleans converge in ONE transaction;
//     a member with no Person gets member-keyed rows only; PENDING (absence
//     of signal) never sets or clears a boolean.

const m = vi.hoisted(() => ({ logEngagementEvent: vi.fn() }));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: m.logEngagementEvent }));

import {
  mostProtective,
  resolveConsentConflict,
  writeConsent,
  type ConsentState,
} from '@/lib/comms/consent-writer';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-06-01T00:00:00Z');
const T2 = new Date('2026-07-01T00:00:00Z');

const state = (status: ConsentState['status'], at: Date | null): ConsentState => ({
  status,
  at,
  basis: 'EXPRESS_OPTIN',
  source: 'test',
});

describe('resolveConsentConflict — the locked decision table (merge mode)', () => {
  // [existing, incoming, winner]
  const MERGE_TABLE: [ConsentState | null, ConsentState, 'incoming' | 'existing'][] = [
    // No existing state: any signal lands (including PENDING seeds).
    [null, state('PENDING', null), 'incoming'],
    [null, state('SUBSCRIBED', T1), 'incoming'],
    [null, state('UNSUBSCRIBED', T1), 'incoming'],
    // Tier: explicit UNSUBSCRIBED (2) > explicit opt-in (1) > no signal (0).
    [state('UNSUBSCRIBED', T0), state('SUBSCRIBED', T2), 'existing'], // negative outranks newer positive
    [state('UNSUBSCRIBED', null), state('SUBSCRIBED', T2), 'existing'], // ...even timestampless (negative wins)
    [state('SUBSCRIBED', T0), state('UNSUBSCRIBED', T2), 'incoming'], // unsubscribe always lands over opt-in
    [state('SUBSCRIBED', T2), state('UNSUBSCRIBED', null), 'incoming'], // ...timestampless too (higher tier)
    [state('SUBSCRIBED', T0), state('PENDING', null), 'existing'], // no-signal never downgrades opt-in
    [state('UNSUBSCRIBED', T0), state('PENDING', null), 'existing'], // ...nor an unsubscribe
    [state('PENDING', null), state('SUBSCRIBED', T1), 'incoming'], // opt-in elevates a seed
    [state('NEVER_SUBSCRIBED', null), state('SUBSCRIBED', T1), 'incoming'],
    // CLEANED sits in the negative tier: as protective as an unsubscribe.
    [state('CLEANED', null), state('SUBSCRIBED', T2), 'existing'],
    // Same tier: recency breaks the tie.
    [state('SUBSCRIBED', T0), state('SUBSCRIBED', T1), 'incoming'],
    [state('SUBSCRIBED', T1), state('SUBSCRIBED', T0), 'existing'],
    [state('UNSUBSCRIBED', T0), state('UNSUBSCRIBED', T1), 'incoming'],
    // Same tier, missing timestamps: the incoming signal never wins the tie
    // (ambiguity never resolves to a state flip).
    [state('SUBSCRIBED', T1), state('SUBSCRIBED', null), 'existing'],
    [state('SUBSCRIBED', null), state('SUBSCRIBED', null), 'existing'],
    [state('SUBSCRIBED', null), state('SUBSCRIBED', T1), 'incoming'], // dated beats undated
    [state('PENDING', null), state('PENDING', null), 'existing'],
  ];

  it.each(MERGE_TABLE.map((row, i) => [i, ...row] as const))(
    'row %#: existing=%j incoming=%j -> %s',
    (_i, existing, incoming, winner) => {
      expect(resolveConsentConflict(existing, incoming, 'merge')).toBe(winner);
    },
  );

  it('explicit mode: a fresh first-party signal always stands (re-subscribe after unsubscribe)', () => {
    expect(resolveConsentConflict(state('UNSUBSCRIBED', T1), state('SUBSCRIBED', T2), 'explicit')).toBe('incoming');
    expect(resolveConsentConflict(state('SUBSCRIBED', T1), state('UNSUBSCRIBED', T2), 'explicit')).toBe('incoming');
    expect(resolveConsentConflict(state('CLEANED', T1), state('SUBSCRIBED', T2), 'explicit')).toBe('incoming');
  });
});

describe('mostProtective — effective state across keyings', () => {
  it('picks the negative over any positive regardless of order or recency', () => {
    expect(mostProtective([state('SUBSCRIBED', T2), state('UNSUBSCRIBED', T0)])?.status).toBe('UNSUBSCRIBED');
    expect(mostProtective([state('UNSUBSCRIBED', T0), state('SUBSCRIBED', T2)])?.status).toBe('UNSUBSCRIBED');
  });
  it('within a tier, the newest wins', () => {
    expect(mostProtective([state('SUBSCRIBED', T0), state('SUBSCRIBED', T1)])?.at).toEqual(T1);
  });
  it('empty input has no state', () => {
    expect(mostProtective([])).toBeNull();
  });
});

// ── writeConsent write-set behavior on a mocked Prisma client ────────────────

type Row = {
  id: string;
  memberId?: string | null;
  personId?: string | null;
  status: string;
  consentAt: Date | null;
  consentBasis: string;
  consentSource: string | null;
};

function makeDb(opts: {
  member?: { id: string; personId: string | null } | null;
  clusterMembers?: { id: string }[];
  personExists?: boolean;
  personRow?: Row | null;
  memberRows?: Row[];
}) {
  const db = {
    person: {
      findFirst: vi.fn(async () => (opts.personExists ? { id: 'p1' } : null)),
    },
    member: {
      findFirst: vi.fn(async () => opts.member ?? null),
      findMany: vi.fn(async () => opts.clusterMembers ?? []),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    channelSubscription: {
      findFirst: vi.fn(async () => opts.personRow ?? null),
      findMany: vi.fn(async () => opts.memberRows ?? []),
      create: vi.fn(async (args: unknown) => args),
      update: vi.fn(async (args: unknown) => args),
    },
    $transaction: vi.fn(async (writes: unknown[]) => writes),
  };
  return db as unknown as PrismaClient & typeof db;
}

beforeEach(() => {
  m.logEngagementEvent.mockReset();
});

describe('writeConsent', () => {
  it('member with NO person: member-keyed row + boolean mirror only, one transaction', async () => {
    const db = makeDb({ member: { id: 'm1', personId: null }, memberRows: [] });
    const res = await writeConsent(
      {
        workspaceId: 'w1',
        memberId: 'm1',
        signal: { channel: 'EMAIL', status: 'SUBSCRIBED', basis: 'EXPRESS_OPTIN', source: 'checkout', at: T1 },
        mode: 'explicit',
        context: 'checkout',
      },
      db,
    );
    expect(res).toEqual({ changed: true, status: 'SUBSCRIBED' });
    // No person-keyed write attempted.
    expect(db.channelSubscription.create).toHaveBeenCalledTimes(1);
    const createArg = db.channelSubscription.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArg.data).toMatchObject({
      workspaceId: 'w1',
      memberId: 'm1',
      personId: null,
      channel: 'EMAIL',
      status: 'SUBSCRIBED',
    });
    // Boolean mirror set + stamped.
    expect(db.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['m1'] }, workspaceId: 'w1' },
        data: { marketingEmailOptIn: true, marketingEmailOptInAt: T1 },
      }),
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(m.logEngagementEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'channel_subscribed' }),
    );
  });

  it('member WITH a person: person-keyed canonical + member mirror + booleans converge together', async () => {
    const db = makeDb({
      member: { id: 'm1', personId: 'p1' },
      clusterMembers: [{ id: 'm1' }],
      personRow: null,
      memberRows: [
        { id: 'cs1', memberId: 'm1', personId: null, status: 'PENDING', consentAt: null, consentBasis: 'UNKNOWN', consentSource: null },
      ],
    });
    await writeConsent(
      {
        workspaceId: 'w1',
        memberId: 'm1',
        signal: { channel: 'SMS', status: 'SUBSCRIBED', basis: 'EXPRESS_OPTIN', source: 'application', at: T1 },
        mode: 'merge',
        context: 'application_approval',
      },
      db,
    );
    // Person-keyed canonical created with memberId NULL.
    expect(db.channelSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personId: 'p1', memberId: null, channel: 'SMS', status: 'SUBSCRIBED' }),
      }),
    );
    // Member mirror elevated + person pointer filled.
    expect(db.channelSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cs1' },
        data: expect.objectContaining({ status: 'SUBSCRIBED', personId: 'p1' }),
      }),
    );
    expect(db.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { marketingSmsOptIn: true, marketingSmsOptInAt: T1 } }),
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('merge PENDING never downgrades an existing SUBSCRIBED state or clears a boolean', async () => {
    const db = makeDb({
      member: { id: 'm1', personId: null },
      memberRows: [
        { id: 'cs1', memberId: 'm1', personId: null, status: 'SUBSCRIBED', consentAt: T1, consentBasis: 'EXPRESS_OPTIN', consentSource: 'application' },
      ],
    });
    const res = await writeConsent(
      {
        workspaceId: 'w1',
        memberId: 'm1',
        signal: { channel: 'EMAIL', status: 'PENDING', basis: 'UNKNOWN', source: null, at: null },
        mode: 'merge',
        context: 'member_create',
      },
      db,
    );
    expect(res.status).toBe('SUBSCRIBED');
    expect(res.changed).toBe(false);
    expect(db.channelSubscription.create).not.toHaveBeenCalled();
    expect(db.channelSubscription.update).not.toHaveBeenCalled();
    expect(m.logEngagementEvent).not.toHaveBeenCalled();
  });

  it('merge SUBSCRIBED never overrides an explicit UNSUBSCRIBED (most protective wins)', async () => {
    const db = makeDb({
      member: { id: 'm1', personId: null },
      memberRows: [
        { id: 'cs1', memberId: 'm1', personId: null, status: 'UNSUBSCRIBED', consentAt: T0, consentBasis: 'OPERATOR_ADDED', consentSource: 'operator_manual' },
      ],
    });
    const res = await writeConsent(
      {
        workspaceId: 'w1',
        memberId: 'm1',
        signal: { channel: 'EMAIL', status: 'SUBSCRIBED', basis: 'EXPRESS_OPTIN', source: 'application', at: T2 },
        mode: 'merge',
        context: 'application_approval',
      },
      db,
    );
    expect(res.status).toBe('UNSUBSCRIBED');
    expect(m.logEngagementEvent).not.toHaveBeenCalled();
    // Boolean mirror converges to the protective state (false), never true.
    const boolWrite = (db.member.updateMany.mock.calls as unknown[][]).at(-1)?.[0] as
      | { data: Record<string, unknown> }
      | undefined;
    expect(boolWrite?.data).toMatchObject({ marketingEmailOptIn: false });
  });

  it('explicit UNSUBSCRIBED converges every keying off and emits channel_unsubscribed', async () => {
    const db = makeDb({
      personExists: true,
      clusterMembers: [{ id: 'm1' }, { id: 'm2' }],
      personRow: { id: 'csP', memberId: null, personId: 'p1', status: 'SUBSCRIBED', consentAt: T0, consentBasis: 'EXPRESS_OPTIN', consentSource: 'application' },
      memberRows: [
        { id: 'cs1', memberId: 'm1', personId: 'p1', status: 'SUBSCRIBED', consentAt: T0, consentBasis: 'EXPRESS_OPTIN', consentSource: 'application' },
      ],
    });
    const res = await writeConsent(
      {
        workspaceId: 'w1',
        personId: 'p1',
        signal: { channel: 'EMAIL', status: 'UNSUBSCRIBED', basis: 'OPERATOR_ADDED', source: 'operator_manual', at: T2 },
        mode: 'explicit',
        context: 'operator_manual',
      },
      db,
    );
    expect(res).toEqual({ changed: true, status: 'UNSUBSCRIBED' });
    // Canonical person row + m1 mirror updated; m2 mirror created; booleans off.
    expect(db.channelSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'csP' }, data: expect.objectContaining({ status: 'UNSUBSCRIBED' }) }),
    );
    expect(db.channelSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cs1' }, data: expect.objectContaining({ status: 'UNSUBSCRIBED' }) }),
    );
    expect(db.channelSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ memberId: 'm2', status: 'UNSUBSCRIBED' }) }),
    );
    expect(db.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['m1', 'm2'] }, workspaceId: 'w1' },
        data: { marketingEmailOptIn: false },
      }),
    );
    expect(m.logEngagementEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'channel_unsubscribed' }),
    );
  });

  it('PENDING seed on a fresh member creates the row but never touches booleans', async () => {
    const db = makeDb({ member: { id: 'm1', personId: null }, memberRows: [] });
    const res = await writeConsent(
      {
        workspaceId: 'w1',
        memberId: 'm1',
        signal: { channel: 'EMAIL', status: 'PENDING', basis: 'UNKNOWN', source: null, at: null },
        mode: 'merge',
        context: 'guest_create',
      },
      db,
    );
    expect(res.status).toBe('PENDING');
    expect(db.channelSubscription.create).toHaveBeenCalledTimes(1);
    expect(db.member.updateMany).not.toHaveBeenCalled();
    expect(m.logEngagementEvent).not.toHaveBeenCalled();
  });

  it('refuses a write with neither memberId nor personId', async () => {
    const db = makeDb({});
    await expect(
      writeConsent(
        {
          workspaceId: 'w1',
          signal: { channel: 'EMAIL', status: 'PENDING', basis: 'UNKNOWN', source: null, at: null },
          mode: 'merge',
          context: 'backfill',
        },
        db,
      ),
    ).rejects.toThrow('memberId or personId required');
  });
});
