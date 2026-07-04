import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { OperatorRole } from '@prisma/client';
import { db } from './db';
import { getMemberWorkspaceId } from './auth';
import { can, type PermissionAction } from './auth/can';

/** Role hierarchy: OWNER > ADMIN > STAFF > READ_ONLY. Higher rank = more access.
 *  (Minimal RBAC, Phase 1.5 — OWNER added on top; READ_ONLY displays as "Viewer".) */
const RANK: Record<OperatorRole, number> = {
  [OperatorRole.READ_ONLY]: 1,
  [OperatorRole.STAFF]: 2,
  [OperatorRole.ADMIN]: 3,
  [OperatorRole.OWNER]: 4,
};

export function roleAtLeast(role: OperatorRole | null, min: OperatorRole): boolean {
  return role != null && RANK[role] >= RANK[min];
}

/**
 * The operator's explicit role in a workspace, or null when they have no
 * WorkspaceMember row. Pure DB lookup — no Clerk-membership floor applied here.
 */
export async function getOperatorRole(
  clerkUserId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<OperatorRole | null> {
  if (!clerkUserId || !workspaceId) return null;
  const row = await db.workspaceMember.findFirst({
    where: { workspaceId, clerkUserId },
    select: { role: true },
  });
  return row?.role ?? null;
}

// Clerk org admin role strings. Tolerant of both the current `org:admin` and the
// legacy `admin` some Clerk versions return from the backend membership API.
const CLERK_ADMIN_ROLES = new Set(['org:admin', 'admin']);

/**
 * Role floor derived from the caller's Clerk org membership for the workspace's
 * org, so a Clerk org admin is never locked out of their own workspace merely
 * because no WorkspaceMember row exists (that table drifts out of sync with
 * Clerk). Returns OWNER for a Clerk org admin, READ_ONLY for a plain org member,
 * and null when the caller is not a member of the workspace's org (no floor).
 */
async function clerkOrgFloor(
  clerkUserId: string,
  workspaceId: string,
): Promise<OperatorRole | null> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { clerkOrgId: true },
  });
  if (!ws?.clerkOrgId) return null;

  let orgRole: string | null = null;
  try {
    const { orgId, orgRole: activeOrgRole } = await auth();
    if (orgId === ws.clerkOrgId) {
      // Fast path: the workspace's org is the active org — role is on the session,
      // no extra Clerk call.
      orgRole = activeOrgRole ?? null;
    } else {
      // Active org differs or is unset — look up the membership in this org.
      const client = await clerkClient();
      const memberships = await client.users.getOrganizationMembershipList({ userId: clerkUserId });
      orgRole = memberships.data.find((m) => m.organization.id === ws.clerkOrgId)?.role ?? null;
    }
  } catch {
    return null; // non-request context (script/webhook) — no Clerk floor
  }
  if (!orgRole) return null;
  // Minimal RBAC (Phase 1.5): a Clerk org admin floors to OWNER (was ADMIN). This
  // is the lockout-proof guarantee — a founder/org-admin can never be stranded
  // below OWNER even with no WorkspaceMember row. Plain org members floor to the
  // read tier (READ_ONLY, displayed "Viewer").
  return CLERK_ADMIN_ROLES.has(orgRole) ? OperatorRole.OWNER : OperatorRole.READ_ONLY;
}

/**
 * Effective operator role = the higher of the explicit WorkspaceMember grant and
 * the Clerk-org floor. An explicit STAFF/ADMIN grant still elevates a plain org
 * member; a Clerk org admin is never below ADMIN even with no row. Returns null
 * only when the caller has neither a WorkspaceMember row nor org membership.
 */
