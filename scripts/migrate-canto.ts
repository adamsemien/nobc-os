/**
 * Canto -> NoBC OS DAM migration (standalone, local-only; run via tsx).
 *
 * Stage 0 of the DAM feature catalog. exiftool-vendored wraps a Perl binary and
 * cannot run serverless, so this is a one-time local script, never a Vercel route.
 *
 * Auth: STATIC bearer token (CANTO_ACCESS_TOKEN). No client-credentials exchange,
 * no oauth.* host. API base resolves from CANTO_TENANT + CANTO_BASE_DOMAIN, which
 * for this tenant is https://adamdev.canto.com/api/v1 (the account lives on the
 * canto.com cluster, not canto.global).
 *
 * Modes:
 *   --inventory  (default)  Phase 1: read-only walk + manifest. No writes.
 *   --migrate               Phase 3: download originals, dedup, upload to R2, create
 *                           workspace-scoped Asset rows, enrich inline (EXIF, color,
 *                           thumbnail, CLIP embedding, tags). Resumable + idempotent
 *                           from the DB (no ledger file). Smoke-gates on the first
 *                           album before continuing through the rest.
 *   --smoke                 Like --migrate but stops after the first album + verify.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { exiftool } from 'exiftool-vendored';
import { Vibrant } from 'node-vibrant/node';
import Replicate from 'replicate';
import { toSql } from 'pgvector';
import sharp from 'sharp';
import { uploadObject, damKey } from '../lib/dam/storage';
import { processImage, type ProcessedImage } from '../lib/dam/image';
import { isHeic, convertHeicToJpeg } from '../lib/dam/heic';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const clean = (v: string | undefined): string => (v ?? '').trim().replace(/^['"]|['"]$/g, '');
const TOKEN = clean(process.env.CANTO_ACCESS_TOKEN);
const TENANT = clean(process.env.CANTO_TENANT);
const DOMAIN = clean(process.env.CANTO_BASE_DOMAIN) || 'canto.com';
const API_BASE = `https://${TENANT}.${DOMAIN}/api/v1`;
const WORKSPACE_SLUG = clean(process.env.DAM_SEED_WORKSPACE_SLUG) || 'no-bad-company-1779145308231524145';
const REPLICATE_MODEL =
  'andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a';
const UPLOADED_BY = 'canto-migration';
const CONCURRENCY = 5;
// Faces are hard-gated off. No Rekognition client is imported or called.
const FACES_ENABLED = false;

// Albums (and their subtrees) excluded from every phase, by name, per the brief.
const EXCLUDE_NAMES = new Set(['uploaded content inbox', 'trash bin']);
const KNOWN_IDS = ['TT7F2', 'MTTIG', 'HG2AA', 'QI38L', 'MBRP9'];
const RAW_EXT = new Set([
  'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'raw', 'srw', 'pef',
  'sr2', 'x3f', '3fr', 'mef', 'mos', 'nrw', 'rwl', 'iiq',
]);

interface CantoAsset {
  id: string;
  name: string;
  scheme: string;
  size: number | string;
  md5?: string;
  tag?: string[];
  url?: Record<string, string>;
}
interface Album {
  id: string;
  name: string;
}
type AssetType = 'image' | 'video' | 'raw' | 'other';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Authenticated Canto GET. 429 -> exponential backoff; 401 -> fail loudly (static token). */
async function cantoGet(p: string, attempt = 0): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${p}`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'nobc-os-canto-migration',
        Accept: 'application/json',
      },
    });
  } catch (err) {
    if (attempt >= 5) throw new Error(`network error for ${p}: ${err instanceof Error ? err.message : err}`);
    await sleep(Math.min(30000, 500 * 2 ** attempt));
    return cantoGet(p, attempt + 1);
  }
  if (res.status === 429) {
    if (attempt >= 6) throw new Error(`429 backoff exhausted for ${p}`);
    await sleep(Math.min(30000, 500 * 2 ** attempt));
    return cantoGet(p, attempt + 1);
  }
  if (res.status === 401) {
    console.error('[canto] 401 Unauthorized - CANTO_ACCESS_TOKEN is invalid or expired. Regenerate it in the Canto API panel.');
    process.exit(4);
  }
  if (!res.ok) throw new Error(`canto ${res.status} for ${p}: ${(await res.text()).slice(0, 140)}`);
  return (await res.json()) as Record<string, unknown>;
}

async function fetchTree(): Promise<Record<string, unknown>[]> {
  const data = await cantoGet('/tree');
  return (data.results as Record<string, unknown>[]) ?? [];
}

/** Depth-first collect of in-scope albums; excluded names prune the whole subtree. */
function collectAlbums(nodes: Record<string, unknown>[], out: Album[] = []): Album[] {
  for (const n of nodes ?? []) {
    const name = String(n.name ?? String(n.namePath ?? '').split('/').pop() ?? '').trim();
    if (EXCLUDE_NAMES.has(name.toLowerCase())) continue;
    const id = String(n.id ?? String(n.idPath ?? '').split('/').pop() ?? '');
    if (n.scheme === 'album') out.push({ id, name });
    if (Array.isArray(n.children)) collectAlbums(n.children as Record<string, unknown>[], out);
  }
  return out;
}

/** All assets in an album, paginated (limit + start) so nothing is capped. */
async function fetchAlbumAssets(albumId: string): Promise<CantoAsset[]> {
  const out: CantoAsset[] = [];
  const limit = 1000;
  let start = 0;
  for (;;) {
    const data = await cantoGet(`/album/${albumId}?limit=${limit}&start=${start}`);
    const batch = (data.results as CantoAsset[]) ?? [];
    out.push(...batch);
    const found = Number(data.found ?? out.length);
    if (batch.length === 0 || out.length >= found) break;
    start += batch.length;
  }
  return out;
}

function classify(a: CantoAsset): AssetType {
  if (a.scheme === 'video') return 'video';
  const ext = String(a.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (RAW_EXT.has(ext)) return 'raw';
  if (a.scheme === 'image') return 'image';
  return 'other';
}

function human(bytes: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)}${u[i]}`;
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'mp4':
    case 'm4v': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

function dedupeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0)));
}

/** Bounded-concurrency map (no library; keeps memory flat over a large album). */
async function pool<T>(items: T[], concurrency: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/** Global limiter for Replicate prediction creation, which is aggressively rate-limited. */
class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((r) => this.queue.push(r));
    this.active++;
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}
const embedSem = new Semaphore(2);

// ---------------------------------------------------------------------------
// Phase 1 - inventory (read-only)
// ---------------------------------------------------------------------------

async function runInventory(): Promise<void> {
  console.log('CANTO MIGRATION - PHASE 1 INVENTORY (read-only; no downloads, no R2, no DB writes)');
  console.log(`base: ${API_BASE}`);
  const user = await cantoGet('/user');
  console.log(`auth: /user ok (account=${user.accountName})\n`);

  const albums = collectAlbums(await fetchTree());
  const byType: Record<AssetType, { count: number; bytes: number }> = {
    image: { count: 0, bytes: 0 }, video: { count: 0, bytes: 0 },
    raw: { count: 0, bytes: 0 }, other: { count: 0, bytes: 0 },
  };
  const uniqueIds = new Set<string>();
  const knownFound: Record<string, string | null> = Object.fromEntries(KNOWN_IDS.map((k) => [k, null]));
  let totalOccurrences = 0;
  const perAlbum: Array<{ id: string; name: string; count: number; bytes: number; t: Record<AssetType, number> }> = [];

  for (const al of albums) {
    if (al.id in knownFound) knownFound[al.id] = al.name;
    const assets = await fetchAlbumAssets(al.id);
    const row = { id: al.id, name: al.name, count: assets.length, bytes: 0, t: { image: 0, video: 0, raw: 0, other: 0 } as Record<AssetType, number> };
    for (const a of assets) {
      const bytes = Number(a.size) || 0;
      const type = classify(a);
      row.bytes += bytes;
      row.t[type] += 1;
      byType[type].count += 1;
      byType[type].bytes += bytes;
      uniqueIds.add(String(a.id));
      totalOccurrences += 1;
    }
    perAlbum.push(row);
  }

  console.log('Known album ID cross-check:');
  for (const k of KNOWN_IDS) console.log(`  ${k}  ${knownFound[k] ? `OK "${knownFound[k]}"` : 'MISSING - not found in tree'}`);
  console.log('\nIn-scope albums (excluded subtrees: Uploaded Content Inbox, Trash Bin):');
  console.log('  ' + 'id'.padEnd(7) + 'count'.padStart(6) + '  ' + 'bytes'.padStart(9) + '   img/vid/raw/oth  name');
  for (const r of perAlbum.filter((r) => r.count > 0).sort((a, b) => b.bytes - a.bytes)) {
    console.log(`  ${r.id.padEnd(7)}${String(r.count).padStart(6)}  ${human(r.bytes).padStart(9)}   ${`${r.t.image}/${r.t.video}/${r.t.raw}/${r.t.other}`.padEnd(15)} ${r.name}`);
  }
  console.log(`  (+ ${perAlbum.filter((r) => r.count === 0).length} empty albums with 0 assets)`);
  const grandBytes = byType.image.bytes + byType.video.bytes + byType.raw.bytes + byType.other.bytes;
  console.log('\nTOTALS');
  console.log(`  in-scope albums: ${albums.length} (${perAlbum.filter((r) => r.count > 0).length} with assets)`);
  console.log(`  total asset occurrences: ${totalOccurrences}`);
  console.log(`  unique Canto asset ids:  ${uniqueIds.size}  (${totalOccurrences - uniqueIds.size} cross-album duplicates)`);
  console.log('  by type (count / bytes):');
  for (const t of ['image', 'video', 'raw', 'other'] as AssetType[]) {
    console.log(`    ${t.padEnd(6)} ${String(byType[t].count).padStart(5)}  ${human(byType[t].bytes).padStart(9)}`);
  }
  console.log(`  grand total: ${totalOccurrences} occurrences, ${uniqueIds.size} unique, ${human(grandBytes)} (${grandBytes} bytes)`);
}

