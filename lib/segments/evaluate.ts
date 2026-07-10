/** Segment filter-AST resolver (Slice 4 — Segments, saved views & the
 *  operator-action log).
 *
 *  Resolves a Segment's `definition` to the population it names, as
 *  { personId, memberId } identity pairs — the dual-pointer shape already used
 *  by ChannelSubscription/SmsConversation/TransactionalEmailLog. Deliberately
 *  NOT memberId-only (blind to bare leads — Person rows with no Member) and NOT
 *  personId-only (Member.personId is nullable; a legacy Member never backfilled
 *  onto a Person would be silently dropped).
 *
 *  Two branches, merged and deduped:
 *   1. resolveFromPersons — Person-primary, covers every Person (bare leads and
 *      Persons with a linked, non-merged Member).
 *   2. resolveFromOrphanMembers — Members with personId: null, covering the
 *      backfill gap the recon named as the single most important design
 *      question in this slice.
 *
 *  workspaceId is ALWAYS the caller's own value, hard-injected here — never
 *  read from `definition`. A definition can never smuggle a cross-workspace
 *  read.
 *
 *  DYNAMIC segments call this live, on every read. STATIC segments freeze the
 *  result into SegmentSnapshotMember at creation time (see
 *  app/api/operator/segments/route.ts) and this evaluator is never called
 *  again for them — reading a STATIC segment reads the snapshot rows directly.
 */
import type {
  ContactRole,
  ContactSourceSystem,
  MemberStatus,
  Prisma,
  PrismaClient,
  Segment,
} from '@prisma/client';

export type SegmentIdentity = { personId: string | null; memberId: string | null };

/** Shared by the segment detail route and the detail page — STATIC segments
 *  read the frozen snapshot, DYNAMIC segments re-evaluate live. Keeps that
 *  branch in exactly one place. */
export async function resolveSegmentPopulation(
  db: PrismaClient,
  segment: Segment,
): Promise<SegmentIdentity[]> {
  if (segment.kind === 'STATIC') {
    const rows = await db.segmentSnapshotMember.findMany({ where: { segmentId: segment.id } });
    return rows.map((r) => ({ personId: r.personId, memberId: r.memberId }));
  }
  return evaluateSegment(db, segment.workspaceId, segment.definition as SegmentFilterDefinition);
}

/** Firmographic fields present on Member (sponsor-intelligence self-reported /
 *  enriched data). Explicit allow-list, not an arbitrary string key, so the
 *  filter AST can never reach a field it doesn't intend to. */
export type FirmographicField =
  | 'industry'
  | 'jobFunction'
  | 'seniority'
  | 'companySize'
  | 'city'
  | 'country'
  | 'companyName';

/** v1 filter-AST vocabulary. Every primitive below maps to real, queryable
 *  data as of Slices 0-3 — see the Slice 4 recon's filter-AST inventory.
 *  `q`/`source`/`verified`/`membership`/`consent` are a direct generalization
 *  of the People-list's existing filters (app/operator/people/page.tsx). All
 *  set primitives combine with AND, matching the People-list's own semantics. */
export type SegmentFilterDefinition = {
  q?: string;
  source?: ContactSourceSystem;
  verified?: 'verified' | 'unverified';
  membership?: 'member' | 'none';
  consent?: 'subscribed' | 'none';
  role?: ContactRole;
  organizationId?: string;
  membershipStatus?: MemberStatus;
  /** EntityTag.tagId — deliberately NOT Member.tags (the legacy string array).
   *  See the module-level note below on that gap. */
  tagId?: string;
  customField?: { stableKey: string; value: string };
  firmographic?: { field: FirmographicField; value: string };
  /** "Attended event X." RSVP.memberId is required (not nullable) — this
   *  primitive structurally cannot match a bare lead. A Segment using it will
   *  silently exclude every lead with no Member, by design of the current
   *  data model, not a bug in the resolver. */
  eventId?: string;
  createdAfter?: string;
  createdBefore?: string;
};

