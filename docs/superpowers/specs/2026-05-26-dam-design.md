# Digital Asset Manager (DAM) — Design Spec

**Date:** 2026-05-26
**Stage:** `_context/15-media-dam/` (to be created in Phase 1)
**Status:** Design — awaiting schema sign-off before Phase 1 implementation
**Author:** Claude Code + Adam Semien

---

## 1. Overview

A world-class Digital Asset Manager for nobc-os at `/operator/media`. Operators upload,
organize, tag, and share event photography/video. Two external share surfaces: a **sponsor
delivery** portal and a **member gallery**. A reusable `<DamPicker>` lets any part of the
platform select an asset (first consumer: the event hero image). An MCP tool surface exposes
the library to the agent layer (PDF generation, inventory, search).

Tenant Zero is NoBC; built workspace-scoped and white-label from day one like the rest of the
platform.

## 2. Constraints honored (from CLAUDE.md)

- **Workspace scoping is the security boundary.** Every new table carries `workspaceId`,
  indexed, and every query is workspace-scoped. No exceptions.
- **No hex literals in components.** Semantic tokens only (`bg-primary`, `text-text-primary`, …).
- **Schema: generate then push manually.** Producer shares this Postgres instance. All changes
  here are **additive** (new tables + one defaulted column). `prisma generate` + show diff +
  Adam sign-off. **Never auto-push.**
- **Anthropic model lock is untouched.** AI tagging/scoring uses **Cloudflare Workers AI** and
  **Sharp** — different providers, not an Anthropic call. No conflict with the
  `claude-sonnet-4-20250514` lock.
- **Canonical terminology.** Operator UI is "Access," never "RSVP." DAM copy uses
  Media/Assets/Selects/Gallery; "Guest" for `MemberStatus.GUEST`.
- **R2-only.** No Cloudinary, no new paid media services. Legacy Vercel Blob hero-upload route
  is left as-is; the DAM uses R2 exclusively.
- **Error boundaries log.** Any new catch logs with traceable context; async tagging/scoring
  failures are logged, never silently swallowed.

## 3. Resolved decisions

| Decision | Choice |
|---|---|
| Delivery | **6 phased PRs**, schema PR first and isolated. Each phase: own spec → plan → PR. |
| Asset access | **All assets private in R2. No public/raw URLs.** Server mints **signed URLs at render time** — 15-min expiry for display/thumbnails, 24-hr for downloads. Access control + download tracking fall out of the app minting URLs. |
| AI tagging | `tagImage(url): Promise<string[]>` abstraction; provider via `IMAGE_TAGGING_PROVIDER` (`cloudflare` \| `huggingface` \| `openai`), default `cloudflare` (Workers AI classification). Runs **async**, never blocks upload. Stored in `Asset.aiTags`, separate from manual `Asset.tags`. |
| Quality scoring | **Phase 1 = Sharp heuristic only**: sharpness (Laplacian variance), exposure (histogram over/under). `energyLevel` inferred from tagging scene labels. Stored as `qualityScore Float?` + `qualityScores Json?` + `energyLevel String?`. **Vision/LLaVA scoring deferred** to a later phase. **Face count deferred** — Sharp can't detect faces natively (needs another lib/model). |
| Dependencies | Approved. Phase-scoped: P1 `sharp` + `blurhash` + `exifr` (+ types). P2 `justified-layout`. Share phase `bcryptjs` + `nanoid` + `archiver`. |
| R2 bucket | **Reuse existing `R2_EVENT_MEDIA_BUCKET`** with workspace-scoped key prefix `dam/{workspaceId}/…`. (No new bucket/env to provision. Open to a dedicated bucket if preferred.) |

## 4. Architecture

