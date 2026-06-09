import { NextRequest, NextResponse } from 'next/server';
import { presignEventHeroGet } from '@/lib/r2-presign';

// Public, key-scoped presign proxy for event hero images. Hero images are public
// marketing (shown on logged-out event pages), so this route is intentionally
// unauthenticated — but it ONLY ever presigns `event-hero/*` objects. It must
// never serve the application PII (`applications/*`) or DAM assets (`dam/*`)
// that share the same R2 bucket. The previous `[assetId]` form presigned ANY
// caller-supplied key (security audit WARNING #9); this prefix scope closes it.

export const runtime = 'nodejs';

const HERO_PREFIX = 'event-hero/';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')?.trim() ?? '';
  if (!key || !key.startsWith(HERO_PREFIX) || key.includes('..')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = await presignEventHeroGet(key);
  if (!url) return NextResponse.json({ error: 'Hero media not configured' }, { status: 404 });

  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'public, max-age=600' },
  });
}
