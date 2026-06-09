import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';

  const members = await db.member.findMany({
    where: {
      workspaceId,
      status: { not: 'GUEST' },
      mergedIntoId: null,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      tags: true,
      companyName: true,
      energyScore: true,
      networkValueScore: true,
      totalEventsAttended: true,
      lastAttendedDate: true,
      createdAt: true,
    },
  });

  // Pull archetype + aiScore via Application by email — Member doesn't store these.
  const emails = members.map((m) => m.email.toLowerCase());
  const apps =
    emails.length === 0
      ? []
      : await db.application.findMany({
          where: { workspaceId, email: { in: emails, mode: 'insensitive' } },
          select: { email: true, archetype: true, aiScore: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
  const byEmail = new Map<string, { archetype: string | null; aiScore: number | null }>();
  for (const a of apps) {
    const key = a.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { archetype: a.archetype, aiScore: a.aiScore });
  }

  const watch = await db.watchList.findMany({
    where: { workspaceId, deletedAt: null, matchEmail: { in: emails, mode: 'insensitive' } },
    select: { matchEmail: true, type: true },
  });
  const vipSet = new Set<string>();
  const blockedSet = new Set<string>();
  for (const w of watch) {
    if (!w.matchEmail) continue;
    const key = w.matchEmail.toLowerCase();
    if (w.type === 'PURPLE') vipSet.add(key);
    if (w.type === 'BLOCKED') blockedSet.add(key);
  }

  return NextResponse.json({
    members: members.map((m) => {
      const key = m.email.toLowerCase();
      const enrich = byEmail.get(key);
      return {
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        fullName: `${m.firstName} ${m.lastName}`.trim() || m.email,
        email: m.email,
        status: m.status,
        companyName: m.companyName,
        archetype: enrich?.archetype ?? null,
        aiScore: enrich?.aiScore ?? null,
        totalEventsAttended: m.totalEventsAttended,
        lastAttendedDate: m.lastAttendedDate?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        isVip: vipSet.has(key),
        isBlocked: blockedSet.has(key),
      };
    }),
  });
}
