# HEIC Ingest (Phase 4 Prerequisite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept HEIC/HEIF uploads in the DAM and convert each to a q90 JPEG "original" on ingest, preserving EXIF capture time, so the existing thumbnail/BlurHash/storage/display/download pipeline runs unchanged.

**Architecture:** A new `lib/dam/heic.ts` provides a pure `isHeic(mime, filename)` detector and a thin `convertHeicToJpeg(buffer)` libheif wrapper. `processImage` gains an optional `exifInput` buffer so capture time can be read from the original HEIC while the thumbnail is built from the converted JPEG. The upload route detects HEIC, converts before processing, and stores the JPEG as the R2 original.

**Tech Stack:** Next.js 15 route handler (Node runtime), Sharp, exifr, `heic-convert` (libheif WASM), Vitest, Prisma/R2 (unchanged).

**Spec:** `docs/superpowers/specs/2026-05-27-dam-heic-ingest-design.md`

**Branch:** `claude/dam-heic-ingest` (already created off `main`, carrying the deferred Phase 3 spec doc + the `.gitignore` `.superpowers` entry).

---

### Task 1: Add the HEIC decode dependency

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the runtime + type deps**

Run:
```bash
npm install heic-convert && npm install -D @types/heic-convert
```
Expected: both added; `package.json` shows `heic-convert` under `dependencies` and `@types/heic-convert` under `devDependencies`.

- [ ] **Step 2: Verify the module resolves and is callable**

Run:
```bash
node -e "import('heic-convert').then(m => console.log('heic-convert default is', typeof m.default))"
```
Expected: `heic-convert default is function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(media): add heic-convert for HEIC ingest"
```

---

### Task 2: `isHeic` detector (TDD)

**Files:**
- Create: `lib/dam/heic.ts`
- Test: `tests/unit/dam/heic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dam/heic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isHeic } from '@/lib/dam/heic';

describe('isHeic', () => {
  it('matches HEIC/HEIF MIME types', () => {
    expect(isHeic('image/heic', 'x')).toBe(true);
    expect(isHeic('image/heif', 'x')).toBe(true);
    expect(isHeic('image/heic-sequence', 'x')).toBe(true);
    expect(isHeic('image/heif-sequence', 'x')).toBe(true);
  });

  it('matches uppercased MIME', () => {
    expect(isHeic('IMAGE/HEIC', 'x')).toBe(true);
  });

  it('matches by extension when MIME is empty/unreliable (case-insensitive)', () => {
    expect(isHeic('', 'photo.heic')).toBe(true);
    expect(isHeic('', 'IMG_1234.HEIC')).toBe(true);   // the common iPhone case
    expect(isHeic('', 'clip.heif')).toBe(true);
    expect(isHeic('', 'X.HEIF')).toBe(true);
    expect(isHeic('', 'a.HeIc')).toBe(true);
    expect(isHeic('application/octet-stream', 'IMG_9.HEIC')).toBe(true);
  });

  it('returns false for non-HEIC', () => {
    expect(isHeic('image/jpeg', 'a.jpg')).toBe(false);
    expect(isHeic('image/png', 'a.png')).toBe(false);
    expect(isHeic('image/webp', 'a.webp')).toBe(false);
    expect(isHeic('', 'a.jpg')).toBe(false);
    expect(isHeic('', '')).toBe(false);
    expect(isHeic(null, null)).toBe(false);
    expect(isHeic(undefined, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/unit/dam/heic.test.ts
```
Expected: FAIL — `Failed to resolve import "@/lib/dam/heic"` (module doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/dam/heic.ts`:
```ts
/**
 * DAM HEIC/HEIF ingest helpers.
 * - isHeic: pure detection by MIME or filename extension (case-insensitive).
 * - convertHeicToJpeg: decode HEIC -> q90 JPEG via libheif (heic-convert).
 * sharp's prebuilt binary can't decode HEIC on Vercel, so HEIC uploads are
 * converted to JPEG on ingest (see the Phase-4-prerequisite spec).
 */
const HEIC_MIMES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

/** True for HEIC/HEIF by MIME or by file extension (case-insensitive).
 *  Extension is the primary signal — iPhone uploads often have an empty file.type. */
export function isHeic(mime: string | null | undefined, filename: string | null | undefined): boolean {
  if (HEIC_MIMES.has((mime ?? '').toLowerCase())) return true;
  const n = (filename ?? '').toLowerCase();
  return n.endsWith('.heic') || n.endsWith('.heif');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/unit/dam/heic.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dam/heic.ts tests/unit/dam/heic.test.ts
git commit -m "feat(media): isHeic detector (MIME + case-insensitive extension)"
```

---

### Task 3: `convertHeicToJpeg` wrapper

**Files:**
- Modify: `lib/dam/heic.ts`

No unit test: this is a thin wrapper over libheif whose real risk is the Vercel runtime, validated on the preview deploy (Task 7), not in unit tests. Keep it minimal.

- [ ] **Step 1: Add the wrapper to `lib/dam/heic.ts`**

Append to `lib/dam/heic.ts`:
```ts
/** Decode a HEIC/HEIF buffer to a q90 JPEG buffer. Throws on undecodable input.
 *  Dynamically imported so the libheif WASM only loads when a HEIC actually arrives. */
export async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  const heicConvert = (await import('heic-convert')).default;
  const out = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 });
  return Buffer.from(out);
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: `No errors found` (the `@types/heic-convert` types resolve the dynamic import).

