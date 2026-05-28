/**
 * Public per-asset download for a share. Logs an AssetDownload row, enforces
 * `allowedDownloads` (when set), then 302-redirects to a fresh 24-hour signed
 * R2 GET URL.
 *
 * Counting model: `allowedDownloads` is the TOTAL across all visitors for the
 * share (sum of AssetDownload rows with shareLinkId = this.id). When the cap
 * is reached every further request returns 410.
 *
 * Auth: passwords (when set) are enforced via the same share_auth cookie used
 * by the token-resolution route — visitor must have entered the password first.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DOWNLOAD_URL_TTL, presignGet } from '@/lib/dam/storage';
import { resolveShareLink } from '@/lib/share/resolve';

export const runtime = 'nodejs';

const FAILURE_STATUS = { NOT_FOUND: 404, EXPIRED: 410, FOLDER_DELETED: 410 } as const;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string; assetId: string }> },
) {
  const { token, assetId } = await ctx.params;
  try {
    const r = await resolveShareLink(token);
    if (!r.ok) {
      if (r.reason === 'INTERNAL_ERROR') {
        return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
      }
      return NextResponse.json({ error: r.reason }, { status: FAILURE_STATUS[r.reason] });
    }
    if (r.passwordProtected && !r.authed) {
      return NextResponse.json({ error: 'Password required' }, { status: 401 });
    }

    // Asset must live in this share's folder and the share's workspace, and be
    // non-deleted. Single query enforces all three.
    const asset = await db.asset.findFirst({
      where: { id: assetId, folderId: r.folderId, workspaceId: r.workspaceId, deletedAt: null },
      select: { id: true, filename: true, url: true },
    });
    if (!asset || !asset.url) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // NOTE: TOCTOU race — count() and create() are not atomic.
    // At current NoBC scale (1-5 recipients per link) the race window is negligible.
    // For SaaS multi-tenant use, replace with atomic counter decrement:
    // UPDATE "ShareLink" SET "downloadCount" = "downloadCount" + 1
    //   WHERE id = $1 AND ("allowedDownloads" IS NULL OR "downloadCount" < "allowedDownloads")
    // and reject if 0 rows updated.
    if (r.allowedDownloads != null) {
      const used = await db.assetDownload.count({ where: { shareLinkId: r.id } });
      if (used >= r.allowedDownloads) {
        return NextResponse.json({ error: 'Download limit reached' }, { status: 410 });
      }
    }

    const signed = await presignGet(asset.url, DOWNLOAD_URL_TTL, { downloadFilename: asset.filename });
    if (!signed) {
      return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
    }

    // Log the download. Best-effort: a logging failure must not deny the user
    // the file they're owed (and the share's `allowedDownloads` check has
    // already passed under the current count).
    await db.assetDownload
      .create({ data: { workspaceId: r.workspaceId, assetId: asset.id, shareLinkId: r.id } })
      .catch((err) => console.error('[share/download] log failed', { shareId: r.id, assetId, error: String(err) }));

    return NextResponse.redirect(signed, { status: 302 });
  } catch (err) {
    console.error('[share/download GET] handler failed', { token, assetId, error: String(err) });
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }
}
