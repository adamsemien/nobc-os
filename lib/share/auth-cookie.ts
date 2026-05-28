/**
 * Member-gallery auth cookie — proves the visitor entered the correct password.
 *
 * HttpOnly, 1-hour TTL, Path-scoped to the share's URL so cookies don't leak
 * between shares. The cookie value is `${iat}.${hmacBase64Url}` where the HMAC
 * key is the ShareLink's stored password hash (already on the server, never
 * shipped to the client) — so no new env secret is required and a compromised
 * cookie cannot forge auth for any other ShareLink.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SHARE_AUTH_COOKIE_NAME = 'share_auth';
export const SHARE_AUTH_TTL_SECONDS = 60 * 60; // 1 hour, per spec

/** Build the cookie value attesting "the bearer proved this ShareLink's password at iat". */
export function buildShareAuthCookie(shareLinkId: string, passwordHash: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const hmac = sign(shareLinkId, passwordHash, iat);
  return `${iat}.${hmac}`;
}

/** Path scope for the cookie. Restricts the cookie to this share's URL prefix. */
export function shareAuthCookiePath(urlPath: string): string {
  // `/gallery/${token}` or `/assets/${token}` — already prefixed with `/`.
  return urlPath;
}

/**
 * Verify a cookie value. Returns true when the HMAC matches and the cookie is
 * within its 1-hour window. Tolerant of malformed values (returns false).
 */
export function verifyShareAuthCookie(
  cookieValue: string | null | undefined,
  shareLinkId: string,
  passwordHash: string,
): boolean {
  if (!cookieValue) return false;
  const dot = cookieValue.indexOf('.');
  if (dot <= 0) return false;
  const iat = Number(cookieValue.slice(0, dot));
  const presentedHmac = cookieValue.slice(dot + 1);
  if (!Number.isFinite(iat) || iat <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now - iat > SHARE_AUTH_TTL_SECONDS || now + 60 < iat) return false; // 60s clock skew tolerance
  const expected = sign(shareLinkId, passwordHash, iat);
  const a = Buffer.from(presentedHmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sign(shareLinkId: string, passwordHash: string, iat: number): string {
  const h = createHmac('sha256', passwordHash);
  h.update(`${shareLinkId}:${iat}`);
  return h.digest('base64url');
}
