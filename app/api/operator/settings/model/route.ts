import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { AI_MODELS, type AIModelId } from '@/lib/ai-models';

const VALID_IDS = AI_MODELS.map((m) => m.id) as [AIModelId, ...AIModelId[]];

const BodySchema = z.object({ model: z.enum(VALID_IDS) });

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiModel: true },
  });
  return NextResponse.json({ model: workspace?.aiModel ?? null });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid model' }, { status: 422 });

  await db.workspace.update({
    where: { id: workspaceId },
    data: { aiModel: parsed.data.model },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'settings.ai_model_updated',
      entityType: 'WORKSPACE',
      entityId: workspaceId,
      metadata: { model: parsed.data.model },
    },
  });

  return NextResponse.json({ ok: true, model: parsed.data.model });
}
