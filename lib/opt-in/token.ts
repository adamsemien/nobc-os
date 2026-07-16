import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * SMS opt-in link tokens — Path A identity binding for /opt-in/sms.
 *
 * Same stateless HMAC shape as lib/check-in-token.ts (payload b64url + sig,
 * constant-time verify). The token binds a re-permission link to a known
 * Person so consent lands on the right record with NO matching and NO login.
 *
 * It grants no capability — replay is harmless (it re-opens a consent form),
 * so the TTL is long: 365 days. Every recipient of the re-permission email
 * already exists as a Person, and an expired token silently degrades to the
 * cold path, where resolvePerson mints a duplicate by policy — a short TTL
 * would manufacture a merge-queue row for every late clicker.
 *
 * Signing key is OPTIN_TOKEN_SECRET — server-only. Mint fails closed when it
 * is unset. Verify failures of ANY kind (unset secret, malformed, tampered,
 * expired, wrong purpose) return null and the page degrades to the cold path
 * — never an error surface, never a hint the token was bad.
 */

export interface OptInTokenScope {
  workspaceId: string;
  personId: string;
}

const PURPOSE = 'sms_optin';

/** 365 days, in ms — see module doc for why this is deliberately long. */
export const OPTIN_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

interface TokenPayload extends OptInTokenScope {
  purpose: typeof PURPOSE;
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
 * Mint a signed opt-in token for a known Person. Returns null if
 * OPTIN_TOKEN_SECRET is unset (fail closed — no links go out unbound).
 */
export function mintOptInToken(scope: OptInTokenScope, now: Date = new Date()): string | null {
  const secret = process.env.OPTIN_TOKEN_SECRET;
  if (!secret) return null;

  const payload: TokenPayload = {
    workspaceId: scope.workspaceId,
    personId: scope.personId,
    purpose: PURPOSE,
    exp: now.getTime() + OPTIN_TOKEN_TTL_MS,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify signature, purpose, and expiry. Returns the scope on success, null on
 * ANY failure — the caller treats null as "no token" (cold path), silently.
 */
export function verifyOptInToken(token: string | null | undefined): OptInTokenScope | null {
  const secret = process.env.OPTIN_TOKEN_SECRET;
  if (!secret || !token) return null;

  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

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
  if (
    payload.purpose !== PURPOSE ||
    !payload.workspaceId ||
    !payload.personId ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }
  if (Date.now() > payload.exp) return null;

  return { workspaceId: payload.workspaceId, personId: payload.personId };
}