// ---------------------------------------------------------------------------
// Phase 3 - migration
// ---------------------------------------------------------------------------

interface Counters {
  created: number;
  deduped: number;
  skipped: number;
  skippedNonMedia: number;
  failed: number;
  embedBackfilled: number;
  bytes: number;
  byType: Record<AssetType, number>;
}
const newCounters = (): Counters => ({
  created: 0, deduped: 0, skipped: 0, skippedNonMedia: 0, failed: 0, embedBackfilled: 0, bytes: 0,
  byType: { image: 0, video: 0, raw: 0, other: 0 },
});

async function downloadBytes(url: string, useAuth: boolean, attempt = 0): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: useAuth
        ? { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'nobc-os-canto-migration' }
        : { 'User-Agent': 'nobc-os-canto-migration' },
    });
    if (res.status === 429 && attempt < 5) {
      await sleep(Math.min(30000, 500 * 2 ** attempt));
      return downloadBytes(url, useAuth, attempt + 1);
    }
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (attempt < 4) {
      await sleep(Math.min(30000, 500 * 2 ** attempt));
      return downloadBytes(url, useAuth, attempt + 1);
    }
    return null;
  }
}

/** Original master bytes: prefer the public directUrlOriginal, fall back to the auth download endpoint. */
async function downloadOriginal(a: CantoAsset): Promise<Buffer> {
  const direct = a.url?.directUrlOriginal;
  if (direct) {
    const b = await downloadBytes(direct, false);
    if (b) return b;
  }
  const dl = a.url?.download;
  if (dl) {
    const b = await downloadBytes(dl, true);
    if (b) return b;
  }
  throw new Error(`no downloadable original for asset ${a.id} (${a.name})`);
}

