/**
 * ShareLink resolution + access-tracking — shared by the public API endpoints
 * and the public page server components so both paths agree on validation and
 * counter increments.
 *
 * resolveShareLink() returns either a structured "ok" payload or a tagged
 * failure reason (NOT_FOUND / EXPIRED / FOLDER_DELETED) — callers map those to
 * HTTP status codes or page-level error renderers as appropriate.
 */
import { cookies } from 'next/headers';
import { ShareLinkMode } from '@prisma/client';
import { db } from '@/lib/db';
import { SHARE_AUTH_COOKIE_NAME, verifyShareAuthCookie } from './auth-cookie';

export type ShareFailure =
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'EXPIRED' }
  | { ok: false; reason: 'FOLDER_DELETED' }
  | { ok: false; reason: 'INTERNAL_ERROR' };

export interface ResolvedShare {
  ok: true;
  id: string;
  token: string;
  mode: ShareLinkMode;
  workspaceId: string;
  folderId: string;
  folderName: string;
  watermark: boolean;
  allowedDownloads: number | null;
  downloadsUsed: number;
  expiresAt: Date | null;
  passwordProtected: boolean;
  /** True when the visitor's auth cookie passes verifyShareAuthCookie. */
  authed: boolean;
  /** Workspace display name (used for branding fallback on share pages). */
  workspaceName: string;
  /** Optional per-share branding override JSON (Phase 4+ has none configured yet). */
  brandingOverride: unknown;
}

/**
 * Look up a ShareLink by token. Read-only — does NOT touch firstAccessedAt /
 * lastAccessedAt / accessCount; call `bumpShareAccess()` separately on the
 * first successful page render or asset listing.
 *
 * `cookieStore` may be omitted; defaults to next/headers cookies(). Tests can
 * inject a different store.
 */
export async function resolveShareLink(
  token: string,
): Promise<ResolvedShare | ShareFailure> {
  if (!token || token.length < 8) return { ok: false, reason: 'NOT_FOUND' };

  let link;
  try {
    link = await db.shareLink.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        mode: true,
        workspaceId: true,
        folderId: true,
        watermark: true,
        allowedDownloads: true,
        expiresAt: true,
        password: true,
        brandingOverride: true,
        folder: { select: { name: true, deletedAt: true } },
        workspace: { select: { name: true } },
        _count: { select: { downloads: true } },
      },
    });
  } catch (err) {
    console.error('[share/resolve] findUnique failed', { token, error: String(err) });
    return { ok: false, reason: 'INTERNAL_ERROR' };
  }
  if (!link) return { ok: false, reason: 'NOT_FOUND' };
  if (link.folder.deletedAt) return { ok: false, reason: 'FOLDER_DELETED' };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' };

  let authed = link.password == null; // open shares are considered "authed".
  if (!authed && link.password) {
    const store = await cookies();
    const cookieValue = store.get(SHARE_AUTH_COOKIE_NAME)?.value ?? null;
    authed = verifyShareAuthCookie(cookieValue, link.id, link.password);
  }

  return {
    ok: true,
    id: link.id,
    token: link.token,
    mode: link.mode,
    workspaceId: link.workspaceId,
    folderId: link.folderId,
    folderName: link.folder.name,
    watermark: link.watermark,
    allowedDownloads: link.allowedDownloads,
    downloadsUsed: link._count.downloads,
    expiresAt: link.expiresAt,
    passwordProtected: link.password != null,
    authed,
    workspaceName: link.workspace.name,
    brandingOverride: link.brandingOverride ?? null,
  };
}

/** Look up the raw password hash for a share token. Used by the password POST. */
export async function getSharePasswordHash(
  token: string,
): Promise<{ id: string; mode: ShareLinkMode; passwordHash: string | null } | null> {
  if (!token) return null;
  const link = await db.shareLink.findUnique({
    where: { token },
    select: { id: true, mode: true, password: true },
  });
  if (!link) return null;
  return { id: link.id, mode: link.mode, passwordHash: link.password };
}

/** First-access + last-access bump. Fire-and-forget OK; caller can await for tests. */
export async function bumpShareAccess(shareLinkId: string): Promise<void> {
  const now = new Date();
  try {
    await db.shareLink.update({
      where: { id: shareLinkId },
      data: { accessCount: { increment: 1 }, lastAccessedAt: now },
    });
    // Conditional first-access write — only patches when still null. Idempotent
    // on subsequent visits.
    await db.shareLink.updateMany({
      where: { id: shareLinkId, firstAccessedAt: null },
      data: { firstAccessedAt: now },
    });
  } catch (err) {
    console.error('[share/resolve] bumpShareAccess failed', { shareLinkId, error: String(err) });
  }
}
