/**
 * ShareLink password hashing — Node built-in crypto.scrypt only. No bcrypt.
 *
 * Storage format: `scrypt$N$r$p$saltBase64$hashBase64` (base64url-safe). Parses
 * are tolerant of leading/trailing whitespace from the DB column. verify() is
 * constant-time via timingSafeEqual.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

// scrypt cost parameters. N=2^15 keeps verify ≈ 50–100ms on a serverless
// instance — fast enough for a public share-page hot path, expensive enough to
// resist offline cracking for a low-stakes member-gallery password.
const N = 1 << 15;
const r = 8;
const p = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;

/** Hash a plaintext password. Returns the encoded `scrypt$…` string suitable for the DB column. */
export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext) throw new Error('hashPassword: empty password');
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(plaintext, salt, KEYLEN);
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Constant-time verify. Returns false for malformed stored values rather than throwing. */
export async function verifyPassword(plaintext: string, stored: string | null | undefined): Promise<boolean> {
  if (!plaintext || !stored) return false;
  const parts = stored.trim().split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const nParam = Number(parts[1]);
  const rParam = Number(parts[2]);
  const pParam = Number(parts[3]);
  if (!Number.isFinite(nParam) || !Number.isFinite(rParam) || !Number.isFinite(pParam)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (!salt.length || !expected.length) return false;
  let derived: Buffer;
  try {
    derived = await scryptAsync(plaintext, salt, expected.length);
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
