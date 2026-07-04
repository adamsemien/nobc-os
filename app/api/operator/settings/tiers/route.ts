import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';

import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requirePermission } from '@/lib/operator-role';
import { resolveTierNames, DEFAULT_TIER_NAMES } from '@/lib/score-display';
import { emitEvent } from '@/lib/emit-event';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { tierNames: true } });
  return NextResponse.json({
    tierNames: resolveTierNames(w?.tierNames),
    defaults: DEFAULT_TIER_NAMES,
  });
}

const BodySchema = z.object({
  top: z.string().trim().min(1).max(40),
  mid: z.string().trim().min(1).max(40),
  low: z.string().trim().min(1).max(40),
});

export async function PUT(req: NextRequest) {
  const gate = await requirePermission('settings.edit');
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }

  await db.workspace.update({
    where: { id: workspaceId },
    data: { tierNames: parsed.data },
  });

  await emitEvent({
    workspaceId,
    action: 'workspace.tiers_renamed',
    actorType: 'OPERATOR',
    entityType: 'Workspace',
    entityId: workspaceId,
    metadata: parsed.data,
  });

  return NextResponse.json({ ok: true, tierNames: parsed.data });
}
