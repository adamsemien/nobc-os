# DAM Phase 2a — Operator Grid Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a view-only `/operator/media` justified photo grid with BlurHash placeholders, signed-URL thumbnails, sort, filter, Postgres full-text search, a folder tree, and a density toggle.

**Architecture:** Server-component page shell (workspace-scoped, role-gated) renders a client `<MediaGrid>` that reads filter/sort/search/folder from URL params and fetches `GET /api/media/dam/assets`. Tiles render a decoded BlurHash placeholder that fades to a thumbnail served via a stable `/api/media/dam/asset/[id]/thumb` route (302 → short-lived signed R2 URL — assets stay private). FTS uses a trigger-maintained `tsvector` column + GIN index on `Asset`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma 7 (Postgres/Neon), `justified-layout` (new), `blurhash` (installed), Radix, Lucide, Vitest.

**Testing note:** TDD applies to the pure logic (FTS query builder, BlurHash→dataURL decode). API routes and React components are verified by `tsc --noEmit` + `next build` + the manual checks in the final task — the project has no component-test harness and we don't add one here (CLAUDE.md: don't add test infra as a side effect).

**Schema-diff gate:** Task 2 changes the schema. Per the user: `prisma generate` → show the diff → wait for explicit approval → push via `node node_modules/prisma/build/index.js db push` (rtk bypass). Do NOT push without approval.

**Workspace:** all work in the worktree `~/nobc-os-dam-phase-1` on branch `claude/dam-phase-2a-grid`. Commit after each task.

---

### Task 1: Add the `justified-layout` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install justified-layout`
Expected: adds `justified-layout` to dependencies.

- [ ] **Step 2: Verify resolve**

Run: `node -e "console.log(require('justified-layout/package.json').version)"`
Expected: prints a version (e.g. `4.x`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(media): add justified-layout for the DAM grid"
```

---

### Task 2: FTS — `searchVector` tsvector column, trigger, GIN index (SCHEMA GATE)

Prisma can't express a generated `tsvector` or a GIN index on it, so the column is declared `Unsupported`, created by `db push`, then made self-maintaining via a trigger + GIN index in raw SQL.

**Files:**
- Modify: `prisma/schema.prisma` (Asset model)
- Create: `prisma/sql/dam-search-vector.sql`

- [ ] **Step 1: Add the column to the Asset model**

In `prisma/schema.prisma`, inside `model Asset`, after `shooterCredit String?`:

```prisma
  /// Full-text search vector — maintained by the dam_asset_search_vector trigger
  /// (filename + tags + aiTags + sponsorName). GIN-indexed in dam-search-vector.sql.
  searchVector  Unsupported("tsvector")?
```

- [ ] **Step 2: Generate + show the diff, then STOP for approval**

Run: `node node_modules/prisma/build/index.js generate`
Then: `git --no-pager diff prisma/schema.prisma`
Show the diff to the user. **Wait for explicit approval before any push.**

- [ ] **Step 3: Push (only after approval)**

Run: `node node_modules/prisma/build/index.js db push`
Expected: `Your database is now in sync` — adds the nullable `searchVector` column.

- [ ] **Step 4: Write the SQL for trigger + GIN index + backfill**

Create `prisma/sql/dam-search-vector.sql`:

```sql
-- Maintain Asset.searchVector from text fields; GIN-index it for FTS.
CREATE OR REPLACE FUNCTION dam_asset_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple',
    coalesce(NEW."filename", '') || ' ' ||
    coalesce(array_to_string(NEW."tags", ' '), '') || ' ' ||
    coalesce(array_to_string(NEW."aiTags", ' '), '') || ' ' ||
    coalesce(NEW."sponsorName", '')
  );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dam_asset_search_vector_trg ON "Asset";
CREATE TRIGGER dam_asset_search_vector_trg
  BEFORE INSERT OR UPDATE OF "filename", "tags", "aiTags", "sponsorName"
  ON "Asset" FOR EACH ROW EXECUTE FUNCTION dam_asset_search_vector();

CREATE INDEX IF NOT EXISTS "Asset_searchVector_idx" ON "Asset" USING GIN ("searchVector");

