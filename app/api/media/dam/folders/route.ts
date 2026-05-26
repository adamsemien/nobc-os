/**
 * GET /api/media/dam/folders — workspace-scoped folder tree + per-folder asset
 * counts + a trash count, for the operator folder sidebar. READ_ONLY+.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, MediaFolderType } from '@prisma/client';
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

/** Create a folder (move-to-folder target + batch-upload auto-create). STAFF. */
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const b = await req.json().catch(() => null);
  const name = typeof b?.name === 'string' ? b.name.trim() : '';
  const type = b?.type as MediaFolderType;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!Object.values(MediaFolderType).includes(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }

  const folder = await db.mediaFolder.create({
    data: {
      workspaceId,
      name,
      type,
      eventId: typeof b.eventId === 'string' ? b.eventId : null,
      parentId: typeof b.parentId === 'string' ? b.parentId : null,
    },
  });
  return NextResponse.json({ folder }, { status: 201 });
}