```
Upload (operator) ──► /api/media/dam/upload (R2-only)
   │  1. validate + read bytes
   │  2. Sharp: 800px thumbnail (webp) + dimensions
   │  3. blurhash encode (from a tiny Sharp raster)
   │  4. exifr: shootDate (EXIF DateTimeOriginal)
   │  5. PUT original + thumbnail to R2 (private, dam/{workspaceId}/…)
   │  6. create Asset row; increment Workspace.storageBytes
   │  7. respond 200 (upload done) ───────────────┐
   │                                               │ (does NOT block on AI)
   └─► fire-and-forget POST /api/media/dam/tag/[id]┘
          ├─ tagImage(url)  → Asset.aiTags
          ├─ Sharp heuristic → qualityScore + qualityScores
          └─ energyLevel from scene labels

Display/serve:
  thumbnails + originals are PRIVATE in R2.
  Server components / API mint signed GET URLs on demand:
    presignGet(key, 15m)  for grid/preview display
    presignGet(key, 24h)  for downloads (+ record AssetDownload)
  Share pages (/assets/[token], /gallery/[slug]) mint signed URLs at render.
```

**Storage module** (`lib/dam/storage.ts`): extends the `lib/r2-presign.ts` R2 client with
`uploadObject(key, buf, contentType)`, `presignGet(key, expiresSeconds)`, `deleteObject(key)`.

**Image module** (`lib/dam/image.ts`): `processImage(buf)` → `{ thumbnailBuf, blurhash, width,
height, shootDate }` using Sharp + blurhash + exifr. `scoreImage(buf)` → `{ qualityScore,
qualityScores }` (Laplacian variance + histogram).

**Tagging module** (`lib/dam/tagging.ts`): `tagImage(url)` provider-switch; `cloudflare`
implemented (Workers AI image classification), `huggingface`/`openai` stubbed behind the same
signature.

## 5. Phased roadmap (each phase = its own PR)

