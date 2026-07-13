/**
 * THE dev-user check for dev-tooling UI surfaces — the DevToolbar (pill, panel,
 * ⌘⇧⌥D hotkey) and the Settings → Developer card all call this one predicate.
 *
 * Posture (changed 2026-07-13, Adam's explicit GO — this reverses the earlier
 * "never render in production" hard kill that lived in DevToolbar):
 *   - local development: always allowed, no allowlist needed
 *   - everywhere else (production AND preview): the NEXT_PUBLIC_DEV_USER_IDS
 *     allowlist is the boundary. An empty or unset allowlist means NOBODY —
 *     fail closed.
 *
 * NEXT_PUBLIC_DEV_USER_IDS is readable on both client and server, so client
 * components (DevToolbar) and server components (settings page) share the
 * exact same source of truth. Both env references below stay fully static so
 * Next can inline them into client bundles at build time.
 *
 * Scope note: this gates UI VISIBILITY only. The `/api/dev/*` routes keep
 * their own independent server-side `DEV_USER_IDS` check (strict allowlist) —
 * deliberate defense in depth, do not collapse the two.
 */
const ALLOWED_IDS = (process.env.NEXT_PUBLIC_DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isDevUser(userId: string | null | undefined): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return !!userId && ALLOWED_IDS.includes(userId);
}