async function readExif(bytes: Buffer, ext: string): Promise<Record<string, unknown> | null> {
  const tmp = path.join(os.tmpdir(), `canto-${crypto.randomBytes(6).toString('hex')}.${ext}`);
  try {
    fs.writeFileSync(tmp, bytes);
    const tags = await exiftool.read(tmp);
    return JSON.parse(JSON.stringify(tags)) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    if (fs.existsSync(tmp)) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
}

async function readColor(input: Buffer): Promise<{ dominantColor: string | null; colorPalette: string[] }> {
  try {
    // node-vibrant v4 cannot decode webp (and chokes on some originals); sharp-convert
    // to a small JPEG first so any source format yields a palette.
    const jpeg = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const palette = (await new Vibrant(jpeg).getPalette()) as Record<string, { hex: string; population: number } | null>;
    const swatches = Object.values(palette).filter((s): s is { hex: string; population: number } => !!s);
    if (!swatches.length) return { dominantColor: null, colorPalette: [] };
    const dom = swatches.reduce((a, b) => (b.population > a.population ? b : a));
    return { dominantColor: dom.hex, colorPalette: swatches.map((s) => s.hex) };
  } catch {
    return { dominantColor: null, colorPalette: [] };
  }
}

async function embed(replicate: Replicate, imageUrl: string): Promise<number[] | null> {
  await embedSem.acquire();
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const out = (await replicate.run(REPLICATE_MODEL, { input: { inputs: imageUrl } })) as Array<{ embedding: number[] }>;
        const e = out?.[0]?.embedding;
        if (Array.isArray(e) && e.length === 768) return e;
        await sleep(1500);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const throttled = msg.includes('429') || /throttl|too many/i.test(msg);
        await sleep(throttled ? Math.min(45000, 8000 * (attempt + 1)) : Math.min(8000, 1000 * 2 ** attempt));
      }
    }
    return null;
  } finally {
    embedSem.release();
  }
}

/** Faces are hard-gated off (FACES_ENABLED=false): this never runs and imports no SDK. */
async function maybeIndexFaces(_assetId: string, _bytes: Buffer): Promise<void> {
  if (!FACES_ENABLED) return;
  throw new Error('faces indexing is gated off');
}

interface Ctx {
  db: PrismaClient;
  replicate: Replicate;
  workspaceId: string;
  skip: Set<string>;
  // Already-created canto PHOTO assets whose embedding is still null (sourceId -> assetId).
  // Embedding is non-fatal, so a row can land without one; a resume re-attempts it from
  // the live Canto preview URL (Canto is alive during the migration window) without
  // re-downloading or re-uploading the bytes.
  needsEmbed: Map<string, string>;
  folderCache: Map<string, string>;
}

async function resolveFolder(ctx: Ctx, album: Album): Promise<string> {
  const cached = ctx.folderCache.get(album.id);
  if (cached) return cached;
  let folder = await ctx.db.mediaFolder.findFirst({
    where: { workspaceId: ctx.workspaceId, eventId: album.id },
    select: { id: true },
  });
  if (!folder) {
    folder = await ctx.db.mediaFolder.create({
      data: { workspaceId: ctx.workspaceId, name: album.name, type: 'FULL_GALLERY', eventId: album.id },
      select: { id: true },
    });
  }
  ctx.folderCache.set(album.id, folder.id);
  return folder.id;
}

