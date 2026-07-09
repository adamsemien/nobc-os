/**
 * Regenerate public/og-apply.png from public/og-apply.svg.
 *
 * Rasterizes at 2x density (2400x1260) then downsizes to the exact declared OG
 * size (1200x630, see app/apply/page.tsx) with sharp's Lanczos3 kernel -
 * supersampling produces meaningfully crisper text edges than a direct 1x
 * rasterization, which is what the original placeholder PNG was.
 *
 *   node scripts/generate-og-apply.mjs
 *
 * Rerun this any time og-apply.svg's copy or design changes.
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_PATH = path.join(__dirname, '..', 'public', 'og-apply.svg');
const PNG_PATH = path.join(__dirname, '..', 'public', 'og-apply.png');

const WIDTH = 1200;
const HEIGHT = 630;
const SUPERSAMPLE = 2;

const svg = readFileSync(SVG_PATH);

await sharp(svg, { density: 72 * SUPERSAMPLE })
  .resize(WIDTH, HEIGHT, { kernel: 'lanczos3' })
  .png()
  .toFile(PNG_PATH);

console.log(`Wrote ${PNG_PATH} (${WIDTH}x${HEIGHT}, ${SUPERSAMPLE}x supersampled from ${SVG_PATH})`);