-- Backfill any existing rows.
UPDATE "Asset" SET "searchVector" = to_tsvector('simple',
  coalesce("filename", '') || ' ' ||
  coalesce(array_to_string("tags", ' '), '') || ' ' ||
  coalesce(array_to_string("aiTags", ' '), '') || ' ' ||
  coalesce("sponsorName", '')
);
```

- [ ] **Step 5: Apply the SQL (after approval/push)**

Run: `node node_modules/prisma/build/index.js db execute --file prisma/sql/dam-search-vector.sql`
Expected: succeeds (no output / "Script executed successfully").

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/sql/dam-search-vector.sql
git commit -m "feat(media): add FTS searchVector column, trigger, and GIN index on Asset"
```

---

### Task 3: Design tokens — `--dam-folder-tree` (deep evergreen) + `--font-mono`

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add tokens**

In `app/globals.css`, add to the `:root` (day) token block:

```css
  --dam-folder-tree: #1f3d2f;        /* deep evergreen — DAM folder tree surface */
  --dam-folder-tree-text: #e8efe9;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

And in the night/dark token block:

```css
  --dam-folder-tree: #16241c;
  --dam-folder-tree-text: #d6e2d8;
```

- [ ] **Step 2: Verify build picks them up**

Run: `node node_modules/next/dist/bin/next build 2>&1 | tail -5` (or defer to Task 14's build)
Expected: no CSS errors.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(media): add --dam-folder-tree and --font-mono tokens"
```

---

### Task 4: Media nav item

**Files:**
- Modify: `app/operator/operator-nav.tsx`

- [ ] **Step 1: Add the icon import**

In the `lucide-react` import block, add `Images`:

```ts
  ScanLine,
  MessageSquare,
  Images,
```

- [ ] **Step 2: Add the nav item**

In `PRIMARY_ITEMS`, after the Events item:

```ts
  { href: '/operator/media',           label: 'Media',         match: '/operator/media',                        Icon: Images },
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep operator-nav || echo CLEAN`
Expected: CLEAN

- [ ] **Step 4: Commit**

```bash
git add app/operator/operator-nav.tsx
git commit -m "feat(media): add Media item to operator nav"
```

---

### Task 5: FTS query builder — `lib/dam/search.ts` (TDD)

A pure helper that turns search/filter/sort params into a Prisma `Prisma.Sql` query fragment, so it's unit-testable without a DB.

**Files:**
- Create: `lib/dam/search.ts`
- Test: `lib/dam/__tests__/search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildAssetWhere, ASSET_SORTS, parseAssetQuery } from '../search';

describe('parseAssetQuery', () => {
  it('defaults sort to date and excludes trash', () => {
    const p = parseAssetQuery(new URLSearchParams(''));
    expect(p.sort).toBe('date');
    expect(p.view).toBe('active');
  });
  it('clamps unknown sort to date', () => {
    const p = parseAssetQuery(new URLSearchParams('sort=bogus'));
    expect(p.sort).toBe('date');
  });
  it('parses filters', () => {
    const p = parseAssetQuery(new URLSearchParams('eventId=e1&fileType=PHOTO&isSelect=true&sponsor=Acme&tag=rooftop&q=sunset&view=trash'));
    expect(p).toMatchObject({ eventId: 'e1', fileType: 'PHOTO', isSelect: true, sponsor: 'Acme', tag: 'rooftop', q: 'sunset', view: 'trash' });
  });
});

describe('ASSET_SORTS', () => {
  it('maps every sort key to an ORDER BY fragment', () => {
    for (const key of ['date','event','sponsor','fileType','selects','quality','manual'] as const) {
      expect(ASSET_SORTS[key]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- lib/dam/__tests__/search.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/dam/search.ts`**

