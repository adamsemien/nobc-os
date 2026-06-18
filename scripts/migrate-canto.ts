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
 *   --inventory  (default)  Phase 1: read-only walk + manifest. No downloads, no
 *                           R2, no DB writes.
 *   (migration mode is added once REPLICATE_API_TOKEN is provisioned: it needs a
 *    live embed to confirm the pgvector dimension N before the schema is touched.)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const clean = (v: string | undefined): string => (v ?? '').trim().replace(/^['"]|['"]$/g, '');
const TOKEN = clean(process.env.CANTO_ACCESS_TOKEN);
const TENANT = clean(process.env.CANTO_TENANT);
const DOMAIN = clean(process.env.CANTO_BASE_DOMAIN) || 'canto.com';
const API_BASE = `https://${TENANT}.${DOMAIN}/api/v1`;

// Albums (and their subtrees) excluded from every phase, by name, per the brief.
const EXCLUDE_NAMES = new Set(['uploaded content inbox', 'trash bin']);
// Known album IDs from the brief, cross-checked in the manifest.
const KNOWN_IDS = ['TT7F2', 'MTTIG', 'HG2AA', 'QI38L', 'MBRP9'];
// RAW stills are reported (and later migrated) separately from rendered images.
const RAW_EXT = new Set([
  'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'raw', 'srw', 'pef',
  'sr2', 'x3f', '3fr', 'mef', 'mos', 'nrw', 'rwl', 'iiq',
]);

interface CantoAsset {
  id: string;
  name: string;
  scheme: string; // image | video | document | audio | ...
  size: number | string; // bytes
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
  if (!res.ok) {
    throw new Error(`canto ${res.status} for ${p}: ${(await res.text()).slice(0, 140)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Full library tree (single call; the only root-enumeration endpoint). */
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

async function runInventory(): Promise<void> {
  console.log('CANTO MIGRATION - PHASE 1 INVENTORY (read-only; no downloads, no R2, no DB writes)');
  console.log(`base: ${API_BASE}`);
  const user = await cantoGet('/user');
  console.log(`auth: /user ok (account=${user.accountName})\n`);

  const tree = await fetchTree();
  const albums = collectAlbums(tree);

  const byType: Record<AssetType, { count: number; bytes: number }> = {
    image: { count: 0, bytes: 0 },
    video: { count: 0, bytes: 0 },
    raw: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 },
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

  // Manifest output.
  console.log('Known album ID cross-check:');
  for (const k of KNOWN_IDS) {
    console.log(`  ${k}  ${knownFound[k] ? `OK "${knownFound[k]}"` : 'MISSING - not found in tree'}`);
  }

  console.log('\nIn-scope albums (excluded subtrees: Uploaded Content Inbox, Trash Bin):');
  console.log('  ' + 'id'.padEnd(7) + 'count'.padStart(6) + '  ' + 'bytes'.padStart(9) + '   img/vid/raw/oth  name');
  for (const r of perAlbum.filter((r) => r.count > 0).sort((a, b) => b.bytes - a.bytes)) {
    const mix = `${r.t.image}/${r.t.video}/${r.t.raw}/${r.t.other}`;
    console.log(`  ${r.id.padEnd(7)}${String(r.count).padStart(6)}  ${human(r.bytes).padStart(9)}   ${mix.padEnd(15)} ${r.name}`);
  }
  const empty = perAlbum.filter((r) => r.count === 0).length;
  console.log(`  (+ ${empty} empty albums with 0 assets)`);

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

async function main(): Promise<void> {
  if (!TOKEN || !TENANT) {
    console.error('[migrate-canto] missing CANTO_ACCESS_TOKEN or CANTO_TENANT in .env.local');
    process.exit(1);
  }
  const mode = process.argv.includes('--migrate') ? 'migrate' : 'inventory';
  if (mode === 'inventory') {
    await runInventory();
    return;
  }
  // Migration mode is wired up once REPLICATE_API_TOKEN is provisioned (embedding
  // dimension N must be confirmed against a live embed before the schema changes).
  console.error('[migrate-canto] --migrate is not yet enabled (awaiting REPLICATE_API_TOKEN + schema apply).');
  process.exit(2);
}

main().catch((e) => {
  console.error('[migrate-canto] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
