/**
 * Member connections — the relationship graph (Phase C, "sphere of influence" substrate).
 *
 * Sibling of `lib/member-history.ts`: where history aggregates one member's OWN
 * behavior, this derives their RELATIONSHIPS — who they've crossed paths with, who
 * they pulled in, who pulled them in. Pure derivation over rows we already have
 * (RSVP co-attendance + plus-one edges + Member referral edges). No I/O, no schema
 * change: callers fetch the rows, this only derives.
 *
 * Design intent: this engine exposes the PRIMITIVES an influence model weighs —
 * reach, gravity, proximity — but deliberately does NOT collapse them into a single
 * "influence score". That weighting (and its correlation-vs-causation caveats at small
 * N) is an open product decision, not a fact to hardcode here.
 *
 * Provable (no inference):
 *  - co-attendance  = two members both `checkedIn` at the same event
 *  - proximity      = |checkedInAt delta| between them at a shared event
 *  - brought        = an RSVP whose `plusOneOfMemberId` points at the target
 *  - referred       = a Member whose `referredByMemberId` is the target
 *  - "stuck"        = a brought/referred member who became a repeat attendee
 *                     (>= STUCK_MIN_EVENTS checked-in events of their own)
 *
 * NOT modeled here (firewall + honesty): charisma / "die-hard energy" is not in
 * transactional data — it lives in operator notes/tags and is operator-facing ONLY.
 * Nothing this engine derives may be projected to sponsors.
 */

/** One RSVP row, narrowed to the fields the graph needs. */
export interface ConnectionRsvpRow {
  memberId: string;
  eventId: string;
  checkedIn: boolean;
  checkedInAt: Date | null;
  /** If set, this RSVP attended as a plus-one OF that member (they were brought). */
  plusOneOfMemberId: string | null;
}

/** A Member's referral edge: who referred them (if anyone). */
export interface ReferralEdge {
  memberId: string;
  referredByMemberId: string | null;
}

/** A member the target has shared a room with, ranked by how often + how closely. */
export interface CoAttendee {
  memberId: string;
  /** Events both the target and this member checked into. */
  sharedEvents: number;
  /** The earliest shared event (where they first crossed paths). */
  firstSharedEventId: string;
  /** Target's check-in time at that first shared event, if known. */
  firstSharedAt: Date | null;
  /** Typical check-in gap across shared events, in minutes — the "arrive together" signal. */
  medianCheckInGapMinutes: number | null;
}

/** Someone the target pulled in, and whether they became a regular. */
export interface BroughtEdge {
  memberId: string;
  /** Became a repeat attendee on their own (>= STUCK_MIN_EVENTS check-ins). */
  stuck: boolean;
}

export interface MemberConnections {
  targetMemberId: string;
  /** Distinct co-attendees, sorted by sharedEvents desc then tightest proximity. */
  coAttendees: CoAttendee[];
  /** Reach / centrality — how many distinct people they've been in the room with. */
  distinctCoAttendees: number;
  /** People the target brought as plus-ones. */
  brought: BroughtEdge[];
  /** Members the target referred in. */
  referred: BroughtEdge[];
  /** Of `brought`, how many stuck. */
  broughtStuckCount: number;
  /** Of `referred`, how many stuck. */
  referredStuckCount: number;
  /** Members who brought the target as their plus-one. */
  broughtBy: string[];
  /** Who referred the target in, if anyone. */
  referredBy: string | null;
}

/** A brought/referred member counts as "stuck" once they have this many check-ins. */
export const STUCK_MIN_EVENTS = 2;

