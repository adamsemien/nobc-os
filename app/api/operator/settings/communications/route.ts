import { auth } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requirePermission } from '@/lib/operator-role';
import { ensureCommunicationsSeed } from '@/lib/ensure-communications';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  await ensureCommunicationsSeed(workspaceId);

  const [templates, settings] = await Promise.all([
    db.emailTemplate.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        subject: true,
        bodyHtml: true,
        bodyText: true,
        variables: true,
        editorConfig: true,
        enabled: true,
        updatedAt: true,
      },
    }),
    db.platformSetting.findMany({
      where: { workspaceId },
      orderBy: { key: 'asc' },
      select: { id: true, key: true, value: true, type: true, description: true },
    }),
  ]);

  return NextResponse.json({ templates, settings });
}

const TemplatePatchSchema = z.object({
  id: z.string(),
  subject: z.string().trim().min(1).max(200),
  // 200k: rich-editor output is table-layout HTML, far more verbose than the
  // hand-written string templates the old 60k cap was sized for.
  bodyHtml: z.string().min(1).max(200_000),
  bodyText: z.string().min(1).max(60_000),
  enabled: z.boolean(),
  // TipTap document from the rich editor (event.reminder slice). Optional and
  // additive: the plain string editor never sends it.
  editorConfig: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: NextRequest) {
  const gate = await requirePermission('settings.edit');
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = TemplatePatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const existing = await db.emailTemplate.findFirst({
    where: { id: parsed.data.id, workspaceId },
    select: { id: true, key: true },
  });
  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  await db.emailTemplate.update({
    where: { id: existing.id },
    data: {
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
      bodyText: parsed.data.bodyText,
      enabled: parsed.data.enabled,
      updatedBy: userId,
      // Only rich-editor saves carry editorConfig; string-editor saves omit it
      // and must not clobber a previously saved document.
      ...(parsed.data.editorConfig !== undefined
        ? { editorConfig: parsed.data.editorConfig as Prisma.InputJsonValue }
        : {}),
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'email_template.updated',
      entityType: 'EMAIL_TEMPLATE',
      entityId: existing.id,
      metadata: { key: existing.key, enabled: parsed.data.enabled },
    },
  });

  return NextResponse.json({ ok: true });
}
