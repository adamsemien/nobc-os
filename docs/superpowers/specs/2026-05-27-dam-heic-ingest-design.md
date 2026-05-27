# DAM — HEIC Ingest (Phase 4 Prerequisite) — Design

**Date:** 2026-05-27
**Stage:** 15 — Media (Digital Asset Manager)
**Status:** Approved (brainstorm) → ready for implementation plan
**Depends on:** Phases 1, 2a, 2b (merged & live). **Blocks:** Phase 4 share surfaces.

---

## Goal

Accept **HEIC/HEIF** uploads in the DAM and convert each to a **q90 JPEG "original"** on ingest, so the entire existing pipeline (800px WebP thumbnail, BlurHash, dimensions, EXIF shoot date, R2 storage, operator display, Phase 4 download) runs **unchanged** on a universally-renderable file. The HEIC is discarded after conversion.

This ships as **its own PR, merged and validated in production first** — it isolates a genuine runtime risk (HEIC decode on Vercel) before Phase 4's sponsor/member delivery depends on it.

---

## Background / why this is non-trivial

- The upload route (`app/api/media/dam/upload/route.ts`) currently **rejects** HEIC: `ALLOWED = {image/jpeg, image/jpg, image/png, image/webp}`.
- `sharp`'s prebuilt binary on Vercel **cannot decode HEIC** (HEVC licensing — sharp ships without HEIC decode). So neither `processImage` nor `scoreImage` can read a HEIC buffer.
- There is **no built-in Node HEIC decoder**. The only viable server path is a userland decoder.
- **EXIF trap:** the decoder's output JPEG very likely **drops EXIF**, and iPhone HEICs are precisely the photos that carry a real `DateTimeOriginal`. Capture time must be read from the **original HEIC bytes** (exifr reads HEIC), not the converted JPEG, or Phase 3's timeline data is lost on exactly the files that have it.

---

## Decisions (locked in brainstorm)

| # | Decision |
|---|---|
| 1 | **Dependency:** `heic-convert` (libheif as pure-JS/WASM) + `@types/heic-convert`. The only viable server-side HEIC decoder; approved. |
| 2 | **Output:** HEIC → **q90 JPEG** stored as the full-res R2 "original" (`original.jpg`, `image/jpeg`). JPEG is the safe universal deliverable for Phase 4 (Adobe/print/Windows). **WebP thumbnail unchanged.** |
| 3 | **HEIC discarded** after conversion — we do **not** retain the HEIC bytes (no archival copy, no extra R2 key/field). |
| 4 | **Preserve capture time:** extract `shootDate` from the **original HEIC** buffer, not the converted JPEG. |
| 5 | **Detection** by MIME **or** filename extension, **case-insensitive** — iPhone files are commonly `IMG_1234.HEIC` (uppercase) with an empty/unreliable `file.type`. |
| 6 | `export const maxDuration = 60` on the upload route — WASM decode of a ~12MP photo adds ~1–3s; guards batch-upload timeouts. |

**Non-goals:** video/HEIC-sequence frame extraction (still-image only); retaining HEIC originals; client-side conversion; changing the thumbnail/scoring algorithms.

---

## Architecture

### `lib/dam/heic.ts` (new — pure detection + thin decode wrapper)

```ts
const HEIC_MIMES = new Set([
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
]);

/** True for HEIC/HEIF by MIME or by file extension (case-insensitive).
 *  Extension is the primary signal — iPhone uploads often have an empty file.type. */
export function isHeic(mime: string | null | undefined, filename: string | null | undefined): boolean {
  const m = (mime ?? '').toLowerCase();
  if (HEIC_MIMES.has(m)) return true;
  const n = (filename ?? '').toLowerCase();
  return n.endsWith('.heic') || n.endsWith('.heif');
}

/** Decode HEIC/HEIF → q90 JPEG buffer via libheif (heic-convert). Throws on undecodable input. */
export async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  const heicConvert = (await import('heic-convert')).default;
  const out = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 });
  return Buffer.from(out);
}
```

`isHeic` is **pure → unit-tested**. `convertHeicToJpeg` is a thin wrapper validated at runtime on the preview deploy.

### `lib/dam/image.ts` (one backward-compatible change)

`processImage` gains an optional second arg so EXIF can be read from a *different* buffer than the one being thumbnailed:

```ts
export async function processImage(
  input: Buffer,
  opts?: { exifInput?: Buffer },
): Promise<ProcessedImage> {
  // thumbnail / blurhash / dimensions from `input` (the web-renderable buffer)
  // ...
  const [blurhash, shootDate] = await Promise.all([
    encodeBlurhash(input).catch(() => null),
    extractShootDate(opts?.exifInput ?? input).catch(() => null),  // ← only change
  ]);
  // ...
}
```

Existing callers (no `opts`) are unaffected — `shootDate` still comes from `input`.

### `app/api/media/dam/upload/route.ts`

