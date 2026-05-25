import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES = new Set<OperatorRole>([
  OperatorRole.ADMIN,
  OperatorRole.STAFF,
  OperatorRole.READ_ONLY,
]);

// Invite a team member by email — ADMIN only. No email is sent yet (V2); the
// row is stored with no clerkUserId and activates when that person signs in.
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role: OperatorRole = ROLES.has(body?.role) ? body.role : OperatorRole.STAFF;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const existing = await db.workspaceMember.findUnique({
    where: { workspaceId_email: { workspaceId, email } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: 'This person is already on the team.' }, { status: 409 });
  }

  const member = await db.workspaceMember.create({
    data: { workspaceId, email, role },
    select: { id: true, email: true, role: true },
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'team.member_invited',
    entityType: 'WORKSPACE_MEMBER',
    entityId: member.id,
    metadata: { email, role },
  });

  return NextResponse.json({ member }, { status: 201 });
}
