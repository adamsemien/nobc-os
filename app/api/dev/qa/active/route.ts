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

  const mission = await db.qAMission.findFirst({
    where: { workspaceId, operatorId: userId, status: 'active' },
    orderBy: { startedAt: 'desc' },
  });

  if (!mission) return NextResponse.json({ mission: null });

  return NextResponse.json({
    mission: {
      id: mission.id,
      scenario: mission.scenario,
      missionType: mission.missionType,
      difficulty: mission.difficulty,
      steps: mission.targetSteps,
      completedSteps: mission.completedSteps,
      score: mission.score,
      bugsFound: mission.bugsFound,
      status: mission.status,
      startedAt: mission.startedAt.toISOString(),
    },
  });
}
