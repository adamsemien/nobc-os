/** Ingestion persist layer — turn resolver decisions into Member + ContactSource rows.
 *
 *  Two halves, mirroring the resolver's pure/impure split:
 *    • planPersist()    — PURE. Maps (contacts, decisions) → an ordered plan of
 *                         create / attach / defer ops. All the hard logic lives here
 *                         (provisional→member linkage, email-required gate, review
 *                         deferral) so it unit-tests without a DB.
 *    • executePersist() — THIN. Mechanically applies a plan via Prisma in a transaction:
 *                         mints the synthetic clerkUserId + QR + provenance on creates,
 *                         unions roles/tags on attaches, upserts ContactSource provenance.
 *
 *  KNOWN LIMITATION (surfaced, not hacked): `Member.email` is NOT NULL + unique per
 *  workspace and every Member needs a (synthetic) clerkUserId. A contact with no email
 *  therefore cannot become a Member today — those CREATE decisions are DEFERRED with
 *  reason 'no_email' rather than fabricating a placeholder address. Lifting this (so a
 *  phone/IG-only "met in the wild" lead can persist) is an OPEN schema decision: make
 *  Member.email nullable, or add a lighter Contact row. See CONTACT-SPINE-DB-WINDOW.md. */

import { randomUUID } from 'crypto';
import { WatchListType } from '@prisma/client';
import type { ContactRole, ContactSourceSystem, PrismaClient } from '@prisma/client';
import type { NormalizedContact } from '../types';
import type { ResolutionDecision } from './identity';
import { generateMemberQrCode } from '@/lib/member-qr';

export type DeferReason = 'needs_review' | 'no_email' | 'unresolved_provisional';

/** Provenance written to ContactSource on create + attach. */
export type SourceRef = {
  source: ContactSourceSystem;
  externalId: string | null;
  rawSnapshot: unknown;
};

/** The semantic fields a new Member carries from a source (the execute layer adds the
 *  mechanical bits: workspaceId, synthetic clerkUserId, QR, status, provenance). */
export type NewMemberFields = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roles: ContactRole[];
  tags: string[];
};

export type PersistPlanItem =
  | {
      action: 'create';
      contactIndex: number;
      /** Links this create to later same-batch rows that resolved to its provisional id. */
      provisionalId: string;
      member: NewMemberFields;
      source: SourceRef;
    }
  | {
      action: 'attach';
      contactIndex: number;
      target: { kind: 'existing'; memberId: string } | { kind: 'provisional'; provisionalId: string };
      addRoles: ContactRole[];
      addTags: string[];
      /** Incoming canonical email (lowercased) — used by executePersist to propagate a
       *  workspace block onto the matched member. Null when the row carried no email. */
      email: string | null;
      source: SourceRef;
    }
  | { action: 'defer'; contactIndex: number; reason: DeferReason };

export type PersistPlan = {
  items: PersistPlanItem[];
  summary: {
    create: number;
    attach: number;
    defer: number;
    deferByReason: Record<DeferReason, number>;
  };
};

const roleHintToRoles = (c: NormalizedContact): ContactRole[] =>
  c.roleHint ? [c.roleHint as ContactRole] : [];

/** PURE. Build the persist plan from a batch of contacts and their resolver decisions.
 *  `decisions[i]` must be the decision for `contacts[i]` (same order resolveBatch returns). */
