# DAM Phase 2b — Grid Interaction Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add selection, bulk actions, a full-screen preview, batch upload, FLIP sort animations, trash actions, Top Picks, and manual reorder on top of the 2a grid.

**Architecture:** Selection + preview state lifts into `MediaWorkspace`. Writes go through STAFF-gated routes: a single `POST /assets/bulk` (action discriminator), single-asset `PATCH`, `GET /asset/[id]/full` (signed full-res), `POST /download-zip` (archiver stream), `POST /folders` (create). FLIP is hand-rolled (transform-only). Reads stay READ_ONLY.

**Tech Stack:** Next.js 15, Prisma 7, `archiver` (new), Radix dialog/popover, Lucide, Vitest.

**Testing:** TDD on pure helpers (`lib/dam/bulk.ts` parse/validate; `lib/dam/flip.ts` rect math). Routes + components verified by `tsc` + `next build` + the manual checks in the final task.

**No schema changes** in 2b — purely additive code. **Workspace:** worktree `~/nobc-os-dam-phase-1`, branch `claude/dam-phase-2b-interactions` (stacked on 2a). Commit per task.

---

### Task 1: Add `archiver`

- [ ] **Step 1:** `npm install archiver && npm install -D @types/archiver`
- [ ] **Step 2:** Verify: `node -e "console.log(require('archiver/package.json').version)"` → prints a version.
- [ ] **Step 3:** Commit:
```bash
git add package.json package-lock.json
git commit -m "build(media): add archiver for ZIP download"
```

---

### Task 2: Bulk-action request validator — `lib/dam/bulk.ts` (TDD)

**Files:** Create `lib/dam/bulk.ts`; Test `tests/unit/dam/bulk.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/unit/dam/bulk.test.ts`)
```ts
import { describe, it, expect } from 'vitest';
import { parseBulkAction } from '@/lib/dam/bulk';

describe('parseBulkAction', () => {
  it('rejects missing/blank assetIds', () => {
    expect(parseBulkAction({ action: 'softDelete', assetIds: [] }).ok).toBe(false);
    expect(parseBulkAction(null).ok).toBe(false);
  });
  it('rejects an unknown action', () => {
    expect(parseBulkAction({ action: 'nuke', assetIds: ['a'] }).ok).toBe(false);
  });
  it('parses flagSelect with a boolean value', () => {
    const r = parseBulkAction({ action: 'flagSelect', assetIds: ['a'], value: true });
    expect(r).toMatchObject({ ok: true, action: 'flagSelect', assetIds: ['a'], payload: { value: true } });
  });
  it('requires tags[] for addTags', () => {
    expect(parseBulkAction({ action: 'addTags', assetIds: ['a'] }).ok).toBe(false);
    expect(parseBulkAction({ action: 'addTags', assetIds: ['a'], tags: ['x'] }).ok).toBe(true);
  });
  it('requires orderedIds for reorder', () => {
    expect(parseBulkAction({ action: 'reorder', assetIds: ['a'], orderedIds: ['a', 'b'] })).toMatchObject({ ok: true });
  });
});
```
- [ ] **Step 2:** Run → fails (module not found): `node node_modules/vitest/vitest.mjs run tests/unit/dam/bulk.test.ts`
- [ ] **Step 3: Implement** `lib/dam/bulk.ts`
```ts
export type BulkAction =
  | { action: 'flagSelect'; assetIds: string[]; payload: { value: boolean } }
  | { action: 'addTags'; assetIds: string[]; payload: { tags: string[] } }
  | { action: 'move'; assetIds: string[]; payload: { folderId: string | null } }
  | { action: 'softDelete'; assetIds: string[]; payload: Record<string, never> }
  | { action: 'restore'; assetIds: string[]; payload: Record<string, never> }
  | { action: 'permanentDelete'; assetIds: string[]; payload: Record<string, never> }
  | { action: 'reorder'; assetIds: string[]; payload: { orderedIds: string[] } };

export type ParseResult = ({ ok: true } & BulkAction) | { ok: false; error: string };

const ACTIONS = ['flagSelect', 'addTags', 'move', 'softDelete', 'restore', 'permanentDelete', 'reorder'] as const;

export function parseBulkAction(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const b = body as Record<string, unknown>;
  const action = b.action;
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: 'Unknown action' };
  }
  const assetIds = Array.isArray(b.assetIds) ? b.assetIds.filter((x): x is string => typeof x === 'string') : [];
  if (assetIds.length === 0) return { ok: false, error: 'assetIds required' };

  switch (action) {
    case 'flagSelect':
      if (typeof b.value !== 'boolean') return { ok: false, error: 'value (boolean) required' };
      return { ok: true, action, assetIds, payload: { value: b.value } };
    case 'addTags': {
      const tags = Array.isArray(b.tags) ? b.tags.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
      if (tags.length === 0) return { ok: false, error: 'tags[] required' };
      return { ok: true, action, assetIds, payload: { tags } };
    }
    case 'move':
      return { ok: true, action, assetIds, payload: { folderId: typeof b.folderId === 'string' ? b.folderId : null } };
    case 'reorder': {
      const orderedIds = Array.isArray(b.orderedIds) ? b.orderedIds.filter((x): x is string => typeof x === 'string') : [];
      if (orderedIds.length === 0) return { ok: false, error: 'orderedIds required' };
      return { ok: true, action, assetIds, payload: { orderedIds } };
    }
    default:
      return { ok: true, action, assetIds, payload: {} } as ParseResult;
  }
}
```
- [ ] **Step 4:** Run → passes.
- [ ] **Step 5:** Commit: `git add lib/dam/bulk.ts tests/unit/dam/bulk.test.ts && git commit -m "feat(media): bulk-action request validator with tests"`

