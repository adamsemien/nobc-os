import { NextRequest, NextResponse } from 'next/server';
import { resolveDefaultApplyWorkspace } from '@/lib/apply-workspace';
import { isStorageConfigured, uploadObject } from '@/lib/dam/storage';
import { applicationPhotoKey } from '@/lib/apply-photo';
import { isAllowedImageBytes, sniffImageType, type SniffedImageType } from '@/lib/image-magic-bytes';
import { isHeic, convertHeicToJpeg } from '@/lib/dam/heic';
import sharp from 'sharp';
import { publicRateLimit } from '@/lib/public-rate-limit';

// Membership-application photos are PII-adjacent, so they land in PRIVATE R2
// (not public Vercel Blob) and are read back only through the role-gated
// presign proxy at /api/media/application-photo. This route returns an opaque
// object KEY, never a public URL. The endpoint stays unauthenticated because
// /apply is a public flow (Locked Decision: never break /apply); the security
// boundary is that the stored objects are private and reads are operator-gated.

export const runtime = 'nodejs';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_BYTES = new Set<SniffedImageType>(['jpeg', 'png', 'webp']);

export async function POST(req: NextRequest) {
  // This endpoint is intentionally unauthenticated (public /apply), and each call
  // decodes up to 20MB through sharp — cap per-IP floods before that work. Bucket
  // is generous: a real applicant uploads a handful of photos, plus retries.
  const rateCheck = publicRateLimit(req, { bucket: 'apply-upload', max: 40 });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSecs) } },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }
  // `kind=document` (the optional personality-test upload) additionally accepts PDF.
  // HEIC/HEIF is accepted on BOTH paths — iPhones shoot HEIC by default, so the
  // /apply photo picker has to take them (it is transcoded to JPEG below). HEIC is
  // detected by extension too, because mobile browsers routinely report an empty
  // file.type for camera-roll images.
  const isDocument = form?.get('kind') === 'document';
  const isPdf = isDocument && file.type === 'application/pdf';
  const isHeicImage = isHeic(file.type, file.name);
  // Deliberately permissive: anything image-ish — including an empty file.type — is
  // waved through to the magic-byte sniff below, which is the real gate. The strict
  // MIME allowlist that used to sit here 400'd every HEIC and every empty-MIME photo,
  // which is what broke uploads on mobile.
  const looksLikeImage = !file.type || file.type.startsWith('image/');
  if (!looksLikeImage && !isPdf && !isHeicImage) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: 'Uploads unavailable' }, { status: 503 });
  }

  // Unauthenticated public apply → the SAME resolver the create route uses
  // (APPLY_DEFAULT_WORKSPACE_ID, else oldest workspace). A bare findFirst() here
  // once minted keys under a different workspace than the application row, so
  // every downstream IDOR guard (photo proxy, DAM mirror) correctly refused
  // them and no photo ever rendered (P0, 2026-07-02).
  const workspace = await resolveDefaultApplyWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 500 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // PDF documents (kind=document only): verify the %PDF- magic bytes, then store
  // as-is. sharp is image-only, so PDFs skip it. Same private-R2 prefix + opaque-key
  // contract as photos; read back through the same operator-gated presign proxy.
  if (isPdf) {
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      console.warn('[apply/upload] rejected document with mismatched magic bytes', {
        declaredType: file.type,
        size: buf.length,
      });
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }
    const pdfKey = applicationPhotoKey(workspace.id, 'pdf');
    await uploadObject(pdfKey, buf, 'application/pdf');
    return NextResponse.json({ key: pdfKey });
  }

  // HEIC/HEIF (photos and documents alike): sharp can't decode HEIC on Vercel, so
  // convert to JPEG first (reuses the DAM libheif path), then fall through to the
  // shared image pipeline (magic-byte check on the decoded JPEG + EXIF strip).
  let imageBuf: Buffer = buf;
  if (isHeicImage) {
    try {
      imageBuf = await convertHeicToJpeg(buf);
    } catch (e) {
      console.warn('[apply/upload] HEIC decode failed', {
        declaredType: file.type,
        err: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json({ error: 'Could not process image' }, { status: 400 });
    }
  }

  // Image path (photos AND image documents): verify real image bytes (defense-in-depth).
  if (!isAllowedImageBytes(imageBuf, ALLOWED_BYTES)) {
    console.warn('[apply/upload] rejected file with mismatched magic bytes', {
      declaredType: file.type,
      size: buf.length,
    });
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  // Strip EXIF/GPS + bake orientation before storage. Application photos are
  // PII-adjacent and camera EXIF commonly carries GPS location; rotate() honors
  // the EXIF orientation flag, then sharp re-encodes WITHOUT metadata (its
  // default) in the same format, so the stored object is orientation-correct and
  // metadata-free. Mirrors lib/dam/image.ts. On a decode failure (rare — magic
  // bytes already validated) reject so we never fall back to storing raw EXIF.
  let processed: Buffer;
  try {
    processed = await sharp(imageBuf, { failOn: 'none' }).rotate().toBuffer();
  } catch (e) {
    console.warn('[apply/upload] image processing failed', {
      declaredType: file.type,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Could not process image' }, { status: 400 });
  }

  // Derive ext + Content-Type from the ACTUAL stored bytes, never from file.type.
  // Mobile camera-roll uploads routinely declare an empty file.type, which used to
  // be safe only because the strict MIME allowlist rejected them upstream; now that
  // they're allowed through, trusting file.type here would store the object with an
  // empty Content-Type. HEIC has already been transcoded to JPEG by this point.
  const sniffed = sniffImageType(processed);
  const ext = sniffed === 'png' ? 'png' : sniffed === 'webp' ? 'webp' : 'jpg';
  const contentType =
    sniffed === 'png' ? 'image/png' : sniffed === 'webp' ? 'image/webp' : 'image/jpeg';
  const key = applicationPhotoKey(workspace.id, ext);
  await uploadObject(key, processed, contentType);

  return NextResponse.json({ key });
}
