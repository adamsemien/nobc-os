/**
 * POST /api/media/dam/assets/bulk — bulk operations on selected assets (STAFF).
 * actions: flagSelect | addTags | removeTags | move | softDelete | restore |
 *          permanentDelete | reorder | setCredit | setSponsor.
 * Workspace-scoped. permanentDelete also removes R2 objects + decrements storageBytes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import { deleteObject } from '@/lib/dam/storage';
import { parseBulkAction } from '@/lib/dam/bulk';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const parsed = parseBulkAction(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { assetIds } = parsed;
  const scope = { id: { in: assetIds }, workspaceId };

  switch (parsed.action) {
    case 'flagSelect':
      await db.asset.updateMany({ where: scope, data: { isSelect: parsed.payload.value } });
      break;
    case 'addTags': {
      const rows = await db.asset.findMany({ where: scope, select: { id: true, tags: true } });
      await db.$transaction(
        rows.map((a) =>
          db.asset.update({
            where: { id: a.id },
            data: { tags: Array.from(new Set([...a.tags, ...parsed.payload.tags])) },
          }),
        ),
      );
      break;
    }
    case 'move':
      await db.asset.updateMany({ where: scope, data: { folderId: parsed.payload.folderId } });
      break;
    case 'softDelete':
      await db.asset.updateMany({ where: { ...scope, deletedAt: null }, data: { deletedAt: new Date() } });
      break;
    case 'restore':
      await db.asset.updateMany({ where: scope, data: { deletedAt: null } });
      break;
    case 'permanentDelete': {
      const rows = await db.asset.findMany({
        where: scope,
        select: { id: true, url: true, thumbnailUrl: true, size: true },
      });
      await Promise.allSettled(rows.flatMap((a) => [deleteObject(a.url), deleteObject(a.thumbnailUrl)]));
      const totalBytes = rows.reduce((s, a) => s + a.size, 0);
      await db.$transaction([
        db.asset.deleteMany({ where: { id: { in: rows.map((a) => a.id) }, workspaceId } }),
        db.workspace.update({
          where: { id: workspaceId },
          data: { storageBytes: { decrement: BigInt(totalBytes) } },
        }),
      ]);
      break;
    }
    case 'reorder':
      await db.$transaction(
        parsed.payload.orderedIds.map((id, i) =>
          db.asset.updateMany({ where: { id, workspaceId }, data: { sortOrder: i } }),
        ),
      );
      break;
    case 'removeTags': {
      const rows = await db.asset.findMany({ where: scope, select: { id: true, tags: true } });
      const toRemove = new Set(parsed.payload.tags);
      await db.$transaction(
        rows.map((a) =>
          db.asset.update({
            where: { id: a.id },
            data: { tags: a.tags.filter((t) => !toRemove.has(t)) },
          }),
        ),
      );
      break;
    }
    case 'setCredit':
      // Empty string clears the credit (null-like, consistent with optional String? field).
      await db.asset.updateMany({
        where: scope,
        data: { shooterCredit: parsed.payload.credit || null },
      });
      break;
    case 'setSponsor':
      // Empty string clears the sponsor.
      await db.asset.updateMany({
        where: scope,
        data: { sponsorName: parsed.payload.sponsor || null },
      });
      break;
  }

  // Lifecycle mutations leave one batch-level audit row (item #20 posture —
  // the rest of the operator API audits its writes; DAM's did not).
  const lifecycleAudit: Record<string, string> = {
    softDelete: 'asset.trashed',
    restore: 'asset.restored',
    permanentDelete: 'asset.purged',
  };
  const auditAction = lifecycleAudit[parsed.action];
  if (auditAction) {
    await emitEvent({
      workspaceId,
      actorId: userId,
      action: auditAction,
      entityType: 'ASSET',
      entityId: assetIds[0],
      metadata: { count: assetIds.length, assetIds: assetIds.slice(0, 50).join(',') },
    });
  }

  return NextResponse.json({ ok: true, count: assetIds.length });
}
