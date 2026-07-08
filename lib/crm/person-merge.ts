/** Person merge engine (Phase 2B Campaign 1).
 *
 * Mirrors the Member merge philosophy (lib/member-merge.ts — referenced, never
 * invoked): re-point children, tombstone the loser via mergedIntoId + mergedAt,
 * never delete. Reversible beats tidy — collision rows (a ContactSource or
 * organization affiliation the survivor already has) STAY on the loser
 * tombstone instead of being deleted.
 *
 * HARD REFUSALS (locked at Gate 1 review):
 *   - both Persons have a linked Member → Member-level merge exists; this
 *     engine never invokes it silently.
 *   - both Persons carry different real clerkUserIds → two account holders,
 *     no operator override, no resolution path in the UI.
 *
 * The merge itself is ONE interactive $transaction; audit + engagement signals
 * fire after commit.
 */
import { Prisma } from '@prisma/client';
import type { Person } from '@prisma/client';
import { db } from '@/lib/db';
import { logEngagementEvent } from '@/lib/engagement';

/** Default survivor: verified email beats unverified, a real Clerk account
 *  beats none, older createdAt breaks ties. Operator can override in the UI. */
export function pickSurvivorDefault<
  T extends Pick<Person, 'id' | 'emailVerified' | 'clerkUserId' | 'createdAt'>,
>(a: T, b: T): T {
  if (a.emailVerified !== b.emailVerified) return a.emailVerified ? a : b;
  if (Boolean(a.clerkUserId) !== Boolean(b.clerkUserId)) return a.clerkUserId ? a : b;
  return a.createdAt <= b.createdAt ? a : b;
}

export type DuplicateMatchType = 'flagged' | 'email' | 'phone';

export type DuplicatePairIds = { aId: string; bId: string; matchType: DuplicateMatchType };

/** Order-insensitive pair identity — used for dedupe and dismissal matching. */
export function pairKey(x: string, y: string): string {
  return [x, y].sort().join('::');
}

/**
 * The merge queue: explicitly flagged pairs (potentialDuplicateOfId, set by
 * resolvePerson's unverified-email policy) plus cheap read-time detection —
 * same email case-insensitive, same phone — over the workspace's unmerged
 * Persons (capped at 500, same window as the People list; no background jobs).
 *
 * Dismissals persist as `person.duplicate_dismissed` audit events (zero-DDL by
 * design): a dismissed pair is excluded here whatever its match type, so it
 * does not resurface as an email/phone match after its flag is cleared.
 */
export async function findDuplicatePairs(workspaceId: string): Promise<DuplicatePairIds[]> {
  const dismissals = await db.auditEvent.findMany({
    where: { workspaceId, action: 'person.duplicate_dismissed' },
    select: { metadata: true },
  });
  const seen = new Set<string>();
  for (const d of dismissals) {
    const m = d.metadata as { personAId?: unknown; personBId?: unknown } | null;
    if (m && typeof m.personAId === 'string' && typeof m.personBId === 'string') {
      seen.add(pairKey(m.personAId, m.personBId));
    }
  }

  const persons = await db.person.findMany({
    where: { workspaceId, mergedIntoId: null },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: { id: true, email: true, phone: true, potentialDuplicateOfId: true },
  });

  const pairs: DuplicatePairIds[] = [];

  // 1. Explicit flags. A counterpart outside the scan window still counts, but
  //    a merged/deleted counterpart makes the flag stale — skip those pairs.
  const inWindow = new Set(persons.map((p) => p.id));
  const flagged = persons.filter((p) => p.potentialDuplicateOfId);
  const outsideIds = flagged
    .map((p) => p.potentialDuplicateOfId!)
    .filter((id) => !inWindow.has(id));
  const outside = outsideIds.length
    ? await db.person.findMany({
        where: { id: { in: outsideIds }, workspaceId, mergedIntoId: null },
        select: { id: true },
      })
    : [];
  const counterpartOk = new Set([...inWindow, ...outside.map((p) => p.id)]);
  for (const p of flagged) {
    const other = p.potentialDuplicateOfId!;
    if (!counterpartOk.has(other)) continue;
    const key = pairKey(p.id, other);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ aId: p.id, bId: other, matchType: 'flagged' });
  }

  // 2. Same email, case-insensitive. Groups pair against their oldest row.
  const byEmail = new Map<string, string[]>();
  for (const p of persons) {
    if (!p.email) continue;
    const k = p.email.toLowerCase();
    byEmail.set(k, [...(byEmail.get(k) ?? []), p.id]);
  }
  for (const ids of byEmail.values()) {
    for (let i = 1; i < ids.length; i++) {
      const key = pairKey(ids[0], ids[i]);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ aId: ids[0], bId: ids[i], matchType: 'email' });
    }
  }

  // 3. Same phone (exact stored value — normalization is 2B-later territory).
  const byPhone = new Map<string, string[]>();
  for (const p of persons) {
    if (!p.phone) continue;
    byPhone.set(p.phone, [...(byPhone.get(p.phone) ?? []), p.id]);
  }
  for (const ids of byPhone.values()) {
    for (let i = 1; i < ids.length; i++) {
      const key = pairKey(ids[0], ids[i]);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ aId: ids[0], bId: ids[i], matchType: 'phone' });
    }
  }

  return pairs;
}

