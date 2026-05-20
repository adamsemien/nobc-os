import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { emitEvent } from '@/lib/emit-event';

const PostSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['purple', 'unpurple', 'block', 'unblock', 'tag', 'untag']),
  tag: z.string().trim().min(1).max(40).optional(),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  let payload: unknown;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const { ids, action, tag } = parsed.data;

  if ((action === 'tag' || action === 'untag') && !tag) {
    return NextResponse.json({ error: 'Tag value required' }, { status: 422 });
  }

  const members = await db.member.findMany({
    where: { workspaceId, id: { in: ids } },
    select: { id: true, email: true, phone: true, tags: true, redListed: true },
  });
  const idSet = new Set(members.map((m) => m.id));
  const missing = ids.filter((id) => !idSet.has(id));

  let succeeded = 0;
  const failed: { id: string; error: string }[] = missing.map((id) => ({
    id,
    error: 'not_found',
  }));

  for (const m of members) {
    try {
      if (action === 'purple') {
        // Add a PURPLE WatchList row matched by email (idempotent via deletedAt check)
        const existing = await db.watchList.findFirst({
          where: {
            workspaceId,
            type: 'PURPLE',
            matchEmail: m.email,
            deletedAt: null,
          },
        });
        if (!existing) {
          await db.watchList.create({
            data: {
              workspaceId,
              type: 'PURPLE',
              matchEmail: m.email,
              createdBy: userId,
            },
          });
        }
        await emitEvent({
          workspaceId,
          actorId: userId,
          action: 'member.purple_added',
          entityType: 'MEMBER',
          entityId: m.id,
          metadata: { bulk: true },
        });
        succeeded++;
      } else if (action === 'unpurple') {
        await db.watchList.updateMany({
          where: {
            workspaceId,
            type: 'PURPLE',
            matchEmail: m.email,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          action: 'member.purple_removed',
          entityType: 'MEMBER',
          entityId: m.id,
          metadata: { bulk: true },
        });
        succeeded++;
      } else if (action === 'block') {
        await db.member.update({
          where: { id: m.id },
          data: { redListed: true },
        });
        const existing = await db.watchList.findFirst({
          where: {
            workspaceId,
            type: 'BLOCKED',
            matchEmail: m.email,
            deletedAt: null,
          },
        });
        if (!existing) {
          await db.watchList.create({
            data: {
              workspaceId,
              type: 'BLOCKED',
              matchEmail: m.email,
              createdBy: userId,
            },
          });
        }
        await emitEvent({
          workspaceId,
          actorId: userId,
          action: 'member.blocked',
          entityType: 'MEMBER',
          entityId: m.id,
          metadata: { bulk: true },
        });
        succeeded++;
      } else if (action === 'unblock') {
        await db.member.update({
          where: { id: m.id },
          data: { redListed: false },
        });
        await db.watchList.updateMany({
          where: {
            workspaceId,
            type: 'BLOCKED',
            matchEmail: m.email,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          action: 'member.unblocked',
          entityType: 'MEMBER',
          entityId: m.id,
          metadata: { bulk: true },
        });
        succeeded++;
      } else if (action === 'tag') {
        const next = Array.from(new Set([...m.tags, tag!]));
        await db.member.update({
          where: { id: m.id },
          data: { tags: next },
        });
        succeeded++;
      } else if (action === 'untag') {
        const next = m.tags.filter((t) => t !== tag);
        await db.member.update({
          where: { id: m.id },
          data: { tags: next },
        });
        succeeded++;
      }
    } catch (err) {
      failed.push({ id: m.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    succeeded,
    failed: failed.length,
    failures: failed,
  });
}
