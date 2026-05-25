import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { approveApplication } from '@/lib/applications/approve';
import { emitEvent } from '@/lib/emit-event';

const PostSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  action: z.enum(['approve', 'reject', 'hold', 'waitlist']),
  reason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let payload: unknown;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const { ids, action, reason, note } = parsed.data;

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const app = await db.application.findUnique({ where: { id } });
      if (!app || app.workspaceId !== workspaceId) {
        failed.push({ id, error: 'not_found' });
        continue;
      }

      if (action === 'approve') {
        const out = await approveApplication({
          applicationId: id,
          workspaceId,
          actorId: userId,
          reviewNote: note,
        });
        if (!out.ok) {
          failed.push({ id, error: out.error });
        } else {
          succeeded.push(id);
        }
      } else if (action === 'reject') {
        if (app.status === 'APPROVED') {
          failed.push({ id, error: 'already_approved' });
          continue;
        }
        if (app.status === 'REJECTED') {
          failed.push({ id, error: 'already_rejected' });
          continue;
        }
        await db.application.update({
          where: { id },
          data: {
            status: 'REJECTED',
            reviewedAt: new Date(),
            reviewedBy: userId,
            rejectionReason: reason ?? null,
            reviewNote: note ?? null,
          },
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          action: 'application.rejected',
          entityType: 'APPLICATION',
          entityId: id,
          metadata: { reason: reason ?? null, bulk: true },
        });
        succeeded.push(id);
      } else if (action === 'hold' || action === 'waitlist') {
        const newStatus = action === 'hold' ? 'HOLD' : 'WAITLISTED';
        await db.application.update({
          where: { id },
          data: {
            status: newStatus,
            reviewedAt: new Date(),
            reviewedBy: userId,
            reviewNote: note ?? null,
          },
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          action: `application.${action}`,
          entityType: 'APPLICATION',
          entityId: id,
          metadata: { bulk: true },
        });
        succeeded.push(id);
      }
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    succeeded: succeeded.length,
    failed: failed.length,
    failures: failed,
  });
}
