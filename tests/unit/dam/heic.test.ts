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
    expect(isHeic('', 'IMG_1234.HEIC')).toBe(true); // the common iPhone case
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
