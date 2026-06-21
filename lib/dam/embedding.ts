/**
 * lib/dam/embedding.ts — CLIP text embedding via Replicate, with in-memory LRU cache.
 *
 * Model: andreasjansson/clip-features (768-dim). Accepts text or image URL in the
 * same joint embedding space — natural-language queries embed the same way images do.
 *
 * Graceful degradation: if REPLICATE_API_TOKEN is unset, returns null and logs once
 * so the semantic route can fall back to keyword search without throwing.
 */

import Replicate from 'replicate';

const CLIP_MODEL =
  'andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a';

const CACHE_MAX = 200;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  vec: number[];
  expiresAt: number;
}

// Simple insertion-order Map — evict oldest when full.
const cache = new Map<string, CacheEntry>();

function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

function cacheGet(key: string): number[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.vec;
}

function cacheSet(key: string, vec: number[]): void {
  if (cache.size >= CACHE_MAX) {
    // Evict oldest entry (first key in insertion order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { vec, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Lazy singleton — don't construct at module load (token may be missing in some envs).
let _replicate: Replicate | null | undefined;
let _loggedMissingToken = false;

function getClient(): Replicate | null {
  if (_replicate !== undefined) return _replicate;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    if (!_loggedMissingToken) {
      console.warn('[dam/embedding] REPLICATE_API_TOKEN is unset — semantic search degraded to keyword-only');
      _loggedMissingToken = true;
    }
    _replicate = null;
    return null;
  }
  _replicate = new Replicate({ auth: token });
  return _replicate;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Embed a natural-language query into the 768-d CLIP space.
 *
 * Mirrors the retry/backoff in scripts/migrate-canto.ts `embed()`:
 *   - Up to 6 attempts
 *   - 429 / throttle errors: exponential with higher ceiling (8s * (attempt+1), max 45s)
 *   - Other errors: exponential backoff (1s * 2^attempt, max 8s)
 *
 * Returns null on persistent failure (caller degrades gracefully). Logs every failure.
 */
export async function embedText(query: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;

  const key = cacheKey(query);
  const cached = cacheGet(key);
  if (cached) return cached;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const out = (await client.run(CLIP_MODEL, {
        input: { inputs: query },
      })) as Array<{ embedding: number[] }>;
      const vec = out?.[0]?.embedding;
      if (Array.isArray(vec) && vec.length === 768) {
        cacheSet(key, vec);
        return vec;
      }
      // Unexpected shape — wait and retry.
      console.warn(`[dam/embedding] unexpected output shape on attempt ${attempt + 1}:`, JSON.stringify(out)?.slice(0, 200));
      await sleep(1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const throttled = msg.includes('429') || /throttl|too many/i.test(msg);
      const backoff = throttled
        ? Math.min(45_000, 8_000 * (attempt + 1))
        : Math.min(8_000, 1_000 * 2 ** attempt);
      console.warn(`[dam/embedding] attempt ${attempt + 1} failed (throttled=${throttled}), retrying in ${backoff}ms: ${msg}`);
      await sleep(backoff);
    }
  }

  console.error(`[dam/embedding] embedText failed after 6 attempts for query="${query.slice(0, 80)}"`);
  return null;
}
