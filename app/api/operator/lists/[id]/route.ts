import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const entry = await db.watchList.findFirst({
    where: { id, workspaceId, deletedAt: null },
    select: { id: true, type: true },
  });
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.watchList.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: `watchlist.${entry.type.toLowerCase()}.removed`,
      entityType: 'WatchList',
      entityId: id,
    },
  });

  return NextResponse.json({ ok: true });
}