export type PersonMergeError =
  | 'not_found'
  | 'same_person'
  | 'already_merged'
  | 'both_have_members'
  | 'two_linked_accounts';

export type PersonMergeResult =
  | { ok: true; survivorId: string; loserId: string; repointed: Record<string, number> }
  | { ok: false; error: PersonMergeError };

/**
 * Execute a Person merge. Loser's children move to the survivor; the survivor
 * enrich-fills its nulls from the loser (never overwrites a differing
 * non-null); the loser is tombstoned. All writes in one $transaction.
 */
export async function executePersonMerge(params: {
  workspaceId: string;
  survivorId: string;
  loserId: string;
  actorId: string;
}): Promise<PersonMergeResult> {
  const { workspaceId, survivorId, loserId, actorId } = params;
  if (survivorId === loserId) return { ok: false, error: 'same_person' };

  const [survivor, loser] = await Promise.all([
    db.person.findFirst({
      where: { id: survivorId, workspaceId },
      include: { members: { where: { mergedIntoId: null }, select: { id: true } } },
    }),
    db.person.findFirst({
      where: { id: loserId, workspaceId },
      include: { members: { where: { mergedIntoId: null }, select: { id: true } } },
    }),
  ]);
  if (!survivor || !loser) return { ok: false, error: 'not_found' };
  if (survivor.mergedIntoId || loser.mergedIntoId) return { ok: false, error: 'already_merged' };
  if (survivor.members.length > 0 && loser.members.length > 0) {
    return { ok: false, error: 'both_have_members' };
  }
  if (survivor.clerkUserId && loser.clerkUserId && survivor.clerkUserId !== loser.clerkUserId) {
    return { ok: false, error: 'two_linked_accounts' };
  }

  const repointed = await db.$transaction(async (tx) => {
    // ContactSource — @@unique([workspaceId, personId, source]): per-row
    // re-point; a source the survivor already has stays on the loser tombstone.
    const survivorSources = new Set(
      (
        await tx.contactSource.findMany({
          where: { personId: survivorId },
          select: { source: true },
        })
      ).map((r) => r.source),
    );
    const loserSources = await tx.contactSource.findMany({
      where: { personId: loserId },
      select: { id: true, source: true },
    });
    let contactSourcesMoved = 0;
    let contactSourcesKept = 0;
    for (const row of loserSources) {
      if (survivorSources.has(row.source)) {
        contactSourcesKept++;
        continue;
      }
      await tx.contactSource.update({ where: { id: row.id }, data: { personId: survivorId } });
      survivorSources.add(row.source);
      contactSourcesMoved++;
    }

    // PersonOrganization — @@unique([personId, organizationId]): same pattern.
    const survivorOrgs = new Set(
      (
        await tx.personOrganization.findMany({
          where: { personId: survivorId },
          select: { organizationId: true },
        })
      ).map((r) => r.organizationId),
    );
    const loserOrgs = await tx.personOrganization.findMany({
      where: { personId: loserId },
      select: { id: true, organizationId: true },
    });
    let affiliationsMoved = 0;
    let affiliationsKept = 0;
    for (const row of loserOrgs) {
      if (survivorOrgs.has(row.organizationId)) {
        affiliationsKept++;
        continue;
      }
      await tx.personOrganization.update({
        where: { id: row.id },
        data: { personId: survivorId },
      });
      survivorOrgs.add(row.organizationId);
      affiliationsMoved++;
    }

    // Bulk re-points — no personId uniques on these tables. personId column
    // ONLY; consent/status fields and the frozen consent writers are untouched.
    const engagement = await tx.memberEngagementEvent.updateMany({
      where: { workspaceId, personId: loserId },
      data: { personId: survivorId },
    });
    const channels = await tx.channelSubscription.updateMany({
      where: { workspaceId, personId: loserId },
      data: { personId: survivorId },
    });
    const suppressions = await tx.suppressionEntry.updateMany({
      where: { workspaceId, personId: loserId },
      data: { personId: survivorId },
    });
    const applications = await tx.application.updateMany({
      where: { workspaceId, personId: loserId },
      data: { personId: survivorId },
    });
    const members = await tx.member.updateMany({
      where: { workspaceId, personId: loserId },
      data: { personId: survivorId },
    });
    const rsvps = await tx.rSVP.updateMany({
      where: { workspaceId, personId: loserId },
      data: { personId: survivorId },
    });

    // Other flagged duplicates that pointed at the loser now point at the survivor.
    await tx.person.updateMany({
      where: { workspaceId, potentialDuplicateOfId: loserId, id: { notIn: [survivorId, loserId] } },
      data: { potentialDuplicateOfId: survivorId },
    });

    // Enrich-fill the survivor. email carries its emailVerified state as a
    // pair; a same-address proof on the loser's side upgrades the survivor.
    const fill: Prisma.PersonUncheckedUpdateInput = {};
    if (!survivor.email && loser.email) {
      fill.email = loser.email;
      fill.emailVerified = loser.emailVerified;
    } else if (
      survivor.email &&
      loser.email &&
      survivor.email.toLowerCase() === loser.email.toLowerCase() &&
      loser.emailVerified &&
      !survivor.emailVerified
    ) {
      fill.emailVerified = true;
    }
    if (!survivor.phone && loser.phone) fill.phone = loser.phone;
    if (!survivor.firstName && loser.firstName) fill.firstName = loser.firstName;
    if (!survivor.lastName && loser.lastName) fill.lastName = loser.lastName;
    const roles = Array.from(new Set([...survivor.roles, ...loser.roles]));
    if (roles.length !== survivor.roles.length) fill.roles = roles;
    if (!survivor.clerkUserId && loser.clerkUserId) {
      // (workspaceId, clerkUserId) is unique — free the loser's slot first.
      // The transfer is the one non-reversible edge of a merge; the audit
      // metadata below records it.
      await tx.person.update({ where: { id: loserId }, data: { clerkUserId: null } });
      fill.clerkUserId = loser.clerkUserId;
    }
    if (survivor.potentialDuplicateOfId === loserId) fill.potentialDuplicateOfId = null;
    if (Object.keys(fill).length > 0) {
      await tx.person.update({ where: { id: survivorId }, data: fill });
    }

    // Tombstone — reversible by nulling the pointer (mirrors member-merge).
    await tx.person.update({
      where: { id: loserId },
      data: { mergedIntoId: survivorId, mergedAt: new Date(), potentialDuplicateOfId: null },
    });

    return {
      contactSourcesMoved,
      contactSourcesKept,
      affiliationsMoved,
      affiliationsKept,
      engagementEvents: engagement.count,
      channelSubscriptions: channels.count,
      suppressionEntries: suppressions.count,
      applications: applications.count,
      members: members.count,
      rsvps: rsvps.count,
    };
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId,
      action: 'person.merged',
      entityType: 'PERSON',
      entityId: loserId,
      metadata: { survivorId, clerkUserIdTransferred: !survivor.clerkUserId && Boolean(loser.clerkUserId), ...repointed },
    },
  });
  void logEngagementEvent({
    workspaceId,
    personId: survivorId,
    eventType: 'merged',
    metadata: { loserId },
  });

  return { ok: true, survivorId, loserId, repointed };
}
