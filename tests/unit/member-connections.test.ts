import { describe, it, expect } from 'vitest';
import {
  deriveMemberConnections,
  STUCK_MIN_EVENTS,
  type ConnectionRsvpRow,
  type ReferralEdge,
} from '@/lib/member-connections';

// The "sphere of influence" substrate. These pin the provable relationship edges —
// co-attendance, proximity, who-brought-whom, who-stuck, and gravity-in-dollars — so the
// influence read built on top can never silently change who counts as connected, who
// pulled whom in, or how much that pull was worth.

function rsvp(over: Partial<ConnectionRsvpRow>): ConnectionRsvpRow {
  return {
    memberId: 'x',
    eventId: 'e1',
    checkedIn: true,
    checkedInAt: null,
    plusOneOfMemberId: null,
    paymentStatus: null,
    amountCents: null,
    ...over,
  };
}

const at = (iso: string) => new Date(`2026-05-01T${iso}:00Z`);

describe('deriveMemberConnections — co-attendance & reach', () => {
  it('counts shared events only when BOTH checked in', () => {
    const rows = [
      rsvp({ memberId: 'billy', eventId: 'e1', checkedIn: true }),
      rsvp({ memberId: 'billy', eventId: 'e2', checkedIn: true }),
      rsvp({ memberId: 'sarah', eventId: 'e1', checkedIn: true }),
      rsvp({ memberId: 'sarah', eventId: 'e2', checkedIn: true }),
      // maya only overlaps at e1; her e2 is a no-show (not checked in)
      rsvp({ memberId: 'maya', eventId: 'e1', checkedIn: true }),
      rsvp({ memberId: 'maya', eventId: 'e2', checkedIn: false }),
    ];
    const c = deriveMemberConnections('billy', rows);
    expect(c.distinctCoAttendees).toBe(2);
    expect(c.coAttendees.find((a) => a.memberId === 'sarah')?.sharedEvents).toBe(2);
    expect(c.coAttendees.find((a) => a.memberId === 'maya')?.sharedEvents).toBe(1);
  });

  it('never counts the target as their own co-attendee', () => {
    const rows = [
      rsvp({ memberId: 'billy', eventId: 'e1' }),
      rsvp({ memberId: 'billy', eventId: 'e2' }),
    ];
    expect(deriveMemberConnections('billy', rows).distinctCoAttendees).toBe(0);
  });

  it('ranks the most-overlapping co-attendee first', () => {
    const rows = [
      rsvp({ memberId: 'billy', eventId: 'e1' }),
      rsvp({ memberId: 'billy', eventId: 'e2' }),
      rsvp({ memberId: 'billy', eventId: 'e3' }),
      rsvp({ memberId: 'sarah', eventId: 'e1' }),
      rsvp({ memberId: 'sarah', eventId: 'e2' }),
      rsvp({ memberId: 'sarah', eventId: 'e3' }),
      rsvp({ memberId: 'maya', eventId: 'e1' }),
    ];
    const c = deriveMemberConnections('billy', rows);
    expect(c.coAttendees[0].memberId).toBe('sarah');
    expect(c.coAttendees[0].sharedEvents).toBe(3);
  });
});

describe('deriveMemberConnections — proximity ("arrive together")', () => {
  it('reports the median check-in gap in minutes across shared events', () => {
    const rows = [
      rsvp({ memberId: 'billy', eventId: 'e1', checkedInAt: at('20:00') }),
      rsvp({ memberId: 'billy', eventId: 'e2', checkedInAt: at('20:05') }),
      rsvp({ memberId: 'sarah', eventId: 'e1', checkedInAt: at('20:03') }), // gap 3
      rsvp({ memberId: 'sarah', eventId: 'e2', checkedInAt: at('20:09') }), // gap 4
    ];
    const sarah = deriveMemberConnections('billy', rows).coAttendees[0];
    expect(sarah.medianCheckInGapMinutes).toBe(3.5);
  });

  it('leaves the gap null when timestamps are missing', () => {
    const rows = [
      rsvp({ memberId: 'billy', eventId: 'e1', checkedInAt: null }),
      rsvp({ memberId: 'sarah', eventId: 'e1', checkedInAt: null }),
    ];
    expect(deriveMemberConnections('billy', rows).coAttendees[0].medianCheckInGapMinutes).toBeNull();
  });

  it('first-overlap is the earliest shared event by target check-in time', () => {
    const rows = [
      rsvp({ memberId: 'billy', eventId: 'march', checkedInAt: at('19:00') }),
      rsvp({ memberId: 'billy', eventId: 'april', checkedInAt: at('21:00') }),
      rsvp({ memberId: 'sarah', eventId: 'april', checkedInAt: at('21:02') }),
      rsvp({ memberId: 'sarah', eventId: 'march', checkedInAt: at('19:05') }),
    ];
    const sarah = deriveMemberConnections('billy', rows).coAttendees[0];
    expect(sarah.firstSharedEventId).toBe('march');
    expect(sarah.firstSharedAt).toEqual(at('19:00'));
  });
});

