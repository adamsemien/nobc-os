import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Check-in session tokens — the door-scanner credential.
 *
 * Replaces the old global `NEXT_PUBLIC_CHECKIN_SECRET` bearer (which baked one
 * static, never-expiring master key into the browser bundle — anyone could pull
 * it from devtools and read/modify ANY event's guest list in ANY workspace).
 *
 * A token is minted SERVER-SIDE for an authenticated operator, scoped to a
 * single event + workspace, and expires after the event window. The check-in
 * API routes verify the signature + that the requested resource is in scope,
 * so a token for event A cannot touch event B or another workspace.
 *
 * Signing key is `CHECKIN_SECRET` — server-only, never `NEXT_PUBLIC`. If it is
 * unset, mint and verify both fail closed (no token issued, every token
 * rejected) rather than leaving the endpoints open.
 */

export interface CheckInTokenScope {
  workspaceId: string;
  eventId: string;
  slug: string;
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header. */
export function bearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m ? m[1] : null;
}

interface TokenPayload extends CheckInTokenScope {
  /** Expiry, epoch ms. */
  exp: number;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * Mint a signed, event-scoped check-in token. Returns null if `CHECKIN_SECRET`
 * is unset (fail closed — the caller surfaces "check-in not configured").
 */
export function mintCheckInToken(scope: CheckInTokenScope, expiresAt: Date): string | null {
  const secret = process.env.CHECKIN_SECRET;
  if (!secret) return null;

  const payload: TokenPayload = { ...scope, exp: expiresAt.getTime() };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify a token's signature and expiry. Returns the scope on success, or null
 * for any failure (unset secret, malformed, bad signature, expired).
 */
export function verifyCheckInToken(token: string | null | undefined): CheckInTokenScope | null {
  const secret = process.env.CHECKIN_SECRET;
  if (!secret || !token) return null;

  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  // Constant-time signature comparison.
  const expectedSig = sign(payloadB64, secret);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as TokenPayload;
  } catch {
    return null;
  }
  if (!payload.workspaceId || !payload.eventId || !payload.slug || typeof payload.exp !== 'number') {
    return null;
  }
  if (Date.now() > payload.exp) return null;

  return { workspaceId: payload.workspaceId, eventId: payload.eventId, slug: payload.slug };
}

/** Hard ceiling on the settable validity buffer — a token can never be immortal. */
export const MAX_CHECKIN_VALID_HOURS = 72;
/** Default hours after an event ends that a check-in token stays valid. */
export const DEFAULT_CHECKIN_VALID_HOURS = 4;

/**
 * Compute a token's expiry from the event window + a settable buffer (hours
 * after the event ends), clamped to [1, MAX_CHECKIN_VALID_HOURS]. Falls back to
 * `startAt + 24h` when the event has no end time, and to `now` if neither is set.
 */
export function checkInTokenExpiry(
  event: { startAt: Date | null; endAt: Date | null },
  validHours: number,
): Date {
  const hours = Math.min(
    MAX_CHECKIN_VALID_HOURS,
    Math.max(1, Number.isFinite(validHours) ? validHours : DEFAULT_CHECKIN_VALID_HOURS),
  );
  const base =
    event.endAt?.getTime() ??
    (event.startAt ? event.startAt.getTime() + 24 * 60 * 60 * 1000 : Date.now());
  return new Date(base + hours * 60 * 60 * 1000);
}
