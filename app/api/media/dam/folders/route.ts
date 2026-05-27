/**
 * GET /api/media/dam/folders — workspace-scoped folder tree + per-folder asset
 * counts + a trash count, for the operator folder sidebar. READ_ONLY+.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const folders = await db.mediaFolder.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, name: true, type: true, eventId: true, parentId: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const grouped = await db.asset.groupBy({
    by: ['folderId'],
    where: { workspaceId, deletedAt: null },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) if (g.folderId) counts[g.folderId] = g._count._all;

  const trashCount = await db.asset.count({
    where: { workspaceId, deletedAt: { not: null } },
  });

  return NextResponse.json({ folders, counts, trashCount });
}