export function planPersist(
  contacts: NormalizedContact[],
  decisions: ResolutionDecision[],
): PersistPlan {
  // A provisional create only materializes if its contact has an email (Member.email
  // is required). Pre-compute the set that WILL be created so an attach pointing at a
  // provisional that ends up deferred is itself deferred rather than dangling.
  const willCreate = new Set<string>();
  decisions.forEach((d, i) => {
    if (d.kind === 'create' && canBeMember(contacts[i])) willCreate.add(d.provisionalId);
  });

  const items: PersistPlanItem[] = [];
  decisions.forEach((decision, i) => {
    const c = contacts[i];
    const source: SourceRef = {
      source: c.source as ContactSourceSystem,
      externalId: c.externalId || null,
      rawSnapshot: c.rawSnapshot,
    };

    if (decision.kind === 'create') {
      if (!canBeMember(c)) {
        items.push({ action: 'defer', contactIndex: i, reason: 'no_email' });
        return;
      }
      items.push({
        action: 'create',
        contactIndex: i,
        provisionalId: decision.provisionalId,
        member: {
          email: c.email!.trim().toLowerCase(),
          firstName: c.firstName?.trim() || '',
          lastName: c.lastName?.trim() || '',
          phone: c.phone ?? null,
          roles: roleHintToRoles(c),
          tags: dedupeStrings(c.tags ?? []),
        },
        source,
      });
      return;
    }

    if (decision.kind === 'match') {
      const id = decision.contactId;
      const target = id.startsWith('provisional:')
        ? ({ kind: 'provisional', provisionalId: id } as const)
        : ({ kind: 'existing', memberId: id } as const);
      // An attach onto a provisional that won't be created can't resolve → defer.
      if (target.kind === 'provisional' && !willCreate.has(target.provisionalId)) {
        items.push({ action: 'defer', contactIndex: i, reason: 'unresolved_provisional' });
        return;
      }
      items.push({
        action: 'attach',
        contactIndex: i,
        target,
        addRoles: roleHintToRoles(c),
        addTags: dedupeStrings(c.tags ?? []),
        email: c.email?.trim().toLowerCase() || null,
        source,
      });
      return;
    }

    // review → operator decides in the merge-review UI; never auto-persisted.
    items.push({ action: 'defer', contactIndex: i, reason: 'needs_review' });
  });

  return { items, summary: summarize(items) };
}

export type PersistResult = {
  createdMemberIds: string[];
  attachedMemberIds: string[];
  deferred: number;
  /** Per input contact: the resolved member id, or null if deferred. */
  memberIdByContactIndex: (string | null)[];
};

/** THIN. Apply a plan in a single transaction. Creates mint a synthetic clerkUserId +
 *  QR + field provenance (mirrors the manual Add-Member path); attaches union roles/tags
 *  and upsert the ContactSource provenance row. Workspace-scoped throughout.
 *
 *  SUPPRESSION-BEFORE-IMPORT: before any write, the workspace's block state (RedList +
 *  members already `redListed` + WatchList BLOCKED) is collapsed to an email set. A
 *  create whose email is blocked is still persisted (lossless) but flagged `redListed`
 *  so it is never a clean sendable GUEST; an attach propagates the flag onto the
 *  canonical member. An existing block is NEVER cleared on re-import. */
