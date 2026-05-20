import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const MAX_PER_TYPE = 5;

export type SearchHit = {
  type: 'member' | 'application' | 'event';
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
};

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const insensitive = { contains: q, mode: 'insensitive' as const };

  const [members, applications, events] = await Promise.all([
    db.member.findMany({
      where: {
        workspaceId,
        status: { not: 'GUEST' },
        OR: [
          { firstName: insensitive },
          { lastName: insensitive },
          { email: insensitive },
        ],
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: MAX_PER_TYPE,
    }),
    db.application.findMany({
      where: {
        workspaceId,
        OR: [
          { fullName: insensitive },
          { email: insensitive },
          { city: insensitive },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_PER_TYPE,
    }),
    db.event.findMany({
      where: {
        workspaceId,
        OR: [{ title: insensitive }],
      },
      select: { id: true, title: true, startAt: true, status: true },
      orderBy: { startAt: 'desc' },
      take: MAX_PER_TYPE,
    }),
  ]);

  const hits: SearchHit[] = [];
  for (const m of members) {
    hits.push({
      type: 'member',
      id: m.id,
      label: `${m.firstName} ${m.lastName}`.trim() || m.email,
      sublabel: m.email,
      href: `/operator/members/${m.id}`,
    });
  }
  for (const a of applications) {
    hits.push({
      type: 'application',
      id: a.id,
      label: a.fullName,
      sublabel: `${a.status.toLowerCase()} · ${a.email}`,
      href: `/operator/applications/${a.id}`,
    });
  }
  for (const e of events) {
    const dt = new Date(e.startAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    hits.push({
      type: 'event',
      id: e.id,
      label: e.title,
      sublabel: `${e.status.toLowerCase()} · ${dt}`,
      href: `/operator/events/${e.id}`,
    });
  }

  return NextResponse.json({ hits });
}
