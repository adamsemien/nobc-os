import { NextRequest, NextResponse } from 'next/server';
import { resolveDefaultApplyWorkspace } from '@/lib/apply-workspace';
import { isStorageConfigured, uploadObject } from '@/lib/dam/storage';
import { applicationPhotoKey } from '@/lib/apply-photo';
import { isAllowedImageBytes, type SniffedImageType } from '@/lib/image-magic-bytes';
import sharp from 'sharp';
import { publicRateLimit } from '@/lib/public-rate-limit';

// Membership-application photos are PII-adjacent, so they land in PRIVATE R2
// (not public Vercel Blob) and are read back only through the role-gated
// presign proxy at /api/media/application-photo. This route returns an opaque
// object KEY, never a public URL. The endpoint stays unauthenticated because
// /apply is a public flow (Locked Decision: never break /apply); the security
// boundary is that the stored objects are private and reads are operator-gated.

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_BYTES = new Set<SniffedImageType>(['jpeg', 'png', 'webp']);

export async function POST(req: NextRequest) {
  // This endpoint is intentionally unauthenticated (public /apply), and each call
  // decodes up to 10MB through sharp — cap per-IP floods before that work. Bucket
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
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
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
  // Don't trust client-declared MIME — verify real image bytes (defense-in-depth).
  if (!isAllowedImageBytes(buf, ALLOWED_BYTES)) {
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
    processed = await sharp(buf, { failOn: 'none' }).rotate().toBuffer();
  } catch (e) {
    console.warn('[apply/upload] image processing failed', {
      declaredType: file.type,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Could not process image' }, { status: 400 });
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = applicationPhotoKey(workspace.id, ext);
  await uploadObject(key, processed, file.type);

  return NextResponse.json({ key });
}
