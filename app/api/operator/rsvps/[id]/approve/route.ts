import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const rsvp = await db.rSVP.findFirst({
    where: { id, workspaceId },
    select: { id: true, ticketStatus: true, eventId: true },
  });
  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });
  if (rsvp.ticketStatus !== 'pending_approval') {
    return NextResponse.json({ error: 'RSVP is not pending approval' }, { status: 409 });
  }

  const event = await db.event.findFirst({
    where: { id: rsvp.eventId, workspaceId },
    select: { capacity: true },
  });

  if (event?.capacity) {
    const taken = await db.rSVP.count({
      where: {
        workspaceId,
        eventId: rsvp.eventId,
        ticketStatus: { in: ['confirmed', 'held'] },
      },
    });
    if (taken >= event.capacity) {
      return NextResponse.json({ error: 'Event is at capacity' }, { status: 409 });
    }
  }

  await db.rSVP.update({
    where: { id },
    data: { ticketStatus: 'confirmed', status: 'CONFIRMED' },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'rsvp.approved',
      entityType: 'RSVP',
      entityId: id,
    },
  });

  return NextResponse.json({ ok: true });
}
