import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

interface BugReport {
  id: string;
  description: string;
  location: string;
  screenshotUrl?: string;
  reportedAt: string;
}

interface FlatBug extends BugReport {
  missionId: string;
  operatorName: string;
  missionType: string;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const workspaceId = await requireWorkspaceId(userId);

  const rows = await db.qAMission.findMany({
    where: { workspaceId, bugsFound: { not: [] as unknown as object } },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      operatorName: true,
      missionType: true,
      bugsFound: true,
    },
  });

  const flat: FlatBug[] = [];
  for (const m of rows) {
    const bugs = (m.bugsFound as unknown as BugReport[]) ?? [];
    for (const b of bugs) {
      flat.push({
        ...b,
        missionId: m.id,
        operatorName: m.operatorName,
        missionType: m.missionType,
      });
    }
  }
  flat.sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : -1));

  return NextResponse.json({ bugs: flat });
}
