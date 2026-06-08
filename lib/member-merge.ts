import { db } from '@/lib/db';
import { logEngagementEvent } from '@/lib/engagement';

/**
 * Soft-merge of duplicate person records.
 *
 * HARD INVARIANT: a merge re-points `memberId` ONLY. It never touches an RSVP's
 * event association (`eventId`), nor any other domain field — a person's
 * attendance history stays bound to its events; only its owner changes. The loser
 * row is tombstoned via `mergedIntoId` (status untouched, so self-lookup keeps
 * working), making the merge fully reversible by nulling the pointer.
 *
 * Candidate policy: exact normalized-email matches are auto-mergeable; phone and
 * instagram matches require operator confirmation and are NEVER auto-merged.
 */

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}
function normPhone(p: string): string {
  return p.replace(/[\s\-().+]/g, '').replace(/^1(\d{10})$/, '$1');
}
/** Normalize an instagram handle: strip the @, any profile-URL wrapper, and trailing
 *  slash/query, lowercased. Returns '' for input that isn't a usable handle. */
function normInstagram(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '');
}

export type MergeMatchType = 'email_exact' | 'phone' | 'instagram';

export type MergeCandidate = {
  memberId: string;
  email: string;
  firstName: string;
  lastName: string;
  matchType: MergeMatchType;
  /** true ONLY for exact-normalized-email matches. */
  autoMergeable: boolean;
};

