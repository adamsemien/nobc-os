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

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // back to Sunday
  weekStart.setHours(0, 0, 0, 0);

  const rows = await db.qAMission.findMany({
    where: {
      workspaceId,
      status: 'completed',
      completedAt: { gte: weekStart },
    },
    orderBy: { score: 'desc' },
    take: 5,
    select: {
      id: true,
      operatorName: true,
      score: true,
      missionType: true,
      difficulty: true,
      durationMs: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ leaderboard: rows });
}
