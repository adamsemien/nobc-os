import { describe, it, expect } from 'vitest';
import { parseDownloadSize, DOWNLOAD_SIZES } from '@/lib/dam/download';
import type { DownloadSize } from '@/lib/dam/download';

describe('DOWNLOAD_SIZES', () => {
  it('has exactly four keys', () => {
    expect(Object.keys(DOWNLOAD_SIZES)).toHaveLength(4);
  });

  it('maps small to 640, medium to 1280, large to 2048, original to null', () => {
    expect(DOWNLOAD_SIZES.small).toBe(640);
    expect(DOWNLOAD_SIZES.medium).toBe(1280);
    expect(DOWNLOAD_SIZES.large).toBe(2048);
    expect(DOWNLOAD_SIZES.original).toBeNull();
  });
});

describe('parseDownloadSize', () => {
  describe('valid values pass through unchanged', () => {
    const VALID: DownloadSize[] = ['small', 'medium', 'large', 'original'];
    for (const v of VALID) {
      it(`"${v}" → "${v}"`, () => {
        expect(parseDownloadSize(v)).toBe(v);
      });
    }
  });

  describe('invalid / missing values default to "original"', () => {
    it('null → "original"', () => {
      expect(parseDownloadSize(null)).toBe('original');
    });

    it('empty string → "original"', () => {
      expect(parseDownloadSize('')).toBe('original');
    });

    it('unknown string "huge" → "original"', () => {
      expect(parseDownloadSize('huge')).toBe('original');
    });

    it('arbitrary garbage → "original"', () => {
      expect(parseDownloadSize('__proto__')).toBe('original');
      expect(parseDownloadSize('SMALL')).toBe('original'); // case-sensitive
      expect(parseDownloadSize('640')).toBe('original');   // numeric string, not a key
    });
  });
});
