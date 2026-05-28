/**
 * Public ShareLink resolution. No auth (workspace), no Clerk.
 *
 * Returns share metadata + the asset list with 15-min signed thumbnail URLs.
 * Password-protected shares with no valid `share_auth` cookie return 401 +
 * `{ requiresPassword: true }` (metadata only, no assets leaked).
 *
 * Side-effect on success: bumps the share's accessCount + lastAccessedAt
 * (firstAccessedAt the first time only). Bump is best-effort and never fails
 * the response.
 */
import { NextResponse } from 'next/server';
import { resolveShareLink, bumpShareAccess } from '@/lib/share/resolve';
import { listShareAssets } from '@/lib/share/assets';

export const runtime = 'nodejs';

const FAILURE_STATUS = { NOT_FOUND: 404, EXPIRED: 410, FOLDER_DELETED: 410 } as const;

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveShareLink(token);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: FAILURE_STATUS[r.reason] });

  const meta = {
    mode: r.mode,
    folderName: r.folderName,
    watermark: r.watermark,
    allowedDownloads: r.allowedDownloads,
    downloadsUsed: r.downloadsUsed,
    expiresAt: r.expiresAt,
    workspaceName: r.workspaceName,
    passwordProtected: r.passwordProtected,
  };

  if (r.passwordProtected && !r.authed) {
    return NextResponse.json({ requiresPassword: true, ...meta }, { status: 401 });
  }

  const assets = await listShareAssets(r.workspaceId, r.folderId);
  // Best-effort access tracking — never await failure on the hot path.
  void bumpShareAccess(r.id);

  return NextResponse.json({ ...meta, assets });
}
