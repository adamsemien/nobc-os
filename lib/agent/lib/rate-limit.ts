/** In-memory sliding-window rate limiter for the agent endpoint.
 *
 *  Per-instance only — good enough for Phase 1 abuse protection. A shared
 *  store (Redis/Upstash) is a V2 hardening item, not a Phase 1 dependency. */

const WINDOW_MS = 60_000;
const LIMIT = 30;

const hits = new Map<string, number[]>();

/** Returns true if the call is allowed, false if the workspace is over its
 *  budget of 30 requests per rolling minute. */
export function checkAgentRateLimit(workspaceId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(workspaceId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(workspaceId, recent);
    return false;
  }
  recent.push(now);
  hits.set(workspaceId, recent);
  return true;
}
