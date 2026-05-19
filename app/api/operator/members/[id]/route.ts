import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const member = await db.member.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      tags: true,
      energyScore: true,
      networkValueScore: true,
      aiSummary: true,
      totalEventsAttended: true,
      lastAttendedDate: true,
      createdAt: true,
      approvedAt: true,
    },
  });
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [application, rsvps, watchEntry] = await Promise.all([
    db.application.findFirst({
      where: { workspaceId, email: { equals: member.email, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        archetype: true,
        archetypeScores: true,
        aiScore: true,
        aiReasoning: true,
        aiRecommendation: true,
        city: true,
        neighborhood: true,
        referredBy: true,
        createdAt: true,
        status: true,
      },
    }),
    db.rSVP.findMany({
      where: { workspaceId, memberId: id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        status: true,
        checkedIn: true,
        checkedInAt: true,
        event: { select: { id: true, title: true, startAt: true, slug: true } },
      },
    }),
    db.watchList.findFirst({
      where: { workspaceId, deletedAt: null, matchEmail: { equals: member.email, mode: 'insensitive' } },
      select: { type: true, note: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    member: {
      ...member,
      lastAttendedDate: member.lastAttendedDate?.toISOString() ?? null,
      createdAt: member.createdAt.toISOString(),
      approvedAt: member.approvedAt?.toISOString() ?? null,
    },
    application,
    rsvps: rsvps.map((r) => ({
      id: r.id,
      status: r.status,
      checkedIn: r.checkedIn,
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
      event: {
        id: r.event.id,
        title: r.event.title,
        slug: r.event.slug,
        startAt: r.event.startAt.toISOString(),
      },
    })),
    watch: watchEntry,
  });
}
