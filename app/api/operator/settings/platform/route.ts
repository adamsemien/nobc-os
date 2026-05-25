import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';

const BodySchema = z.object({
  key: z.string().trim().min(1),
  value: z.string().trim().max(500),
});

export async function PATCH(req: NextRequest) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 422 });

  const existing = await db.platformSetting.findUnique({
    where: { workspaceId_key: { workspaceId, key: parsed.data.key } },
    select: { id: true, type: true },
  });
  if (!existing) return NextResponse.json({ error: 'Setting not found' }, { status: 404 });

  if (existing.type === 'boolean' && !['true', 'false'].includes(parsed.data.value)) {
    return NextResponse.json({ error: 'Boolean settings must be "true" or "false"' }, { status: 422 });
  }
  if (existing.type === 'time' && !/^\d{2}:\d{2}$/.test(parsed.data.value)) {
    return NextResponse.json({ error: 'Time must be HH:MM' }, { status: 422 });
  }

  await db.platformSetting.update({
    where: { id: existing.id },
    data: { value: parsed.data.value },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'platform_setting.updated',
      entityType: 'PLATFORM_SETTING',
      entityId: existing.id,
      metadata: { key: parsed.data.key, value: parsed.data.value },
    },
  });

  return NextResponse.json({ ok: true });
}
