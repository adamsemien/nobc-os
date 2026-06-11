/**
 * Sliding-window in-memory rate limiter for anonymous public API endpoints.
 *
 * Keyed on the caller's IP (first value of x-forwarded-for — Vercel sets this
 * reliably). State lives in the module-level Map, so it resets on cold start.
 * That is acceptable for v1: serverless warm instances per region are short-lived
 * enough that the protection is meaningful.
 *
 * For v1.1, swap to Upstash Redis for cross-instance persistence.
 */

import { NextRequest } from 'next/server';

const WINDOW_MS = 60 * 60 * 1000; // 60 minutes
const MAX_REQUESTS = 10;

// Map<ip, sorted array of timestamps (ms) within the current window>
const store = new Map<string, number[]>();

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // Fallback: treat unknown as a single bucket (won't happen on Vercel).
  return 'unknown';
}

export function publicRateLimit(req: NextRequest): {
  allowed: boolean;
  retryAfterSecs: number;
} {
  const ip = getIp(req);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Prune timestamps outside the sliding window.
  const timestamps = (store.get(ip) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS) {
    // Oldest timestamp in window determines when the caller can retry.
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + WINDOW_MS - now;
    return { allowed: false, retryAfterSecs: Math.ceil(retryAfterMs / 1000) };
  }

  timestamps.push(now);
  store.set(ip, timestamps);
  return { allowed: true, retryAfterSecs: 0 };
}
