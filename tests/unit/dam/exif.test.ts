import { describe, it, expect } from 'vitest';
import {
  parseExif,
  formatAperture,
  formatShutter,
  formatFocalLength,
  type ExifSummary,
} from '@/lib/dam/exif';

// Pins the defensive normalizer for heterogeneous EXIF JSON stored during the
// Canto migration. The 1,838 real EXIF blocks vary in shape (flat keys, nested
// group objects, exiftool fraction objects, bare strings) and this normalizer
// must never throw on any of them.
//
// Test categories:
//   1. Defensive inputs — null/undefined/primitives/garbage never throw.
//   2. Flat iPhone-style block — keys like Make/Model/ISO/FNumber/ExposureTime.
//   3. Nested exiftool group block — { EXIF: { Make: "..." }, Composite: {...} }.
//   4. Exiftool prefixed keys — "EXIF:Make" at the top level.
//   5. Fraction object values — { numerator, denominator } for FNumber etc.
//   6. formatAperture / formatShutter / formatFocalLength edge cases.

// ---------------------------------------------------------------------------
// parseExif — defensive (never throw)
// ---------------------------------------------------------------------------

describe('parseExif — defensive inputs never throw and always return an object', () => {
  const badInputs: unknown[] = [null, undefined, '', 'not json', 42, [], {}, true, false];

  for (const input of badInputs) {
    it(`returns {} for input ${JSON.stringify(input)}`, () => {
      expect(() => parseExif(input)).not.toThrow();
      const result = parseExif(input);
      expect(result).toBeTypeOf('object');
      expect(result).not.toBeNull();
    });
  }

  it('returns {} for an unparseable JSON string', () => {
    const result = parseExif('{invalid json}');
    expect(result).toEqual({});
  });

  it('returns {} for a JSON-encoded array string', () => {
    // Array parses fine but fails the "not array" guard → should return {}
    expect(parseExif('[1,2,3]')).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// parseExif — flat iPhone-style block
// ---------------------------------------------------------------------------

describe('parseExif — flat iPhone-style block', () => {
  const raw = {
    Make: 'Apple',
    Model: 'iPhone 15 Pro',
    ISO: 100,
    FNumber: 1.78,
    ExposureTime: 0.004, // 1/250s
    FocalLength: 24,
    LensModel: 'iPhone 15 Pro back triple camera 6.765mm f/1.78',
    DateTimeOriginal: '2024:06:15 14:30:00',
    GPSLatitude: 40.7128,
    GPSLongitude: -74.006,
    ImageWidth: 4032,
    ImageHeight: 3024,
  };

  let result: ExifSummary;
  it('parses without throwing', () => {
    expect(() => { result = parseExif(raw); }).not.toThrow();
    result = parseExif(raw);
  });

  it('combines Make + Model into camera string', () => {
    result = parseExif(raw);
    // Apple is NOT a prefix of "iPhone 15 Pro", so result should be "Apple iPhone 15 Pro"
    expect(result.camera).toBe('Apple iPhone 15 Pro');
  });

  it('extracts lens model', () => {
    result = parseExif(raw);
    expect(result.lens).toBe(raw.LensModel);
  });

  it('extracts ISO as a number', () => {
    result = parseExif(raw);
    expect(result.iso).toBe(100);
  });

  it('formats aperture as f/1.8 (1 decimal, not integer)', () => {
    result = parseExif(raw);
    // 1.78 → f/1.8 (toFixed(1) since 1.78 % 1 !== 0)
    expect(result.aperture).toBe('f/1.8');
  });

  it('formats shutter speed as 1/250s', () => {
    result = parseExif(raw);
    expect(result.shutter).toBe('1/250s');
  });

  it('formats focal length as 24mm (integer, no decimal)', () => {
    result = parseExif(raw);
    expect(result.focalLength).toBe('24mm');
  });

  it('parses DateTimeOriginal into ISO 8601 without trailing Z', () => {
    result = parseExif(raw);
    // "2024:06:15 14:30:00" → "2024-06-15T14:30:00"
    expect(result.takenAt).toMatch(/^2024-06-15T/);
    expect(result.takenAt).not.toMatch(/Z$/);
  });

  it('extracts GPS coordinates', () => {
    result = parseExif(raw);
    expect(result.gps?.lat).toBeCloseTo(40.7128);
    expect(result.gps?.lng).toBeCloseTo(-74.006);
  });

  it('computes megapixels from ImageWidth × ImageHeight', () => {
    result = parseExif(raw);
    // 4032 × 3024 = 12,192,768 ≈ 12.2 MP (rounded to 1 decimal)
    expect(result.megapixels).toBeCloseTo(12.2, 0);
  });

  it('preserves the raw object passthrough', () => {
    result = parseExif(raw);
    expect(result.raw).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// parseExif — deduplicate Make prefix in camera string
// ---------------------------------------------------------------------------

describe('parseExif — camera string deduplication', () => {
  it('does not double the make when model starts with make', () => {
    const raw = { Make: 'Apple', Model: 'Apple iPhone 14' };
    const result = parseExif(raw);
    // Model starts with "Apple" → use model directly, no duplication
    expect(result.camera).toBe('Apple iPhone 14');
    expect(result.camera).not.toContain('Apple Apple');
  });

  it('returns just the make when model is absent', () => {
    const result = parseExif({ Make: 'Canon' });
    expect(result.camera).toBe('Canon');
  });

  it('returns just the model when make is absent', () => {
    const result = parseExif({ Model: 'EOS R5' });
    expect(result.camera).toBe('EOS R5');
  });
});

// ---------------------------------------------------------------------------
// parseExif — nested exiftool group block  { EXIF: { Make: "..." } }
// ---------------------------------------------------------------------------

describe('parseExif — nested exiftool group block', () => {
  const raw = {
    EXIF: {
      Make: 'Canon',
      Model: 'EOS R5',
      ISO: 400,
      FNumber: 2.8,
      ExposureTime: '1/500',
      FocalLength: 85,
    },
    Composite: {
      GPSLatitude: 51.5074,
      GPSLongitude: -0.1278,
    },
  };

  it('extracts camera from nested EXIF group', () => {
    const result = parseExif(raw);
    expect(result.camera).toBe('Canon EOS R5');
  });

  it('extracts ISO from nested EXIF group', () => {
    const result = parseExif(raw);
    expect(result.iso).toBe(400);
  });

  it('formats aperture from nested group', () => {
    const result = parseExif(raw);
    expect(result.aperture).toBe('f/2.8');
  });

  it('parses fraction string ExposureTime from nested group', () => {
    const result = parseExif(raw);
    expect(result.shutter).toBe('1/500s');
  });

  it('extracts GPS from nested Composite group', () => {
    const result = parseExif(raw);
    expect(result.gps?.lat).toBeCloseTo(51.5074);
    expect(result.gps?.lng).toBeCloseTo(-0.1278);
  });
});

// ---------------------------------------------------------------------------
// parseExif — exiftool prefixed keys "EXIF:Make" at top level
// ---------------------------------------------------------------------------

describe('parseExif — exiftool colon-prefixed keys at top level', () => {
  const raw = {
    'EXIF:Make': 'Nikon',
    'EXIF:Model': 'Z9',
    'EXIF:ISO': 800,
    'EXIF:FNumber': 4,
    'EXIF:FocalLength': 200,
  };

  it('strips the group prefix and reads Make/Model', () => {
    const result = parseExif(raw);
    expect(result.camera).toBe('Nikon Z9');
  });

  it('strips prefix for ISO', () => {
    const result = parseExif(raw);
    expect(result.iso).toBe(800);
  });

  it('formats aperture from prefixed FNumber', () => {
    const result = parseExif(raw);
    // FNumber 4 → integer → f/4 (no decimal)
    expect(result.aperture).toBe('f/4');
  });

  it('formats focal length from prefixed FocalLength', () => {
    const result = parseExif(raw);
    expect(result.focalLength).toBe('200mm');
  });
});

// ---------------------------------------------------------------------------
// parseExif — exiftool fraction object values
// ---------------------------------------------------------------------------

describe('parseExif — exiftool fraction object values', () => {
  it('handles { numerator, denominator } FNumber object', () => {
    const raw = { FNumber: { numerator: 14, denominator: 5 } }; // 2.8
    const result = parseExif(raw);
    expect(result.aperture).toBe('f/2.8');
  });

  it('handles { numerator, denominator } ExposureTime object for fast shutter', () => {
    const raw = { ExposureTime: { numerator: 1, denominator: 250 } };
    const result = parseExif(raw);
    expect(result.shutter).toBe('1/250s');
  });

  it('handles { num, den } abbreviation variant', () => {
    const raw = { FNumber: { num: 56, den: 10 } }; // 5.6
    const result = parseExif(raw);
    expect(result.aperture).toBe('f/5.6');
  });
});

// ---------------------------------------------------------------------------
// parseExif — stringified JSON (older migration path)
// ---------------------------------------------------------------------------

describe('parseExif — stringified JSON column', () => {
  it('parses a JSON-encoded string payload', () => {
    const payload = JSON.stringify({ Make: 'Sony', Model: 'A7R V', ISO: 200 });
    const result = parseExif(payload);
    expect(result.camera).toBe('Sony A7R V');
    expect(result.iso).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// formatAperture
// ---------------------------------------------------------------------------

describe('formatAperture', () => {
  it('formats 2.8 → f/2.8', () => expect(formatAperture(2.8)).toBe('f/2.8'));
  it('formats 1.4 → f/1.4', () => expect(formatAperture(1.4)).toBe('f/1.4'));
  it('formats integer 8 → f/8 (no decimal)', () => expect(formatAperture(8)).toBe('f/8'));
  it('formats numeric string "5.6" → f/5.6', () => expect(formatAperture('5.6')).toBe('f/5.6'));
  it('returns undefined for 0', () => expect(formatAperture(0)).toBeUndefined());
  it('returns undefined for negative', () => expect(formatAperture(-1.4)).toBeUndefined());
  it('returns undefined for NaN', () => expect(formatAperture(NaN)).toBeUndefined());
  it('returns undefined for null', () => expect(formatAperture(null)).toBeUndefined());
  it('returns undefined for undefined', () => expect(formatAperture(undefined)).toBeUndefined());
  it('returns undefined for non-numeric string', () => expect(formatAperture('bad')).toBeUndefined());
  it('does not throw on any input', () => {
    for (const v of [null, undefined, NaN, '', [], {}, 'abc', -5, 0]) {
      expect(() => formatAperture(v)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// formatShutter
// ---------------------------------------------------------------------------

describe('formatShutter', () => {
  it('formats 0.004 → 1/250s', () => expect(formatShutter(0.004)).toBe('1/250s'));
  it('formats 0.002 → 1/500s', () => expect(formatShutter(0.002)).toBe('1/500s'));
  it('formats 2 → 2s (slow shutter, integer)', () => expect(formatShutter(2)).toBe('2s'));
  it('formats 1.5 → 1.5s (slow shutter, fractional)', () => expect(formatShutter(1.5)).toBe('1.5s'));
  it('formats 1 → 1s', () => expect(formatShutter(1)).toBe('1s'));
  it('formats fraction string "1/250" → 1/250s', () => expect(formatShutter('1/250')).toBe('1/250s'));
  it('formats fraction string "1/2" → 2s (>= 1 second)', () => {
    // 1/2 = 0.5s which is < 1s → should be "1/2s"
    expect(formatShutter('1/2')).toBe('1/2s');
  });
  it('formats fraction string "2/1" → 2s (slow)', () => expect(formatShutter('2/1')).toBe('2s'));
  it('returns undefined for null', () => expect(formatShutter(null)).toBeUndefined());
  it('returns undefined for 0', () => expect(formatShutter(0)).toBeUndefined());
  it('returns undefined for negative', () => expect(formatShutter(-1)).toBeUndefined());
  it('returns undefined for a fraction string with zero denominator', () => {
    expect(formatShutter('1/0')).toBeUndefined();
  });
  it('does not throw on any input', () => {
    for (const v of [null, undefined, NaN, '', [], {}, 'abc', '1/0', -5, 0]) {
      expect(() => formatShutter(v)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// formatFocalLength
// ---------------------------------------------------------------------------

describe('formatFocalLength', () => {
  it('formats number 85 → 85mm', () => expect(formatFocalLength(85)).toBe('85mm'));
  it('formats number 35.5 → 35.5mm', () => expect(formatFocalLength(35.5)).toBe('35.5mm'));
  it('formats string "35 mm" → 35mm', () => expect(formatFocalLength('35 mm')).toBe('35mm'));
  it('formats string "35.0 mm" → 35mm (parseFloat strips trailing zero)', () => {
    expect(formatFocalLength('35.0 mm')).toBe('35mm');
  });
  it('formats bare number string "50" → 50mm', () => expect(formatFocalLength('50')).toBe('50mm'));
  it('returns undefined for null', () => expect(formatFocalLength(null)).toBeUndefined());
  it('returns undefined for 0', () => expect(formatFocalLength(0)).toBeUndefined());
  it('returns undefined for negative', () => expect(formatFocalLength(-10)).toBeUndefined());
  it('returns undefined for non-numeric string', () => expect(formatFocalLength('wide')).toBeUndefined());
  it('does not throw on any input', () => {
    for (const v of [null, undefined, NaN, '', [], {}, 'abc', -5, 0]) {
      expect(() => formatFocalLength(v)).not.toThrow();
    }
  });
});