const MAX_ROWS = 500; // matches the People-list's own cap

export async function evaluateSegment(
  db: PrismaClient,
  workspaceId: string,
  definition: SegmentFilterDefinition,
): Promise<SegmentIdentity[]> {
  const tagEntityIds = definition.tagId
    ? await resolveTagEntityIds(db, workspaceId, definition.tagId)
    : null;

  const [fromPersons, fromOrphanMembers] = await Promise.all([
    resolveFromPersons(db, workspaceId, definition, tagEntityIds),
    resolveFromOrphanMembers(db, workspaceId, definition, tagEntityIds),
  ]);

  const seen = new Set<string>();
  const identities: SegmentIdentity[] = [];
  for (const identity of [...fromPersons, ...fromOrphanMembers]) {
    const key = `${identity.personId ?? ''}:${identity.memberId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    identities.push(identity);
  }
  return identities;
}

async function resolveTagEntityIds(
  db: PrismaClient,
  workspaceId: string,
  tagId: string,
): Promise<{ personIds: string[]; memberIds: string[] }> {
  const rows = await db.entityTag.findMany({
    where: { workspaceId, tagId, entityType: { in: ['person', 'member'] } },
    select: { entityType: true, entityId: true },
  });
  return {
    personIds: rows.filter((r) => r.entityType === 'person').map((r) => r.entityId),
    memberIds: rows.filter((r) => r.entityType === 'member').map((r) => r.entityId),
  };
}

/** Member-only primitives (status/firmographic/event attendance/custom field),
 *  applied identically as a nested `members: { some: {...} }` AND-condition on
 *  the Person branch and as direct field filters on the orphan-Member branch. */
function buildMemberFilter(def: SegmentFilterDefinition): Prisma.MemberWhereInput | null {
  const filter: Prisma.MemberWhereInput = {};
  let has = false;

  if (def.membershipStatus) {
    filter.status = def.membershipStatus;
    has = true;
  }
  if (def.firmographic) {
    has = true;
    switch (def.firmographic.field) {
      case 'industry':
        filter.industry = def.firmographic.value;
        break;
      case 'jobFunction':
        filter.jobFunction = def.firmographic.value;
        break;
      case 'seniority':
        filter.seniority = def.firmographic.value;
        break;
      case 'companySize':
        filter.companySize = def.firmographic.value;
        break;
      case 'city':
        filter.city = def.firmographic.value;
        break;
      case 'country':
        filter.country = def.firmographic.value;
        break;
      case 'companyName':
        filter.companyName = def.firmographic.value;
        break;
    }
  }
  if (def.eventId) {
    filter.rsvps = { some: { eventId: def.eventId } };
    has = true;
  }
  if (def.customField) {
    filter.customFields = { path: [def.customField.stableKey], equals: def.customField.value };
    has = true;
  }

  return has ? filter : null;
}

async function resolveFromPersons(
  db: PrismaClient,
  workspaceId: string,
  def: SegmentFilterDefinition,
  tagEntityIds: { personIds: string[]; memberIds: string[] } | null,
): Promise<SegmentIdentity[]> {
  const and: Prisma.PersonWhereInput[] = [{ workspaceId, mergedIntoId: null }];

  if (def.q) {
    and.push({
      OR: [
        { firstName: { contains: def.q, mode: 'insensitive' } },
        { lastName: { contains: def.q, mode: 'insensitive' } },
        { email: { contains: def.q, mode: 'insensitive' } },
      ],
    });
  }
  if (def.source) and.push({ contactSources: { some: { source: def.source } } });
  if (def.verified === 'verified') and.push({ emailVerified: true });
  if (def.verified === 'unverified') and.push({ emailVerified: false, email: { not: null } });
  if (def.membership === 'member') and.push({ members: { some: { mergedIntoId: null } } });
  if (def.membership === 'none') and.push({ members: { none: { mergedIntoId: null } } });
  if (def.consent === 'subscribed') {
    and.push({ channelSubscriptions: { some: { memberId: null, status: 'SUBSCRIBED' } } });
  }
  if (def.consent === 'none') and.push({ channelSubscriptions: { none: { memberId: null } } });
  if (def.role) and.push({ roles: { has: def.role } });
  if (def.organizationId) and.push({ organizations: { some: { organizationId: def.organizationId } } });
  if (tagEntityIds) {
    and.push({
      OR: [
        { id: { in: tagEntityIds.personIds } },
        { members: { some: { id: { in: tagEntityIds.memberIds } } } },
      ],
    });
  }
  if (def.createdAfter) and.push({ createdAt: { gte: new Date(def.createdAfter) } });
  if (def.createdBefore) and.push({ createdAt: { lte: new Date(def.createdBefore) } });

  const memberFilter = buildMemberFilter(def);
  if (memberFilter) and.push({ members: { some: { mergedIntoId: null, ...memberFilter } } });

  const persons = await db.person.findMany({
    where: { AND: and },
    take: MAX_ROWS,
    include: {
      members: { where: { mergedIntoId: null, ...(memberFilter ?? {}) }, select: { id: true } },
    },
  });

  const identities: SegmentIdentity[] = [];
  for (const person of persons) {
    if (person.members.length === 0) {
      // A member-only primitive was set (membershipStatus/firmographic/eventId/
      // customField) — the filtered include is empty on purpose, and since it's
      // AND-required above (`members: { some: {...memberFilter} }`), this person
      // wouldn't have matched at all if one were set. Reaching this branch with
      // memberFilter set is therefore impossible; guard kept for clarity.
      if (!memberFilter) identities.push({ personId: person.id, memberId: null });
      continue;
    }
    for (const member of person.members) {
      identities.push({ personId: person.id, memberId: member.id });
    }
  }
  return identities;
}

async function resolveFromOrphanMembers(
  db: PrismaClient,
  workspaceId: string,
  def: SegmentFilterDefinition,
  tagEntityIds: { personIds: string[]; memberIds: string[] } | null,
): Promise<SegmentIdentity[]> {
  // membership: 'none' means "has no Member" — an orphan Member row is itself a
  // Member, so it can never satisfy that primitive.
  if (def.membership === 'none') return [];
  // organizationId (PersonOrganization) has no Member-side equivalent — an
  // orphan Member structurally cannot satisfy it.
  if (def.organizationId) return [];
  // `verified` (Person.emailVerified) has no Member-side equivalent either — an
  // orphan Member has no Person, so this primitive doesn't apply to it. Skipped
  // rather than silently excluding every orphan Member from a segment that also
  // happens to filter on verified; see the build report's confidence caveats.

  const and: Prisma.MemberWhereInput[] = [{ workspaceId, personId: null, mergedIntoId: null }];

  if (def.q) {
    and.push({
      OR: [
        { firstName: { contains: def.q, mode: 'insensitive' } },
        { lastName: { contains: def.q, mode: 'insensitive' } },
        { email: { contains: def.q, mode: 'insensitive' } },
      ],
    });
  }
  if (def.source) and.push({ contactSources: { some: { source: def.source } } });
  if (def.consent === 'subscribed') and.push({ channelSubscriptions: { some: { status: 'SUBSCRIBED' } } });
  if (def.consent === 'none') and.push({ channelSubscriptions: { none: {} } });
  if (def.role) and.push({ roles: { has: def.role } });
  if (tagEntityIds) and.push({ id: { in: tagEntityIds.memberIds } });
  if (def.createdAfter) and.push({ createdAt: { gte: new Date(def.createdAfter) } });
  if (def.createdBefore) and.push({ createdAt: { lte: new Date(def.createdBefore) } });

  const memberFilter = buildMemberFilter(def);
  if (memberFilter) and.push(memberFilter);

  const members = await db.member.findMany({
    where: { AND: and },
    take: MAX_ROWS,
    select: { id: true },
  });
  return members.map((m) => ({ personId: null, memberId: m.id }));
}
