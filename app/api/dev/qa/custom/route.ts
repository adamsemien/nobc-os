import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const POINTS_PER_STEP = 15;

interface CustomStep {
  id: string;
  instruction: string;
  checkpoint: string;
  points: number;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workspaceId = await requireWorkspaceId(userId);

  let body: { scenario?: string; steps?: string[] } = {};
  try {
    body = await req.json();
  } catch {}

  const rawSteps = Array.isArray(body.steps) ? body.steps : [];
  const cleaned = rawSteps
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0 && s.length <= 500);

  if (cleaned.length === 0) {
    return NextResponse.json({ error: 'Add at least one step.' }, { status: 400 });
  }
  if (cleaned.length > 20) {
    return NextResponse.json({ error: 'Max 20 steps per checklist.' }, { status: 400 });
  }

  const scenario =
    typeof body.scenario === 'string' && body.scenario.trim()
      ? body.scenario.trim().slice(0, 1000)
      : 'Custom checklist — tick off each step as you go.';

  const steps: CustomStep[] = cleaned.map((instruction, i) => ({
    id: `step-${i + 1}`,
    instruction,
    checkpoint: `manual:${instruction.slice(0, 80)}`,
    points: POINTS_PER_STEP,
  }));

  // Abandon any existing active mission for this operator.
  await db.qAMission.updateMany({
    where: { workspaceId, operatorId: userId, status: 'active' },
    data: { status: 'abandoned', completedAt: new Date() },
  });

  const user = await currentUser();
  const operatorName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : (user?.username ?? user?.emailAddresses?.[0]?.emailAddress ?? 'Operator');

  const created = await db.qAMission.create({
    data: {
      workspaceId,
      operatorId: userId,
      operatorName,
      scenario,
      missionType: 'custom',
      difficulty: 'custom',
      targetSteps: steps as unknown as object,
    },
  });

  return NextResponse.json({
    mission: {
      id: created.id,
      scenario: created.scenario,
      missionType: created.missionType,
      difficulty: created.difficulty,
      steps,
      timeLimit: null,
      bonusObjective: null,
      completedSteps: [],
      score: 0,
      bugsFound: [],
      status: created.status,
      startedAt: created.startedAt.toISOString(),
    },
  });
}
