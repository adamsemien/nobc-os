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
  aiSummary: string | null;
  energyScore: number | null;
  networkValueScore: number | null;
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

/** Red List status, matched from WatchList by email (PURPLE = watch, BLOCKED = bar). */
export interface MemberRecordRedList {
  type: string;
  note: string | null;
}

/**
 * Operator-facing application intelligence — the latest Application's AI assessment.
 * Archetype is deliberately NOT here: it is psychographic and lives only in the
 * firewalled psychographics block, gated separately.
 */
export interface MemberRecordIntelligence {
  aiScore: number | null;
  aiReasoning: string | null;
  aiRecommendation: string | null;
}

export interface MemberTimelineEntry {
  id: string;
  eventType: string;
  eventId: string | null;
  occurredAt: string;
  metadata: unknown;
}

/**
 * Active member custom-field definitions (F5). Lets the Fields card render customFields by
 * their declared label/type/options instead of raw keys, and surface defined-but-empty
 * fields as editable rows. Operator-facing metadata — never part of the sponsor projection.
 */
export interface MemberFieldDef {
  stableKey: string;
  name: string;
  type: string;
  options: string[];
  sponsorVisible: boolean;
  order: number;
}

export interface MemberRecord {
  member: MemberRecordCore;
  dimensions: MemberRecordDimensions;
  customFields: Record<string, unknown> | null;
  fieldProvenance: Record<string, unknown> | null;
  /** Operator-only. Null whenever includePsychographics is false (e.g. a sponsor path). */
  psychographics: MemberRecordPsychographics | null;
  /** Red List match (PURPLE/BLOCKED) from WatchList, or null if not listed. */
  redList: MemberRecordRedList | null;
  /** Latest Application AI assessment (no archetype — that stays firewalled). */
  intelligence: MemberRecordIntelligence | null;
  /** Active member custom-field definitions (F5), ordered. Drives the Fields card render. */
  fieldDefs: MemberFieldDef[];
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
      aiSummary: true,
      energyScore: true,
      networkValueScore: true,
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

  // Psychographics + timeline + Red List + application intelligence read in parallel.
  // Psychographics is fetched ONLY when the caller is permitted to see it — a sponsor path
  // never even issues the query. Red List + intelligence are operator-facing (not
  // psychographic) and always read. Both match the canonical email-based lookups the
  // existing member GET endpoint uses, so the two surfaces agree.
  const [psychoRow, timelineRows, watchRow, applicationRow, fieldDefRows] = await Promise.all([
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
    db.watchList.findFirst({
      where: { workspaceId, deletedAt: null, matchEmail: { equals: member.email, mode: 'insensitive' } },
      select: { type: true, note: true },
    }),
    db.application.findFirst({
      where: { workspaceId, email: { equals: member.email, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      // aiScore/aiReasoning/aiRecommendation only — archetype/archetypeScores are
      // psychographic and must NOT be surfaced through this operator-intelligence block.
      select: { aiScore: true, aiReasoning: true, aiRecommendation: true },
    }),
    // Active member field definitions (F5) — operator metadata, never sponsor-facing.
    db.fieldDefinition.findMany({
      where: { workspaceId, section: 'member', isActive: true },
      orderBy: { order: 'asc' },
      select: { stableKey: true, name: true, type: true, options: true, sponsorVisible: true, order: true },
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
      aiSummary: member.aiSummary ?? null,
      energyScore: member.energyScore ?? null,
      networkValueScore: member.networkValueScore ?? null,
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
    redList: watchRow ? { type: watchRow.type, note: watchRow.note } : null,
    intelligence: applicationRow
      ? {
          aiScore: applicationRow.aiScore ?? null,
          aiReasoning: applicationRow.aiReasoning ?? null,
          aiRecommendation: applicationRow.aiRecommendation ?? null,
        }
      : null,
    fieldDefs: fieldDefRows.map((d) => ({
      stableKey: d.stableKey,
      name: d.name,
      type: d.type,
      options: d.options,
      sponsorVisible: d.sponsorVisible,
      order: d.order,
    })),
    timeline: timelineRows.map((t) => ({
      id: t.id,
      eventType: t.eventType,
      eventId: t.eventId,
      occurredAt: t.occurredAt.toISOString(),
      metadata: (t.metadata as unknown) ?? null,
    })),
  };
}
