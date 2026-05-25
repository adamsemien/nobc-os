import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';

const FaqItemSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(2000),
});

const BodySchema = z.object({
  faq: z.array(FaqItemSchema).min(0).max(30),
});

const KEY = 'help.member.faq';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const row = await db.platformSetting.findUnique({
    where: { workspaceId_key: { workspaceId, key: KEY } },
    select: { value: true },
  });
  let faq: Array<{ question: string; answer: string }> = [];
  if (row?.value) {
    try { faq = JSON.parse(row.value); } catch { faq = []; }
  }
  return NextResponse.json({ faq });
}

export async function PUT(req: NextRequest) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }

  const json = JSON.stringify(parsed.data.faq);
  await db.platformSetting.upsert({
    where: { workspaceId_key: { workspaceId, key: KEY } },
    update: { value: json },
    create: {
      workspaceId,
      key: KEY,
      value: json,
      type: 'json',
      description: 'Member-facing FAQ rendered at /m/help.',
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'help_faq.updated',
      entityType: 'PLATFORM_SETTING',
      entityId: KEY,
      metadata: { items: parsed.data.faq.length },
    },
  });

  return NextResponse.json({ ok: true });
}
