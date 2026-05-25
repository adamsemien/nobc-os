import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { z } from 'zod';

const QuestionSchema = z.object({
  label: z.string().min(1),
  type: z.string(),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
});

const CreateSchema = z.object({
  name: z.string().min(1),
  accessMode: z.string(),
  applyMode: z.string().optional().nullable(),
  priceInCents: z.number().int().nonnegative().optional().nullable(),
  nonMemberPriceInCents: z.number().int().nonnegative().optional().nullable(),
  approvalRequired: z.boolean().default(false),
  plusOnesAllowed: z.boolean().default(false),
  showCapacity: z.boolean().default(false),
  customQuestions: z.array(QuestionSchema).default([]),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const templates = await db.eventFlowTemplate.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { name, accessMode, applyMode, priceInCents, nonMemberPriceInCents,
    approvalRequired, plusOnesAllowed, showCapacity, customQuestions } = parsed.data;

  const template = await db.eventFlowTemplate.create({
    data: {
      workspaceId,
      name,
      accessMode,
      applyMode: applyMode ?? null,
      priceInCents: priceInCents ?? null,
      nonMemberPriceInCents: nonMemberPriceInCents ?? null,
      approvalRequired,
      plusOnesAllowed,
      showCapacity,
      customQuestions,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
