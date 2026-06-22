# Stage 15 — Media (Digital Asset Manager)

> Owns the operator media library at `/operator/media` — R2-backed asset storage, AI tagging + heuristic quality scoring, organization (folders / selects / tags), the two external share surfaces (sponsor delivery + member gallery), and the reusable `<DamPicker>`.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 In progress — Phases 1, 2a, 2b, HEIC ingest, dev seed, grid polish, ShareLink schema (`watermark` + `allowedDownloads`), Phase 4 (external share surfaces) all merged to main (PRs #26–#39, Phase 4 merge `49db49c`). **Intelligence layer + Grid Round 2 added on `feat/canto-migration` (2026-06-20, not yet merged).** Intelligence: semantic "vibe" search over CLIP embeddings, "more like this" visual similarity, color + EXIF facets, world-class lightbox (commits `a7b7df2` backend, `ffcfeaf` UI+tests). **Grid Round 2 (interaction + mobile, commits `a2e83bb`/`375a1e3`/`062a033`/`0b47854`):** drag-to-rearrange (dnd-kit, manual sort only, optimistic → existing bulk `reorder` endpoint, keyboard-drag + SR announcements), append-based infinite scroll (consumes `nextCursor`), elevated desktop multiselect (shift-range + ⌘/Ctrl-toggle + empty-background marquee + ⌘A/Esc), and a full iPhone-grade mobile layer (long-press selection mode + sticky "N selected" header + bottom action sheet, touch lightbox — swipe-page / swipe-down-dismiss / pinch + double-tap zoom, FilterPanel mobile drawer, responsive justified columns), all reduced-motion-aware. Phase 3 (Timeline) spec'd & deferred. |
| **V1 item** | Post-V1 (new capability, not in items #1–#28) |
| **Last updated** | 2026-06-22 |
| **Owner** | Adam |
| **Blocked on** | Smart search no-ops (semantic route returns `degraded: true`, UI silently falls back to keyword + shows a quiet "visual search is temporarily unavailable" note) until `REPLICATE_API_TOKEN` is set in Vercel — it embeds the text query via the same `andreasjansson/clip-features` model the Canto migration used. AI tagging still no-ops until `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_API_TOKEN` are set (upload/thumb/BlurHash/EXIF/heuristic scoring all work without them). Color/EXIF facets + "find similar" need no new env (read directly from the migrated columns). |
| **Next** | Open a PR for `feat/canto-migration` once the Canto migration finishes writing prod. **Wave 3 (clarity + completeness) is complete on this branch** — unified smart search (Vibe toggle removed), download-size presets, bulk metadata edit, saved views, rich detail panel, first-run/no-results states, full a11y pass (commits `2ad79a0`/`e6b1884`/`8860921`/`5f9d4a3` UI + Spine backend deltas; 772 unit tests pass). **Device QA still owed:** Round-2 touch gestures (swipe feel, pinch accuracy, `navigator.vibrate`) were verified by code review only — exercise on a real iPhone (or Chrome touch emulation) before merge. Then preview-verify smart search + facets + grid drag/reorder against the real 1,838-asset library with `REPLICATE_API_TOKEN` set. **Wave 4 (needs additive migration, coordinate with Producer):** DB-backed Collections + saved views (`SavedView` model — migrate the localStorage `dam_saved_searches` shape server-side), where-used/usage tracking, rights/license + model-release records, download/share analytics (extend existing `AssetDownload`), asset versions. Phase 5 (MCP tools) / Phase 6 (`<DamPicker>`) after merge. |

> **Instagram Stories shipped to prod (2026-06-21, Opus 4.8 recovery session):** the Stories feature (`StoryGeneratorPanel`, `/operator/stories`, `/api/stories/*`, `lib/stories/*`) had blocked **every** `main`-HEAD prod build since its commits. Fixed three bugs in `app/operator/media/_components/StoryGeneratorPanel.tsx` (conditional `useCallback` → rules-of-hooks; phantom `date-fns` import never in `package.json`; `event.name`→`.title`) on `fix/story-generator-hook` → fast-forwarded to `main` (`9f7984e`); tsc 0, preview build green. The additive `InstagramStory`/`InstagramStoryBatch`/`StoryStatus` migration was applied to prod via `prisma db execute` — the `migrate diff` **false-drift** `DROP INDEX Asset_searchVector_idx`/`Asset_embedding_hnsw_idx` was stripped first (both DAM indexes verified intact post-migration); reviewed by tonone:flux. Stories UI is live but **inert until `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ACCOUNT_ID` are set in Vercel prod**. Also fixed the dangerous `prisma db push` instructions in `INSTAGRAM_STORIES_SETUP.md` / `DELIVERY_SUMMARY.md` / `BUILD_STATUS.md`. Full detail: STATE-OF-PLAY.md §0 (2026-06-21).

> **Media-page polish + design pass (2026-05-27, PR #31):** title top-padding, filter-rail date-input overflow, Trash/help-FAB clearance, view-density active state, "New folder" button, visible preview close (×) + backdrop-click-to-close. Plus a design pass: filter/folder label legibility (12px / `--text-secondary` instead of 11px / `--text-muted`), brand-red (`--primary`) on interactive states that lacked it (filter checkbox + date `accent-color`, search/sort focus ring, Top Picks token), and a translucent-red selection wash + checkmark on grid thumbnails (mirrors the operator-sidebar active treatment). Folder-tree active stays evergreen (`--dam-folder-tree`) by design. Operator-grid UX only — no HEIC/Phase-4 changes.

> **Video play-icon overlay (2026-05-29):** always-visible centered `Play` overlay (`bg-black/50` circle, white fill) on `fileType === 'VIDEO'` assets in both grid (`MediaTile`, h-4) and list (`MediaList`, h-3) views, so videos read as videos at rest instead of only on hover (the hover-bar `Film` icon stays). Inline JSX, no new components, no hex literals.

> **Media-page UI cleanup (2026-06-01, PR `fix/media-page-ui-cleanup`):** Re-audited the six media-page UI items against live `main` (not the PR #31 note). Four were already implemented and effective in `main` and were left untouched: title top-spacing (`page.tsx` `pt-8`, matches sibling operator pages), view/density active state (`MediaToolbar` brand-red `activeStyle`), "New folder" button (`FolderTree` `FolderPlus` action), and the preview close control (`MediaPreview` has two `X` buttons — over the image + in the panel header). Two were genuinely broken/fragile and fixed surgically: (1) **date-input rail overflow** — the `From`/`To` `<input type="date">` had `min-w-0` on their flex *wrappers* but not on the inputs, so the native ~130px intrinsic min-width overflowed the 220px rail; added `min-w-0` to both inputs so `w-full` actually shrinks them (`FilterPanel.tsx`). (2) **Trash overlapped by the global help FAB** (`HelpPanel`, `fixed bottom-5 md:left-[260px] h-9 w-9`, floats over the FolderTree's bottom-left where Trash sits) — bumped FolderTree `pb-16` → `pb-24` so Trash clears the FAB by ~40px instead of ~8px (`FolderTree.tsx`). Semantic tokens only, no schema/`db push`. tsc clean, `next build` green.

> **Phase 4 — external share surfaces (2026-05-27):** two public delivery routes (`/assets/[token]` sponsor, `/gallery/[slug]` member) + operator share creation/management. Public surfaces use a token-scoped fetch path (server component + token-scoped signed-redirect routes), never the operator grid API. Password hashing is Node `crypto.scrypt` only (no bcrypt). Auth cookie is HttpOnly + Path-scoped + 1-hour, HMAC-keyed off the per-share password hash so no new env secret was needed. Watermark is a CSS-only diagonal overlay (deterrent, not anti-piracy). Downloads route through `/api/share/token/[token]/download/[assetId]` which logs an `AssetDownload`, enforces `allowedDownloads` (workspace-total, across all visitors), and 302-redirects to a 24-hour signed R2 URL with `Content-Disposition: attachment` so cross-origin downloads save instead of opening inline (the HTML `download` attribute can't force that). The "Share N assets" operator flow wraps the selection in a fresh MediaFolder (SPONSOR or SELECTS type, auto-named) and shares that folder — same primitive as the existing "create selects folder, then share" workflow. Phase 5 (MCP) + Phase 6 (`<DamPicker>`) are next.

> **Intelligence layer — vibe search, similarity, facets, lightbox (2026-06-20, `feat/canto-migration`, not yet merged):** Lights up the Canto-migrated enrichment (CLIP 768-d `embedding`, `exif`, `dominantColor`, `colorPalette`) the grid never queried. **Verified empirically first:** `andreasjansson/clip-features` embeds a TEXT query into the SAME joint CLIP space as the stored image vectors (text("party")·image(party)=0.1655 vs image(forest)=0.0246), so natural-language search is real. CLIP absolute cosines are small (~0.16 for a strong match) → ranking is by relative `<=>` distance order, **no absolute threshold cutoff**. Backend (read-only DB, no schema change): `lib/dam/embedding.ts` (cached text→vector via Replicate, LRU + backoff for the throttle), `lib/dam/semantic.ts` (pure pgvector `<=>` SQL builders, workspace-scoped + `deletedAt`/`embedding` guarded, source excluded for similarity), `lib/dam/exif.ts` (defensive heterogeneous-EXIF normalizer), `lib/dam/color.ts` (palette normalize + 12-bucket HSL classify + distance). Routes: `GET /api/media/dam/assets/semantic` (graceful `degraded` fallback when Replicate is down), `GET /api/media/dam/asset/[id]/similar`, `GET /api/media/dam/asset/[id]` (now returns parsed `metadata` + `palette`); `GET /api/media/dam/assets` now also returns `dominantColor`. UI: Keyword/Vibe toggle (`?mode=semantic`), color-swatch facet (`?color=<bucket>`, client-side via `classifyColor`), nextCursor infinite scroll + justified-layout viewport windowing (smooth at 1,800+), lightbox gained EXIF "Capture details", palette swatches, "More like this" strip, nearby filmstrip, click-zoom/drag-pan, `Z/F/I/?` shortcuts, and a search-aware empty state. Semantic tokens only (palette swatches render asset data colors). 153 new unit tests (`tests/unit/dam/`). tsc clean, `next build` green (semantic + similar routes in the manifest), 682 unit tests pass. **No `prisma db push`/migrate — the embedding column + HNSW index already exist in prod.**

> **Grid Round 2 — interaction + mobile (2026-06-20, `feat/canto-migration`, not yet merged):** Makes the operator grid Apple-Photos-grade. **Drag-to-rearrange** via `@dnd-kit/sortable`, enabled ONLY in `?sort=manual` (so it never fights date/quality sorts); 8px `PointerSensor` activation so click/checkbox still fire; `DragOverlay` ghost + a one-shot `dam-lift` spring; the hand-rolled FLIP is suspended while a drag is active (FLIP and dnd transforms fight otherwise); optimistic local reorder → `POST /api/media/dam/assets/bulk {action:'reorder', orderedIds}` (**the reorder backend already existed — no new route**); `lib/dam/reorder.ts` builds the minimal-diff payload and is correct after N infinite-scroll appends because it operates on the full in-memory ordered list. **Keyboard-draggable** + `aria-live` SR announcements. **Append-based infinite scroll** now consumes the `nextCursor` the API always returned (IntersectionObserver sentinel, id-dedupe, reset on URL/sort/filter change) — deliberately NOT full virtualization. **Elevated desktop multiselect:** existing shift-click range kept, added ⌘/Ctrl-toggle, empty-background marquee (`onPointerDown` guard `target===currentTarget` — tiles trigger drag, gaps trigger marquee, so the two pointer-drags never conflict; marquee runs in non-manual sorts), `⌘A`/`Ctrl+A` select-all + `Esc` clear; selection logic extracted to pure `lib/dam/selection.ts`. **Mobile (iPhone-grade, gated on `!isWide`):** long-press 500ms (8px scroll-cancel + `navigator.vibrate(20)`) enters a selection mode with a sticky "N selected" header + Cancel (auto-exits at 0); bulk actions become a bottom **action sheet** (iOS easing, `env(safe-area-inset-bottom)`, shared action callbacks with the desktop bar); the lightbox gains swipe-left/right paging, swipe-down-to-dismiss (image-area only, so the metadata `pan-y` sheet scroll never triggers it; disabled when zoomed), pinch + double-tap zoom — all desktop keyboard paths (`Z/F/I/?`/arrows/Esc) preserved; FilterPanel collapses to a drawer; responsive justified columns. Every transition is `prefers-reduced-motion`-aware. Semantic tokens only (`--primary`/`--primary-soft`/`--border-strong`/`--card`; neutral box-shadow rgba per existing `--card-shadow` precedent). No schema/`db push`. tsc clean, `next build` green (`/assets/[token]` + `/gallery/[slug]` still in manifest), **730 unit tests pass** (+29). Owed: real-device gesture QA before merge.

> **Wave 3 — clarity + completeness (2026-06-22, `feat/canto-migration`, not yet merged — commits `2ad79a0`/`e6b1884`/`8860921`/`5f9d4a3` UI + Spine backend deltas):** Legibility-first refinement driven by the owner's note that "vibe" and the AI button were not self-evident. **Unified smart search** — the Keyword/Vibe toggle + `?mode=semantic` param are **removed**; one input always tries the semantic route when a query is present and silently falls back to keyword FTS (quiet "visual search is temporarily unavailable" note, never an error), with example query chips, recent searches (localStorage `dam_recent_searches`, max 5), a clear-X, and a real no-results state. **Self-evident affordances:** "Top Picks"→"Best photos" (Star + tooltip), labeled color swatches (focus-visible tooltips), "More like this"→a single clearly-labeled "Find similar photos" action, FilterPanel "Type" label, sort/density/upload tooltips. **First-run empty state** (3-point "what you can do here" + upload CTA). **Rich detail panel** — labeled sections (FILENAME/FILE/CAPTURE/COLORS/TAGS/LOCATION) with copy-to-clipboard on filename + credit, `—` for null, AI-suggested tags subsection, and a **download-size menu** (small 640 / medium 1280 / large 2048 / original; video → original only). **Bulk metadata edit** — new STAFF-gated bulk actions `removeTags` / `setCredit` / `setSponsor` (top-level body payloads, existing columns only — no `description` column exists, so no description edit), plus relabels ("Mark as best", "Move to folder", "Download" with loading/error), live-wired (no "coming soon"). **Saved views (localStorage v1, `dam_saved_searches`, max 20)** — save the current query+filters via `SaveSearchPopover`, listed/renamable/deletable in the FolderTree; designed as a direct migration target for a future DB `SavedView`. **A11y:** aria-labels on all icon buttons, `role=list/listbox` on chips/recents, `aria-live` copy confirmations, `motion-reduce` + `:focus-visible` throughout. Backend reads stay **read-only/no-schema-change**; the one new route resizes a single image on the fly via Sharp. tsc clean, `next build` green, **772 unit tests pass** (+48: `download`, extended `bulk`, `search-helpers`). Semantic tokens only, tenant-neutral copy.

## Scope

The operator-facing Digital Asset Manager and its external share surfaces. Delivered in 6 phased PRs (build order = dependency order):

1. ✅ **Foundation** (PR #26, merged) — Prisma schema, R2 private storage, image processing (800px thumbnail / BlurHash / EXIF `shootDate`), async AI tagging + Sharp heuristic scoring, upload API.
2. ✅ **Operator grid** at `/operator/media` (PRs #27/#29/#31, all merged) — **2a** (justified grid, BlurHash, signed-URL thumbs, sort/filter/FTS, folder tree, density, nav) + **2b** (selection + bulk bar [flag/ZIP/tag/move/delete], FLIP transitions, full-screen preview + inline edit, world-class upload [drag-drop files/folders + click-to-browse + clipboard paste, live per-file XHR progress with thumbnails], trash restore/purge, Top Picks, manual reorder) + polish/design pass.
2c. ✅ **HEIC ingest** (PR #30, merged) — accept iPhone HEIC uploads, convert to q90 JPEG via libheif wasm, preserve EXIF `shootDate`. Phase-4 prerequisite.
2d. ✅ **Dev seed + Clear Demo Media** (PRs #32/#37, merged) — `scripts/seed-dam.ts` (Pexels: 14 photos + 3 videos) + `POST /api/dev/seed-dam` (DevToolbar button) + `DELETE /api/dev/seed-dam` (DevToolbar "Clear Demo Media").
2e. ✅ **ShareLink schema fields** (PR #38, merged) — `watermark Boolean @default(false)` + `allowedDownloads Int?` added to `ShareLink`. Phase-4 prerequisite. **Applied to production via `prisma db execute`** (additive SQL only), per the root `CLAUDE.md` "Schema changes: never `prisma db push`" rule — `db push` would drop `Asset_searchVector_idx`. This is the model for how any subsequent schema addition in this stage should reach prod.
3. ⚪ **Timeline / Moment Map** view (single-event, `shootDate`-plotted) — **spec'd & deferred** (`docs/superpowers/specs/2026-05-27-dam-phase-3-timeline-design.md`); build awaits real event photography.
4. ✅ **External share surfaces** (PR #39, merged 2026-05-28, merge commit `49db49c`) — sponsor delivery (`/assets/[token]`, optional password) + member gallery (`/gallery/[slug]`, password required), `CreateShareModal` (type / password / watermark / allowedDownloads), `/operator/media/shares` (list, copy URL, delete, filter by type), public APIs (`GET /api/share/token/[token]`, `POST .../auth`, `GET .../download/[assetId]`), HttpOnly `share_auth` cookie (1h, path-scoped), `AssetDownload` row per download, signed 24h R2 GET URL with `Content-Disposition: attachment`.
5. ⚪ **MCP tools** at `/api/mcp` (9 tools).
6. ⚪ **`<DamPicker>`** modal + event-editor hero integration.

Full design contract: `docs/superpowers/specs/2026-05-26-dam-design.md`.

## Files in play

```
lib/dam/storage.ts                       ← R2 private storage: uploadObject, presignGet (15m/24h TTLs), deleteObject, damKey
lib/dam/image.ts                         ← Sharp: 800px WebP thumbnail, BlurHash, dimensions, EXIF shootDate; heuristic scoreImage; processImage gained optional exifInput (read EXIF from original HEIC)
lib/dam/heic.ts                          ← isHeic (MIME + case-insensitive ext) + convertHeicToJpeg (libheif q90; passes the Buffer view, not a raw ArrayBuffer — heic-decode needs the iterable); HEIC ingest prerequisite
next.config.ts                           ← serverExternalPackages ['heic-convert','libheif-js'] so libheif.wasm is traced into the Vercel serverless bundle (HEIC ingest)
lib/dam/tagging.ts                       ← tagImage(url) provider switch (cloudflare impl; hf/openai stubs); inferEnergyLevel
app/api/media/dam/upload/route.ts        ← STAFF-gated R2 upload → Asset row → storageBytes bump → fire-and-forget tagging trigger
app/api/media/dam/tag/[assetId]/route.ts ← async AI tag + heuristic score (runs after the upload response; optional DAM_TAG_SECRET guard)
prisma/schema.prisma                     ← Asset, MediaFolder, ShareLink, AssetDownload models + 3 enums + Workspace.storageBytes + Asset.searchVector (FTS)
prisma/sql/dam-search-vector.sql         ← FTS trigger + GIN index (applied via `prisma db execute`)
lib/dam/search.ts                        ← FTS/list query builder: parseAssetQuery + buildAssetWhere + ASSET_SORTS (Phase 2a)
app/api/media/dam/assets/route.ts        ← GET grid list — filter/sort/FTS/pagination, READ_ONLY+ (2a)
app/api/media/dam/folders/route.ts       ← GET folder tree + asset/trash counts (2a)
app/api/media/dam/asset/[id]/thumb/route.ts ← GET thumbnail — 302 to signed URL, private (2a)
app/operator/media/page.tsx              ← server shell — role gate + filter options (2a)
app/operator/media/_components/          ← MediaWorkspace, MediaGrid, MediaTile, BlurhashCanvas, FolderTree, MediaToolbar, FilterPanel, useDensity (2a)
app/operator/operator-nav.tsx            ← Media nav item (2a)
app/globals.css                          ← --dam-folder-tree evergreen token (2a)
types/justified-layout.d.ts              ← ambient types for the grid layout engine (2a)
lib/dam/bulk.ts                          ← bulk-action request validator (2b)
lib/dam/flip.ts                          ← FLIP invert helper (2b)
app/api/media/dam/assets/bulk/route.ts   ← POST bulk: flag/tag/move/trash/restore/purge/reorder, STAFF (2b)
app/api/media/dam/asset/[id]/route.ts    ← PATCH inline metadata edit, STAFF (2b)
app/api/media/dam/asset/[id]/full/route.ts ← GET full-res 302 → signed URL (2b)
app/api/media/dam/download-zip/route.ts  ← POST stream ZIP of originals via archiver, STAFF (2b)
app/operator/media/_components/          ← +BulkActionBar, MediaPreview, UploadDropzone, types (2b); MediaTile/MediaGrid/MediaToolbar/MediaWorkspace extended
scripts/seed-dam.ts                      ← Pexels demo: 14 photos + 3 videos (Phase 2d)
app/api/dev/seed-dam/route.ts            ← POST seed / DELETE clear demo media — DevToolbar wiring (Phase 2d; PRs #32 + #37)

# Phase 4 (PR #39, merged 2026-05-28 — merge commit 49db49c)
app/assets/[token]/page.tsx              ← public sponsor delivery surface (no Clerk; token + optional password)
app/gallery/[slug]/page.tsx              ← public member gallery (no Clerk; password required)
app/operator/media/shares/page.tsx       ← operator share-link manager (list / copy / delete / filter by type)
app/operator/media/_components/CreateShareModal.tsx  ← bulk-action Share modal (type/password/watermark/allowedDownloads)
app/api/share/links/route.ts             ← POST create ShareLink — wraps selection in a fresh SPONSOR/SELECTS MediaFolder
app/api/share/token/[token]/route.ts     ← GET resolve token → assets + meta (public)
app/api/share/token/[token]/auth/route.ts ← POST password → HttpOnly share_auth cookie (1h, path-scoped)
app/api/share/token/[token]/download/[assetId]/route.ts ← GET log + 302 → 24h signed R2 URL with Content-Disposition: attachment

# Intelligence layer (feat/canto-migration, 2026-06-20 — commits a7b7df2 backend, ffcfeaf UI+tests; not yet merged)
lib/dam/embedding.ts                     ← embedText(query) → 768-d CLIP vector via Replicate clip-features (same joint space as image vectors); in-memory LRU + throttle backoff; returns null (degraded) when REPLICATE_API_TOKEN unset
lib/dam/semantic.ts                      ← pure pgvector SQL builders: vectorLiteral, buildSemanticQuery, buildSimilarQuery (workspace-scoped + deletedAt/embedding guards, <=> cosine ORDER BY, source excluded), distanceToSimilarity
lib/dam/exif.ts                          ← parseExif(raw) defensive normalizer for heterogeneous stored EXIF JSON → ExifSummary; formatAperture/Shutter/FocalLength
lib/dam/color.ts                         ← normalizePalette, classifyColor (12 HSL buckets), COLOR_BUCKETS, colorDistance, hexToHsl/Rgb
app/api/media/dam/assets/semantic/route.ts   ← GET vibe search over embeddings, READ_ONLY+, graceful { degraded:true } fallback
app/api/media/dam/asset/[id]/similar/route.ts ← GET visual nearest neighbors by embedding cosine, READ_ONLY+
app/api/media/dam/asset/[id]/route.ts    ← +GET full asset incl. parsed metadata (parseExif) + palette (normalizePalette); PATCH unchanged
app/api/media/dam/assets/route.ts        ← grid SELECT now also returns dominantColor (color facet)
app/operator/media/_components/          ← MediaToolbar (Vibe toggle / ?mode=semantic), MediaWorkspace (semantic fetch + degraded fallback + infinite scroll + client color filter), MediaGrid (viewport windowing + search-aware empty state), FilterPanel (color swatches / ?color), MediaPreview (EXIF + palette + More-like-this + filmstrip + zoom + shortcuts), types (dominantColor)
tests/unit/dam/{semantic,exif,color}.test.ts ← 153 unit tests pinning the pure helpers (workspace scoping as bound param, defensive EXIF, color classify/distance)

# Grid Round 2 — interaction + mobile (2026-06-20, feat/canto-migration, not yet merged)
lib/dam/reorder.ts                       ← pure computeReorder(orderedIds, activeId, overId) → {orderedIds, changed[]} (arrayMove + minimal contiguous diff, never mutates) — drag-reorder payload builder; reuses the existing bulk 'reorder' action (no new route)
lib/dam/selection.ts                     ← pure toggleSelection (plain + shift-range via anchor) / selectAll / clearSelection, extracted from MediaWorkspace so it's unit-testable; behavior byte-equivalent to the old inline handler
app/operator/media/_components/          ← MediaGrid (dnd-kit DndContext/SortableContext drag-rearrange [manual sort only, 8px PointerSensor, DragOverlay ghost, FLIP suspended mid-drag, SR announcements], empty-background marquee), MediaWorkspace (onReorder optimistic→bulk, append infinite scroll w/ dedupe, ⌘A/Esc, mobile selectionMode + sticky header, calls lib/dam/selection), MediaToolbar ("Drag to arrange" hint, manual-sort only), MediaTile (long-press 500ms→selection mode + vibrate, checkbox micro-bounce, mobile tap-targets), BulkActionBar (desktop slide-up bar + mobile bottom action sheet, shared action callbacks, gated by isWide), MediaPreview (touch lightbox: swipe-page / swipe-down-dismiss / pinch + double-tap zoom, desktop keyboard paths preserved), FilterPanel (mobile filter drawer)
app/globals.css                          ← @keyframes dam-lift + prefers-reduced-motion override for the drag pick-up
tests/unit/dam/{reorder,selection,bulk}.test.ts ← +25 selection / +2 reorder / +2 bulk('reorder') cases (730 total suite-wide)

# Wave 3 — clarity + completeness (2026-06-22, feat/canto-migration, not yet merged)
lib/dam/download.ts                      ← pure DOWNLOAD_SIZES {small:640,medium:1280,large:2048,original:null} + parseDownloadSize(raw) (defaults/clamps to 'original') — shared by the download route + UI labels + unit test
app/api/media/dam/asset/[id]/download/route.ts ← GET ?size= single-asset download: original→302 signed-URL attachment; image preset→Sharp .rotate().resize(width).jpeg(90) attachment; video→original. STAFF, workspace-scoped, [dam/download] error logging
lib/dam/bulk.ts                          ← +removeTags {tags} (set-difference), setCredit {credit} (empty clears), setSponsor {sponsor} (empty clears) — validated, existing columns only
app/api/media/dam/assets/bulk/route.ts   ← +removeTags / setCredit / setSponsor cases (STAFF, workspace-scoped)
app/operator/media/_components/useRecentSearches.ts ← localStorage dam_recent_searches; pure pushRecentSearch/getRecentSearches/clearRecentSearches (dedupe, newest-first, trim 5)
app/operator/media/_components/useSavedSearches.ts ← localStorage dam_saved_searches; pure serialize/deserialize (validate array, slice 20); SavedSearch {id,name,params,createdAt}
app/operator/media/_components/SaveSearchPopover.tsx ← name + save current query/filters as a view
app/operator/media/_components/          ← MediaToolbar (unified search: Vibe toggle removed, chips, recent-searches, clear-X, "Best photos", Save-search), MediaWorkspace (semantic→keyword fallback, sponsors threaded to bulk bar), MediaGrid (first-run + no-results states), BulkActionBar (relabels + removeTags/setCredit/setSponsor + download loading/error, mobile sheet), FilterPanel ("Type" label, swatch tooltips), FolderTree (Saved views section), MediaPreview (labeled detail sections, copy-to-clipboard, download-size menu, Find-similar)
tests/unit/dam/{download,bulk,search-helpers}.test.ts ← +48 (download presets, new bulk actions, recent/saved-search serialization) — 772 total suite-wide
```

## Inputs

- Operator photo uploads (multipart `file`), optional `folderId` / `eventId` / `sponsorName` / `shooterCredit` form fields.
- Env: `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_EVENT_MEDIA_BUCKET` (reused), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, `IMAGE_TAGGING_PROVIDER` (default `cloudflare`), `CLOUDFLARE_AI_IMAGE_MODEL` (optional, default `@cf/microsoft/resnet-50`), `DAM_TAG_SECRET` (optional internal-trigger guard).
- Operator identity + workspace via `requireRole(STAFF)` (`lib/operator-role.ts`).

## Outputs

- Workspace-scoped `Asset` rows; R2 objects at `dam/{workspaceId}/{assetId}/original.*` + `thumb.webp` (private).
- Incremented `Workspace.storageBytes` on upload.
- Async writes: `Asset.aiTags`, `Asset.qualityScore`, `Asset.qualityScores`, `Asset.energyLevel`.
- Short-lived signed GET URLs minted server-side at render time (consumed by Phases 2/4 UI).

## Rules — DO NOT VIOLATE

1. **Assets are PRIVATE in R2.** Never expose raw/public R2 URLs. Serve only via short-lived signed URLs (15-min display / 24-hr download) minted server-side. (Producer/CLAUDE.md scoping rules also apply — this is the stage-specific addition.)
2. **AI tagging/scoring never blocks the upload response and never throws into the upload path.** `tagImage()` returns `[]` and logs on any failure or missing config.
3. **R2 only.** No Vercel Blob, no Cloudinary in this stage. The legacy event-hero Vercel Blob route (`app/api/media/upload`) is out of scope and must not be repurposed for the DAM.
4. **Tagging/scoring uses Cloudflare Workers AI + Sharp only — not an Anthropic call.** The CLAUDE.md model lock does not apply here and must not be circumvented by routing image tagging through Anthropic.
5. **Phase-1 quality scoring is heuristic only** (Sharp: Laplacian-variance sharpness + histogram exposure). No vision-model/LLaVA scoring and no face detection until a later phase explicitly adds it.
6. **`Asset.eventId` / `MediaFolder.eventId` are plain strings (no FK).** Do not add a relation that edits the Producer-shared `Event` model.

## What this stage does NOT own

- **Event hero image** storage/display (legacy Vercel Blob) — Stage 03. DamPicker (Phase 6) only *writes* the chosen asset identifier into the existing `Event.heroImageAssetId` string; it does not change that field or the hero pipeline.
- **MCP transport/auth** (`lib/mcp/`, `/api/mcp`) — Stage 08. This stage adds DAM *tools* there in Phase 5.
- **Operator role/auth model** (`lib/operator-role.ts`) — root. This stage consumes `requireRole`.
- **Workspace branding fields / settings UI** — Stage 07. Phase 4 adds the `/operator/settings/branding` panel and reads branding for share pages.

## Schema fields

- `Asset` — id, workspaceId, filename, url (R2 key), thumbnailUrl (R2 key), blurhash, fileType (PHOTO/VIDEO), size (Int bytes), width, height, duration, shootDate, tags[] (manual), aiTags[] (AI), qualityScore, qualityScores (Json), energyLevel, shooterCredit, isSelect, sortOrder, folderId, eventId, sponsorName, uploadedBy, deletedAt (soft delete), createdAt, updatedAt.
- `MediaFolder` — id, workspaceId, name, type (FULL_GALLERY/SELECTS/VIDEO/SPONSOR/BRAND), eventId, parentId (self-tree), usageRightsExpiry, sortOrder, deletedAt, createdAt.
- `ShareLink` — id, workspaceId, token (unique), folderId, mode (SPONSOR/MEMBER_GALLERY), password (bcrypt), expiresAt, firstAccessedAt, lastAccessedAt, accessCount, brandingOverride (Json), customDomain (unique), watermark (default false), allowedDownloads (Int?), createdAt.
- `AssetDownload` — id, workspaceId, assetId, shareLinkId, downloadedAt.
- `Workspace.storageBytes` — BigInt, total stored bytes (+upload / −permanent delete).

## Routes

- `POST /api/media/dam/upload` — STAFF-gated upload. ✅ Phase 1.
- `POST /api/media/dam/tag/[assetId]` — internal async tag + score. ✅ Phase 1.
- `GET /api/media/dam/assets` / `folders` / `asset/[id]/{thumb,full}` / `assets/bulk` / `asset/[id]` / `download-zip` — operator grid surface. ✅ Phase 2a/2b.
- `/operator/media` — operator grid. ✅ Phase 2.
- `POST /api/dev/seed-dam` + `DELETE /api/dev/seed-dam` — demo seed / clear. ✅ Phase 2d (DevToolbar).
- `/assets/[token]` (sponsor) + `/gallery/[slug]` (member) + `/operator/media/shares` + `/api/share/*` — external share surfaces. ✅ Phase 4 (PR #39, merged 2026-05-28).

## Edge cases

- **Fire-and-forget tagging is best-effort on Vercel** — the post-response trigger fetch is not guaranteed to fire after the serverless function freezes. Acceptable for Phase 1 (tagging is non-critical and no-ops until `CLOUDFLARE_*` is set). Production hardening (`waitUntil` / queue) is a tracked follow-up.
- **Video** is enum-supported (`AssetFileType.VIDEO`) but the Phase-1 upload pipeline accepts images only (Sharp processes images); video ingest is a later phase.
- **HEIC/HEIF** is now accepted on upload and converted to a q90 JPEG (stored full-res) before Sharp processing — prebuilt Sharp/libvips can't decode HEIC on Vercel, so `lib/dam/heic.ts` decodes via libheif (`heic-convert`). EXIF `shootDate` is read from the original HEIC (the converted JPEG loses it); the original HEIC is discarded after conversion. The client `accept` filter in `UploadDropzone` still lists only `image/jpeg,image/png,image/webp`, so the Browse picker greys out HEIC — drag-and-drop is the working path until that filter is widened (tracked follow-up).
- **Share-from-selection reassigns `Asset.folderId`** (Phase 4). When an operator creates a share from selected assets (`POST /api/share/links` with `assetIds`), the route auto-creates a SPONSOR or SELECTS folder and reassigns those assets to it inside a transaction — the only way to express "share exactly these assets" without a many-to-many schema change. To share assets while preserving their original folder, share that folder directly via `folderId` instead.
- **`allowedDownloads` is a workspace-total cap, not per-visitor** (Phase 4). It counts every `AssetDownload` row for the share. Two visitors each downloading once = 2 against the cap. When the cap is reached the per-asset download endpoint returns 410 and the share page renders the Download CTA as "Limit reached".
- **Per-share auth cookie is HMAC-keyed off the password hash** (Phase 4) — no `SHARE_AUTH_SECRET` env to manage. A leaked cookie cannot forge auth for any other ShareLink (each share has a unique HMAC key). Cookie Path is scoped to the share's URL prefix, so cookies don't bleed across shares in the same browser session.