---

### Task 3: FLIP rect helper — `lib/dam/flip.ts` (TDD)

**Files:** Create `lib/dam/flip.ts`; Test `tests/unit/dam/flip.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest';
import { invert } from '@/lib/dam/flip';

describe('invert', () => {
  it('returns the delta from new→old position', () => {
    expect(invert({ top: 10, left: 20 }, { top: 50, left: 60 })).toEqual({ dx: -40, dy: -40 });
  });
  it('returns zero when unchanged', () => {
    expect(invert({ top: 5, left: 5 }, { top: 5, left: 5 })).toEqual({ dx: 0, dy: 0 });
  });
});
```
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement** `lib/dam/flip.ts`
```ts
export interface Pos { top: number; left: number }
/** FLIP "invert": the transform that visually places a tile at its OLD spot,
 * given its NEW (post-layout) position. Animate from this to identity. */
export function invert(oldPos: Pos, newPos: Pos): { dx: number; dy: number } {
  return { dx: oldPos.left - newPos.left, dy: oldPos.top - newPos.top };
}
```
- [ ] **Step 4:** Run → passes.
- [ ] **Step 5:** Commit: `git add lib/dam/flip.ts tests/unit/dam/flip.test.ts && git commit -m "feat(media): FLIP invert helper with tests"`

---

### Task 4: `POST /folders` create (extend the 2a route)

**Files:** Modify `app/api/media/dam/folders/route.ts`

