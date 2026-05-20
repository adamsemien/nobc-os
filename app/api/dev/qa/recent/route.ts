import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function GET() {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workspaceId = await requireWorkspaceId(userId);

  const rows = await db.qAMission.findMany({
    where: {
      workspaceId,
      operatorId: userId,
      status: { in: ['completed', 'abandoned'] },
    },
    orderBy: { completedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      missionType: true,
      difficulty: true,
      score: true,
      status: true,
      durationMs: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ recent: rows });
}
