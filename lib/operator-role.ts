import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { OperatorRole } from '@prisma/client';
import { db } from './db';
import { getMemberWorkspaceId } from './auth';

/** Role hierarchy: ADMIN > STAFF > READ_ONLY. Higher rank = more access. */
const RANK: Record<OperatorRole, number> = {
  [OperatorRole.READ_ONLY]: 1,
  [OperatorRole.STAFF]: 2,
  [OperatorRole.ADMIN]: 3,
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

/** True when the user holds an explicit ADMIN role in the workspace. */
export async function isAdmin(
  clerkUserId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  return roleAtLeast(await getOperatorRole(clerkUserId, workspaceId), OperatorRole.ADMIN);
}

/** True when the user holds STAFF or ADMIN in the workspace. */
export async function isStaff(
  clerkUserId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  return roleAtLeast(await getOperatorRole(clerkUserId, workspaceId), OperatorRole.STAFF);
}

export type RoleGate =
  | { ok: true; userId: string; workspaceId: string; role: OperatorRole }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guard. Resolves the current operator (same auth() + workspace
 * pattern as the rest of /api/operator) and checks they are at least `minRole`.
 * Returns the resolved context, or a ready-to-return 401/403 response.
 *
 * A resolved workspace operator (valid Clerk org member) with no explicit
 * WorkspaceMember row is treated as READ_ONLY, so adding gates never hard-locks
 * existing org members out of read surfaces — elevated actions still require an
 * explicit STAFF/ADMIN grant.
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
  const role = (await getOperatorRole(userId, workspaceId)) ?? OperatorRole.READ_ONLY;
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
  const role = (await getOperatorRole(userId, workspaceId)) ?? OperatorRole.READ_ONLY;
  if (!roleAtLeast(role, minRole)) redirect(redirectTo);
  return { userId, workspaceId, role };
}
