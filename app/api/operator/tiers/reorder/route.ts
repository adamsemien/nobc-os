import { OperatorRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';

const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

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
