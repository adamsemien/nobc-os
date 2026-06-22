import { describe, expect, it } from 'vitest';
import { sniffImageType, isAllowedImageBytes, type SniffedImageType } from '@/lib/image-magic-bytes';

// Minimal 12+ byte buffers carrying each format's real signature.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const webp = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);
const heic = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftyp', 'ascii'),
  Buffer.from('heic', 'ascii'),
]);

describe('sniffImageType', () => {
  it('detects each real image signature', () => {
    expect(sniffImageType(jpeg)).toBe('jpeg');
    expect(sniffImageType(png)).toBe('png');
    expect(sniffImageType(webp)).toBe('webp');
    expect(sniffImageType(heic)).toBe('heic');
  });

  it('returns null for non-image bytes (a spoofed payload)', () => {
    expect(sniffImageType(Buffer.from('GIF89a-not-allowed', 'ascii'))).toBeNull();
    expect(sniffImageType(Buffer.from('<?php echo 1; ?>', 'ascii'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7 binary here', 'ascii'))).toBeNull();
  });

  it('returns null for a too-short buffer', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('isAllowedImageBytes', () => {
  const standard = new Set<SniffedImageType>(['jpeg', 'png', 'webp']);

  it('accepts allowed real images and rejects others', () => {
    expect(isAllowedImageBytes(jpeg, standard)).toBe(true);
    expect(isAllowedImageBytes(png, standard)).toBe(true);
    expect(isAllowedImageBytes(webp, standard)).toBe(true);
    // HEIC not in the standard allowlist (apply + event-hero routes don't accept it).
    expect(isAllowedImageBytes(heic, standard)).toBe(false);
    // Spoofed bytes labeled as an image by the client must be rejected.
    expect(isAllowedImageBytes(Buffer.from('this is not an image at all', 'ascii'), standard)).toBe(false);
  });

  it('accepts HEIC only when the caller opts in (DAM route)', () => {
    const withHeic = new Set<SniffedImageType>(['jpeg', 'png', 'webp', 'heic']);
    expect(isAllowedImageBytes(heic, withHeic)).toBe(true);
  });
});
