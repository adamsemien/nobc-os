/** Ingestion pipeline glue — the one place that joins the pure pieces to the DB:
 *  build the identity index from a workspace's live members → resolve the batch →
 *  plan → execute. Shared by every source entry point (CSV commit, Producer ingest,
 *  future beehiiv/AC). Workspace-scoped throughout. */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { NormalizedContact } from '../types';
import { buildContactIndex, resolveBatch } from './identity';
import { planPersist, executePersist, type BlockState, type PersistPlan, type PersistResult } from './persist';
import { normalizePhone, normalizeInstagram } from '@/lib/watchlist';
import { channelIdentifier } from '@/lib/comms/can-send';

export async function ingestNormalizedContacts(
  db: PrismaClient,
  workspaceId: string,
  contacts: NormalizedContact[],
): Promise<{ plan: PersistPlan; result: PersistResult }> {
  // Index from this workspace's live (non-merged) members — read-only, workspace-scoped.
  const members = await db.member.findMany({
    where: { workspaceId, mergedIntoId: null },
    select: { id: true, email: true, phone: true, instagram: true },
  });
  const index = buildContactIndex(
    members.map((m) => ({ contactId: m.id, email: m.email, phone: m.phone, instagram: m.instagram })),
  );
  const decisions = resolveBatch(contacts, index);
  const blockState = await checkBlockState(db, workspaceId, contacts);
  const plan = planPersist(contacts, decisions, blockState);
  const result = await executePersist(db, workspaceId, plan);
  return { plan, result };
}

/** Suppression-before-import guard (Slice 2 Phase 1). Batch-checks every contact's
 *  email/phone/instagram against RedList, WatchList BLOCKED, and SuppressionEntry
 *  BEFORE planning — three whole-table/whole-set reads, not N+1 per contact. Returns
 *  plain index sets so planPersist stays a pure function (see persist.ts BlockState).
 *
 *  ACCESS axis (RedList, WatchList BLOCKED) wins over CHANNEL axis (SuppressionEntry)
 *  when both match — a contact is never double-flagged in a way that would let a
 *  channel-only signal get treated as an access block. See planPersist's create
 *  branch for how each flag is applied. */
async function checkBlockState(
  db: PrismaClient,
  workspaceId: string,
  contacts: NormalizedContact[],
): Promise<BlockState> {
  const accessBlockedIndices = new Set<number>();
  const channelSuppressedIndices = new Set<number>();

  const emails = [
    ...new Set(contacts.map((c) => c.email?.trim().toLowerCase()).filter((e): e is string => !!e)),
  ];

  const [redListEntries, watchListBlocked, emailSuppressions] = await Promise.all([
    emails.length
      ? db.redList.findMany({ where: { workspaceId, email: { in: emails } }, select: { email: true } })
      : Promise.resolve([]),
    db.watchList.findMany({
      where: { workspaceId, type: 'BLOCKED', deletedAt: null },
      select: { matchEmail: true, matchPhone: true, matchInstagram: true },
    }),
    emails.length
      ? db.suppressionEntry.findMany({
          where: { workspaceId, channel: 'EMAIL', identifier: { in: emails } },
          select: { identifier: true },
        })
      : Promise.resolve([]),
  ]);

  const redListedEmails = new Set(
    redListEntries.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e),
  );
  const blockedEmails = new Set(
    watchListBlocked.map((w) => w.matchEmail?.toLowerCase()).filter((e): e is string => !!e),
  );
  const blockedPhones = new Set(
    watchListBlocked.map((w) => (w.matchPhone ? normalizePhone(w.matchPhone) : null)).filter((p): p is string => !!p),
  );
  const blockedInstagram = new Set(
    watchListBlocked
      .map((w) => (w.matchInstagram ? normalizeInstagram(w.matchInstagram) : null))
      .filter((h): h is string => !!h),
  );
  const suppressedEmailIdentifiers = new Set(emailSuppressions.map((s) => s.identifier));

  // Phone suppression check needs E.164-normalized identifiers (channelIdentifier's SMS
  // branch matches canSend's own read path exactly — see PersonConsentPanel wiring,
  // Slice 1). Read-only use of a frozen dependency; not a modification.
  const phoneIdentifiers = [
    ...new Set(
      contacts
        .map((c) => (c.phone ? channelIdentifier({ phone: c.phone }, 'SMS') : null))
        .filter((p): p is string => !!p),
    ),
  ];
  const phoneSuppressions = phoneIdentifiers.length
    ? await db.suppressionEntry.findMany({
        where: { workspaceId, channel: 'SMS', identifier: { in: phoneIdentifiers } },
        select: { identifier: true },
      })
    : [];
  const suppressedPhoneIdentifiers = new Set(phoneSuppressions.map((s) => s.identifier));

  contacts.forEach((c, i) => {
    const email = c.email?.trim().toLowerCase() || null;
    const phone = c.phone?.trim() || null;
    const normalizedPhone = phone ? normalizePhone(phone) : null;
    const instagram = c.instagram ? normalizeInstagram(c.instagram) : null;
    const phoneId = phone ? channelIdentifier({ phone }, 'SMS') : null;

    const accessBlocked =
      (email && redListedEmails.has(email)) ||
      (email && blockedEmails.has(email)) ||
      (normalizedPhone && blockedPhones.has(normalizedPhone)) ||
      (instagram && blockedInstagram.has(instagram));
    if (accessBlocked) {
      accessBlockedIndices.add(i);
      return; // access block wins outright — never also flagged channel-suppressed
    }

    const channelSuppressed =
      (email && suppressedEmailIdentifiers.has(email)) || (phoneId && suppressedPhoneIdentifiers.has(phoneId));
    if (channelSuppressed) channelSuppressedIndices.add(i);
  });

  return { accessBlockedIndices, channelSuppressedIndices };
}

/** True when the failure is "the Contact-spine schema isn't applied to this DB yet"
 *  (missing table P2021 / missing column P2022) — i.e. the coordinated DB window hasn't
 *  been run. Lets a route return a clean 503 instead of a 500 before the window. */
export function isSchemaNotApplied(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

export const SCHEMA_NOT_APPLIED_MESSAGE =
  'Contact-spine schema is not applied to the database yet. Run the DB window first ' +
  '(see _context/_audit/CONTACT-SPINE-DB-WINDOW.md), then retry.';
