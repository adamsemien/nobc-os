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
import type { ContactRole, ContactSourceSystem, PrismaClient } from '@prisma/client';
import type { NormalizedContact } from '../types';
import type { ResolutionDecision } from './identity';
import { generateMemberQrCode } from '@/lib/member-qr';
import { syncMemberChannelConsent } from '@/lib/comms/consent-sync';
// Dynamically imported inside linkPersonSpine (not statically here): resolve-person.ts
// pulls in @/lib/db, which constructs a real Neon Prisma client at module load. A static
// import here would drag that into planPersist's import graph too, breaking the "PURE,
// unit-tests without a DB" property this module's header (above) promises for every
// caller — including tests that only ever exercise planPersist.

export type DeferReason =
  | 'needs_review'
  | 'no_email'
  | 'unresolved_provisional'
  /** Matches an existing SuppressionEntry (channel axis) with no access-axis block.
   *  Routed to review rather than access-blocked, so a hard bounce / unsubscribe /
   *  complaint never gets conflated into redListed (LOCKED LAW, lib/comms/suppression.ts). */
  | 'suppressed_identity';

/** Contact-array indices flagged by a pre-import block check (lib/connectors/ingest/run.ts),
 *  computed against RedList, WatchList BLOCKED, and SuppressionEntry before planning. Kept as
 *  plain index sets (not a DB call) so planPersist stays pure and unit-testable without a DB. */
export type BlockState = {
  /** ACCESS axis — RedList or WatchList BLOCKED. A create for one of these indices still
   *  happens, but lands with Member.redListed = true, never as a clean sendable GUEST. */
  accessBlockedIndices: Set<number>;
  /** CHANNEL axis — an existing SuppressionEntry with no access-axis block. Diverted to
   *  review (defer) rather than silently created as a clean GUEST. */
  channelSuppressedIndices: Set<number>;
};

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
  /** ACCESS-axis block carried from BlockState — see PersistPlanItem create branch. */
  redListed: boolean;
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
 *  `decisions[i]` must be the decision for `contacts[i]` (same order resolveBatch returns).
 *  `blockState` is REQUIRED (not defaulted) so a caller can never silently skip the
 *  suppression-before-import guard by forgetting to pass it — see run.ts's checkBlockState. */
export function planPersist(
  contacts: NormalizedContact[],
  decisions: ResolutionDecision[],
  blockState: BlockState,
): PersistPlan {
  // A provisional create only materializes if its contact has an email (Member.email
  // is required) AND isn't diverted to review by a channel suppression. Pre-compute the
  // set that WILL be created so an attach pointing at a provisional that ends up
  // deferred is itself deferred rather than dangling.
  const willCreate = new Set<string>();
  decisions.forEach((d, i) => {
    if (
      d.kind === 'create' &&
      canBeMember(contacts[i]) &&
      !(blockState.channelSuppressedIndices.has(i) && !blockState.accessBlockedIndices.has(i))
    ) {
      willCreate.add(d.provisionalId);
    }
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
      const accessBlocked = blockState.accessBlockedIndices.has(i);
      // Channel suppression (hard bounce / unsubscribe / complaint) never mints redListed
      // — that would conflate the CHANNEL axis into the ACCESS axis (LOCKED LAW). Instead
      // it's diverted to review, same as any other identity ambiguity.
      if (blockState.channelSuppressedIndices.has(i) && !accessBlocked) {
        items.push({ action: 'defer', contactIndex: i, reason: 'suppressed_identity' });
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
          // RedList / WatchList BLOCKED match — create anyway (so the operator can see
          // them, e.g. in the merge/review surfaces) but never as a clean sendable GUEST.
          redListed: accessBlocked,
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
 *  and upsert the ContactSource provenance row. Workspace-scoped throughout. */
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
    for (const item of plan.items) {
      if (item.action === 'defer') continue;

      if (item.action === 'create') {
        const m = item.member;
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
            roles: m.roles,
            tags: m.tags,
            redListed: m.redListed,
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

      if (item.addRoles.length || item.addTags.length) {
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
            },
          });
        }
      }
      await upsertContactSource(tx, workspaceId, memberId, item.source, now);
      attachedMemberIds.push(memberId);
      memberIdByContactIndex[item.contactIndex] = memberId;
    }
  });

  // Person-spine wiring (CRM spine Phase 2A dependency, Slice 2 Phase 1 scope: CREATE
  // only — an attach target is an existing Member, and every current Member-creation
  // path already wires personId, so an attach's Member is expected to carry one
  // already; backfilling legacy personId-less Members is a separate, out-of-scope
  // concern). Runs AFTER the transaction commits, sequentially, one contact at a time
  // — resolvePerson() owns its own DB access (lib/crm/resolve-person.ts) and is not a
  // `tx`-scoped call, so it must not run nested inside the transaction above: an
  // in-batch failure there rolls back every Member create via `tx`, but a Person
  // mint that already ran on resolvePerson's own connection would NOT roll back with
  // it, orphaning a Person with no Member. Sequenced here (same request, same
  // executePersist call — not a backfill job) so every created contact is
  // Person-spine-visible before the import route responds. Non-fatal per item: the
  // CRM spine must never turn an otherwise-successful import into a failed one.
  for (const item of plan.items) {
    const memberId = memberIdByContactIndex[item.contactIndex];
    if (!memberId) continue;
    if (item.action === 'create') {
      await linkPersonSpine(db, workspaceId, memberId, item);
    }
    // Consent floor (reconciliation Phase 1): every imported contact — created
    // OR attached — re-converges through the single writer. Creates get
    // visible, fail-closed PENDING ChannelSubscription rows (never sendable
    // until an explicit signal arrives); attaches re-converge the existing
    // member's cluster so an attach never leaves consent keyings divergent.
    // After the spine link so the person keying lands too. Fire-and-forget
    // (self-catching).
    void syncMemberChannelConsent({ workspaceId, memberId, context: 'import' });
  }

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

