import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bearerToken, verifyCheckInToken } from '@/lib/check-in-token';

// Staff check-in: fetch the guest list for an event.
// Authenticated by the event-scoped check-in token (minted server-side for a
// STAFF+ operator) — scope comes from the token, NOT from query params, so a
// token for one event can only ever read that event in its own workspace.
export async function GET(req: NextRequest) {
  const scope = verifyCheckInToken(bearerToken(req.headers.get('authorization')));
  if (!scope) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const event = await db.event.findFirst({
    where: { id: scope.eventId, workspaceId: scope.workspaceId },
    select: { id: true, title: true, startAt: true, capacity: true },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const rsvps = await db.rSVP.findMany({
    where: {
      eventId: event.id,
      workspaceId: scope.workspaceId,
      ticketStatus: { in: ['confirmed', 'held'] },
    },
    select: {
      id: true,
      memberId: true,
      ticketStatus: true,
      paymentStatus: true,
      checkedIn: true,
      checkedInAt: true,
      isComp: true,
      compType: true,
      tier: { select: { name: true } },
      member: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          memberQrCode: true,
        },
      },
    },
    orderBy: [{ member: { lastName: 'asc' } }],
  });

  const checkedInCount = rsvps.filter(r => r.checkedIn).length;

  return NextResponse.json({
    event: { id: event.id, title: event.title, startAt: event.startAt, capacity: event.capacity },
    checkedInCount,
    totalCount: rsvps.length,
    rsvps: rsvps.map(r => ({
      id: r.id,
      memberId: r.memberId,
      firstName: r.member.firstName,
      lastName: r.member.lastName,
      email: r.member.email,
      memberQrCode: r.member.memberQrCode,
      ticketStatus: r.ticketStatus,
      paymentStatus: r.paymentStatus ?? null,
      tierName: r.tier?.name ?? null,
      checkedIn: r.checkedIn,
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
      isComp: r.isComp,
      compType: r.compType,
    })),
  });
}