```ts
import { Prisma } from '@prisma/client';

export type AssetSort = 'date' | 'event' | 'sponsor' | 'fileType' | 'selects' | 'quality' | 'manual';
export type AssetView = 'active' | 'trash';

export interface AssetQuery {
  sort: AssetSort;
  view: AssetView;
  eventId?: string;
  folderId?: string;
  fileType?: 'PHOTO' | 'VIDEO';
  isSelect?: boolean;
  sponsor?: string;
  tag?: string;
  q?: string;
  from?: string; // ISO date
  to?: string;   // ISO date
  cursor?: string;
}

const SORTS: Record<AssetSort, Prisma.Sql> = {
  date:     Prisma.sql`"shootDate" DESC NULLS LAST, "createdAt" DESC`,
  event:    Prisma.sql`"eventId" ASC NULLS LAST, "createdAt" DESC`,
  sponsor:  Prisma.sql`"sponsorName" ASC NULLS LAST, "createdAt" DESC`,
  fileType: Prisma.sql`"fileType" ASC, "createdAt" DESC`,
  selects:  Prisma.sql`"isSelect" DESC, "createdAt" DESC`,
  quality:  Prisma.sql`"qualityScore" DESC NULLS LAST, "createdAt" DESC`,
  manual:   Prisma.sql`"sortOrder" ASC, "createdAt" DESC`,
};
export const ASSET_SORTS = SORTS;

export function parseAssetQuery(sp: URLSearchParams): AssetQuery {
  const rawSort = sp.get('sort') ?? 'date';
  const sort = (Object.keys(SORTS) as AssetSort[]).includes(rawSort as AssetSort) ? (rawSort as AssetSort) : 'date';
  const view: AssetView = sp.get('view') === 'trash' ? 'trash' : 'active';
  const ft = sp.get('fileType');
  return {
    sort,
    view,
    eventId: sp.get('eventId') || undefined,
    folderId: sp.get('folderId') || undefined,
    fileType: ft === 'PHOTO' || ft === 'VIDEO' ? ft : undefined,
    isSelect: sp.get('isSelect') === 'true' ? true : undefined,
    sponsor: sp.get('sponsor') || undefined,
    tag: sp.get('tag') || undefined,
    q: sp.get('q')?.trim() || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    cursor: sp.get('cursor') || undefined,
  };
}

/** Build the WHERE fragment (workspace-scoped). Caller passes workspaceId + optional matching eventIds for q. */
export function buildAssetWhere(
  workspaceId: string,
  p: AssetQuery,
  matchingEventIds: string[],
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`"workspaceId" = ${workspaceId}`];
  clauses.push(p.view === 'trash' ? Prisma.sql`"deletedAt" IS NOT NULL` : Prisma.sql`"deletedAt" IS NULL`);
  if (p.eventId) clauses.push(Prisma.sql`"eventId" = ${p.eventId}`);
  if (p.folderId) clauses.push(Prisma.sql`"folderId" = ${p.folderId}`);
  if (p.fileType) clauses.push(Prisma.sql`"fileType" = ${p.fileType}::"AssetFileType"`);
  if (p.isSelect) clauses.push(Prisma.sql`"isSelect" = true`);
  if (p.sponsor) clauses.push(Prisma.sql`"sponsorName" = ${p.sponsor}`);
  if (p.tag) clauses.push(Prisma.sql`(${p.tag} = ANY("tags") OR ${p.tag} = ANY("aiTags"))`);
  if (p.from) clauses.push(Prisma.sql`"shootDate" >= ${new Date(p.from)}`);
  if (p.to) clauses.push(Prisma.sql`"shootDate" <= ${new Date(p.to)}`);
  if (p.q) {
    const eventMatch = matchingEventIds.length
      ? Prisma.sql`OR "eventId" IN (${Prisma.join(matchingEventIds)})`
      : Prisma.empty;
    clauses.push(Prisma.sql`("searchVector" @@ websearch_to_tsquery('simple', ${p.q}) ${eventMatch})`);
  }
  return Prisma.join(clauses, ' AND ');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- lib/dam/__tests__/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dam/search.ts lib/dam/__tests__/search.test.ts
git commit -m "feat(media): FTS query builder for the asset list (parse + where + sort)"
```

---

### Task 6: `GET /api/media/dam/assets`

