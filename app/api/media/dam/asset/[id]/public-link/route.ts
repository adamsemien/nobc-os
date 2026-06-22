/**
 * GET /api/media/dam/asset/[id]/public-link — mint a stable public hotlink for an
 * asset (newsletter / external channel use). STAFF-gated, workspace-scoped. Returns
 * the base `/i/[token]` URL plus a per-channel-preset URL list. Photos only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { mintPublicAssetToken, isPublicLinkConfigured } from '@/lib/dam/public-link';
import { CHANNEL_PRESETS } from '@/lib/dam/channel-presets';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await ctx.params;

  if (!isPublicLinkConfigured()) {
    return NextResponse.json(
      { error: 'Public links not configured — set DAM_PUBLIC_LINK_SECRET' },
      { status: 503 },
    );
  }

  const asset = await db.asset.findFirst({
    where: { id, workspaceId, deletedAt: null },
    select: { id: true, fileType: true },
  });
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (asset.fileType !== 'PHOTO') {
    return NextResponse.json({ error: 'Public links are available for photos only' }, { status: 400 });
  }

  const token = mintPublicAssetToken({ workspaceId, assetId: asset.id });
  if (!token) {
    return NextResponse.json({ error: 'Public links not configured' }, { status: 503 });
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const url = `${base}/i/${token}`;
  return NextResponse.json({
    url,
    presets: CHANNEL_PRESETS.map((p) => ({
      key: p.key,
      label: p.label,
      url: `${url}?preset=${p.key}`,
    })),
  });
}
