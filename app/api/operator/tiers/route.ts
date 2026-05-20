import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export type TierRow = {
  id: string;
  name: string;
  order: number;
  minScore: number | null;
  color: string | null;
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const tiers = await db.membershipTier.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { order: 'asc' },
    select: { id: true, name: true, order: true, minScore: true, color: true },
  });
  return NextResponse.json({ tiers });
}

const PostSchema = z.object({
  name: z.string().trim().min(1).max(40),
  minScore: z.number().min(0).max(1).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // New tier appends at the end.
  const last = await db.membershipTier.findFirst({
    where: { workspaceId, deletedAt: null },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const tier = await db.membershipTier.create({
    data: {
      workspaceId,
      name: parsed.data.name,
      order: nextOrder,
      minScore: parsed.data.minScore ?? null,
      color: parsed.data.color ?? null,
    },
  });
  return NextResponse.json({ tier }, { status: 201 });
}