**Files:**
- Create: `app/api/media/dam/assets/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { ASSET_SORTS, buildAssetWhere, parseAssetQuery } from '@/lib/dam/search';

export const runtime = 'nodejs';
const PAGE = 60;

export async function GET(req: NextRequest) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const p = parseAssetQuery(req.nextUrl.searchParams);

  // Resolve event-name matches for FTS (eventId is a plain string, not a relation).
  let matchingEventIds: string[] = [];
  if (p.q) {
    const events = await db.event.findMany({
      where: { workspaceId, title: { contains: p.q, mode: 'insensitive' } },
      select: { id: true },
      take: 200,
    });
    matchingEventIds = events.map((e) => e.id);
  }

  const where = buildAssetWhere(workspaceId, p, matchingEventIds);
  const order = ASSET_SORTS[p.sort];
  const offset = p.cursor ? Math.max(0, parseInt(p.cursor, 10) || 0) : 0;

  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT "id","filename","blurhash","width","height","fileType","isSelect",
           "shootDate","sponsorName","eventId","tags","aiTags","qualityScore","createdAt"
    FROM "Asset"
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${PAGE + 1} OFFSET ${offset}
  `);

  const hasMore = rows.length > PAGE;
  const assets = rows.slice(0, PAGE);
  return NextResponse.json({
    assets,
    nextCursor: hasMore ? String(offset + PAGE) : null,
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "media/dam/assets" || echo CLEAN`
Expected: CLEAN

- [ ] **Step 3: Commit**

```bash
git add app/api/media/dam/assets/route.ts
git commit -m "feat(media): GET /api/media/dam/assets — filter, sort, FTS, pagination"
```

---

### Task 7: `GET /api/media/dam/folders`

**Files:**
- Create: `app/api/media/dam/folders/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const folders = await db.mediaFolder.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, name: true, type: true, eventId: true, parentId: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Asset counts per folder + a trash count, for the tree badges.
  const grouped = await db.asset.groupBy({
    by: ['folderId'],
    where: { workspaceId, deletedAt: null },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) if (g.folderId) counts[g.folderId] = g._count._all;
  const trashCount = await db.asset.count({ where: { workspaceId, deletedAt: { not: null } } });

  return NextResponse.json({ folders, counts, trashCount });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "media/dam/folders" || echo CLEAN`
Expected: CLEAN

- [ ] **Step 3: Commit**

```bash
git add app/api/media/dam/folders/route.ts
git commit -m "feat(media): GET /api/media/dam/folders — tree + asset counts"
```

---

### Task 8: `GET /api/media/dam/asset/[id]/thumb` (private → signed redirect)

**Files:**
- Create: `app/api/media/dam/asset/[id]/thumb/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { DISPLAY_URL_TTL, presignGet } from '@/lib/dam/storage';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const { id } = await ctx.params;
  const asset = await db.asset.findFirst({
    where: { id, workspaceId }, // workspace ownership check
    select: { thumbnailUrl: true },
  });
  if (!asset?.thumbnailUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = await presignGet(asset.thumbnailUrl, DISPLAY_URL_TTL);
  if (!url) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  return NextResponse.redirect(url, 302);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "thumb" || echo CLEAN`
Expected: CLEAN

- [ ] **Step 3: Commit**

```bash
git add "app/api/media/dam/asset/[id]/thumb/route.ts"
git commit -m "feat(media): thumbnail route — private asset 302 to signed URL"
```

---

### Task 9: BlurHash → data URL decode util (TDD)

**Files:**
- Create: `lib/dam/blurhash-data-url.ts`
- Test: `lib/dam/__tests__/blurhash-data-url.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { blurhashToDataUrl } from '../blurhash-data-url';

describe('blurhashToDataUrl', () => {
  it('returns null for an invalid hash', () => {
    expect(blurhashToDataUrl('not-a-hash')).toBeNull();
  });
  it('returns a PNG data URL for a valid hash', () => {
    // Valid sample hash (from blurhash docs).
    const url = blurhashToDataUrl('LEHV6nWB2yk8pyo0adR*.7kCMdnj', 32, 32);
    expect(url?.startsWith('data:image/png;base64,')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- lib/dam/__tests__/blurhash-data-url.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (pure pixel → PNG, no DOM, so it runs server- and client-side)

```ts
import { decode } from 'blurhash';
import { PNG } from 'pngjs/browser';

/** Decode a BlurHash to a PNG data URL. Returns null on invalid input. */
export function blurhashToDataUrl(hash: string, width = 32, height = 32): string | null {
  let pixels: Uint8ClampedArray;
  try {
    pixels = decode(hash, width, height);
  } catch {
    return null;
  }
  const png = new PNG({ width, height });
  png.data = Buffer.from(pixels);
  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString('base64')}`;
}
```

> If `pngjs` is not desired as a dep, the alternative is a client-only `<canvas>` decode in `BlurhashCanvas.tsx` (Task 10) and dropping this util + test. Decide in review. (`pngjs` is small, pure-JS, and lets placeholders render in server components too.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- lib/dam/__tests__/blurhash-data-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dam/blurhash-data-url.ts lib/dam/__tests__/blurhash-data-url.test.ts package.json package-lock.json
git commit -m "feat(media): BlurHash to PNG data-URL decode util"
```

---

### Task 10: `<MediaTile>` — placeholder → thumbnail fade

**Files:**
- Create: `app/operator/media/_components/MediaTile.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';
import { useState } from 'react';
import { blurhashToDataUrl } from '@/lib/dam/blurhash-data-url';

export interface TileAsset {
  id: string;
  filename: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  fileType: 'PHOTO' | 'VIDEO';
  isSelect: boolean;
}

export function MediaTile({ asset, box }: { asset: TileAsset; box: { width: number; height: number; top: number; left: number } }) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = asset.blurhash ? blurhashToDataUrl(asset.blurhash) : null;
  return (
    <div
      className="absolute overflow-hidden rounded-[6px]"
      style={{ width: box.width, height: box.height, top: box.top, left: box.left, background: 'var(--card)' }}
    >
      {placeholder && (
        <img
          src={placeholder}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: loaded ? 0 : 1 }}
        />
      )}
      <img
        src={`/api/media/dam/asset/${asset.id}/thumb`}
        alt={asset.filename}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep MediaTile || echo CLEAN`
Expected: CLEAN

- [ ] **Step 3: Commit**

```bash
git add "app/operator/media/_components/MediaTile.tsx"
git commit -m "feat(media): MediaTile — BlurHash placeholder fading to thumbnail"
```

---

### Task 11: `<MediaGrid>` — justified layout + density + fetch

**Files:**
- Create: `app/operator/media/_components/MediaGrid.tsx`
- Create: `app/operator/media/_components/useDensity.ts`

- [ ] **Step 1: Density hook (localStorage)**

`useDensity.ts`:

```tsx
'use client';
import { useEffect, useState } from 'react';
export type Density = 'small' | 'medium' | 'large';
export const ROW_HEIGHT: Record<Density, number> = { small: 140, medium: 200, large: 280 };
const KEY = 'dam:density';
export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>('medium');
  useEffect(() => {
    const saved = localStorage.getItem(KEY) as Density | null;
    if (saved && saved in ROW_HEIGHT) setDensity(saved);
  }, []);
  const set = (d: Density) => { setDensity(d); localStorage.setItem(KEY, d); };
  return [density, set];
}
```

- [ ] **Step 2: Grid component**

`MediaGrid.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import justifiedLayout from 'justified-layout';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/ui';
import { MediaTile, type TileAsset } from './MediaTile';
import { ROW_HEIGHT, type Density } from './useDensity';

export function MediaGrid({ density }: { density: Density }) {
  const sp = useSearchParams();
  const [assets, setAssets] = useState<TileAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/media/dam/assets?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => setAssets(d.assets ?? []))
      .catch((e) => { console.error('[MediaGrid] fetch failed', e); setAssets([]); })
      .finally(() => setLoading(false));
  }, [sp]);

  const layout = useMemo(() => {
    if (!containerWidth) return null;
    return justifiedLayout(
      assets.map((a) => ({ width: a.width ?? 4, height: a.height ?? 3 })),
      { containerWidth, targetRowHeight: ROW_HEIGHT[density], boxSpacing: 8 },
    );
  }, [assets, containerWidth, density]);

  return (
    <div ref={ref} className="relative w-full">
      {!loading && assets.length === 0 && (
        <EmptyState title="No media" description="Upload photos to get started." />
      )}
      {layout && (
        <div className="relative" style={{ height: layout.containerHeight }}>
          {assets.map((a, i) => (
            <MediaTile key={a.id} asset={a} box={layout.boxes[i]} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "MediaGrid|useDensity" || echo CLEAN`
Expected: CLEAN (if `justified-layout` lacks types, add `declare module 'justified-layout';` in a new `types/justified-layout.d.ts` and re-check.)

- [ ] **Step 4: Commit**

```bash
git add "app/operator/media/_components/MediaGrid.tsx" "app/operator/media/_components/useDensity.ts" types/ 2>/dev/null
git commit -m "feat(media): MediaGrid — justified layout, density, param-driven fetch"
```

---

### Task 12: `<FolderTree>`

**Files:**
- Create: `app/operator/media/_components/FolderTree.tsx`

- [ ] **Step 1: Implement** (reads `/api/media/dam/folders`, sets `?folderId=` / `?view=trash` via router)

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Folder, Star, Video, Megaphone, Image as ImageIcon, Trash2 } from 'lucide-react';

interface Folder { id: string; name: string; type: string; eventId: string | null; parentId: string | null; }
const TYPE_ICON: Record<string, typeof Folder> = { FULL_GALLERY: ImageIcon, SELECTS: Star, VIDEO: Video, SPONSOR: Megaphone, BRAND: Folder };

export function FolderTree() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [trashCount, setTrashCount] = useState(0);
  const activeFolder = sp.get('folderId');
  const isTrash = sp.get('view') === 'trash';

  useEffect(() => {
    fetch('/api/media/dam/folders').then((r) => r.json()).then((d) => {
      setFolders(d.folders ?? []); setCounts(d.counts ?? {}); setTrashCount(d.trashCount ?? 0);
    }).catch((e) => console.error('[FolderTree] fetch failed', e));
  }, []);

  const go = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) v === null ? next.delete(k) : next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <nav
      className="flex h-full w-[240px] shrink-0 flex-col gap-1 overflow-y-auto p-3 font-[family-name:var(--font-dm-sans)] text-[13px]"
      style={{ background: 'var(--dam-folder-tree)', color: 'var(--dam-folder-tree-text)' }}
    >
      <button onClick={() => go({ folderId: null, view: null })}
        className="rounded-[6px] px-2 py-1.5 text-left" style={{ opacity: !activeFolder && !isTrash ? 1 : 0.7 }}>
        All Media
      </button>
      {folders.map((f) => {
        const Icon = TYPE_ICON[f.type] ?? Folder;
        return (
          <button key={f.id} onClick={() => go({ folderId: f.id, view: null })}
            className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left"
            style={{ paddingLeft: f.parentId ? 20 : 8, opacity: activeFolder === f.id ? 1 : 0.7 }}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{f.name}</span>
            {counts[f.id] ? <span className="text-[11px] opacity-70">{counts[f.id]}</span> : null}
          </button>
        );
      })}
      <button onClick={() => go({ view: 'trash', folderId: null })}
        className="mt-auto flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left" style={{ opacity: isTrash ? 1 : 0.7 }}>
        <Trash2 className="h-4 w-4" /> <span className="flex-1">Trash</span>
        {trashCount ? <span className="text-[11px] opacity-70">{trashCount}</span> : null}
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep FolderTree || echo CLEAN`
Expected: CLEAN

- [ ] **Step 3: Commit**

```bash
git add "app/operator/media/_components/FolderTree.tsx"
git commit -m "feat(media): FolderTree — evergreen sidebar, folder + trash navigation"
```

---

### Task 13: `<MediaToolbar>` — search + sort + density

**Files:**
- Create: `app/operator/media/_components/MediaToolbar.tsx`

- [ ] **Step 1: Implement** (debounced search → `?q`, sort dropdown → `?sort`, density buttons via `useDensity`)

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, Rows2, Rows3, Rows4 } from 'lucide-react';
import { useDensity, type Density } from './useDensity';

const SORTS: { value: string; label: string }[] = [
  { value: 'date', label: 'Date' }, { value: 'event', label: 'Event' }, { value: 'sponsor', label: 'Sponsor' },
  { value: 'fileType', label: 'File type' }, { value: 'selects', label: 'Selects first' },
  { value: 'quality', label: 'Quality' }, { value: 'manual', label: 'Manual' },
];

export function MediaToolbar({ onDensity }: { onDensity: (d: Density) => void }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [, setDensity] = useDensity();

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      q ? next.set('q', q) : next.delete('q');
      router.push(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSort = (value: string) => {
    const next = new URLSearchParams(sp.toString()); next.set('sort', value);
    router.push(`${pathname}?${next.toString()}`);
  };
  const pickDensity = (d: Density) => { setDensity(d); onDensity(d); };

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search media…"
          className="w-full rounded-[8px] border py-1.5 pl-8 pr-3 text-[13px]"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
      </div>
      <select value={sp.get('sort') ?? 'date'} onChange={(e) => setSort(e.target.value)}
        className="rounded-[8px] border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <div className="flex gap-1">
        {([['small', Rows4], ['medium', Rows3], ['large', Rows2]] as const).map(([d, Icon]) => (
          <button key={d} onClick={() => pickDensity(d)} aria-label={`${d} thumbnails`}
            className="rounded-[6px] border p-1.5" style={{ borderColor: 'var(--border)' }}>
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep MediaToolbar || echo CLEAN`
Expected: CLEAN

- [ ] **Step 3: Commit**

```bash
git add "app/operator/media/_components/MediaToolbar.tsx"
git commit -m "feat(media): MediaToolbar — debounced search, sort, density toggle"
```

---

### Task 14: Filter panel `<FilterPanel>`

**Files:**
- Create: `app/operator/media/_components/FilterPanel.tsx`

- [ ] **Step 1: Implement** (Radix-free slide-out using a styled `<aside>`; controls write `eventId`, `from`/`to`, `fileType`, `isSelect`, `sponsor`, `tag` to URL params). Server shell passes available `events` + `sponsors` lists for the dropdowns.

```tsx
'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export interface FilterOptions {
  events: { id: string; title: string }[];
  sponsors: string[];
  tags: string[];
}

export function FilterPanel({ options }: { options: FilterOptions }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    v ? next.set(k, v) : next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  };
  const lbl = 'mb-1 block text-[11px] uppercase tracking-wide';
  const ctl = 'w-full rounded-[6px] border px-2 py-1.5 text-[13px]';
  const style = { borderColor: 'var(--border)', background: 'var(--card)' } as const;
  return (
    <aside className="flex w-[220px] shrink-0 flex-col gap-4 p-3">
      <div>
        <label className={lbl} style={{ color: 'var(--text-muted)' }}>Event</label>
        <select className={ctl} style={style} value={sp.get('eventId') ?? ''} onChange={(e) => set('eventId', e.target.value)}>
          <option value="">All</option>
          {options.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl} style={{ color: 'var(--text-muted)' }}>File type</label>
        <select className={ctl} style={style} value={sp.get('fileType') ?? ''} onChange={(e) => set('fileType', e.target.value)}>
          <option value="">All</option><option value="PHOTO">Photo</option><option value="VIDEO">Video</option>
        </select>
      </div>
      <div>
        <label className={lbl} style={{ color: 'var(--text-muted)' }}>Sponsor</label>
        <select className={ctl} style={style} value={sp.get('sponsor') ?? ''} onChange={(e) => set('sponsor', e.target.value)}>
          <option value="">All</option>
          {options.sponsors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={lbl} style={{ color: 'var(--text-muted)' }}>From</label>
          <input type="date" className={ctl} style={style} value={sp.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div className="flex-1">
          <label className={lbl} style={{ color: 'var(--text-muted)' }}>To</label>
          <input type="date" className={ctl} style={style} value={sp.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={sp.get('isSelect') === 'true'} onChange={(e) => set('isSelect', e.target.checked ? 'true' : '')} />
        Selects only
      </label>
    </aside>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep FilterPanel || echo CLEAN`
Expected: CLEAN

- [ ] **Step 3: Commit**

```bash
git add "app/operator/media/_components/FilterPanel.tsx"
git commit -m "feat(media): FilterPanel — event/date/type/sponsor/select filters"
```

---

### Task 15: Page shell `/operator/media` + client composition

The grid + toolbar share `density` state, so a small client wrapper holds it; the server page supplies filter options.

**Files:**
- Create: `app/operator/media/page.tsx` (server)
- Create: `app/operator/media/_components/MediaWorkspace.tsx` (client wrapper)

- [ ] **Step 1: Client wrapper (shared density state)**

`MediaWorkspace.tsx`:

```tsx
'use client';
import { useDensity } from './useDensity';
import { MediaToolbar } from './MediaToolbar';
import { MediaGrid } from './MediaGrid';
import { FolderTree } from './FolderTree';
import { FilterPanel, type FilterOptions } from './FilterPanel';

export function MediaWorkspace({ options }: { options: FilterOptions }) {
  const [density, setDensity] = useDensity();
  return (
    <div className="flex h-[calc(100vh-60px)]">
      <FolderTree />
      <div className="flex flex-1 flex-col overflow-y-auto px-4">
        <MediaToolbar onDensity={setDensity} />
        <MediaGrid density={density} />
      </div>
      <FilterPanel options={options} />
    </div>
  );
}
```

- [ ] **Step 2: Server page (role gate + filter options)**

`page.tsx`:

```tsx
import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { MediaWorkspace } from './_components/MediaWorkspace';

export default async function MediaPage() {
  const { workspaceId } = await requireRolePage(OperatorRole.READ_ONLY);

  const [events, sponsorRows] = await Promise.all([
    db.event.findMany({ where: { workspaceId }, select: { id: true, title: true }, orderBy: { startAt: 'desc' }, take: 200 }),
    db.asset.findMany({ where: { workspaceId, deletedAt: null, sponsorName: { not: null } }, select: { sponsorName: true }, distinct: ['sponsorName'], take: 200 }),
  ]);
  const sponsors = sponsorRows.map((s) => s.sponsorName!).filter(Boolean);

  return (
    <div className="font-[family-name:var(--font-dm-sans)]">
      <PageHeader title="Media" />
      <MediaWorkspace options={{ events, sponsors, tags: [] }} />
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "media/page|MediaWorkspace" || echo CLEAN`
Expected: CLEAN

- [ ] **Step 4: Commit**

```bash
git add "app/operator/media/page.tsx" "app/operator/media/_components/MediaWorkspace.tsx"
git commit -m "feat(media): /operator/media page shell + workspace composition"
```

---

### Task 16: Full verification + stage doc update

**Files:**
- Modify: `_context/15-media-dam/CONTEXT.md`

- [ ] **Step 1: Typecheck everything**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/dam|operator/media|api/media/dam" || echo "DAM CLEAN"`
Expected: DAM CLEAN

- [ ] **Step 2: Unit tests**

Run: `npm run test:unit -- lib/dam`
Expected: all DAM tests pass.

- [ ] **Step 3: Full build**

Run: `node node_modules/next/dist/bin/next build 2>&1 | tail -15`
Expected: build succeeds; `/operator/media` appears in the route manifest.

- [ ] **Step 4: Manual smoke (note for the reviewer)**

With `npm run dev`: visit `/operator/media`, confirm grid renders placeholders→thumbnails, sort dropdown reorders, search filters, folder tree + trash navigate, density persists across reload (localStorage `dam:density`).

- [ ] **Step 5: Update `_context/15-media-dam/CONTEXT.md`**

Update: **Last updated** → today; **Next** → "Phase 2b — selection + bulk action bar + FLIP + preview modal + batch upload + trash actions + Top Picks"; add the new routes + `app/operator/media/**` + `lib/dam/search.ts` + `lib/dam/blurhash-data-url.ts` to **Files in play**; mark Phase 2a ✅ in the Scope list.

- [ ] **Step 6: Commit**

```bash
git add _context/15-media-dam/CONTEXT.md
git commit -m "docs(media): Phase 2a complete — update stage 15 CONTEXT"
```

---

## Self-Review

**Spec coverage:** grid (T11) ✓, BlurHash (T9/T10) ✓, signed-URL thumbs (T8) ✓, sort (T5/T6/T13) ✓, filter panel (T14) ✓, FTS (T2/T5/T6) ✓, folder tree (T7/T12) ✓, density toggle (T11/T13) ✓, nav (T4) ✓, evergreen + mono tokens (T3) ✓, role gate READ_ONLY (T6/T7/T8/T15) ✓, deferred-to-2b items absent ✓.

**Open decisions for the executor / reviewer:**
1. `pngjs` dep for server-decodable BlurHash placeholders (Task 9) vs. a client-only canvas decode (drops `pngjs`). Plan assumes `pngjs`; confirm or switch.
2. `justified-layout` ships no types → a 1-line `types/justified-layout.d.ts` ambient declaration may be needed (Task 11 step 3).

**Type consistency:** `TileAsset` (T10) is the shape `MediaGrid` (T11) maps; `AssetSort`/`parseAssetQuery`/`buildAssetWhere`/`ASSET_SORTS` (T5) are consumed unchanged in T6; `FilterOptions` (T14) matches what `page.tsx` (T15) passes. Routes all gate `READ_ONLY`.
