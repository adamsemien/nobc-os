/**
 * POST /api/media/dam/asset/[id]/edit — apply lightweight edits and save the
 * result as a NEW asset (non-destructive; the original is never touched). STAFF.
 *
 * Ops are applied in staged buffers so Sharp's internal op-ordering quirks can't
 * bite (extract-before-rotate etc.): (1) auto-orient → crop → straighten/flip,
 * (2) resize OR smart-crop-to-channel, (3) adjustments + auto-enhance → encode.
 * Smart-crop (attention) and auto-enhance are the Phase C "AI-ish" Sharp smarts.
 */
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { processImage } from '@/lib/dam/image';
import { damKey, isStorageConfigured, presignGet, uploadObject } from '@/lib/dam/storage';
import { CHANNEL_PRESET_MAP } from '@/lib/dam/channel-presets';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface EditOps {
  crop?: { left: number; top: number; width: number; height: number };
  rotate?: number; // degrees (straighten / 90-increments)
  flipH?: boolean;
  flipV?: boolean;
  resize?: { width?: number; height?: number; fit?: 'cover' | 'inside' };
  smartCropPreset?: string; // channel preset key → attention-based crop
  adjust?: { brightness?: number; saturation?: number; hue?: number; contrast?: number };
  autoEnhance?: boolean;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: 'Media storage is not configured' }, { status: 503 });
  }

  const ops = (await req.json().catch(() => null)) as EditOps | null;
  if (!ops || typeof ops !== 'object') {
    return NextResponse.json({ error: 'edit ops required' }, { status: 400 });
  }

  const src = await db.asset.findFirst({
    where: { id, workspaceId, deletedAt: null },
    select: {
      id: true,
      filename: true,
      fileType: true,
      folderId: true,
      eventId: true,
      sponsorName: true,
      shooterCredit: true,
      url: true,
    },
  });
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (src.fileType !== 'PHOTO') {
    return NextResponse.json({ error: 'Only photos can be edited' }, { status: 400 });
  }

  // Pull the private original.
  const signed = await presignGet(src.url, 300);
  if (!signed) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  const res = await fetch(signed);
  if (!res.ok) return NextResponse.json({ error: 'Could not read original' }, { status: 502 });
  let buf: Buffer = Buffer.from(await res.arrayBuffer());

  try {
    // Stage 1 — orient, crop, straighten, flip.
    {
      let p = sharp(buf, { failOn: 'none' }).rotate(); // EXIF auto-orient
      if (ops.crop && isNum(ops.crop.left) && isNum(ops.crop.top) && isNum(ops.crop.width) && isNum(ops.crop.height)) {
        p = p.extract({
          left: Math.max(0, Math.round(ops.crop.left)),
          top: Math.max(0, Math.round(ops.crop.top)),
          width: Math.max(1, Math.round(ops.crop.width)),
          height: Math.max(1, Math.round(ops.crop.height)),
        });
      }
      if (ops.flipV) p = p.flip();
      if (ops.flipH) p = p.flop();
      if (isNum(ops.rotate) && ops.rotate % 360 !== 0) {
        p = p.rotate(ops.rotate, { background: { r: 255, g: 255, b: 255, alpha: 1 } });
      }
      buf = await p.toBuffer();
    }

    // Stage 2 — smart-crop to a channel aspect, or plain resize.
    const preset = ops.smartCropPreset ? CHANNEL_PRESET_MAP[ops.smartCropPreset] : undefined;
    if (preset) {
      buf = await sharp(buf)
        .resize({ width: preset.width, height: preset.height, fit: 'cover', position: sharp.strategy.attention })
        .toBuffer();
    } else if (ops.resize && (isNum(ops.resize.width) || isNum(ops.resize.height))) {
      buf = await sharp(buf)
        .resize({
          width: isNum(ops.resize.width) ? ops.resize.width : undefined,
          height: isNum(ops.resize.height) ? ops.resize.height : undefined,
          fit: ops.resize.fit === 'cover' ? 'cover' : 'inside',
          withoutEnlargement: true,
        })
        .toBuffer();
    }

    // Stage 3 — adjustments + auto-enhance, then encode.
    {
      let p = sharp(buf);
      if (ops.autoEnhance) p = p.normalize();
      if (ops.adjust) {
        const mod: { brightness?: number; saturation?: number; hue?: number } = {};
        if (isNum(ops.adjust.brightness)) mod.brightness = ops.adjust.brightness;
        if (isNum(ops.adjust.saturation)) mod.saturation = ops.adjust.saturation;
        if (isNum(ops.adjust.hue)) mod.hue = ops.adjust.hue;
        if (Object.keys(mod).length) p = p.modulate(mod);
        if (isNum(ops.adjust.contrast) && ops.adjust.contrast !== 1) {
          const c = ops.adjust.contrast;
          p = p.linear(c, 128 * (1 - c)); // contrast pivoting around mid-gray
        }
      }
      buf = await p.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    }
  } catch (err) {
    console.error('[dam/edit] Sharp pipeline failed', {
      assetId: id,
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Could not apply edits' }, { status: 422 });
  }

  // Process + persist the edited image as a NEW asset (mirrors the upload route).
  let processed;
  try {
    processed = await processImage(buf, {});
  } catch (err) {
    console.error('[dam/edit] processImage failed', {
      assetId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Could not process edited image' }, { status: 422 });
  }

  const filename = src.filename.replace(/(\.[a-z0-9]+)?$/i, '') + ' (edited).jpg';
  const asset = await db.asset.create({
    data: {
      workspaceId,
      filename,
      url: '',
      thumbnailUrl: '',
      fileType: 'PHOTO',
      size: buf.length,
      width: processed.width ?? undefined,
      height: processed.height ?? undefined,
      blurhash: processed.blurhash ?? undefined,
      folderId: src.folderId ?? undefined,
      eventId: src.eventId ?? undefined,
      sponsorName: src.sponsorName ?? undefined,
      shooterCredit: src.shooterCredit ?? undefined,
      uploadedBy: userId,
    },
  });

  const originalKey = damKey(workspaceId, asset.id, 'original.jpg');
  const thumbKey = damKey(workspaceId, asset.id, 'thumb.webp');
  try {
    await Promise.all([
      uploadObject(originalKey, buf, 'image/jpeg'),
      uploadObject(thumbKey, processed.thumbnail, processed.thumbnailContentType),
    ]);
  } catch (err) {
    console.error('[dam/edit] R2 upload failed — rolling back', {
      assetId: asset.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await db.asset.delete({ where: { id: asset.id } }).catch(() => {});
    return NextResponse.json({ error: 'Save failed' }, { status: 502 });
  }

  await db.$transaction([
    db.asset.update({ where: { id: asset.id }, data: { url: originalKey, thumbnailUrl: thumbKey } }),
    db.workspace.update({
      where: { id: workspaceId },
      data: { storageBytes: { increment: BigInt(buf.length) } },
    }),
  ]);

  return NextResponse.json({
    id: asset.id,
    filename: asset.filename,
    width: processed.width,
    height: processed.height,
  });
}
