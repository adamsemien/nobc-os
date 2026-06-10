import { describe, it, expect } from 'vitest';
import {
  clearsGravityBar,
  classifyGravityMember,
  buildGravityQueues,
  GRAVITY_MIN_REVENUE_CENTS,
  type GravityMemberInput,
} from '@/lib/gravity-ledger';
import type { MemberConnections } from '@/lib/member-connections';

// Pins the queue-classification rules the Gravity Ledger demo depends on: the gravity
// bar (≥1 stuck edge OR ≥$500 driven), the 120-day active/lapsed boundary, the 90-day
// re-comp guard, and first-match queue order. If these drift, the demo comps the wrong
// people — so they're locked here.

const NOW = new Date('2026-06-10T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function conn(over: Partial<MemberConnections>): MemberConnections {
  return {
    targetMemberId: 'm',
    coAttendees: [],
    distinctCoAttendees: 0,
    brought: [],
    referred: [],
    broughtStuckCount: 0,
    referredStuckCount: 0,
    broughtRevenueCents: 0,
    referredRevenueCents: 0,
    broughtBy: [],
    referredBy: null,
    ...over,
  };
}

function input(over: Partial<GravityMemberInput> & { connections: MemberConnections }): GravityMemberInput {
  return { ownLastCheckInAt: daysAgo(10), lastCompedAt: null, confirmedForUpcoming: false, ...over };
}

describe('clearsGravityBar', () => {
  it('passes on a single stuck edge, even with $0 driven (free programming)', () => {
    expect(clearsGravityBar(conn({ broughtStuckCount: 1 }))).toBe(true);
  });
  it('passes on $500 driven with zero stuck edges (they paid but have not stuck yet)', () => {
    expect(clearsGravityBar(conn({ broughtRevenueCents: GRAVITY_MIN_REVENUE_CENTS }))).toBe(true);
  });
  it('fails below both gates', () => {
    expect(clearsGravityBar(conn({ broughtRevenueCents: 49_900 }))).toBe(false);
  });
  it('sums brought + referred revenue toward the $500 gate', () => {
    expect(clearsGravityBar(conn({ broughtRevenueCents: 30_000, referredRevenueCents: 20_000 }))).toBe(true);
  });
});

describe('classifyGravityMember', () => {
  const cleared = conn({ broughtStuckCount: 2, broughtRevenueCents: 184_000 });

  it('returns null when the gravity bar is not cleared', () => {
    expect(classifyGravityMember(input({ connections: conn({}) }), NOW)).toBeNull();
  });

  it('EARNED A COMP: cleared + active + not recently comped', () => {
    expect(classifyGravityMember(input({ connections: cleared, ownLastCheckInAt: daysAgo(20) }), NOW)).toBe('earned_comp');
  });

  it('re-comp guard: comped 30 days ago drops out of EARNED A COMP', () => {
    const q = classifyGravityMember(input({ connections: cleared, lastCompedAt: daysAgo(30) }), NOW);
    expect(q).not.toBe('earned_comp');
    expect(q).toBe('get_in_room'); // active, recently comped, not on the list → get them in
  });

  it('re-comp guard expires: comped 100 days ago is eligible again', () => {
    expect(classifyGravityMember(input({ connections: cleared, lastCompedAt: daysAgo(100) }), NOW)).toBe('earned_comp');
  });

  it('WORTH WINNING BACK: cleared + lapsed (≥120d), even if recently comped', () => {
    expect(
      classifyGravityMember(input({ connections: cleared, ownLastCheckInAt: daysAgo(150), lastCompedAt: daysAgo(10) }), NOW),
    ).toBe('win_back');
  });

  it('GET THEM IN THE ROOM: never attended themselves but drove pull, not on the list', () => {
    expect(classifyGravityMember(input({ connections: cleared, ownLastCheckInAt: null }), NOW)).toBe('get_in_room');
  });

  it('returns null when active, recently comped, and already confirmed (nothing to do)', () => {
    expect(
      classifyGravityMember(input({ connections: cleared, lastCompedAt: daysAgo(10), confirmedForUpcoming: true }), NOW),
    ).toBeNull();
  });
});

describe('buildGravityQueues', () => {
  it('buckets each member into exactly one queue, sorted by dollars then stuck', () => {
    const big = conn({ broughtStuckCount: 3, broughtRevenueCents: 184_000 });
    const small = conn({ broughtStuckCount: 1, broughtRevenueCents: 98_000 });
    const lapsedConn = conn({ referredStuckCount: 2, referredRevenueCents: 50_000 });

    const q = buildGravityQueues(
      [
        { memberId: 'small', connections: small, ownLastCheckInAt: daysAgo(5), lastCompedAt: null, confirmedForUpcoming: false },
        { memberId: 'big', connections: big, ownLastCheckInAt: daysAgo(5), lastCompedAt: null, confirmedForUpcoming: false },
        { memberId: 'lapsed', connections: lapsedConn, ownLastCheckInAt: daysAgo(200), lastCompedAt: null, confirmedForUpcoming: false },
      ],
      NOW,
    );

    expect(q.earned_comp.map((r) => r.memberId)).toEqual(['big', 'small']); // dollars desc
    expect(q.win_back.map((r) => r.memberId)).toEqual(['lapsed']);
    expect(q.get_in_room).toHaveLength(0);
    expect(q.workspaceHasRevenue).toBe(true);
  });

  it('flags an all-free workspace so the UI can hide the $0 column', () => {
    const freePull = conn({ broughtStuckCount: 2 }); // stuck, but zero captured
    const q = buildGravityQueues(
      [{ memberId: 'host', connections: freePull, ownLastCheckInAt: daysAgo(5), lastCompedAt: null, confirmedForUpcoming: false }],
      NOW,
    );
    expect(q.workspaceHasRevenue).toBe(false);
    expect(q.earned_comp).toHaveLength(1);
  });
});
