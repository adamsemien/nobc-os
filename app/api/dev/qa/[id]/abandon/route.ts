import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const mission = await db.qAMission.findFirst({
    where: { id, workspaceId, operatorId: userId, status: 'active' },
  });
  if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

  const now = new Date();
  await db.qAMission.update({
    where: { id },
    data: { status: 'abandoned', completedAt: now, durationMs: now.getTime() - mission.startedAt.getTime() },
  });

  return NextResponse.json({ ok: true });
}
