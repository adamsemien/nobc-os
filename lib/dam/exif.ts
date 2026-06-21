/**
 * lib/dam/exif.ts — defensive normalizer for the stored `exif` JSON column.
 *
 * The column is written by exiftool-vendored during Canto migration. The JSON
 * shape is heterogeneous: flat keys (Make, Model, ISO, FNumber, ExposureTime,
 * FocalLength, LensModel, DateTimeOriginal, GPSLatitude, GPSLongitude,
 * ImageWidth, ImageHeight) OR nested groups (EXIF:, IPTC:, Composite:, etc.).
 * Key casing varies. This module never throws and never emits null-valued fields.
 */

export interface ExifSummary {
  /** Combined Make + Model string, e.g. "Apple iPhone 15 Pro" */
  camera?: string;
  /** Lens model string */
  lens?: string;
  /** ISO sensitivity, e.g. 400 */
  iso?: number;
  /** Formatted aperture, e.g. "f/2.8" */
  aperture?: string;
  /** Formatted shutter speed, e.g. "1/250s" or "2s" */
  shutter?: string;
  /** Formatted focal length, e.g. "35mm" */
  focalLength?: string;
  /** ISO 8601 string from DateTimeOriginal, e.g. "2024-06-15T14:30:00" */
  takenAt?: string;
  /** GPS coordinates if present */
  gps?: { lat: number; lng: number };
  /** Megapixel count derived from ImageWidth × ImageHeight */
  megapixels?: number;
  /** EXIF orientation value (1–8) */
  orientation?: number;
  /** The raw object for any fields not surfaced above */
  raw?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Formatting helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Format an F-number into "f/2.8". Accepts number or numeric string.
 * Returns undefined when the value is unusable.
 */
export function formatAperture(fnumber: unknown): string | undefined {
  const n = toFloat(fnumber);
  if (n == null || n <= 0) return undefined;
  return `f/${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}`;
}

/**
 * Format an ExposureTime (seconds, number or fraction string) into a display
 * string: "1/250s" for values < 1s, "2s" for values >= 1s.
 * Returns undefined when unusable.
 */
export function formatShutter(exposureTime: unknown): string | undefined {
  if (exposureTime == null) return undefined;

  // exiftool sometimes delivers "1/250" as a string
  if (typeof exposureTime === 'string') {
    const frac = exposureTime.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      const num = Number(frac[1]);
      const den = Number(frac[2]);
      if (den === 0) return undefined;
      const seconds = num / den;
      return seconds >= 1 ? `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s` : `1/${Math.round(1 / seconds)}s`;
    }
  }

  const n = toFloat(exposureTime);
  if (n == null || n <= 0) return undefined;
  if (n >= 1) return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}s`;
  return `1/${Math.round(1 / n)}s`;
}

/**
 * Format a focal length value (mm, as number or string "35 mm") into "35mm".
 * Returns undefined when unusable.
 */
export function formatFocalLength(fl: unknown): string | undefined {
  if (fl == null) return undefined;
  if (typeof fl === 'string') {
    // "35 mm" or "35.0 mm"
    const m = fl.match(/^([\d.]+)\s*mm?$/i);
    if (m) return `${parseFloat(m[1])}mm`;
    // "35" bare number string
    const n = parseFloat(fl);
    if (!Number.isNaN(n) && n > 0) return `${n}mm`;
    return undefined;
  }
  const n = toFloat(fl);
  if (n == null || n <= 0) return undefined;
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}mm`;
}

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

/**
 * Parse the stored `exif` JSON column into a clean ExifSummary.
 * Never throws. Always returns a (possibly empty) object.
 */
