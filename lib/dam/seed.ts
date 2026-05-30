/**
 * DAM demo-media seeding — shared, import-safe core.
 *
 * Populates a workspace's Media library with realistic demo photos + short
 * videos pulled from Pexels, so /operator/media has real content to work
 * against. Consumed by both the CLI (`scripts/seed-dam.ts` → `npm run seed:dam`)
 * and the dev API route (`POST /api/dev/seed-dam`).
 *
 * Idempotent: every seeded Asset carries `uploadedBy = DAM_SEED_SENTINEL` (the
 * schema has no metadata column, so this string field is the sentinel). Each run
 * first deletes those rows + their R2 objects, plus the named seed folders, then
 * rebuilds fresh. The delete is scoped strictly to the sentinel — it never
 * touches real assets.
 *
 * AI tagging is SKIPPED by default (hardcoded plausible aiTags per asset). Pass
 * `withTags: true` to run the real lib/dam/tagging pipeline (no-op unless
 * CLOUDFLARE_* is set, same as production). Heuristic quality scoring (local
 * Sharp, no API) always runs.
 *
 * Requires PEXELS_API_KEY + the R2_* credentials at call time; `seedDam` throws
 * a descriptive Error if either is missing so callers can surface it.
 */
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  damKey,
  uploadObject,
  deleteObject,
  presignGet,
  isStorageConfigured,
  DISPLAY_URL_TTL,
} from './storage';
import { processImage, scoreImage } from './image';
import { tagImage, inferEnergyLevel } from './tagging';

export const DAM_SEED_SENTINEL = 'dam-seed';

export const DAM_SEED_FOLDERS = {
  A: 'Rooftop Launch — Full Gallery',
  B: 'After Hours — Selects',
} as const;
export const DAM_SEED_FOLDER_NAMES = Object.values(DAM_SEED_FOLDERS);

const DAY = 86_400_000;

export interface SeedDamResult {
  photoCount: number;
  videoCount: number;
  totalBytes: number;
}

export interface CleanupResult {
  deletedAssets: number;
  deletedFolders: number;
  freedBytes: number;
}

// ---------------------------------------------------------------------------
// Pexels client
// ---------------------------------------------------------------------------

interface PexelsPhoto {
  id: number;
  photographer: string;
  src: { original: string; large2x: string; large: string };
}
interface PexelsVideoFile {
  quality: string;
  width: number | null;
  height: number | null;
  link: string;
  file_type: string;
}
interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  image: string; // poster
  user: { name: string };
  video_files: PexelsVideoFile[];
}

type Orientation = 'landscape' | 'portrait' | 'square';

async function pexelsPhotos(query: string, orientation: Orientation, count: number): Promise<PexelsPhoto[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${count}&page=1`;
  const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY! } });
  if (!res.ok) throw new Error(`Pexels photos ${res.status} for "${query}" (${orientation})`);
  const json = (await res.json()) as { photos?: PexelsPhoto[] };
  return json.photos ?? [];
}

async function pexelsVideos(query: string, count: number): Promise<PexelsVideo[]> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${count}&page=1`;
  const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY! } });
  if (!res.ok) throw new Error(`Pexels videos ${res.status} for "${query}"`);
  const json = (await res.json()) as { videos?: PexelsVideo[] };
  return json.videos ?? [];
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Prefer a moderate-width mp4 (<=1280) to keep downloads small. */
function pickVideoFile(v: PexelsVideo): PexelsVideoFile | null {
  const mp4 = v.video_files.filter((f) => f.file_type === 'video/mp4' && f.link);
  if (!mp4.length) return null;
  const sized = mp4.filter((f) => (f.width ?? 0) > 0).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const moderate = sized.find((f) => (f.width ?? 0) >= 640 && (f.width ?? 0) <= 1280);
  return moderate ?? sized[0] ?? mp4[0];
}

// ---------------------------------------------------------------------------
// Seed plan
// ---------------------------------------------------------------------------

interface PhotoSpec {
  folder: keyof typeof DAM_SEED_FOLDERS;
  query: string;
  orientation: Orientation;
  count: number;
  isSelect?: boolean;
  sponsorName?: string;
}
interface VideoSpec {
  folder: keyof typeof DAM_SEED_FOLDERS;
  query: string;
  count: number;
}

