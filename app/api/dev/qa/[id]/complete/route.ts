import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

interface TargetStep {
  id: string;
  points: number;
}

interface CompletedStep {
  id: string;
  pointsAwarded: number;
}

interface BugReport {
  description: string;
  pointsAwarded: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  let body: { feedback?: string; timeLimitSec?: number } = {};
  try {
    body = await req.json();
  } catch {}

  const mission = await db.qAMission.findFirst({
    where: { id, workspaceId, operatorId: userId, status: 'active' },
  });
  if (!mission) {
    return NextResponse.json({ error: 'Mission not found or not active' }, { status: 404 });
  }

  const now = new Date();
  const durationMs = now.getTime() - mission.startedAt.getTime();

  const target = (mission.targetSteps as unknown as TargetStep[]) ?? [];
  const completed = (mission.completedSteps as unknown as CompletedStep[]) ?? [];
  const bugs = (mission.bugsFound as unknown as BugReport[]) ?? [];

  let timeBonus = 0;
  if (
    typeof body.timeLimitSec === 'number' &&
    body.timeLimitSec > 0 &&
    durationMs <= body.timeLimitSec * 1000
  ) {
    const remainingSec = Math.max(0, body.timeLimitSec - durationMs / 1000);
    timeBonus = Math.round(remainingSec / 2); // half-point per remaining second
  }

  const completionBonus = completed.length === target.length && target.length > 0 ? 25 : 0;
  const totalScore = mission.score + timeBonus + completionBonus;

  const updated = await db.qAMission.update({
    where: { id },
    data: {
      status: 'completed',
      completedAt: now,
      durationMs,
      score: totalScore,
      feedback:
        typeof body.feedback === 'string' && body.feedback.trim()
          ? body.feedback.trim().slice(0, 4000)
          : null,
    },
  });

  return NextResponse.json({
    ok: true,
    mission: {
      id: updated.id,
      score: updated.score,
      durationMs,
      stepsCompleted: completed.length,
      stepsTotal: target.length,
      bugsFound: bugs.length,
      timeBonus,
      completionBonus,
      stepPoints: mission.score,
    },
  });
}
