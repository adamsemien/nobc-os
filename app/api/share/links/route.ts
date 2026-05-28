/**
 * ShareLink CRUD — operator side. STAFF-gated, workspace-scoped.
 *
 * POST creates a share. Two input shapes are supported:
 *   - { folderId } — share an existing folder as-is.
 *   - { assetIds } — wrap the selected assets in a new MediaFolder (SPONSOR
 *     type, name auto-generated unless `folderName` supplied) and share that.
 *     The assets are reassigned to the new folder so the share has a stable
 *     contents list, mirroring the existing "create selects folder, then share"
 *     operator workflow.
 *
 * GET lists all live ShareLinks for the caller's workspace with their public
 * URLs (built from NEXT_PUBLIC_APP_URL).
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, ShareLinkMode, MediaFolderType } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/share/password';
import { mintShareToken, shareUrlPath, shareAbsoluteUrl } from '@/lib/share/token';

export const runtime = 'nodejs'; // scrypt is Node-only.

interface CreateBody {
  folderId?: string;
  assetIds?: string[];
  folderName?: string;
  type: 'sponsor' | 'gallery';
  password?: string;
  watermark?: boolean;
  allowedDownloads?: number | null;
  expiresAt?: string | null;
}

function modeFromType(type: string): ShareLinkMode | null {
  if (type === 'sponsor') return ShareLinkMode.SPONSOR;
  if (type === 'gallery') return ShareLinkMode.MEMBER_GALLERY;
  return null;
}

function autoFolderName(count: number): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Share — ${date} — ${count} ${count === 1 ? 'asset' : 'assets'}`;
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const mode = modeFromType(body.type);
  if (!mode) return NextResponse.json({ error: 'type must be "sponsor" or "gallery"' }, { status: 400 });

  const watermark = body.watermark === true;
  const allowedDownloads =
    typeof body.allowedDownloads === 'number' && Number.isInteger(body.allowedDownloads) && body.allowedDownloads > 0
      ? body.allowedDownloads
      : null;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: 'expiresAt must be a valid ISO date' }, { status: 400 });
  }

  // Member-gallery shares always require a password (per spec: gallery is
  // password-protected). Sponsor delivery passwords stay optional.
  const password = typeof body.password === 'string' ? body.password.trim() : '';
  if (mode === ShareLinkMode.MEMBER_GALLERY && !password) {
    return NextResponse.json({ error: 'Gallery shares require a password' }, { status: 400 });
  }

  // Resolve folder: either a given folderId (must be in workspace) or a new
  // folder wrapping the supplied assetIds.
  let folderId: string;
  if (body.folderId) {
    const folder = await db.mediaFolder.findFirst({
      where: { id: body.folderId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    folderId = folder.id;
  } else if (Array.isArray(body.assetIds) && body.assetIds.length > 0) {
    const assetIds = body.assetIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (assetIds.length === 0) {
      return NextResponse.json({ error: 'assetIds must be a non-empty string array' }, { status: 400 });
    }
    // Verify every asset belongs to the workspace before we touch anything.
    const owned = await db.asset.findMany({
      where: { id: { in: assetIds }, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (owned.length !== assetIds.length) {
      return NextResponse.json({ error: 'One or more assets not found in this workspace' }, { status: 404 });
    }
    const name = (typeof body.folderName === 'string' && body.folderName.trim()) || autoFolderName(assetIds.length);
    // Create the wrapper folder + reassign the assets to it atomically.
    const folder = await db.$transaction(async (tx) => {
      const f = await tx.mediaFolder.create({
        data: {
          workspaceId,
          name,
          type: mode === ShareLinkMode.SPONSOR ? MediaFolderType.SPONSOR : MediaFolderType.SELECTS,
        },
        select: { id: true },
      });
      await tx.asset.updateMany({
        where: { id: { in: owned.map((a) => a.id) }, workspaceId },
        data: { folderId: f.id },
      });
      return f;
    });
    folderId = folder.id;
  } else {
    return NextResponse.json(
      { error: 'Provide either folderId or a non-empty assetIds array' },
      { status: 400 },
    );
  }

  const passwordHash = password ? await hashPassword(password) : null;
  const token = mintShareToken();

  const link = await db.shareLink.create({
    data: {
      workspaceId,
      token,
      folderId,
      mode,
      password: passwordHash,
      watermark,
      allowedDownloads,
      expiresAt,
    },
    select: { id: true, token: true, mode: true, createdAt: true },
  });

  return NextResponse.json({
    id: link.id,
    token: link.token,
    mode: link.mode,
    path: shareUrlPath(link.mode, link.token),
    url: shareAbsoluteUrl(link.mode, link.token),
    createdAt: link.createdAt,
  });
}

export async function GET() {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const links = await db.shareLink.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      token: true,
      mode: true,
      watermark: true,
      allowedDownloads: true,
      expiresAt: true,
      firstAccessedAt: true,
      lastAccessedAt: true,
      accessCount: true,
      createdAt: true,
      password: true,
      folder: { select: { id: true, name: true, deletedAt: true } },
      _count: { select: { downloads: true } },
    },
  });

  return NextResponse.json({
    links: links.map((l: typeof links[number]) => ({
      id: l.id,
      token: l.token,
      mode: l.mode,
      url: shareAbsoluteUrl(l.mode, l.token),
      path: shareUrlPath(l.mode, l.token),
      folderId: l.folder.id,
      folderName: l.folder.name,
      folderDeleted: l.folder.deletedAt != null,
      watermark: l.watermark,
      passwordProtected: l.password != null,
      allowedDownloads: l.allowedDownloads,
      downloadsUsed: l._count.downloads,
      expiresAt: l.expiresAt,
      firstAccessedAt: l.firstAccessedAt,
      lastAccessedAt: l.lastAccessedAt,
      accessCount: l.accessCount,
      createdAt: l.createdAt,
    })),
  });
}

