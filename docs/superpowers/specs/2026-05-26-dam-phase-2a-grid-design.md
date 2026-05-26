# DAM Phase 2a — Operator Grid Foundation — Design Spec

**Date:** 2026-05-26
**Stage:** `_context/15-media-dam/` (Phase 2a)
**Depends on:** Phase 1 (PR #26) — schema + R2 storage + upload pipeline.
**Branch:** `claude/dam-phase-2a-grid` (off `claude/dam-phase-1-foundation`)
**Status:** Design — awaiting sign-off before plan/build.

---

## 1. Scope (2a only)

The **read + organize** foundation of `/operator/media`: the justified grid, BlurHash placeholders, signed-URL thumbnail serving, sort, filter, Postgres full-text search, the folder tree, and the grid-density toggle, plus the nav item.

**Explicitly deferred to 2b** (the interaction layer): selection + bulk action bar (flag/zip/tag/move/delete), FLIP sort animations, the full-screen preview modal, batch upload, soft-delete/trash *actions* (restore / permanent delete), and the Top Picks one-click filter. 2a renders a polished, navigable, filterable, searchable grid — but it is view-only.

This is the integration backbone every later DAM surface (timeline, share pages, DamPicker) reuses.

## 2. What's already in place (Phase 1, don't rebuild)

- Schema: `Asset`, `MediaFolder`, `ShareLink`, `AssetDownload`, `Workspace.storageBytes`.
- `lib/dam/storage.ts` — `presignGet(key, ttl)` (15-min default), `damKey`. Reuse for thumbnail signing.
- Upload API writes `Asset` rows with `thumbnailUrl` (R2 key), `blurhash`, `width`, `height`, `shootDate`, `fileType`, etc.

## 3. Verified conventions this follows

- **Pages:** server components, query Prisma (`@/lib/db`) directly, workspace-scoped, gated by `requireRolePage` (`app/operator/layout.tsx` already gates `/operator/*`).
- **Nav:** `app/operator/operator-nav.tsx` — `PRIMARY_ITEMS: NavItem[]` (`{ href, label, match, exact?, Icon }`, Lucide icons). Add a Media item here.
- **UI primitives (reuse, don't rebuild):** `PageHeader`, `EmptyState`, `StatusBadge`, `Avatar`, `DetailDrawer`, `ConfirmModal`, `DataTable*` from `components/ui`. (Preview modal in 2b will reuse `DetailDrawer` or a new full-bleed dialog.)
- **Tokens:** CSS variables via inline `style` and Tailwind arbitrary values (`bg-[var(--card)]`, `style={{ color: 'var(--text-secondary)' }}`). Fonts: `PP Editorial New` (serif display), `Neue Haas Grotesk` / `--font-dm-sans` (UI). **No hex literals.**
- **Thumbnail serving:** mirror the existing `app/api/media/event-hero/[assetId]/route.ts` 302-redirect-to-signed-URL pattern.

## 4. Architecture

```
/operator/media  (server component shell — requireRolePage, resolves workspaceId)
  ├─ loads folder tree (server: db.mediaFolder.findMany, workspace-scoped)
  └─ renders <MediaGrid> (client) + <FolderTree> (client) + <FilterPanel> (client)

<MediaGrid> (client)
  ├─ reads filter/sort/search/folder from URL searchParams (shareable, back-button-safe)
  ├─ fetches GET /api/media/dam/assets?<params>  →  Asset[] (JSON, no signed URLs in payload)
  ├─ computes justified-layout rows from each asset's width/height + container width
  ├─ each tile: BlurHash placeholder (decoded → data URL) fading to
  │     <img src="/api/media/dam/asset/[id]/thumb">  (302 → signed thumbnail URL)
  └─ density toggle (S/M/L) → target row height; persisted to localStorage

Thumbnail/display serving (assets stay PRIVATE):
  GET /api/media/dam/asset/[id]/thumb   → 302 to presignGet(asset.thumbnailUrl, 15m)
  (full-res display URL is a 2b/preview concern)
```

**Why an app-URL redirect for thumbnails, not signed URLs in the JSON:** a grid shows hundreds of tiles; embedding 15-min signed URLs in the payload makes them expire mid-session and breaks browser caching. A stable `/api/media/dam/asset/[id]/thumb` URL caches well and 302s to a fresh signed URL each load. Workspace ownership is checked in the route before redirecting.

## 5. New routes

| Route | Method | Role | Returns |
|---|---|---|---|
| `/operator/media` | page | operator (READ_ONLY floor) | grid shell |
| `/api/media/dam/assets` | GET | READ_ONLY | `Asset[]` filtered/sorted/searched, workspace-scoped, paginated (cursor) |
| `/api/media/dam/folders` | GET | READ_ONLY | `MediaFolder[]` (tree), workspace-scoped |
| `/api/media/dam/asset/[id]/thumb` | GET | READ_ONLY | 302 → signed thumbnail URL (ownership-checked) |

All read routes: resolve workspace via the same `auth()` + workspace pattern, filter every query by `workspaceId`, exclude `deletedAt != null` unless the Trash view is requested.

## 6. Sort, filter, search

**Sort options** (`?sort=`): `date` (default — `shootDate` desc, `NULLS LAST`, tiebreak `createdAt` desc), `event`, `sponsor`, `fileType`, `selects` (isSelect first), `quality` (`qualityScore` desc, NULLS LAST), `manual` (`sortOrder` asc — drag-reorder write lands in 2b; 2a renders manual order read-only).

**Filter panel** (left slide-out / sidebar, `?` params): event (`eventId`), date range (on `shootDate`), file type, `isSelect`, sponsor (`sponsorName`), any tag (matches `tags` or `aiTags`).

**Full-text search** (`?q=`): Postgres FTS across `filename`, `tags`, `aiTags`, `sponsorName`, **and event name**.
- **Implementation:** add a generated `tsvector` column `searchVector` on `Asset` (`to_tsvector('simple', filename || tags || aiTags || sponsorName)`) with a **GIN index**, queried via `@@ websearch_to_tsquery`. Event-name matches are unioned in via a sub-select on events whose `title` matches `q` (assets carry `eventId` as a plain string, so the event title is resolved separately, not stored in the vector).
- Matching tags are returned per-asset so 2b can highlight them.

> **⚠️ Small schema change in 2a (flag).** The `searchVector` generated column + GIN index is an **additive** migration (new column, new index — no data loss, Producer-safe). Same discipline as Phase 1: `prisma generate` → show diff → your sign-off → `db push` (via the `node node_modules/prisma/build/index.js db push` rtk-bypass). If you'd rather avoid a second schema change now, the fallback is query-time `to_tsvector` (no stored column, no index) — correct but unindexed; I recommend the generated column.

## 7. Folder tree

Left sidebar (`<FolderTree>`), driven by `MediaFolder` rows + virtual views:
- **Events** → one node per event that has assets; each event node expands to **Full Gallery / Selects / Video / per-sponsor** subfolders (from `MediaFolder.type` + `eventId`).
- **Brand Assets** (`type = BRAND`).
- **Archive** — reserved top-level node (no `ARCHIVE` enum value in Phase-1 schema; 2a treats Archive as a top-level folder; revisit if a dedicated type is wanted).
- **Trash** — virtual view of `deletedAt != null` (read-only in 2a; restore/purge actions in 2b).

Selecting a node sets `?folderId=` (or a virtual key like `view=trash`) and re-queries.

## 8. Design language (2a)

- **Background:** cream — `var(--bg)` / `var(--apply-cream)` (day), dark (`var(--bg-night)`) on night.
- **Folder tree:** the brief calls for "dark forest green." No such token exists (palette is NBC red/purple/cream). 2a adds **one scoped token** `--dam-folder-tree` (forest green day value, dark-mode value) in `globals.css` rather than a hex literal in components — keeps the white-label system intact. (Confirm the green, or I default to a deep evergreen.)
- **Event/folder names:** `PP Editorial New` (serif). **Filenames + metadata:** monospace — no custom mono font is loaded, so a system stack (`ui-monospace, SFMono-Regular, monospace`) via a `--font-mono` token.
- Buttons: NBC Red (locked). Icons: Lucide. Radix primitives for the filter slide-out.

## 9. New dependency (2a)

- `justified-layout` (Flickr) — the locked grid engine. Compute `{box[]}` from each asset's `width`/`height` + container width + density target row height. **Flag:** one new dep (approved earlier).
- `blurhash` is already installed (Phase 1) — 2a uses its `decode` to render placeholders (decode → `ImageData` → canvas → data URL; or a tiny `<BlurhashCanvas>` client component). No new dep for placeholders.

## 10. Components (new, in `app/operator/media/_components/`)

- `MediaGrid.tsx` (client) — fetch, justified layout, density, tile rendering.
- `MediaTile.tsx` (client) — BlurHash placeholder → thumbnail fade; hover affordance (visual only in 2a; selection/overlay in 2b).
- `FolderTree.tsx` (client) — tree nav, sets `?folderId`.
- `FilterPanel.tsx` (client) — Radix slide-out; event/date/type/select/sponsor/tag filters.
- `MediaToolbar.tsx` (client) — search input, sort dropdown, density toggle (top-right).
- `BlurhashCanvas.tsx` (client) — decode + paint placeholder.
- `lib/dam/search.ts` (server) — builds the FTS query (raw SQL via `db.$queryRaw`).

## 11. Verification (2a)

`prisma generate` clean (after the `searchVector` addition) + diff shown; `tsc` clean; `next build` succeeds; manual: grid renders with placeholders→thumbnails, sort/filter/search/folder navigation all reflect in URL and results, density persists across reload. Stage `CONTEXT.md` updated (closing checklist).

## 12. Out of scope (2a) — restated

Selection, bulk action bar, bulk tag, FLIP animations, full-screen preview modal, batch upload, trash restore/purge, Top Picks, manual drag-reorder writes. All → Phase 2b.

## 13. Open items for confirmation

1. **`searchVector` generated column + GIN index** — OK to include this additive schema change in 2a (recommended), or use the unindexed query-time fallback?
2. **Forest-green folder-tree token** — confirm the green, or I default to a deep evergreen scoped to `--dam-folder-tree`.
3. **2a viewing role** — grid readable by READ_ONLY operators (recommended), or STAFF-only?