1. **Foundation (this spec's detail).** Schema + R2 storage pipeline + image processing
   (thumb/blurhash/exif) + async tagging & heuristic scoring + upload API + `_context/15` stage.
   Backend only, no UI. **Isolated schema PR.**
2. **Operator grid.** `/operator/media`: justified-layout grid, BlurHash placeholders, hover
   state, selection + bulk action bar (flag-select / download zip / add tag / move / delete),
   FLIP sort transitions, sorts (Date/Event/Sponsor/File type/Selects-first/Quality/Manual),
   filter panel, Postgres full-text search, folder tree, full-screen preview modal (inline tag
   editing), batch upload, grid density toggle (localStorage), soft-delete/trash (30-day) +
   permanent-delete confirm, Top Picks filter (`qualityScore > 75`), operator nav item.
3. **Timeline / Moment Map view.** Secondary view toggle, horizontal `shootDate` plot, hour
   scrubber, time-marker dividers, single-event-folder only, EXIF-missing fallback to upload order.
4. **Share modes + branding + analytics.** `/assets/[token]` sponsor delivery; `/gallery/[slug]`
   member gallery (password gate, watermark, social share, mobile-first); ZIP download;
   `/operator/settings/branding`; per-link `brandingOverride`; `customDomain` via middleware;
   first-access email notification; link analytics (views/downloads/`AssetDownload`).
5. **MCP tools** at the existing `/api/mcp`: `list_assets`, `get_asset`, `get_folder`,
   `get_asset_inventory`, `create_share_link`, `search_assets`, `flag_as_select`,
   `get_share_links`, `get_storage_stats`.
6. **DamPicker + event-editor integration.** Reusable `<DamPicker>` modal; "Browse Media"
   button in the hero section alongside existing upload; on select writes the asset identifier
   to `Event.heroImageAssetId` (no schema change — that field is already a `String?`).

---

## 6. Phase 1 — detailed spec

### 6.1 Schema additions (additive only)

**New enums**

```prisma
enum AssetFileType { PHOTO VIDEO }
enum MediaFolderType { FULL_GALLERY SELECTS VIDEO SPONSOR BRAND }
enum ShareLinkMode { SPONSOR MEMBER_GALLERY }
```

**New model: `Asset`**

```prisma
model Asset {
  id            String        @id @default(cuid())
  workspaceId   String
  workspace     Workspace     @relation(fields: [workspaceId], references: [id])
  filename      String
  url           String        // R2 object key for the private full-res original
  thumbnailUrl  String        // R2 object key for the 800px thumbnail
  blurhash      String?
  fileType      AssetFileType
  size          Int           // bytes (per-asset; <2GB. Workspace total tracked as BigInt)
  width         Int?
  height        Int?
  duration      Float?        // seconds, video only
  shootDate     DateTime?     // EXIF DateTimeOriginal; default sort key, falls back to createdAt
  tags          String[]      @default([])  // manual
  aiTags        String[]      @default([])  // AI auto-tags (separate from manual)
  qualityScore  Float?        // heuristic overall (Phase 1)
  qualityScores Json?         // breakdown { sharpness, exposure, ... }
  energyLevel   String?       // low | medium | high (inferred from scene labels)
  shooterCredit String?       // photographer credit, editable in metadata panel
  isSelect      Boolean       @default(false)
  sortOrder     Int           @default(0)    // manual ordering
  folderId      String?
  folder        MediaFolder?  @relation(fields: [folderId], references: [id])
  eventId       String?       // plain string + index, NO FK (mirrors heroImageAssetId; avoids touching Event)
  sponsorName   String?
  uploadedBy    String        // Clerk userId
  deletedAt     DateTime?     // soft delete; null = live, set = trashed (30-day recover)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  downloads     AssetDownload[]

  @@index([workspaceId])
  @@index([folderId])
  @@index([eventId])
  @@index([deletedAt])
}
```

**New model: `MediaFolder`**

```prisma
model MediaFolder {
  id                String          @id @default(cuid())
  workspaceId       String
  workspace         Workspace       @relation(fields: [workspaceId], references: [id])
  name              String
  type              MediaFolderType
  eventId           String?         // plain string + index, no FK
  parentId          String?
  parent            MediaFolder?    @relation("FolderTree", fields: [parentId], references: [id])
  children          MediaFolder[]   @relation("FolderTree")
  usageRightsExpiry DateTime?
  sortOrder         Int             @default(0)
  deletedAt         DateTime?       // soft delete (folders)
  createdAt         DateTime        @default(now())
  assets            Asset[]
  shareLinks        ShareLink[]

  @@index([workspaceId])
  @@index([eventId])
  @@index([parentId])
}
```

**New model: `ShareLink`**

```prisma
model ShareLink {
  id               String          @id @default(cuid())
  workspaceId      String
  workspace        Workspace       @relation(fields: [workspaceId], references: [id])
  token            String          @unique
  folderId         String
  folder           MediaFolder     @relation(fields: [folderId], references: [id])
  mode             ShareLinkMode
  password         String?         // bcrypt hash, optional
  expiresAt        DateTime?
  firstAccessedAt  DateTime?       // set on first access → triggers operator email
  lastAccessedAt   DateTime?
  accessCount      Int             @default(0)
  brandingOverride Json?           // { logo, primaryColor, companyName }
  customDomain     String?         @unique
  createdAt        DateTime        @default(now())
  downloads        AssetDownload[]

  @@index([workspaceId])
  @@index([folderId])
}
```

**New model: `AssetDownload`**

```prisma
model AssetDownload {
  id           String     @id @default(cuid())
  workspaceId  String
  assetId      String
  asset        Asset      @relation(fields: [assetId], references: [id])
  shareLinkId  String?
  shareLink    ShareLink? @relation(fields: [shareLinkId], references: [id])
  downloadedAt DateTime   @default(now())

  @@index([workspaceId])
  @@index([assetId])
  @@index([shareLinkId])
}
```

**Modified model: `Workspace`** (additive only)

```prisma
  storageBytes   BigInt          @default(0)   // total stored bytes; +on upload, -on permanent delete
  // virtual back-relations (no columns added):
  assets         Asset[]
  mediaFolders   MediaFolder[]
  shareLinks     ShareLink[]
  assetDownloads AssetDownload[]
```

### 6.2 db push safety

| Table | Change | Producer-safe? |
|---|---|---|
| `Asset` | NEW table | ✅ Producer never reads it |
| `MediaFolder` | NEW table | ✅ |
| `ShareLink` | NEW table | ✅ |
| `AssetDownload` | NEW table | ✅ |
| `Workspace` | ADD `storageBytes BigInt @default(0)` + virtual back-relations | ✅ defaulted column, no backfill, metadata-only add in PG; back-relations add no columns |
| enums `AssetFileType` / `MediaFolderType` / `ShareLinkMode` | NEW | ✅ |

No drops, no renames, no retypes, no new NOT-NULL-without-default on existing tables.
→ `prisma db push` is safe. Process: `prisma generate` → show diff → **Adam confirms** → push.
**Never auto-push.**

### 6.3 Storage / upload pipeline

- `lib/dam/storage.ts` — R2 client (reuse `lib/r2-presign.ts` config), `uploadObject`,
  `presignGet(key, expires)`, `deleteObject`. Keys: `dam/{workspaceId}/{assetId}/original.{ext}`
  and `…/thumb.webp`.
- `app/api/media/dam/upload/route.ts` — `requireRole(STAFF)`; validate type/size; Sharp thumb +
  blurhash + exif; PUT original + thumb to R2; create `Asset`; `storageBytes += size`; respond.
  Then fire-and-forget the tag/score route.
- `app/api/media/dam/tag/[assetId]/route.ts` — internal; `tagImage()` + `scoreImage()`; write
  `aiTags`, `qualityScore`, `qualityScores`, `energyLevel`. Logs failures (no silent swallow).

### 6.4 Image processing

- `lib/dam/image.ts` — `processImage(buf)` (Sharp: resize 800px webp thumbnail, metadata for
  width/height; blurhash encode from a downscaled raster; exifr for `shootDate`). `scoreImage(buf)`
  (Laplacian variance for sharpness; luminance histogram for exposure; weighted `qualityScore`).

### 6.5 AI tagging

- `lib/dam/tagging.ts` — `tagImage(url): Promise<string[]>`; `IMAGE_TAGGING_PROVIDER` switch;
  `cloudflare` calls Workers AI image classification (`CLOUDFLARE_ACCOUNT_ID` +
  `CLOUDFLARE_AI_API_TOKEN`); `huggingface`/`openai` stubbed behind the same signature; returns
  `[]` and logs if unconfigured (never throws into the upload path).

### 6.6 New env vars (Phase 1)

- `CLOUDFLARE_ACCOUNT_ID` — Workers AI account
- `CLOUDFLARE_AI_API_TOKEN` — Workers AI token
- `IMAGE_TAGGING_PROVIDER` — `cloudflare` (default) | `huggingface` | `openai`
- (reuses existing `R2_*` vars + `R2_EVENT_MEDIA_BUCKET`)

Features no-op gracefully until set (tagging returns `[]`); upload + thumb + blurhash + exif +
heuristic scoring all work without any new env var.

### 6.7 `_context/15-media-dam/CONTEXT.md`

Created via the `nobc-icm` skill (canonical template) as part of Phase 1, wired into the stage
map in `CLAUDE.md` and `_context/README.md`.

## 7. Out of scope / deferred

- Vision-model (LLaVA) aesthetic scoring — later phase.
- Face-count scoring — needs a face-detection lib/model; not Phase 1.
- Photographer upload link — explicitly Phase 2 per the brief ("do not build now").
- Custom R2 public domain + edge caching — signed URLs reduce CDN cache hit rate; revisit if
  thumbnail latency becomes an issue.

## 8. Open items for confirmation

1. **R2 bucket:** reuse `R2_EVENT_MEDIA_BUCKET` w/ `dam/{workspaceId}/` prefix (recommended) vs.
   a dedicated `R2_DAM_BUCKET`.
2. **blurhash package:** standard `blurhash` (woltapp) — confirm vs. any alternative.
3. **`Asset.eventId`** kept as plain `String?` + index (no FK) to avoid editing the
   Producer-shared `Event` model. Confirm acceptable (loses DB-level cascade; app enforces).
