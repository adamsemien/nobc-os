import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { emitEvent } from '@/lib/emit-event';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id: eventId } = await params;

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { id: true, capacity: true },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Claim the next waitlisted entry inside one serializable transaction holding
  // the Event row lock, so two rapid clicks can't promote two people into one
  // seat: the lock serializes the count + claim, and the capacity re-check runs
  // against the freshly-locked state. Mirrors lib/waitlist.ts promoteFromWaitlist.
  let result:
    | { kind: 'promoted'; rsvpId: string }
    | { kind: 'full' }
    | { kind: 'empty' };
  try {
    result = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;

        if (event.capacity) {
          const taken = await tx.rSVP.count({
            where: { workspaceId, eventId, ticketStatus: { in: ['confirmed', 'held'] } },
          });
          if (taken >= event.capacity) {
            return { kind: 'full' as const };
          }
        }

        const next = await tx.rSVP.findFirst({
          where: { workspaceId, eventId, status: 'WAITLISTED' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, memberId: true },
        });
        if (!next) return { kind: 'empty' as const };

        const updated = await tx.rSVP.update({
          where: { id: next.id },
          data: { status: 'CONFIRMED', ticketStatus: 'confirmed' },
        });
        return { kind: 'promoted' as const, rsvpId: updated.id };
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (err) {
    console.error('[promote-waitlist] promote transaction failed', { workspaceId, eventId, err });
    throw err;
  }

  if (result.kind === 'empty') {
    return NextResponse.json({ error: 'No one on the waitlist' }, { status: 404 });
  }
  if (result.kind === 'full') {
    return NextResponse.json({ error: 'Event is at capacity' }, { status: 409 });
  }
  const { rsvpId } = result;

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'rsvp.confirmed',
    entityType: 'RSVP',
    entityId: rsvpId,
    metadata: { promotedFromWaitlist: true, eventId, via: 'room' },
  }).catch(err => console.error('[promote-waitlist] emit failed:', err));

  return NextResponse.json({ ok: true, rsvpId });
}
