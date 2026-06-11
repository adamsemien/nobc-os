/**
 * "Remember" — cross-event guest memory (Phase C).
 *
 * Pure aggregation over a member's RSVP rows so every Remember surface — the pre-event
 * audience summary, the door "Nth event" badge, smart segments, the event retro — shares
 * ONE tested definition of attended / no-show / spend. No I/O here: callers fetch the rows
 * (RSVP joined to its Event's start time) and this only derives.
 *
 * Semantics (grounded in the live schema, 2026-06-09):
 *  - attendance truth  = RSVP.checkedIn (set at check-in; also bumps Member.totalEventsAttended)
 *  - spend             = sum(amountCents) where paymentStatus === 'CAPTURED'
 *                        (AUTHORIZED isn't revenue yet; REFUNDED/FAILED isn't; COMP is $0)
 *  - no-show           = a PAST event where they held a real confirmed/comp spot but never
 *                        checked in (a 'held' cart they never completed is NOT a no-show)
 */

/** One RSVP row for a member, joined to its event's start time. */
export interface RsvpHistoryRow {
  status: 'CONFIRMED' | 'DECLINED' | 'WAITLISTED';
  ticketStatus: string; // 'confirmed' | 'held' | 'refunded' | ...
  isComp: boolean;
  checkedIn: boolean;
  checkedInAt: Date | null;
  paymentStatus: string | null; // 'AUTHORIZED' | 'CAPTURED' | 'COMP' | 'FAILED' | 'REFUNDED'
  amountCents: number | null;
  eventStartsAt: Date;
}

export interface MemberHistory {
  /** Confirmed registrations (excludes declined/waitlisted). */
  timesRegistered: number;
  /** Events physically attended (checked in). */
  eventsAttended: number;
  /** Past events they had a confirmed/comp spot for but didn't show. */
  noShows: number;
  /** Captured revenue from this member, in cents. */
  totalSpendCents: number;
  /** Most recent attendance, or null if they've never shown. */
  lastAttendedAt: Date | null;
  /** Earliest attendance, or null if they've never shown. */
  firstAttendedAt: Date | null;
}

/** Did this RSVP hold a real spot they were expected to use? */
function heldConfirmedSpot(row: RsvpHistoryRow): boolean {
  return row.status === 'CONFIRMED' && (row.isComp || row.ticketStatus === 'confirmed');
}

export function summarizeMemberHistory(rows: RsvpHistoryRow[], now: Date): MemberHistory {
  let timesRegistered = 0;
  let eventsAttended = 0;
  let noShows = 0;
  let totalSpendCents = 0;
  let lastAttendedAt: Date | null = null;
  let firstAttendedAt: Date | null = null;

  for (const row of rows) {
    if (row.status === 'CONFIRMED') timesRegistered += 1;

    if (row.paymentStatus === 'CAPTURED' && row.amountCents != null) {
      totalSpendCents += row.amountCents;
    }

    if (row.checkedIn) {
      eventsAttended += 1;
      const at = row.checkedInAt;
      if (at) {
        if (!lastAttendedAt || at > lastAttendedAt) lastAttendedAt = at;
        if (!firstAttendedAt || at < firstAttendedAt) firstAttendedAt = at;
      }
    } else if (heldConfirmedSpot(row) && row.eventStartsAt < now) {
      noShows += 1;
    }
  }

  return { timesRegistered, eventsAttended, noShows, totalSpendCents, lastAttendedAt, firstAttendedAt };
}

export type MemberSegment = 'regular' | 'big_spender' | 'no_show_risk' | 'lapsed' | 'first_timer';

export interface SegmentThresholds {
  /** Attended at least this many → "regular". */
  regularMinEvents: number;
  /** Captured spend at/above this (cents) → "big spender". */
  bigSpenderMinCents: number;
  /** This many no-shows → "no-show risk". */
  noShowRiskMin: number;
  /** Days since last attendance, for a prior attendee → "lapsed". */
  lapsedAfterDays: number;
}

export const DEFAULT_SEGMENT_THRESHOLDS: SegmentThresholds = {
  regularMinEvents: 3,
  bigSpenderMinCents: 50_000, // $500 captured lifetime
  noShowRiskMin: 2,
  lapsedAfterDays: 120,
};

const DAY_MS = 86_400_000;

/**
 * Classify a member into zero or more smart segments. A member can be several at once
 * (a lapsed big-spender). Returns [] for someone with no signal yet.
 */
export function classifyMember(
  h: MemberHistory,
  now: Date,
  thresholds: SegmentThresholds = DEFAULT_SEGMENT_THRESHOLDS,
): MemberSegment[] {
  const segments: MemberSegment[] = [];

  if (h.eventsAttended >= thresholds.regularMinEvents) segments.push('regular');
  if (h.totalSpendCents >= thresholds.bigSpenderMinCents) segments.push('big_spender');
  if (h.noShows >= thresholds.noShowRiskMin) segments.push('no_show_risk');

  if (h.lastAttendedAt) {
    const daysSince = (now.getTime() - h.lastAttendedAt.getTime()) / DAY_MS;
    if (daysSince >= thresholds.lapsedAfterDays) segments.push('lapsed');
  }

  // Registered (or attended once) but not yet a regular — a face to convert.
  if (h.eventsAttended <= 1 && h.timesRegistered >= 1) segments.push('first_timer');

  return segments;
}
