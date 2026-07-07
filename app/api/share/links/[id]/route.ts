/**
 * DELETE a ShareLink. STAFF-gated, workspace-scoped.
 *
 * The auto-created wrapper folder (if any) is intentionally left in place — the
 * operator may want to keep the curated selection even after revoking access.
 * AssetDownload rows referencing this link are kept but their `shareLinkId` is
 * nulled so the audit row survives without the FK.
 */
import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const link = await db.shareLink.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.$transaction([
    db.assetDownload.updateMany({ where: { shareLinkId: id }, data: { shareLinkId: null } }),
    db.shareLink.delete({ where: { id } }),
  ]);

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'share.revoked',
    entityType: 'SHARE_LINK',
    entityId: id,
  });

  return NextResponse.json({ success: true });
}
