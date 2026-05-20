import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const { ids } = parsed.data;

  // Verify every id belongs to this workspace (cheap — full scan of workspace tiers).
  const tiers = await db.membershipTier.findMany({
    where: { workspaceId, deletedAt: null, id: { in: ids } },
    select: { id: true },
  });
  if (tiers.length !== ids.length) {
    return NextResponse.json({ error: 'Unknown tier id' }, { status: 422 });
  }

  await db.$transaction(
    ids.map((id, order) =>
      db.membershipTier.update({ where: { id }, data: { order } }),
    ),
  );
  return NextResponse.json({ ok: true });
}
