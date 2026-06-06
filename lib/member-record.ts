/**
 * Member full-record read-path (member-intelligence PR3 data layer). Assembles the
 * complete operator-facing member record the record page consumes: core identity +
 * grouped firmographic/demographic dimensions + customFields/fieldProvenance +
 * engagement timeline, and — ONLY when the caller is an operator — the firewalled
 * psychographic profile.
 *
 * Psychographics is gated by the `includePsychographics` flag, not by omission-by-luck:
 * a non-operator (sponsor) caller passes false and the field is structurally null. The
 * route wrapper sets it from the role gate; the SponsorAudienceMember projection in
 * sponsor-safe.ts is the type-level guarantee for the sponsor aggregation path.
 *
 * Pure assembly over injected reads — the route is a thin gate + respond wrapper, and
 * this function is unit-tested against a mocked db.
 */
import { db } from './db';

export interface MemberRecordCore {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  tags: string[];
  redListed: boolean;
  approved: boolean;
  approvedAt: string | null;
  totalEventsAttended: number;
  lastAttendedDate: string | null;
  enrichmentStatus: string;
  enrichmentLastSynced: string | null;
  mergedIntoId: string | null;
  mergedAt: string | null;
  createdAt: string;
}

export interface MemberRecordDimensions {
  firmographic: {
    industry: string | null;
    jobFunction: string | null;
    seniority: string | null;
    companySize: string | null;
    companyName: string | null;
    companyDomain: string | null;
    linkedinUrl: string | null;
    instagram: string | null;
  };
  demographic: {
    city: string | null;
    country: string | null;
    ageRange: string | null;
  };
}

export interface MemberRecordPsychographics {
  archetype: string | null;
  archetypeScores: unknown;
  interests: string[];
  tasteSignals: unknown;
}

export interface MemberTimelineEntry {
  id: string;
  eventType: string;
  eventId: string | null;
  occurredAt: string;
  metadata: unknown;
}

export interface MemberRecord {
  member: MemberRecordCore;
  dimensions: MemberRecordDimensions;
  customFields: Record<string, unknown> | null;
  fieldProvenance: Record<string, unknown> | null;
  /** Operator-only. Null whenever includePsychographics is false (e.g. a sponsor path). */
  psychographics: MemberRecordPsychographics | null;
  timeline: MemberTimelineEntry[];
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export async function assembleMemberRecord(args: {
  workspaceId: string;
  memberId: string;
  includePsychographics: boolean;
  timelineLimit?: number;
}): Promise<MemberRecord | null> {
  const { workspaceId, memberId, includePsychographics } = args;
  const timelineLimit = args.timelineLimit ?? 50;

  const member = await db.member.findFirst({
    where: { id: memberId, workspaceId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      tags: true,
      redListed: true,
      approved: true,
      approvedAt: true,
      totalEventsAttended: true,
      lastAttendedDate: true,
      enrichmentStatus: true,
      enrichmentLastSynced: true,
      mergedIntoId: true,
      mergedAt: true,
      createdAt: true,
      customFields: true,
      fieldProvenance: true,
      industry: true,
      jobFunction: true,
      seniority: true,
      companySize: true,
      companyName: true,
      companyDomain: true,
      linkedinUrl: true,
      instagram: true,
      city: true,
      country: true,
      ageRange: true,
    },
  });
  if (!member) return null;

  // Psychographics + timeline read in parallel. Psychographics is fetched ONLY when the
  // caller is permitted to see it — a sponsor path never even issues the query.
  const [psychoRow, timelineRows] = await Promise.all([
    includePsychographics
      ? db.memberPsychographics.findUnique({
          where: { memberId },
          select: { archetype: true, archetypeScores: true, interests: true, tasteSignals: true },
        })
      : Promise.resolve(null),
    db.memberEngagementEvent.findMany({
      where: { workspaceId, memberId },
      orderBy: { occurredAt: 'desc' },
      take: timelineLimit,
      select: { id: true, eventType: true, eventId: true, occurredAt: true, metadata: true },
    }),
  ]);

  return {
    member: {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      status: member.status,
      tags: member.tags,
      redListed: member.redListed,
      approved: member.approved,
      approvedAt: iso(member.approvedAt),
      totalEventsAttended: member.totalEventsAttended,
      lastAttendedDate: iso(member.lastAttendedDate),
      enrichmentStatus: member.enrichmentStatus,
      enrichmentLastSynced: iso(member.enrichmentLastSynced),
      mergedIntoId: member.mergedIntoId,
      mergedAt: iso(member.mergedAt),
      createdAt: member.createdAt.toISOString(),
    },
    dimensions: {
      firmographic: {
        industry: member.industry,
        jobFunction: member.jobFunction,
        seniority: member.seniority,
        companySize: member.companySize,
        companyName: member.companyName,
        companyDomain: member.companyDomain,
        linkedinUrl: member.linkedinUrl,
        instagram: member.instagram,
      },
      demographic: {
        city: member.city,
        country: member.country,
        ageRange: member.ageRange,
      },
    },
    customFields: (member.customFields as Record<string, unknown> | null) ?? null,
    fieldProvenance: (member.fieldProvenance as Record<string, unknown> | null) ?? null,
    psychographics: psychoRow
      ? {
          archetype: psychoRow.archetype,
          archetypeScores: psychoRow.archetypeScores ?? null,
          interests: psychoRow.interests,
          tasteSignals: psychoRow.tasteSignals ?? null,
        }
      : null,
    timeline: timelineRows.map((t) => ({
      id: t.id,
      eventType: t.eventType,
      eventId: t.eventId,
      occurredAt: t.occurredAt.toISOString(),
      metadata: (t.metadata as unknown) ?? null,
    })),
  };
}
