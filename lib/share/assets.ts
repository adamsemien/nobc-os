/**
 * Asset list for a share — fetches live (non-deleted) Assets in the share's
 * folder and mints short-lived signed thumb URLs. Used by both the public
 * /api/share/token/[token] endpoint and the share-page server components.
 */
import { db } from '@/lib/db';
import { DISPLAY_URL_TTL, presignGet } from '@/lib/dam/storage';

export interface SharedAsset {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  /** Short-lived (15 min) signed GET URL for the 800px WebP thumbnail. */
  thumbUrl: string | null;
}

/** Workspace-scoped live assets in the share's folder, ordered by shootDate desc. */
export async function listShareAssets(
  workspaceId: string,
  folderId: string,
): Promise<SharedAsset[]> {
  const assets = await db.asset.findMany({
    where: { workspaceId, folderId, deletedAt: null },
    orderBy: [
      { isSelect: 'desc' },
      { sortOrder: 'asc' },
      { shootDate: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      filename: true,
      width: true,
      height: true,
      blurhash: true,
      thumbnailUrl: true,
    },
  });
  const signed = await Promise.all(
    assets.map(async (a: typeof assets[number]) => ({
      id: a.id,
      filename: a.filename,
      width: a.width,
      height: a.height,
      blurhash: a.blurhash,
      thumbUrl: await presignGet(a.thumbnailUrl, DISPLAY_URL_TTL),
    })),
  );
  return signed;
}
