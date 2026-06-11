import { describe, it, expect } from 'vitest';
import {
  summarizeMemberHistory,
  classifyMember,
  DEFAULT_SEGMENT_THRESHOLDS,
  type RsvpHistoryRow,
} from '@/lib/member-history';

// "Remember" cross-event memory core (Phase C). Pins the attended / no-show / spend
// definitions every Remember surface relies on, so a refactor can't silently change
// who counts as a regular or how much a guest has spent.

const NOW = new Date('2026-06-09T12:00:00Z');
const PAST = new Date('2026-05-01T20:00:00Z');
const FUTURE = new Date('2026-07-01T20:00:00Z');

function row(over: Partial<RsvpHistoryRow>): RsvpHistoryRow {
  return {
    status: 'CONFIRMED',
    ticketStatus: 'confirmed',
    isComp: false,
    checkedIn: false,
    checkedInAt: null,
    paymentStatus: null,
    amountCents: null,
    eventStartsAt: PAST,
    ...over,
  };
}

describe('summarizeMemberHistory', () => {
  it('is all-zero for a member with no rows', () => {
    expect(summarizeMemberHistory([], NOW)).toEqual({
      timesRegistered: 0, eventsAttended: 0, noShows: 0,
      totalSpendCents: 0, lastAttendedAt: null, firstAttendedAt: null,
    });
  });

  it('counts a checked-in event as attended, with first/last attendance', () => {
    const early = new Date('2026-03-10T21:00:00Z');
    const late = new Date('2026-05-02T21:00:00Z');
    const h = summarizeMemberHistory([
      row({ checkedIn: true, checkedInAt: early }),
      row({ checkedIn: true, checkedInAt: late }),
    ], NOW);
    expect(h.eventsAttended).toBe(2);
    expect(h.firstAttendedAt).toEqual(early);
    expect(h.lastAttendedAt).toEqual(late);
    expect(h.noShows).toBe(0);
  });

  it('counts a past confirmed-but-unscanned spot as a no-show', () => {
    const h = summarizeMemberHistory([row({ eventStartsAt: PAST, checkedIn: false })], NOW);
    expect(h.noShows).toBe(1);
  });

  it('does NOT count a future no-scan as a no-show (event has not happened)', () => {
    const h = summarizeMemberHistory([row({ eventStartsAt: FUTURE, checkedIn: false })], NOW);
    expect(h.noShows).toBe(0);
  });

  it('does NOT count an unpaid held cart as a no-show', () => {
    const h = summarizeMemberHistory([row({ ticketStatus: 'held', checkedIn: false })], NOW);
    expect(h.noShows).toBe(0);
  });

  it('counts a comp no-show (they had a real spot)', () => {
    const h = summarizeMemberHistory([row({ isComp: true, ticketStatus: 'confirmed', checkedIn: false })], NOW);
    expect(h.noShows).toBe(1);
  });

  it('only sums CAPTURED payments as spend', () => {
    const h = summarizeMemberHistory([
      row({ paymentStatus: 'CAPTURED', amountCents: 5000, checkedIn: true, checkedInAt: PAST }),
      row({ paymentStatus: 'AUTHORIZED', amountCents: 9999 }), // held, not revenue
      row({ paymentStatus: 'REFUNDED', amountCents: 4000 }),   // refunded, not revenue
      row({ paymentStatus: 'COMP', amountCents: 0 }),
    ], NOW);
    expect(h.totalSpendCents).toBe(5000);
  });

  it('excludes declined/waitlisted from timesRegistered', () => {
    const h = summarizeMemberHistory([
      row({ status: 'CONFIRMED' }),
      row({ status: 'DECLINED' }),
      row({ status: 'WAITLISTED' }),
    ], NOW);
    expect(h.timesRegistered).toBe(1);
  });
});

describe('classifyMember', () => {
  const base = { timesRegistered: 1, eventsAttended: 0, noShows: 0, totalSpendCents: 0, lastAttendedAt: null, firstAttendedAt: null };

  it('tags a frequent attendee as regular', () => {
    expect(classifyMember({ ...base, eventsAttended: 3 }, NOW)).toContain('regular');
  });

  it('tags high captured spend as big_spender', () => {
    expect(classifyMember({ ...base, totalSpendCents: 50_000 }, NOW)).toContain('big_spender');
  });

  it('tags repeat no-shows as no_show_risk', () => {
    expect(classifyMember({ ...base, noShows: 2 }, NOW)).toContain('no_show_risk');
  });

  it('tags a long-dormant prior attendee as lapsed', () => {
    const old = new Date(NOW.getTime() - 200 * 86_400_000);
    expect(classifyMember({ ...base, eventsAttended: 1, lastAttendedAt: old }, NOW)).toContain('lapsed');
  });

  it('does not tag a recent attendee as lapsed', () => {
    const recent = new Date(NOW.getTime() - 10 * 86_400_000);
    expect(classifyMember({ ...base, eventsAttended: 1, lastAttendedAt: recent }, NOW)).not.toContain('lapsed');
  });

  it('tags a registered first-timer, and stacks multiple segments', () => {
    const old = new Date(NOW.getTime() - 200 * 86_400_000);
    const segs = classifyMember(
      { timesRegistered: 5, eventsAttended: 5, noShows: 2, totalSpendCents: 60_000, lastAttendedAt: old, firstAttendedAt: old },
      NOW,
    );
    expect(segs).toEqual(expect.arrayContaining(['regular', 'big_spender', 'no_show_risk', 'lapsed']));
  });

  it('returns no segments for a blank-slate member', () => {
    expect(classifyMember(base, NOW)).toEqual(['first_timer']);
    expect(classifyMember({ ...base, timesRegistered: 0 }, NOW)).toEqual([]);
  });

  it('honors custom thresholds', () => {
    const segs = classifyMember({ ...base, eventsAttended: 2 }, NOW, { ...DEFAULT_SEGMENT_THRESHOLDS, regularMinEvents: 2 });
    expect(segs).toContain('regular');
  });
});
