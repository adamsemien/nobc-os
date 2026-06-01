/**
 * POST /api/doc/[token]/auth — password gate for a magic-link recap/brief.
 *
 * Body: { password }. Constant-time scrypt compare (runs against a dummy hash even when the
 * token is unknown, so timing doesn't reveal existence). On success sets the HttpOnly,
 * Path-scoped, 1-hour share_auth cookie keyed to /doc/[token].
 */
import { NextResponse } from 'next/server';
import { getRecapPasswordHash } from '@/lib/intelligence/recap-resolve';
import { verifyPassword } from '@/lib/share/password';
import {
  SHARE_AUTH_COOKIE_NAME,
  SHARE_AUTH_TTL_SECONDS,
  buildShareAuthCookie,
} from '@/lib/share/auth-cookie';

export const runtime = 'nodejs';

const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';

  const link = await getRecapPasswordHash(token);
  const okPassword = await verifyPassword(password, link?.passwordHash ?? DUMMY_HASH);
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!link.passwordHash || !okPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SHARE_AUTH_COOKIE_NAME,
    value: buildShareAuthCookie(link.id, link.passwordHash),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // Path '/' so the cookie reaches both the /doc/[token] landing and the
    // /api/doc/[token]/download route. Safe: the cookie HMAC is keyed to this asset's id +
    // password hash, so it can't authorize any other document.
    path: '/',
    maxAge: SHARE_AUTH_TTL_SECONDS,
  });
  return res;
}
