import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logEngagementEvent } from '@/lib/engagement';
import { bearerToken, verifyCheckInToken } from '@/lib/check-in-token';

// Idempotent check-in endpoint — safe to call multiple times offline/online.
// Authenticated by the event-scoped check-in token; the RSVP must belong to the
// token's event + workspace, so a token for one event cannot check in another's.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rsvpId: string }> },
) {
  const scope = verifyCheckInToken(bearerToken(req.headers.get('authorization')));
  if (!scope) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { rsvpId } = await params;

  const rsvp = await db.rSVP.findUnique({
    where: { id: rsvpId },
    select: { id: true, workspaceId: true, memberId: true, eventId: true, checkedIn: true, ticketStatus: true },
  });
  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });
  // Scope check: the token may only act on RSVPs for its own event + workspace.
  if (rsvp.workspaceId !== scope.workspaceId || rsvp.eventId !== scope.eventId) {
    return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
  }
  if (!['confirmed', 'held'].includes(rsvp.ticketStatus)) {
    return NextResponse.json({ error: 'Invalid ticket status' }, { status: 422 });
  }

  // Already checked in — idempotent success
  if (rsvp.checkedIn) {
    return NextResponse.json({ ok: true, alreadyCheckedIn: true });
  }

  const now = new Date();

  await db.$transaction([
    db.rSVP.update({
      where: { id: rsvpId },
      data: { checkedIn: true, checkedInAt: now },
    }),
    db.member.update({
      where: { id: rsvp.memberId },
      data: {
        totalEventsAttended: { increment: 1 },
        lastAttendedDate: now,
      },
    }),
    db.auditEvent.create({
      data: {
        workspaceId: rsvp.workspaceId,
        actorId: 'staff-checkin',
        action: 'rsvp.checked_in',
        entityType: 'RSVP',
        entityId: rsvpId,
      },
    }),
  ]);

  // Fire-and-forget engagement signal — must not block or fail the check-in.
  logEngagementEvent({
    workspaceId: rsvp.workspaceId,
    memberId: rsvp.memberId,
    eventType: 'checked_in',
    eventId: rsvp.eventId,
  });

  return NextResponse.json({ ok: true, alreadyCheckedIn: false, checkedInAt: now.toISOString() });
}
