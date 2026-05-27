/**
 * DAM upload (R2-only, private). Phase 1 — photos.
 *
 * Flow: validate -> Sharp thumbnail + BlurHash + dimensions + EXIF shoot date ->
 * create Asset row -> PUT original + thumbnail to private R2 -> persist keys +
 * bump Workspace.storageBytes -> respond. AI tagging + heuristic scoring run
 * AFTER the response via a fire-and-forget call to the tag route (never blocks
 * upload). STAFF-gated. Videos are a later phase (Sharp processes images only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { processImage } from '@/lib/dam/image';
import { isHeic, convertHeicToJpeg } from '@/lib/dam/heic';
import { damKey, isStorageConfigured, uploadObject } from '@/lib/dam/storage';

export const runtime = 'nodejs'; // Sharp requires the Node runtime, not edge.
export const maxDuration = 60; // WASM HEIC decode of a ~12MP photo adds ~1-3s

const MAX_BYTES = 50 * 1024 * 1024; // 50MB per photo
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function strOrNull(v: FormDataEntryValue | null | undefined): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: 'Media storage is not configured' }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }
  const heic = isHeic(file.type, file.name);
  if (!heic && !ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
  }

  const folderId = strOrNull(form?.get('folderId'));
  const eventId = strOrNull(form?.get('eventId'));
  const sponsorName = strOrNull(form?.get('sponsorName'));
  const shooterCredit = strOrNull(form?.get('shooterCredit'));

  const original = Buffer.from(await file.arrayBuffer());

  // HEIC can't be decoded by sharp on Vercel — convert to JPEG first, and read
  // EXIF from the original HEIC (the converted JPEG loses it).
  let webBuffer: Buffer = original;
  let effectiveMime = file.type;
  let ext = extFromMime(file.type);
  let exifInput: Buffer | undefined;
  if (heic) {
    try {
      webBuffer = await convertHeicToJpeg(original);
    } catch (err) {
      console.error('[dam/upload] HEIC convert failed', {
        workspaceId,
        filename: file.name,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: 'Could not convert HEIC image' }, { status: 422 });
    }
    effectiveMime = 'image/jpeg';
    ext = 'jpg';
    exifInput = original;
  }

  let processed;
  try {
    processed = await processImage(webBuffer, { exifInput });
  } catch (err) {
    console.error('[dam/upload] image processing failed', {
      workspaceId,
      filename: file.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Could not process image' }, { status: 422 });
  }

  // Stored bytes are the JPEG (for HEIC) or the original; name reflects .jpg too.
  const baseName = file.name || `upload.${ext}`;
  const filename = heic ? baseName.replace(/\.(heic|heif)$/i, '.jpg') : baseName;

  // Create first to get the id for the R2 key prefix; keys backfilled after PUT.
  const asset = await db.asset.create({
    data: {
      workspaceId,
      filename,
      url: '',
      thumbnailUrl: '',
      fileType: 'PHOTO',
      size: webBuffer.length,
      width: processed.width ?? undefined,
      height: processed.height ?? undefined,
      blurhash: processed.blurhash ?? undefined,
      shootDate: processed.shootDate ?? undefined,
      folderId: folderId ?? undefined,
      eventId: eventId ?? undefined,
      sponsorName: sponsorName ?? undefined,
      shooterCredit: shooterCredit ?? undefined,
      uploadedBy: userId,
    },
  });

  const originalKey = damKey(workspaceId, asset.id, `original.${ext}`);
  const thumbKey = damKey(workspaceId, asset.id, 'thumb.webp');

  try {
    await Promise.all([
      uploadObject(originalKey, webBuffer, effectiveMime),
      uploadObject(thumbKey, processed.thumbnail, processed.thumbnailContentType),
    ]);
  } catch (err) {
    console.error('[dam/upload] R2 upload failed — rolling back asset row', {
      assetId: asset.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await db.asset.delete({ where: { id: asset.id } }).catch(() => {});
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
  }

  await db.$transaction([
    db.asset.update({
      where: { id: asset.id },
      data: { url: originalKey, thumbnailUrl: thumbKey },
    }),
    db.workspace.update({
      where: { id: workspaceId },
      data: { storageBytes: { increment: BigInt(webBuffer.length) } },
    }),
  ]);

  triggerTagging(req, asset.id);

  return NextResponse.json({
    id: asset.id,
    filename: asset.filename,
    width: processed.width,
    height: processed.height,
    blurhash: processed.blurhash,
    shootDate: processed.shootDate,
  });
}

/**
 * Fire-and-forget the internal tag/score route. Best-effort: we do not await it,
 * so it never adds latency to the upload response. (Production hardening for
 * guaranteed execution on Vercel — `waitUntil` or a queue — is a later follow-up.)
 */
function triggerTagging(req: NextRequest, assetId: string): void {
  try {
    const url = new URL(`/api/media/dam/tag/${assetId}`, req.nextUrl.origin);
    const secret = process.env.DAM_TAG_SECRET;
    void fetch(url, {
      method: 'POST',
      headers: secret ? { 'x-dam-tag-secret': secret } : undefined,
    }).catch((err) =>
      console.error('[dam/upload] failed to trigger tagging', { assetId, error: String(err) }),
    );
  } catch (err) {
    console.error('[dam/upload] failed to build tagging trigger', {
      assetId,
      error: String(err),
    });
  }
}
