/**
 * GET /api/media/dam/asset/[id]/download — download a single asset at a size preset (STAFF).
 *
 * ?size=small|medium|large|original
 *   small   = 640px wide JPEG
 *   medium  = 1280px wide JPEG
 *   large   = 2048px wide JPEG
 *   original = 302 → signed R2 URL with Content-Disposition: attachment (no resize)
 *
 * Videos: size param is ignored; always 302 to the original (resizing video is not supported).
 * Workspace-scoped; 404 if asset not found or soft-deleted.
 */
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { AssetFileType, OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { DOWNLOAD_URL_TTL, presignGet } from '@/lib/dam/storage';
import { DOWNLOAD_SIZES, parseDownloadSize } from '@/lib/dam/download';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await ctx.params;

  const asset = await db.asset.findFirst({
    where: { id, workspaceId, deletedAt: null },
    select: { url: true, filename: true, fileType: true },
  });
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const size = parseDownloadSize(req.nextUrl.searchParams.get('size'));
  const targetWidth = DOWNLOAD_SIZES[size];

  // Videos and 'original' preset: 302 → signed R2 URL with attachment disposition.
  if (asset.fileType === AssetFileType.VIDEO || targetWidth === null) {
    const url = await presignGet(asset.url, DOWNLOAD_URL_TTL, {
      downloadFilename: asset.filename,
    });
    if (!url) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
    return NextResponse.redirect(url, 302);
  }

  // Image resize: fetch original bytes → sharp → return buffer.
  const signedUrl = await presignGet(asset.url, DOWNLOAD_URL_TTL);
  if (!signedUrl) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });

  let buffer: Buffer;
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`R2 fetch failed: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error('[dam/download] fetch original failed', { id, size, err });
    return NextResponse.json({ error: 'Failed to fetch original' }, { status: 502 });
  }

  let resized: Buffer;
  try {
    resized = await sharp(buffer, { failOn: 'none' })
      .rotate() // honor EXIF orientation
      .resize({ width: targetWidth, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (err) {
    console.error('[dam/download] sharp resize failed', { id, size, targetWidth, err });
    return NextResponse.json({ error: 'Image processing failed' }, { status: 500 });
  }

  // Build download filename: strip extension, append size, always .jpg.
  const base = asset.filename.replace(/\.[^.]+$/, '');
  const downloadName = `${base}-${size}.jpg`;

  return new Response(resized.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `attachment; filename="${downloadName.replace(/[\r\n"\\]/g, '_')}"`,
      'Content-Length': String(resized.byteLength),
    },
  });
}
