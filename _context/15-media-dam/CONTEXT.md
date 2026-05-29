# Stage 15 — Media (Digital Asset Manager)

> Owns the operator media library at `/operator/media` — R2-backed asset storage, AI tagging + heuristic quality scoring, organization (folders / selects / tags), the two external share surfaces (sponsor delivery + member gallery), and the reusable `<DamPicker>`.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 In progress — Phases 1, 2a, 2b, HEIC ingest, dev seed, grid polish, ShareLink schema (`watermark` + `allowedDownloads`), **and Phase 4 (external share surfaces) all merged to main** (PRs #26/#27/#29/#30/#31/#32/#38/#39 — Phase 4 merge commit `49db49c`, 2026-05-28). Phase 3 (Timeline) spec'd & deferred (awaiting real event photography). |
| **V1 item** | Post-V1 (new capability, not in items #1–#28) |
| **Last updated** | 2026-05-29 |
| **Owner** | Adam |
| **Blocked on** | AI tagging no-ops until `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_API_TOKEN` are set in Vercel (upload/thumb/BlurHash/EXIF/heuristic scoring all work without them). |
| **Next** | Pick up Phase 3 (Timeline / Moment Map; spec in `docs/superpowers/specs/2026-05-27-dam-phase-3-timeline-design.md`) or jump to Phase 5 (MCP tools at `/api/mcp`) or Phase 6 (`<DamPicker>` modal + event-editor hero integration). |

> **Media-page polish + design pass (2026-05-27, PR #31):** title top-padding, filter-rail date-input overflow, Trash/help-FAB clearance, view-density active state, "New folder" button, visible preview close (×) + backdrop-click-to-close. Plus a design pass: filter/folder label legibility (12px / `--text-secondary` instead of 11px / `--text-muted`), brand-red (`--primary`) on interactive states that lacked it (filter checkbox + date `accent-color`, search/sort focus ring, Top Picks token), and a translucent-red selection wash + checkmark on grid thumbnails (mirrors the operator-sidebar active treatment). Folder-tree active stays evergreen (`--dam-folder-tree`) by design. Operator-grid UX only — no HEIC/Phase-4 changes.

> **Video play-icon overlay (2026-05-29):** always-visible centered `Play` overlay (`bg-black/50` circle, white fill) on `fileType === 'VIDEO'` assets in both grid (`MediaTile`, h-4) and list (`MediaList`, h-3) views, so videos read as videos at rest instead of only on hover (the hover-bar `Film` icon stays). Inline JSX, no new components, no hex literals.

> **Phase 4 — external share surfaces (2026-05-27):** two public delivery routes (`/assets/[token]` sponsor, `/gallery/[slug]` member) + operator share creation/management. Public surfaces use a token-scoped fetch path (server component + token-scoped signed-redirect routes), never the operator grid API. Password hashing is Node `crypto.scrypt` only (no bcrypt). Auth cookie is HttpOnly + Path-scoped + 1-hour, HMAC-keyed off the per-share password hash so no new env secret was needed. Watermark is a CSS-only diagonal overlay (deterrent, not anti-piracy). Downloads route through `/api/share/token/[token]/download/[assetId]` which logs an `AssetDownload`, enforces `allowedDownloads` (workspace-total, across all visitors), and 302-redirects to a 24-hour signed R2 URL with `Content-Disposition: attachment` so cross-origin downloads save instead of opening inline (the HTML `download` attribute can't force that). The "Share N assets" operator flow wraps the selection in a fresh MediaFolder (SPONSOR or SELECTS type, auto-named) and shares that folder — same primitive as the existing "create selects folder, then share" workflow. Phase 5 (MCP) + Phase 6 (`<DamPicker>`) are next.

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