- [ ] **Step 3: Commit**

```bash
git add lib/dam/heic.ts
git commit -m "feat(media): convertHeicToJpeg libheif wrapper (q90)"
```

---

### Task 4: `processImage` reads EXIF from an optional separate buffer

**Files:**
- Modify: `lib/dam/image.ts`

The converted JPEG drops EXIF; iPhone HEICs carry the real capture time. This lets the caller pass the original HEIC as the EXIF source while the thumbnail is built from the JPEG. Backward compatible — existing callers pass no `opts`.

- [ ] **Step 1: Change the `processImage` signature and the shoot-date source**

In `lib/dam/image.ts`, replace the `processImage` declaration line:
```ts
export async function processImage(input: Buffer): Promise<ProcessedImage> {
```
with:
```ts
export async function processImage(
  input: Buffer,
  opts?: { exifInput?: Buffer },
): Promise<ProcessedImage> {
```

Then, in the same function, replace this line:
```ts
    extractShootDate(input).catch(() => null),
```
with:
```ts
    extractShootDate(opts?.exifInput ?? input).catch(() => null),
```

- [ ] **Step 2: Verify the existing unit suite + typecheck still pass (backward compat)**

Run:
```bash
npx tsc --noEmit && npm run test:unit
```
Expected: `No errors found`; all existing unit tests pass (the new `opts` arg is optional, so existing `processImage(buffer)` callers are unaffected).

- [ ] **Step 3: Commit**

```bash
git add lib/dam/image.ts
git commit -m "feat(media): processImage accepts optional exifInput for EXIF source"
```

---

### Task 5: Upload route — detect, convert, store the JPEG

**Files:**
- Modify: `app/api/media/dam/upload/route.ts`

- [ ] **Step 1: Import the HEIC helpers and add `maxDuration`**

In `app/api/media/dam/upload/route.ts`, add to the imports:
```ts
import { isHeic, convertHeicToJpeg } from '@/lib/dam/heic';
```

Directly below the existing `export const runtime = 'nodejs';` line, add:
```ts
export const maxDuration = 60; // WASM HEIC decode of a ~12MP photo adds ~1-3s
```

- [ ] **Step 2: Widen the accept gate to allow HEIC through to conversion**

Replace this block:
```ts
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
```
with:
```ts
  const heic = isHeic(file.type, file.name);
  if (!heic && !ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
```

- [ ] **Step 3: Convert HEIC before processing; derive the web buffer / mime / ext / filename**

Replace this block (the original-buffer read + processing + ext):
```ts
  const original = Buffer.from(await file.arrayBuffer());

  let processed;
  try {
    processed = await processImage(original);
  } catch (err) {
    console.error('[dam/upload] image processing failed', {
      workspaceId,
      filename: file.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Could not process image' }, { status: 422 });
  }

  const ext = extFromMime(file.type);
```
with:
```ts
  const original = Buffer.from(await file.arrayBuffer());

  // HEIC can't be decoded by sharp on Vercel — convert to JPEG first, and read
  // EXIF from the original HEIC (the converted JPEG loses it).
  let webBuffer = original;
  let effectiveMime = file.type;
  let ext = extFromMime(file.type);
  let exifInput: Buffer | undefined;
  if (heic) {
    try {
      webBuffer = await convertHeicToJpeg(original);
    } catch (err) {
      console.error('[dam/upload] HEIC convert failed', {
        workspaceId,
        filename: file.name,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: 'Could not convert HEIC image' }, { status: 422 });
    }
    effectiveMime = 'image/jpeg';
    ext = 'jpg';
    exifInput = original;
  }

  let processed;
  try {
    processed = await processImage(webBuffer, { exifInput });
  } catch (err) {
    console.error('[dam/upload] image processing failed', {
      workspaceId,
      filename: file.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Could not process image' }, { status: 422 });
  }

  // Stored bytes are the JPEG (for HEIC) or the original; name reflects .jpg too.
  const baseName = file.name || `upload.${ext}`;
  const filename = heic ? baseName.replace(/\.(heic|heif)$/i, '.jpg') : baseName;
```

