/**
 * Resolve a GeneratedAsset magic-link token for the public /doc/[token] surface.
 *
 * The token (256-bit, GeneratedAsset.magicLinkUrl) is the credential. Optional password
 * gating reuses the DAM scrypt + HttpOnly cookie pattern: the cookie is HMAC-keyed by the
 * asset id + the stored password hash (verifyShareAuthCookie), so a leaked cookie can't
 * authorize any other document and no new env secret is needed.
 */
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { SHARE_AUTH_COOKIE_NAME, verifyShareAuthCookie } from '@/lib/share/auth-cookie';
import type { RecapPayload } from './recap-types';

interface StoredPayload {
  recap?: RecapPayload;
  access?: { passwordHash?: string | null };
}

export interface ResolvedRecap {
  ok: true;
  id: string;
  recap: RecapPayload;
  pdfKey: string;
  passwordProtected: boolean;
  authed: boolean;
  expiresAt: Date | null;
  expired: boolean;
}

export type RecapResolution = ResolvedRecap | { ok: false; reason: 'NOT_FOUND' | 'INTERNAL_ERROR' };

export async function resolveRecapToken(token: string): Promise<RecapResolution> {
  try {
    const asset = await db.generatedAsset.findUnique({
      where: { magicLinkUrl: token },
      select: { id: true, pdfUrl: true, payload: true, expiresAt: true },
    });
    if (!asset) return { ok: false, reason: 'NOT_FOUND' };

    const stored = (asset.payload ?? {}) as unknown as StoredPayload;
    const recap = stored.recap;
    if (!recap) return { ok: false, reason: 'NOT_FOUND' };

    const passwordHash = stored.access?.passwordHash ?? null;
    const expiresAt = asset.expiresAt ?? null;
    const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;

    let authed = !passwordHash;
    if (passwordHash) {
      const store = await cookies();
      authed = verifyShareAuthCookie(store.get(SHARE_AUTH_COOKIE_NAME)?.value ?? null, asset.id, passwordHash);
    }

    return {
      ok: true,
      id: asset.id,
      recap,
      pdfKey: asset.pdfUrl,
      passwordProtected: !!passwordHash,
      authed,
      expiresAt,
      expired,
    };
  } catch (e) {
    console.error('[recap-resolve] failed:', e);
    return { ok: false, reason: 'INTERNAL_ERROR' };
  }
}

/** Minimal password-hash lookup for the auth endpoint. */
export async function getRecapPasswordHash(
  token: string,
): Promise<{ id: string; passwordHash: string | null } | null> {
  const asset = await db.generatedAsset.findUnique({
    where: { magicLinkUrl: token },
    select: { id: true, payload: true },
  });
  if (!asset) return null;
  const stored = (asset.payload ?? {}) as unknown as StoredPayload;
  return { id: asset.id, passwordHash: stored.access?.passwordHash ?? null };
}