export function parseExif(raw: unknown): ExifSummary {
  if (raw == null) return {};

  // The DB column is already a parsed JSON value (Prisma returns it as object),
  // but guard against a stringified payload from an older migration path.
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) return {};

  // Flatten: exiftool-vendored can produce nested group keys like "EXIF:Make"
  // or nested objects { EXIF: { Make: "..." } }. We flatten both into a single
  // case-insensitive map.
  const flat = flattenExif(obj as Record<string, unknown>);

  const result: ExifSummary = {};

  // Camera: Make + Model
  const make = str(pick(flat, 'make'));
  const model = str(pick(flat, 'model'));
  if (make || model) {
    // Avoid "Apple Apple iPhone 15 Pro" — some bodies repeat the make
    const camera =
      make && model
        ? model.toLowerCase().startsWith(make.toLowerCase())
          ? model.trim()
          : `${make.trim()} ${model.trim()}`
        : (make ?? model)!.trim();
    if (camera) result.camera = camera;
  }

  // Lens
  const lens =
    str(pick(flat, 'lensmodel')) ??
    str(pick(flat, 'lens')) ??
    str(pick(flat, 'lensinfo'));
  if (lens) result.lens = lens.trim();

  // ISO
  const iso = toInt(pick(flat, 'iso') ?? pick(flat, 'isospeedratings'));
  if (iso != null && iso > 0) result.iso = iso;

  // Aperture
  const ap = formatAperture(pick(flat, 'fnumber') ?? pick(flat, 'aperture') ?? pick(flat, 'aperturevalue'));
  if (ap) result.aperture = ap;

  // Shutter
  const sh = formatShutter(
    pick(flat, 'exposuretime') ??
      pick(flat, 'shutterspeedvalue') ??
      pick(flat, 'shutter'),
  );
  if (sh) result.shutter = sh;

  // Focal length (prefer 35mm equivalent when available)
  const fl =
    formatFocalLength(pick(flat, 'focallengthIn35mmformat') ?? pick(flat, 'focallengthin35mmfilm')) ??
    formatFocalLength(pick(flat, 'focallength'));
  if (fl) result.focalLength = fl;

  // DateTimeOriginal → ISO string
  const dto =
    pick(flat, 'datetimeoriginal') ??
    pick(flat, 'createdate') ??
    pick(flat, 'dateTimeOriginal');
  const takenAt = parseExifDate(dto);
  if (takenAt) result.takenAt = takenAt;

  // GPS
  const lat = toFloat(pick(flat, 'gpslatitude'));
  const lng = toFloat(pick(flat, 'gpslongitude'));
  if (lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
    result.gps = { lat, lng };
  }

  // Megapixels
  const w = toInt(pick(flat, 'imagewidth') ?? pick(flat, 'exifimagewidth') ?? pick(flat, 'pixelxdimension'));
  const h = toInt(pick(flat, 'imageheight') ?? pick(flat, 'exifimageheight') ?? pick(flat, 'pixelydimension'));
  if (w != null && h != null && w > 0 && h > 0) {
    result.megapixels = Math.round((w * h) / 100_000) / 10; // 1 decimal, in MP
  }

  // Orientation
  const ori = toInt(pick(flat, 'orientation'));
  if (ori != null && ori >= 1 && ori <= 8) result.orientation = ori;

  // Raw passthrough — useful for UI "show more"
  result.raw = obj as Record<string, unknown>;

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Flatten a (possibly nested) exiftool JSON object into a lower-case key map.
 * Handles both { EXIF: { Make: "..." } } group-object style AND flat
 * { Make: "...", "EXIF:Make": "..." } style.
 */
function flattenExif(obj: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();

  for (const [k, v] of Object.entries(obj)) {
    // Strip group prefix: "EXIF:Make" → "make"
    const bare = k.replace(/^[A-Za-z]+:/, '').toLowerCase();

    if (
      v != null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      // Heuristic: if a value object has no numeric keys it's a group container
      !isLeafObject(v as Record<string, unknown>)
    ) {
      // Recurse one level
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        const bare2 = k2.replace(/^[A-Za-z]+:/, '').toLowerCase();
        if (!map.has(bare2)) map.set(bare2, v2);
      }
    } else {
      if (!map.has(bare)) map.set(bare, v);
    }
  }

  return map;
}

/**
 * A leaf object represents a scalar value (e.g. an exiftool fraction object
 * { numerator: 1, denominator: 250 }). Anything else with >2 keys or keys
 * that don't match the fraction pattern is a group container.
 */
function isLeafObject(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o);
  if (keys.length === 0) return true;
  // The only leaf objects we recognize are exiftool fraction decompositions
  return keys.length <= 2 && keys.every((k) => /^(num|den|numerator|denominator|value|val)$/i.test(k));
}

function pick(map: Map<string, unknown>, key: string): unknown {
  return map.get(key.toLowerCase());
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v || undefined;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function toFloat(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    // Handle fraction strings like "1/250"
    const frac = v.match(/^(-?\d+)\/(\d+)$/);
    if (frac) {
      const den = Number(frac[2]);
      if (den === 0) return undefined;
      return Number(frac[1]) / den;
    }
    const n = parseFloat(v);
    return isFinite(n) ? n : undefined;
  }
  // exiftool fraction object { numerator, denominator }
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    const num = Number(o.numerator ?? o.num ?? o.value ?? o.val);
    const den = Number(o.denominator ?? o.den ?? 1);
    if (!isFinite(num) || !isFinite(den) || den === 0) return undefined;
    return num / den;
  }
  return undefined;
}

function toInt(v: unknown): number | undefined {
  const n = toFloat(v);
  if (n == null) return undefined;
  return Math.round(n);
}

/**
 * Parse an exiftool date string ("2024:06:15 14:30:00" or ISO variants)
 * into an ISO 8601 string. Returns undefined on failure.
 */
function parseExifDate(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;

  // exiftool canonical: "2024:06:15 14:30:00" or "2024:06:15 14:30:00+05:30"
  const exifDate = s.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  try {
    const d = new Date(exifDate);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19); // no trailing Z
  } catch {
    // fall through
  }

  // Try raw ISO parse
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19);
  } catch {
    // ignore
  }

  return undefined;
}
