/**
 * Mint a signed Apply Preview capability token (the reviewer link for /apply/preview).
 *
 * Mirrors lib/apply-preview-token.ts exactly (HMAC-SHA256 over a b64url payload,
 * "applyprev" version tag, 14-day expiry, keyed by CHECKIN_SECRET). Self-contained
 * so it runs under plain `node` without a TS build.
 *
 *   node scripts/mint-apply-preview-token.mjs
 *
 * Reads CHECKIN_SECRET from the environment or .env.local. Prints the token and an
 * example URL for app.thenobadcompany.com. The token is only valid against the
 * environment whose CHECKIN_SECRET you mint with - for a link that works in prod,
 * mint with the PROD CHECKIN_SECRET (e.g. CHECKIN_SECRET=... node scripts/...).
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const VALID_DAYS = 14;
const BASE_URL = 'https://app.thenobadcompany.com';

function loadSecret() {
  if (process.env.CHECKIN_SECRET) return process.env.CHECKIN_SECRET;
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const k = line.slice(0, eq).trim();
      if (k !== 'CHECKIN_SECRET') continue;
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

const secret = loadSecret();
if (!secret) {
  console.error('CHECKIN_SECRET not set (env or .env.local). Cannot mint - fails closed.');
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payloadB64) => createHmac('sha256', secret).update(`applyprev.${payloadB64}`).digest('base64url');

const exp = Math.floor(Date.now() / 1000) + VALID_DAYS * 24 * 3600;
const payloadB64 = b64url(JSON.stringify({ v: 'applyprev', exp }));
const token = `${payloadB64}.${sign(payloadB64)}`;

console.log('Apply Preview token (valid %d days, exp %s):', VALID_DAYS, new Date(exp * 1000).toISOString());
console.log(token);
console.log('');
console.log('Reviewer URL:');
console.log(`${BASE_URL}/apply/preview?t=${token}`);
