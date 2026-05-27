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

/** Decode a HEIC/HEIF buffer to a q90 JPEG buffer. Throws on undecodable input.
 *  Dynamically imported so the libheif WASM only loads when a HEIC actually arrives. */
export async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  const heicConvert = (await import('heic-convert')).default;
  // heic-convert types want an ArrayBufferLike; a Node Buffer is a Uint8Array
  // view, so hand it a standalone ArrayBuffer sliced to the view (pool-safe).
  const arrayBuffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
  ) as ArrayBuffer;
  const out = await heicConvert({ buffer: arrayBuffer, format: 'JPEG', quality: 0.9 });
  return Buffer.from(out);
}