- [ ] **Step 1: Add the POST handler** (keep the existing GET)
```ts
import { OperatorRole, MediaFolderType } from '@prisma/client';
// ... existing imports + GET ...

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const b = await req.json().catch(() => null);
  const name = typeof b?.name === 'string' ? b.name.trim() : '';
  const type = b?.type as MediaFolderType;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!Object.values(MediaFolderType).includes(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  const folder = await db.mediaFolder.create({
    data: {
      workspaceId, name, type,
      eventId: typeof b.eventId === 'string' ? b.eventId : null,
      parentId: typeof b.parentId === 'string' ? b.parentId : null,
    },
  });
  return NextResponse.json({ folder }, { status: 201 });
}
```
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep folders || echo CLEAN`
- [ ] **Step 3:** Commit: `git add app/api/media/dam/folders/route.ts && git commit -m "feat(media): POST /folders — create folder (STAFF)"`

---

### Task 5: Single-asset `PATCH` — `app/api/media/dam/asset/[id]/route.ts`

**Files:** Create `app/api/media/dam/asset/[id]/route.ts`

- [ ] **Step 1: Implement**
```ts
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const data: Prisma.AssetUpdateInput = {};
  if (Array.isArray(b.tags)) data.tags = b.tags.filter((t: unknown): t is string => typeof t === 'string');
  if (typeof b.isSelect === 'boolean') data.isSelect = b.isSelect;
  if (typeof b.shooterCredit === 'string' || b.shooterCredit === null) data.shooterCredit = b.shooterCredit;
  if (typeof b.sponsorName === 'string' || b.sponsorName === null) data.sponsorName = b.sponsorName;
  if (typeof b.eventId === 'string' || b.eventId === null) data.eventId = b.eventId;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No editable fields' }, { status: 400 });

  const result = await db.asset.updateMany({ where: { id, workspaceId }, data });
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const asset = await db.asset.findFirst({ where: { id, workspaceId } });
  return NextResponse.json({ asset });
}
```
- [ ] **Step 2:** tsc grep → CLEAN
- [ ] **Step 3:** Commit: `git add "app/api/media/dam/asset/[id]/route.ts" && git commit -m "feat(media): PATCH /asset/[id] — inline metadata edit (STAFF)"`

---

### Task 6: `GET /asset/[id]/full` — signed full-res

**Files:** Create `app/api/media/dam/asset/[id]/full/route.ts`

- [ ] **Step 1: Implement** (mirror the thumb route, full-res key + 24h TTL)
```ts
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { DOWNLOAD_URL_TTL, presignGet } from '@/lib/dam/storage';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await ctx.params;
  const asset = await db.asset.findFirst({ where: { id, workspaceId }, select: { url: true } });
  if (!asset?.url) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const url = await presignGet(asset.url, DOWNLOAD_URL_TTL);
  if (!url) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  return NextResponse.redirect(url, 302);
}
```
- [ ] **Step 2:** tsc grep → CLEAN
- [ ] **Step 3:** Commit: `git add "app/api/media/dam/asset/[id]/full/route.ts" && git commit -m "feat(media): GET /asset/[id]/full — signed full-res redirect"`

---

### Task 7: `POST /assets/bulk`

**Files:** Create `app/api/media/dam/assets/bulk/route.ts`

- [ ] **Step 1: Implement**
```ts
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { deleteObject } from '@/lib/dam/storage';
import { parseBulkAction } from '@/lib/dam/bulk';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const parsed = parseBulkAction(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { action, assetIds } = parsed;
  const scope = { id: { in: assetIds }, workspaceId };

  switch (parsed.action) {
    case 'flagSelect':
      await db.asset.updateMany({ where: scope, data: { isSelect: parsed.payload.value } });
      break;
    case 'addTags': {
      const rows = await db.asset.findMany({ where: scope, select: { id: true, tags: true } });
      await db.$transaction(
        rows.map((a) =>
          db.asset.update({ where: { id: a.id }, data: { tags: Array.from(new Set([...a.tags, ...parsed.payload.tags])) } }),
        ),
      );
      break;
    }
    case 'move':
      await db.asset.updateMany({ where: scope, data: { folderId: parsed.payload.folderId } });
      break;
    case 'softDelete':
      await db.asset.updateMany({ where: { ...scope, deletedAt: null }, data: { deletedAt: new Date() } });
      break;
    case 'restore':
      await db.asset.updateMany({ where: scope, data: { deletedAt: null } });
      break;
    case 'permanentDelete': {
      const rows = await db.asset.findMany({ where: scope, select: { id: true, url: true, thumbnailUrl: true, size: true } });
      await Promise.allSettled(rows.flatMap((a) => [deleteObject(a.url), deleteObject(a.thumbnailUrl)]));
      const totalBytes = rows.reduce((s, a) => s + a.size, 0);
      await db.$transaction([
        db.asset.deleteMany({ where: { id: { in: rows.map((a) => a.id) }, workspaceId } }),
        db.workspace.update({ where: { id: workspaceId }, data: { storageBytes: { decrement: BigInt(totalBytes) } } }),
      ]);
      break;
    }
    case 'reorder':
      await db.$transaction(
        parsed.payload.orderedIds.map((id, i) => db.asset.updateMany({ where: { id, workspaceId }, data: { sortOrder: i } })),
      );
      break;
  }
  return NextResponse.json({ ok: true, count: assetIds.length });
}
```
- [ ] **Step 2:** tsc grep → CLEAN
- [ ] **Step 3:** Commit: `git add app/api/media/dam/assets/bulk/route.ts && git commit -m "feat(media): POST /assets/bulk — flag/tag/move/trash/restore/purge/reorder (STAFF)"`

---

### Task 8: `POST /download-zip` (archiver stream)

**Files:** Create `app/api/media/dam/download-zip/route.ts`

- [ ] **Step 1: Implement** (stream a stored ZIP of originals; level 0 — JPEGs don't recompress)
```ts
import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import archiver from 'archiver';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { DOWNLOAD_URL_TTL, presignGet } from '@/lib/dam/storage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const b = await req.json().catch(() => null);
  const ids = Array.isArray(b?.assetIds) ? b.assetIds.filter((x: unknown): x is string => typeof x === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'assetIds required' }, { status: 400 });

  const assets = await db.asset.findMany({
    where: { id: { in: ids }, workspaceId, deletedAt: null },
    select: { filename: true, url: true },
  });
  if (assets.length === 0) return NextResponse.json({ error: 'Nothing to download' }, { status: 404 });

  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.on('error', (err) => console.error('[dam/zip] archive error', err));

  // Append each original from its signed URL. De-dupe duplicate filenames.
  (async () => {
    const used = new Set<string>();
    for (const a of assets) {
      try {
        const signed = await presignGet(a.url, DOWNLOAD_URL_TTL);
        if (!signed) continue;
        const res = await fetch(signed);
        if (!res.ok || !res.body) continue;
        let name = a.filename || 'file';
        for (let i = 1; used.has(name); i++) name = a.filename.replace(/(\.[^.]+)?$/, `-${i}$1`);
        used.add(name);
        archive.append(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), { name });
      } catch (err) {
        console.error('[dam/zip] append failed', { url: a.url, err });
      }
    }
    archive.finalize();
  })();

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="nobc-media.zip"',
    },
  });
}
```
- [ ] **Step 2:** tsc grep → CLEAN (if `Readable.fromWeb`/`toWeb` typing complains, the casts above handle it).
- [ ] **Step 3:** Commit: `git add app/api/media/dam/download-zip/route.ts && git commit -m "feat(media): POST /download-zip — stream a ZIP of originals (STAFF)"`

---

### Task 9: `MediaTile` — selection, hover, click-to-preview

**Files:** Modify `app/operator/media/_components/MediaTile.tsx`

- [ ] **Step 1:** Extend props + UI. New props: `selected: boolean`, `onToggleSelect: (e: React.MouseEvent) => void`, `onOpen: () => void`.
```tsx
'use client';
import { useState } from 'react';
import { Check, Star, Film } from 'lucide-react';
import type { JLBox } from 'justified-layout';
import { BlurhashCanvas } from './BlurhashCanvas';

