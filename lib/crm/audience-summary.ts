/**
 * CRM S-slice — Audience Summary
 *
 * Pure data layer: fetch confirmed RSVPs for an event + full member RSVP
 * history in 3 batched queries (no N+1), derive per-member segments in TS,
 * return the AudienceSummary contract that Prism's AudienceSummaryPanel
 * consumes. No AI calls. No schema changes.
 *
 * Query plan (3 queries, not N+1):
 *   Q1 — db.rSVP.findMany({ where: { workspaceId, eventId, status: 'CONFIRMED' } })
 *        + member: { select: { id, firstName, lastName, email, status } }
 *        Combines "who is attending" + member stub fetch in one query.
 *   Q2 — db.rSVP.findMany({ where: { workspaceId, memberId: { in: memberIds } } })
 *        + event: { select: { startAt } }
 *        Full RSVP history for all attendees in one indexed IN query.
 *   Q3 — db.application.findMany({ where: { workspaceId, email: { in: emails } } })
 *        Archetype lookup via Application (same pattern as the rsvps route).
 *
 * Workspace scoping: workspaceId is always the server-derived value from
 * requireWorkspaceId(userId). It is applied on EVERY query's `where` clause.
 * The eventId ownership is transitively verified because Q1 includes
 * `workspaceId` — a foreign eventId from another workspace returns 0 rows.
 */

import { db } from '@/lib/db';
import {
  summarizeMemberHistory,
  classifyMember,
  type RsvpHistoryRow,
  type MemberSegment,
} from '@/lib/member-history';

// ─── Shared contract (Prism builds the UI against this — match exactly) ──────

export type AudienceSummaryBuckets = {
  regulars: number;
  firstTimers: number;
  returning: number;
  atRisk: number;
  bigSpenders: number;
};

export type AudienceSummaryMember = {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  /** MAPPED display string — never a raw enum value. */
  statusLabel: string;
  archetype: string | null;
  /** Bucket keys this member falls into. */
  buckets: string[];
  eventsAttended: number;
  /** e.g. "Last seen Apr 2026" or null. */
  lastSeenLabel: string | null;
};

export type AudienceSummary = {
  eventId: string;
  /** "upcoming" while the event is in the future; "past" once it has started. */
  phase: 'upcoming' | 'past';
  /** Confirmed attendees (members + guests) */
  total: number;
  buckets: AudienceSummaryBuckets;
  members: AudienceSummaryMember[];
};

// ─── MemberStatus display mapping ────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Member',
  PENDING: 'Pending',
  WAITLISTED: 'Waitlisted',
  REJECTED: 'Rejected',
  GUEST: 'Guest',
};

function memberStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? 'Member';
}

// ─── Segment → bucket key mapping ────────────────────────────────────────────
// MemberSegment values are internal; bucket keys are what the contract exposes.

const SEGMENT_BUCKET: Record<MemberSegment, keyof AudienceSummaryBuckets> = {
  regular: 'regulars',
  first_timer: 'firstTimers',
  lapsed: 'atRisk',
  no_show_risk: 'atRisk',
  big_spender: 'bigSpenders',
};

// A member who has attended ≥ 2 events but is not a regular is "returning".
function isReturning(eventsAttended: number, segments: MemberSegment[]): boolean {
  return (
    eventsAttended >= 2 &&
    !segments.includes('regular') &&
    !segments.includes('lapsed') &&
    !segments.includes('no_show_risk')
  );
}