const MS_PER_MINUTE = 60_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function deriveMemberConnections(
  targetMemberId: string,
  rsvps: ConnectionRsvpRow[],
  referrals: ReferralEdge[] = [],
): MemberConnections {
  // Count each member's own check-ins once, for the "stuck" test.
  const checkInsByMember = new Map<string, number>();
  for (const r of rsvps) {
    if (r.checkedIn) checkInsByMember.set(r.memberId, (checkInsByMember.get(r.memberId) ?? 0) + 1);
  }
  const stuck = (memberId: string) => (checkInsByMember.get(memberId) ?? 0) >= STUCK_MIN_EVENTS;

  // The target's own checked-in events, with their check-in time per event.
  const targetEventTime = new Map<string, Date | null>();
  for (const r of rsvps) {
    if (r.memberId === targetMemberId && r.checkedIn) targetEventTime.set(r.eventId, r.checkedInAt);
  }

  // Co-attendance: for every other checked-in attendee of a shared event, tally the
  // overlap and record the per-event check-in gap.
  interface Acc {
    sharedEvents: number;
    firstEventId: string;
    firstAt: Date | null;
    gaps: number[];
  }
  const acc = new Map<string, Acc>();
  for (const r of rsvps) {
    if (r.memberId === targetMemberId || !r.checkedIn) continue;
    if (!targetEventTime.has(r.eventId)) continue;

    const targetAt = targetEventTime.get(r.eventId) ?? null;
    const prev = acc.get(r.memberId);
    const gap =
      targetAt && r.checkedInAt
        ? Math.abs(targetAt.getTime() - r.checkedInAt.getTime()) / MS_PER_MINUTE
        : null;

    if (!prev) {
      acc.set(r.memberId, {
        sharedEvents: 1,
        firstEventId: r.eventId,
        firstAt: targetAt,
        gaps: gap === null ? [] : [gap],
      });
    } else {
      prev.sharedEvents += 1;
      if (gap !== null) prev.gaps.push(gap);
      // Earliest shared event = earliest target check-in time (untimed events never win).
      if (targetAt && (!prev.firstAt || targetAt < prev.firstAt)) {
        prev.firstAt = targetAt;
        prev.firstEventId = r.eventId;
      }
    }
  }

  const coAttendees: CoAttendee[] = [...acc.entries()]
    .map(([memberId, a]) => ({
      memberId,
      sharedEvents: a.sharedEvents,
      firstSharedEventId: a.firstEventId,
      firstSharedAt: a.firstAt,
      medianCheckInGapMinutes: median(a.gaps),
    }))
    .sort((x, y) => {
      if (y.sharedEvents !== x.sharedEvents) return y.sharedEvents - x.sharedEvents;
      // Tie-break on tighter proximity; unknown gaps sort last.
      const gx = x.medianCheckInGapMinutes ?? Infinity;
      const gy = y.medianCheckInGapMinutes ?? Infinity;
      return gx - gy;
    });

  // Gravity (outbound): who the target brought as a plus-one, deduped per member.
  const broughtIds = new Set<string>();
  const broughtByIds = new Set<string>();
  for (const r of rsvps) {
    if (r.plusOneOfMemberId === targetMemberId) broughtIds.add(r.memberId);
    if (r.memberId === targetMemberId && r.plusOneOfMemberId) broughtByIds.add(r.plusOneOfMemberId);
  }
  const brought: BroughtEdge[] = [...broughtIds].map((memberId) => ({ memberId, stuck: stuck(memberId) }));

  // Gravity (outbound): who the target referred in.
  const referred: BroughtEdge[] = referrals
    .filter((e) => e.referredByMemberId === targetMemberId)
    .map((e) => ({ memberId: e.memberId, stuck: stuck(e.memberId) }));

  const referredBy = referrals.find((e) => e.memberId === targetMemberId)?.referredByMemberId ?? null;

  return {
    targetMemberId,
    coAttendees,
    distinctCoAttendees: coAttendees.length,
    brought,
    referred,
    broughtStuckCount: brought.filter((b) => b.stuck).length,
    referredStuckCount: referred.filter((r) => r.stuck).length,
    broughtBy: [...broughtByIds],
    referredBy,
  };
}
