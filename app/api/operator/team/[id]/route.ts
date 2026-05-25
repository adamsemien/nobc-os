import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

const ROLES = new Set<OperatorRole>([
  OperatorRole.ADMIN,
  OperatorRole.STAFF,
  OperatorRole.READ_ONLY,
]);

// Change a team member's role — ADMIN only. Refuses to demote the last admin.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const role: OperatorRole | null = ROLES.has(body?.role) ? body.role : null;
  if (!role) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  const target = await db.workspaceMember.findFirst({
    where: { id, workspaceId },
    select: { id: true, role: true },
  });
  if (!target) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 });

  if (target.role === OperatorRole.ADMIN && role !== OperatorRole.ADMIN) {
    const adminCount = await db.workspaceMember.count({
      where: { workspaceId, role: OperatorRole.ADMIN },
    });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot demote the last admin.' }, { status: 409 });
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

  return NextResponse.json({ ok: true });
}

// Remove a team member — ADMIN only. Refuses to remove the last admin.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const target = await db.workspaceMember.findFirst({
    where: { id, workspaceId },
    select: { id: true, role: true, email: true },
  });
  if (!target) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 });

  if (target.role === OperatorRole.ADMIN) {
    const adminCount = await db.workspaceMember.count({
      where: { workspaceId, role: OperatorRole.ADMIN },
    });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last admin.' }, { status: 409 });
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
