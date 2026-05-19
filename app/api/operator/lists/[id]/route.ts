import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
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
