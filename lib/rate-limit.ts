/** Dependency-free sliding-window rate limiter (Stage 17, M4 hardening).
 *
 *  In-memory and therefore PER SERVERLESS INSTANCE - this is abuse damping
 *  for the public gate surfaces, not a shared quota (M4-D8). Swapping in a
 *  shared store (Upstash/Redis) later only replaces this file's internals;
 *  the call sites keep the same `allow(key)` contract.
 */

type Bucket = { count: number; windowStart: number };

export type RateLimiter = {
  /** True when the key is within budget for the current window (and counts
   *  the hit). False means the caller should refuse with a 429. */
  allow(key: string, now?: number): boolean;
  /** Seconds until the key's current window resets (for Retry-After). */
  retryAfterSeconds(key: string, now?: number): number;
};

export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const { limit, windowMs } = opts;
  const buckets = new Map<string, Bucket>();

  function prune(now: number) {
    // Cheap periodic sweep so long-lived instances do not grow unbounded.
    if (buckets.size < 10_000) return;
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= windowMs) buckets.delete(key);
    }
  }

  return {
    allow(key: string, now = Date.now()): boolean {
      prune(now);
      const bucket = buckets.get(key);
      if (!bucket || now - bucket.windowStart >= windowMs) {
        buckets.set(key, { count: 1, windowStart: now });
        return true;
      }
      if (bucket.count >= limit) return false;
      bucket.count += 1;
      return true;
    },
    retryAfterSeconds(key: string, now = Date.now()): number {
      const bucket = buckets.get(key);
      if (!bucket) return 0;
      return Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
    },
  };
}

/** Best-effort client IP for rate-limit keys. On Vercel the first
 *  x-forwarded-for entry is the client; local dev has neither header. */
export function clientIpFrom(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