export async function getEffectiveRole(
  clerkUserId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<OperatorRole | null> {
  if (!clerkUserId || !workspaceId) return null;
  const [explicit, floor] = await Promise.all([
    getOperatorRole(clerkUserId, workspaceId),
    clerkOrgFloor(clerkUserId, workspaceId),
  ]);
  if (explicit == null) return floor;
  if (floor == null) return explicit;
  return RANK[explicit] >= RANK[floor] ? explicit : floor;
}

/** True when the caller's effective role is ADMIN in the workspace. */
export async function isAdmin(
  clerkUserId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  return roleAtLeast(await getEffectiveRole(clerkUserId, workspaceId), OperatorRole.ADMIN);
}

/** True when the caller's effective role is STAFF or higher in the workspace. */
export async function isStaff(
  clerkUserId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  return roleAtLeast(await getEffectiveRole(clerkUserId, workspaceId), OperatorRole.STAFF);
}

/** True when the caller's effective role is OWNER — the top tier that gates
 *  workspace settings, role management, member delete, and refunds. */
export async function isOwner(
  clerkUserId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  return roleAtLeast(await getEffectiveRole(clerkUserId, workspaceId), OperatorRole.OWNER);
}

export type RoleGate =
  | { ok: true; userId: string; workspaceId: string; role: OperatorRole }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guard. Resolves the current operator (same auth() + workspace
 * pattern as the rest of /api/operator) and checks they are at least `minRole`.
 * Returns the resolved context, or a ready-to-return 401/403 response.
 *
 * Role is the higher of any explicit WorkspaceMember grant and the Clerk-org
 * floor (org admin → ADMIN, plain org member → READ_ONLY), so a Clerk org admin
 * is never locked out of their own workspace and explicit grants still elevate a
 * plain member. See getEffectiveRole.
 *
 *   const gate = await requireRole(OperatorRole.ADMIN);
 *   if (!gate.ok) return gate.response;
 *   const { userId, workspaceId } = gate;
 */
export async function requireRole(minRole: OperatorRole): Promise<RoleGate> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return { ok: false, response: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }
  const role = (await getEffectiveRole(userId, workspaceId)) ?? OperatorRole.READ_ONLY;
  if (!roleAtLeast(role, minRole)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId, workspaceId, role };
}

/**
 * Server-component / page guard. Returns the resolved operator context, or
 * redirects to `redirectTo` when the user is not at least `minRole`. Same
 * READ_ONLY floor as requireRole.
 */
export async function requireRolePage(
  minRole: OperatorRole,
  redirectTo = '/operator',
): Promise<{ userId: string; workspaceId: string; role: OperatorRole }> {
  const { userId } = await auth();
  if (!userId) redirect('/');
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect(redirectTo);
  const role = (await getEffectiveRole(userId, workspaceId)) ?? OperatorRole.READ_ONLY;
  if (!roleAtLeast(role, minRole)) redirect(redirectTo);
  return { userId, workspaceId, role };
}

/**
 * Permission-gated route handler guard (Minimal RBAC, Phase 1.5). Resolves the
 * operator exactly like requireRole, then checks `can(role, action)` — the single
 * canonical permission matrix (lib/auth/can.ts). This is the SERVER gate for
 * destructive actions; it slots into the same RoleGate shape as requireRole.
 *
 *   const gate = await requirePermission('member.bulk');
 *   if (!gate.ok) return gate.response;
 */
export async function requirePermission(action: PermissionAction): Promise<RoleGate> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return { ok: false, response: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }
  const role = (await getEffectiveRole(userId, workspaceId)) ?? OperatorRole.READ_ONLY;
  if (!can({ role }, action)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId, workspaceId, role };
}

/**
 * Permission-gated server-component / page guard. Redirects when the caller lacks
 * the permission. Used for OWNER-only surfaces (settings, team).
 */
export async function requirePermissionPage(
  action: PermissionAction,
  redirectTo = '/operator',
): Promise<{ userId: string; workspaceId: string; role: OperatorRole }> {
  const { userId } = await auth();
  if (!userId) redirect('/');
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect(redirectTo);
  const role = (await getEffectiveRole(userId, workspaceId)) ?? OperatorRole.READ_ONLY;
  if (!can({ role }, action)) redirect(redirectTo);
  return { userId, workspaceId, role };
}
