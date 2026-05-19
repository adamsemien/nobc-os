import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

type RecentArrival = {
  rsvpId: string;
  memberId: string;
  name: string;
  archetype: string | null;
  checkedInAt: string;
  avatarUrl: string | null;
  isVip: boolean;
};

type InRoomMember = {
  rsvpId: string;
  memberId: string;
  name: string;
  archetype: string | null;
  checkedInAt: string;
  isVip: boolean;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id: eventId } = await params;

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: {
      id: true,
      title: true,
      startAt: true,
      location: true,
      capacity: true,
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [checkedInCount, waitlistCount, checkedInRsvps, nextWaitlistRsvp] = await Promise.all([
    db.rSVP.count({ where: { workspaceId, eventId, checkedIn: true } }),
    db.rSVP.count({ where: { workspaceId, eventId, status: 'WAITLISTED' } }),
    db.rSVP.findMany({
      where: { workspaceId, eventId, checkedIn: true },
      select: {
        id: true,
        checkedInAt: true,
        memberId: true,
        guestName: true,
        member: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { checkedInAt: 'desc' },
    }),
    db.rSVP.findFirst({
      where: { workspaceId, eventId, status: 'WAITLISTED' },
      select: {
        id: true,
        guestName: true,
        member: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const memberEmails = Array.from(
    new Set(checkedInRsvps.map(r => r.member.email.toLowerCase()).filter(Boolean)),
  );

  const [applications, purpleEntries] = await Promise.all([
    memberEmails.length === 0
      ? Promise.resolve([] as { email: string; archetype: string | null }[])
      : db.application.findMany({
          where: {
            workspaceId,
            email: { in: memberEmails, mode: 'insensitive' },
            archetype: { not: null },
          },
          select: { email: true, archetype: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
    memberEmails.length === 0
      ? Promise.resolve([] as { matchEmail: string | null }[])
      : db.watchList.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            type: 'PURPLE',
            matchEmail: { in: memberEmails, mode: 'insensitive' },
          },
          select: { matchEmail: true },
        }),
  ]);

  const archetypeByEmail = new Map<string, string>();
  for (const app of applications) {
    const key = app.email.toLowerCase();
    if (!archetypeByEmail.has(key) && app.archetype) archetypeByEmail.set(key, app.archetype);
  }

  const vipEmails = new Set(
    purpleEntries.map(e => e.matchEmail?.toLowerCase()).filter((x): x is string => !!x),
  );

  const allInRoom: InRoomMember[] = checkedInRsvps.map(r => {
    const fullName =
      `${r.member.firstName ?? ''} ${r.member.lastName ?? ''}`.trim() ||
      r.guestName ||
      r.member.email;
    const emailKey = r.member.email.toLowerCase();
    return {
      rsvpId: r.id,
      memberId: r.member.id,
      name: fullName,
      archetype: archetypeByEmail.get(emailKey) ?? null,
      checkedInAt: r.checkedInAt?.toISOString() ?? new Date().toISOString(),
      isVip: vipEmails.has(emailKey),
    };
  });

  const recentArrivals: RecentArrival[] = allInRoom.slice(0, 10).map(m => ({
    rsvpId: m.rsvpId,
    memberId: m.memberId,
    name: m.name,
    archetype: m.archetype,
    checkedInAt: m.checkedInAt,
    avatarUrl: null,
    isVip: m.isVip,
  }));

  let nextOnWaitlist: { rsvpId: string; name: string } | null = null;
  if (nextWaitlistRsvp) {
    const name =
      `${nextWaitlistRsvp.member.firstName ?? ''} ${nextWaitlistRsvp.member.lastName ?? ''}`.trim() ||
      nextWaitlistRsvp.guestName ||
      nextWaitlistRsvp.member.email;
    nextOnWaitlist = { rsvpId: nextWaitlistRsvp.id, name };
  }

  const archetypeMix: Record<string, number> = {};
  for (const m of allInRoom) {
    if (!m.archetype) continue;
    archetypeMix[m.archetype] = (archetypeMix[m.archetype] ?? 0) + 1;
  }

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      startAt: event.startAt.toISOString(),
      venue: event.location,
      capacity: event.capacity,
    },
    checkedIn: checkedInCount,
    waitlistCount,
    recentArrivals,
    inTheRoom: allInRoom,
    nextOnWaitlist,
    archetypeMix,
  });
}
