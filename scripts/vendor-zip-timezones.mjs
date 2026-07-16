/**
 * One-shot vendoring script: generate lib/data/zip-timezones.json — the static
 * zip -> IANA timezone map the send layer's quiet-hours enforcement reads.
 *
 * Sources (dev-only dependencies, never shipped at runtime):
 *   - zipcodes@8.0.0            — US zip centroids (GeoNames-derived). NOTE:
 *     GeoNames/Census ZCTA centroids are APPROXIMATIONS of USPS delivery
 *     routes, not identical to them — a zip straddling a timezone border can
 *     be mapped to the wrong side. Acceptable at zip-level granularity; a
 *     state-level map is NOT (Texas splits Central/Mountain at El Paso).
 *   - geo-tz@8.1.8              — lat/lng -> IANA timezone (tz-boundary data).
 *
 * Run: node scripts/vendor-zip-timezones.mjs
 * Output is stamped with sources + generation date. Re-run to refresh.
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const zipcodes = require('zipcodes');
const { find } = await import('geo-tz');

const out = {};
let mapped = 0;
let skipped = 0;

for (const [zip, rec] of Object.entries(zipcodes.codes)) {
  // zipcodes.codes also carries lookup aliases; only take real 5-digit US zips
  // with coordinates.
  if (!/^\d{5}$/.test(zip)) continue;
  if (rec == null || typeof rec.latitude !== 'number' || typeof rec.longitude !== 'number') {
    skipped++;
    continue;
  }
  if (rec.country && rec.country !== 'US') continue;
  const tz = find(rec.latitude, rec.longitude)[0];
  if (!tz) {
    skipped++;
    continue;
  }
  out[zip] = tz;
  mapped++;
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'lib', 'data', 'zip-timezones.json');
mkdirSync(dirname(target), { recursive: true });

const payload = {
  _meta: {
    generatedAt: new Date().toISOString(),
    sources: {
      centroids: 'zipcodes@8.0.0 (GeoNames-derived US zip centroids — ZCTA-style approximations of USPS zips, not identical)',
      timezones: 'geo-tz@8.1.8 (IANA tz boundary lookup from coordinates)',
    },
    generator: 'scripts/vendor-zip-timezones.mjs',
    zipCount: mapped,
  },
  zips: out,
};

writeFileSync(target, JSON.stringify(payload));
console.log(`wrote ${target}: ${mapped} zips mapped, ${skipped} skipped`);
// Spot-check the case that disqualifies state-level maps: El Paso is Mountain.
console.log('spot-check 79901 (El Paso):', out['79901']);
console.log('spot-check 78701 (Austin):', out['78701']);
console.log('spot-check 96813 (Honolulu):', out['96813']);
