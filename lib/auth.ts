import { auth, clerkClient } from '@clerk/nextjs/server';
import { MemberStatus } from '@prisma/client';
import { db } from './db';
import { resolvePerson } from '@/lib/crm/resolve-person';

export async function getOrCreateWorkspaceForUser(clerkUserId: string) {
  // Resolve against the operator's ACTIVE Clerk org (the one they selected),
  // not whichever org happens to be first in their membership list. auth() is
  // read defensively: in a non-request context (scripts, webhooks) it throws,
  // leaving activeOrgId null so the legacy first-membership fallback applies.
  let activeOrgId: string | null = null;
  try {
    activeOrgId = (await auth()).orgId ?? null;
  } catch {
    activeOrgId = null;
  }

  // Fast path: workspace already bound to the active org (skips the Clerk
  // membership lookup entirely for the common signed-in-operator case).
  if (activeOrgId) {
    const byActiveOrg = await db.workspace.findUnique({ where: { clerkOrgId: activeOrgId } });
    if (byActiveOrg) return byActiveOrg;
  }

  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId: clerkUserId });

  if (!memberships.data.length) {
    throw new Error(`No organization membership found for user ${clerkUserId}`);
  }

  // Active org when set (and the user is a member of it); otherwise the first
  // membership — the original behaviour, now reached only when orgId is null.
  const activeOrg = activeOrgId
    ? memberships.data.find((m) => m.organization.id === activeOrgId)?.organization
    : undefined;
  const org = activeOrg ?? memberships.data[0].organization;
  const orgSlug = org.slug ?? org.id;

  // Fast path: workspace already bound to this Clerk org
  const byOrgId = await db.workspace.findUnique({ where: { clerkOrgId: org.id } });
  if (byOrgId) return byOrgId;

  // Reconcile seeded workspace: if a workspace with the org slug exists but has a
  // placeholder clerkOrgId (from seed-workspace.mjs), bind the real org ID to it.
  const bySlug = await db.workspace.findUnique({ where: { slug: orgSlug } });
  if (bySlug) {
    return db.workspace.update({
      where: { id: bySlug.id },
      data: { clerkOrgId: org.id, name: org.name },
    });
  }

  return db.workspace.create({
    data: { clerkOrgId: org.id, name: org.name, slug: orgSlug },
  });
}

export async function requireWorkspaceId(clerkUserId: string): Promise<string> {
  const workspace = await getOrCreateWorkspaceForUser(clerkUserId);
  return workspace.id;
}

