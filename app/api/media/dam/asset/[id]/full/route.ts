/**
 * GET /api/media/dam/asset/[id]/full — full-res display for the preview modal.
 * Workspace-checked, 302 → signed full-res R2 URL (24h TTL). READ_ONLY+.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { DOWNLOAD_URL_TTL, presignGet } from '@/lib/dam/storage';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await ctx.params;

  const asset = await db.asset.findFirst({ where: { id, workspaceId }, select: { url: true } });
  if (!asset?.url) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = await presignGet(asset.url, DOWNLOAD_URL_TTL);
  if (!url) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  return NextResponse.redirect(url, 302);
}