describe('deriveMemberConnections — gravity (brought / referred / stuck)', () => {
  it('lists who the target brought, and whether they stuck', () => {
    const rows = [
      // billy brought priya (1 check-in → did not stick) and ned (2 check-ins → stuck)
      rsvp({ memberId: 'priya', eventId: 'e2', plusOneOfMemberId: 'billy', checkedIn: true }),
      rsvp({ memberId: 'ned', eventId: 'e1', plusOneOfMemberId: 'billy', checkedIn: true }),
      rsvp({ memberId: 'ned', eventId: 'e2', checkedIn: true }),
    ];
    const c = deriveMemberConnections('billy', rows);
    expect(c.brought.find((b) => b.memberId === 'priya')?.stuck).toBe(false);
    expect(c.brought.find((b) => b.memberId === 'ned')?.stuck).toBe(true);
    expect(c.broughtStuckCount).toBe(1);
    expect(STUCK_MIN_EVENTS).toBe(2);
  });

  it('dedupes a member the target brought to more than one event', () => {
    const rows = [
      rsvp({ memberId: 'priya', eventId: 'e1', plusOneOfMemberId: 'billy' }),
      rsvp({ memberId: 'priya', eventId: 'e2', plusOneOfMemberId: 'billy' }),
    ];
    expect(deriveMemberConnections('billy', rows).brought).toHaveLength(1);
  });

  it('captures who brought the target in (inbound plus-one)', () => {
    const rows = [rsvp({ memberId: 'billy', eventId: 'e1', plusOneOfMemberId: 'host' })];
    expect(deriveMemberConnections('billy', rows).broughtBy).toEqual(['host']);
  });

  it('lists who the target referred, with stick, from referral edges', () => {
    const rows = [
      rsvp({ memberId: 'sarah', eventId: 'e1', checkedIn: true }),
      rsvp({ memberId: 'sarah', eventId: 'e2', checkedIn: true }), // 2 → stuck
    ];
    const refs: ReferralEdge[] = [{ memberId: 'sarah', referredByMemberId: 'billy' }];
    const c = deriveMemberConnections('billy', rows, refs);
    expect(c.referred).toEqual([{ memberId: 'sarah', stuck: true, spendCents: 0 }]);
    expect(c.referredStuckCount).toBe(1);
  });

  it('reports who referred the target in', () => {
    const refs: ReferralEdge[] = [{ memberId: 'billy', referredByMemberId: 'founder' }];
    expect(deriveMemberConnections('billy', [], refs).referredBy).toBe('founder');
  });
});

describe('deriveMemberConnections — gravity in dollars (the actionable number)', () => {
  it("attributes a brought member's captured lifetime spend to the connector", () => {
    const rows = [
      rsvp({ memberId: 'priya', eventId: 'e1', plusOneOfMemberId: 'billy', paymentStatus: 'CAPTURED', amountCents: 5000 }),
      rsvp({ memberId: 'priya', eventId: 'e2', checkedIn: true, paymentStatus: 'CAPTURED', amountCents: 3000 }), // came back, paid again
    ];
    const c = deriveMemberConnections('billy', rows);
    expect(c.brought.find((b) => b.memberId === 'priya')?.spendCents).toBe(8000);
    expect(c.broughtRevenueCents).toBe(8000);
  });

  it('only CAPTURED counts toward gravity revenue (not authorized/refunded holds)', () => {
    const rows = [
      rsvp({ memberId: 'priya', plusOneOfMemberId: 'billy', paymentStatus: 'AUTHORIZED', amountCents: 5000 }),
      rsvp({ memberId: 'ned', plusOneOfMemberId: 'billy', paymentStatus: 'REFUNDED', amountCents: 4000 }),
    ];
    expect(deriveMemberConnections('billy', rows).broughtRevenueCents).toBe(0);
  });

  it('attributes referred-member revenue to the referrer', () => {
    const rows = [rsvp({ memberId: 'sarah', eventId: 'e1', paymentStatus: 'CAPTURED', amountCents: 9000 })];
    const refs: ReferralEdge[] = [{ memberId: 'sarah', referredByMemberId: 'billy' }];
    const c = deriveMemberConnections('billy', rows, refs);
    expect(c.referredRevenueCents).toBe(9000);
    expect(c.referred[0].spendCents).toBe(9000);
  });
});

describe('deriveMemberConnections — empty', () => {
  it('returns an all-empty graph for a member with no rows', () => {
    expect(deriveMemberConnections('ghost', [])).toEqual({
      targetMemberId: 'ghost',
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
    });
  });
});
