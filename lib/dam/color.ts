/**
 * lib/dam/color.ts — color facet logic for the DAM.
 *
 * Works exclusively on stored hex strings (dominantColor, colorPalette).
 * No external deps — pure math. All functions are deterministic and never throw.
 *
 * Color bucket filtering decision: we return `dominantColor` per asset on the
 * grid list and let the UI classify + filter client-side via `classifyColor`.
 * SQL-side hue filtering is not feasible (Postgres has no HSL function) and a
 * string-prefix filter on hex would be meaningless. For 60 assets per page the
 * client-side classifyColor pass is negligible (<1ms). If server-side pre-
 * filtering becomes necessary, store the bucket name as a generated column.
 */

// ---------------------------------------------------------------------------
// Hex parsing / conversion
// ---------------------------------------------------------------------------

/** Expand 3-digit hex to 6-digit, lowercase. Returns null on invalid input. */
function normalizeHex(hex: unknown): string | null {
  if (typeof hex !== 'string') return null;
  const h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(h)) {
    const r = h[0];
    const g = h[1];
    const b = h[2];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/** Convert a valid hex string to RGB. Assumes normalizeHex output. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = normalizeHex(hex);
  if (!clean) return null;
  const n = parseInt(clean.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Convert a valid hex string to HSL (h: 0–360, s: 0–100, l: 0–100). */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// ---------------------------------------------------------------------------
// Color buckets
// ---------------------------------------------------------------------------

export interface ColorBucket {
  name: string;
  /** A representative hex for the UI swatch */
  hex: string;
  /** Classify rule — tested in order; first match wins. */
  classify: (h: number, s: number, l: number) => boolean;
}

/**
 * Fixed ordered set of named color facets.
 * Achromatic check (low saturation) is first so grays/blacks/whites don't
 * fall into a hue bucket via a rounded hue value.
 */
export const COLOR_BUCKETS: ColorBucket[] = [
  {
    name: 'black',
    hex: '#1a1a1a',
    classify: (_h, _s, l) => l < 15,
  },
  {
    name: 'white',
    hex: '#f5f5f5',
    classify: (_h, _s, l) => l >= 85,
  },
  {
    name: 'neutral',
    hex: '#9e9e9e',
    classify: (_h, s, _l) => s < 12,
  },
  {
    name: 'red',
    hex: '#d32f2f',
    classify: (h, s, _l) => s >= 12 && (h >= 345 || h < 15),
  },
  {
    name: 'orange',
    hex: '#e65100',
    classify: (h, s, _l) => s >= 12 && h >= 15 && h < 40,
  },
  {
    name: 'yellow',
    hex: '#f9a825',
    classify: (h, s, _l) => s >= 12 && h >= 40 && h < 65,
  },
  {
    name: 'green',
    hex: '#2e7d32',
    classify: (h, s, _l) => s >= 12 && h >= 65 && h < 165,
  },
  {
    name: 'teal',
    hex: '#00695c',
    classify: (h, s, _l) => s >= 12 && h >= 165 && h < 200,
  },
  {
    name: 'blue',
    hex: '#1565c0',
    classify: (h, s, _l) => s >= 12 && h >= 200 && h < 260,
  },
  {
    name: 'purple',
    hex: '#6a1b9a',
    classify: (h, s, _l) => s >= 12 && h >= 260 && h < 300,
  },
  {
    name: 'pink',
    hex: '#c2185b',
    classify: (h, s, _l) => s >= 12 && h >= 300 && h < 345,
  },
  // Fallback (should not normally be reached)
  {
    name: 'neutral',
    hex: '#9e9e9e',
    classify: () => true,
  },
];

/**
 * Map a hex color to one of the named COLOR_BUCKETS.
 * Returns "neutral" on any invalid input.
 */
export function classifyColor(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return 'neutral';
  const { h, s, l } = hsl;
  for (const bucket of COLOR_BUCKETS) {
    if (bucket.classify(h, s, l)) return bucket.name;
  }
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Palette normalizer
// ---------------------------------------------------------------------------

/**
 * Normalize the stored `colorPalette` JSON to a clean string[] of valid
 * lowercase 6-digit hex codes. Returns [] on any invalid / empty input.
 *
 * Handles:
 *   - string[]                     ["#aabbcc", "#ddeeff"]
 *   - object[] with hex/color key  [{ hex: "#aabbcc" }, ...]
 *   - null / undefined / non-array → []
 *   - individual invalid entries   → skipped
 */
export function normalizePalette(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const results: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const h = normalizeHex(item);
      if (h) results.push(h);
    } else if (item != null && typeof item === 'object') {
      // node-vibrant Swatch objects can have { hex: "#...", r, g, b, ... }
      const o = item as Record<string, unknown>;
      const candidate = o.hex ?? o.color ?? o.value ?? o.HEX ?? o.Color;
      if (typeof candidate === 'string') {
        const h = normalizeHex(candidate);
        if (h) results.push(h);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Color distance
// ---------------------------------------------------------------------------

/**
 * Perceptual-ish distance between two hex colors using weighted RGB euclidean
 * distance (Redmean approximation — cheap, no deps, better than simple RGB).
 * Returns Infinity when either hex is invalid. Range is roughly 0–764.
 *
 * https://www.compuphase.com/cmetric.htm
 */
export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Infinity;
  const rMean = (ra.r + rb.r) / 2;
  const dr = ra.r - rb.r;
  const dg = ra.g - rb.g;
  const db = ra.b - rb.b;
  // Weighted coefficients from the Redmean formula
  const wR = 2 + rMean / 256;
  const wG = 4;
  const wB = 2 + (255 - rMean) / 256;
  return Math.sqrt(wR * dr * dr + wG * dg * dg + wB * db * db);
}
