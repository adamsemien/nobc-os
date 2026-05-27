# Stage 15 — Media (Digital Asset Manager)

> Owns the operator media library at `/operator/media` — R2-backed asset storage, AI tagging + heuristic quality scoring, organization (folders / selects / tags), the two external share surfaces (sponsor delivery + member gallery), and the reusable `<DamPicker>`.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 In progress — Phase 1 + 2a merged & live in prod (#26, #27); Phase 2b in review (PR #29 — world-class upload + grid interactions + layout overflow fix); Phase 3 (Timeline) next |
| **V1 item** | Post-V1 (new capability, not in items #1–#28) |
| **Last updated** | 2026-05-26 |
| **Owner** | Adam |
| **Blocked on** | Nothing for Phase 1. AI tagging no-ops until `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_API_TOKEN` are set in Vercel (upload/thumb/BlurHash/EXIF/heuristic scoring all work without them). |
| **Next** | Review/merge Phase 2b (PR #29) — note: merging it also fixes the `/operator/media` horizontal-overflow bug currently live in prod from #27. Then Phase 3 — Timeline / Moment Map: secondary view toggle, horizontal `shootDate` plot, hour scrubber, time-marker dividers, single-event-folder only, EXIF-missing fallback to upload order. |

## Scope

The operator-facing Digital Asset Manager and its external share surfaces. Delivered in 6 phased PRs (build order = dependency order):

1. ✅ **Foundation** — Prisma schema, R2 private storage, image processing (800px thumbnail / BlurHash / EXIF `shootDate`), async AI tagging + Sharp heuristic scoring, upload API.
2. ✅ **Operator grid** at `/operator/media` — **2a** (justified grid, BlurHash, signed-URL thumbs, sort/filter/FTS, folder tree, density, nav) + **2b** (selection + bulk bar [flag/ZIP/tag/move/delete], FLIP transitions, full-screen preview + inline edit, world-class upload [drag-drop files/folders + click-to-browse + clipboard paste, live per-file XHR progress with thumbnails], trash restore/purge, Top Picks, manual reorder).
3. ⚪ **Timeline / Moment Map** view (single-event, `shootDate`-plotted).
4. ⚪ **Share modes** (`/assets/[token]` sponsor, `/gallery/[slug]` member) + white-label branding + link analytics/notifications.
5. ⚪ **MCP tools** at `/api/mcp` (9 tools).
6. ⚪ **`<DamPicker>`** modal + event-editor hero integration.

Full design contract: `docs/superpowers/specs/2026-05-26-dam-design.md`.

## Files in play

```
lib/dam/storage.ts                       ← R2 private storage: uploadObject, presignGet (15m/24h TTLs), deleteObject, damKey
lib/dam/image.ts                         ← Sharp: 800px WebP thumbnail, BlurHash, dimensions, EXIF shootDate; heuristic scoreImage (Laplacian variance + histogram)
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
- `ShareLink` — id, workspaceId, token (unique), folderId, mode (SPONSOR/MEMBER_GALLERY), password (bcrypt), expiresAt, firstAccessedAt, lastAccessedAt, accessCount, brandingOverride (Json), customDomain (unique), createdAt.
- `AssetDownload` — id, workspaceId, assetId, shareLinkId, downloadedAt.
- `Workspace.storageBytes` — BigInt, total stored bytes (+upload / −permanent delete).

## Routes

- `POST /api/media/dam/upload` — STAFF-gated upload. ✅ Phase 1.
- `POST /api/media/dam/tag/[assetId]` — internal async tag + score. ✅ Phase 1.
- `/operator/media` — operator grid. ⚪ Phase 2.
- `/assets/[token]` (sponsor) + `/gallery/[slug]` (member). ⚪ Phase 4.

## Edge cases

- **Fire-and-forget tagging is best-effort on Vercel** — the post-response trigger fetch is not guaranteed to fire after the serverless function freezes. Acceptable for Phase 1 (tagging is non-critical and no-ops until `CLOUDFLARE_*` is set). Production hardening (`waitUntil` / queue) is a tracked follow-up.
- **Video** is enum-supported (`AssetFileType.VIDEO`) but the Phase-1 upload pipeline accepts images only (Sharp processes images); video ingest is a later phase.
- **HEIC/HEIF** intentionally excluded from accepted MIME types — prebuilt Sharp/libvips lacks HEIC decode. Revisit with libheif if needed.
