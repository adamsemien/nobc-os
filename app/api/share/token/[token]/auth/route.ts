/**
 * Member-gallery (and password-protected sponsor) auth POST.
 *
 * Body: `{ password }`. Verifies via constant-time scrypt compare. On success
 * sets an HttpOnly, Path-scoped, 1-hour `share_auth` cookie keyed to this
 * share's URL prefix so cookies don't leak between shares.
 *
 * Always returns within roughly the same time window regardless of whether the
 * token exists or the password is wrong, to avoid signalling existence via
 * timing.
 */
import { NextResponse } from 'next/server';
import { getSharePasswordHash } from '@/lib/share/resolve';
import { verifyPassword } from '@/lib/share/password';
import {
  SHARE_AUTH_COOKIE_NAME,
  SHARE_AUTH_TTL_SECONDS,
  buildShareAuthCookie,
  shareAuthCookiePath,
} from '@/lib/share/auth-cookie';
import { shareUrlPath } from '@/lib/share/token';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';

  const link = await getSharePasswordHash(token);
  // Run the scrypt compare even when the token doesn't exist, against a fixed
  // dummy hash, so timing doesn't reveal token existence.
  const okPassword = await verifyPassword(
    password,
    link?.passwordHash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  );
  if (!link || !link.passwordHash || !okPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const cookieValue = buildShareAuthCookie(link.id, link.passwordHash);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SHARE_AUTH_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: shareAuthCookiePath(shareUrlPath(link.mode, token)),
    maxAge: SHARE_AUTH_TTL_SECONDS,
  });
  return res;
}
