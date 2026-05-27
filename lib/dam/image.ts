/**
 * DAM image processing — Sharp + BlurHash + EXIF.
 *
 * processImage(): 800px-wide WebP thumbnail, BlurHash placeholder, native
 * dimensions, and EXIF shoot date.
 * scoreImage(): Phase-1 heuristic quality score from a single raw greyscale
 * pass — Laplacian-variance sharpness + luminance-histogram exposure. No vision
 * model, no network, free + fast. (Vision/LLaVA scoring + face count deferred.)
 */
import sharp from 'sharp';
import { encode } from 'blurhash';
import exifr from 'exifr';

const THUMB_WIDTH = 800;

export interface ProcessedImage {
  thumbnail: Buffer; // 800px-wide WebP
  thumbnailContentType: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  shootDate: Date | null;
}

/** 800px thumbnail + BlurHash + dimensions + EXIF shoot date. */
export async function processImage(
  input: Buffer,
  opts?: { exifInput?: Buffer },
): Promise<ProcessedImage> {
  const meta = await sharp(input, { failOn: 'none' }).metadata();

  const thumbnail = await sharp(input, { failOn: 'none' })
    .rotate() // honor EXIF orientation
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const [blurhash, shootDate] = await Promise.all([
    encodeBlurhash(input).catch(() => null),
    extractShootDate(opts?.exifInput ?? input).catch(() => null),
  ]);

  return {
    thumbnail,
    thumbnailContentType: 'image/webp',
    blurhash,
    width: meta.width ?? null,
    height: meta.height ?? null,
    shootDate,
  };
}

async function encodeBlurhash(input: Buffer): Promise<string> {
  // BlurHash wants a small raw RGBA raster.
  const { data, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
}

async function extractShootDate(input: Buffer): Promise<Date | null> {
  const exif = await exifr
    .parse(input, ['DateTimeOriginal', 'CreateDate'])
    .catch(() => null);
  const d: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

export interface QualityScores {
  sharpness: number; // 0-100
  exposure: number; // 0-100
}

export interface ImageScore {
  qualityScore: number; // 0-100, weighted (sharpness 0.6 + exposure 0.4)
  qualityScores: QualityScores;
}

/**
 * Heuristic quality score. Downscales to a small greyscale raster and computes:
 *  - sharpness: variance of the discrete Laplacian (higher = crisper), log-scaled
 *  - exposure: mid-luminance proximity, penalized for clipped shadows/highlights
 * Scaling constants are tuned for typical event photography and are easy to
 * adjust; treat scores as relative, not absolute.
 */
export async function scoreImage(input: Buffer): Promise<ImageScore> {
  const { data, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .greyscale()
    .resize(256, 256, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  if (w < 3 || h < 3) {
    return { qualityScore: 0, qualityScores: { sharpness: 0, exposure: 0 } };
  }

  // Exposure — luminance mean + clipping fractions.
  let sum = 0;
  let low = 0;
  let high = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    sum += v;
    if (v <= 5) low++;
    else if (v >= 250) high++;
  }
  const n = data.length;
  const mean = sum / n;
  const clip = (low + high) / n;
  // Peak at mid-luminance (~118); linear falloff outside; clipping penalty.
  const meanScore = 100 - Math.min(100, (Math.abs(mean - 118) / 118) * 140);
  const exposure = Math.round(clamp(meanScore * (1 - Math.min(0.6, clip * 4)), 0, 100));

  // Sharpness — variance of the discrete Laplacian over interior pixels.
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap = 4 * data[idx] - data[idx - 1] - data[idx + 1] - data[idx - w] - data[idx + w];
      lapSum += lap;
      lapSqSum += lap * lap;
      count++;
    }
  }
  const lapMean = count ? lapSum / count : 0;
  const lapVar = count ? lapSqSum / count - lapMean * lapMean : 0;
  // log10(variance) mapped to 0-100; ~1500 variance ≈ very crisp.
  const sharpness = Math.round(
    clamp((Math.log10(lapVar + 1) / Math.log10(1500)) * 100, 0, 100),
  );

  const qualityScore = Math.round(sharpness * 0.6 + exposure * 0.4);
  return { qualityScore, qualityScores: { sharpness, exposure } };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
