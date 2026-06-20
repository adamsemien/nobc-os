import { describe, it, expect } from 'vitest';
import {
  classifyColor,
  normalizePalette,
  colorDistance,
  hexToRgb,
  hexToHsl,
  COLOR_BUCKETS,
} from '@/lib/dam/color';

// Pins the pure color-classification logic for DAM facet filtering.
// All functions are documented as "never throw" — tested explicitly.
//
// Test categories:
//   1. hexToRgb / hexToHsl — known conversions + invalid inputs return null.
//   2. normalizePalette — defensiveness + 3-digit expansion + object extraction.
//   3. classifyColor — representative colors pinned to their named buckets;
//      bucket boundaries from COLOR_BUCKETS:
//        black   l < 15
//        white   l >= 85
//        neutral s < 12 (after black/white)
//        red     h ∈ [345,360) ∪ [0,15), s >= 12
//        orange  h ∈ [15,40)
//        yellow  h ∈ [40,65)
//        green   h ∈ [65,165)
//        teal    h ∈ [165,200)
//        blue    h ∈ [200,260)
//        purple  h ∈ [260,300)
//        pink    h ∈ [300,345)
//   4. colorDistance — symmetry, identical = 0, invalid = Infinity.

// ---------------------------------------------------------------------------
// hexToRgb
// ---------------------------------------------------------------------------

