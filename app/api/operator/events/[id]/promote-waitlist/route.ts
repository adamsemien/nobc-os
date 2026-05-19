import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { emitEvent } from '@/lib/emit-event';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id: eventId } = await params;

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { id: true },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const next = await db.rSVP.findFirst({
    where: { workspaceId, eventId, status: 'WAITLISTED' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, memberId: true },
  });
  if (!next) return NextResponse.json({ error: 'No one on the waitlist' }, { status: 404 });

  const updated = await db.rSVP.update({
    where: { id: next.id },
    data: { status: 'CONFIRMED', ticketStatus: 'confirmed' },
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'rsvp.confirmed',
    entityType: 'RSVP',
    entityId: next.id,
    metadata: { promotedFromWaitlist: true, eventId, via: 'room' },
  }).catch(err => console.error('[promote-waitlist] emit failed:', err));

  return NextResponse.json({ ok: true, rsvpId: updated.id });
}
