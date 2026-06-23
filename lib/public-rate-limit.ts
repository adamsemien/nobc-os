/**
 * Sliding-window in-memory rate limiter for public API endpoints.
 *
 * Keyed on `${bucket}:${ip}` (first value of x-forwarded-for — Vercel sets this
 * reliably). State lives in the module-level Map, so it resets on cold start.
 * That is acceptable for v1: serverless warm instances per region are short-lived
 * enough that the protection is meaningful.
 *
 * Per-endpoint `bucket` keeps a strict limiter (e.g. draft creation, 10/h) from
 * sharing a counter with a lenient one (e.g. draft autosave PATCH, called many
 * times per legitimate session).
 *
 * FLAG (P1): for cross-instance persistence — and to make these limits real
 * rather than per-warm-instance — swap the Map for Upstash Redis / Vercel KV.
 */

import { NextRequest } from 'next/server';

const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
const DEFAULT_MAX = 10;

// Map<`${bucket}:${ip}`, sorted timestamps (ms) within the current window>
const store = new Map<string, number[]>();

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // Fallback: treat unknown as a single bucket (won't happen on Vercel).
  return 'unknown';
}

export interface RateLimitOptions {
  /** Max requests allowed per window. Default 10. */
  max?: number;
  /** Sliding window length in ms. Default 60 minutes. */
  windowMs?: number;
  /** Namespace so unrelated endpoints don't share one counter. Default ''. */
  bucket?: string;
}

export function publicRateLimit(
  req: NextRequest,
  opts: RateLimitOptions = {},
): {
  allowed: boolean;
  retryAfterSecs: number;
} {
  const max = opts.max ?? DEFAULT_MAX;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const key = `${opts.bucket ?? ''}:${getIp(req)}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Prune timestamps outside the sliding window.
  const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= max) {
    // Oldest timestamp in window determines when the caller can retry.
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterSecs: Math.ceil(retryAfterMs / 1000) };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, retryAfterSecs: 0 };
}
