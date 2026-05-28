import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteObject } from '@/lib/dam/storage';

const ALLOWED = (process.env.DEV_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Mirrors the cleanup contract in scripts/seed-dam.ts. That script isn't
// import-safe (it runs main() on load), so the sentinel + seed-folder names are
// duplicated here — keep them in sync with scripts/seed-dam.ts if it changes.
const SENTINEL = 'dam-seed';
const SEED_FOLDER_NAMES = ['Rooftop Launch — Full Gallery', 'After Hours — Selects'];

/** DELETE — remove all dam-seed demo media (assets + R2 objects + seed folders) for the workspace. */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const workspaceId = await requireWorkspaceId(userId);

  const seeded = await db.asset.findMany({
    where: { workspaceId, uploadedBy: SENTINEL },
    select: { id: true, url: true, thumbnailUrl: true, size: true },
  });
  const freed = seeded.reduce((n, a) => n + a.size, 0);

  // Delete R2 objects (original + thumbnail). Tolerant — a failed R2 delete logs
  // and does not abort the DB cleanup (matches scripts/seed-dam.ts). deleteObject
  // no-ops when R2 is unconfigured.
  await Promise.all(
    seeded.flatMap((a) => [
      deleteObject(a.url).catch((e) => console.error('[seed-dam] R2 delete failed', a.url, e)),
      deleteObject(a.thumbnailUrl).catch((e) =>
        console.error('[seed-dam] R2 delete failed', a.thumbnailUrl, e),
      ),
    ]),
  );

  if (seeded.length) {
    const ids = seeded.map((a) => a.id);
    await db.assetDownload.deleteMany({ where: { assetId: { in: ids } } });
    await db.asset.deleteMany({ where: { workspaceId, uploadedBy: SENTINEL } });
    await db.workspace.update({
      where: { id: workspaceId },
      data: { storageBytes: { decrement: BigInt(freed) } },
    });
  }

  // Seed folders carry no sentinel — match by exact name. Clear any ShareLinks
  // first (Phase 4 unbuilt, so normally none).
  const folders = await db.mediaFolder.findMany({
    where: { workspaceId, name: { in: SEED_FOLDER_NAMES } },
    select: { id: true },
  });
  if (folders.length) {
    const fids = folders.map((f) => f.id);
    await db.shareLink.deleteMany({ where: { folderId: { in: fids } } });
    await db.mediaFolder.deleteMany({ where: { id: { in: fids } } });
  }

  return NextResponse.json({
    success: true,
    deletedAssets: seeded.length,
    deletedFolders: folders.length,
    freedBytes: freed,
  });
}
