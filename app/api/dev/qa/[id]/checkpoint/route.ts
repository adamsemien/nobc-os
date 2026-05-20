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
  instruction: string;
  checkpoint: string;
  points: number;
}

type Verdict = 'pass' | 'partial' | 'fail';
const VALID_VERDICTS = new Set<Verdict>(['pass', 'partial', 'fail']);

interface CompletedStep {
  id: string;
  completedAt: string;
  evidence?: string;
  pointsAwarded: number;
  source: 'auto' | 'manual';
  verdict?: Verdict | null;
  verdictReason?: string | null;
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

  let body: {
    stepId?: string;
    success?: boolean;
    evidence?: string;
    source?: 'auto' | 'manual';
    skip?: boolean;
    /** True-skip: advance without marking pass/fail. Awards 0 points. */
    softSkip?: boolean;
    verdict?: Verdict | null;
    verdictReason?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {}

  const stepId = typeof body.stepId === 'string' ? body.stepId : null;
  if (!stepId) return NextResponse.json({ error: 'stepId required' }, { status: 400 });
  if (body.success === false) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  const SKIP_COST = 10;
  const isSkip = body.skip === true;
  const isSoftSkip = body.softSkip === true;

  const mission = await db.qAMission.findFirst({
    where: { id, workspaceId, operatorId: userId, status: 'active' },
  });
  if (!mission) {
    return NextResponse.json({ error: 'Mission not found or not active' }, { status: 404 });
  }

  const target = (mission.targetSteps as unknown as TargetStep[]) ?? [];
  const step = target.find((s) => s.id === stepId);
  if (!step) return NextResponse.json({ error: 'Unknown step' }, { status: 400 });

  const completed = (mission.completedSteps as unknown as CompletedStep[]) ?? [];
  if (completed.some((c) => c.id === stepId)) {
    return NextResponse.json({
      ok: true,
      alreadyComplete: true,
      score: mission.score,
      completedSteps: completed,
    });
  }

  const delta = isSoftSkip ? 0 : isSkip ? -SKIP_COST : step.points;
  const verdict: Verdict | null =
    typeof body.verdict === 'string' && VALID_VERDICTS.has(body.verdict as Verdict)
      ? (body.verdict as Verdict)
      : null;
  const verdictReason =
    typeof body.verdictReason === 'string' && body.verdictReason.trim()
      ? body.verdictReason.slice(0, 240).trim()
      : null;
  const next: CompletedStep = {
    id: stepId,
    completedAt: new Date().toISOString(),
    evidence: isSoftSkip
      ? 'soft-skipped'
      : isSkip
      ? 'skipped'
      : typeof body.evidence === 'string'
      ? body.evidence.slice(0, 500)
      : undefined,
    pointsAwarded: delta,
    source: body.source === 'manual' ? 'manual' : 'auto',
    verdict,
    verdictReason,
  };

  const updated = await db.qAMission.update({
    where: { id },
    data: {
      completedSteps: [...completed, next] as unknown as object,
      score: { increment: delta },
    },
  });

  return NextResponse.json({
    ok: true,
    score: updated.score,
    completedSteps: updated.completedSteps,
  });
}
