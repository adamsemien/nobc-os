import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const events = await db.event.findMany({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      startAt: { gte: todayStart },
    },
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      startAt: true,
      location: true,
      capacity: true,
    },
  });

  // For each event, get checked-in / confirmed counts.
  const counts = await db.rSVP.groupBy({
    by: ['eventId', 'checkedIn', 'status'],
    where: {
      workspaceId,
      eventId: { in: events.map((e) => e.id) },
    },
    _count: { _all: true },
  });

  const statsByEvent = new Map<string, { checkedIn: number; confirmed: number }>();
  for (const e of events) statsByEvent.set(e.id, { checkedIn: 0, confirmed: 0 });
  for (const c of counts) {
    const s = statsByEvent.get(c.eventId);
    if (!s) continue;
    if (c.checkedIn) s.checkedIn += c._count._all;
    if (c.status === 'CONFIRMED') s.confirmed += c._count._all;
  }

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startAt: e.startAt.toISOString(),
      location: e.location,
      capacity: e.capacity,
      checkedIn: statsByEvent.get(e.id)?.checkedIn ?? 0,
      confirmed: statsByEvent.get(e.id)?.confirmed ?? 0,
    })),
  });
}
