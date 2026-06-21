/**
 * GET /i/[token] — public, stable image delivery for DAM assets (the newsletter /
 * external-channel hotlink). The token is an unguessable HMAC (see lib/dam/public-link);
 * the private R2 original is never exposed — we fetch it via a short-lived signed
 * URL and stream a Sharp-resized JPEG. Long, immutable cache headers let the
 * edge/CDN absorb repeat loads (email clients refetch on every open).
 *
 * Sizing: `?preset=ig-story` (named channel preset) wins; otherwise `?w` / `?h`
 * (+ optional `?fit=cover`). No size params → original dimensions, re-encoded.
 */
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { db } from '@/lib/db';
import { presignGet } from '@/lib/dam/storage';
import { verifyPublicAssetToken } from '@/lib/dam/public-link';
import { CHANNEL_PRESET_MAP, MAX_PUBLIC_DIMENSION, type ChannelFit } from '@/lib/dam/channel-presets';

export const runtime = 'nodejs';

function clampDim(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, MAX_PUBLIC_DIMENSION);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const scope = verifyPublicAssetToken(token);
  if (!scope) return new NextResponse('Not found', { status: 404 });

  const asset = await db.asset.findFirst({
    where: { id: scope.assetId, workspaceId: scope.workspaceId, deletedAt: null },
    select: { url: true, fileType: true },
  });
  if (!asset || asset.fileType !== 'PHOTO') {
    return new NextResponse('Not found', { status: 404 });
  }

  // Resolve target size.
  const sp = req.nextUrl.searchParams;
  const presetKey = sp.get('preset');
  let width: number | undefined;
  let height: number | undefined;
  let fit: ChannelFit = 'inside';
  const preset = presetKey ? CHANNEL_PRESET_MAP[presetKey] : undefined;
  if (preset) {
    width = preset.width;
    height = preset.height;
    fit = preset.fit;
  } else {
    width = clampDim(sp.get('w'));
    height = clampDim(sp.get('h'));
    fit = sp.get('fit') === 'cover' ? 'cover' : 'inside';
  }

  // Pull the private original through a short-lived signed URL, transform server-side.
  const signed = await presignGet(asset.url, 300);
  if (!signed) return new NextResponse('Storage unavailable', { status: 503 });
  const res = await fetch(signed);
  if (!res.ok) return new NextResponse('Upstream error', { status: 502 });
  const input = Buffer.from(await res.arrayBuffer());

  let pipeline = sharp(input, { failOn: 'none' }).rotate(); // auto-orient from EXIF
  if (width || height) {
    pipeline = pipeline.resize({ width, height, fit, withoutEnlargement: true });
  }
  const output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();

  return new NextResponse(new Uint8Array(output), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      // (token + size params) is an immutable identity → cache hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
