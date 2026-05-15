import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Staff check-in: fetch guest list for an event by slug
// Protected by a simple bearer token (CHECKIN_SECRET) so offline PWA can authenticate
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${process.env.CHECKIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get('slug');
  const workspaceSlug = req.nextUrl.searchParams.get('workspace');
  if (!slug || !workspaceSlug) {
    return NextResponse.json({ error: 'slug and workspace required' }, { status: 400 });
  }

  const workspace = await db.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  const event = await db.event.findFirst({
    where: { slug, workspaceId: workspace.id },
    select: { id: true, title: true, startAt: true, capacity: true },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const rsvps = await db.rSVP.findMany({
    where: {
      eventId: event.id,
      workspaceId: workspace.id,
      ticketStatus: { in: ['confirmed', 'held'] },
    },
    select: {
      id: true,
      memberId: true,
      ticketStatus: true,
      checkedIn: true,
      checkedInAt: true,
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
      checkedIn: r.checkedIn,
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
    })),
  });
}
