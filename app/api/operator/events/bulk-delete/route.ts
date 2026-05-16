import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 422 });
  }

  const { ids } = parsed.data;

  const events = await db.event.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { id: true, title: true },
  });

  if (events.length === 0) {
    return NextResponse.json({ error: 'No matching events found' }, { status: 404 });
  }

  const validIds = events.map(e => e.id);

  await db.$transaction([
    db.rSVP.deleteMany({ where: { eventId: { in: validIds }, workspaceId } }),
    db.auditEvent.deleteMany({ where: { entityType: 'EVENT', entityId: { in: validIds }, workspaceId } }),
    db.event.deleteMany({ where: { id: { in: validIds }, workspaceId } }),
  ]);

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'event.bulk_deleted',
      entityType: 'EVENT',
      entityId: validIds[0],
      metadata: { deletedIds: validIds, titles: events.map(e => e.title) },
    },
  });

  return NextResponse.json({ ok: true, deleted: validIds.length });
}
