import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isStorageConfigured, uploadObject } from '@/lib/dam/storage';
import { applicationPhotoKey } from '@/lib/apply-photo';

// Membership-application photos are PII-adjacent, so they land in PRIVATE R2
// (not public Vercel Blob) and are read back only through the role-gated
// presign proxy at /api/media/application-photo. This route returns an opaque
// object KEY, never a public URL. The endpoint stays unauthenticated because
// /apply is a public flow (Locked Decision: never break /apply); the security
// boundary is that the stored objects are private and reads are operator-gated.

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export async function POST(req: NextRequest) {
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

  // Unauthenticated public apply → tenant zero (mirror /api/apply/membership POST).
  const workspace = await db.workspace.findFirst({ select: { id: true } });
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 500 });
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = applicationPhotoKey(workspace.id, ext);
  const buf = Buffer.from(await file.arrayBuffer());
  await uploadObject(key, buf, file.type);

  return NextResponse.json({ key });
}
