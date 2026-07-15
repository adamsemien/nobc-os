import { MemberStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { generateMemberQrCode } from '@/lib/member-qr';
import { logEngagementEvent } from '@/lib/engagement';
import { syncMemberChannelConsent } from '@/lib/comms/consent-sync';
import {
  contactSourceFromResolveSource,
  realClerkUserId,
  resolvePerson,
} from '@/lib/crm/resolve-person';

/**
 * Canonical Member resolution — the ONE place a Member row is born.
 *
 * Every production member-creation path routes through this helper so that:
 *   1. A person is born exactly once per (workspaceId, normalized email) — the
 *      de-facto canonical identity key (`@@unique([workspaceId, email])`).
 *   2. A new Member is ALWAYS `status = GUEST`, `approved = false`. This helper
 *      NEVER mints or promotes to APPROVED. APPROVED is assigned only through the
 *      approval gate (`lib/applications/approve.ts`), the PURPLE allowlist,
 *      operator manual-create, or `promoteMemberToApproved` (commit 3).
 *   3. A `memberQrCode` is ALWAYS present — minted via `generateMemberQrCode()`
 *      on create, and backfilled on lookup if a pre-existing row lacks one. This
 *      enforces the law in `lib/member-qr.ts` that every Member is door-scannable.
 *
 * Soft-merge: once `Member.mergedIntoId` exists (commit 5 migration), lookup will
 * follow it to the canonical row. The column does not exist yet at commit 1, so
 * merge-follow is wired in commit 5 — see `followMergedInto` below.
 */
export type ResolveMemberInput = {
  workspaceId: string;
  email: string;
  name?: string;
  /** Clerk user id when the person is a signed-in Clerk user. Falls back to a
   *  synthetic, email-keyed id so the `@@unique([workspaceId, clerkUserId])`
   *  constraint is satisfied without a real Clerk account. */
  clerkUserId?: string;
  phone?: string;
  /** Provenance label for the call site (e.g. 'plus_one', 'walkin', 'apply'). */
  source: string;
};

export type ResolvedMember = {
  id: string;
  workspaceId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: MemberStatus;
  approved: boolean;
  memberQrCode: string | null;
  phone: string | null;
  mergedIntoId: string | null;
  /** Person spine (Phase 2A): the universal base record this Member is a profile on. */
  personId: string | null;
};

const SELECT = {
  id: true,
  workspaceId: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  approved: true,
  memberQrCode: true,
  phone: true,
  mergedIntoId: true,
  personId: true,
} as const;

function splitName(name: string | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || 'Guest', lastName: parts.slice(1).join(' ') };
}

/**
 * Resolve (find-or-create) the canonical Member for a person. Always returns a
 * GUEST-or-existing row with a `memberQrCode`. Never creates or promotes to
 * APPROVED.
 */
export async function resolveMember(input: ResolveMemberInput): Promise<ResolvedMember> {
  const { workspaceId, clerkUserId, phone, source } = input;
  const email = input.email.trim().toLowerCase();

  const existing = await db.member.findFirst({
    where: { workspaceId, email },
    select: SELECT,
  });
  if (existing) {
    // Soft-merge: if this row was merged into a canonical person, resolve through
    // it so all new activity attaches to the surviving record.
    const canonical = await followMergedInto(existing);
    const withQr = await ensureQrCode(canonical);
    const personId = await attachPersonSpine(withQr, input);
    // Consent floor: re-converge through the single writer on EVERY resolve of
    // an existing member — an attachPersonSpine here may have just linked a
    // Person, and consent keyed to it must converge (same unconditional
    // pattern as lib/applications/approve.ts). Fire-and-forget + idempotent.
    void syncMemberChannelConsent({
      workspaceId,
      memberId: withQr.id,
      personId,
      context: 'member_create',
    });
    return personId && !withQr.personId ? { ...withQr, personId } : withQr;
  }

  const { firstName, lastName } = splitName(input.name);
  const data = {
    workspaceId,
    clerkUserId: clerkUserId ?? `guest:${email}`,
    email,
    firstName,
    lastName,
    phone: phone?.trim() || undefined,
    // The two invariants of this helper. Do not parameterize.
    status: MemberStatus.GUEST,
    approved: false,
    memberQrCode: generateMemberQrCode(),
  };

  try {
    const created = await db.member.create({ data, select: SELECT });
    // Person spine (Phase 2A): attach BEFORE the funnel signals so both carry
    // the personId. Non-fatal — member resolution never fails on spine errors.
    const personId = await attachPersonSpine(created, input);
    // Funnel entry signal — the canonical "a person now exists" event. Isolated
    // (logEngagementEvent never throws); degrades to a logged no-op until the
    // guest_created enum value is migrated.
    void logEngagementEvent({
      workspaceId,
      memberId: created.id,
      personId,
      eventType: 'guest_created',
      metadata: { source },
    });
    // Consent floor (CRM substrate, Phase 1): seed this person's ChannelSubscription
    // rows from whatever consent signals exist now. Fire-and-forget + no-downgrade;
    // application approval re-runs it to elevate on the applicant's opt-ins.
    void syncMemberChannelConsent({
      workspaceId,
      memberId: created.id,
      personId,
      context: 'member_create',
    });
    return personId ? { ...created, personId } : created;
  } catch (err) {
    // Concurrent create on the same identity key — re-resolve the winner.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await db.member.findFirst({
        where: { workspaceId, OR: [{ email }, { clerkUserId: data.clerkUserId }] },
        select: SELECT,
      });
      if (raced) return ensureQrCode(raced);
    }
    console.error(`[resolveMember] create failed (source=${source})`, err);
    throw err;
  }
}

