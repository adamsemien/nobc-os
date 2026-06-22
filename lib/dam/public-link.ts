import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stable public-link tokens for DAM assets — the hotlink credential for putting
 * an image in an email newsletter or on an external channel.
 *
 * A token is an HMAC over `{ workspaceId, assetId }`, signed server-side with
 * `DAM_PUBLIC_LINK_SECRET`. It has NO expiry (newsletters are long-lived), but is
 * unguessable without the secret, so an asset stays private until an operator
 * explicitly mints + shares its link. Revocation is global, by rotating the
 * secret. If the secret is unset, mint and verify both fail closed.
 *
 * The public route (`/i/[token]`) verifies the token, then serves a Sharp-resized
 * JPEG — the private R2 original is never exposed directly.
 */

export interface PublicAssetScope {
  workspaceId: string;
  assetId: string;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/** Mint a stable public-link token for an asset. Returns null when the secret is
 *  unset (fail closed — caller surfaces "public links not configured"). */
export function mintPublicAssetToken(scope: PublicAssetScope): string | null {
  const secret = process.env.DAM_PUBLIC_LINK_SECRET;
  if (!secret) return null;
  const payloadB64 = b64url(JSON.stringify({ workspaceId: scope.workspaceId, assetId: scope.assetId }));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Verify a token's signature. Returns the scope on success, null on any failure
 *  (unset secret, malformed, bad signature). */
export function verifyPublicAssetToken(token: string | null | undefined): PublicAssetScope | null {
  const secret = process.env.DAM_PUBLIC_LINK_SECRET;
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

  let payload: PublicAssetScope;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as PublicAssetScope;
  } catch {
    return null;
  }
  if (!payload.workspaceId || !payload.assetId) return null;
  return { workspaceId: payload.workspaceId, assetId: payload.assetId };
}

/** Whether public links can be minted at all (secret present). */
export function isPublicLinkConfigured(): boolean {
  return Boolean(process.env.DAM_PUBLIC_LINK_SECRET);
}
