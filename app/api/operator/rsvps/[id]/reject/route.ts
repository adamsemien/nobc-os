import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const rsvp = await db.rSVP.findFirst({
    where: { id, workspaceId },
    select: { id: true, ticketStatus: true },
  });
  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });
  if (rsvp.ticketStatus !== 'pending_approval') {
    return NextResponse.json({ error: 'RSVP is not pending approval' }, { status: 409 });
  }

  await db.rSVP.update({
    where: { id },
    data: { ticketStatus: 'rejected', status: 'DECLINED' },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'rsvp.rejected',
      entityType: 'RSVP',
      entityId: id,
    },
  });

  return NextResponse.json({ ok: true });
}