/** Find potential duplicate persons of `memberId` within its workspace. */
export async function findMergeCandidates(
  workspaceId: string,
  memberId: string,
): Promise<MergeCandidate[]> {
  const target = await db.member.findFirst({
    where: { id: memberId, workspaceId },
    select: { id: true, email: true, phone: true, instagram: true },
  });
  if (!target) return [];
  const targetPhone = target.phone ? normPhone(target.phone) : null;
  const targetInstagram = target.instagram ? normInstagram(target.instagram) : '';

  // Exact-normalized-email duplicates → auto-mergeable. The (workspaceId, email)
  // unique constraint is on the stored value, so case-variant rows can coexist.
  const emailMatches = await db.member.findMany({
    where: {
      workspaceId,
      mergedIntoId: null,
      id: { not: memberId },
      email: { equals: target.email, mode: 'insensitive' },
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const candidates: MergeCandidate[] = emailMatches.map((m) => ({
    memberId: m.id,
    email: m.email,
    firstName: m.firstName,
    lastName: m.lastName,
    matchType: 'email_exact',
    autoMergeable: true,
  }));

  // Soft signals below are operator-confirm only (normalized app-side; never
  // auto-merged). `seen` is shared so a member already surfaced by a stronger signal
  // (email > phone > instagram) is not listed twice.
  const seen = new Set(candidates.map((c) => c.memberId));

  // Phone matches.
  if (targetPhone) {
    const phoneRows = await db.member.findMany({
      where: { workspaceId, mergedIntoId: null, id: { not: memberId }, phone: { not: null } },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true },
    });
    for (const m of phoneRows) {
      if (seen.has(m.id)) continue;
      if (m.phone && normPhone(m.phone) === targetPhone) {
        candidates.push({
          memberId: m.id,
          email: m.email,
          firstName: m.firstName,
          lastName: m.lastName,
          matchType: 'phone',
          autoMergeable: false,
        });
        seen.add(m.id);
      }
    }
  }

  // Instagram matches (Member.instagram landed in PR2 — handle normalized app-side).
  if (targetInstagram) {
    const igRows = await db.member.findMany({
      where: { workspaceId, mergedIntoId: null, id: { not: memberId }, instagram: { not: null } },
      select: { id: true, email: true, firstName: true, lastName: true, instagram: true },
    });
    for (const m of igRows) {
      if (seen.has(m.id)) continue;
      if (m.instagram && normInstagram(m.instagram) === targetInstagram) {
        candidates.push({
          memberId: m.id,
          email: m.email,
          firstName: m.firstName,
          lastName: m.lastName,
          matchType: 'instagram',
          autoMergeable: false,
        });
        seen.add(m.id);
      }
    }
  }

  return candidates;
}

export type MergeResult =
  | {
      ok: true;
      canonicalId: string;
      loserId: string;
      repointed: {
        rsvpsRepointed: number;
        rsvpsArchived: number;
        tickets: number;
        waitlist: number;
        engagement: number;
        surveys: number;
        referrals: number;
      };
    }
  | { ok: false; error: string };

/**
 * Execute a merge: re-point the loser's history onto the canonical record and
 * tombstone the loser. Re-points `memberId` only; never alters event associations.
 */
export async function executeMerge(params: {
  workspaceId: string;
  canonicalId: string;
  loserId: string;
  actorId: string;
  reason?: string;
}): Promise<MergeResult> {
  const { workspaceId, canonicalId, loserId, actorId, reason } = params;
  if (canonicalId === loserId) return { ok: false, error: 'cannot merge a member into itself' };

  const [canonical, loser] = await Promise.all([
    db.member.findFirst({ where: { id: canonicalId, workspaceId }, select: { id: true } }),
    db.member.findFirst({ where: { id: loserId, workspaceId }, select: { id: true, mergedIntoId: true } }),
  ]);
  if (!canonical) return { ok: false, error: 'canonical not found in workspace' };
  if (!loser) return { ok: false, error: 'loser not found in workspace' };
  if (loser.mergedIntoId) return { ok: false, error: 'loser already merged' };

  // RSVP: collision guard on @@unique([workspaceId, eventId, memberId]).
  // memberId is re-pointed; eventId is NEVER in the update payload.
  const canonicalEventIds = new Set(
    (
      await db.rSVP.findMany({ where: { workspaceId, memberId: canonicalId }, select: { eventId: true } })
    ).map((r) => r.eventId),
  );
  const loserRsvps = await db.rSVP.findMany({
    where: { workspaceId, memberId: loserId },
    select: { id: true, eventId: true },
  });
  let rsvpsRepointed = 0;
  let rsvpsArchived = 0;
  for (const r of loserRsvps) {
    if (canonicalEventIds.has(r.eventId)) {
      // Canonical already attends this event — archive the loser's duplicate,
      // never blind-update (would throw on the unique constraint).
      await db.rSVP.update({
        where: { id: r.id },
        data: { status: 'DECLINED', ticketStatus: 'merged_duplicate' },
      });
      rsvpsArchived++;
    } else {
      await db.rSVP.update({ where: { id: r.id }, data: { memberId: canonicalId } });
      canonicalEventIds.add(r.eventId);
      rsvpsRepointed++;
    }
  }

  // Non-unique relations: bulk re-point memberId only.
  const tickets = await db.ticket.updateMany({
    where: { workspaceId, memberId: loserId },
    data: { memberId: canonicalId },
  });
  const waitlist = await db.waitlistEntry.updateMany({
    where: { workspaceId, memberId: loserId },
    data: { memberId: canonicalId },
  });
  const engagement = await db.memberEngagementEvent.updateMany({
    where: { workspaceId, memberId: loserId },
    data: { memberId: canonicalId },
  });
  const surveys = await db.surveyResponse.updateMany({
    where: { workspaceId, memberId: loserId },
    data: { memberId: canonicalId },
  });
  const referrals = await db.member.updateMany({
    where: { workspaceId, referredByMemberId: loserId },
    data: { referredByMemberId: canonicalId },
  });

  // Tombstone the loser (status untouched → self-lookup still resolves; reversible).
  await db.member.update({
    where: { id: loserId },
    data: { mergedIntoId: canonicalId, mergedAt: new Date() },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId,
      action: 'member.merged',
      entityType: 'MEMBER',
      entityId: loserId,
      metadata: { canonicalId, reason: reason ?? null },
    },
  });
  void logEngagementEvent({
    workspaceId,
    memberId: canonicalId,
    eventType: 'merged',
    metadata: { loserId, reason: reason ?? null },
  });

  return {
    ok: true,
    canonicalId,
    loserId,
    repointed: {
      rsvpsRepointed,
      rsvpsArchived,
      tickets: tickets.count,
      waitlist: waitlist.count,
      engagement: engagement.count,
      surveys: surveys.count,
      referrals: referrals.count,
    },
  };
}

/**
 * Auto-merge ONLY exact-normalized-email duplicates of `memberId`. Picks the
 * canonical record (approved-preferred, then older) and merges the other into it.
 * Phone/instagram candidates are deliberately ignored here — they require an
 * explicit operator-confirmed `executeMerge`.
 */
export async function autoMergeExactEmailDuplicates(params: {
  workspaceId: string;
  memberId: string;
  actorId: string;
}): Promise<MergeResult[]> {
  const { workspaceId, memberId, actorId } = params;
  const candidates = (await findMergeCandidates(workspaceId, memberId)).filter((c) => c.autoMergeable);
  const results: MergeResult[] = [];
  for (const c of candidates) {
    const [a, b] = await Promise.all([
      db.member.findUnique({ where: { id: memberId }, select: { id: true, approved: true, createdAt: true } }),
      db.member.findUnique({ where: { id: c.memberId }, select: { id: true, approved: true, createdAt: true } }),
    ]);
    if (!a || !b) continue;
    const canonical = a.approved !== b.approved ? (a.approved ? a : b) : a.createdAt <= b.createdAt ? a : b;
    const loser = canonical.id === a.id ? b : a;
    results.push(
      await executeMerge({ workspaceId, canonicalId: canonical.id, loserId: loser.id, actorId, reason: 'auto:email_exact' }),
    );
  }
  return results;
}
