/**
 * Server-side image type detection by magic bytes (file signature).
 *
 * Upload routes must NOT trust the client-supplied `file.type` — a client can
 * label arbitrary bytes `image/png`. This sniffs the leading bytes of the buffer
 * and returns the real image type, so a route can reject a clear mismatch.
 * Defense-in-depth: stored objects are private and never executed, so this is
 * content-spoofing protection, not an RCE fix. (SECURITY-AUDIT-2026-06-22, M.)
 *
 * Detected: JPEG, PNG, WebP, HEIC/HEIF (ftyp brands). Returns `null` when the
 * bytes match no known image signature.
 */

export type SniffedImageType = 'jpeg' | 'png' | 'webp' | 'heic';

/** Inspect the leading bytes of a buffer and return the real image type, or null. */
export function sniffImageType(buf: Buffer): SniffedImageType | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  // HEIC/HEIF: ISO-BMFF box "ftyp" at offset 4, with a HEIC/HEIF major brand.
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'].includes(brand)) {
      return 'heic';
    }
  }

  return null;
}

/**
 * True when the real (sniffed) bytes match one of the allowed image types.
 * Pass the set of types you accept. HEIC callers should include 'heic'.
 */
export function isAllowedImageBytes(buf: Buffer, allowed: ReadonlySet<SniffedImageType>): boolean {
  const sniffed = sniffImageType(buf);
  return sniffed !== null && allowed.has(sniffed);
}
