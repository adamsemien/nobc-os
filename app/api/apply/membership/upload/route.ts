import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

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

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `applications/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const blob = await put(key, buf, { access: 'public', contentType: file.type });

  return NextResponse.json({ url: blob.url });
}