export async function executePersist(
  db: PrismaClient,
  workspaceId: string,
  plan: PersistPlan,
): Promise<PersistResult> {
  const createdMemberIds: string[] = [];
  const attachedMemberIds: string[] = [];
  const memberIdByContactIndex: (string | null)[] = new Array(
    plan.items.length ? Math.max(...plan.items.map((it) => it.contactIndex)) + 1 : 0,
  ).fill(null);
  const provisionalToMemberId = new Map<string, string>();
  const now = new Date();

  await db.$transaction(async (tx) => {
    // Suppression-before-import: collapse the workspace's block surfaces to one email set,
    // once per run inside the txn so every create/attach sees a consistent snapshot.
    const blockedEmails = await buildBlockedEmailSet(tx, workspaceId);

    for (const item of plan.items) {
      if (item.action === 'defer') continue;

      if (item.action === 'create') {
        const m = item.member;
        const blocked = blockedEmails.has(m.email);
        const member = await tx.member.create({
          data: {
            workspaceId,
            // No Clerk account for an imported contact — synthetic, unique id (same
            // pattern as manual:<uuid> / applicant:<id> in the existing create paths).
            clerkUserId: `import:${item.source.source}:${randomUUID()}`,
            email: m.email,
            firstName: m.firstName,
            lastName: m.lastName,
            phone: m.phone,
            status: 'GUEST',
            // A blocked email is still persisted (lossless) but flagged so it is never
            // treated as a clean sendable GUEST.
            redListed: blocked,
            roles: m.roles,
            tags: m.tags,
            memberQrCode: generateMemberQrCode(),
            fieldProvenance: provenanceFor(m, item.source.source, now) as object,
          },
          select: { id: true },
        });
        await upsertContactSource(tx, workspaceId, member.id, item.source, now);
        provisionalToMemberId.set(item.provisionalId, member.id);
        createdMemberIds.push(member.id);
        memberIdByContactIndex[item.contactIndex] = member.id;
        continue;
      }

      // attach
      const memberId =
        item.target.kind === 'existing'
          ? item.target.memberId
          : provisionalToMemberId.get(item.target.provisionalId);
      if (!memberId) continue; // provisional never created (shouldn't happen — planner guards)

      // Propagate a workspace block onto the canonical member. Only ever SET the flag —
      // the key is omitted when not blocked so an existing redListed member is never
      // cleared on re-import.
      const attachBlocked = item.email ? blockedEmails.has(item.email) : false;
      if (item.addRoles.length || item.addTags.length || attachBlocked) {
        const current = await tx.member.findUnique({
          where: { id: memberId },
          select: { roles: true, tags: true },
        });
        if (current) {
          await tx.member.update({
            where: { id: memberId },
            data: {
              roles: unionEnum(current.roles, item.addRoles),
              tags: dedupeStrings([...current.tags, ...item.addTags]),
              ...(attachBlocked ? { redListed: true } : {}),
            },
          });
        }
      }
      await upsertContactSource(tx, workspaceId, memberId, item.source, now);
      attachedMemberIds.push(memberId);
      memberIdByContactIndex[item.contactIndex] = memberId;
    }
  });

  return {
    createdMemberIds,
    attachedMemberIds,
    deferred: plan.summary.defer,
    memberIdByContactIndex,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────────

/** A contact can become a Member iff it has an email (the required, unique identity key). */
function canBeMember(c: NormalizedContact): boolean {
  return !!(c.email && c.email.trim());
}

/** Emails blocked from a clean import in this workspace, unioned from the three block
 *  surfaces: RedList entries, members already flagged `redListed`, and BLOCKED WatchList
 *  rows (non-deleted). Canonicalized (trimmed, lowercased) to match the create/attach
 *  email keys. Read inside the import transaction for a consistent snapshot. */
async function buildBlockedEmailSet(
  tx: Pick<PrismaClient, 'redList' | 'member' | 'watchList'>,
  workspaceId: string,
): Promise<Set<string>> {
  const [redList, flaggedMembers, watchBlocked] = await Promise.all([
    tx.redList.findMany({ where: { workspaceId }, select: { email: true } }),
    tx.member.findMany({ where: { workspaceId, redListed: true }, select: { email: true } }),
    tx.watchList.findMany({
      where: { workspaceId, type: WatchListType.BLOCKED, deletedAt: null },
      select: { matchEmail: true },
    }),
  ]);
  const set = new Set<string>();
  const add = (email: string | null) => {
    const c = email?.trim().toLowerCase();
    if (c) set.add(c);
  };
  redList.forEach((r) => add(r.email));
  flaggedMembers.forEach((m) => add(m.email));
  watchBlocked.forEach((w) => add(w.matchEmail));
  return set;
}

async function upsertContactSource(
  tx: Pick<PrismaClient, 'contactSource'>,
  workspaceId: string,
  memberId: string,
  source: SourceRef,
  now: Date,
): Promise<void> {
  await tx.contactSource.upsert({
    where: { workspaceId_memberId_source: { workspaceId, memberId, source: source.source } },
    create: {
      workspaceId,
      memberId,
      source: source.source,
      externalId: source.externalId,
      rawSnapshot: (source.rawSnapshot ?? undefined) as object | undefined,
      firstSeenAt: now,
      lastSyncedAt: now,
    },
    update: {
      externalId: source.externalId,
      rawSnapshot: (source.rawSnapshot ?? undefined) as object | undefined,
      lastSyncedAt: now,
    },
  });
}

function provenanceFor(m: NewMemberFields, source: ContactSourceSystem, now: Date): Record<string, unknown> {
  const syncedAt = now.toISOString();
  const stamp = (value: unknown) => ({ value, source: `import:${source}`, confidence: 1, syncedAt });
  const p: Record<string, unknown> = {
    firstName: stamp(m.firstName),
    lastName: stamp(m.lastName),
    email: stamp(m.email),
  };
  if (m.phone) p.phone = stamp(m.phone);
  return p;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function unionEnum(current: ContactRole[], add: ContactRole[]): ContactRole[] {
  return [...new Set([...current, ...add])];
}

function summarize(items: PersistPlanItem[]): PersistPlan['summary'] {
  const deferByReason: Record<DeferReason, number> = {
    needs_review: 0,
    no_email: 0,
    unresolved_provisional: 0,
  };
  let create = 0;
  let attach = 0;
  let defer = 0;
  for (const it of items) {
    if (it.action === 'create') create++;
    else if (it.action === 'attach') attach++;
    else {
      defer++;
      deferByReason[it.reason]++;
    }
  }
  return { create, attach, defer, deferByReason };
}
