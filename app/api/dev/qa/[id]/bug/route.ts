import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type BugSeverity = 'low' | 'medium' | 'high';

interface BugReport {
  id: string;
  description: string;
  location: string;
  screenshotUrl?: string;
  reportedAt: string;
  pointsAwarded: number;
  stepIndex?: number | null;
  stepTitle?: string | null;
  severity?: BugSeverity;
}

const BUG_POINTS = 25;
const VALID_SEVERITY = new Set<BugSeverity>(['low', 'medium', 'high']);

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
    description?: string;
    location?: string;
    screenshotUrl?: string;
    stepIndex?: number | null;
    stepTitle?: string | null;
    severity?: string;
  } = {};
  try {
    body = await req.json();
  } catch {}

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 });
  if (description.length > 2000) {
    return NextResponse.json({ error: 'description too long' }, { status: 400 });
  }
  const stepIndex =
    typeof body.stepIndex === 'number' && Number.isFinite(body.stepIndex) && body.stepIndex >= 0
      ? Math.floor(body.stepIndex)
      : null;
  const stepTitle =
    typeof body.stepTitle === 'string' && body.stepTitle.trim()
      ? body.stepTitle.trim().slice(0, 300)
      : null;
  const severity: BugSeverity = VALID_SEVERITY.has(body.severity as BugSeverity)
    ? (body.severity as BugSeverity)
    : 'medium';

  const mission = await db.qAMission.findFirst({
    where: { id, workspaceId, operatorId: userId, status: 'active' },
  });
  if (!mission) {
    return NextResponse.json({ error: 'Mission not found or not active' }, { status: 404 });
  }

  const bugs = (mission.bugsFound as unknown as BugReport[]) ?? [];
  const next: BugReport = {
    id: `bug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    description: description.slice(0, 2000),
    location: location.slice(0, 300) || 'unknown',
    screenshotUrl:
      typeof body.screenshotUrl === 'string' && body.screenshotUrl.startsWith('https://')
        ? body.screenshotUrl.slice(0, 500)
        : undefined,
    reportedAt: new Date().toISOString(),
    pointsAwarded: BUG_POINTS,
    stepIndex,
    stepTitle,
    severity,
  };

  const updated = await db.qAMission.update({
    where: { id },
    data: {
      bugsFound: [...bugs, next] as unknown as object,
      score: { increment: BUG_POINTS },
    },
  });

  return NextResponse.json({
    ok: true,
    score: updated.score,
    bugsFound: updated.bugsFound,
  });
}
