/**
 * Dev seed for the DAM (`npm run seed:dam`). Populates a workspace's Media
 * library (default: nobc / Tenant Zero) with realistic demo photos + short
 * videos pulled from Pexels, so /operator/media has real content to work
 * against in development without uploading real files.
 *
 * Idempotent: every seeded Asset carries `uploadedBy = 'dam-seed'` (the schema
 * has no metadata column, so this string field is the sentinel). Each run first
 * deletes those rows + their R2 objects, plus the named seed folders, then
 * rebuilds fresh. The delete is scoped strictly to the sentinel — it never
 * touches real assets.
 *
 * AI tagging is SKIPPED by default (hardcoded plausible aiTags per asset).
 * Pass --with-tags to run the real lib/dam/tagging pipeline (no-op unless
 * CLOUDFLARE_* is set, same as production). Heuristic quality scoring (local
 * Sharp, no API) always runs.
 *
 * NOTE: the nobc workspace lives in the Producer-shared Neon DB + the shared R2
 * bucket. This writes namespaced dev demo content into it; the sentinel keeps it
 * fully removable on the next run.
 *
 * Env (loaded from .env.local): PEXELS_API_KEY (required), DATABASE_URL, and the
 * R2_* credentials (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY /
 * R2_EVENT_MEDIA_BUCKET). Optional: DAM_SEED_WORKSPACE_SLUG (default 'nobc').
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  damKey,
  uploadObject,
  deleteObject,
  presignGet,
  isStorageConfigured,
  DISPLAY_URL_TTL,
} from '../lib/dam/storage';
import { processImage, scoreImage } from '../lib/dam/image';
import { tagImage, inferEnergyLevel } from '../lib/dam/tagging';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SENTINEL = 'dam-seed';
const WORKSPACE_SLUG = process.env.DAM_SEED_WORKSPACE_SLUG ?? 'nobc';
const WITH_TAGS = process.argv.includes('--with-tags');
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const DAY = 86_400_000;

const SEED_FOLDERS = {
  A: 'Rooftop Launch — Full Gallery',
  B: 'After Hours — Selects',
} as const;
const SEED_FOLDER_NAMES = Object.values(SEED_FOLDERS);

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

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
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY! } });
  if (!res.ok) throw new Error(`Pexels photos ${res.status} for "${query}" (${orientation})`);
  const json = (await res.json()) as { photos?: PexelsPhoto[] };
  return json.photos ?? [];
}

async function pexelsVideos(query: string, count: number): Promise<PexelsVideo[]> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${count}&page=1`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY! } });
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
  folder: keyof typeof SEED_FOLDERS;
  query: string;
  orientation: Orientation;
  count: number;
  isSelect?: boolean;
  sponsorName?: string;
}
interface VideoSpec {
  folder: keyof typeof SEED_FOLDERS;
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
// inferEnergyLevel() yields a realistic spread. Used unless --with-tags.
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

async function cleanup(workspaceId: string): Promise<void> {
  const seeded = await db.asset.findMany({
    where: { workspaceId, uploadedBy: SENTINEL },
    select: { id: true, url: true, thumbnailUrl: true, size: true },
  });

  let freed = 0;
  for (const a of seeded) {
    await deleteObject(a.url).catch((e) => console.error('[seed:dam] R2 delete failed', a.url, e));
    await deleteObject(a.thumbnailUrl).catch((e) => console.error('[seed:dam] R2 delete failed', a.thumbnailUrl, e));
    freed += a.size;
  }

  if (seeded.length) {
    const ids = seeded.map((a) => a.id);
    await db.assetDownload.deleteMany({ where: { assetId: { in: ids } } });
    await db.asset.deleteMany({ where: { workspaceId, uploadedBy: SENTINEL } });
    await db.workspace.update({
      where: { id: workspaceId },
      data: { storageBytes: { decrement: BigInt(freed) } },
    });
  }

  // Seed folders carry no sentinel field — match by exact name. Defensively
  // clear any ShareLinks pointing at them first (Phase 4 unbuilt, so normally none).
  const folders = await db.mediaFolder.findMany({
    where: { workspaceId, name: { in: SEED_FOLDER_NAMES } },
    select: { id: true },
  });
  if (folders.length) {
    const fids = folders.map((f) => f.id);
    await db.shareLink.deleteMany({ where: { folderId: { in: fids } } });
    await db.mediaFolder.deleteMany({ where: { id: { in: fids } } });
  }

  console.log(`[seed:dam] cleanup: removed ${seeded.length} seeded assets (${freed} bytes), ${folders.length} folders`);
}

// ---------------------------------------------------------------------------
// Asset creation (mirrors the upload route: create -> R2 PUT -> update keys)
// ---------------------------------------------------------------------------

async function createPhoto(args: {
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
}): Promise<number> {
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
      uploadedBy: SENTINEL,
    },
  });

  const originalKey = damKey(args.workspaceId, asset.id, 'original.jpg');
  const thumbKey = damKey(args.workspaceId, asset.id, 'thumb.webp');
  await uploadObject(originalKey, args.bytes, 'image/jpeg');
  await uploadObject(thumbKey, processed.thumbnail, processed.thumbnailContentType);

  let aiTags = args.aiTags;
  if (WITH_TAGS) {
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

async function createVideo(args: {
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
}): Promise<number> {
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
      uploadedBy: SENTINEL,
    },
  });

  const originalKey = damKey(args.workspaceId, asset.id, 'original.mp4');
  const thumbKey = damKey(args.workspaceId, asset.id, 'thumb.webp');
  await uploadObject(originalKey, args.videoBytes, 'video/mp4');
  await uploadObject(thumbKey, processed.thumbnail, processed.thumbnailContentType);

  let aiTags = args.aiTags;
  if (WITH_TAGS) {
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
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!PEXELS_KEY) {
    console.error('[seed:dam] PEXELS_API_KEY is missing — add it to .env.local (do not commit it).');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('[seed:dam] DATABASE_URL is missing — add it to .env.local.');
    process.exit(1);
  }
  if (!isStorageConfigured()) {
    console.error(
      '[seed:dam] R2 not configured — set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_EVENT_MEDIA_BUCKET in .env.local.',
    );
    process.exit(1);
  }

  const ws = await db.workspace.findUnique({ where: { slug: WORKSPACE_SLUG } });
  if (!ws) {
    console.error(`[seed:dam] workspace slug "${WORKSPACE_SLUG}" not found.`);
    process.exit(1);
  }
  console.log(`[seed:dam] workspace=${ws.slug} withTags=${WITH_TAGS}`);

  await cleanup(ws.id);

  const folderA = await db.mediaFolder.create({
    data: { workspaceId: ws.id, name: SEED_FOLDERS.A, type: 'FULL_GALLERY' },
  });
  const folderB = await db.mediaFolder.create({
    data: { workspaceId: ws.id, name: SEED_FOLDERS.B, type: 'SELECTS' },
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
      console.error(`[seed:dam] ${e instanceof Error ? e.message : String(e)} — skipping spec`);
      continue;
    }
    if (photos.length < spec.count) {
      console.warn(`[seed:dam] "${spec.query}" (${spec.orientation}) returned ${photos.length}/${spec.count}`);
    }
    const aiTags = TAGS_BY_QUERY[spec.query] ?? ['people', 'event'];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      try {
        const bytes = await fetchBytes(p.src.large2x);
        const order = sortOrder[spec.folder]++;
        totalBytes += await createPhoto({
          workspaceId: ws.id,
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
        console.log(`[seed:dam] photo ${photoCount}: ${spec.query} (${spec.orientation}) -> folder ${spec.folder}`);
      } catch (e) {
        console.error(`[seed:dam] photo failed (${spec.query} #${i + 1}):`, e instanceof Error ? e.message : e);
      }
    }
  }

  // Videos
  for (const spec of VIDEO_SPECS) {
    let videos: PexelsVideo[] = [];
    try {
      videos = await pexelsVideos(spec.query, spec.count);
    } catch (e) {
      console.error(`[seed:dam] ${e instanceof Error ? e.message : String(e)} — skipping spec`);
      continue;
    }
    const aiTags = TAGS_BY_QUERY[spec.query] ?? ['people', 'event'];
    for (let i = 0; i < videos.length && i < spec.count; i++) {
      const v = videos[i];
      const file = pickVideoFile(v);
      if (!file) {
        console.warn(`[seed:dam] no mp4 for video ${v.id} ("${spec.query}")`);
        continue;
      }
      try {
        const [videoBytes, posterBytes] = await Promise.all([fetchBytes(file.link), fetchBytes(v.image)]);
        const order = sortOrder[spec.folder]++;
        totalBytes += await createVideo({
          workspaceId: ws.id,
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
        console.log(`[seed:dam] video ${videoCount}: ${spec.query} -> folder ${spec.folder}`);
      } catch (e) {
        console.error(`[seed:dam] video failed (${spec.query} #${i + 1}):`, e instanceof Error ? e.message : e);
      }
    }
  }

  if (totalBytes > 0) {
    await db.workspace.update({
      where: { id: ws.id },
      data: { storageBytes: { increment: BigInt(totalBytes) } },
    });
  }

  console.log(
    `[seed:dam] done — ${photoCount} photos + ${videoCount} videos across 2 folders (${totalBytes} bytes). Open /operator/media.`,
  );
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error('[seed:dam] fatal:', e);
    await db.$disconnect();
    process.exit(1);
  });
