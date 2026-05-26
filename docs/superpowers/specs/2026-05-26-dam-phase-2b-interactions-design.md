# DAM Phase 2b — Operator Grid Interaction Layer — Design Spec

**Date:** 2026-05-26
**Stage:** `_context/15-media-dam/` (Phase 2b)
**Depends on:** Phase 1 (#26, merged) + Phase 2a (#27, in review) — schema, storage, grid, routes.
**Branch:** `claude/dam-phase-2b-interactions` (stacked on `claude/dam-phase-2a-grid`)
**Status:** Design — awaiting sign-off before plan/build.

---

## 1. Scope (2b)

The **interaction + mutation** layer on top of the 2a view-only grid:

- **Selection** — checkbox on hover (top-left), ring highlight when selected; multi-select.
- **Bulk action bar** — persistent bottom bar when ≥1 selected: **flag as select**, **download ZIP**, **add tag**, **move to folder**, **delete** (→ trash).
- **Full-screen preview modal** — click a tile → full-res image (or inline video), left/right keyboard nav, ESC to close, right panel with filename / dimensions / size / upload date / **editable tags** / read-only aiTags / select toggle / event / sponsor / shooter credit.
- **Batch upload** — drag files or a folder onto the grid; per-file progress; auto-creates folder structure.
- **FLIP sort transitions** — tiles animate to new positions on sort/filter change (no jumping).
- **Trash actions** — restore and permanent-delete (with confirm) from the Trash view.
- **Top Picks** — one-click smart filter (`qualityScore > 75`).
- **Manual drag-reorder** — drag tiles to set `sortOrder` (active only under the Manual sort).

## 2. What's already in place (don't rebuild)

- **Grid:** `MediaGrid`/`MediaTile`/`BlurhashCanvas`/`useDensity`/`FolderTree`/`MediaToolbar`/`FilterPanel`/`MediaWorkspace` (2a).
- **Reads:** `GET /api/media/dam/assets` (parse/sort/FTS via `lib/dam/search.ts`), `/folders`, `/asset/[id]/thumb`.
- **Upload:** `POST /api/media/dam/upload` (STAFF; Phase 1) — single-file; 2b drives it in parallel for batch.
- **Storage:** `lib/dam/storage.ts` — `presignGet`, `uploadObject`, `deleteObject`, `damKey`, `DOWNLOAD_URL_TTL` (24h).

## 3. Conventions followed

- Writes are **STAFF-gated** (`requireRole(STAFF)`); reads stay READ_ONLY (2a). Workspace-scoped on every query.
- Mutations log on failure (no silent swallow). Soft-delete = set `deletedAt`; permanent-delete removes R2 objects + row + decrements `Workspace.storageBytes`.
- Tokens/fonts as 2a; Radix for the modal/dialogs; Lucide icons; NBC-red buttons.

## 4. Architecture

```
Selection state lives in MediaWorkspace (client) — a Set<assetId> + last-clicked anchor
  ├─ MediaTile gets selected + onToggle props (checkbox on hover, ring when selected)
  ├─ shift-click range select; click-empty clears
  └─ BulkActionBar (fixed bottom) shows when size>0 → calls write routes, then refetches

Preview modal (client): click tile (not checkbox) → opens MediaPreview
  ├─ full-res via /api/media/dam/asset/[id]/full (302 → signed display URL)
  ├─ ←/→ navigate within current result set; ESC closes
  └─ right panel edits via PATCH /api/media/dam/asset/[id]

Batch upload: drop files/folder on the grid → queue → POST /upload per file (concurrency-limited)
  ├─ per-file progress rows; webkitRelativePath → auto-create folders (POST /folders)
  └─ on complete: refetch grid

FLIP: before refetch/sort change, capture each tile's current rect (First); after layout
recompute, set transform from old→new and transition to identity (Last/Invert/Play). Tiles are
absolutely positioned, so this is a transform-only animation — no new dependency.
```

## 5. New routes (all STAFF unless noted)

| Route | Method | Purpose |
|---|---|---|
| `/api/media/dam/assets/bulk` | POST | `{ action, assetIds, ...payload }` — actions: `flagSelect` (value), `addTags` (tags[]), `move` (folderId), `softDelete`, `restore`, `permanentDelete`, `reorder` (ordered ids → sortOrder). Workspace-scoped; `permanentDelete` also deletes R2 objects + decrements `storageBytes`. |
| `/api/media/dam/asset/[id]` | PATCH | Single-asset inline edit: `tags`, `isSelect`, `shooterCredit`, `sponsorName`, `eventId`. |
| `/api/media/dam/asset/[id]/full` | GET (READ_ONLY) | 302 → signed full-res display URL (`DOWNLOAD_URL_TTL`). Powers the preview modal. |
| `/api/media/dam/download-zip` | POST | `{ assetIds }` → streams a ZIP of originals (filename-named). Uses `archiver`. |
| `/api/media/dam/folders` | POST (STAFF) | Create a folder (`name`, `type`, `eventId?`, `parentId?`) — used by move-to-folder + batch-upload auto-create. (GET exists from 2a.) |

## 6. New dependency

- **`archiver`** — stream a ZIP of original objects from R2 through the response (memory-light vs building in-memory). Approved earlier. **Flag:** one new dep. (Alternative: `jszip`, in-memory — simpler but memory-bound on large selections; recommend `archiver`.)

No animation library — FLIP is hand-rolled (transform-only, dependency-free).

## 7. New / changed components (`app/operator/media/_components/`)

- `MediaTile.tsx` — **modified:** hover checkbox (top-left), `selected` ring, `onToggleSelect`, hover scale (1.02 / 180ms) + metadata overlay (filename, select star, file-type badge), click→preview.
- `MediaGrid.tsx` — **modified:** lift selection up, implement FLIP on layout change, expose the current ordered asset list for the modal + reorder.
- `MediaWorkspace.tsx` — **modified:** owns `selection` + `previewIndex`; renders `BulkActionBar` + `MediaPreview` + `UploadDropzone`.
- `BulkActionBar.tsx` — **new:** fixed bottom bar; flag / ZIP / add-tag / move / delete; selection count + clear.
- `MediaPreview.tsx` — **new:** full-screen Radix dialog; full-res/video; ←/→/ESC; editable metadata panel (PATCH).
- `UploadDropzone.tsx` — **new:** drag-drop overlay, file queue, per-file progress, folder auto-create.
- `MoveToFolderMenu.tsx` / `AddTagPopover.tsx` — **new:** small Radix popovers for the bulk bar.

## 8. Design language (2b)

- Hover: `scale(1.02)`, 180ms ease-out, subtle brightness up, bottom metadata overlay fades in.
- Selected: ring in `var(--primary)`; checkbox top-left.
- Bulk bar: floating bottom, `var(--card)` + shadow, NBC-red primary actions, destructive delete confirmed via `ConfirmModal`.
- Preview: full-bleed dark scrim; photo centered; right panel cream `var(--card)`, serif labels, mono metadata.

## 9. Verification

`tsc` clean; unit tests for the bulk-action request builder + FLIP rect math (pure helpers); `next build` green; manual: select → bulk bar → each action reflects after refetch; preview ←/→/ESC + inline tag edit persists; drag-drop batch upload shows progress + auto-creates folders; trash restore/purge; Top Picks filter; manual reorder persists. Stage `CONTEXT.md` updated (closing checklist).

## 10. Out of scope (2b)

- 30-day trash **auto-purge** (cron) — 2b does manual restore + permanent-delete; auto-purge is a later cron job.
- Video transcoding/poster frames — `fileType=VIDEO` rendering is best-effort (native `<video>`); ingest pipeline is later.
- Share links, branding, analytics (Phase 4); MCP tools (Phase 5); DamPicker (Phase 6).

## 11. Open items for confirmation

1. **ZIP lib:** `archiver` (streaming, recommended) vs `jszip` (in-memory).
2. **Trash auto-purge:** defer the 30-day cron to a later phase (recommended), or include a Vercel Cron in 2b?
3. **FLIP:** hand-rolled transform FLIP, no dep (recommended) vs adding `framer-motion`.
4. **Bulk delete default:** delete → **trash** (soft, recoverable) is the bulk-bar "delete"; permanent-delete lives only in the Trash view (recommended).