// ─── Last-seen label ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function lastSeenLabel(date: Date | null): string | null {
  if (!date) return null;
  const m = MONTH_NAMES[date.getMonth()];
  return `Last seen ${m} ${date.getFullYear()}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetch the audience summary for an event.
 *
 * @param workspaceId  Server-derived from requireWorkspaceId — NEVER from client input.
 * @param eventId      URL param — ownership verified by workspace-scoped Q1.
 */
export async function getAudienceSummary(
  workspaceId: string,
  eventId: string,
): Promise<AudienceSummary> {
  const now = new Date();

  // ── Q1: Confirmed RSVPs for this event + member stubs ─────────────────────
  // Single query; member join collapses the "who is here + their display data"
  // fetch so there is no follow-up per-member select.
  const eventRsvps = await db.rSVP.findMany({
    where: {
      workspaceId,
      eventId,
      status: 'CONFIRMED',
    },
    select: {
      memberId: true,
      checkedIn: true,
      event: {
        select: { startAt: true },
      },
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          mergedIntoId: true,    // skip merged duplicates
        },
      },
    },
  });

  // Determine phase from the event's startAt (read from any RSVP's joined event).
  const eventStartAt = eventRsvps[0]?.event?.startAt ?? null;
  const phase: 'upcoming' | 'past' =
    eventStartAt && eventStartAt <= now ? 'past' : 'upcoming';

  // Deduplicate by canonical memberId (skip merged records).
  const seen = new Set<string>();
  const canonicalRsvps = eventRsvps.filter((r) => {
    if (!r.member || r.member.mergedIntoId !== null) return false;
    if (seen.has(r.memberId)) return false;
    seen.add(r.memberId);
    return true;
  });

  const memberIds = canonicalRsvps.map((r) => r.memberId);
  const total = memberIds.length;

  if (total === 0) {
    return {
      eventId,
      phase,
      total: 0,
      buckets: { regulars: 0, firstTimers: 0, returning: 0, atRisk: 0, bigSpenders: 0 },
      members: [],
    };
  }

  // Collect member emails for archetype lookup.
  const memberEmails = canonicalRsvps
    .map((r) => r.member!.email)
    .filter((e): e is string => !!e);

  // ── Q2: Full RSVP history for all attendees ───────────────────────────────
  // One batched query, indexed on (workspaceId, memberId).
  const historyRows = await db.rSVP.findMany({
    where: {
      workspaceId,
      memberId: { in: memberIds },
    },
    select: {
      memberId: true,
      status: true,
      ticketStatus: true,
      isComp: true,
      checkedIn: true,
      checkedInAt: true,
      paymentStatus: true,
      amountCents: true,
      event: {
        select: { startAt: true },
      },
    },
  });

  // ── Q3: Archetype lookup via Application (email-keyed, one batch) ─────────
  // Same pattern as app/api/operator/events/[id]/rsvps/route.ts.
  // Application.archetype is operator-internal data — not a psychographic field,
  // not in the sponsor firewall surface.
  const archetypeByEmail = new Map<string, string | null>();
  if (memberEmails.length > 0) {
    const applications = await db.application.findMany({
      where: { workspaceId, email: { in: memberEmails } },
      select: { email: true, archetype: true },
    });
    for (const a of applications) {
      archetypeByEmail.set(a.email.toLowerCase(), a.archetype ?? null);
    }
  }

  // Group history rows by memberId for O(n) per-member summarization.
  const historyByMember = new Map<string, RsvpHistoryRow[]>();
  for (const row of historyRows) {
    const key = row.memberId;
    if (!historyByMember.has(key)) historyByMember.set(key, []);
    historyByMember.get(key)!.push({
      status: row.status as RsvpHistoryRow['status'],
      ticketStatus: row.ticketStatus,
      isComp: row.isComp,
      checkedIn: row.checkedIn,
      checkedInAt: row.checkedInAt,
      paymentStatus: row.paymentStatus,
      amountCents: row.amountCents,
      eventStartsAt: row.event.startAt,
    });
  }

  // ── Per-member derivation ─────────────────────────────────────────────────
  const buckets: AudienceSummaryBuckets = {
    regulars: 0,
    firstTimers: 0,
    returning: 0,
    atRisk: 0,
    bigSpenders: 0,
  };

  const members: AudienceSummaryMember[] = canonicalRsvps.map((rsvp) => {
    const m = rsvp.member!;
    const rows = historyByMember.get(rsvp.memberId) ?? [];
    const history = summarizeMemberHistory(rows, now);
    const segments = classifyMember(history, now);

    // Derive bucket keys for this member (can be multiple).
    const memberBuckets = new Set<string>();
    for (const seg of segments) {
      memberBuckets.add(SEGMENT_BUCKET[seg]);
    }
    if (isReturning(history.eventsAttended, segments)) {
      memberBuckets.add('returning');
    }

    // Increment aggregate bucket counts.
    for (const bk of memberBuckets) {
      (buckets as Record<string, number>)[bk] += 1;
    }

    const archetype = m.email
      ? (archetypeByEmail.get(m.email.toLowerCase()) ?? null)
      : null;

    return {
      memberId: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      statusLabel: memberStatusLabel(m.status),
      archetype,
      buckets: [...memberBuckets],
      eventsAttended: history.eventsAttended,
      lastSeenLabel: lastSeenLabel(history.lastAttendedAt),
    };
  });

  return { eventId, phase, total, buckets, members };
}
