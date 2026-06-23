import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Constant-time check that a request carries the CRON_SECRET.
 *
 * Fail-closed: returns false when CRON_SECRET is unset, so a missing env var can
 * never leave a cron endpoint world-open (this is the gap that previously sat in
 * capture-payments, the money-path cron — a bare `!== \`Bearer ${undefined}\``
 * compare would have accepted the literal string "Bearer undefined").
 *
 * Accepts the secret via `Authorization: Bearer …`, the `x-vercel-cron-secret`
 * header (Vercel sets this automatically), or a `?secret=` query param.
 */
export function verifyCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.headers.get('x-vercel-cron-secret') ??
    req.nextUrl.searchParams.get('secret') ??
    '';

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch; compare lengths first (the length
  // is not itself secret).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