// 14 photos (Folder A: 9, Folder B: 5) across landscape/portrait/square.
const PHOTO_SPECS: PhotoSpec[] = [
  { folder: 'A', query: 'rooftop party', orientation: 'landscape', count: 3 },
  { folder: 'A', query: 'nightlife', orientation: 'portrait', count: 3 },
  { folder: 'A', query: 'event crowd', orientation: 'square', count: 3 },
  { folder: 'B', query: 'concert', orientation: 'landscape', count: 2, isSelect: true, sponsorName: 'Casamigos' },
  { folder: 'B', query: 'celebration', orientation: 'portrait', count: 2, isSelect: true },
  { folder: 'B', query: 'party', orientation: 'square', count: 1 },
];

// 3 short videos (Folder A: 2, Folder B: 1).
const VIDEO_SPECS: VideoSpec[] = [
  { folder: 'A', query: 'nightlife', count: 2 },
  { folder: 'B', query: 'concert', count: 1 },
];

// Hardcoded aiTags keyed by query, drawn from lib/dam/tagging's energy vocab so
// inferEnergyLevel() yields a realistic spread. Used unless withTags.
const TAGS_BY_QUERY: Record<string, string[]> = {
  'rooftop party': ['people', 'crowd', 'party', 'nightlife', 'warm-light'],
  nightlife: ['nightlife', 'crowd', 'stage', 'low-light'],
  'event crowd': ['people', 'crowd', 'event', 'indoor'],
  concert: ['concert', 'crowd', 'stage', 'performance'],
  celebration: ['celebration', 'people', 'party'],
  party: ['party', 'people', 'dance'],
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Cleanup (idempotency)
// ---------------------------------------------------------------------------

/** Remove all dam-seed demo media (assets + R2 objects + seed folders) for the workspace. */
export async function cleanupSeededMedia(db: PrismaClient, workspaceId: string): Promise<CleanupResult> {
  const seeded = await db.asset.findMany({
    where: { workspaceId, uploadedBy: DAM_SEED_SENTINEL },
    select: { id: true, url: true, thumbnailUrl: true, size: true },
  });
  const freed = seeded.reduce((n, a) => n + a.size, 0);

  // Delete R2 objects (original + thumbnail). Tolerant — a failed R2 delete logs
  // and does not abort the DB cleanup. deleteObject no-ops when R2 is unconfigured.
  await Promise.all(
    seeded.flatMap((a) => [
      deleteObject(a.url).catch((e) => console.error('[seed:dam] R2 delete failed', a.url, e)),
      deleteObject(a.thumbnailUrl).catch((e) =>
        console.error('[seed:dam] R2 delete failed', a.thumbnailUrl, e),
      ),
    ]),
  );

  if (seeded.length) {
    const ids = seeded.map((a) => a.id);
    await db.assetDownload.deleteMany({ where: { assetId: { in: ids } } });
    await db.asset.deleteMany({ where: { workspaceId, uploadedBy: DAM_SEED_SENTINEL } });
    await db.workspace.update({
      where: { id: workspaceId },
      data: { storageBytes: { decrement: BigInt(freed) } },
    });
  }

  // Seed folders carry no sentinel — match by exact name. Clear any ShareLinks
  // pointing at them first.
  const folders = await db.mediaFolder.findMany({
    where: { workspaceId, name: { in: DAM_SEED_FOLDER_NAMES } },
    select: { id: true },
  });
  if (folders.length) {
    const fids = folders.map((f) => f.id);
    await db.shareLink.deleteMany({ where: { folderId: { in: fids } } });
    await db.mediaFolder.deleteMany({ where: { id: { in: fids } } });
  }

  return { deletedAssets: seeded.length, deletedFolders: folders.length, freedBytes: freed };
}

// ---------------------------------------------------------------------------
// Asset creation (mirrors the upload route: create -> R2 PUT -> update keys)
// ---------------------------------------------------------------------------

async function createPhoto(
  db: PrismaClient,
  withTags: boolean,
  args: {
    workspaceId: string;
    folderId: string;
    bytes: Buffer;
    filename: string;
    aiTags: string[];
    isSelect: boolean;
    sortOrder: number;
    shootDate: Date;
    sponsorName?: string;
    shooterCredit: string;
  },
): Promise<number> {
  const processed = await processImage(args.bytes);
  const score = await scoreImage(args.bytes).catch(() => null);

  const asset = await db.asset.create({
    data: {
      workspaceId: args.workspaceId,
      filename: args.filename,
      url: '',
      thumbnailUrl: '',
      fileType: 'PHOTO',
      size: args.bytes.length,
      width: processed.width ?? undefined,
      height: processed.height ?? undefined,
      blurhash: processed.blurhash ?? undefined,
      shootDate: args.shootDate,
      isSelect: args.isSelect,
      sortOrder: args.sortOrder,
      folderId: args.folderId,
      sponsorName: args.sponsorName,
      shooterCredit: args.shooterCredit,
      uploadedBy: DAM_SEED_SENTINEL,
    },
  });

  const originalKey = damKey(args.workspaceId, asset.id, 'original.jpg');
  const thumbKey = damKey(args.workspaceId, asset.id, 'thumb.webp');
  await uploadObject(originalKey, args.bytes, 'image/jpeg');
  await uploadObject(thumbKey, processed.thumbnail, processed.thumbnailContentType);

  let aiTags = args.aiTags;
  if (withTags) {
    const signed = await presignGet(originalKey, DISPLAY_URL_TTL);
    aiTags = signed ? await tagImage(signed) : [];
  }

  await db.asset.update({
    where: { id: asset.id },
    data: {
      url: originalKey,
      thumbnailUrl: thumbKey,
      aiTags,
      energyLevel: inferEnergyLevel(aiTags) ?? undefined,
      ...(score
        ? {
            qualityScore: score.qualityScore,
            qualityScores: score.qualityScores as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
  });

  return args.bytes.length;
}

async function createVideo(
  db: PrismaClient,
  withTags: boolean,
  args: {
    workspaceId: string;
    folderId: string;
    videoBytes: Buffer;
    posterBytes: Buffer;
    filename: string;
    width: number | null;
    height: number | null;
    duration: number;
    aiTags: string[];
    sortOrder: number;
    shootDate: Date;
    shooterCredit: string;
  },
): Promise<number> {
  // Sharp can't decode video — derive thumbnail + blurhash from the poster image.
  const processed = await processImage(args.posterBytes);
  const score = await scoreImage(args.posterBytes).catch(() => null);

  const asset = await db.asset.create({
    data: {
      workspaceId: args.workspaceId,
      filename: args.filename,
      url: '',
      thumbnailUrl: '',
      fileType: 'VIDEO',
      size: args.videoBytes.length,
      width: args.width ?? processed.width ?? undefined,
      height: args.height ?? processed.height ?? undefined,
      duration: args.duration,
      blurhash: processed.blurhash ?? undefined,
      shootDate: args.shootDate,
      sortOrder: args.sortOrder,
      folderId: args.folderId,
      shooterCredit: args.shooterCredit,
      uploadedBy: DAM_SEED_SENTINEL,
    },
  });

  const originalKey = damKey(args.workspaceId, asset.id, 'original.mp4');
  const thumbKey = damKey(args.workspaceId, asset.id, 'thumb.webp');
  await uploadObject(originalKey, args.videoBytes, 'video/mp4');
  await uploadObject(thumbKey, processed.thumbnail, processed.thumbnailContentType);

  let aiTags = args.aiTags;
  if (withTags) {
    const signed = await presignGet(thumbKey, DISPLAY_URL_TTL);
    aiTags = signed ? await tagImage(signed) : [];
  }

  await db.asset.update({
    where: { id: asset.id },
    data: {
      url: originalKey,
      thumbnailUrl: thumbKey,
      aiTags,
      energyLevel: inferEnergyLevel(aiTags) ?? undefined,
      ...(score
        ? {
            qualityScore: score.qualityScore,
            qualityScores: score.qualityScores as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
  });

  return args.videoBytes.length;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Seed a workspace's DAM with demo photos + videos. Idempotent — clears prior
 * sentinel-tagged seed media first. Throws if PEXELS_API_KEY or R2 is missing.
 * `log` lets the CLI stream progress; the API route omits it.
 */
export async function seedDam(
  db: PrismaClient,
  workspaceId: string,
  opts?: { withTags?: boolean; log?: (line: string) => void },
): Promise<SeedDamResult> {
  const withTags = opts?.withTags ?? false;
  const log = opts?.log ?? (() => {});

  if (!process.env.PEXELS_API_KEY) {
    throw new Error('PEXELS_API_KEY is not set — demo-media seeding is unavailable.');
  }
  if (!isStorageConfigured()) {
    throw new Error('R2 storage is not configured — set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_EVENT_MEDIA_BUCKET.');
  }

  const cleared = await cleanupSeededMedia(db, workspaceId);
  log(`cleanup: removed ${cleared.deletedAssets} seeded assets, ${cleared.deletedFolders} folders`);

  const folderA = await db.mediaFolder.create({
    data: { workspaceId, name: DAM_SEED_FOLDERS.A, type: 'FULL_GALLERY' },
  });
  const folderB = await db.mediaFolder.create({
    data: { workspaceId, name: DAM_SEED_FOLDERS.B, type: 'SELECTS' },
  });
  const folderId = { A: folderA.id, B: folderB.id };

  const shootBase = Date.now() - 25 * DAY;
  const sortOrder = { A: 0, B: 0 };
  let globalIdx = 0;
  let totalBytes = 0;
  let photoCount = 0;
  let videoCount = 0;

  // Photos
  for (const spec of PHOTO_SPECS) {
    let photos: PexelsPhoto[] = [];
    try {
      photos = await pexelsPhotos(spec.query, spec.orientation, spec.count);
    } catch (e) {
      log(`${e instanceof Error ? e.message : String(e)} — skipping spec`);
      continue;
    }
    const aiTags = TAGS_BY_QUERY[spec.query] ?? ['people', 'event'];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      try {
        const bytes = await fetchBytes(p.src.large2x);
        const order = sortOrder[spec.folder]++;
        totalBytes += await createPhoto(db, withTags, {
          workspaceId,
          folderId: folderId[spec.folder],
          bytes,
          filename: `seed-${slug(spec.query)}-${i + 1}.jpg`,
          aiTags,
          isSelect: spec.isSelect ?? false,
          sortOrder: order,
          shootDate: new Date(shootBase + globalIdx * 12 * 3_600_000),
          sponsorName: spec.sponsorName,
          shooterCredit: `Pexels / ${p.photographer}`,
        });
        photoCount++;
        globalIdx++;
        log(`photo ${photoCount}: ${spec.query} (${spec.orientation}) -> folder ${spec.folder}`);
      } catch (e) {
        log(`photo failed (${spec.query} #${i + 1}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Videos
  for (const spec of VIDEO_SPECS) {
    let videos: PexelsVideo[] = [];
    try {
      videos = await pexelsVideos(spec.query, spec.count);
    } catch (e) {
      log(`${e instanceof Error ? e.message : String(e)} — skipping spec`);
      continue;
    }
    const aiTags = TAGS_BY_QUERY[spec.query] ?? ['people', 'event'];
    for (let i = 0; i < videos.length && i < spec.count; i++) {
      const v = videos[i];
      const file = pickVideoFile(v);
      if (!file) {
        log(`no mp4 for video ${v.id} ("${spec.query}")`);
        continue;
      }
      try {
        const [videoBytes, posterBytes] = await Promise.all([fetchBytes(file.link), fetchBytes(v.image)]);
        const order = sortOrder[spec.folder]++;
        totalBytes += await createVideo(db, withTags, {
          workspaceId,
          folderId: folderId[spec.folder],
          videoBytes,
          posterBytes,
          filename: `seed-${slug(spec.query)}-video-${i + 1}.mp4`,
          width: file.width,
          height: file.height,
          duration: v.duration,
          aiTags,
          sortOrder: order,
          shootDate: new Date(shootBase + globalIdx * 12 * 3_600_000),
          shooterCredit: `Pexels / ${v.user.name}`,
        });
        videoCount++;
        globalIdx++;
        log(`video ${videoCount}: ${spec.query} -> folder ${spec.folder}`);
      } catch (e) {
        log(`video failed (${spec.query} #${i + 1}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (totalBytes > 0) {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { storageBytes: { increment: BigInt(totalBytes) } },
    });
  }

  return { photoCount, videoCount, totalBytes };
}
