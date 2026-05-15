import { NextRequest, NextResponse } from 'next/server';
import { presignEventHeroGet } from '@/lib/r2-presign';

/** Fallback when the browser cannot use a server-rendered presigned URL. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await ctx.params;
  if (!assetId?.trim()) return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  const url = await presignEventHeroGet(decodeURIComponent(assetId));
  if (!url) return NextResponse.json({ error: 'Hero media not configured' }, { status: 404 });
  return NextResponse.redirect(url, 302);
}