export interface TileAsset {
  id: string; filename: string; blurhash: string | null;
  width: number | null; height: number | null;
  fileType: 'PHOTO' | 'VIDEO'; isSelect: boolean;
}

export function MediaTile({
  asset, box, selected, onToggleSelect, onOpen,
}: {
  asset: TileAsset; box: JLBox; selected: boolean;
  onToggleSelect: (e: React.MouseEvent) => void; onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className="group absolute overflow-hidden rounded-[6px] transition-transform duration-[180ms] ease-out hover:scale-[1.02]"
      style={{ width: box.width, height: box.height, top: box.top, left: box.left, background: 'var(--card)', boxShadow: selected ? '0 0 0 3px var(--primary)' : undefined }}
      onClick={onOpen}
    >
      {asset.blurhash && (
        <BlurhashCanvas hash={asset.blurhash} className="absolute inset-0 transition-opacity duration-300" style={{ width: '100%', height: '100%', opacity: loaded ? 0 : 1 }} />
      )}
      <img src={`/api/media/dam/asset/${asset.id}/thumb`} alt={asset.filename} loading="lazy" onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-300 group-hover:brightness-105"
        style={{ opacity: loaded ? 1 : 0 }} />
      {/* checkbox top-left: visible on hover or when selected */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
        aria-label={selected ? 'Deselect' : 'Select'}
        className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-[5px] border transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ background: selected ? 'var(--primary)' : 'rgba(255,255,255,0.85)', borderColor: 'var(--border)' }}
      >
        {selected && <Check className="h-3.5 w-3.5" style={{ color: '#fff' }} />}
      </button>
      {/* bottom metadata overlay on hover */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        {asset.isSelect && <Star className="h-3 w-3 shrink-0" style={{ color: '#fff', fill: '#fff' }} />}
        {asset.fileType === 'VIDEO' && <Film className="h-3 w-3 shrink-0" style={{ color: '#fff' }} />}
        <span className="truncate font-[family-name:var(--font-mono)] text-[11px] text-white">{asset.filename}</span>
      </div>
    </div>
  );
}
```
- [ ] **Step 2:** tsc grep → CLEAN
- [ ] **Step 3:** Commit: `git add "app/operator/media/_components/MediaTile.tsx" && git commit -m "feat(media): MediaTile — selection checkbox, hover scale, metadata overlay"`

---

### Task 10: `MediaGrid` — selection lift, FLIP, expose ordered list

**Files:** Modify `app/operator/media/_components/MediaGrid.tsx`

- [ ] **Step 1:** Accept `selection: Set<string>`, `onToggle(id, shiftKey)`, `onOpen(index)`, and a `reloadKey`. Keep a `ref` map of tile elements; on `layout` change, run FLIP (capture old rects → set inverted transform → next frame transition to none). Pass `assets` up via `onAssetsChange` so the workspace can drive the preview + reorder. Render `MediaTile` with `selected`/`onToggleSelect`/`onOpen`.
```tsx
// key additions:
const prevPos = useRef<Map<string, { top: number; left: number }>>(new Map());
// after computing `layout`, in a useLayoutEffect keyed on layout:
useLayoutEffect(() => {
  if (!layout) return;
  const next = new Map<string, { top: number; left: number }>();
  assets.forEach((a, i) => { const bx = layout.boxes[i]; if (bx) next.set(a.id, { top: bx.top, left: bx.left }); });
  for (const [id, np] of next) {
    const el = tileRefs.current.get(id); const op = prevPos.current.get(id);
    if (el && op) {
      const { dx, dy } = invert(op, np);
      if (dx || dy) {
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => { el.style.transition = 'transform 220ms ease'; el.style.transform = ''; });
      }
    }
  }
  prevPos.current = next;
}, [layout, assets]);
```
(MediaTile forwards a ref via a wrapper or `onMount` callback registering into `tileRefs`.)
- [ ] **Step 2:** `onAssetsChange?.(assets)` in the fetch `.then`, so the workspace has the current ordered list.
- [ ] **Step 3:** tsc grep → CLEAN
- [ ] **Step 4:** Commit: `git add "app/operator/media/_components/MediaGrid.tsx" && git commit -m "feat(media): MediaGrid — selection, FLIP transitions, ordered-list hoist"`

---

### Task 11: `BulkActionBar`

**Files:** Create `app/operator/media/_components/BulkActionBar.tsx`

- [ ] **Step 1: Implement** a fixed bottom bar shown when `selectedIds.length>0`: count + Clear; buttons Flag, Add tag (popover), Move (folder menu), Download ZIP, Delete (→ trash via `ConfirmModal`). Each calls `POST /assets/bulk` (or `/download-zip`) then `onDone()` (triggers grid reload + clears selection). Trash view swaps Delete for Restore + Delete-forever (`ConfirmModal`).
```tsx
'use client';
import { useState } from 'react';
import { ConfirmModal } from '@/components/ui';
async function bulk(action: string, assetIds: string[], extra: object = {}) {
  const res = await fetch('/api/media/dam/assets/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, assetIds, ...extra }) });
  if (!res.ok) console.error('[BulkActionBar] bulk failed', action, res.status);
  return res.ok;
}
// renders buttons; flag→bulk('flagSelect',ids,{value:true}); addTag→AddTagPopover→bulk('addTags',ids,{tags});
// move→MoveToFolderMenu→bulk('move',ids,{folderId}); zip→POST /download-zip (window.location or blob); delete→bulk('softDelete',ids)
// trash mode: restore→bulk('restore'); deleteForever→ConfirmModal→bulk('permanentDelete')
```
- [ ] **Step 2:** tsc grep → CLEAN
- [ ] **Step 3:** Commit.

---

### Task 12: `AddTagPopover` + `MoveToFolderMenu`

**Files:** Create both in `_components/`

- [ ] **Step 1:** `AddTagPopover` — Radix Popover with a text input + Enter to collect tags (chips) → `onApply(tags)`. `MoveToFolderMenu` — Radix DropdownMenu listing folders from `GET /folders` (+ optional "New folder…" → `POST /folders`) → `onPick(folderId)`.
- [ ] **Step 2:** tsc grep → CLEAN
- [ ] **Step 3:** Commit.

---

### Task 13: `MediaPreview` (full-screen modal)

**Files:** Create `app/operator/media/_components/MediaPreview.tsx`

- [ ] **Step 1:** Radix Dialog, full-bleed dark scrim. Shows `<img src="/api/media/dam/asset/[id]/full">` (or `<video>` when `fileType==='VIDEO'`). Keyboard: ←/→ move `index` within the passed `assets`, ESC closes (Radix). Right panel: filename, dimensions, size, upload date, **editable tags** (chips + add), read-only aiTags, select toggle, event, sponsor, shooter credit — edits call `PATCH /asset/[id]` and update local state + notify parent.
- [ ] **Step 2:** tsc grep → CLEAN
- [ ] **Step 3:** Commit.

---

### Task 14: `UploadDropzone` (batch upload)

**Files:** Create `app/operator/media/_components/UploadDropzone.tsx`

- [ ] **Step 1:** Full-area drag overlay; on drop, read `DataTransferItemList` (files + `webkitGetAsEntry` for folders). Build a queue; for each file `POST /upload` (multipart) with limited concurrency (e.g. 4); per-file progress row. For folder drops, map directory path → ensure a folder exists (`POST /folders`, cache by path) and pass `folderId` on upload. On complete → `onDone()` reloads the grid.
- [ ] **Step 2:** tsc grep → CLEAN
- [ ] **Step 3:** Commit.

---

### Task 15: Wire into `MediaWorkspace` + Top Picks + Manual reorder

**Files:** Modify `MediaWorkspace.tsx`, `MediaToolbar.tsx`

- [ ] **Step 1:** `MediaWorkspace` owns `selection: Set<string>`, `assets` (from grid), `previewIndex: number | null`. Renders `UploadDropzone` (wrapping the grid area), `BulkActionBar` (when selection>0), `MediaPreview` (when previewIndex!=null). Passes selection handlers + `onAssetsChange` + `onOpen` to `MediaGrid`. A `reloadKey` state bumps to force grid refetch after mutations.
- [ ] **Step 2:** `MediaToolbar` — add a **Top Picks** toggle that sets/clears `?minQuality=75`; add `minQuality` to `parseAssetQuery` + `buildAssetWhere` (`"qualityScore" >= n`) in `lib/dam/search.ts` (+ a test case). Manual reorder: when `sort=manual`, enable drag in `MediaGrid` (HTML5 drag or pointer) → on drop, `POST /assets/bulk` `reorder` with the new order.
- [ ] **Step 3:** tsc grep → CLEAN
- [ ] **Step 4:** Commit.

---

### Task 16: Verify + stage doc

- [ ] **Step 1:** `npx tsc --noEmit 2>&1 | grep -E "lib/dam|operator/media|api/media/dam" || echo "DAM CLEAN"`
- [ ] **Step 2:** `node node_modules/vitest/vitest.mjs run tests/unit/dam` → all pass (search + bulk + flip).
- [ ] **Step 3:** `node node_modules/next/dist/bin/next build` → green; `/operator/media` + new routes in manifest.
- [ ] **Step 4: Manual** (dev): select (click + shift-range) → bulk bar → flag/tag/move/zip/delete reflect after reload; preview ←/→/ESC + inline tag edit persists; drag-drop upload shows progress + auto-creates folders; trash restore + permanent-delete; Top Picks filters to qualityScore>75; manual reorder persists.
- [ ] **Step 5:** Update `_context/15-media-dam/CONTEXT.md`: Last updated; State → "Phase 1 + 2a + 2b shipped; Phase 3 (timeline) next"; mark grid item ✅ fully; add new routes + components to Files in play; Next → Phase 3.
- [ ] **Step 6:** Commit.

---

## Self-Review
- **Coverage:** selection (T9/T10/T15) ✓, bulk bar incl. bulk tag (T11/T12/T7) ✓, ZIP (T8) ✓, move (T7/T12) ✓, delete→trash (T7/T11) ✓, preview + inline edit (T13/T5) ✓, batch upload + folder auto-create (T14/T4) ✓, FLIP (T3/T10) ✓, trash restore/purge (T7/T11) ✓, Top Picks (T15) ✓, manual reorder (T7/T15) ✓.
- **Types:** `TileAsset` extended in T9 is consumed by T10/T13; `parseBulkAction`/`BulkAction` (T2) consumed unchanged in T7; `invert` (T3) used in T10. `minQuality` added to `AssetQuery` in T15 (update `parseAssetQuery` + `buildAssetWhere` + a test).
- **No placeholders** beyond the deliberately contract-level UI tasks (T11–T14), where the data flow, routes, and props are fully specified; standard Radix/JSX wiring follows the contract.