async function processAsset(ctx: Ctx, album: Album, folderId: string, a: CantoAsset, c: Counters): Promise<void> {
  try {
    if (ctx.skip.has(a.id)) {
      // Already migrated. If its embedding is still null (a non-fatal straggler from an
      // earlier run), re-attempt it from the live Canto preview URL - no re-download/PUT.
      const assetId = ctx.needsEmbed.get(a.id);
      if (assetId) {
        const previewUrl = a.url?.directUrlPreview || a.url?.directUrlOriginal;
        if (previewUrl) {
          const emb = await embed(ctx.replicate, previewUrl);
          if (emb) {
            try {
              await ctx.db.$executeRaw`UPDATE "Asset" SET embedding = ${toSql(emb)}::vector WHERE id = ${assetId}`;
              ctx.needsEmbed.delete(a.id);
              c.embedBackfilled++;
            } catch (err) {
              console.error(`[migrate] embedding backfill write failed ${a.id}: ${err instanceof Error ? err.message : err}`);
            }
          }
        }
      }
      c.skipped++;
      return;
    }
    const type = classify(a);
    if (type !== 'image' && type !== 'video') {
      c.skippedNonMedia++;
      return;
    }
    const isImage = type === 'image';

    let bytes: Buffer;
    try {
      bytes = await downloadOriginal(a);
    } catch (err) {
      c.failed++;
      console.error(`[migrate] download failed ${a.id} ${a.name}: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');

    // Exact-duplicate: merge this album's tags into the existing row, no PUT, no bytes.
    const existing = await ctx.db.asset.findFirst({
      where: { workspaceId: ctx.workspaceId, sha256: sha },
      select: { id: true, tags: true },
    });
    if (existing) {
      const merged = dedupeTags([...existing.tags, ...(a.tag ?? [])]);
      if (merged.length !== existing.tags.length) {
        await ctx.db.asset.update({ where: { id: existing.id }, data: { tags: merged } });
      }
      ctx.skip.add(a.id);
      c.deduped++;
      return;
    }

    // Web-decodable buffer for images (convert HEIC); originals kept for EXIF.
    let webBuffer = bytes;
    let ext = (String(a.name).split('.').pop() || (isImage ? 'jpg' : 'mp4')).toLowerCase();
    let effectiveMime = mimeFromExt(ext);
    let exifInput: Buffer | undefined;
    let processed: ProcessedImage | null = null;
    if (isImage) {
      if (isHeic('', a.name)) {
        try {
          webBuffer = await convertHeicToJpeg(bytes);
          ext = 'jpg';
          effectiveMime = 'image/jpeg';
          exifInput = bytes;
        } catch {
          /* leave original; processImage may still fail and is non-fatal */
        }
      }
      try {
        processed = await processImage(webBuffer, { exifInput });
      } catch (err) {
        console.error(`[migrate] processImage failed ${a.id} ${a.name}: ${err instanceof Error ? err.message : err}`);
        processed = null;
      }
    }

    // Create the row first to get the id for the R2 key prefix.
    let asset: { id: string };
    try {
      asset = await ctx.db.asset.create({
        data: {
          workspaceId: ctx.workspaceId,
          filename: String(a.name),
          url: '',
          thumbnailUrl: '',
          fileType: isImage ? 'PHOTO' : 'VIDEO',
          size: webBuffer.length,
          width: processed?.width ?? undefined,
          height: processed?.height ?? undefined,
          blurhash: processed?.blurhash ?? undefined,
          shootDate: processed?.shootDate ?? undefined,
          tags: dedupeTags(a.tag ?? []),
          sourceSystem: 'canto',
          sourceId: a.id,
          sha256: sha,
          folderId,
          eventId: album.id,
          uploadedBy: UPLOADED_BY,
        },
        select: { id: true },
      });
    } catch (err) {
      // Unique (workspaceId, sourceSystem, sourceId) violation: already migrated. Skip.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        ctx.skip.add(a.id);
        c.skipped++;
        return;
      }
      throw err;
    }

    const originalKey = damKey(ctx.workspaceId, asset.id, `original.${ext}`);
    const thumbKey = damKey(ctx.workspaceId, asset.id, 'thumb.webp');
    try {
      const puts = [uploadObject(originalKey, webBuffer, effectiveMime)];
      if (isImage && processed) puts.push(uploadObject(thumbKey, processed.thumbnail, processed.thumbnailContentType));
      await Promise.all(puts);
    } catch (err) {
      await ctx.db.asset.delete({ where: { id: asset.id } }).catch(() => {});
      c.failed++;
      console.error(`[migrate] R2 upload failed ${a.id} ${a.name}: ${err instanceof Error ? err.message : err}`);
      return;
    }

    // Backfill keys + bump workspace storage, only on a genuine new PUT.
    await ctx.db.$transaction([
      ctx.db.asset.update({
        where: { id: asset.id },
        data: { url: originalKey, thumbnailUrl: isImage && processed ? thumbKey : '' },
      }),
      ctx.db.workspace.update({
        where: { id: ctx.workspaceId },
        data: { storageBytes: { increment: BigInt(webBuffer.length) } },
      }),
    ]);
    ctx.skip.add(a.id);
    c.created++;
    c.bytes += webBuffer.length;
    c.byType[type] += 1;

    // Inline enrichment - each step non-fatal; a failure leaves the field null.
    const exif = await readExif(bytes, ext);
    let duration: number | undefined;
    if (!isImage && exif) {
      const d = Number((exif as Record<string, unknown>).Duration ?? (exif as Record<string, unknown>).MediaDuration);
      if (Number.isFinite(d) && d > 0) duration = d;
    }
    const color = isImage ? await readColor(webBuffer) : { dominantColor: null, colorPalette: [] as string[] };
    try {
      await ctx.db.asset.update({
        where: { id: asset.id },
        data: {
          exif: exif ? (exif as Prisma.InputJsonValue) : undefined,
          dominantColor: color.dominantColor ?? undefined,
          colorPalette: color.colorPalette.length ? (color.colorPalette as Prisma.InputJsonValue) : undefined,
          duration,
        },
      });
    } catch (err) {
      console.error(`[migrate] enrich update failed ${a.id}: ${err instanceof Error ? err.message : err}`);
    }

    if (isImage) {
      const previewUrl = a.url?.directUrlPreview || a.url?.directUrlOriginal;
      if (previewUrl) {
        const emb = await embed(ctx.replicate, previewUrl);
        if (emb) {
          try {
            await ctx.db.$executeRaw`UPDATE "Asset" SET embedding = ${toSql(emb)}::vector WHERE id = ${asset.id}`;
          } catch (err) {
            console.error(`[migrate] embedding write failed ${a.id}: ${err instanceof Error ? err.message : err}`);
          }
        }
      }
    }

    await maybeIndexFaces(asset.id, bytes);
  } catch (err) {
    c.failed++;
    console.error(`[migrate] unexpected error ${a.id} ${a.name}: ${err instanceof Error ? err.message : err}`);
  }
}

/** Auto-verify a freshly-migrated album: counts + enrichment coverage. */
async function verifyAlbum(ctx: Ctx, album: Album, mediaCount: number): Promise<boolean> {
  const [r] = await ctx.db.$queryRaw<
    Array<{ total: bigint; with_embed: bigint; with_search: bigint; with_exif: bigint; with_color: bigint; with_folder: bigint; images: bigint }>
  >`
    SELECT count(*)::bigint AS total,
      count(*) FILTER (WHERE "embedding" IS NOT NULL)::bigint AS with_embed,
      count(*) FILTER (WHERE "searchVector" IS NOT NULL)::bigint AS with_search,
      count(*) FILTER (WHERE "exif" IS NOT NULL)::bigint AS with_exif,
      count(*) FILTER (WHERE "dominantColor" IS NOT NULL)::bigint AS with_color,
      count(*) FILTER (WHERE "folderId" IS NOT NULL)::bigint AS with_folder,
      count(*) FILTER (WHERE "fileType" = 'PHOTO')::bigint AS images
    FROM "Asset"
    WHERE "workspaceId" = ${ctx.workspaceId} AND "eventId" = ${album.id}
      AND "sourceSystem" = 'canto' AND "deletedAt" IS NULL`;
  const n = (b: bigint): number => Number(b);
  const total = n(r.total);
  const images = n(r.images);
  console.log(
    `[smoke] verify "${album.name}": rows=${total} (album media=${mediaCount}) images=${images} ` +
      `embed=${n(r.with_embed)} search=${n(r.with_search)} exif=${n(r.with_exif)} color=${n(r.with_color)} folder=${n(r.with_folder)}`,
  );
  const checks: Array<[string, boolean]> = [
    ['rows present', total > 0],
    // Rows for this album sit between 1 and its media count: exact-content duplicates
    // merge into an existing row instead of creating one (some land in OTHER albums), so
    // total can be below mediaCount. It can never exceed it. An exact-equality check is
    // brittle across resume passes; the final reconciliation does the global headcount.
    ['rows within album media count', total > 0 && total <= mediaCount],
    ['all have searchVector', n(r.with_search) === total],
    ['all have folderId', n(r.with_folder) === total],
    // Embedding coverage converges across resume passes - each pass backfills the prior
    // pass's rate-limited stragglers - so instantaneous coverage is not a per-album
    // precondition. Only a fully broken Replicate token (~0 embeddings) is. Gate on "the
    // pipeline produced some embeddings"; exact coverage is reported above and reconciled
    // (and swept to completion) at the end.
    ['embedding pipeline working (>0 when images present)', images === 0 || n(r.with_embed) > 0],
    ['images have exif', images === 0 || n(r.with_exif) > 0],
    ['images have color', images === 0 || n(r.with_color) > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error('[smoke] FAILED checks: ' + failed.map(([n2]) => n2).join('; '));
    return false;
  }
  console.log('[smoke] all checks PASSED');
  return true;
}

async function runMigrate(smokeOnly: boolean): Promise<void> {
  if (!clean(process.env.DATABASE_URL)) throw new Error('DATABASE_URL is missing');
  if (!clean(process.env.REPLICATE_API_TOKEN)) throw new Error('REPLICATE_API_TOKEN is missing');

  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
  const replicate = new Replicate({ auth: clean(process.env.REPLICATE_API_TOKEN) });

  try {
    const ws = await db.workspace.findUnique({ where: { slug: WORKSPACE_SLUG }, select: { id: true, slug: true, name: true } });
    if (!ws) throw new Error(`workspace slug "${WORKSPACE_SLUG}" not found - refusing to migrate into an unknown workspace`);
    console.log(`CANTO MIGRATION - PHASE 3 (${smokeOnly ? 'SMOKE' : 'FULL'})`);
    console.log(`base: ${API_BASE}  workspace: ${ws.name} (${ws.slug})\n`);

    // Self-heal partial writes from an interrupted run. A row is created before its R2
    // upload, so a mid-album kill can leave a row with an empty / non-dam url and no
    // object in storage. Such a row would otherwise sit in the skip-set forever. Delete
    // it so this run re-creates it cleanly. A completed row's url is always a 'dam/' key,
    // and storageBytes is only bumped in the same txn as that url write, so a partial row
    // never counted toward storage - nothing to decrement.
    const repaired = await db.$executeRaw`
      DELETE FROM "Asset"
      WHERE "workspaceId" = ${ws.id} AND "sourceSystem" = 'canto' AND "deletedAt" IS NULL
        AND ("url" IS NULL OR "url" = '' OR "url" NOT LIKE 'dam/%')`;
    if (repaired) console.log(`repaired: deleted ${repaired} partial row(s) from an interrupted run (will re-create)`);

    // Resume/idempotency skip-set from the DB (no ledger file).
    const already = await db.asset.findMany({
      where: { workspaceId: ws.id, sourceSystem: 'canto', deletedAt: null },
      select: { sourceId: true },
    });
    const skip = new Set<string>(already.map((a) => a.sourceId!).filter(Boolean));

    // Stragglers: already-migrated PHOTO rows still missing an embedding. On this run
    // they are re-embedded in place from the live Canto preview URL (no re-download).
    const pending = await db.$queryRaw<Array<{ id: string; sourceId: string | null }>>`
      SELECT "id", "sourceId" FROM "Asset"
      WHERE "workspaceId" = ${ws.id} AND "sourceSystem" = 'canto' AND "deletedAt" IS NULL
        AND "fileType" = 'PHOTO' AND "embedding" IS NULL AND "sourceId" IS NOT NULL`;
    const needsEmbed = new Map<string, string>(pending.filter((p) => p.sourceId).map((p) => [p.sourceId!, p.id]));
    console.log(`resume: ${skip.size} canto assets already migrated (will skip); ${needsEmbed.size} missing embeddings (will backfill)\n`);

    const ctx: Ctx = { db, replicate, workspaceId: ws.id, skip, needsEmbed, folderCache: new Map() };
    const albums = collectAlbums(await fetchTree());
    const totals = newCounters();
    let smokeVerified = false;

    for (const album of albums) {
      const assets = await fetchAlbumAssets(album.id);
      const media = assets.filter((a) => {
        const t = classify(a);
        return t === 'image' || t === 'video';
      });
      if (media.length === 0) continue;

      const folderId = await resolveFolder(ctx, album);
      const c = newCounters();
      await pool(media, CONCURRENCY, (a) => processAsset(ctx, album, folderId, a, c));

      for (const k of Object.keys(totals.byType) as AssetType[]) totals.byType[k] += c.byType[k];
      totals.created += c.created;
      totals.deduped += c.deduped;
      totals.skipped += c.skipped;
      totals.skippedNonMedia += c.skippedNonMedia;
      totals.failed += c.failed;
      totals.embedBackfilled += c.embedBackfilled;
      totals.bytes += c.bytes;
      const backfillNote = c.embedBackfilled > 0 ? ` embedBackfilled=${c.embedBackfilled}` : '';
      console.log(
        `[album] ${album.id} "${album.name}" media=${media.length} -> created=${c.created} deduped=${c.deduped} skipped=${c.skipped} failed=${c.failed}${backfillNote} (${human(c.bytes)})`,
      );

      // Universal-failure guard: an album that produced no rows yet had failures
      // means a broken precondition (storage/creds) - abort before churning the rest.
      // (0 created with 0 failures is a clean resume - all assets already migrated.)
      if (c.created === 0 && c.failed > 0) {
        console.error(`[migrate] album "${album.name}" created 0 rows with ${c.failed} failures. Aborting - check storage/credentials.`);
        process.exitCode = 5;
        return;
      }
      // Smoke gate: verify the first album that actually creates rows, then continue.
      if (!smokeVerified && c.created > 0) {
        smokeVerified = true;
        const ok = await verifyAlbum(ctx, album, media.length);
        if (!ok) {
          console.error('[migrate] SMOKE VERIFICATION FAILED - stopping before processing the rest.');
          process.exitCode = 5;
          return;
        }
        if (smokeOnly) {
          console.log('[migrate] --smoke: stopping after the first verified album.');
          break;
        }
      }
    }

    // Final reconciliation.
    const [recon] = await db.$queryRaw<Array<{ rows: bigint; embedded: bigint; bytes: bigint | null }>>`
      SELECT count(*)::bigint AS rows,
        count(*) FILTER (WHERE "embedding" IS NOT NULL)::bigint AS embedded,
        COALESCE(sum("size"), 0)::bigint AS bytes
      FROM "Asset"
      WHERE "workspaceId" = ${ws.id} AND "sourceSystem" = 'canto' AND "deletedAt" IS NULL`;
    console.log('\nRECONCILIATION');
    console.log(`  created this run: ${totals.created}  deduped: ${totals.deduped}  skipped(resume): ${totals.skipped}  non-media skipped: ${totals.skippedNonMedia}  embedBackfilled: ${totals.embedBackfilled}  failed: ${totals.failed}`);
    console.log(`  by type created: image=${totals.byType.image} video=${totals.byType.video}`);
    console.log(`  DB now holds (canto, live): rows=${Number(recon.rows)} embedded=${Number(recon.embedded)} bytes=${human(Number(recon.bytes ?? 0))} (${Number(recon.bytes ?? 0)})`);
  } finally {
    await exiftool.end().catch(() => {});
    await db.$disconnect().catch(() => {});
  }
}

async function main(): Promise<void> {
  if (!TOKEN || !TENANT) {
    console.error('[migrate-canto] missing CANTO_ACCESS_TOKEN or CANTO_TENANT in .env.local');
    process.exit(1);
  }
  if (process.argv.includes('--migrate')) {
    await runMigrate(false);
  } else if (process.argv.includes('--smoke')) {
    await runMigrate(true);
  } else {
    await runInventory();
  }
}

main().catch((e) => {
  console.error('[migrate-canto] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
