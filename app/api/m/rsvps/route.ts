import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { id: true },
  });

  if (!member) return NextResponse.json({ rsvps: [] });

  const rsvps = await db.rSVP.findMany({
    where: { workspaceId, memberId: member.id },
    include: {
      event: { select: { title: true, startAt: true, location: true, slug: true } },
      tier: { select: { name: true } },
    },
    orderBy: [{ event: { startAt: 'desc' } }],
  });

  const serialized = rsvps.map((r) => ({
    id: r.id,
    ticketStatus: r.ticketStatus,
    paymentStatus: r.paymentStatus,
    isComp: r.isComp,
    createdAt: r.createdAt.toISOString(),
    tierName: r.tier?.name ?? null,
    event: {
      title: r.event.title,
      startAt: r.event.startAt.toISOString(),
      location: r.event.location,
      slug: r.event.slug,
    },
  }));

  return NextResponse.json({ rsvps: serialized });
}
