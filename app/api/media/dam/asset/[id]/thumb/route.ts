/**
 * GET /api/media/dam/asset/[id]/thumb — stable thumbnail URL for the grid.
 * Checks workspace ownership, then 302-redirects to a short-lived signed R2 URL
 * (assets stay private; URLs never appear in JSON or expire mid-grid). READ_ONLY+.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { DISPLAY_URL_TTL, presignGet } from '@/lib/dam/storage';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const { id } = await ctx.params;
  const asset = await db.asset.findFirst({
    where: { id, workspaceId },
    select: { thumbnailUrl: true },
  });
  if (!asset?.thumbnailUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = await presignGet(asset.thumbnailUrl, DISPLAY_URL_TTL);
  if (!url) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  // Cache the redirect for the render session so a grid scroll doesn't re-mint a
  // signed URL + re-hit R2 on every tile remount. Kept well under DISPLAY_URL_TTL
  // (15m) so a cached redirect never outlives its signature.
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'private, max-age=600' },
  });
}