/**
 * Promote an existing Member to APPROVED — the ONLY allowed promotion path,
 * used by the approval gate, the PURPLE allowlist, and operator actions.
 *
 * Preserves the same Member row: same `id`, same `memberQrCode` (backfilled if
 * missing), and all attached RSVP / Ticket / engagement history. It NEVER creates
 * a new person — a GUEST becomes an APPROVED member in place.
 */
export async function promoteMemberToApproved(
  memberId: string,
  opts?: { approvedAt?: Date },
): Promise<ResolvedMember> {
  const member = await db.member.update({
    where: { id: memberId },
    data: { status: MemberStatus.APPROVED, approved: true, approvedAt: opts?.approvedAt ?? new Date() },
    select: SELECT,
  });
  return ensureQrCode(member);
}

/**
 * Person spine (Phase 2A): make sure the resolved Member hangs off a Person.
 * Short-circuits when already linked. The email reaching this path was typed,
 * not identity-provider-proven, so it goes in UNVERIFIED — resolvePerson will
 * never use it to link to an existing Person (strict policy); a real Clerk id
 * on the input still links authoritatively. Non-fatal by design: the CRM spine
 * must never break member resolution.
 */
async function attachPersonSpine(
  member: ResolvedMember,
  input: ResolveMemberInput,
): Promise<string | null> {
  if (member.personId) return member.personId;
  try {
    // Person names must be REAL data. Member rows default a missing name to
    // firstName='Guest' (splitName above + lib/clerk-member.ts) — that
    // placeholder must never be written to the Person record; pass null and
    // let a later touch with a real name enrich-fill it.
    const hasPlaceholderName = member.firstName === 'Guest' && !member.lastName;
    const person = await resolvePerson({
      workspaceId: member.workspaceId,
      clerkUserId: realClerkUserId(input.clerkUserId),
      email: member.email,
      emailVerified: false,
      phone: member.phone,
      firstName: hasPlaceholderName ? null : member.firstName,
      lastName: hasPlaceholderName ? null : member.lastName,
      source: contactSourceFromResolveSource(input.source),
    });
    await db.member.update({ where: { id: member.id }, data: { personId: person.id } });
    return person.id;
  } catch (err) {
    console.error(
      `[resolveMember] person spine attach failed (member=${member.id} source=${input.source}):`,
      err,
    );
    return null;
  }
}

/**
 * Follow a soft-merge pointer to the canonical record. Walks `mergedIntoId` to the
 * surviving member (capped to avoid a pathological cycle). Returns the input when
 * it is not merged.
 */
async function followMergedInto(member: ResolvedMember): Promise<ResolvedMember> {
  let current = member;
  for (let hops = 0; current.mergedIntoId && hops < 10; hops++) {
    const next = await db.member.findUnique({
      where: { id: current.mergedIntoId },
      select: SELECT,
    });
    if (!next) break; // dangling pointer — fall back to the last good row
    current = next;
  }
  return current;
}

/** Backfill a missing QR on an existing row so the QR-law holds for every path. */
async function ensureQrCode(member: ResolvedMember): Promise<ResolvedMember> {
  if (member.memberQrCode) return member;
  return db.member.update({
    where: { id: member.id },
    data: { memberQrCode: generateMemberQrCode() },
    select: SELECT,
  });
}