/** Returns workspace id, or null if user is missing or has no org / workspace cannot be resolved. */
export async function getMemberWorkspaceId(
  clerkUserId: string | null | undefined,
): Promise<string | null> {
  if (!clerkUserId) return null;
  try {
    const workspace = await getOrCreateWorkspaceForUser(clerkUserId);
    return workspace.id;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Member-portal identity resolution
// ---------------------------------------------------------------------------
// Member-portal only — do NOT use for operator routes.
// Operator routes (/operator/*, /api/operator/*, /api/sms/*, /api/agent/*,
// /api/intelligence/*) must continue to use getMemberWorkspaceId, which
// resolves via Clerk org membership.
// ---------------------------------------------------------------------------

export type MemberPortalContext = {
  workspaceId: string;
  memberId: string;
  status: MemberStatus;
  firstName: string;
};

/**
 * Placeholder prefixes written by the four member-creation paths that do NOT
 * have a real Clerk userId at creation time. Any row whose clerkUserId starts
 * with one of these is safe to claim; any other value is a real Clerk user id
 * and must never be overwritten.
 */
const PLACEHOLDER_PREFIXES = ['app_', 'applicant:', 'guest:', 'manual:'] as const;

function isPlaceholder(clerkUserId: string): boolean {
  return PLACEHOLDER_PREFIXES.some((prefix) => clerkUserId.startsWith(prefix));
}

/**
 * Lazily links a real Clerk user to their Member row(s) by verified primary
 * email address. Runs inside getMemberPortalContext on first portal access.
 *
 * Safety invariants:
 *  - Only claims rows whose clerkUserId is a placeholder (isPlaceholder guard).
 *  - Only proceeds with a verified email (Risk #3 — unverified-email claim).
 *  - The WHERE clause includes both email + placeholder value, making the
 *    update idempotent and race-safe (concurrent claim → one wins, one is 0-row
 *    no-op, both re-read the now-claimed row). (Risk #4)
 *  - Workspace-scoped: returns the most-recently-created claimed member so a
 *    multi-workspace member always gets a deterministic context. (Risk #2)
 */
async function claimMemberIdentity(
  clerkUserId: string,
): Promise<MemberPortalContext | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);

    // Require verified primary email — unverified email claim is a security hole.
    const primaryEmail = user.primaryEmailAddress;
    if (!primaryEmail || primaryEmail.verification?.status !== 'verified') {
      return null;
    }
    const email = primaryEmail.emailAddress.trim().toLowerCase();
    if (!email) return null;

    // Find all Member rows matching this email with a placeholder clerkUserId.
    // May span multiple workspaces (multi-tenant). We claim each one that is
    // eligible (placeholder clerkUserId + APPROVED or GUEST status).
    const candidates = await db.member.findMany({
      where: { email },
      select: {
        id: true,
        workspaceId: true,
        clerkUserId: true,
        status: true,
        firstName: true,
        createdAt: true,
      },
    });

    const eligible = candidates.filter(
      (c) =>
        isPlaceholder(c.clerkUserId) &&
        (c.status === MemberStatus.APPROVED || c.status === MemberStatus.GUEST),
    );

    if (eligible.length === 0) return null;

    // Claim each eligible row atomically. The WHERE guards on both id and the
    // exact placeholder value — a concurrent claim updates 0 rows (idempotent).
    await Promise.all(
      eligible.map((candidate) =>
        db.member.updateMany({
          where: {
            id: candidate.id,
            clerkUserId: candidate.clerkUserId, // guard on exact placeholder value
          },
          data: { clerkUserId, claimedAt: new Date() },
        }),
      ),
    );

    // Re-read the claimed rows to get the final state. Pick the portal context
    // from the most-recently-created Member (deterministic across workspaces).
    // TODO(member-portal): multi-workspace switcher — when a member belongs to
    // more than one workspace, surface a picker instead of silently picking one.
    const claimed = await db.member.findMany({
      where: { clerkUserId, id: { in: eligible.map((c) => c.id) } },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        firstName: true,
        createdAt: true,
        personId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Person spine (Phase 2A): a claim is the strongest identity proof we get —
    // a real Clerk session with a VERIFIED email. Stamp it through to the Person
    // so the spine reflects the proven identity. Non-fatal: claiming must never
    // fail on spine bookkeeping.
    await Promise.all(
      claimed.map((m) => stampPersonSpineOnClaim(m, clerkUserId, email)),
    );

    if (eligible.length > 1) {
      console.warn(
        '[getMemberPortalContext] multi-workspace claim: clerkUserId=%s claimed %d rows across workspaces. Returning most-recent.',
        clerkUserId,
        claimed.length,
      );
    }

    const primary = claimed[0];
    if (!primary) return null;

    return {
      workspaceId: primary.workspaceId,
      memberId: primary.id,
      status: primary.status,
      firstName: primary.firstName,
    };
  } catch (err) {
    console.error('[claimMemberIdentity] unexpected error for clerkUserId=%s', clerkUserId, err);
    return null;
  }
}

/**
 * Person spine (Phase 2A): after a member claim, stamp the proven identity
 * (real Clerk id + verified email) onto the linked Person — or resolve one if
 * the member predates the spine. Never throws.
 */
async function stampPersonSpineOnClaim(
  member: { id: string; workspaceId: string; personId: string | null },
  clerkUserId: string,
  verifiedEmail: string,
): Promise<void> {
  try {
    if (!member.personId) {
      const person = await resolvePerson({
        workspaceId: member.workspaceId,
        clerkUserId,
        email: verifiedEmail,
        emailVerified: true,
        source: 'clerk',
        sourceExternalId: clerkUserId,
      });
      await db.member.update({ where: { id: member.id }, data: { personId: person.id } });
      return;
    }

    const person = await db.person.findUnique({
      where: { id: member.personId },
      select: { id: true, clerkUserId: true, email: true, emailVerified: true },
    });
    if (!person) return;

    const data: { clerkUserId?: string; email?: string; emailVerified?: boolean } = {};
    if (!person.clerkUserId) data.clerkUserId = clerkUserId;
    if (!person.email) {
      data.email = verifiedEmail;
      data.emailVerified = true;
    } else if (person.email.toLowerCase() === verifiedEmail && !person.emailVerified) {
      data.emailVerified = true;
    }
    if (Object.keys(data).length > 0) {
      await db.person.update({ where: { id: person.id }, data });
    }
  } catch (err) {
    // A P2002 here means another Person in the workspace already holds this
    // Clerk id (webhook/claim race) — keep the claim, log, move on.
    console.error(
      '[claimMemberIdentity] person spine stamp failed (member=%s):',
      member.id,
      err,
    );
  }
}

/**
 * Resolves member portal context for the signed-in user.
 *
 * Resolution order:
 *  1. Direct lookup by clerkUserId on the Member table (instant for returning members).
 *  2. Lazy claim: fetches verified primary email from Clerk and links the Member
 *     row if it holds a placeholder clerkUserId (first portal access after approval).
 *
 * Returns null only when no Member row can be found or claimed — the caller
 * renders MemberWorkspaceGate in that case.
 *
 * Never throws. Mirror's getMemberWorkspaceId's null-on-failure contract.
 *
 * Member-portal only — do NOT use for operator routes.
 */
export async function getMemberPortalContext(
  clerkUserId: string | null | undefined,
): Promise<MemberPortalContext | null> {
  if (!clerkUserId) return null;
  try {
    // Fast path: row already claims this real Clerk user id.
    const existing = await db.member.findFirst({
      where: { clerkUserId },
      select: { id: true, workspaceId: true, status: true, firstName: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return {
        workspaceId: existing.workspaceId,
        memberId: existing.id,
        status: existing.status,
        firstName: existing.firstName,
      };
    }

    // Slow path: first visit — try to claim via verified email.
    return await claimMemberIdentity(clerkUserId);
  } catch (err) {
    console.error('[getMemberPortalContext] unexpected error for clerkUserId=%s', clerkUserId, err);
    return null;
  }
}