- [ ] **Step 4: Use `filename` / `webBuffer` / `effectiveMime` in the create + store + size**

In the `db.asset.create({ data: { ... } })` call, replace:
```ts
      filename: file.name || `upload.${ext}`,
```
with:
```ts
      filename,
```
and replace:
```ts
      size: original.length,
```
with:
```ts
      size: webBuffer.length,
```

In the R2 upload `Promise.all`, replace:
```ts
      uploadObject(originalKey, original, file.type),
```
with:
```ts
      uploadObject(originalKey, webBuffer, effectiveMime),
```

In the `db.$transaction` storage-bytes increment, replace:
```ts
      data: { storageBytes: { increment: BigInt(original.length) } },
```
with:
```ts
      data: { storageBytes: { increment: BigInt(webBuffer.length) } },
```

- [ ] **Step 5: Typecheck + build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: `No errors found`; `✓ Compiled successfully`; `/api/media/dam/upload` present in the route manifest.

- [ ] **Step 6: Commit**

```bash
git add app/api/media/dam/upload/route.ts
git commit -m "feat(media): accept HEIC uploads — convert to JPEG, preserve EXIF shootDate"
```

---

### Task 6: Stage CONTEXT.md fold-in

**Files:**
- Modify: `_context/15-media-dam/CONTEXT.md`

- [ ] **Step 1: Update the status block**

In `_context/15-media-dam/CONTEXT.md`, set the **State** row to:
```
| **State** | 🟡 In progress — Phases 1/2a/2b merged & live in prod (#26/#27/#29); Phase 3 (Timeline) spec'd & deferred (awaiting real event photography); HEIC ingest prerequisite in progress |
```
and the **Next** row to:
```
| **Next** | Land HEIC ingest (own PR), validate on preview with a real iPhone .HEIC, then start the Phase 4 share-surfaces spec (sponsor /assets/[token] + member /gallery/[slug] + ShareLink creation + download logging). |
```

- [ ] **Step 2: Add the new files to "Files in play"**

In the `Files in play` fenced block, add:
```
lib/dam/heic.ts                          ← isHeic (MIME + case-insensitive ext) + convertHeicToJpeg (libheif q90)
```
and append to the `lib/dam/image.ts` line: `; processImage gained optional exifInput (EXIF from original HEIC)`.

- [ ] **Step 3: Update Last updated + commit**

Set **Last updated** to `2026-05-27`, then:
```bash
git add _context/15-media-dam/CONTEXT.md
git commit -m "docs(media): CONTEXT fold-in — 2a/2b live, Phase 3 deferred, HEIC ingest"
```

---

### Task 7: Full verification + runtime validation

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + unit suite + build**

Run:
```bash
npx tsc --noEmit && npm run test:unit && npm run build
```
Expected: `No errors found`; all unit tests pass (including the new `isHeic` suite); `✓ Compiled successfully`.

- [ ] **Step 2: Runtime validation checklist (on the preview deploy after the PR is opened)**

This is the real test of the libheif-on-Vercel risk — it cannot be done locally without R2/Clerk. After opening the PR and the preview goes READY, on `/operator/media` (signed in as STAFF):
- Upload a real iPhone `.HEIC` (uppercase extension, possibly empty `file.type`).
- Expect: the upload succeeds; the grid shows a thumbnail; opening the asset shows a viewable JPEG; dimensions are correct; `shootDate` is populated from the photo's capture time (verify the asset's metadata reflects the real date, not the upload time).
- Upload a normal `.jpg` to confirm the non-HEIC path is unaffected.

- [ ] **Step 3: Finish the branch**

Use the **superpowers:finishing-a-development-branch** skill to push and open the PR (base `main`). Note in the PR body that it also carries the deferred Phase 3 Timeline spec doc + the `.gitignore` entry, and that the runtime HEIC validation (Step 2) must pass on the preview before merge.

---

## Notes for the implementer

- **Do not** change the thumbnail format (stays WebP) or the scoring algorithm.
- **Do not** retain HEIC bytes — only the converted JPEG is stored.
- The `MAX_BYTES` (50MB) cap stays checked on the uploaded `original` buffer (HEICs are small; it's a sanity guard).
- Non-HEIC uploads must remain byte-for-byte the same behavior (passthrough: `webBuffer = original`, `processImage(webBuffer, { exifInput: undefined })` ≡ `processImage(original)`).