/** Resolve/link the Person spine for a just-created import Member (Slice 2 Phase 1,
 *  DoD item 2). Mirrors the established pattern (lib/member-identity.ts's
 *  attachPersonSpine, app/api/operator/members/create/route.ts) — non-fatal, never
 *  turns an import failure into a batch failure.
 *
 *  resolvePerson()'s own recordProvenance() unconditionally upserts a ContactSource
 *  row keyed on (workspaceId, personId, source) — a DIFFERENT unique key than the
 *  (workspaceId, memberId, source) row upsertContactSource() already wrote inside the
 *  transaction above (which carries the real rawSnapshot/externalId the merge-review
 *  UI and idempotent re-import need). Left alone, that's two split provenance rows
 *  for one imported contact — the richer one orphaned off the Person side, invisible
 *  to PersonConsentPanel/tags/the merge queue. Reconcile to one row that carries both. */
async function linkPersonSpine(
  db: PrismaClient,
  workspaceId: string,
  memberId: string,
  item: Extract<PersistPlanItem, { action: 'create' }>,
): Promise<void> {
  try {
    const { resolvePerson } = await import('@/lib/crm/resolve-person');
    const person = await resolvePerson({
      workspaceId,
      // Imported email/phone are typed/synced from a third-party system, never
      // identity-provider-proven — same UNVERIFIED treatment as every other
      // operator/import-facing create path.
      email: item.member.email,
      emailVerified: false,
      phone: item.member.phone,
      firstName: item.member.firstName || null,
      lastName: item.member.lastName || null,
      roles: item.member.roles,
      source: item.source.source,
      sourceExternalId: item.source.externalId,
    });
    await db.member.update({ where: { id: memberId }, data: { personId: person.id } });

    const importRow = await db.contactSource.findUnique({
      where: { workspaceId_memberId_source: { workspaceId, memberId, source: item.source.source } },
    });
    const personRow = await db.contactSource.findUnique({
      where: { workspaceId_personId_source: { workspaceId, personId: person.id, source: item.source.source } },
    });
    if (importRow && personRow && importRow.id !== personRow.id) {
      await db.contactSource.update({ where: { id: importRow.id }, data: { personId: person.id } });
      await db.contactSource.delete({ where: { id: personRow.id } });
    } else if (importRow && !importRow.personId) {
      await db.contactSource.update({ where: { id: importRow.id }, data: { personId: person.id } });
    }
  } catch (err) {
    console.error(
      `[executePersist] person spine link failed (member=${memberId} source=${item.source.source}):`,
      err,
    );
  }
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
    suppressed_identity: 0,
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
