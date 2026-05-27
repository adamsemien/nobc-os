/**
 * PATCH /api/media/dam/asset/[id] — inline single-asset metadata edit (STAFF).
 * Editable: tags, isSelect, shooterCredit, sponsorName, eventId. Workspace-scoped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await ctx.params;

  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const data: Prisma.AssetUpdateInput = {};
  if (Array.isArray(b.tags)) data.tags = b.tags.filter((t: unknown): t is string => typeof t === 'string');
  if (typeof b.isSelect === 'boolean') data.isSelect = b.isSelect;
  if (typeof b.shooterCredit === 'string' || b.shooterCredit === null) data.shooterCredit = b.shooterCredit;
  if (typeof b.sponsorName === 'string' || b.sponsorName === null) data.sponsorName = b.sponsorName;
  if (typeof b.eventId === 'string' || b.eventId === null) data.eventId = b.eventId;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No editable fields' }, { status: 400 });

  const result = await db.asset.updateMany({ where: { id, workspaceId }, data });
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const asset = await db.asset.findFirst({ where: { id, workspaceId } });
  return NextResponse.json({ asset });
}
