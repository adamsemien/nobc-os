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

  // Capacity re-check + approve in one serializable transaction holding the
  // Event row lock — without it, two operators approving the last seat together
  // both see taken < capacity and both confirm, overselling. Mirrors
  // lib/waitlist.ts promoteFromWaitlist.
  let confirmed = false;
  try {
    confirmed = await db.$transaction(
      async (tx) => {
        if (event?.capacity) {
          await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${rsvp.eventId} FOR UPDATE`;
          const taken = await tx.rSVP.count({
            where: {
              workspaceId,
              eventId: rsvp.eventId,
              ticketStatus: { in: ['confirmed', 'held'] },
            },
          });
          if (taken >= event.capacity) return false;
        }
        await tx.rSVP.update({
          where: { id },
          data: { ticketStatus: 'confirmed', status: 'CONFIRMED' },
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (err) {
    console.error('[approve] approve transaction failed', { workspaceId, rsvpId: id, err });
    throw err;
  }
  if (!confirmed) {
    return NextResponse.json({ error: 'Event is at capacity' }, { status: 409 });
  }

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