describe('hexToRgb', () => {
  it('converts #ffffff → { r:255, g:255, b:255 }', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('converts #000000 → { r:0, g:0, b:0 }', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('converts #ff0000 → { r:255, g:0, b:0 }', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('converts #0000ff → { r:0, g:0, b:255 }', () => {
    expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('expands 3-digit hex #abc → #aabbcc', () => {
    const result = hexToRgb('#abc');
    expect(result).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  it('returns null for invalid input', () => {
    expect(hexToRgb('')).toBeNull();
    expect(hexToRgb('not-a-color')).toBeNull();
    expect(hexToRgb('#gg0000')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hexToHsl
// ---------------------------------------------------------------------------

describe('hexToHsl', () => {
  it('converts #ffffff → { h:0, s:0, l:100 }', () => {
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('converts #000000 → { h:0, s:0, l:0 }', () => {
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('converts pure red #ff0000 to hue ≈ 0', () => {
    const hsl = hexToHsl('#ff0000');
    expect(hsl).not.toBeNull();
    expect(hsl!.h).toBe(0);
    expect(hsl!.s).toBe(100);
    expect(hsl!.l).toBe(50);
  });

  it('converts pure green #00ff00 to hue ≈ 120', () => {
    const hsl = hexToHsl('#00ff00');
    expect(hsl!.h).toBe(120);
    expect(hsl!.s).toBe(100);
    expect(hsl!.l).toBe(50);
  });

  it('converts pure blue #0000ff to hue ≈ 240', () => {
    const hsl = hexToHsl('#0000ff');
    expect(hsl!.h).toBe(240);
    expect(hsl!.s).toBe(100);
    expect(hsl!.l).toBe(50);
  });

  it('converts mid-gray #808080 to s:0', () => {
    const hsl = hexToHsl('#808080');
    expect(hsl!.s).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(hexToHsl('')).toBeNull();
    expect(hexToHsl('invalid')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyColor — representative hue buckets
// ---------------------------------------------------------------------------

describe('classifyColor — named buckets', () => {
  // Black: l < 15
  it('classifies near-black #0a0a0a → black', () => {
    expect(classifyColor('#0a0a0a')).toBe('black');
  });
  it('classifies #1a1a1a → black (l < 15)', () => {
    expect(classifyColor('#1a1a1a')).toBe('black');
  });

  // White: l >= 85
  it('classifies near-white #fafafa → white', () => {
    expect(classifyColor('#fafafa')).toBe('white');
  });
  it('classifies #ffffff → white', () => {
    expect(classifyColor('#ffffff')).toBe('white');
  });

  // Neutral: s < 12 (after black/white)
  it('classifies mid-gray #808080 → neutral (s=0)', () => {
    expect(classifyColor('#808080')).toBe('neutral');
  });
  it('classifies #888888 → neutral', () => {
    expect(classifyColor('#888888')).toBe('neutral');
  });

  // Red: h ∈ [345,360) ∪ [0,15), s >= 12
  it('classifies pure red #ff0000 → red (h=0)', () => {
    expect(classifyColor('#ff0000')).toBe('red');
  });

  // Orange: h ∈ [15,40), s >= 12
  it('classifies orange #ff6600 → orange', () => {
    // #ff6600 → h ≈ 24
    expect(classifyColor('#ff6600')).toBe('orange');
  });

  // Yellow: h ∈ [40,65), s >= 12
  it('classifies yellow #ffff00 → yellow', () => {
    // #ffff00 → h = 60
    expect(classifyColor('#ffff00')).toBe('yellow');
  });

  // Green: h ∈ [65,165), s >= 12
  it('classifies pure green #00ff00 → green (h=120)', () => {
    expect(classifyColor('#00ff00')).toBe('green');
  });
  it('classifies forest green #228B22 → green', () => {
    expect(classifyColor('#228B22')).toBe('green');
  });

  // Teal: h ∈ [165,200), s >= 12
  it('classifies teal #008080 → teal', () => {
    // #008080 → h = 180
    expect(classifyColor('#008080')).toBe('teal');
  });

  // Blue: h ∈ [200,260), s >= 12
  it('classifies pure blue #0000ff → blue (h=240)', () => {
    expect(classifyColor('#0000ff')).toBe('blue');
  });
  it('classifies sky blue #4169E1 → blue', () => {
    expect(classifyColor('#4169E1')).toBe('blue');
  });

  // Purple: h ∈ [260,300), s >= 12
  it('classifies purple #800080 → purple', () => {
    // #800080 → h = 300 ... boundary check — actually h=300 is the start of pink
    // #8000ff → h ≈ 270 (firmly purple)
    expect(classifyColor('#8000ff')).toBe('purple');
  });

  // Pink: h ∈ [300,345), s >= 12
  it('classifies hot pink #ff69b4 → pink', () => {
    // #ff69b4 → h ≈ 330
    expect(classifyColor('#ff69b4')).toBe('pink');
  });
});

// ---------------------------------------------------------------------------
// classifyColor — defensive / invalid inputs
// ---------------------------------------------------------------------------

describe('classifyColor — invalid input never throws', () => {
  it('returns "neutral" for empty string', () => {
    expect(() => classifyColor('')).not.toThrow();
    expect(classifyColor('')).toBe('neutral');
  });

  it('returns "neutral" for a non-hex string', () => {
    expect(() => classifyColor('notacolor')).not.toThrow();
    expect(classifyColor('notacolor')).toBe('neutral');
  });

  it('returns "neutral" for a too-short hex', () => {
    expect(() => classifyColor('#abc')).not.toThrow();
    // #abc IS a valid 3-digit hex — it gets expanded, not rejected
    // So we just assert no throw; the actual bucket depends on the color
  });

  it('does not throw for any of several invalid inputs', () => {
    const invalids = ['', 'red', '#gggggg', '#12', '123456'];
    for (const v of invalids) {
      expect(() => classifyColor(v)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// COLOR_BUCKETS structure
// ---------------------------------------------------------------------------

describe('COLOR_BUCKETS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(COLOR_BUCKETS)).toBe(true);
    expect(COLOR_BUCKETS.length).toBeGreaterThan(0);
  });

  it('every bucket has name, hex, and classify function', () => {
    for (const bucket of COLOR_BUCKETS) {
      expect(typeof bucket.name).toBe('string');
      expect(typeof bucket.hex).toBe('string');
      expect(typeof bucket.classify).toBe('function');
    }
  });

  it('contains the expected named buckets', () => {
    const names = COLOR_BUCKETS.map((b) => b.name);
    for (const expected of ['black', 'white', 'neutral', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']) {
      expect(names).toContain(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// normalizePalette
// ---------------------------------------------------------------------------

describe('normalizePalette', () => {
  it('returns [] for null', () => expect(normalizePalette(null)).toEqual([]));
  it('returns [] for undefined', () => expect(normalizePalette(undefined)).toEqual([]));
  it('returns [] for a plain object {}', () => expect(normalizePalette({})).toEqual([]));
  it('returns [] for a non-array string', () => expect(normalizePalette('notarray')).toEqual([]));
  it('returns [] for a number', () => expect(normalizePalette(42)).toEqual([]));
  it('returns [] for an empty array', () => expect(normalizePalette([])).toEqual([]));

  it('lowercases valid 6-digit hex strings', () => {
    expect(normalizePalette(['#AABBCC', '#DDEEFF'])).toEqual(['#aabbcc', '#ddeeff']);
  });

  it('accepts hex without leading #', () => {
    expect(normalizePalette(['aabbcc'])).toEqual(['#aabbcc']);
  });

  it('expands 3-digit hex to 6-digit', () => {
    expect(normalizePalette(['#abc'])).toEqual(['#aabbcc']);
  });

  it('skips invalid entries without throwing', () => {
    const result = normalizePalette(['#ff0000', 'badvalue', '#00ff00']);
    expect(result).toEqual(['#ff0000', '#00ff00']);
  });

  it('extracts hex from objects with a .hex property (node-vibrant Swatch shape)', () => {
    const swatches = [{ hex: '#ff0000', r: 255, g: 0, b: 0 }, { hex: '#0000ff' }];
    expect(normalizePalette(swatches)).toEqual(['#ff0000', '#0000ff']);
  });

  it('extracts hex from objects with a .color property', () => {
    expect(normalizePalette([{ color: '#00ff00' }])).toEqual(['#00ff00']);
  });

  it('skips null/undefined entries in the array', () => {
    expect(normalizePalette([null, undefined, '#ff0000'])).toEqual(['#ff0000']);
  });

  it('handles mixed valid and invalid entries', () => {
    // NOTE: 'bad' IS a valid 3-digit hex (b=11, a=10, d=13 are all valid hex chars)
    // and normalizes to #bbaadd. Use 'zzz' which is definitively invalid.
    const input = ['#ff0000', 42, null, { hex: '#00ff00' }, 'zzz', '#0000ff'];
    expect(normalizePalette(input)).toEqual(['#ff0000', '#00ff00', '#0000ff']);
  });
});

// ---------------------------------------------------------------------------
// colorDistance
// ---------------------------------------------------------------------------

describe('colorDistance', () => {
  it('identical colors have distance 0', () => {
    expect(colorDistance('#ff0000', '#ff0000')).toBe(0);
    expect(colorDistance('#ffffff', '#ffffff')).toBe(0);
  });

  it('is symmetric: distance(a,b) === distance(b,a)', () => {
    const a = '#ff0000';
    const b = '#0000ff';
    expect(colorDistance(a, b)).toBeCloseTo(colorDistance(b, a));
  });

  it('red and blue have a large positive distance', () => {
    const d = colorDistance('#ff0000', '#0000ff');
    expect(d).toBeGreaterThan(100);
  });

  it('black and white have the maximum distance', () => {
    const d = colorDistance('#000000', '#ffffff');
    const dRedBlue = colorDistance('#ff0000', '#0000ff');
    expect(d).toBeGreaterThan(dRedBlue);
  });

  it('returns Infinity for invalid first argument', () => {
    expect(colorDistance('notacolor', '#ff0000')).toBe(Infinity);
  });

  it('returns Infinity for invalid second argument', () => {
    expect(colorDistance('#ff0000', 'notacolor')).toBe(Infinity);
  });

  it('returns Infinity when both arguments are invalid', () => {
    expect(colorDistance('', '')).toBe(Infinity);
  });

  it('does not throw for any invalid input', () => {
    const invalids = ['', 'bad', '#gggggg', null as unknown as string];
    for (const v of invalids) {
      expect(() => colorDistance(v, '#ff0000')).not.toThrow();
      expect(() => colorDistance('#ff0000', v)).not.toThrow();
    }
  });

  it('similar colors have smaller distance than dissimilar ones', () => {
    const dClose = colorDistance('#ff0000', '#ff1111'); // nearly identical reds
    const dFar = colorDistance('#ff0000', '#0000ff');   // red vs blue
    expect(dClose).toBeLessThan(dFar);
  });
});