```ts
export const maxDuration = 60; // WASM HEIC decode headroom

// ...inside POST, after reading the File:
const mime = file.type;
const name = file.name || '';
const original = Buffer.from(await file.arrayBuffer());          // size cap checked on this
const heic = isHeic(mime, name);
if (!heic && !ALLOWED.has(mime)) {
  return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
}

let webBuffer = original;
let effectiveMime = mime;
let ext = extFromMime(mime);
let exifInput: Buffer | undefined;

if (heic) {
  try {
    webBuffer = await convertHeicToJpeg(original);
  } catch (err) {
    console.error('[dam/upload] HEIC convert failed', { filename: name, error: String(err) });
    return NextResponse.json({ error: 'Could not convert HEIC image' }, { status: 422 });
  }
  effectiveMime = 'image/jpeg';
  ext = 'jpg';
  exifInput = original; // capture time lives in the HEIC, not the JPEG
}

const processed = await processImage(webBuffer, { exifInput });
// store webBuffer as the R2 original: key original.${ext}, content-type effectiveMime
// size = webBuffer.length
```

Notes:
- The **50MB `MAX_BYTES` cap is checked on the uploaded `original`** (HEICs are small; the cap stays a guard against absurd inputs).
- For HEIC, `ext`/`effectiveMime` are set explicitly to `jpg`/`image/jpeg` — `extFromMime` is not consulted.
- Everything after `processImage` (Asset row, R2 PUT of original+thumb, `storageBytes` bump, fire-and-forget tag/score trigger) is unchanged; it just operates on the JPEG `webBuffer`.

---

## Data flow

```
upload (multipart file)
  │  isHeic(mime, filename)?
  ├─ no  → webBuffer = original ───────────────────────────────┐
  └─ yes → convertHeicToJpeg(original) = webBuffer (q90 JPEG)   │  exifInput = original (HEIC)
                                                                ▼
                                  processImage(webBuffer, { exifInput })
                                     thumbnail(WebP) + blurhash + dims  ← webBuffer
                                     shootDate (exifr)                  ← exifInput ?? webBuffer
                                                                ▼
                          R2: original.jpg (image/jpeg) + thumb.webp   ·   Asset row   ·   storageBytes += webBuffer.length
```

---

## Edge cases

- **Undecodable / corrupt HEIC** → `convertHeicToJpeg` throws → **422** ("Could not convert HEIC image"), logged. No Asset row, no R2 write.
- **Empty `file.type` + `.HEIC` extension** → detected via the case-insensitive extension branch. ✓ (the common iPhone case)
- **`.HEIC` uppercase / `.Heif` mixed case** → matched (compare lowercased).
- **Non-HEIC uploads** → untouched passthrough; `processImage(buffer)` with no `opts`, identical to today.
- **Orientation** → `heic-convert` outputs an upright JPEG; Sharp `.rotate()` remains a safe no-op / honors any retained tag.
- **HEIC with no EXIF date** → `shootDate` null → falls back to `createdAt` downstream (existing behavior).

---

## Testing

- **Vitest** `tests/unit/dam/heic.test.ts` on `isHeic` (pure):
  - MIME matches: `image/heic`, `image/heif`, `image/heic-sequence`, `image/heif-sequence` (+ uppercased MIME).
  - Extension matches (empty/odd MIME): `photo.heic`, `IMG_1234.HEIC`, `clip.heif`, `X.HEIF`, `a.HeIc`.
  - Negatives: `image/jpeg`+`.jpg`, `image/png`+`.png`, `image/webp`, `''`+`.jpg`, `''`+`''`.
- **Optional** Vitest on `processImage` `exifInput` routing using a small JPEG-with-EXIF fixture as `exifInput` and a plain buffer as `input` — asserts `shootDate` derives from `exifInput`. (Skip if no clean fixture; the isHeic tests + runtime check cover the behavior.)
- **Runtime validation (the real test):** on the preview deploy, upload a real iPhone `.HEIC` → expect a viewable JPEG original, a WebP thumbnail, correct dimensions, and `shootDate` populated from the photo's capture time.
- `tsc` clean, `next build` green.

---

## Delivery & housekeeping

- **Branch/PR:** `claude/dam-heic-ingest` off `main`; merged + **prod-validated before** the Phase 4 share-surfaces spec.
- **Rides along on this branch** (so they reach `main`): the deferred **Phase 3 Timeline spec** doc (`2026-05-26`→ committed; build deferred) and the `.gitignore` `.superpowers` entry.
- **CONTEXT.md fold-in** (`_context/15-media-dam/CONTEXT.md`): State → Phases 1/2a/2b **merged & live in prod** (#26/#27/#29); **Phase 3 spec'd & deferred** (awaiting real event photography); **HEIC ingest prerequisite in progress**. Update Next / Files in play (`lib/dam/heic.ts`, `processImage` signature) accordingly.

---

## Dependencies added

- `heic-convert` (runtime) + `@types/heic-convert` (dev) — sole purpose: server-side HEIC→JPEG decode. Approved in brainstorm; no other new deps.
