/**
 * GET /api/doc/[token]/download — stream the stored recap/brief PDF.
 *
 * Resolves the token, enforces expiry + the password cookie (when gated), then 302s to a
 * short-lived signed R2 URL with Content-Disposition: attachment (the cross-origin `download`
 * attribute can't force a save on its own).
 */
import { NextResponse } from 'next/server';
import { DOWNLOAD_URL_TTL, presignGet } from '@/lib/dam/storage';
import { resolveRecapToken } from '@/lib/intelligence/recap-resolve';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await ctx.params;
  const r = await resolveRecapToken(token);
  if (!r.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (r.expired) return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
  if (r.passwordProtected && !r.authed) return NextResponse.json({ error: 'Password required' }, { status: 401 });

  const filename = `${r.recap.sponsor.name} - ${r.recap.event.name} Recap.pdf`.replace(/[/\\]/g, '-');
  const signed = await presignGet(r.pdfKey, DOWNLOAD_URL_TTL, { downloadFilename: filename });
  if (!signed) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  return NextResponse.redirect(signed, { status: 302 });
}
