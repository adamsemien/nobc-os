import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { isStorageConfigured, uploadObject } from '@/lib/dam/storage';

// Event-hero uploads go to PRIVATE R2 (not public Vercel Blob) under an
// event-hero/{workspaceId}/ prefix and are read back through the public,
// key-scoped presign proxy at /api/media/event-hero. Hero images are public
// marketing (shown on logged-out event pages), so the proxy is unauthenticated
// but only ever serves event-hero/* objects — never the application PII or DAM
// assets that share this bucket. Returns an opaque object KEY, not a URL.

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

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

  const ext = extFromMime(file.type);
  const key = `event-hero/${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await uploadObject(key, buf, file.type);

  return NextResponse.json({ key });
}
