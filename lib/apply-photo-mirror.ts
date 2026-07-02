/**
 * Mirror applicant photos into the DAM.
 *
 * The /apply upload route stores originals as raw private R2 objects under
 * `applications/{workspaceId}/` and ties them to the Application through the
 * `photos.urls` ApplicationAnswer - that path is the source of truth for the
 * operator review screen and stays untouched. This module ADDITIONALLY
 * materializes each photo as a DAM Asset row (800px thumbnail + BlurHash +
 * dimensions) inside an auto-created "Applications" folder, so applicant
 * photos are browsable in /operator/media and searchable by applicant name.
 *
 * Design constraints:
 *  - Idempotent: sourceSystem='apply' + sourceId=<R2 object key> is unique per
 *    photo, backstopped by the out-of-band unique index on
 *    (workspaceId, sourceSystem, sourceId) from canto-migration-additive.sql,
 *    so retried PATCHes never duplicate assets. No schema change needed.
 *  - Best-effort: every failure is logged and swallowed here - a DAM mirror
 *    failure must never break the /apply submit path (Locked Decision: never
 *    break /apply). Callers run this via `after()` so it never adds latency.
 *  - The Asset points at the SAME R2 object the application references, so
 *    purging the asset from the DAM trash also removes the photo from the
 *    application review screen. One object, one source of truth.
 */
import { createHash } from 'crypto';
import { MediaFolderType, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getObjectBuffer, isStorageConfigured, uploadObject } from '@/lib/dam/storage';
import { processImage } from '@/lib/dam/image';
import { isWorkspacePhotoKey } from '@/lib/apply-photo';

const APPLY_SOURCE_SYSTEM = 'apply';
const APPLICATIONS_FOLDER_NAME = 'Applications';
/** Mirrors the client picker cap and the review screen's slice(0, 5). */
const MAX_MIRRORED_PHOTOS = 5;

/** Parse a `photos.urls` answer (JSON array of strings) defensively. */
function parseKeys(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function extFromKey(key: string): string {
  const m = key.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

export async function mirrorApplicationPhotosToDam(opts: {
  applicationId: string;
  workspaceId: string;
  applicantName: string | null;
  /** Raw value of the `photos.urls` answer (JSON array of R2 keys). */
  photoUrlsAnswer: string;
  /** Prior value of the answer, so a retried submit retires replaced assets. */
  previousPhotoUrlsAnswer?: string | null;
}): Promise<void> {
  const { applicationId, workspaceId, applicantName } = opts;
  try {
    if (!isStorageConfigured()) return;

    // Only keys under this workspace's `applications/` prefix are mirrored -
    // the answer value is applicant-controlled, so validate every key (IDOR).
    // A drop here means a stored photo will never render or mirror, so it must
    // be LOUD: silence is what hid the 2026-07-02 wrong-tenant key bug.
    const allKeys = parseKeys(opts.photoUrlsAnswer);
    const dropped = allKeys.filter((k) => !isWorkspacePhotoKey(k, workspaceId));
    if (dropped.length > 0) {
      console.warn('[apply/photo-mirror] dropped key(s) outside this workspace prefix', {
        applicationId,
        expectedWorkspaceId: workspaceId,
        dropped: dropped.map((k) => ({ key: k, keyWorkspaceId: k.split('/')[1] ?? null })),
      });
    }
    const keys = allKeys
      .filter((k) => isWorkspacePhotoKey(k, workspaceId))
      .slice(0, MAX_MIRRORED_PHOTOS);
    const previousKeys = parseKeys(opts.previousPhotoUrlsAnswer ?? '').filter((k) =>
      isWorkspacePhotoKey(k, workspaceId),
    );

    // Retire mirrored assets whose photo a retried submit replaced (handleSubmit
    // re-uploads fresh keys per attempt): soft-delete into the DAM trash. The
    // R2 objects are kept - purge stays an explicit operator action.
    const stale = previousKeys.filter((k) => !keys.includes(k));
    if (stale.length > 0) {
      await db.asset.updateMany({
        where: {
          workspaceId,
          sourceSystem: APPLY_SOURCE_SYSTEM,
          sourceId: { in: stale },
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
    }
    if (keys.length === 0) return;

    const folderId = await findOrCreateApplicationsFolder(workspaceId);

    for (const [i, key] of keys.entries()) {
      try {
        await mirrorOne({ applicationId, workspaceId, applicantName, key, index: i + 1, folderId });
      } catch (err) {
        console.error('[apply/photo-mirror] failed to mirror photo', {
          applicationId,
          key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[apply/photo-mirror] mirror pass failed', {
      applicationId,
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function findOrCreateApplicationsFolder(workspaceId: string): Promise<string> {
  const existing = await db.mediaFolder.findFirst({
    where: { workspaceId, name: APPLICATIONS_FOLDER_NAME, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.mediaFolder.create({
    data: { workspaceId, name: APPLICATIONS_FOLDER_NAME, type: MediaFolderType.FULL_GALLERY },
    select: { id: true },
  });
  return created.id;
}

async function mirrorOne(opts: {
  applicationId: string;
  workspaceId: string;
  applicantName: string | null;
  key: string;
  index: number;
  folderId: string;
}): Promise<void> {
  const { applicationId, workspaceId, applicantName, key, index, folderId } = opts;

  const already = await db.asset.findFirst({
    where: { workspaceId, sourceSystem: APPLY_SOURCE_SYSTEM, sourceId: key },
    select: { id: true },
  });
  if (already) return;

  const original = await getObjectBuffer(key);
  if (!original) {
    console.warn('[apply/photo-mirror] original object missing, skipping', { applicationId, key });
    return;
  }

  // The upload route already stripped EXIF and baked orientation, so this pass
  // only produces the thumbnail, BlurHash, and dimensions the DAM grid needs.
  const processed = await processImage(original);
  const thumbKey = `${key}.thumb.webp`;
  await uploadObject(thumbKey, processed.thumbnail, processed.thumbnailContentType);

  const name = (applicantName ?? '').trim() || 'Applicant';
  try {
    await db.asset.create({
      data: {
        workspaceId,
        filename: `${name} - application photo ${index}.${extFromKey(key)}`,
        url: key,
        thumbnailUrl: thumbKey,
        fileType: 'PHOTO',
        size: original.length,
        width: processed.width ?? undefined,
        height: processed.height ?? undefined,
        blurhash: processed.blurhash ?? undefined,
        tags: ['application'],
        sourceSystem: APPLY_SOURCE_SYSTEM,
        sourceId: key,
        sha256: createHash('sha256').update(original).digest('hex'),
        folderId,
        uploadedBy: 'applicant',
      },
    });
  } catch (err) {
    // P2002 on (workspaceId, sourceSystem, sourceId): a concurrent mirror of
    // the same key won the race - already mirrored, nothing to do.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }

  // Match the DAM upload route's storage accounting (original bytes only), so
  // a later trash-purge decrement stays symmetric.
  await db.workspace.update({
    where: { id: workspaceId },
    data: { storageBytes: { increment: BigInt(original.length) } },
  });
}
