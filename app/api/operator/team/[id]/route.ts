import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { logEngagementEvent } from '@/lib/engagement';

/** The Clerk-org-admin floor (lib/operator-role.ts) overrides any grant below
 *  OWNER, so demoting or removing an org admin here would report success while
 *  changing nothing — the silent trap this guard closes. Fails open (false) on
 *  Clerk errors; the row write is then still honest for non-admin targets. */
async function targetIsClerkOrgAdmin(
  clerkUserId: string | null,
  workspaceId: string,
): Promise<boolean> {
  if (!clerkUserId) return false;
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { clerkOrgId: true },
  });
  if (!ws?.clerkOrgId) return false;
  try {
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId: clerkUserId });
    const role = memberships.data.find((m) => m.organization.id === ws.clerkOrgId)?.role ?? null;
    return role === 'org:admin' || role === 'admin';
  } catch {
    return false;
  }
}

// Minimal RBAC (Phase 1.5): all four roles are assignable, including OWNER.
const ROLES = new Set<OperatorRole>([
  OperatorRole.OWNER,
  OperatorRole.ADMIN,
  OperatorRole.STAFF,
  OperatorRole.READ_ONLY,
]);

/** Emit the role_changed member-engagement signal when this operator also has a
 *  Member record (MemberEngagementEvent is memberId-keyed). Fire-and-forget; the
 *  AuditEvent below is the authoritative operator-side trail. */
async function emitRoleChangedEngagement(
  workspaceId: string,
  operator: { clerkUserId: string | null; email: string },
  from: OperatorRole,
  to: OperatorRole,
): Promise<void> {
  const member = await db.member.findFirst({
    where: {
      workspaceId,
      OR: [
        ...(operator.clerkUserId ? [{ clerkUserId: operator.clerkUserId }] : []),
        { email: operator.email },
      ],
    },
    select: { id: true },
  });
  if (member) {
    void logEngagementEvent({
      workspaceId,
      memberId: member.id,
      eventType: 'role_changed',
      metadata: { from, to },
    });
  }
}

// Change a team member's role — role.manage (OWNER only). Refuses to demote the last OWNER.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('role.manage');
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const role: OperatorRole | null = ROLES.has(body?.role) ? body.role : null;
  if (!role) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  const target = await db.workspaceMember.findFirst({
    where: { id, workspaceId },
    select: { id: true, role: true, email: true, clerkUserId: true },
  });
  if (!target) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 });

  // A Clerk org admin floors to OWNER regardless of this row — writing a lower
  // role would "succeed" while changing nothing.
  if (role !== OperatorRole.OWNER && (await targetIsClerkOrgAdmin(target.clerkUserId, workspaceId))) {
    return NextResponse.json(
      {
        error:
          'This person is a Clerk organization admin — their access floors to Owner. ' +
          'To reduce it, change their role in Clerk (org:admin → org:member) first.',
      },
      { status: 409 },
    );
  }

  // Never strand the workspace: the last OWNER cannot be demoted here.
  if (target.role === OperatorRole.OWNER && role !== OperatorRole.OWNER) {
    const ownerCount = await db.workspaceMember.count({
      where: { workspaceId, role: OperatorRole.OWNER },
    });
    if (ownerCount <= 1) {
      return NextResponse.json({ error: 'Cannot demote the last owner.' }, { status: 409 });
    }
  }

  await db.workspaceMember.update({ where: { id }, data: { role } });
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'team.role_changed',
    entityType: 'WORKSPACE_MEMBER',
    entityId: id,
    metadata: { from: target.role, to: role },
  });
  await emitRoleChangedEngagement(workspaceId, target, target.role, role);

  return NextResponse.json({ ok: true });
}

// Remove a team member — role.manage (OWNER only). Refuses to remove the last OWNER.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('role.manage');
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const target = await db.workspaceMember.findFirst({
    where: { id, workspaceId },
    select: { id: true, role: true, email: true, clerkUserId: true },
  });
  if (!target) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 });

  // Removing an org admin's row would delete the grant while their OWNER
  // access persists via the Clerk floor — refuse with the real path instead.
  if (await targetIsClerkOrgAdmin(target.clerkUserId, workspaceId)) {
    return NextResponse.json(
      {
        error:
          'This person is a Clerk organization admin — removing them here would not revoke ' +
          'their access. Remove them from the Clerk organization instead.',
      },
      { status: 409 },
    );
  }

  if (target.role === OperatorRole.OWNER) {
    const ownerCount = await db.workspaceMember.count({
      where: { workspaceId, role: OperatorRole.OWNER },
    });
    if (ownerCount <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last owner.' }, { status: 409 });
    }
  }

  await db.workspaceMember.delete({ where: { id } });
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'team.member_removed',
    entityType: 'WORKSPACE_MEMBER',
    entityId: id,
    metadata: { email: target.email, role: target.role },
  });

  return NextResponse.json({ ok: true });
}
