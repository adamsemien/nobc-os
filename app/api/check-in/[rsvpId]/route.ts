import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Idempotent check-in endpoint — safe to call multiple times offline/online
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rsvpId: string }> },
) {
  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${process.env.CHECKIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { rsvpId } = await params;

  const rsvp = await db.rSVP.findUnique({
    where: { id: rsvpId },
    select: { id: true, workspaceId: true, memberId: true, checkedIn: true, ticketStatus: true },
  });
  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });
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

  return NextResponse.json({ ok: true, alreadyCheckedIn: false, checkedInAt: now.toISOString() });
}
